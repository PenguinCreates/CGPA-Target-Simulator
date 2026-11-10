import { createHmac, timingSafeEqual as safeEqual } from "node:crypto";

const PRICE_SUBUNITS = 3000;
const CURRENCY = "GHS";

function config() {
  const values = {
    paystackSecret: process.env.PAYSTACK_SECRET_KEY,
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (Object.values(values).some((value) => !value)) {
    throw new Error("Server billing configuration is incomplete.");
  }
  return values;
}

function bearer(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export async function getUser(req) {
  const token = bearer(req);
  if (!token) return null;
  const { supabaseUrl, supabaseAnonKey } = config();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id && user?.email && user?.email_confirmed_at ? user : null;
}

async function supabaseRequest(path, init = {}) {
  const { supabaseUrl, supabaseServiceKey } = config();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Purchase record request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function hasAccess(userId) {
  const rows = await supabaseRequest(
    `studyline_entitlements?user_id=eq.${encodeURIComponent(userId)}&select=user_id,active&limit=1`,
  );
  return Boolean(rows?.[0]?.active);
}

export async function recordVerifiedPayment({ userId, email, reference }) {
  await supabaseRequest("studyline_payments?on_conflict=reference", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      reference,
      user_id: userId,
      email,
      amount: PRICE_SUBUNITS,
      currency: CURRENCY,
      status: "success",
    }),
  });
  await supabaseRequest("studyline_entitlements?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      active: true,
      payment_reference: reference,
      amount: PRICE_SUBUNITS,
      currency: CURRENCY,
    }),
  });
}

export async function initializePaystack({ user }) {
  const { paystackSecret } = config();
  const previewHost = process.env.VERCEL_ENV === "preview"
    ? process.env.VERCEL_URL?.replace(/^https?:\/\//, "")
    : "";
  const appUrl = previewHost ? `https://${previewHost}` : process.env.APP_URL;
  if (!appUrl || new URL(appUrl).origin !== appUrl.replace(/\/$/, "")) {
    throw new Error("APP_URL must be configured as the trusted site origin.");
  }
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      amount: PRICE_SUBUNITS,
      currency: CURRENCY,
      callback_url: `${appUrl.replace(/\/$/, "")}/`,
      metadata: { user_id: user.id, product: "studyline-lifetime-access" },
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.status || !result.data?.authorization_url || !result.data?.reference) {
    throw new Error(result.message || "Paystack could not initialize checkout.");
  }
  return {
    authorizationUrl: result.data.authorization_url,
    reference: result.data.reference,
  };
}

export async function verifyPaystackReference(reference) {
  const { paystackSecret } = config();
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${paystackSecret}` } },
  );
  const result = await response.json();
  if (!response.ok || !result.status) throw new Error("Paystack could not verify this payment.");
  return result.data;
}

export function isCorrectPayment(data, user) {
  return data?.status === "success"
    && data.amount === PRICE_SUBUNITS
    && data.currency === CURRENCY
    && data.customer?.email?.toLowerCase() === user.email.toLowerCase()
    && data.metadata?.user_id === user.id
    && typeof data.reference === "string";
}

export function verifyWebhookSignature(rawBody, signature) {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  const expected = createHmac("sha512", paystackSecret).update(rawBody).digest("hex");
  const actualBuffer = Buffer.from(signature || "", "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length
    && safeEqual(actualBuffer, expectedBuffer);
}
