# Second round: saved choices and care preparation

Implemented 2026-09-13 against the supplied `EqualPath_WebApp_Epics_User_Stories_DOD.docx`, Revision 2.1. Scope is **Epic 4 and Epic 5: 10 stories, 23 numbered acceptance criteria**. The first-round condition rules remain in effect, including confirmed official age ranges and business closing as the care-end window. Reviews, shared cards and rehearsal are deferred.

## Delivered journey

Search → save an institution or public-place/time/transport template → revisit after reload → choose a fresh date → fetch and check current facts → inspect changes → prepare party-specific handover questions, pickup/arrival/final-collection sequence and packing prompts → print / save PDF or download a standalone HTML sheet.

`Saved` and `Prepare` are in the main navigation. Institution cards/details expose save, while details and enquiries expose preparation. Native dialogs preserve the current search and have a sticky close control. A preparation sheet retains its dated request until explicitly regenerated against an updated search.

## Numbered acceptance evidence

| AC | Implemented behaviour | Repeatable evidence |
|---|---|---|
| 4.1.1 | Branch reference and optional non-identifying reason survive reload. | Browser save/reload/edit/remove journey; `saved-preparation.test.mjs` save/reload case |
| 4.1.2 | Reopen clears the date; submission fetches current details and assessment rather than stored fit. | Browser fresh-date recheck; live public Appwrite journey |
| 4.1.3 | Storage failure leaves current candidate available, with explicit not-saved feedback and browser-local explanation. | Browser failed-write scenario; unit quota/denied-storage cases |
| 4.2.1 | Public pickup, collection/care times and transport are prefilled; date and optional age are cleared. | Browser template reuse; allowlist unit case |
| 4.2.2 | Exact saved branch/coordinate match is checked. Missing/moved/uncheckable places require reselection; conflicting times retain values and field errors. | Browser unmatched place + time correction; matching unit case |
| 4.2.3 | Expandable explanation lists retained fields, browser scope, clearing-data loss and lack of automatic cross-device recovery. | Browser explanation expansion and storage allowlist assertions |
| 4.3.1 | Material facts display before/after values and source/retrieval dates; snapshot replacement is explicit. | Browser changed-hours fixture; field/version unit cases |
| 4.3.2 | Failed refresh preserves earlier snapshot/dates and says comparison failed; missing comparable facts remain explicit. | Browser aborted refresh; missing-snapshot unit case |
| 4.4.1 | Edit reasons/templates and delete local items without changing provider sources. | Browser complete edit/remove cycle; mutation unit case |
| 4.4.2 | Failed edits/deletes retain the previous stored version and say not saved. | Browser quota scenario; atomic write-failure unit case |
| 5.1.1 | Prompts reflect request interval, age where entered and transport; published requirements are separate. | Preparation domain tests, desktop/mobile preparation views |
| 5.1.2 | Same provider can be re-prepared after current request changes, without visit history. | Browser explicit regeneration scenario |
| 5.2.1 | Questions grouped for usual centre, receiving centre and transporter. Candidate-selection enquiries remain separate. | Browser three groups; party/selection-boundary unit case |
| 5.2.2 | Unspecified collector and receiving staff/contact remain unassigned. | Preparation views, export and party unit case |
| 5.3.1 | Sequence distinguishes requested collection times, published destination/schedule and unresolved details. | Sequence unit case; desktop screenshot; A4 export |
| 5.3.2 | Arrival remains to be confirmed; no coordinate-based route duration is calculated. | Browser sequence assertion; domain case |
| 5.4.1 | Questions cover release procedure, collector ID, receiving staff and delay contacts. | Party unit assertions; printed questions |
| 5.4.2 | Draft status and institution-managed authorisation are explicit on screen and export. | Browser print action and export; draft notice unit case |
| 5.5.1 | General items and sourced requirements are distinct; unpublished requirements are not manufactured. | Published-requirement fixture; packing views |
| 5.5.2 | No online identity/health entry; exported private-information spaces stay blank. | Export input/script absence assertion; A4 page 3 |
| 5.5.3 | Changed duration/transport changes packing prompts without a child profile. | Browser evening/self-arranged regeneration; domain variants |
| 5.6.1 | Standalone print/HTML export includes dated request, sequence, sourced contacts when available, questions and preparation timestamp. | Browser download/print/PDF generation; phone/source export test |
| 5.6.2 | Private spaces are blank and printed notice requires separate authorisation/agreement. | Export unit assertions; visual review of all three A4 pages |

## Verification and limits

- Automated domain/regression tests: 88 passed at the initial full run, including 14 phase-4/5 cases. Final run is retained in the release output.
- Seven browser journeys cover the happy path, persistence, edits/deletes, write failure, unmatched place, invalid times, source changes, failed refresh, regeneration, keyboard actions, 390/320px mobile, print and download. `evidence/phase4-5/browser-results.json` records the latest run.
- Actual production-build → anonymous `web-provider-query` smoke: real KL branch, five successful public query calls, save/recheck/prepare/download, no owner writes or messages. See `evidence/phase4-5/live-browser.json`.
- Visual checks: desktop, saved list, mobile initial and packing states, 320px navigation and an effective 720×500 CSS viewport corresponding to 200% zoom of 1440×1000. Screenshots and a three-page A4 PDF are in `evidence/phase4-5/`.
- The print-button browser test replaces the OS print dialog with an invocation marker; the exported document is independently printed through Chromium's PDF renderer and all pages were visually reviewed. Physical printer output and a full assistive-technology audit are not claimed.
- Q2/Q6: exported strings are escaped, active link schemes rejected, local reasons excluded from preparation exports. Local storage stores no service date, child age, identity or health fields. Q9: evidence snapshots and current assessment remain distinct. Q10: saves are explicit and mode-separated.
- Existing source-publication, source-use and production-domain release gates from phase 0–3 are not declared closed by this feature delivery. Current data does not contain universal provider-specific packing requirements; the UI distinguishes general prompts and missing published requirements.

## Storage and backend boundary

Versioned keys: `equalpath:saved:v1:live` and `equalpath:saved:v1:demo`. Limits: 100 institutions and 30 templates per mode. Writes read the latest local library, retain unrelated items, and update React state only after a successful storage write. Unreadable data is not overwritten. Cross-tab storage events refresh the saved list. There is no automatic query history or cloud synchronisation.

Favourites store branch ID, display metadata, optional reason, explicit save time and an allowlisted published-fact snapshot. They never store an assessment, request, child age or one-off price calculation. Templates keep only name, public pickup reference/coordinates, preferred collection and care-end times, transport preference and modification time. Starting a new occasion revalidates the public place and requires a date.

No schema, function, owner-data or DNS change is required. Existing anonymous read-only `places`, `search` and `details` operations are reused. The independent GitHub repository's browser CI job exercises controlled examples through the local API; production publication continues through the existing Appwrite Sites integration.

## Repeat

```sh
npm ci
npm run release
npx playwright install chromium
npm run test:browser
```

On a developer Mac with installed Chrome, use `PW_CHANNEL=chrome npm run test:browser`. For the optional real read-only smoke, run a production preview and set `QA_SITE_URL` before `node scripts/qa-live-phase45.mjs`. It creates a temporary browser context and closes it afterwards; never run it against a shared personal browser profile.
