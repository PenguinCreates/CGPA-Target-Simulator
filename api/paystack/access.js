import { getUser, hasAccess } from "../../lib/paystack-server.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "Please sign in to check access." });
    return res.status(200).json({ access: await hasAccess(user.id) });
  } catch {
    return res.status(503).json({ error: "Access service is not configured yet." });
  }
}
