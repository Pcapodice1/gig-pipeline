// Serverless proxy (Vercel). The browser calls /api/claude; this forwards to
// Anthropic with your secret key attached server-side. The key NEVER reaches the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY. Set it in your Vercel project settings." });
    return;
  }

  // --- Optional shared-secret gate ---------------------------------------
  // If you set APP_PASSCODE in Vercel, the app must send a matching code.
  // Leave it unset to keep the app open (fine for a private link to one person).
  const required = process.env.APP_PASSCODE;
  let payload = typeof req.body === "string" ? safeParse(req.body) : req.body;
  if (!payload) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  if (required) {
    const given = req.headers["x-app-passcode"] || payload.passcode;
    if (given !== required) {
      res.status(401).json({ error: "Wrong or missing passcode." });
      return;
    }
  }
  // Don't forward our own helper field to Anthropic.
  if ("passcode" in payload) delete payload.passcode;
  // -----------------------------------------------------------------------

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: "Upstream request failed", detail: String(e) });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
