# EqualPath Web

Find childcare that fits your day.

EqualPath is a no-login childcare discovery and care-preparation web app for families in Kuala Lumpur and Selangor. Start with a pickup or care need, find nearby centres, review published conditions, compare options, and prepare the questions and checklist needed before contacting a provider.

[Production](https://equalpathcare.me/) · [Appwrite preview](https://equalpath-web.appwrite.network/) · [Controlled demo](https://equalpathcare.me/?mode=demo) · [Open search directly](https://equalpathcare.me/#discover)

The controlled demo uses clearly labelled fictional centres to demonstrate supported, conflicting, unknown, and complete-fee scenarios. A failed live request never falls back silently to demo data.

## Two ways to search

| | Regular childcare | Short-term care |
| --- | --- | --- |
| Best for | Ongoing or recurring childcare | A few hours, one day, or another short stay |
| Required | Pickup location | Pickup location, date, collect-by time, and care-until time |
| Optional | Child's age and centre-pickup preference | Child's age and centre-pickup preference |
| Search area | 5 km or 10 km; up to 20 results per page | Fixed 5 km radius; up to 10 results per page |
| Fee display | Comparable MYR monthly fees; area budgets are labelled `Estimated` | Hourly, per-visit, per-session, daily, or a complete-rule visit total; monthly fees are never converted into hourly prices |

As of 15 September 2026, the published catalogue contains 3,137 available centres: 3,036 in regular-childcare search and 101 in the separate short-term-care coursework research collection. Only 21 of those 101 locations have published evidence of a short-care service. Collection membership does not mean that a branch accepts the current request or has space on a particular day.

## What you can do

1. Enter through a five-image childcare gallery or open `/#discover` directly.
2. Search for a general OpenStreetMap place, request your current location, or drag and confirm a pickup point on the flat map.
3. Choose regular childcare or short-term care and search with the minimum information required for that care type.
4. Review care end time, age range, estimated road travel, fees, pickup service, and registration provenance.
5. Open each condition to see whether it is `supported`, a `conflict`, `unknown`, or a `reference`. Known conflicts are surfaced first.
6. Compare up to three centres and sort by distance, fee, care-end time, or pickup service. If the selected priority lacks enough data, the app returns to Nearest first and explains why.
7. Generate questions linked to the exact conditions that need confirmation. Phone, WhatsApp, and source-page actions are always opened explicitly by the user.
8. Save centres or reusable search templates in the current browser, then refresh the published facts before using them again. Templates never restore a date or child age automatically.
9. Create a `Get ready for care` checklist with a three-stop pickup plan, grouped questions, a packing list, and a printable or downloadable standalone HTML copy.

First-time visitors receive a skippable, replayable walkthrough. Its example inputs run only in controlled demo mode, and the user's original search state is restored afterwards. The interface also supports keyboard navigation, reduced motion, responsive layouts, and a compact mobile map card.

## Search and evidence rules

- The service area is limited to Kuala Lumpur and Selangor. Locations are checked again on the server, and Putrajaya is not treated as part of Selangor.
- Each page is selected by straight-line proximity first. Known conflicts are then placed after non-conflicting results, and the chosen priority is applied within that page. The interface does not present straight-line distance as road distance.
- Road travel is an OSRM estimate. It does not include live traffic, handover time, provider capacity, or acceptance.
- Recommendations prefer contactable centres without known conflicts, but this does not replace a nearer page member with a farther centre or imply that anyone has been contacted.
- Fees retain their published currency, billing period, range, extras, and source. Missing or incomparable values remain unknown.
- JKM and KPM indicators describe the provenance of a record or directory code. They do not prove current operation, quality, vacancy, or acceptance for this request.
- Published business hours may support a care-end check but do not establish a temporary-care window. Specific care schedules, date exceptions, and source conflicts take precedence and remain visible.
- A public listing, programme description, or short-care statement cannot establish date-specific capacity, final price, pickup coverage, or provider agreement.

## Privacy and product boundary

EqualPath requires no account and does not collect a child's name, date of birth, health information, or family relationships. By default, it does not save service dates, care times, age, results, or contact outcomes.

Centres and templates are saved only after an explicit user action, remain in the current browser, and are separated between live and demo modes. The browser also keeps only the last map centre, zoom level, and confirmed pickup point. There is no cloud sync or automatic cross-device recovery.

The current implementation covers Epics 1–5: discovery, condition checks, comparison and contact preparation, browser-local reuse, and care-handover preparation. This represents 28 stories and 66 acceptance criteria from a full Revision 2.1 baseline of 46 stories and 114 acceptance criteria. Passing an implementation check does not mean that a provider fact or service has been independently confirmed.

The following are not implemented:

- Real-time vacancy or provider acceptance
- Automatic contact, message delivery, or contact-result tracking
- Booking, payment, a transport marketplace, or pickup authorisation
- User accounts, child profiles, or work-calendar imports
- Parent-review browsing, shared contingency cards, or rehearsal

## Technical overview

| Layer | Implementation |
| --- | --- |
| Frontend | React 19, Vite 6, MapLibre GL, and Three.js |
| Map and place search | OpenFreeMap / OpenMapTiles, OpenStreetMap, and Photon |
| Route estimates | OSRM |
| Public queries | Anonymous, read-only Appwrite `web-provider-query`; no API key or login |
| Local state | Browser local storage with live/demo separation |
| Verification | Node test runner, Playwright, and production-bundle checks |

`web-provider-query` exposes only `health`, `places`, `reverse`, `nearby`, `search`, `details`, and `compare`. It has no publication, mutation, booking, or messaging action, and it does not read owner data from the earlier iOS planner.

## Local development

Node.js 22.12 or later is required.

```sh
git clone https://github.com/Cheolhwi/equalpath-web.git
cd equalpath-web
npm ci
npm run dev
```

The development server runs at [http://127.0.0.1:4179/](http://127.0.0.1:4179/). By default, the frontend calls the deployed public Appwrite Function. To use the repository's local read-only adapter explicitly:

```sh
VITE_EQUALPATH_API_URL=/api npm run dev
```

Run the main checks with:

```sh
npm test
npm run build
npm run preview

# Full local release check; does not deploy the Function
npm run release

# Install Chromium before the first browser-test run
npx playwright install chromium
npm run test:browser
```

Only an explicit `node scripts/deploy-api.mjs --deploy` modifies the live Function. Ordinary development and CI use the dry-run path.

## Attribution

The landing experience reuses licensed RhineLabUI scene assets and models. Upstream attribution and licence terms are available in [`src/vendor/rhine/UPSTREAM.md`](src/vendor/rhine/UPSTREAM.md) and [`src/vendor/rhine/LICENSE`](src/vendor/rhine/LICENSE). Map and boundary-data attribution remains visible in the application.
