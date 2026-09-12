# Published preview browser verification

Checked on 2026-09-12, approximately 15:05–15:10 UTC, in the Codex in-app browser at `https://equalpath-web.appwrite.network/`. This is an actual browser interaction check against the Appwrite-hosted release, using the public live catalog.

- Active source commit: `c8625a4fa4e799f6727cc9fb3a9a8bf88ca03c7a`.
- Source digest served over normal HTTPS: `3758a296adfde649eada757a14e8bac140272accc935538e3b99eef651ccaf90`.
- Connected catalog: 3,122 regional records; the map displayed `MAP CONNECTED · 2D` and OpenStreetMap attribution.
- Pickup: name search for `EDWETHINK`, then selected the returned institution.
- Request: 2026-09-14, collect by 17:00, care until 19:00; age and transport preference unspecified.

| Check                  | Observed result                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find care options      | 983 candidates: 68 with coordinates within the radius, plus 915 records without coordinates. The page explains why distances cannot be checked for those records.                                                                                              |
| List and map           | First page lists 20 institutions and renders 20 numbered pins plus pickup marker P. Clicking the IVEY list item changes the selected institution. Clicking the distinct Tiny Tots map pin changes the selected institution and brings its list card into view. |
| Visual layout          | Search/map and enquiry screenshots inspected at the browser's existing 1280 × 720 viewport. Flat map, muted palette, selected card and comparison tray render; enquiry content is scrollable.                                                                  |
| Conditions and sources | EDWETHINK details show seven conditions requiring confirmation, the separate published business hours source, imported JKM record and validity dates, and unavailable one-off fees.                                                                            |
| Compare                | Selected EDWETHINK and International Village of Early Years (IVEY). The comparison displays seven factors, addresses, business hours, registration evidence, fee basis and per-institution question preparation.                                               |
| Evidence distinction   | EDWETHINK shows a matched imported JKM record. IVEY shows a directory claim with official KPM verification outstanding. General business hours do not establish temporary-care acceptance.                                                                     |
| Prepare contact        | EDWETHINK generates nine selected questions with institution name, requested date and times, a source-backed phone link and source-page links.                                                                                                                 |
| Reorder and copy       | Moved the fees question above transfer duration. Clicking Copy questions displayed `Questions copied` and `Copied with the institution and request details.`                                                                                                   |

No phone link was activated and no message was sent. Location permission was not requested during this publishing check. Clipboard success above is the browser's observed status; clipboard contents were not independently read back.

Map limitation observed: very close institutions can have overlapping pins at the initial overview zoom. The IVEY pin was partly covered by the selected EDWETHINK pin; selecting IVEY through the list works. The independent Tiny Tots pin verified the map-to-list selection path.

This preview check does not establish that `equalpathcare.me` HTTPS is ready. Both custom-domain certificate requests were still in progress at this check time; the corresponding GitHub production verification gate remained failed.
