import {
  getUser,
  isCorrectPayment,
  recordVerifiedPayment,
  verifyPaystackReference,
} from "../../lib/paystack-server.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "Please sign in to verify your payment." });
    const reference = typeof req.body?.reference === "string" ? req.body.reference : "";
    if (!reference || reference.length > 120) {
      return res.status(400).json({ error: "A valid payment reference is required." });
    }
    const payment = await verifyPaystackReference(reference);
    if (!isCorrectPayment(payment, user)) {
      return res.status(402).json({ access: false, error: "Payment is not verified for this account." });
    }
    await recordVerifiedPayment({ userId: user.id, email: user.email, reference });
    return res.status(200).json({ access: true });
  } catch {
    return res.status(503).json({ error: "Payment verification is temporarily unavailable." });
  }
}
