import { buildCatalog } from "./providers.mjs";
import { applyHoursEvidence } from "./hours-overlay.mjs";
import { applyServicesEvidence } from "./services-overlay.mjs";
import { applyAdmissionsEvidence } from "./admissions-overlay.mjs";
import { applyFeesEvidence } from "./fees-overlay.mjs";
import { applyProviderAdditions } from "./provider-additions.mjs";
import { shortCareCollection } from "./profile-evidence.mjs";
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
// Publication/export adapter only. User-facing API handlers use published-catalog.mjs.
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
    const servicesKey = [summary.services_release, summary.services_hash, summary.services_count].join(":");
    const feesKey = [summary.fees_release, summary.fees_hash, summary.fees_count].join(":");
    const admissionsKey = [summary.admissions_release, summary.admissions_hash, summary.admissions_count].join(":");
    const additionsKey = [summary.additions_release, summary.additions_hash, summary.additions_count].join(":");
    const profilesKey = [summary.profile_evidence_release, summary.profile_evidence_hash, summary.profile_evidence_count].join(":");
    if (cache?.release === manifest.release_id && cache.hoursKey === hoursKey && cache.servicesKey === servicesKey && cache.feesKey === feesKey && cache.admissionsKey === admissionsKey && cache.additionsKey === additionsKey && cache.profilesKey === profilesKey) {
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
    if (summary.admissions_release) {
      if (!/^admissions_[a-f0-9]{24}$/.test(summary.admissions_release) || !/^[a-f0-9]{64}$/.test(summary.admissions_hash ?? '') || !Number.isInteger(summary.admissions_count) || summary.admissions_count < 1 || summary.admissions_count > summary.provider_count) throw new ServiceError('SOURCE_INVALID');
      const evidenceRows=[];
      for(let offset=0;offset<summary.admissions_count;offset+=100){
        const params=new URLSearchParams();
        for(const q of [query('equal','release_id',[summary.admissions_release]),query('orderAsc','$id',[]),query('limit',null,[100]),query('offset',null,[offset])])params.append('queries[]',q);
        params.set('total','false');
        evidenceRows.push(...(await get('/tablesdb/equalpath/tables/web_provider_evidence/rows?'+params)).rows);
      }
      if(evidenceRows.length!==summary.admissions_count||evidenceRows.some(r=>r.release_id!==summary.admissions_release))throw new ServiceError('SOURCE_INCOMPLETE');
      try{raw=applyAdmissionsEvidence(raw,evidenceRows.map(r=>{const value=JSON.parse(r.payload);if(value.provider_id!==r.provider_id)throw Error('Identity differs');return value;}),manifest.release_id,summary.admissions_hash);}catch{throw new ServiceError('SOURCE_INVALID');}
    }
    if (summary.services_release) {
      if (!/^services_[a-f0-9]{24}$/.test(summary.services_release) || !/^[a-f0-9]{64}$/.test(summary.services_hash ?? '') || !Number.isInteger(summary.services_count) || summary.services_count < 1 || summary.services_count > summary.provider_count) throw new ServiceError('SOURCE_INVALID');
      const evidenceRows=[];
      for(let offset=0;offset<summary.services_count;offset+=100){
        const params=new URLSearchParams();
        for(const q of [query('equal','release_id',[summary.services_release]),query('orderAsc','$id',[]),query('limit',null,[100]),query('offset',null,[offset])])params.append('queries[]',q);
        params.set('total','false');
        evidenceRows.push(...(await get('/tablesdb/equalpath/tables/web_provider_evidence/rows?'+params)).rows);
      }
      if(evidenceRows.length!==summary.services_count||evidenceRows.some(r=>r.release_id!==summary.services_release))throw new ServiceError('SOURCE_INCOMPLETE');
      try{raw=applyServicesEvidence(raw,evidenceRows.map(r=>{const value=JSON.parse(r.payload);if(value.provider_id!==r.provider_id)throw Error('Identity differs');return value;}),manifest.release_id,summary.services_hash);}catch{throw new ServiceError('SOURCE_INVALID');}
    }
    if (summary.fees_release) {
      if (!/^fees_[a-f0-9]{24}$/.test(summary.fees_release) || !/^[a-f0-9]{64}$/.test(summary.fees_hash ?? '') || !Number.isInteger(summary.fees_count) || summary.fees_count < 1 || summary.fees_count > summary.provider_count) throw new ServiceError('SOURCE_INVALID');
      const evidenceRows=[];
      for(let first=0;first<summary.fees_count;first+=600){
        const offsets=Array.from({length:Math.min(6,Math.ceil((summary.fees_count-first)/100))},(_,i)=>first+i*100);
        const pages=await Promise.all(offsets.map(async offset=>{
          const params=new URLSearchParams();
          for(const q of [query('equal','release_id',[summary.fees_release]),query('orderAsc','$id',[]),query('limit',null,[100]),query('offset',null,[offset])])params.append('queries[]',q);
          params.set('total','false');
          return get('/tablesdb/equalpath/tables/web_provider_evidence/rows?'+params);
        }));
        for(const page of pages)evidenceRows.push(...page.rows);
      }
      if(evidenceRows.length!==summary.fees_count||evidenceRows.some(r=>r.release_id!==summary.fees_release))throw new ServiceError('SOURCE_INCOMPLETE');
      try{raw=applyFeesEvidence(raw,evidenceRows.map(r=>{const value=JSON.parse(r.payload);if(value.provider_id!==r.provider_id)throw Error('Identity differs');return value;}),manifest.release_id,summary.fees_hash);}catch{throw new ServiceError('SOURCE_INVALID');}
    }
    if (summary.additions_release) {
      if (!/^additions_[a-f0-9]{24}$/.test(summary.additions_release) || !/^[a-f0-9]{64}$/.test(summary.additions_hash??'') || !Number.isInteger(summary.additions_count) || summary.additions_count<1 || summary.additions_count>1000) throw new ServiceError('SOURCE_INVALID');
      const evidenceRows=[];
      for(let offset=0;offset<summary.additions_count;offset+=100){
        const params=new URLSearchParams();
        for(const q of [query('equal','release_id',[summary.additions_release]),query('orderAsc','$id',[]),query('limit',null,[100]),query('offset',null,[offset])])params.append('queries[]',q);
        params.set('total','false');
        evidenceRows.push(...(await get('/tablesdb/equalpath/tables/web_provider_evidence/rows?'+params)).rows);
      }
      if(evidenceRows.length!==summary.additions_count||evidenceRows.some(r=>r.release_id!==summary.additions_release))throw new ServiceError('SOURCE_INCOMPLETE');
      try{raw=applyProviderAdditions(raw,evidenceRows.map(r=>{const value=JSON.parse(r.payload);if(value.provider_id!==r.provider_id)throw Error('Identity differs');return value;}),manifest.release_id,summary.additions_hash);}catch{throw new ServiceError('SOURCE_INVALID');}
    }
    const profileRecords = [];
    if (summary.profile_evidence_release) {
      if (!/^profiles_[a-f0-9]{24}$/.test(summary.profile_evidence_release) || !/^[a-f0-9]{64}$/.test(summary.profile_evidence_hash ?? "") ||
          !Number.isInteger(summary.profile_evidence_count) || summary.profile_evidence_count < 1 || summary.profile_evidence_count > 1000)
        throw new ServiceError("SOURCE_INVALID");
      for (let offset = 0; offset < summary.profile_evidence_count; offset += 100) {
        const params = new URLSearchParams();
        for (const q of [query("equal", "release_id", [summary.profile_evidence_release]), query("orderAsc", "$id", []), query("limit", null, [100]), query("offset", null, [offset])]) params.append("queries[]", q);
        const rows = (await get("/tablesdb/equalpath/tables/web_provider_evidence/rows?" + params)).rows;
        for (const row of rows) {
          const r = JSON.parse(row.payload);
          if (row.release_id !== summary.profile_evidence_release || row.provider_id !== r.provider_id) throw new ServiceError("SOURCE_INVALID");
          profileRecords.push(r);
        }
      }
      if (profileRecords.length !== summary.profile_evidence_count) throw new ServiceError("SOURCE_INCOMPLETE");
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
    candidate.servicesKey = servicesKey;
    candidate.feesKey = feesKey;
    candidate.admissionsKey = admissionsKey;
    candidate.additionsKey = additionsKey;
    candidate.profilesKey = profilesKey;
    candidate.shortCareIds = [];
    candidate.shortCareReady = Boolean(summary.profile_evidence_release);
    if (candidate.shortCareReady) {
      try { candidate.shortCareIds = shortCareCollection(profileRecords, summary, candidate.items); }
      catch { throw new ServiceError("SOURCE_INVALID"); }
    }
    if (summary.hours_release) {
      candidate.version += ":" + summary.hours_release;
      for (const p of candidate.items) p.version = candidate.version;
    }
    if (summary.services_release) {
      candidate.version += ':' + summary.services_release;
      for (const p of candidate.items) p.version=candidate.version;
    }
    if (summary.fees_release) {
      candidate.version += ':' + summary.fees_release;
      for (const p of candidate.items) p.version=candidate.version;
    }
    if (summary.admissions_release) {
      candidate.version += ':' + summary.admissions_release;
      for (const p of candidate.items) p.version = candidate.version;
    }
    if (summary.additions_release) {
      candidate.version += ':' + summary.additions_release;
      for (const p of candidate.items) p.version = candidate.version;
    }
    if (summary.profile_evidence_release) {
      candidate.version += ':' + summary.profile_evidence_release;
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
