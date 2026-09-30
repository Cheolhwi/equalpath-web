# Search and landing performance review — 30 September 2026

## Production observations

Inspected the real `https://equalpathcare.me/#discover` page and its public Appwrite Function. The public site still serves source digest `fa8b8dc638021a845502012fbdae6980f5cc666f5241f6e8e06a80c7e168e79a`; none of the fixes below has been published in this investigation.

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
- No production deployment, database mutation, DNS change, or new execution logging was performed. Production improvement must be measured again after a release. Existing browser CI failures from the previous release are not represented as passing here.

Evidence: `evidence/performance-20260930/production-server-timings.json`, `function-list-executions.json`, `production-static.json`, `production-gallery-assets.json`, `search-after.json`, `slow-route-metrics.json`, `ten-ranked-results.json`, `mobile-metrics.json`, and the desktop/mobile screenshots.
