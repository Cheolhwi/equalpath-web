# Fees and care hours — 13 September 2026

The user requested wider fee and opening-hour coverage for the KL/Selangor childcare directory. Publication is limited to the new public `web_` resources. Existing owner data and domains are unchanged.

## Coverage

The visible catalogue contains 3,122 centres. The prepared fee release covers **3,116 centres**: **137 have sourced fee information**, and **2,979 have an explicitly labelled Estimated monthly budget reference**. These are not 3,116 individual school quotations. Six unpriced public/subsidised operators are excluded from private-care estimates.

The fee snapshot contains 3,146 provider evidence rows / 3,343 fee facts, including records held from public discovery by existing geography checks. Its source-only subset contains 167 rows / 364 facts. Thirty MAIWP records remain held because their district mapping has not been resolved; collection does not bypass catalogue eligibility checks.

Published hours are available for **1,375 visible centres**; **1,357** have at least one weekday-associated interval. Previously 1,354 had weekday-associated hours. The current evidence snapshot contains 170 rows and adds 28 known open-day intervals. These counts do not imply complete weekly schedules or confirmed availability on a requested date.

## Collection and matching

- Checked all 3,644 active, non-demo public CariSchool profiles in KL/Selangor. There are 142 profiles with structured fee information; 73 match existing visible records by exact source profile and school code/name.
- Checked 381 unique linked website roots / 539 fetched pages, with 88 recorded failures. Reused the existing Kiddy123 collection containing 1,476 listing pages; 23 fee-bearing pages matched reviewed branches.
- Added reviewed provider tariffs for ten branches, plus the three previously reviewed provider-website tariffs. Branch names and addresses must agree; brand-wide prices are not silently copied to unrelated branches.
- The official MAIWP 2026 PDF contains 70 institutions, including 61 in KL. Fifty-eight matched existing branches; three address mismatches and nine Labuan/Putrajaya entries were excluded. Its registration and nationality/eligibility-based monthly rates remain separate. The PDF's 07:30–12:30 programme hours do not specify weekdays and are retained as a general schedule, not a dated care check.
- Completed all 606 queued public Waze place checks. Reviewed website hours for fourteen branches, including Malay `pagi`, `petang`, `PG`, `PTG` and `tengahari` expressions. Existing known hours and disagreements are preserved. Office hours, event times and unmatched branches are excluded.
- Holy Light's `450` is a submission-form placeholder, not a published fee. It is not imported. Meal, transport, registration, annual, deposit and late-pickup charges remain separate from programme prices. Starting prices retain “From”; unspecified billing periods remain unspecified.
- A listed KPM number is displayed as **KPM code listed** with its source. This does not claim an independent official-register verification.

## Budget-reference method

Use source-priced centres of the same category (TASKA or TADIKA), preferring the same district, then the same state, then KL/Selangor. A pool needs at least five distinct providers. This release has 83 distinct sample providers.

Exclude public/subsidised operators, earlier estimates, open-ended starting prices and ancillary charges from the sample. Each provider contributes one bounded monthly programme-price range. Use the 25th percentile of lower prices and 75th percentile of upper prices, rounded outwards to MYR 50. This is an area budget range, not a claim about comparable quality or this centre's quote.

Store sample IDs, count, scope, source links, evidence date and a sample hash with each reference. Never overwrite an existing price or create hourly/one-off totals from monthly references. Search cards, comparison and details label these values **Estimated**. Details explain the sample and link to evidence. Clients must advertise `area-fees-v1`; older browser builds receive no area-reference fees so cached UI cannot mislabel them as published prices.

## Repeatable publication

1. `node scripts/collect-directory-fees.mjs` collects public profiles into `../webapp-data/source/directory-fees-20260913/` with a count/hash manifest.
2. `node scripts/prepare-named-fees.mjs` prepares the reviewed branch and official-operator facts. `node scripts/prepare-directory-fees.mjs` merges them and computes budget references, producing `prepared-fees.json` and `unmatched.json`.
3. `node scripts/publish-directory-fees.mjs` validates and previews the write; `--publish` writes content-addressed evidence rows, reads every row back, then activates only the fee fields in the existing manifest. A concurrent manifest change aborts activation. The base catalogue and hours/services releases are preserved.
4. Hours use `collect-provider-hours.mjs`, `prepare-provider-hours.mjs`, `prepare-named-hours.mjs`, then `publish-provider-hours.mjs --publish`. Existing verified Google observations are reused unless explicitly refreshed.
5. The API validates the complete snapshots and hashes. Release IDs participate in cache and saved-data versions. Partial or modified snapshots are rejected.

Fee release: `fees_9e6b8a50381b09144e1b4299` (SHA-256 `9e6b8a50381b09144e1b4299760e60f5f80f257e5d6eea73754ffaa7be688469`). Hours release: `hours_07097222eb15319e14097448` (SHA-256 `07097222eb15319e14097448bc55e2b3ab48d32953524fe84f516d7b1ac3cb95`). Local publication receipts sit alongside each prepared snapshot under `../webapp-data/`.

Sources include [MAIWP 2026 fees and hours](https://www.maiwp.gov.my/assets/PDF/publication/tawaran/permatamaiwp.pdf), [SBC programme fees](https://www.sbckindergarten.com/plans-pricing), [Qaleesh care hours](https://qaleeshcare.com/contact.html), [Cahaya Hati hours](https://www.tadikacahayahati.com/site/contact), [CariSchool Holy Light](https://www.carischools.com/school/tadika-holy-light-zon-bangsarpudu-kuala-lumpur), and the branch URLs in the reviewed source manifests.

## Verification

Unit tests cover branch matching, placeholder exclusion, fee units, source preservation, minimum reference samples, source isolation, old-client compatibility, complete-snapshot validation and Malay hours. Browser tests cover fee summaries, programme/extras breakdowns, KPM headings and Estimated labels. The full existing 30-case browser journey suite also passes. Live publication is verified by row readback and an anonymous API request; the release evidence records the activated versions and resulting coverage.
