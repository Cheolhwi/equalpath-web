import { createHash } from 'node:crypto';
import { safeURL } from './providers.mjs';

// These are reviewed public service descriptions, never bookings or live vacancies.
export function applyAdmissionsEvidence(raw, records, baseRelease, expectedHash) {
  const sorted = [...records].sort((a, b) => a.provider_id.localeCompare(b.provider_id));
  if (createHash('sha256').update(JSON.stringify(sorted)).digest('hex') !== expectedHash)
    throw Error('Invalid admissions hash');
  const providers = new Map(raw.map(p => [p.id, p])), seen = new Set();
  const text = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
  for (const r of records) {
    const p = providers.get(r.provider_id);
    if (!p || seen.has(r.provider_id) || r.base_release !== baseRelease ||
        r.match?.status !== 'matched' || r.match.catalogue_name !== p.official_name ||
        !text(r.match.basis, 600) || !['published', 'programme_only', 'not_offered', 'paused'].includes(r.status) ||
        !['branch', 'brand'].includes(r.scope) || (r.status === 'published' && r.scope !== 'branch') ||
        !text(r.wording, 1000) || !text(r.question, 400) ||
        !Array.isArray(r.service_types) || !r.service_types.length ||
        r.service_types.some(t => !['hourly', 'drop_in', 'occasional', 'flexi', 'extended_care', 'admissions_pause'].includes(t)) ||
        !Array.isArray(r.sources) || !r.sources.length || r.sources.length > 5 ||
        r.sources.some(s => !safeURL(s.url) || !text(s.label, 150) ||
          !['provider_website', 'employer_profile', 'public_directory', 'social_post_mirror'].includes(s.kind) ||
          !Number.isFinite(Date.parse(s.retrievedAt)) ||
          (s.sourceDate != null && !Number.isFinite(Date.parse(s.sourceDate))) ||
          !/^[a-f0-9]{64}$/.test(s.snapshotHash ?? '')))
      throw Error('Invalid admissions evidence');
    seen.add(r.provider_id);
  }
  const byId = new Map(records.map(r => [r.provider_id, r]));
  return raw.map(p => byId.has(p.id) ? { ...p, admission_review: byId.get(p.id) } : p);
}
