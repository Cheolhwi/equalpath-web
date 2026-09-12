# Phase 0–3 interface and resource contract

Contract: `equalpath-web-p03-v1`. Public client configuration contains no secret.

## Existing infrastructure

| Item | Value |
| --- | --- |
| Appwrite endpoint | `https://sgp.cloud.appwrite.io/v1` |
| Project | `6a916a6c0030a70a9d75` |
| Database | `equalpath` |
| New Function | `web-provider-query`, Node 22, anonymous execute `any`, scopes `[]`, logging disabled |
| Live source release | `web_79f1397603c1e28325955f64` |
| Normalized fact version | release + `service-review-2026-09-12-v2` |
| Browser query entry | `POST /v1/functions/web-provider-query/executions` |
| Website preview | `http://127.0.0.1:4179/` |

The new Function is deployed and anonymous calls have been read back successfully. No separate website Site or new domain rule has been created. The existing generated `.appwrite.network` domains were inventoried; their bindings and the nine old functions were left unchanged. This delivery is a local website with a deployed Appwrite backend, not a claim of a newly published production website.

The Function reads only anonymous public rows in `web_data_releases` and `web_provider_catalog`. It uses no API key, owner identifiers, account/session API or old planner endpoints. The existing `web_provider_evidence`, `web_provider_reviews` and `web_institution_sources` remain separate published resources. No new parent-data table is required for phases 0–3.

## Wire format

The browser uses the [Appwrite synchronous execution API](https://appwrite.io/docs/references/cloud/client-web/functions#createExecution), with `X-Appwrite-Project` and `Content-Type: application/json`. Credentials are omitted. No login cookie or key is required for this Function.

```json
{
  "body": "{\"action\":\"health\",\"mode\":\"live\"}",
  "async": false,
  "method": "POST",
  "path": "/",
  "headers": { "content-type": "application/json" }
}
```

The Appwrite response envelope is parsed from `responseBody`. Application errors retain their own code and status within that envelope. A local adapter at `/api` accepts the same inner JSON directly when explicitly configured for development.

| Action | Input | Output |
| --- | --- | --- |
| `health` | mode | contract, mode, version, release, accepted / withheld counts, regions, distance basis |
| `places` | mode, query | up to 10 sourced public pickup candidates with coordinates |
| `search` | mode, request, page | 20 candidates per page, applied request, counts, condition checks, cost availability, ordering explanation |
| `details` | mode, request, id, optional version | one branch, source facts, registration, conditions and questions |
| `compare` | mode, request, 1–3 unique ids, optional version | independent branch facts assessed under the same request, ordered by the selected factor |

UI comparison requires at least two candidates. `mode` is exactly `live` or `demo`; data and IDs cannot cross modes. No publication, mutation, booking or messaging action exists.

```json
{
  "pickup": { "id": null, "label": "Public pickup place", "lat": 3.139, "lng": 101.6869 },
  "date": "2026-09-14", "deadline": "16:00", "end": "18:00",
  "age": "4", "transport": "institution", "radius": 5,
  "query": "", "includeUnknown": true, "includeConflicts": true,
  "sort": "distance"
}
```

Times are on one day in Asia/Kuala_Lumpur. Age is completed age 0–6 or empty; no birth date is collected. `transport` is `institution`, `self` or empty. `radius` is 5, 10, 25, 50 km or null. Distances are straight-line only. A location without coordinates is retained with an explicit limitation, even under a radius filter, and sorts after located candidates. Pickup coordinates are checked against KL and Selangor polygons; Putrajaya is excluded before the Selangor test. Province/coordinate disagreements and unresolved linked JKM branches are withheld.

## Evidence model

Each fact has a source object with label, URL, retrieval date, source date where available, and kind. Source-less fields stay null. Registration provenance, separately obtained address/phone, business hours, temporary care, pickup coverage, fee basis and actual acceptance are different facts.

Condition states are `supported`, `conflict`, `unknown`, each with a reason and source where applicable. Transfer/arrival remains unknown: this requirements baseline has no route-time calculation. Known business hours cannot satisfy temporary-care end-time checks. Monthly charges cannot produce an hourly total. A tariff total is available only for a complete validated fee rule; current real records have none.

Requests and comparisons carry canonical request and fact version. A supplied obsolete fact version returns `FACTS_CHANGED`; partial refreshes never replace a complete cached release. Retrieval success is not a provider update timestamp.

## Boundaries and errors

- Inner JSON body: maximum 12,000 characters; only five allowlisted actions.
- Public pickup and keyword labels are bounded by the canonical request. Place query: 100 characters, maximum 10 results.
- Search page: 20 records, page index 0–1000; comparison: maximum three unique IDs.
- Store: public rows in pages of 100, six concurrent reads, release count and uniqueness checks, second manifest check, one-minute in-memory cache and coalesced refresh.
- Browser timeout: 75 seconds. Function runtime timeout: 120 seconds. Application errors include `INVALID_REQUEST`, `OUTSIDE_SERVICE_AREA`, `PLACE_UNAVAILABLE`, `FACTS_CHANGED`, `SERVICE_UNAVAILABLE`, `REQUEST_TOO_LARGE` and `UNKNOWN_ACTION`.
- Per-client sustained-load thresholds and unauthorised-operator publication tests remain release checks; no untested rate-limit claim is made.
- The source fetcher uses fixed Appwrite URLs. A user-supplied URL is never fetched server-side. External evidence links are sanitized; imported text is rendered by React.
- No raw request logging, parent identity storage or source modification. Current location is requested only after a button click, kept in active-page state, and included in the current query only when the user submits it.
