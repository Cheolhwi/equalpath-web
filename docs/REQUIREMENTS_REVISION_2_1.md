# Revision 2.1 — 13 September 2026

The user's instructions supersede the earlier business-hours and phone acceptance restrictions. Scope remains phases 0–3, with 46 stories / 114 acceptance criteria overall and 43 criteria in Epics 1–3.

## Approved changes

- Published opening hours supply the default care-end window for the requested weekday. A specific care schedule takes precedence. Missing schedules or unresolved date exceptions remain unknown; published closed days conflict. Admission, transport coverage and vacancies are separate checks.
- Malay weekday names and clock phrases are translated before conservative normalization. For example, `6.45 pagi` is 06:45 and `6.00 petang` is 18:00. Text without weekdays does not create a weekly schedule, and previously excluded estimated days remain excluded.
- Contact preparation displays the sourced institution phone number and enquiry list. Opening a phone dialler or testing an actual call is no longer required.
- AC 2.4.1, 2.4.2, 3.7.1 and 3.7.3, the D2/D3 guidance and the example walkthrough were revised accordingly. No acceptance IDs were renumbered. The ledger distinguishes implementation checks from remaining data-dependent work.

The canonical Word file remains `../design artifacts/EqualPath_WebApp_Epics_User_Stories_DOD.docx` relative to the web repository. The original Revision 2 is preserved in `../design artifacts/archive/EqualPath_WebApp_Epics_User_Stories_DOD_Revision2.docx`. Its original SHA-256 is `5c0e04b3d156107166986f98411f4d8b085f1add744141cf05333ed984c1bda9`.

## Fee collection and publication

`scripts/collect-provider-prices.mjs` visited 120 seed URLs and their limited same-host links: 205 page attempts, 185 retrieved pages and 20 unavailable pages. Eighteen pages contain currency candidates; this is not a count of verified childcare prices.

The captured text and crawl manifest are in the sibling data folder `../webapp-data/source/fees-hours-20260913/`. Candidates are reviewed against institution identity and branch address before publication. No authentication, private pages or Google login is used by this collector.

Fifteen reviewed fee entries were added for three existing catalog records:

| Institution | Published basis | Source |
| --- | --- | --- |
| TASKA RISING STARS, USJ 13 | Seven programme/monthly, yearly registration and overtime entries | [Official admissions](https://risingstars.my/admissions/) |
| Childrens Discovery House, Jalan Damai | Four operator-guide entries: registration, deposit and term-fee ranges | [Official fees](https://childrensdiscoveryhouse.com/fees-term-dates/) |
| Children's Discovery House iZen, Mont Kiara | The same four operator-guide entries, explicitly requiring branch/programme confirmation | [Official fees](https://childrensdiscoveryhouse.com/fees-term-dates/) |

The supplement `server/data/reviewed-fees.json` preserves source links, retrieval dates, content hashes and fee conditions. It is packaged into the public query Function; the existing catalog rows and owner data are unchanged. Local integration with the current public Appwrite release yields 3,122 usable institutions, including 63 with some published fee information.

Monthly/term prices are not divided into invented one-off hourly prices. Overtime charges are not base care rates. Older 2025 estimates, ambiguous hourly products, unmatched branch addresses, platform subscriptions and unrelated directory destinations were withheld. A complete real one-off tariff is still a data gap for AC 3.5.3.

## Landing artwork update

The five user-supplied Robin illustrations replace the previous four covers. ImageGen produced ivory/sage/warm-grey color adaptations; these are edited derivatives, not pixel-identical filters. Unchanged supplied originals and edited masters are retained under `design-assets/childcare-gallery/robin-v3/`.

The runtime uses five versioned WebP textures: READ, PLAY, CREATE, GROW and BUILD. The existing CD scene, manual navigation, autoplay reversal, pause, reduced motion and short entrance remain. The counter now derives its total from the collection length.

## Verification

The canonical Word document renders to 31 pages. All-page overview inspection and full-size checks of pages 1, 9, 11 and 29 found no clipped text or overlap. Browser and release verification for this change are recorded separately under `evidence/robin-v3/`.

The custom-domain certificate issue is a separate existing deployment gate. A successful local build does not establish that `equalpathcare.me` has working TLS; verify the default Appwrite site and the custom domain separately.
