# Recommendation ML implementation check

Checked locally on 9 October 2026 (Asia/Kuala_Lumpur).

## Scope and state

- Repository: `webapp`, branch `main`.
- Base commit: `489dcfeed26ff93b12abf359558d1cfcd471eb33`.
- ML implementation is uncommitted working-tree work. Existing Claude UI,
  arrival and care-hours changes were preserved.
- Final local build source digest:
  `9ae2f442e82631d110bd87ac56b9e27e9646513eae335315a426d9502a5f0f45`.
- No Git push, website publish, Appwrite data write or production test was
  performed for this implementation. The digest above is not a live digest.
- The bundled collaborative model is `untrained`: no real multi-user
  interaction dataset has been supplied. The real-model validation and
  activation gates are implemented, not passed using real production data.

## Automated checks

- Existing recommendation tests: 22 passed.
- New ML tests: 8 passed (CF, ALS, pairwise RankNet, feature snapshots,
  local learning gates, export projection, temporal evaluation and integration).
- Full `npm run release`: 316 tests passed, API package dry run passed,
  production build and build-integrity check passed.
- After final settings-only copy/spacing changes, build and build-integrity
  checks passed again for the digest above.
- `git diff --check`: passed.
- Existing large-bundle warnings remain; no new network calls or runtime
  database reads were added by this feature.

## Training smoke test

- Exercised the offline CLI with a clearly marked synthetic fixture:
  24 history slates, 24 training slates and 12 held-out slates.
- Baseline NDCG@10 was 0.7328 and hybrid NDCG@10 was 1 on that constructed
  fixture. These values verify the implementation path only and do not measure
  real-user accuracy or satisfaction.
- Attempting `--activate` with the synthetic dataset failed as intended.
  The bundled production model remained `untrained`.
- A local Node measurement of 60 slates × 20 items took 34.05 ms for fitting;
  cached lookup averaged about 0.0004 ms. These are single-machine diagnostics,
  not browser/mobile latency guarantees.

## Real-browser local UI check

Used a separate local preview at `127.0.0.1:4182`, demo mode, at the normal
1280 × 720 desktop viewport and a 390 × 844 mobile viewport. Reset the viewport
override afterwards.

- Completed a normal one-child search and opened a visible centre's details.
- Saved Garden Learning House; the navigation showed `Saved 1`.
- Expanded Settings → How search learns from you. Desktop and mobile controls
  fit without horizontal overflow; the section is collapsed by default.
- After reload, export correctly reported the pending 30-minute attribution
  window, confirming that actual exposure records persisted.
- Clear learning history removed those records; export then reported that no
  search activity had been recorded. The saved centre remained (`Saved 1`).
- Turned activity learning off, completed another search and revisited the
  export control: it still reported no search activity. The switch remained
  off when the settings dialog reopened. Restored it afterwards in this test
  origin.
- Mature JSON export projection is covered by tests/CLI; the browser journey
  did not wait 30 minutes to produce a mature download.

Screenshots: `settings-desktop.png` and `settings-mobile.png`.

## Follow-up: three-search local threshold

At the user's request, reduced the local RankNet minimum from ten to three
mature feedback-bearing slates. The first two train; the latest validates.
The 30-minute attribution window, positive holdout requirement, bounded score
adjustment and original-ranking fallback are unchanged. Global collaborative
model data requirements are unchanged.

Regression checks cover two-search rejection, three-search activation,
unfinished/no-feedback third-search rejection, failed third-search validation,
and integration with conflicts, factual sorts and opt-out. Full `npm run
release` passed again: 316 tests, API dry run, build and integrity check.
Latest local source digest:
`b10c3d8de28312b9ec9b3bce3f7a4d06382822dfc7a596e853e006bcd87951c8`.
This follow-up changes logic only; the earlier screenshots document unchanged
controls. No deployment was performed.

## Remaining data dependency

CF/ALS/global RankNet require authorised exports from real participants and a
passing chronological holdout before activation. Local RankNet requires
independent chronological training and validation partitions and improved
held-out ranking. Personalisation through explicit preferences and the interest
profile does not wait for model activation. The follow-up below supersedes
the historical three-search and 30-minute gates documented above.

## Follow-up: immediate interests and stable search results

The user clarified that onboarding preferences should already personalise the
first search. Removed the fixed three-search threshold and 30-minute wait:

- Explicit preferences and the first view, actual comparison or save can affect
  the next submitted search through the interest profile.
- Each successful search now snapshots its ranking and displayed search ID.
  Saving or viewing does not reorder the current results. Feedback labels only
  the explicitly identified search and an actually exposed branch.
- Local RankNet still requires independent, later validation data and an
  improvement over the baseline. Global CF/ALS activation gates are unchanged.
- Settings explains first-search choices and next-search activity. Export
  provides a sanitised point-in-time snapshot immediately.

Verification on 9 October 2026:

- Full `npm run release`: 318 tests passed, zero failures, API dry-run package,
  production build and build-integrity check passed. Existing bundle-size
  warnings remain. `git diff --check` passed.
- Regression cases cover zero-history onboarding preferences, first-action
  ranking changes, frozen existing response, explicit feedback attribution,
  immediate exports, independent validation and failed-validation fallback.
- Real local browser on isolated `127.0.0.1:4183/?mode=demo#discover`:
  Fern Care House was fourth; saving it kept the current order unchanged.
  The next submitted search (end time 18:00 → 18:05) placed it first with
  `A centre you saved`. The time change reduced eligible results from 7 to 6;
  exact same-response ranking changes are additionally covered by unit tests.
- The download completed immediately and contained two `synthetic-test`
  search snapshots only a few minutes old. No export was uploaded or committed.
- Inspected the actual settings screen at 1280 × 720 and 390 × 844. Text and
  actions fit; mobile document width equalled the 390px viewport. Restored the
  viewport override afterwards. Screenshots: `immediate-learning-desktop.png`
  and `immediate-learning-mobile.png`.
- Source digest: `a0d65e7dc8fd696c4cddc1705611685791ca8b828be25e78cce36c41e3bd0545`.
- Local working-tree change only; no commit, Git push, cloud publication or
  production verification. Preserved existing Claude changes.
