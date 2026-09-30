import { api, errorResponse } from "./api.mjs";
let firstRequest = true;
export default async ({ req, res }) => {
  const started = performance.now();
  const cold = firstRequest;
  firstRequest = false;
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  // Only durations leave the server: no request fields or user data in telemetry.
  const timedHeaders = () => ({ ...headers,
    "Server-Timing": `app;dur=${(performance.now() - started).toFixed(1)}, first;dur=${cold ? 1 : 0}`,
  });
  if (req.method === "OPTIONS") return res.text("", 204, headers);
  if (req.method !== "POST")
    return res.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, headers);
  try {
    const raw = req.bodyText ?? "";
    if (raw.length > 12000)
      return res.json({ ok: false, code: "REQUEST_TOO_LARGE" }, 413, headers);
    let body;
    try {
      body = req.bodyJson ?? JSON.parse(raw);
    } catch {
      return res.json({ ok: false, code: "INVALID_REQUEST" }, 400, headers);
    }
    return res.json({ ok: true, ...(await api(body)) }, 200, timedHeaders());
  } catch (e) {
    const out = errorResponse(e);
    return res.json(out.body, out.status, timedHeaders());
  }
};
