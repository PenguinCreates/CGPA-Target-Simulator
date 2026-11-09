import { getUser, hasAccess, initializePaystack } from "../../lib/paystack-server.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "Please sign in before checkout." });
    if (await hasAccess(user.id)) {
      return res.status(409).json({ error: "This account already has lifetime access." });
    }
    const checkout = await initializePaystack({ user });
    return res.status(200).json(checkout);
  } catch {
    return res.status(503).json({ error: "Checkout is not configured yet. Please try again later." });
  }
}
