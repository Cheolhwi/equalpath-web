# First-visit quick tour

Implemented 2026-09-13 for the requested animated introduction to the existing childcare workflow.

## Experience

- Opens after entering Discover on the first visit, with **Skip** available immediately.
- Six short steps cover pickup place, care hours, nearby results, condition checks, comparison and contact questions. The active area is outlined and its surroundings lightly dimmed; highlights and coach cards animate between steps.
- Prefills KL Sentral, today's Malaysia date, 13:00 pickup and care until 18:00. The existing public API runs an explicit demo search, then the actual map, details, comparison and enquiry components show the examples.
- **Back**, **Next**, skip and Escape are supported. Small screens have buttons to view either comparison column. Reduced-motion preferences remove the movement.
- Completion/skip is remembered on this browser. The question-mark **Quick tour** button and settings allow replay.

## State and scope

The app captures the current request, typed place query, results, selection, comparison and map before beginning. Both completion and skip restore them, including when a sample request is still pending. Sample map movement cannot overwrite the remembered real map. Saved centres and templates are untouched.

Only `{ version: 1, status: "completed" | "skipped" }` is persisted at `equalpath:tour:v1`. No tutorial request, date, age, provider or result is saved. Blocked browser storage still permits this session's tutorial and dismissal. The tutorial does not request geolocation or initiate contact.

The example run needs the existing read-only API. A failed request offers retry or skip; it does not silently replace real results with fixtures. Backend resources and domain settings are unchanged.

## Verification

- `npm run release`: 96 unit tests passed; production build and entry-asset validation passed.
- `PW_CHANNEL=chrome npm run test:browser`: 18 browser tests passed, including five new tutorial journeys and the existing discovery/saved/preparation journeys.
- Verified first entry, skip, reload suppression, replay, all six steps, original-state restoration, slow and failed sample requests, retry, blocked storage, Escape, reduced motion and 320/390-pixel mobile layouts.
- An isolated Chrome run against the local app with the real public Appwrite API completed the entire animated journey. It returned ten demo results, restored empty live inputs, made no geolocation request, wrote no last-map/saved data, and had no page errors.
- Selected screenshots and the live API receipt are in `evidence/tutorial-2026-09-13/`.

Release source digest: `3fcc6d53e59d98b684e0567dfbb7d9a9c6e57501d80a706002b1908602b6f424`.

The existing custom-domain TLS issue is separate from this change. This implementation does not weaken or remove that deployment check.
