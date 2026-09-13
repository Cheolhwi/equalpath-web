# Public contact and service enrichment

The live directory now supports explicit WhatsApp contact links, sourced institutional transport claims and additional weekday opening-hour observations. The existing phone display and external contact flow remain available. Nothing sends a message, confirms admission, or books care on the user's behalf.

## Sources and matching

- `scripts/collect-provider-services.mjs` follows public Kiddy123 KL/Selangor nursery, infant-care and daycare directory pagination. It retrieves compatible-name candidates, caches source HTML and records hashes/timestamps. Pagination duplicates, access limits and challenges are recorded; access limits stop the run.
- `scripts/collect-website-contacts.mjs` reads websites already linked in the catalogue, with bounded response sizes and per-host pacing. Only explicit WhatsApp destinations qualify automatically. A number explicitly labelled WhatsApp in page text may be added after source review. An ordinary phone number is never converted into a WhatsApp claim.
- `scripts/prepare-provider-services.mjs` requires compatible names plus street-address/phone corroboration for directory branch facts. Conflicting house/unit numbers, unrelated service categories and ambiguous matches are withheld. Website enquiry numbers require a same-host response and compatible brand title, and are explicitly scoped as website enquiries which may serve multiple branches.
- Source facts describe published services. Transport availability does not imply coverage of the requested pickup place, a collection deadline, or a free seat. Missing service claims remain unknown.

## Hours

Published opening hours are the fallback care window, as requested for Revision 2.1. Named English/Malay weekdays, abbreviations, `pagi`, `petang` and `malam` are normalized. Missing weekdays and invalid/overnight-looking ranges do not receive invented days or clocks.

Additional observations fill previously unknown weekdays with their own source. Original hours and phone facts are preserved. When sources disagree, both schedules remain inspectable: a requested end covered by both remains supported, an end excluded by both conflicts, and an end with different outcomes needs confirmation. Specific care schedules and date exceptions retain precedence. Conflicting opening schedules are excluded from later-closing priority.

## Appwrite publication

### Admission ages and care-end display (2026-09-13)

The user's latest revision requests visible admission ages for every institution and `Care end time` in place of business-hour ranges. Cards, details, comparison and sorting now use the selected day's closing time. The weekly view uses the week containing the request date, preserving specific care schedules, date exceptions, conflicting sources and earlier collection cutoffs.

`shared/published-ages.mjs` parses English/Malay admission-age fields, including `tahun`, `bulan`, decimal years and mixed month/year ranges. Source wording and retrieval dates remain available. The service preparer extracts only `Student Age Group` from the exact matched Kiddy123 branch page; generic directory category descriptions do not become institution facts.

The new service snapshot adds 23 branch age observations. Of 3,122 usable institutions, 53 now have published institution ages and 3,069 display a type reference (1,068 TASKA, 2,001 TADIKA). TASKA uses [the KPWKM under-four definition](https://www.kpwkm.gov.my/portal-main/list-services?type=taman-asuhan-kanak-kanak); TADIKA uses [the KPM 4–6 preschool reference](https://www.moe.gov.my/matlamat-pendidikan-prasekolah). References are derived at query time and never written as provider-confirmed admission facts. Under the latest user-approved status revision, a verified official type range displays `Confirmed range`. An unselected optional age is a separate reference state and does not add an enquiry or a passed fit check. A selected age is compared directly with the type range; an out-of-range age displays `Outside type range`. Specific published ages take precedence; different branch age sources remain visible. Temporary admission remains an independent check.

Verified snapshot: `services_93cc3b562c6e94ee19a475f0`; public function deployment: `6aa605d2c4eab288e47f`. All 3,122 normalized records were read back against local evidence, and eight public-function requests passed. Contact and hours coverage stayed unchanged: 1,947 phone numbers, 106 institutions with WhatsApp, 1,354 with at least one published day. `tests/admission-ages.test.mjs` and `tests/care-hours.test.mjs` cover these revisions; the complete suite has 73 passing tests.

`scripts/publish-provider-services.mjs` defaults to a dry run. `--publish` appends a content-addressed `services_*` snapshot to the existing public `web_provider_evidence` table, reads every batch back, and only then updates the `services_release`, `services_hash` and `services_count` fields of the current manifest. It preserves the base catalogue and independent `hours_*` snapshot. Owner tables, reviews and registration rows are not changed.

The public read-only function validates snapshot count, identity, base release, source URLs and hash before serving it. The service snapshot and implementation version participate in cache/fact versioning. An incomplete or tampered snapshot fails closed.

Local source evidence and publication receipts are under `../webapp-data/source/services-20260913/`. Raw crawl pages are not shipped in the static website.

## Validation

`tests/services-import.test.mjs` covers approved WhatsApp hosts and sanitized destinations; compact Malay hours and day headings; preserved existing facts; source/branch isolation; snapshot completeness/hash checks; transport versus route confirmation; disputed hours; additional weekdays; and specific-care precedence. Desktop and 390 × 844 mobile QA checks contact visibility and source links without opening a WhatsApp conversation.

The existing controlled-example mode contains clearly fictional evening-care scenarios. No invented hours or pickup guarantees are attached to live institutions.
