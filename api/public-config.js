// Keep the existing live diary data, without republishing withdrawn contact details.
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
    const config = await response.json();
    if (!config.business || !Array.isArray(config.services)) throw new Error("Invalid configuration");
    delete config.business.phone;
    config.business.ownerEmail = "soultosolebylouise@gmail.com";
    if (req.method === "HEAD") return res.status(200).end();
    return res.status(200).json(config);
  } catch {
    return res.status(503).json({ error: "The appointment configuration is temporarily unavailable." });
  }
}
