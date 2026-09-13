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

The Function is deployed and anonymous calls have been read back successfully. The subsequent authorised website release is hosted at `https://equalpath-web.appwrite.network/` with GitHub-triggered deployment for `Cheolhwi/equalpath-web`. Custom-domain TLS is a separate release gate; do not infer its status from a successful default-domain check. The old functions remain unchanged.

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
| `places` | mode, query | up to 10 OSM/Photon address/place candidates with coordinates; partial names, typo tolerance and Malay road abbreviations; independent of the childcare catalog |
| `reverse` | mode, point `{lat,lng}` | nearest named OSM street within 1 km, or null; returns the original pickup coordinates with a street/locality label; independent of the catalog |
| `nearby` | mode, center `{lat,lng}`, optional radius 5/10 | nearest 20 located public childcare records within radius (default and maximum 10 km), total count and catalog version; no date/time/fit required or inferred |
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

Times are on one day in Asia/Kuala_Lumpur. Age is completed age 0–6 or empty; no birth date is collected. `transport` is `institution`, `self` or empty. `radius` is 5 or 10 km; it defaults to 10 km. Both `search` and `nearby` enforce a maximum of 10 km. Legacy null, omitted, invalid and larger radius values normalize to 10 km, never unlimited. Radius and distance sorting use straight-line distance; `driving` is a separate road-network estimate and road distance can exceed the search radius. Records without usable coordinates and records outside the radius are excluded before counts, ordering, pagination, suggestions and routing. `missingLocations` remains zero for search responses for compatibility. An empty neighbourhood stays empty; there is no automatic radius expansion. Explicit saved-provider detail and comparison lookups remain available by ID. All known conflicts rank below non-conflicts before pagination. Pickup coordinates are checked against KL and Selangor polygons; Putrajaya is excluded before the Selangor test. Province/coordinate disagreements and unresolved linked JKM branches are withheld.

## Evidence model

`request.sort` accepts `distance`, `price`, `closing`, `pickup` or `name`. Price means lowest MYR monthly programme fee (the starting amount for ranges), including explicitly labelled area budgets. Exclude meal, transport, registration, deposit, annual and late-pickup extras. Other currencies, billing periods and missing monthly fees sort last within the same conflict group; no hourly/annual conversion is invented. Conflict grouping still precedes price and pagination. `ordering.available.price` indicates whether comparable monthly data exists. At most three located, conflict-free, monthly-priced results receive map/list suggestions; comparison highlights the lowest priced eligible option, including ties.

Result cards expose registration provenance through a small clickable icon. An imported official JKM record, a directory-listed KPM number and an expired/future/unresolved registration have different labels. The icon opens the number and its source; it does not imply current availability or quality approval. Demo and numberless/source-less records receive no government-registration icon.

Each fact has a source object with label, URL, retrieval date, source date where available, and kind. Source-less fields stay null. Registration provenance, separately obtained address/phone, business hours, temporary care, pickup coverage, fee basis and actual acceptance are different facts.

Fees can additionally arrive through a versioned `fees_*` snapshot in `web_provider_evidence`. Validate its record identities, count and hash before applying; `fees_release` participates in catalogue versions and cache invalidation. Each fee preserves programme/kind, billing basis, verification attribution, retrieval/publication dates and optional original source/document links. School-reported directory data is distinct from independent provider evidence. Named care programmes take precedence over a directory-wide min/max that may include meal add-ons; extras stay separate. Existing KPM codes are shown as listed codes with their directory source, not as independent official-register verification.

Budget references have `verification: area_estimate` and `source_kind: area_fee_reference`, with sample count, provider IDs, source URLs, scope and method. These are labelled `Estimated` in result cards and fee details/comparison. Clients request them with `features: ["area-fees-v1"]`; older cached browser builds receive only the existing fee facts so they cannot mislabel new estimates. They never create a provider quote, acceptance claim or hourly fee rule. At least five distinct same-type providers with bounded published monthly prices are required; district is preferred, then region, then KL/Selangor. Subsidised operator rates, estimates, extras and starting-only prices are excluded from samples. Fee evidence pages use six concurrent reads and keep full snapshot/hash checks and the existing catalogue cache.

Hours evidence may include `unscoped_windows` when an official source supplies clock times without weekdays. These become `businessHours.publishedSchedule` for display; they do not pass a dated care check. Separately sourced weekly hours fill missing weekdays while retaining conflicting observations. Malay `PG`/`PTG` and `tengahari` are understood.

Condition states are `supported`, `conflict`, `unknown`, each with a reason and source where applicable. Transfer/arrival still needs confirmation: the separately displayed driving estimate excludes handover and live traffic. Revision 2.1 uses published opening hours for care-end timing, with specific care schedules, closed days and date exceptions taking precedence. Contact displays a sourced phone number without invoking a device dialler. Monthly charges cannot produce an hourly total. A tariff total is available only for a complete validated fee rule; current real records have none.

