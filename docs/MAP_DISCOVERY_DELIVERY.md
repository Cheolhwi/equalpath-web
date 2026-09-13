# Place search and remembered map — 2026-09-13

The pickup field now searches general OpenStreetMap places through Photon instead of treating childcare centres as the place index. Partial names, approximate spelling and common Malay road abbreviations are supported. Users choose a labelled/addressed result; no result is automatically accepted. Nearby duplicate OSM features are collapsed. The service can be replaced with a compatible hosted instance through `EQUALPATH_PHOTON_URL`.

First entry centres on Kuala Lumpur (3.139, 101.6869) and loads current Appwrite childcare records within 5 km, displaying the nearest 20. The live check returned 68 records in this area. These are location results only, with no date-specific fit claims. Clicking a centre leads to filling care details and then its condition check.

Users can drag the flat map to browse another area, or choose pickup mode, position the centre pin, and explicitly confirm. Cancel leaves the selected pickup unchanged. The browser remembers only the last map centre, zoom and chosen pickup, separated between live and demo modes. Returning visits reload nearby records from Appwrite; date, times, child age and assessment results are not automatically saved. Blocked/corrupt browser storage does not stop current-session selection.

Live saved templates now validate the public pickup coordinate against the service region rather than looking for that location in a childcare-name list. They still require a fresh date and a new condition check.

## Verification

- 94 domain/API/storage tests passed; production release build passed.
- All 8 existing saved-choice/preparation browser journeys passed.
- 5 additional isolated Chrome browser journeys passed: first visit and fuzzy result selection; drag-confirm/reload/cancel; mobile and blocked storage; free map pan/viewport recovery; nearby centre to dated condition check.
- Real Appwrite Function calls succeeded for `KL sentrl`, `Bukit Bint`, `Jln Ampang` and nearby KL/KL Sentral locations. A real-data browser run showed 20 map markers, selected an OSM station, restored it after reload, and operated the mobile picker without page errors.
- Screenshots and initial live responses: `evidence/map-discovery-2026-09-13/`. Browser fixtures are used only in isolated test coverage; the default website mode continues to use live Appwrite records.
- Custom-domain TLS remains a separate unresolved hosting gate. Use the Appwrite default hostname for verified website access.

## Operating limit

Photon's public service permits reasonable project use but offers no availability guarantee. This implementation sends explicit searches only, limits each warm runtime to one outbound start per 1.1 s, coalesces duplicate requests and keeps a bounded 24-hour cache. This is not a distributed global quota; move to a dedicated compatible endpoint if usage grows. No user device coordinate is sent as the geocoder bias. Requests are restricted to KL/Selangor and checked against the existing polygon; nearby and dated search both reject outside locations, including Putrajaya.
