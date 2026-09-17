import { applyPublicContent } from '../lib/public-content.js';

// Keep live diary data while applying the website's approved editorial content.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD"].includes(req.method)) {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed." });
  }
  try {
    const response = await fetch("https://wellness-booking-site.onrender.com/api/public-config", {
      signal: AbortSignal.timeout(50000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Configuration unavailable");
    const upstream = await response.json();
    if (!upstream.business || !Array.isArray(upstream.services)) throw new Error("Invalid configuration");
    const config = applyPublicContent(upstream);
    if (req.method === "HEAD") return res.status(200).end();
    return res.status(200).json(config);
  } catch {
    return res.status(503).json({ error: "The appointment configuration is temporarily unavailable." });
  }
}
