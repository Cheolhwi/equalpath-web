# Epic 7 — See the centre (I3 scope)

Status on 8 October 2026. Scope decisions from the user: capture date shown small in the enlarged photo; 7.4 not built; 7.2/7.3 later from an OpenStreetMap snapshot.

| AC | Status | Where |
|---|---|---|
| 7.1.1 Source, location and capture date, or date unknown stated | Done. Enlarged view: "Google Street View · Captured Month Year" or "Capture date not recorded", and "Taken on the street near <address>". Thumbnail shows the source only. | `src/Surroundings.jsx` |
| 7.1.2 Nearby street image vs verified entrance view | Done. Thumbnail label "Nearby street"; enlarged view says "It isn't a confirmed view of the entrance." No image is presented as an entrance. | `src/Surroundings.jsx` |
| 7.1.3 No imagery: keep address and map, explain | Done. "No street photo yet — use the address and the map", with Show on map (closes Details and selects the centre). | `src/Surroundings.jsx`, `src/App.jsx` |
| 7.2.1–7.2.3 Arrival map | Not started. Needs an OSM snapshot (entrances, parking, stopping places, one-way streets, LRT/MRT) per short-care centre. Overpass is reachable from the browser, not from the build shell. | — |
| 7.3.1–7.3.3 Arrival directions into Contact/Checklist | Not started; depends on 7.2. | — |
| 7.4.1–7.4.3 Centre photographs | Not in this release (user decision). | — |
| 7.5.1 Personal flag: branch, item, type, note; revisit, edit, remove | Done. Items: address, place on the map, each street view. "Flag this view" in the photo viewer preselects the view. | `src/ArrivalFlags.jsx`, `shared/arrival-flags.mjs` |
| 7.5.2 Kept after refresh; explains no sync; failed write keeps previous state | Kept after refresh and failed-write handling done and tested. The "saved only in this browser / doesn’t sync" note was removed from the page at the user’s request (8 Oct 2026), so the explanation part of this AC is not shown (`tests/arrival-flags.test.mjs`; browser check: reload keeps the flag, a blocked write shows an error and leaves the list unchanged). | `src/arrival-flag-store.js` |
| 7.5.3 Not sent to a server, public info unchanged | Done. No network code. Clear local cache removes flags with other `equalpath:` data. | — |
