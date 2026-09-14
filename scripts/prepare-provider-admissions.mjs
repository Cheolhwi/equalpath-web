// Materialise a reviewed admission snapshot from public-page captures and branch matches.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { applyAdmissionsEvidence } from '../server/admissions-overlay.mjs';
const root = resolve(import.meta.dirname, '../..');
const out = resolve(root, 'webapp-data/source/temporary-care-20260915');
const raw = JSON.parse(readFileSync(resolve(out, 'raw-before.json')));
const manifest = JSON.parse(readFileSync(resolve(out, 'manifest-before.json')));
const review = JSON.parse(readFileSync(resolve(root, 'webapp/data/admissions-review-20260915.json')));
const crawl = JSON.parse(readFileSync(resolve(out, 'crawl.json')));
const hash = value => createHash('sha256').update(value).digest('hex');
const records = review.records.map(r => {
  const p = raw.find(p => p.id === r.provider_id);
  if (!p || p.official_name !== r.catalogue_name) throw Error('Review does not match catalogue identity');
  return {
    provider_id: p.id, base_release: manifest.release_id,
    match: { status: 'matched', catalogue_name: p.official_name, basis: r.match_basis },
    status: r.status, scope: r.scope, service_types: r.service_types,
    wording: r.wording, question: r.question,
    sources: r.sources.map(key => {
      const s = review.sources[key], capture = crawl.find(c => c.url === s.url && c.file &&
        c.status === 'rendered' && c.captureMethod === 'rendered_browser_excerpt') ??
        crawl.find(c => c.url === s.url && c.file && c.status === 200);
      if (!capture) throw Error(`No successful capture for reviewed source ${key}`);
      const actualHash = hash(readFileSync(resolve(out, 'pages', capture.file)));
      if (actualHash !== capture.sha256) throw Error('Captured source changed');
      return { label: s.label, url: s.url, kind: s.kind,
        retrievedAt: capture.retrievedAt, sourceDate: s.sourceDate ?? null,
        snapshotHash: actualHash, captureMethod: capture.captureMethod ?? 'public_http' };
    }),
  };
}).sort((a, b) => a.provider_id.localeCompare(b.provider_id));
const digest = hash(JSON.stringify(records));
applyAdmissionsEvidence(raw, records, manifest.release_id, digest);
const summary = { baseRelease: manifest.release_id, release: 'admissions_' + digest.slice(0, 24),
  hash: digest, count: records.length, published: records.filter(r => r.status === 'published').length,
  programmeOnly: records.filter(r => r.status === 'programme_only').length,
  paused: records.filter(r => r.status === 'paused').length,
  preparedAt: new Date().toISOString(), unmergedLeads: review.unmerged_leads.length };
writeFileSync(resolve(out, 'prepared-admissions.json'), JSON.stringify({ summary, records }, null, 2));
console.log(JSON.stringify(summary));
