# Regular childcare and short-term care — 15 September 2026

The search starts with “Need care for a few hours?”. “No, regular care” is the default; only location is required, with optional child age and pickup preference. “Yes, short-term care” reveals the existing required date, collect-by and care-until fields. Changing the choice clears results, map selection, comparison, questions and preparation so the two collections cannot be mixed. Location, age and pickup preference remain available.

The public Appwrite catalogue currently contains 3,137 providers. The published profile snapshot `profiles_de193ab0981745497c2fea47` contains exactly 101 provider IDs; short-term search uses those IDs and regular search uses the remaining 3,036. Collection membership is checked before the existing maximum 10 km distance, nearest-20 page selection, contact priority and conflict-last ranking. A nearby search and explicit detail/comparison lookups enforce the same membership. A short-care search will usually show fewer than 101 because the radius remains in effect.

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
