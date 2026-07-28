import { authenticate } from "../server/auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await authenticate(req);
    return res.status(200).json(user);
  } catch (error) {
    return res.status(error.status || 401).json({
      error: error.status === 403 ? error.message : "Authentication failed",
    });
  }
}
