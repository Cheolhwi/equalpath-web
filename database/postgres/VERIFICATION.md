# Local edition verification

Verified on 11 October 2026 using Node.js, Python 3 and PostgreSQL 18 on macOS.
Base website revision: `30f1f96b4fa6ceb159840f7649f4f72e707b0764`.

- `npm ci --ignore-scripts`: completed.
- `npm run release`: 391 tests passed; production build and packaged build validation passed. This command only verifies/builds; no production deployment was performed.
- `npm run local:setup`: initialized a separate PostgreSQL cluster and imported all data; a second invocation passed without duplicate rows.
- `npm run local:test`: exact source-field parity, prepared runtime document parity, all image sizes and SHA-256 hashes, SQL joins, API health, reviews and unknown-provider rejection passed.
- Python export regression tests: two passed, covering capped Appwrite totals and duplicate IDs.
- Real local browser: searched by date, child age and care hours; opened institution details and 112 parent reviews; opened street photographs and switched views; compared two centres. Inspected desktop (1440 × 900) and narrow layouts. Images and API data came from the local edition.

| Local table | Rows |
| --- | ---: |
| web_provider_catalog | 3,539 |
| web_provider_reviews | 11,501 |
| web_provider_evidence | 8,121 |
| web_provider_photos | 98 |
| web_data_releases | 1 |
| storage_files | 276 |
| provider_photo_files | 282 |
| runtime_documents | 104 |

The runtime short-care pool contains 101 providers. SQL views produced 11,657 catalogue-to-review links, 8,091 catalogue-to-evidence links and 282 image associations. Shared review sources explain why link counts differ from source row counts.

External map and road-routing services are still required for those features. Routing was unavailable for some search requests and became available in comparison; the UI displayed unavailable times instead of invented values. This verification establishes a working local application, not complete offline map support or a production release.

Reproduce database verification with `npm run local:test` and exporter regression tests with `python3 -m unittest discover -s database/postgres/tests -p '*_test.py'`. Screenshots and machine-specific database files remain in the ignored `.local` directory.
