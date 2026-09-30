// Compile only already-published, checked-in facts. No network or owner data.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createPublishedStore } from '../server/published-catalog.mjs';
import { applyReviewEvidence } from '../server/review-evidence.mjs';
import { applyCompletedShortCareData } from '../server/completed-short-care.mjs';
import { applyReviewProfiles } from '../server/review-profiles.mjs';
import { searchCatalogSchema } from '../server/search-catalog.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function prepareSearchCatalog(directory) {
  const original = await createPublishedStore().catalog();
  const full = applyReviewProfiles(applyCompletedShortCareData(applyReviewEvidence(original)));
  const shortIds = new Set(full.shortCareIds);
  const manifest = { schema: searchCatalogSchema, version: full.version, release: full.release, partitions: {}, extras: {} };
  await mkdir(resolve(directory, 'extras'), { recursive: true });
  const save = async (name, value) => {
    const bytes = Buffer.from(JSON.stringify(value)), compressed = gzipSync(bytes, { level: 9 });
    await writeFile(resolve(directory, name), compressed);
    return { sha256: sha(bytes), bytes: bytes.length, compressedBytes: compressed.length };
  };
  const lean = await Promise.all(full.items.map(async provider => {
    const { completedShortCare, reviewEvidence, reviewProfile, ...item } = provider;
    const fields = { completedShortCare, reviewEvidence, reviewProfile };
    if (Object.values(fields).some(value => value !== undefined))
      manifest.extras[provider.id] = await save(`extras/${sha(provider.id)}.json.gz`, { id: provider.id, version: full.version, fields });
    if (reviewProfile) {
      const { excerpts, ...profile } = reviewProfile;
      item.reviewProfile = { ...profile, excerpts: [], deferred: true };
    }
    return item;
  }));
  // Stable output independent of filesystem completion order.
  manifest.extras = Object.fromEntries(Object.entries(manifest.extras).sort(([a], [b]) => a.localeCompare(b)));
  for (const careType of ['short_term', 'regular']) {
    const items = lean.filter(p => shortIds.has(p.id) === (careType === 'short_term'));
    manifest.partitions[careType] = { ...await save(`${careType}.json.gz`, { ...full, items }), providers: items.length };
  }
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2] ?? 'server/data/search-index');
  const result = await prepareSearchCatalog(directory);
  console.log(JSON.stringify({ partitions: result.partitions, reviewFiles: Object.keys(result.extras).length }));
}
