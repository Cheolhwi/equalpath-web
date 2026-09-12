# Opening-hours coverage — 13 September 2026

The live directory now has sourced opening windows for **1,350 of 3,122 usable KL/Selangor records (43.2%)**, up from 1,255. This is **95 additional institutions**, not a claim that most missing records have been completed. Monday has a window for 1,329 institutions; 42 institutions have at least one published closing later than 19:00, up from 32. Days without evidence remain unknown.

The earlier “three institutions” figure concerned fee enrichment, not the scope of opening-hour checks. All usable sourced opening hours participate in care-end checks. Admission, pickup coverage and current capacity remain separately checked.

## Evidence and remaining collection

- The 95 additions use 69 Waze place observations and 26 preserved Google Maps search snapshots. Google evidence must match the previously accepted branch identity and place ID. Waze uses address/name/region matching, or the exact already-verified Google place ID with compatible name and corroborating coordinates. Conflicting house numbers are not accepted.
- 606 unique mapped places were queued from usable records missing hours. The batch produced 442 place observations and two pages without place details. One place returned HTTP 429; 161 were not attempted. A single retry after five minutes with one worker at lower frequency also received HTTP 429, so collection stopped.
- Eighteen candidate observations were withheld for unresolved branch matching or incompatible source hours. A partial weekday source is not expanded to seven days. Displayed 24-hour entries are parsed only when explicitly present in a matched source; they do not prove overnight admission.
- Official website pages inspected in the previous crawl contain hours for some operators, but several have branch-address differences or conflicting closing times. These were not copied to unrelated records.
- There is no invented “Malaysia default” in the live directory. The separate controlled-example mode now has 10 fictional institutions: nine have hours, two illustrate care until 21:00 or 22:00, and one retains deliberately unknown conditions.

## Appwrite publication

The unchanged base catalogue is `web_79f1397603c1e28325955f64`. The additive hours snapshot is `hours_13c0a865faf974e8c2f9a556`.

Snapshots are appended to the existing public `equalpath.web_provider_evidence` table, using `wh_` row IDs and a separate `release_id`. All 95 rows were read back before adding `hours_release`, `hours_hash` and `hours_count` to the `web_data_releases/current` payload. Old catalogue/evidence versions, reviews, JKM reference snapshots and private owner tables are unchanged.

The query adapter validates the complete count, per-provider identity, base version, source, intervals and content hash. Its cache/version incorporates the hours snapshot, and rejects a manifest that changes during loading. Existing sourced hours cannot be overwritten by this gap-fill overlay. API errors never substitute demo data.

## Website behavior

Cards state the requested weekday. A missing selected-day entry says “Not listed for this day” when other weekdays are known; completely missing hours still say “Not published”. The details panel offers a seven-day opening-hours table. Closing-time ranking and care-end checks use the selected day, preserving specific care schedules and date exceptions.

## Verification

- 60 automated checks pass, including Malay `sehingga`/English `to` ranges, Unicode Google clocks, closed/unknown days, split shifts, explicitly displayed 24-hour entries, invalid/hash-mismatched snapshots, cache refresh under the same base release, and exact care-end boundaries.
- Production build and entry assets validated.
- Anonymous Appwrite health returned the new hours snapshot version; direct public readback counted 1,350 institutions with windows.
- In the 390 × 844 browser journey, a 21:00 request correctly supports the fictional Moonlight hours and displays all seven days without horizontal clipping.
- In the 1440 × 900 browser journey, live TASKA DAMANSARA UTAMA showed sourced Monday 07:00–20:30, supported the 20:30 care end, and retained unknown weekends in its weekly table.
- The independent custom-domain certificate problem is outside this update; do not interpret the existing custom-domain CI verification failure as a failed data import.

Local collection/preparation/publishing commands live in `scripts/*provider-hours.mjs`. Public observations, full per-provider review details, inactive candidates and the CSV are in the sibling `webapp-data/hours-coverage-20260913` directory. The compact checked-in receipt is `evidence/hours-enrichment/verification.json`.
