# KL and Selangor short-care research — 15 September 2026

The requested target is approximately 100 physical locations offering care for a short visit, limited to Kuala Lumpur and Selangor. **This research has not established 100 qualifying locations.** The prepared increment consists of two new locations and new admission evidence for one existing centre. The service count includes appointment-based, daily holiday and supervised activity services, each with its actual restrictions.

Live verification completed at **2026-09-15T05:32:03Z**: 3,135 → 3,137 catalogue locations; 18 → 21 locations with published short-care evidence. All three affected locations appeared on their nearby production search page. The other 3,134 existing providers and held records were unchanged; Adam Uwais retained all non-admission fields. Nine relevant import/additions tests passed. No frontend or function deployment was needed.

## This increment

| Location | Evidence and service | Data treatment |
| --- | --- | --- |
| [Taska Adam Uwais, Kelana Jaya](https://explore.anak2u.com.my/details/taska-adam-uwais-kelana-jaya-2112) | The branch profile expressly offers ad-hoc childcare for children who are not enrolled. | Existing address match at No. 8 Jalan SS 5B/3; admission evidence only. Profile last updated in 2019, so current service and visit arrangements must be reconfirmed. Existing registration, phone, fees, hours and ages are preserved. |
| [Taska Ibu Elisa, Cheras](https://explore.anak2u.com.my/details/taska-ibu-elisa-2694) | The profile lists temporary care by the hour or day. | New location, phone 016-375 7990. Service description dates from 2021. The matching current map and Daycare.my listing agree on No. 2 Jalan 12/4D; the older service profile shows 10-2. This discrepancy is retained. No current registration or weekly schedule is invented. |
| [Edu Talent, Setia Alam](https://www.newpages.com.my/v2/bm/company/732546/product/429238/5393569/Study-Life-Balance-Holiday-Activities.html) | Provider-authored holiday programme dated 9 April 2025 lists a daily drop-in option supervised by educators. | One location across four adjacent unit numbers, phone 011-1196 9385. Clearly limited to holiday programme dates. Exact age, session hours and fees remain unspecified. |

## Search coverage and limits

The public Anak2U directory endpoint returned 1,230 profiles. Of these, 657 were labelled Kuala Lumpur or Selangor. All 657 profile descriptions were scanned for English and Malay terms covering ad-hoc, drop-in, hourly, temporary, occasional and emergency care. Thirteen profiles matched a keyword; manual review found only the two explicit short-care descriptions above. Other matches referred to ordinary daily activities or flexible learning, rather than temporary care. Absence of a keyword does **not** prove that a centre refuses short visits.

The public interface and its published data endpoint were captured with timestamps and SHA-256 hashes. The two service profiles keep the readable profile URL, exact capture URL, original profile update date and retrieval date. The directory's repeated default fee field was not treated as a published childcare price.

Further named-provider searches covered provider sites, Kiddy123, public social-post mirrors, Newpages, directory listings and map profiles. Earlier captured provider websites were also searched for relevant service terms. The geographic scope was not widened to reach the target.

Unresolved leads include Little Human Scholars (conflicting service/branch addresses), Taska Edora (hourly-care evidence at an older address), Taska Keluarga Cemerlang (daily-care wording but contact/location verification incomplete), and brand-level flexible programmes at Cherie Hearts, Kids Campus and Taska Oren. Their branch counts are not added to the published-service total without matching service evidence. Recurring preschool schedules, parent-accompanied programmes, unopened branches and babysitter profiles are not counted as physical one-off childcare locations.

## Evidence and verification

- Review: `data/short-care-research-20260915.json`.
- Cumulative additions: `data/prepared-short-care-research-20260915.json` — 15 locations, retaining the previous 13.
- Cumulative admission reviews: `data/prepared-short-care-admissions-research-20260915.json` — 14 reviews, retaining the previous 13.
- Captures and full directory audit: `../webapp-data/source/short-care-100-20260915/`.
- Live verification: `evidence/short-care-research-publication.json`.

Preparation and both publishers use the existing versioned public evidence workflow. No owner tables, existing base catalogue records, unrelated snapshots, registration badges or fees are overwritten. Source-linked service requirements keep the temporary-care question open for the actual date; a published programme does not promise a place on that date.

Repeatable checks:

```sh
node --test tests/admissions-import.test.mjs tests/provider-additions.test.mjs
node scripts/verify-short-care-research.mjs
```

The live verifier compares every existing provider against the before snapshot, checks the two appended locations and the admission-only update, then queries the public production search API at each affected location. It verifies the 20-result page limit, preserved fees, service-specific questions, unknown capacity and absence of invented registration badges.
