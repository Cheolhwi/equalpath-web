# Short-care directory expansion, second pass — 15 September 2026

The user requested more physical locations where a parent can leave a child for a short visit. This pass adds six locations and attaches published hourly-care evidence to the existing KleverCape record. It preserves the previous seven additions and all twelve earlier admission reviews.

Live read-back and public search checks completed at 2026-09-14T20:52:15Z: **3,129 → 3,135 visible locations**, and **11 → 18 locations with a published temporary-care service**. This broader service count includes advance-booked daily childcare and supervised play/art drop-off; it does not mean eighteen centres accept immediate walk-ins. All seven affected locations appeared on their own nearby twenty-result page. The other 3,128 existing providers and held records were unchanged; KleverCape's other fields were preserved.

## Reviewed locations

| Location | Published service | Published charge | Conditions to check before attending |
| --- | --- | --- | --- |
| [KleverCape, Kota Damansara](https://klevercape.my/programe/) — existing record | Hourly childcare, ages 1–4 | Ask the centre | Weekdays 08:00–18:00; agree age, slot, minimum stay and price. Matched by street address and phone rather than creating a duplicate. |
| [Little Playhouse, Jalan Mesra / KLCC](https://littleplayhouse.com.my/locations/klcc) | Daily, weekly or monthly temporary childcare | MYR 160–200/day by programme | At least one week advance notice; subject to capacity. Half day uses 08:00–12:00. |
| [Little Playhouse, Menara Shell / KL Sentral](https://littleplayhouse.com.my/locations/kl-sentral) | Same operator's short-term childcare | MYR 160–200/day by programme | Same notice requirement; this is a separately located and contactable campus. |
| [Little Playhouse, KL Eco City](https://littleplayhouse.com.my/locations/kl-eco-city) | Same operator's short-term childcare | MYR 160–200/day by programme | Same notice requirement; this is a separately located and contactable campus. |
| [We Rock the Spectrum, Taman Desa](https://werockthespectrumtamandesa.com/drop-off/) | Supervised gym drop-off, ages 3–13 | MYR 60/hour at 1:4 or MYR 80/hour at 1:1 | 1–3 hours; at least one day advance booking; toilet training and forms required. Operator explicitly says it is **not a licensed daycare**. |
| [TOY8, The Gardens Mall](https://www.toyeight.com/playground) | Staff-supervised Child Drop-off Service | Ask for drop-off price | Reserve the separate supervised service; ordinary admission requires a parent to stay. Agree age, duration and session hours. |
| [Limoncito, Bukit Tunku](https://limoncitoart.com/art-programs/art-drop/) | Supervised Art Drop, ages 5–10 | MYR 80/hour | Maximum three hours; walk-ins subject to space. Art Drop has shorter hours than the studio. |

Little Playhouse's [FAQ](https://littleplayhouse.com.my/faq) was opened and its short-term answer expanded in the browser. Its [pricing page](https://littleplayhouse.com.my/pricing) was also verified in the rendered browser: infant care/playgroup MYR 200/day, KG1 MYR 180/day, KG2 and reception MYR 160/day. Other enrolment charges must be checked; these are not hourly prices or final visit totals. The public page asset containing the rendered FAQ, fees and campus map data is hash-captured, with its parent page retained as the reader-facing source.

## Scope and data quality

- Six new branches are absent from the earlier catalogue by name, street address and phone. All have public contacts and sourced coordinates; five have published short-care fees.
- Three Little Playhouse campuses are advance-booked temporary childcare. The three supervised play/art locations meet the parent-can-leave use case but are not presented as registered TASKA/TADIKA. No government badge or type-default age is invented.
- The old We Rock the Spectrum Bangsar domain redirects to Taman Desa. It is counted once. Limoncito's Art Drop page names Bukit Tunku, so Mont Kiara is not counted as another Art Drop location.
- TOY8 ordinary playground/therapy prices and general venue opening hours are not used as supervised-care rates or service hours.
- Little Human Scholars remains a lead: the stated drop-in address, embedded preschool map and separate playschool map disagree. No wrong-address duplicate was added.
- Brand flexi programmes, older Taska Oren reports, employer-only services, parent-accompanied activities and future openings are recorded as leads, not counted as current unrestricted hourly centres.

## Behaviour

Published service existence remains distinct from acceptance of this specific visit. Optional, sourced `requirements` retain advance notice, maximum stay, toilet training and separate-service booking rules. These records retain a question on the temporary-care check instead of producing an unconditional match. The questions page carries the provider's contextual question and explains which requirement it relates to. All records keep capacity and same-day acceptance unresolved.

The additions validator now accepts a published `day` fee basis. Existing monthly-price sorting does not turn day/hour fees into a monthly price. Programme-specific Art Drop hours take precedence over longer general studio hours.

## Repeatable publication

Research captures are under `../webapp-data/source/temporary-care-deeper-20260915/`. The checked-in review, cumulative records and evidence receipts are:

- `data/short-care-deeper-20260915.json`
- `data/prepared-short-care-deeper-20260915.json` — thirteen additions: seven retained, six new.
- `data/prepared-short-care-admissions-deeper-20260915.json` — thirteen admission reviews: twelve retained, one new.
- `evidence/short-care-deeper-publication.json` — live count, preservation and per-location search verification.

Preparation:

```sh
node scripts/prepare-provider-additions.mjs --evidence-dir=webapp-data/source/temporary-care-deeper-20260915 --review=webapp/data/short-care-deeper-20260915.json --previous=webapp/data/prepared-short-care-additions-20260915.json --output=webapp/data/prepared-short-care-deeper-20260915.json
```

Both publishers default to a dry run, accept the same `--evidence-dir`, and only publish with `--publish`. They verify the expected prior snapshot, write versioned public evidence, read back exact payloads, check for intervening manifest changes, then activate the pointer. Previous owner resources and unrelated overlays remain untouched.

Verification: `npm test`, `npm run release`, and `node scripts/verify-short-care-deeper.mjs`. The live verifier checks existing fields, all retained providers, counts, fee units, practical conditions, public search membership and the twenty-result page limit.

The release passed all 152 unit tests, the isolated API-package check and the production build. API deployment `6aa85d16f125c7bffddd` is ready and active. Published snapshots are `additions_a8727db3b492c2eb95f4f25f` and `admissions_e480fff022a03f57e29e68d8`.
