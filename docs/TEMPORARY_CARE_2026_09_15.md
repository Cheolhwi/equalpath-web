# Temporary childcare evidence — 15 September 2026

The user requested evidence for bringing a child to a centre for a few hours on a one-off basis. This enrichment targets existing public catalogue branches. It does not contact providers, create bookings or modify owner resources.

## Reviewed coverage

The pre-publication live catalogue contains 3,122 visible providers. It had one explicit hourly-care record (Little Whale) and one flexi-care description (Tree Dolphin). The new snapshot contains 12 matched provider records:

| Branch | Public evidence | Interpretation |
| --- | --- | --- |
| TASKA PONDOK INDAH / Lullabee, Puchong Jaya | [Hourly drop-in](https://www.lullabee.com.my/showproducts/productid/6370391/hourly-drop-in/) and [operator naming](https://www.lullabee.com.my/ourproducts/cid/642545/cat/hourly-dropin/) | Published hourly drop-in. Exact 16A Jalan Kenari 1 address and operator identity matched. |
| Little Feetrah, Seksyen 8, Bangi | [Employer profile](https://www.maukerja.my/company/little-feetrah-child-care-centre) | Published drop-in care; exact name and No. 2 Jalan 8/3 address matched. |
| Little Whale, Semenyih | [Branch directory](https://www.carischools.com/school/little-whale-child-care-centre-selangor) | Existing hourly-care evidence refreshed and stored in the database. |
| Bonda Mama Sayang, Sentrovue A, Puncak Alam | [Dated public post mirror](https://www.schoolandcollegelistings.com/MY/Puncak-Alam/101855019147237/Taska-Bonda-Mama-Sayang-Sentrovue-A%2C-PP-Alam-Jaya%2C-Puncak-Alam%2C-Selangor) | A 3 October 2025 post advertises temporary weekday care for errands, with registration first. The age, minimum stay and continued offer need checking. |
| Cherie Hearts, Kota Damansara | [Flexi Care](https://www.cheriehearts.com.my/programmes), [branch](https://www.cheriehearts.com.my/branches/kota-damansara) | Brand advertises a few hours for ages 2 months–6 years; branch-specific single-visit/new-child acceptance unresolved. |
| Cherie Hearts, Kota Kemuning | [Flexi Care](https://www.cheriehearts.com.my/programmes), [branch](https://www.cheriehearts.com.my/branches/kota-kemuning) | Same brand-level qualification; not treated as branch confirmation. |
| Kids Campus, Campus 6, Shah Alam | [Childcare programmes](https://www.kidscampus.my/childcare/) | Brand lists 2–3 hours from 10:00 for preschool ages 4–6 and transit ages 5–15. Campus and non-enrolled admission unresolved. |
| Kids Campus, Campus 7, Shah Alam | [Childcare programmes](https://www.kidscampus.my/childcare/) | Same qualification. |
| Kids Campus, HTAR, Klang | [Childcare programmes](https://www.kidscampus.my/childcare/) | Same qualification. No assumption that hospital-associated care is open to every family. |
| Tree Dolphin, Ara Damansara | [Kiddy123 article](https://www.kiddy123.com/article/tree-dolphin-childcare-centre-ara-damansara-3/) | Flexi/weekend care exists in the description; one-off visits for non-enrolled children unresolved. |
| Orange Tree, Wisma TA | [Curriculum](https://orangetreepreschool.com.my/curriculum/) | Paid extensions to preschool/holiday care are not proof of standalone drop-in admission. |
| Human StarChild, Lalaport | [Official notice](https://humanstarchild.com/) | 4 September 2026 notice pauses new Kuala Lumpur enrolments. Whether temporary visits are included remains unknown. |

Result: **4 published temporary/hourly care descriptions, 7 related programme descriptions requiring a specific admission question, and 1 admissions-pause notice**. This is evidence coverage, not a count of centres with vacancies or a guarantee of same-day acceptance. No missing policy is converted to “not offered”.

The admission wording is intentionally specific. A published hourly service does not establish notice, minimum duration, age eligibility, exact dates or final price. Existing age, care-hours, capacity and fee checks remain independent. RM120 on Lullabee's page is not imported as an hourly price because the page does not specify the billing unit and also says pricing varies.

## Collection and matching

- Scanned the 271 previously captured provider website texts for explicit short-care terms, alongside targeted English/Malay web research. This was not a new crawl of all 3,122 providers.
- Fetched 20 targeted public URLs: 19 successful HTTP responses, one origin 403. Raw HTML is not always the rendered evidence: CariSchool serves its branch details after JavaScript runs.
- Independently checked Little Whale and Little Feetrah in the browser. Saved short observed excerpts with `rendered_browser_excerpt` provenance; the earlier generic HTML and failed HTTP response remain in the collection history.
- Exact provider ID, registered name, branch address/operator identity, source type, capture hash, retrieval timestamp and known publication date are recorded.
- Nine unmerged research leads are listed in `data/admissions-review-20260915.json`, including Little Human Scholars, iKid House, Lullabee Old Klang Road, Kinder Mindz and Baby Angels. Their claims were not attached to similarly named existing records. Taska Ceria's blog is in Miri and is excluded from the service area.
- Never infer one-off care from ordinary daycare, half-day enrolment, overtime fees, hourly staff wages, home babysitting or a registration number.

## Publication and application

`prepare-provider-admissions.mjs` validates captures and reviewed identity, then creates a content-addressed `admissions_*` release. `publish-provider-admissions.mjs` defaults to dry-run; with explicit `--publish` it writes only new `web_provider_evidence` rows and updates the public `web_data_releases/current` payload after exact readback. It preserves base catalogue, hours, contacts/services, fees and owner tables. A changed manifest aborts activation.

The public query function checks count, hash, release and row identity before applying the new descriptions. Admission-only manifest changes invalidate its cache and provider fact version. Details, comparison and enquiry generation consume the same assessed facts. Programme-only evidence remains unknown with a tailored question. Same-day acceptance and places available remain unknown.

Local evidence directory: `../webapp-data/source/temporary-care-20260915/` contains baseline snapshots, captures, prepared records, publication receipt and verification results. The checked-in review contains public facts and matching rationale, without credentials or personal data.

## Verified release

- Public evidence release: `admissions_175b46b920fc9c6eebcfd6ea`. All 12 rows were read back exactly before the manifest was activated.
- Public query deployment: `6aa84ffd0c604c76caa0`, verified ready. A fresh anonymous public query returned the new admissions release.
- Live verification retained all 3,122 visible providers, the held-provider count, every non-admission provider fact and all other manifest fields. Unreviewed admission descriptions and sources were unchanged.
- The public comparison response independently checked Lullabee (published), Cherie Hearts Kota Damansara (programme-only) and Human StarChild (pause notice). Each returned the correct source and state; unresolved admissions returned the tailored question and all three retained an availability question.
- Validation: 143 unit tests and five desktop/mobile browser tests passed. Browser tests use controlled fixtures; the separate public-response check verifies the real published records. See `evidence/admissions-publication.json` for the compact live verification record.
