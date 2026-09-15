import { createHash } from "node:crypto";
// Collection membership is a course research scope, not proof of short-stay acceptance.
export function shortCareCollection(records, summary, providers) {
  const sorted = [...records].sort((a, b) => a.provider_id.localeCompare(b.provider_id));
  if (createHash("sha256").update(JSON.stringify(sorted)).digest("hex") !== summary.profile_evidence_hash)
    throw Error("Profile evidence hash differs");
  const ids = new Set(providers.map(p => p.id)), seen = new Set();
  for (const r of sorted) {
    if (r.schema !== "public-provider-profile-v1" || !ids.has(r.provider_id) || seen.has(r.provider_id) ||
        ![true, null].includes(r.short_care_published) || !r.sources?.length || !r.programme_facts?.length)
      throw Error("Invalid profile evidence");
    seen.add(r.provider_id);
  }
  return [...seen];
}
