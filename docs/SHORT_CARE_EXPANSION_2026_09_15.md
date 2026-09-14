# Short-care directory expansion — 15 September 2026

The user authorised adding providers outside the original imported register catalogue, provided their public material describes care for a few hours. This release adds seven physical branches; it does not replace existing provider rows or change any owner resources.

| New branch | Public service | Published fees | Timing evidence |
| --- | --- | --- | --- |
| Learning Fresh, Mont Kiara | Hourly weekday/weekend and evening care | MYR 40 / weekday hour, 50 / weekend hour, 60 / evening hour | Specific session schedule, including Night Owl |
| Learning Fresh, Damansara Heights | Hourly After-School Club | MYR 40 / weekday hour, 50 / weekend hour | Weekdays and Saturday; Sunday campus applicability unresolved |
| Learning Fresh, KLCC | Hourly After-School Club | MYR 40 / weekday hour, 50 / weekend hour | Weekdays and Saturday; Sunday campus applicability unresolved |
| iKid House, Bandar Puteri | Occasional drop-in, selectable days/hours | Not published | No unambiguous clock schedule collected |
| Lullabee, Old Klang Road | Hourly drop-in | MYR 120 listed, billing period unstated | Monday–Friday 07:30–19:00 |
| Kinder Mindz, Kepong | Drop-in care | Not published | Monday–Friday 07:30–18:30 |
| Kasih Nilly Nursery, Cheras | Hourly, one-day and weekly care | Not published | Monday–Friday 07:30–18:30 |

All seven have sourced phone numbers and matched coordinates inside the service area. Learning Fresh and Lullabee use shared provider enquiry numbers where branch-specific numbers were not published. Kasih Nilly's address identifies the Warisan Cityview complex; the exact unit/entrance remains a question for the provider.

## Sources and identity checks

- [Learning Fresh hourly service](https://learningfresh.org/after-school-club), [campus contacts](https://learningfresh.org/contact-us), and [Mont Kiara's published sessions](https://learningfresh.setmore.com/). The current service page explicitly names all three campuses. Its embedded KLCC map contains US coordinates; those were rejected and replaced with the Google Maps branch whose name, B-9-7 address, phone and website match. Evening times from Mont Kiara's booking page are not copied to other branches. The school's general age descriptions differ, so no hourly-session age range is invented.
- [iKid House drop-in description](https://www.ikidhouse.org/features/flexible-scheduling/) and [branch contact](https://www.ikidhouse.org/inquiry/), including its own map link. This is not the iKids Cyberjaya record.
- [Lullabee hourly service](https://www.lullabee.com.my/showproducts/productid/6370391/hourly-drop-in/), [branch contacts](https://www.lullabee.com.my/contactus/) and [FAQ](https://www.lullabee.com.my/faq/). Old Klang Road is separate from the existing Puchong / Taska Pondok Indah record. RM120 has no stated duration and is never interpreted as an hourly price. Public-holiday closure is retained as a note.
- [Kinder Mindz drop-in/contact FAQ](https://kindermindz.com/index.php/contact/) and [clear age wording on its About page](https://kindermindz.com/index.php/about-us-kinder-mindz/). Exact Block C address, phone and website match its map record.
- [Kasih Nilly's August 2026 public nursery posts](https://www.findglocal.com/MY/Kuala-Lumpur/489301524892396/Kasih-Nilly-Nursery) and [provider contact/location links](https://linktr.ee/kasihnillynursery). The social posts are attributed as a mirror, not presented as an independent inspection. Coordinates use the destination of the provider's directions link, not its starting point.

Public HTML captures, timestamps and SHA-256 hashes are in `../webapp-data/source/temporary-care-expansion-20260915/`. The checked-in reviewed facts and fully materialised snapshot are `data/short-care-additions-20260915.json` and `data/prepared-short-care-additions-20260915.json`.

## Leads deliberately not counted

- Little Human Scholars publishes hourly care, but its service-page address, embedded map and current playschool map identify different streets. No guessed map pin is added.
- Baby Angels says its opening is November 2026 and licensing is pending; it is not an available option on this review date.
- Little Playhouse's rendered FAQ offers daily/weekly/monthly short-term packages with at least one week's notice. Half-day hours are fixed mornings. This is an advance-booking lead, not evidence of on-demand hourly care.
- Beyond Kids Montessori has a company-level backup-care description but no completed current branch match.
- Iman Child Centre's non-regular care is outside KL/Selangor. Home-visit babysitter platforms and unrelated play/class listings are not imported as childcare centres.

## Publication and verification

The content-addressed `additions_*` release is stored in the existing public `web_provider_evidence` table and referenced by additional fields in `web_data_releases/current`. The historical base count remains unchanged; additions are applied after all existing overlays. Every row is read back before activation, and a changed manifest aborts activation. Hash, ID/identity uniqueness, sources, region, contact, age, schedule and admission scope are checked before loading.

New profiles use the `CHILDCARE` category without inventing KPM/JKM registration, official age defaults or registration badges. The published short-care service passes the service check; same-day acceptance, vacancy, notice and the final charge still require contact. Existing distance limits, nearest-20 page membership, conflict ordering and recommendation rules are preserved.

Verification passed: 148 unit tests, a production build and 10 targeted desktop/mobile browser tests (using the installed Chrome). `evidence/provider-additions-publication.json` records live verification of all seven new nearby search results, unchanged facts for all 3,122 existing providers and unchanged held records. The live directory now has 3,129 visible branches, of which 11 have explicit published temporary-care evidence (previously four). This is a count of published service descriptions, not live vacancies.
