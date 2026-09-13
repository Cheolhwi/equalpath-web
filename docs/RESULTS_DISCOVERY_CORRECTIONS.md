# Discovery, result priority and driving — 2026-09-13

## User-visible changes

- Panning/zooming saves the viewport without querying nearby childcare. **Search this area** requires zoom 12 or closer and movement of at least 500 m from the loaded area. A previously saved wide map also waits for zoom-in and explicit refresh. Selecting a pickup place and first loading a neighbourhood remain automatic. The browse button is disabled during an active request.
- Nearby calls share pending requests and a 60-second, 32-entry browser-memory cache keyed by mode/radius and approximately 100 m cells. No new persistent search history is written.
- Search and comparison put known conflicts below all results without a known conflict, before pagination. Fewer conflicts rank ahead of more conflicts; the chosen sort applies within that group. Lower-priority cards explain their status.
- At most three mapped, conflict-free centres per result page are marked **Suggested first** on both map and list. Relevant supported checks rank first, distance breaks ties. Unselected age and unrequested institutional pickup do not inflate the score. These are suggestions to check, not accepted bookings. Other pins remain selectable.
- Result cards show driving minutes from the applied pickup location and road distance, separately from straight-line distance. Details and comparison retain the same estimate.
- Cards show the published fee range with its original hour/visit/month/etc. basis. Distinct bases are not combined into a total. Complete validated demo tariffs can show an estimated total; missing real fees say **Ask the centre**. Existing fee source links and programme restrictions remain in details.

## Route service and limits

The existing public read-only `web-provider-query` Function uses the [OSRM table service](https://project-osrm.org/docs/v5.24.0/api/#table-service), by default at [FOSSGIS routing](https://routing.openstreetmap.de/about.html). It sends only pickup and selected centre coordinates, never request labels, age, dates or contacts. A configurable `EQUALPATH_WEB_ROUTING_URL` can replace this with a compatible dedicated service.

Each explicit live search page requests at most 20 routes in one table; details/comparison reuse cached pairs. Nearby browsing and the tutorial's fictional search never call routing. Per warm runtime: one sequential outbound queue, 1.1 seconds between starts, at most three jobs, six-second upstream timeout, 4,000 cached pairs, 24-hour successful TTL and 30-second failure cooldown. This is not a global multi-instance quota or an unlimited-capacity service.

Road estimates have no live traffic and are not arrival guarantees. Unreachable routes, missing coordinates, route failures and snaps over 500 m remain unavailable. No straight-line speed fallback is used. A route failure does not discard provider search results. The website credits OSRM/OpenStreetMap and links to the provider's privacy/usage information.

## Verification inventory

- Count backend calls during repeated far-out zooming/panning, reload and explicit refresh.
- Check conflict groups across page boundaries and each secondary sort.
- Confirm suggestions exclude conflicts/unmapped centres, match map/list IDs and preserve independent selected pins.
- Exercise batched routing, coalescing, pair reuse, null routes, distant snaps, failure cooldown/recovery, and fee bases.
- Visually inspect result cards and map controls at desktop and 390-pixel mobile widths; rerun tutorial, saved choices and preparation journeys.
- Verify the actual new Function with a KL search, then confirm the published frontend source and online result cards.

The custom-domain TLS issue remains separate. Old Appwrite owner resources, DNS, contacts and external messages are unchanged.

## Verified delivery

- 103 unit tests and 21 browser journeys passed. After the final marker-layer adjustment, all three affected browser journeys and the full unit/build release check passed again.
- Function deployment `6aa63f4be6f680bb89d6` was read back as ready. A live KL Sentral request returned 20 road estimates, three conflict-free suggestions and two records with published fees on the first page. The first listed fee was MYR 500–780/month; a monthly tariff remains distinct from a one-off visit quote.
- Evidence is under `evidence/results-discovery-2026-09-13/`.
- Mobile map entry now refits the results after resizing. All eight affected result/tutorial browser journeys passed again, including a check that all three suggested pins fit within the mobile viewport. The original 21-test suite and 103 unit tests remain the verified baseline.
- Co-located suggestions now fan out with fine connector lines to their unchanged geographic point. The four result journeys passed, including individual clicks on three co-located mobile suggestions; the other ten map/tutorial journeys passed during the same correction. Pickup markers cannot intercept pointer events. Unit/build checks passed again.
- Frontend source digest: `9c81102583aa978d57cef92859720e33ff68c76ce52775ce85339aa96f6b0bd4`.
