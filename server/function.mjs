import { ServiceError } from './service-error.mjs';

export function createEntry({ load = () => import('./api.mjs'), now = () => performance.now() } = {}) {
  let apiReady, moduleMs = 0, firstRequest = true, lastScheduledWarmup = null;
  const loadAPI = () => apiReady ??= (async () => {
    const start = now();
    const module = await load();
    moduleMs = now() - start;
    return module;
  })().catch(error => { apiReady = undefined; throw error; });
  return async ({ req, res }) => {
    const started = now();
    const cold = firstRequest;
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
      "Server-Timing": `app;dur=${(now() - started).toFixed(1)}, module;dur=${cold ? moduleMs.toFixed(1) : 0}, first;dur=${cold ? 1 : 0}, prewarmed;dur=${lastScheduledWarmup === null ? 0 : 1}, warm-age;dur=${lastScheduledWarmup === null ? 0 : Math.max(0, now() - lastScheduledWarmup).toFixed(1)}`,
    });
    // Appwrite's own schedule keeps the deployed worker and both immutable
    // catalogues ready. It performs no database, geocoder or routing requests.
    // No public request body can select a different warmup task or URL.
    if (req.headers?.['x-appwrite-trigger'] === 'schedule') {
      try {
        firstRequest = false;
        const { api } = await loadAPI();
        const collections = [];
        for (const careType of ['short_term', 'regular']) {
          const result = await api({ action: 'health', mode: 'live', careType });
          collections.push({ careType, available: result.available });
        }
        lastScheduledWarmup = now();
        return res.json({ ok: true, task: 'search-warmup', collections }, 200, timedHeaders());
      } catch {
        return res.json({ ok: false, code: 'WARMUP_FAILED' }, 503, timedHeaders());
      }
    }
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
      firstRequest = false;
      const { api } = await loadAPI();
      return res.json({ ok: true, ...(await api(body)) }, 200, timedHeaders());
    } catch (e) {
      const out = { status: e instanceof ServiceError ? e.status : 503,
        body: { ok: false, code: e instanceof ServiceError ? e.code : 'SERVICE_UNAVAILABLE',
          ...(e instanceof ServiceError && e.fields ? { fields: e.fields } : {}) } };
      return res.json(out.body, out.status, timedHeaders());
    }
  };
}
export default createEntry();
