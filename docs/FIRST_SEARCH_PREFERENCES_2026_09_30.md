# First-search preference synchronization

The retained search app mounted behind the welcome/preferences screen and read an empty interest profile. Onboarding then saved the selected topics to local storage without notifying that mounted app. Native `storage` events reach other documents, not the document that writes them. Search therefore kept using the empty profile until a later detail/comparison interaction reloaded it. There was no intentional two-search learning delay.

All browser interest writes now go through `src/interest-store.js`. A successful write or clear notifies same-document consumers, scoped by live/demo mode; the existing native storage listener continues to handle other tabs. Failed persistence does not broadcast a successful change. Reset reads the latest stored preferences instead of restoring a stale hook snapshot.

The scoring model, review-evidence thresholds, hard eligibility checks, nearest-page membership, ten-result limit and maximum three map suggestions are unchanged. `For you` still requires a personal recommendation reason; selecting a topic with insufficient review support does not manufacture a match.

## Verification

- Before the fix, a fresh Chrome journey selected Kind teachers, completed onboarding and searched without opening details or comparing. The stored choice was present, but the rendered personalised count was 0 instead of the expected 3.
- After the fix, desktop Chrome at 1440 × 1000 and mobile Chrome at 390 × 844 passed the first two searches without refresh or detail/comparison activity. The visible result order, rerank positions and badges match the chosen profile. Both map layouts were inspected after transitions settled.
- The local browser test uses the actual bundled live catalogue and API handler, with controlled place lookup and no external driving lookup. It is separate from production verification.
- Existing comparison, saved recommendations, opt-out and history-reset browser regression passed.
- `npm ci` and `npm run release` passed. Production digest, deployed revision, CI and the real public-page journey are recorded separately in `evidence/first-search-preferences-20260930/release-receipt.json`.
