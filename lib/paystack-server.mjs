import { createHmac, timingSafeEqual as safeEqual } from "node:crypto";

const CURRENCY = "GHS";
const PRODUCTION_APP_URL = "https://studyline-cgpa-target-simulator.vercel.app";
export const PLANS = {
  six_months: { label: "6 months", amount: 3000, durationMonths: 6 },
  twelve_months: { label: "12 months", amount: 5500, durationMonths: 12 },
  lifetime: { label: "Lifetime", amount: 19900, durationMonths: null },
};

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

function getPlan(planId) {
  return typeof planId === "string" && Object.hasOwn(PLANS, planId) ? PLANS[planId] : null;
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

export async function getAccessStatus(userId) {
  const rows = await supabaseRequest(
    `studyline_entitlements?user_id=eq.${encodeURIComponent(userId)}&select=user_id,active,expires_at,plan_id&limit=1`,
  );
  const entitlement = rows?.[0];
  const access = Boolean(entitlement?.active)
    && (!entitlement.expires_at || Date.parse(entitlement.expires_at) > Date.now());
  return { access, expiresAt: entitlement?.expires_at || null, planId: entitlement?.plan_id || null };
}

export async function hasAccess(userId) {
  return (await getAccessStatus(userId)).access;
}

function entitlementExpiry(planId, now = new Date()) {
  const months = getPlan(planId)?.durationMonths;
  if (!months) return null;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + months;
  const day = now.getUTCDate();
  const targetLastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year,
    month,
    Math.min(day, targetLastDay),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  )).toISOString();
}

export async function recordVerifiedPayment({ userId, email, reference, planId }) {
  const plan = getPlan(planId);
  if (!plan) throw new Error("Unknown Studyline plan.");
  const existingPayments = await supabaseRequest(
    `studyline_payments?reference=eq.${encodeURIComponent(reference)}&select=user_id,plan_id,created_at&limit=1`,
  );
  const existing = existingPayments?.[0];
  if (existing) {
    if (existing.user_id !== userId || existing.plan_id !== planId) {
      throw new Error("Payment reference was already recorded.");
    }
    const currentEntitlements = await supabaseRequest(
      `studyline_entitlements?user_id=eq.${encodeURIComponent(userId)}&select=payment_reference&limit=1`,
    );
    if (currentEntitlements?.[0]) return getAccessStatus(userId);
  }
  const expiresAt = entitlementExpiry(planId, existing?.created_at ? new Date(existing.created_at) : new Date());
  if (!existing) {
    await supabaseRequest("studyline_payments?on_conflict=reference", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        reference,
        user_id: userId,
        email,
        amount: plan.amount,
        currency: CURRENCY,
        status: "success",
        plan_id: planId,
      }),
    });
  }
  await supabaseRequest("studyline_entitlements?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      active: true,
      payment_reference: reference,
      amount: plan.amount,
      currency: CURRENCY,
      plan_id: planId,
      expires_at: expiresAt,
    }),
  });
  return { access: true, expiresAt, planId };
}

export async function initializePaystack({ user, planId }) {
  const { paystackSecret } = config();
  const plan = getPlan(planId);
  if (!plan) throw new Error("Choose a valid Studyline plan.");
  const previewHost = process.env.VERCEL_ENV === "preview"
    ? process.env.VERCEL_URL?.replace(/^https?:\/\//, "")
    : "";
  const appUrl = previewHost ? `https://${previewHost}` : PRODUCTION_APP_URL;
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
      amount: plan.amount,
      currency: CURRENCY,
      callback_url: `${appUrl.replace(/\/$/, "")}/`,
      metadata: { user_id: user.id, plan_id: planId, product: "studyline-access" },
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
  const planId = data?.metadata?.plan_id;
  const plan = getPlan(planId);
  return data?.status === "success"
    && Boolean(plan)
    && data.amount === plan.amount
    && data.currency === CURRENCY
    && data.customer?.email?.toLowerCase() === user.email.toLowerCase()
    && data.metadata?.user_id === user.id
    && typeof data.reference === "string";
}

export function getPlanExpiry(planId, now = new Date()) {
  return entitlementExpiry(planId, now);
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
