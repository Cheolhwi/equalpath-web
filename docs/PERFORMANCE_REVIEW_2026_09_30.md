# Search and landing performance review — 30 September 2026

## Production observations

Inspected the real `https://equalpathcare.me/#discover` page and its public Appwrite Function. At the initial investigation, the public site served source digest `fa8b8dc638021a845502012fbdae6980f5cc666f5241f6e8e06a80c7e168e79a`; the publication and follow-up measurements are recorded below.

Five sequential, ordinary public API requests (no load test) gave these results:

| Request | Total response | Function execution | Result |
| --- | ---: | ---: | --- |
| Health | 205 ms | 33 ms | OK |
| KL Sentral search | 203 ms | 70 ms | 10 results, routes available |
| Same place, different end time | 160 ms | 94 ms | 10 results, routes available |
| KLCC Park search | 849 ms | 725 ms | 10 results, routes available |
| Bangsar Village search | **6,506 ms** | **6,409 ms** | 10 results, every route `service_unavailable` |

The slow request spent almost all of its time in the Function. The deployed search waits for the external driving-time request before returning childcare results; its external request timeout is six seconds. A route outage therefore delays the entire search, despite childcare facts and ranking not depending on route data. Recent Function records also include executions around 5.48, 6.04 and 6.53 seconds. These records do not identify every action, so they are corroborating latency evidence, not attribution for every slow request.

The normal browser journeys at KL Sentral and Jaya One completed in approximately 1.27 and 0.70 seconds respectively, measured around automation actions (includes control overhead). The long wait was reproduced directly against the same production backend, not on those two browser searches. No assumption is made that all users or requests see the same latency.

One historical HTTP 500 execution took 4.56 seconds. Its only available error is `general_unknown / Error Code: 500`; detailed execution logging is disabled. Its cause remains unresolved. Server settings and logging were not changed.

Opening the actual production landing scene from the map took approximately 6.63 seconds in this browser run. Production assets include a 1,451,647-byte main script (decoded), a 769,290-byte scene script (decoded), a 3,565,116-byte uncompressed GLB, and five artwork images totalling about 610 KB. The scripts are Brotli compressed on the wire; decoded sizes are not transfer sizes. Observed resources use `public, max-age=0, must-revalidate`. The implementation starts artwork texture loading after model loading/processing and also starts the hidden map and directory requests during a fresh welcome entry.

## Implemented locally

- Feature-negotiated search response: return eligibility, fees and review topic evidence immediately; fetch driving times separately by bounded public IDs. Legacy clients retain their existing contract.
- Route responses cannot change search membership, reranking, map position or dismissed previews. Cancel obsolete requests; stop waiting for optional route enrichment after ten seconds and show an unavailable label.
- Keep all ten short-care results in the same reranking pass. No scoring factors or eligibility rules have been removed.
- Fetch review passages when Parent reviews is expanded. Keep topic observations available to ranking; retain the review-to-contact-question flow.
- Same-request data comparison: search JSON is reduced from **817,435 to 406,808 bytes (50.2%)**, before transport compression. Reranking on this machine remains below a few milliseconds, not seconds.
- Split the map into a lazy module, reducing the initial script from about 1.45 MB to 460 KB decoded. The map still loads when needed; this is deferred work, not a reduction of the whole application's total code.
- Defer map and nearby queries until entry; pause the gallery behind preferences and keep the existing map/gallery instances on return. Load model and artwork concurrently. Motion and visual quality remain enabled.

## Verification and limits

- Locked dependencies installed; `npm run release` passes **233 tests**, isolated Function packaging, production build and source validation.
- Local Chromium desktop screen at 1280 × 720 checked: first entry, preferences, map, all ten ranked results, details and lazy reviews.
- Local responsive screen in a real browser iframe at **390 × 844 CSS pixels** checked: search, collapsed toolbar, changing end time, new fees and details. This is responsive-width verification, not a physical-phone performance benchmark. The browser viewport override did not take effect, so an explicit iframe was used.
- Local-only delayed-routing harness held the route response for 12 seconds. Search returned in 10–24 ms locally; results remained usable and optional routing timed out independently at 10 seconds. These local numbers are not production performance promises.
- Landing screenshot after the final parallel-load change was checked; the earlier temporary development compile error was corrected before the passing release gate.
- The first local verification did not publish changes. The subsequent authorised production release is recorded below. No database mutation, DNS change or execution logging was introduced; timing response headers contain numbers only.

Evidence: `evidence/performance-20260930/production-server-timings.json`, `function-list-executions.json`, `production-static.json`, `production-gallery-assets.json`, `search-after.json`, `slow-route-metrics.json`, `ten-ranked-results.json`, `mobile-metrics.json`, and the desktop/mobile screenshots.

## Production release and second diagnosis

Published commit `b4d6ba6a2644788354ce6d56b24324c28f611956` on 30 September. Expected and public source digest both equal `f7a3117f6851c8f84cf88418ad2fd3469622b75b7049b93490c87e6491eddfe8`. Site deployment `6abc6f1257fb63a0c096` and Function deployment `6abc6e46383e3050d5ce` are active and ready. The release verifier checked public HTTPS, entry assets and backend health.

The first request after the new Function deployment still took 6.26 seconds: the Function execution reported 5.84 seconds, while the new application timing header measured 1.41 seconds inside the handler. Roughly 4.43 seconds was outside the handler (platform/runtime startup and request dispatch, including module loading); this must not be confused with route waiting or claimed to be fully eliminated. Runtime specification remains 0.5 vCPU / 512 MB; billing and infrastructure settings were not changed.

Additional mitigations now reuse enriched immutable catalogues per runtime and issue one anonymous background health request during welcome/preferences. This prepares the cold runtime before search, without blocking entry, sending a location or running a keep-alive loop. Direct map entry already prepares the runtime through nearby discovery. This mitigates cold-start exposure; it does not guarantee zero cold-start latency after inactivity or scaling.

Production results after preparation:

- The same Bangsar search previously measured at 6,506 ms returned in **208 ms**, with 67 ms Function execution / 29.4 ms handler time, ten items and deferred routes. This is a warm request, not a cold-start benchmark.
- A new search sent while a route request was pending returned in **511 ms**, ahead of the route request completing at 1,139 ms.
- Two other public searches returned in 164 and 142 ms. Review text loaded separately in 98 ms.
- On the real production page, changing 12:00 to 13:00 applied in **347 ms** around browser-control actions. Fees visibly changed (Little Playhouse KL Eco City MYR 40 to MYR 60), the count was 24 matching centres / ten on page one, all ten rendered rows had finite rerank scores and positions 1–10, and Parent reviews expanded with text. No no-match fallback appeared for this matching search.
- Returning to the landing and loading its scene completed in 1,578 ms in this browser run. Browser asset caches may affect this number; it is not a guaranteed fresh-visit timing.

The final local gate passed 233 tests and the build. Local desktop/mobile visual evidence was retained; the added background preparation was also checked through welcome, preferences and map entry. GitHub run `36658432826` passed Test, build and verify release. Its three journey shards failed at collection due to duplicate test titles in `map-search-dock.spec.mjs`; the landing shard also failed expectations including direct ready-state versus first-use preferences and reduced-motion loading. These automated browser checks remain unresolved and are not represented as passing. Manual production checks above are separate evidence.

Final receipt: `evidence/performance-20260930/release-receipt.json`.
