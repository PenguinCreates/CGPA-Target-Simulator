import {
  recordVerifiedPayment,
  verifyPaystackReference,
  verifyWebhookSignature,
  isCorrectPayment,
} from "../../lib/paystack-server.mjs";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed.");
  try {
    const raw = await readRawBody(req);
    const signature = req.headers["x-paystack-signature"];
    if (typeof signature !== "string" || !verifyWebhookSignature(raw, signature)) {
      return res.status(401).send("Invalid signature.");
    }
    const event = JSON.parse(raw.toString("utf8"));
    if (event.event !== "charge.success") return res.status(200).json({ received: true });
    const reference = event.data?.reference;
    const userId = event.data?.metadata?.user_id;
    const email = event.data?.customer?.email;
    if (typeof reference !== "string" || typeof userId !== "string" || typeof email !== "string") {
      return res.status(400).send("Missing payment details.");
    }
    const payment = await verifyPaystackReference(reference);
    const verifiedUser = { id: userId, email };
    if (!isCorrectPayment(payment, verifiedUser)) {
      return res.status(400).send("Payment does not match the product.");
    }
    await recordVerifiedPayment({ userId, email, reference });
    return res.status(200).json({ received: true });
  } catch {
    return res.status(500).send("Webhook processing failed.");
  }
}
