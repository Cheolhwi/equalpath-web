import { buildCatalog } from "./providers.mjs";
import { applyHoursEvidence } from "./hours-overlay.mjs";
const endpoint = "https://sgp.cloud.appwrite.io/v1",
  project = "6a916a6c0030a70a9d75";
export class ServiceError extends Error {
  constructor(code, status = 503, fields = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}
const query = (method, attribute, values) =>
  JSON.stringify({ method, ...(attribute ? { attribute } : {}), values });
export function createStore({ fetcher = fetch, now = Date.now } = {}) {
  let cache = null,
    checked = 0,
    pending = null;
  async function get(path) {
    const r = await fetcher(endpoint + path, {
      headers: { "X-Appwrite-Project": project },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new ServiceError("SOURCE_UNAVAILABLE");
    return r.json();
  }
  async function load() {
    const manifest = await get(
      "/tablesdb/equalpath/tables/web_data_releases/rows/current",
    );
    if (manifest.status !== "ready")
      throw new ServiceError("SOURCE_UNAVAILABLE");
    const summary = JSON.parse(manifest.payload);
    const hoursKey = [summary.hours_release, summary.hours_hash, summary.hours_count].join(":");
    if (cache?.release === manifest.release_id && cache.hoursKey === hoursKey) {
      checked = now();
      return cache;
    }
    const rows = [];
    if (
      !Number.isInteger(summary.provider_count) ||
      summary.provider_count < 1 ||
      summary.provider_count > 15000
    )
      throw new ServiceError("SOURCE_INVALID");
    const offsets = Array.from(
      { length: Math.ceil(summary.provider_count / 100) },
      (_, i) => i * 100,
    );
    for (let i = 0; i < offsets.length; i += 6) {
      const pages = await Promise.all(
        offsets.slice(i, i + 6).map(async (offset) => {
          const params = new URLSearchParams();
          for (const q of [
            query("equal", "release_id", [manifest.release_id]),
            query("orderAsc", "$id", []),
            query("limit", null, [100]),
            query("offset", null, [offset]),
          ])
            params.append("queries[]", q);
          params.set("total", "false");
          return get(
            "/tablesdb/equalpath/tables/web_provider_catalog/rows?" + params,
          );
        }),
      );
      for (const page of pages) rows.push(...page.rows);
    }
    if (
      rows.length !== summary.provider_count ||
      new Set(rows.map((r) => r.provider_id)).size !== rows.length ||
      rows.some((r) => r.release_id !== manifest.release_id)
    )
      throw new ServiceError("SOURCE_INCOMPLETE");
    let raw = rows.map((r) => JSON.parse(r.payload));
    if (summary.hours_release) {
      if (!/^hours_[a-f0-9]{24}$/.test(summary.hours_release) ||
          !/^[a-f0-9]{64}$/.test(summary.hours_hash ?? "") ||
          !Number.isInteger(summary.hours_count) || summary.hours_count < 1 || summary.hours_count > summary.provider_count)
        throw new ServiceError("SOURCE_INVALID");
      const evidenceRows = [];
      for (let offset = 0; offset < summary.hours_count; offset += 100) {
        const params = new URLSearchParams();
        for (const q of [query("equal", "release_id", [summary.hours_release]), query("orderAsc", "$id", []), query("limit", null, [100]), query("offset", null, [offset])]) params.append("queries[]", q);
        params.set("total", "false");
        const page = await get("/tablesdb/equalpath/tables/web_provider_evidence/rows?" + params);
        evidenceRows.push(...page.rows);
      }
      if (evidenceRows.length !== summary.hours_count || evidenceRows.some(r => r.release_id !== summary.hours_release))
        throw new ServiceError("SOURCE_INCOMPLETE");
      try {
        raw = applyHoursEvidence(raw, evidenceRows.map(r => {
          const value = JSON.parse(r.payload);
          if (value.provider_id !== r.provider_id) throw Error("Identity differs");
          return value;
        }), manifest.release_id, summary.hours_hash);
      } catch { throw new ServiceError("SOURCE_INVALID"); }
    }
    const after = await get(
      "/tablesdb/equalpath/tables/web_data_releases/rows/current",
    );
    if (after.release_id !== manifest.release_id || after.payload !== manifest.payload)
      throw new ServiceError("SOURCE_CHANGED", 409);
    const candidate = buildCatalog(
      raw,
      manifest.release_id,
    );
    candidate.hoursKey = hoursKey;
    if (summary.hours_release) {
      candidate.version += ":" + summary.hours_release;
      for (const p of candidate.items) p.version = candidate.version;
    }
    cache = candidate;
    checked = now();
    return cache;
  }
  return {
    async catalog() {
      if (cache && now() - checked < 60000) return cache;
      if (pending) return pending;
      pending = load()
        .catch((e) => {
          throw e instanceof ServiceError
            ? e
            : new ServiceError("SOURCE_UNAVAILABLE");
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
    invalidate() {
      checked = 0;
    },
  };
}
