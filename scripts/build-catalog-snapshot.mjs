// Explicit publication step only. Never called by a user request or normal build.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createStore } from "../server/appwrite-store.mjs";
import { snapshotSchema, decodeCatalogSnapshot } from "../server/published-catalog.mjs";

const root = resolve(import.meta.dirname, ".."), args = process.argv.slice(2);
const archiveFlag = args.indexOf("--from-archive"), live = args.includes("--live");
assert(live !== (archiveFlag >= 0), "Choose --live or --from-archive <webapp-data directory>");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
let manifest, source, requests = 0, fetcher = fetch;
if (archiveFlag >= 0) {
  assert(args[archiveFlag + 1] && !args[archiveFlag + 1].startsWith("--"), "Missing archive directory");
  const directory = resolve(args[archiveFlag + 1]), files = {};
  const read = path => {
    const bytes = readFileSync(resolve(directory, path));
    files[path] = sha(bytes);
    return JSON.parse(bytes);
  };
  // These files are the final, fully read-back-verified public release before
  // the quota incident. Incomplete drafts and candidate research are excluded.
  manifest = read("source/short-care-import-20260915/manifest-after.json");
  const summary = JSON.parse(manifest.payload);
  const base = read("prepared/catalog.json");
  const baseReceipt = read(`receipts/${manifest.release_id}.json`);
  assert.equal(baseReceipt.manifest_readback_verified, true);
  assert.equal(baseReceipt.source_hash, manifest.source_hash);
  assert.equal(baseReceipt.tables.web_provider_catalog.verified_rows, summary.provider_count);
  const preparedSummary = read("prepared/summary.json");
  assert.equal(preparedSummary.release_id, manifest.release_id);
  assert.equal(preparedSummary.source_hash, manifest.source_hash);
  const components = [
    ["hours", "hours-coverage-20260913/prepared-hours.json", "hours-coverage-20260913/publication-receipt.json"],
    ["services", "source/services-20260913/prepared-services.json", "source/services-20260913/publication-receipt.json"],
    ["fees", "source/directory-fees-20260913/prepared-fees.json", "source/directory-fees-20260913/publication-receipt.json"],
    ["admissions", "source/short-care-100-20260915/prepared-admissions.json", "source/short-care-100-20260915/admissions-publication-receipt.json"],
    ["additions", "source/short-care-100-20260915/prepared-additions.json", "source/short-care-100-20260915/additions-publication-receipt.json"],
    ["profile_evidence", "source/short-care-import-20260915/prepared-profiles.json", "source/short-care-import-20260915/publication-receipt.json"],
  ];
  const evidence = new Map();
  for (const [key, preparedPath, receiptPath] of components) {
    const prepared = read(preparedPath), receipt = read(receiptPath);
    const release = summary[`${key}_release`], count = summary[`${key}_count`];
    assert.equal(prepared.summary.release, release);
    assert.equal(prepared.summary.baseRelease, manifest.release_id);
    assert.equal(prepared.summary.hash, summary[`${key}_hash`]);
    assert.equal(prepared.records.length, count);
    assert.equal(receipt.release, release);
    assert.equal(receipt.manifestVerified, true);
    assert.equal(receipt.verified, count);
    evidence.set(release, prepared.records.map(record => ({
      provider_id: record.provider_id, release_id: release, payload: JSON.stringify(record),
    })).sort((a, b) => a.provider_id.localeCompare(b.provider_id)));
  }
  base.sort((a, b) => a.$id.localeCompare(b.$id));
  fetcher = async url => {
    const u = new URL(url);
    if (u.pathname === "/v1/tablesdb/equalpath/tables/web_data_releases/rows/current")
      return { ok: true, json: async () => manifest };
    assert(["/v1/tablesdb/equalpath/tables/web_provider_catalog/rows", "/v1/tablesdb/equalpath/tables/web_provider_evidence/rows"].includes(u.pathname));
    const queries = u.searchParams.getAll("queries[]").map(JSON.parse);
    const release = queries.find(q => q.method === "equal" && q.attribute === "release_id")?.values[0];
    const offset = queries.find(q => q.method === "offset")?.values[0] ?? 0;
    const limit = queries.find(q => q.method === "limit")?.values[0] ?? 25;
    const rows = u.pathname.endsWith("web_provider_catalog/rows") ? base : evidence.get(release);
    assert(rows, "Archived evidence is incomplete");
    return { ok: true, json: async () => ({ rows: rows.slice(offset, offset + limit) }) };
  };
  source = { kind: "verified-published-archive", capturedAt: manifest.$updatedAt, files };
} else {
  fetcher = async (url, options) => {
    requests++;
    const response = await fetch(url, options);
    if (response.ok && url.endsWith("/web_data_releases/rows/current")) manifest = await response.clone().json();
    return response;
  };
  source = { kind: "public-appwrite-release", capturedAt: new Date().toISOString() };
}
const catalog = await createStore({ fetcher }).catalog();
assert(catalog.shortCareReady, "The published short-care collection must be available");
const bytes = Buffer.from(JSON.stringify(catalog));
const compressed = gzipSync(bytes, { level: 9 });
const metadata = {
  schema: snapshotSchema, sha256: sha(bytes), bytes: bytes.length, compressedBytes: compressed.length,
  release: catalog.release, version: catalog.version, providers: catalog.items.length,
  held: catalog.held.length, shortCareProviders: catalog.shortCareIds.length,
  source: { ...source, manifestSHA256: sha(manifest.payload), componentKeys: Object.fromEntries(
    ["hoursKey", "servicesKey", "feesKey", "admissionsKey", "additionsKey", "profilesKey"].map(key => [key, catalog[key]])) },
};
decodeCatalogSnapshot(compressed, metadata);
const out = resolve(root, "server/data");
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "catalog-snapshot.json.gz"), compressed);
writeFileSync(resolve(out, "catalog-snapshot.meta.json"), JSON.stringify(metadata, null, 2) + "\n");
console.log(JSON.stringify({ providers: metadata.providers, shortCareProviders: metadata.shortCareProviders,
  compressedBytes: compressed.length, sha256: metadata.sha256, databaseRequests: requests, source: source.kind }));
