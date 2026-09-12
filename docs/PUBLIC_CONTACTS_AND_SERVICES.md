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

`scripts/publish-provider-services.mjs` defaults to a dry run. `--publish` appends a content-addressed `services_*` snapshot to the existing public `web_provider_evidence` table, reads every batch back, and only then updates the `services_release`, `services_hash` and `services_count` fields of the current manifest. It preserves the base catalogue and independent `hours_*` snapshot. Owner tables, reviews and registration rows are not changed.

The public read-only function validates snapshot count, identity, base release, source URLs and hash before serving it. The service snapshot and implementation version participate in cache/fact versioning. An incomplete or tampered snapshot fails closed.

Local source evidence and publication receipts are under `../webapp-data/source/services-20260913/`. Raw crawl pages are not shipped in the static website.

## Validation

`tests/services-import.test.mjs` covers approved WhatsApp hosts and sanitized destinations; compact Malay hours and day headings; preserved existing facts; source/branch isolation; snapshot completeness/hash checks; transport versus route confirmation; disputed hours; additional weekdays; and specific-care precedence. Desktop and 390 × 844 mobile QA checks contact visibility and source links without opening a WhatsApp conversation.

The existing controlled-example mode contains clearly fictional evening-care scenarios. No invented hours or pickup guarantees are attached to live institutions.