The 2026-09-13 age revision adds `reference` for a confirmed official type range when the optional child age is unselected. It displays `Confirmed range`, has `requestMatch: not_selected`, and is counted separately from passed fit checks and questions to confirm. With an age selected, type-range comparison returns `supported` / `conflict` with `within_type_range` / `outside_type_range`; `basis: type_reference` and the official source remain explicit. The display honours a condition's optional `statusLabel`. Temporary admission and availability are separate checks; no provider confirmation is recorded by this range calculation.

Requests and comparisons carry canonical request and fact version. A supplied obsolete fact version returns `FACTS_CHANGED`; partial refreshes never replace a complete cached release. Retrieval success is not a provider update timestamp.

## Boundaries and errors

- Inner JSON body: maximum 12,000 characters; only seven allowlisted actions.
- Public pickup and keyword labels are bounded by the canonical request. Place query: 100 characters, maximum 10 results.
- Search page: 20 records, page index 0–1000; comparison: maximum three unique IDs.
- Store: public rows in pages of 100, six concurrent reads, release count and uniqueness checks, second manifest check, one-minute in-memory cache and coalesced refresh.
- Browser timeout: 75 seconds. Function runtime timeout: 120 seconds. Application errors include `INVALID_REQUEST`, `OUTSIDE_SERVICE_AREA`, `PLACE_UNAVAILABLE`, `FACTS_CHANGED`, `SERVICE_UNAVAILABLE`, `REQUEST_TOO_LARGE` and `UNKNOWN_ACTION`.
- Per-client sustained-load thresholds and unauthorised-operator publication tests remain release checks; no untested rate-limit claim is made.
- The source fetcher uses fixed Appwrite URLs. A user-supplied URL is never fetched server-side. External evidence links are sanitized; imported text is rendered by React.
- No raw request logging, parent identity storage or source modification. Device location is requested only after a button click. Selecting a pickup point loads nearby centres and stores only the last pickup point/map centre/zoom in this browser, as requested on 2026-09-13. Date, time, age, fit results and provider records are not automatically persisted. Returning visits fetch fresh nearby records; saved templates still require a new date. Live template points are region-validated by `nearby`, not matched against childcare names.

Reverse lookup runs only for a selected/restored coordinate with a generic label; pan and zoom do not trigger it. Forward and reverse Photon calls share the bounded sequential queue (1.1 seconds between starts, at most eight jobs, 512 cached entries, 24-hour TTL). Reverse cache keys use five decimal places, but every response preserves the caller's exact coordinates. `EQUALPATH_PHOTON_REVERSE_URL` can replace the endpoint. Address failures keep the pickup usable and offer retry. Old `Map point` browser entries gain a street label after a successful lookup. The [Photon reverse API](https://github.com/komoot/photon/blob/master/docs/api-v1.md#reverse) returns nearby street information rather than certifying an exact building address.

### OSM place lookup (2026-09-13)

The live geocoder is [Photon](https://github.com/komoot/photon), an OSM-based service with partial-name, multilingual and typo matching. It accepts `Jln`, `Tmn` and `Kg` abbreviations after expansion. The browser only searches on Enter/search-button activation (minimum two characters). All results are checked against the existing KL/Selangor polygon; Putrajaya and other states are excluded. No centre-name restriction or category filter is applied. Candidates include OSM identifiers, labels, address and source, and require explicit selection.

`EQUALPATH_PHOTON_URL` on the Function can replace the default `https://photon.komoot.io/api/` with a compatible hosted/private instance without a frontend release. Per warm runtime, searches are cached for 24 hours (512 keys), identical in-flight searches are coalesced, outbound starts are spaced by at least 1.1 s, and the pending queue is bounded at eight. Upstream 10 s timeout/failure is surfaced without provider-name or demo fallback. No query coordinates from the user's device are forwarded to Photon; the geographic bias is a fixed KL centre. Public endpoint availability is not guaranteed and high traffic requires a dedicated instance. Runtime throttling is not a global multi-instance quota. See [Photon usage and API](https://github.com/komoot/photon/blob/master/docs/api-v1.md). The UI credits OpenStreetMap and Photon.

The price-sort revision keeps the existing range-first pipeline: geographic inclusion → condition checks → conflict grouping and selected priority → at most 20 results per page. It does not choose 20 records from the whole region and filter afterwards. In-scope conflicting records can remain in the result set, rank after non-conflicts, and appear as muted, selectable map pins. JKM and KPM use an identical check-seal icon; their provenance is distinguished by the disclosure text, not different institution icons.
