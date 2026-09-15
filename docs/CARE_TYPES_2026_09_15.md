# Regular childcare and short-term care — 15 September 2026

The search starts with “Need care for a few hours?”. “No, regular care” is the default; only location is required, with optional child age and pickup preference. “Yes, short-term care” reveals the existing required date, collect-by and care-until fields. Changing the choice clears results, map selection, comparison, questions and preparation so the two collections cannot be mixed. Location, age and pickup preference remain available.

The public Appwrite catalogue currently contains 3,137 providers. The published profile snapshot `profiles_de193ab0981745497c2fea47` contains exactly 101 provider IDs; short-term search uses those IDs and regular search uses the remaining 3,036. Collection membership is checked before distance, nearest-page selection, contact priority and conflict-last ranking. Short-term care is limited to 5 km and 10 results per page, including nearby discovery. Regular care retains its default 10 km maximum (optional 5 km) and 20 results per page. The API enforces these limits even for legacy or oversized requests. A nearby search and explicit detail/comparison lookups enforce the same membership. A short-care search will usually show fewer than 101 because the radius remains in effect.

The profile snapshot is a coursework research collection, not confirmation that every branch accepts short visits. It includes 21 published-service entries and 80 with no such confirmation. A single coursework collection notice appears in short-term search. Existing admission evidence, requirements, unknowns, fee provenance and registration facts are unchanged. No owner records are written by this feature.

Regular assessments check age and requested pickup/coverage only. They do not add temporary-admission, date-specific care-hour or collection-deadline conflicts. Weekly published hours remain available in details. Enquiry copy asks about enrolment and programme costs, and preparation can be generated without a service date or an invented duration. Short-term assessments retain their existing dated checks.

Browser-local templates retain care type. Regular templates contain no care times; dated templates require a fresh date on reuse. Existing templates without a type keep their former short-term behavior. Favourite reopening uses current collection membership when available, including saves from before this split. Nearby cache keys include care type, and sequence guards reject late responses after switching.

The function deployment package includes the new profile-evidence reader. It validates membership count, payload identity, schema, hash, unique IDs and catalogue presence. Missing or modified membership fails closed instead of returning the whole directory. Profile-only manifest changes invalidate catalogue and result versions.

## Verification

- Public readback: all 101 IDs matched the previously imported profile snapshot exactly; 3,036 regular plus 101 short-term equals 3,137, with no overlap.
- Unit coverage: validation without dates, hidden-value removal, disjoint map/search/detail/compare pools, absent-membership failure, non-dated enquiries/exports, template type and cache separation, profile tampering, 101-row pagination and profile-only cache invalidation.
- Desktop and 390 px mobile journeys: regular search, details, enquiries, preparation, comparison, switching, short-term required fields, both saved-template types, no horizontal overflow or JavaScript errors.
- `npm run release`: all 160 unit checks pass; the isolated function package imports successfully and the production bundle passes asset checks.
- Browser regression: 59 distinct scenarios pass across the complete run and focused rerun. The six old assertions affected by the new default/wording were corrected and verified; the focused final run passed 23/23, including delayed-response isolation.
- Public query function deployment `6aa91f3c64cedca7a77e` reached `ready`. Local journey screenshots and live readbacks are stored in `.build/care-types/`.

## Follow-up: short-care search limits

- Added boundary coverage just inside/outside 5 km, invalid locations, oversized/legacy requests, four-page exhaustion without repeats, independent regular-care limits and cache normalization. All 161 unit checks pass.
- Desktop/mobile checks cover switching, saved searches, 10-item pagination and its final partial page, map pins, conflict/contact priority, and the unchanged regular 5/10 km selection. Evidence is saved in `.build/short-care-limits/`.

## Follow-up: short-stay fees

Short-term search and comparison say “Lowest fee”. Shared presentation filters hide monthly, term and annual programme fees and extras from short-stay prices. Published hourly, per-visit, per-session and daily care rates keep their original billing periods. Only the existing complete, validated rule can produce an estimated visit total; missing short-stay rates show “Ask the centre”. Provider source data is preserved.

Price priority groups estimated totals, hourly, visit, session and daily fees, then compares the lowest starting amount within each group. Missing prices cannot win, monthly fees are not converted, and comparison ties must use the same period. The ordering explanation states this grouping. Regular childcare retains monthly pricing. Unit checks cover mixed periods, monthly-only records, ranges, extras, foreign currencies, unknown rates, estimated totals and API search/comparison behavior.

Final follow-up verification: all 164 unit checks and 17 relevant browser scenarios pass (including the corrected fee-row locator rerun). Live radius readback at KL Sentral returned 12 short-care matches in 5 km, split 10 + 2, while regular care retained 379 matches within 10 km and 20 per page. Final release evidence is under `.build/short-care-limits/` and `.build/short-care-fees/`.

## Follow-up: unavailable sorting

Search and comparison now resolve unavailable priorities to Nearest first before ordering results or choosing suggestions. The response request, ordering metadata and comparison menu agree on that effective sort. Availability uses the actual nearest page or selected comparison centres. If only a later page has a quote, the current page says “No fees on this page.” rather than claiming no quotes exist nearby; choosing a priority on a later page preserves that page. Other concise reasons include “No fees listed nearby.”, “No fees listed.”, “No hours for this date.” and “No pickup service listed.”. Foreign-currency rates explain the lack of comparable MYR fees.

Regression coverage includes changing to a location without quotes, removing the last quoted comparison centre, a priced later page, all-monthly short-care records, missing regular monthly rates, absent hours/pickup, foreign currencies and empty results. Disabled reasons remain readable on small screens and disabled clicks cannot trigger a search. Evidence is stored in `.build/sort-availability/`.

Sort-availability validation: 168 unit checks and 12 relevant browser scenarios passed, including desktop/mobile location changes, removing the quoted comparison centre, and sorting a later page. The production bundle and isolated function package also pass release checks.
