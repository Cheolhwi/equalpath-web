# Public-directory read budget

The public TablesDB endpoint returned HTTP 402 with `limit_databases_reads_exceeded` on 16 September 2026. The previous Function loaded the whole public catalogue and six evidence collections on each cold runtime, then filtered by location. With the last verified release this required 88 HTTP reads: 86 pages containing 8,121 records and two manifest checks. The earlier rough estimate of 87 omitted the final manifest check. A warm runtime reused its catalogue and checked only the manifest after 60 seconds; it did not reload all rows every minute. The dashboard's 71K requests cannot be attributed entirely to this path without a usage breakdown.

## Serving requests

The default API store now loads a compressed, integrity-checked catalogue packaged with the query Function. Health, nearby, search, details and compare require **zero TablesDB requests**, including cold starts. Concurrent calls share the same load. A missing, corrupt or mismatched snapshot fails closed; it never falls back to bulk database reads. Place lookup and road routing retain their existing external providers and caches. Function execution requests still count as requests.

`server/data/catalog-snapshot.json.gz` stays on the server and is not shipped in the browser bundle. Its metadata records the release, component versions, SHA-256, byte size, record counts and publication provenance. The deployment script validates the isolated package's data before uploading it. An ordinary build, test or health check does not refresh the database.

## Recovery data

Because current database reads are blocked, this deployment reconstructs the last successful, read-back-verified public release from the publication archives captured on 15 September 2026. Every overlay is matched to its manifest hash and successful publication receipt. The existing normalizer, boundary checks and collection validator are used, rather than a replacement catalogue or fixture data.

The 3,137 usable providers, 417 held records, published and explicitly estimated fee fields, hours, contacts and evidence remain unchanged. The 101-provider short-care collection remains separate from 3,036 regular providers; its membership does not change admission evidence. A full provider-field comparison with the archived normalized catalogue passed. This recovery does not reset Appwrite's used allowance, change billing, or write/delete owner or public database rows.

## Publishing later data updates

After an authorised data import has finished and database reads are available:

1. Run `npm run snapshot:refresh` explicitly. This reads the public catalogue and evidence once, checks the manifest before and after, validates hashes and writes a new compressed snapshot with metadata.
2. Review the data/version/count changes and run `npm run release`. Build and test remain offline with respect to the database.
3. Deploy the query Function using `node scripts/deploy-api.mjs --deploy`, wait for readiness and verify live search/details/compare. Commit the matching snapshot and receipt.

Data changes become visible when their query Function deployment is activated. Merely changing the database manifest no longer triggers bulk reads in users' sessions. Keep the previous Function deployment for rollback; it carries its own matching data snapshot. Do not roll back to a runtime that reads the entire database on cold start.

The initial recovery is reproducible with `node scripts/build-catalog-snapshot.mjs --from-archive ../webapp-data`; it uses the specific verified 15 September archive and makes no network requests. It is a recovery/export command, not an automatic fallback.

## Verification

- Reconstructed all 3,137 provider records and compared every field with the archived published catalogue: no data changes.
- Repeated cold API instances with all outbound fetches rejected: health, nearby, regular/short search, pagination, details and comparison succeed with zero database requests.
- Corrupt hash, mismatched counts, invalid short-care membership and missing files fail closed without network fallback.
- Desktop/mobile browser coverage uses the packaged published catalogue and exercises both care modes, details and comparison. Existing radius, map and sorting regressions are also run.

Detailed run outputs and screenshots are under `.build/read-budget/` in the verification checkout.

### Verified recovery

All 171 unit tests passed. Twelve relevant desktop/mobile browser scenarios passed, including a rerun of four scenarios interrupted by the local preview restarting after a package configuration edit. Function deployment `6aaa1c03d4d35146b9b2` reached `ready` on 16 September. The live API returned 20 of 379 regular matches within 10 km and 10 of 12 short-care matches within 5 km at KL Sentral; details and comparison also succeeded. During the same verification, a direct public database probe still returned `402 / limit_databases_reads_exceeded`. The recovery therefore works without resetting or buying database allowance.
