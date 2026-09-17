# Local recommendations and September UI release

Authorised on 17 September: use viewed comparisons and saved childcare to suggest centres for the current request; release this with the current map, contact, comparison and preparation UI changes.

## Behaviour

- Saved retains the Childcare and Searches lists. A separate For you tab, accessible through Saved in the main navigation, offers up to three suggestions, a short reason, current fee, View centre, Save and Not interested.
- A current completed search is required. Returning visitors keep their local interests but must supply a fresh request; changing a draft invalidates the recommendations until searching again.
- A successful displayed comparison records its centres. Selecting a comparison checkbox alone does not. Viewing centre details records a weaker signal. Repeated actions count once per centre, kind and Malaysia calendar day, capped at six days per kind and 100 centres.
- `equalpath:interests:v1:live` and `:demo` contain only public centre IDs, care type, event counts/dates, an enabled flag and up to 100 hidden IDs. No request, precise location, child age, note, contact outcome or provider snapshot is added to history. The existing saved library is unchanged.
- Users can turn viewing history off or clear it in How suggestions work. Clearing also restores hidden suggestions and preserves saved centres/searches. Malformed/unavailable storage reports a message, leaves old storage untouched, and does not block discovery. History can be explicitly reset even when malformed.
- Demo walkthrough actions do not create history. Live and demo history and regular/short-care preferences are isolated.

## Algorithm v1

This is a deterministic content-based baseline, not a trained model or evidence of measured recommendation quality. Current published facts are fetched before ranking. The endpoint accepts only seed IDs, not activity timestamps/counts or saved notes; the scoring takes place in the browser. No analytics, training service, owner tables or database reads are introduced.

The read-only `recommendations` action reuses the catalogue and assessment rules, limits scope by care type, radius and explicit filters, removes known conflicts and bounds the candidate set to the nearest 100 eligible centres. It retrieves current same-care-type seed facts even when those seeds are outside the current radius. Removed/withheld/wrong-type IDs supply no preference evidence. Ordinary search page membership and explicit sorting remain unchanged.

Weights are initial heuristics: saved=4, successful comparison=2, detail view=0.5. Repeat-day uplift is capped at 2x; view/compare evidence has a 30-day half-life, while current favourites remain explicit interests. Hidden centres are excluded both as candidates and as positive seeds. Preference influence shrinks with sparse history and is capped at 35% of the For you score. Current distance and published condition support supply the base score.

Similarity uses published short-care service, pickup service and same-basis MYR fees; type/district provide only small supplementary evidence. Unknowns are not matches, estimated fees do not become learned price preference, and billing periods are never converted. Current fee/care-end/pickup priority takes precedence over preference scoring. A small same-brand penalty reduces duplicate branches. Contact preference remains internal, as in existing suggestions. Saved and explicitly hidden centres cannot consume the three new-suggestion slots.

No conflict does not mean a confirmed place. UI retains unknowns and asks users to confirm capacity with the centre. Freshly fetched catalogue facts mean the latest published app snapshot, not a live vacancy feed. Changes in provider facts require the existing authorised snapshot publication process.

## Verification and deployment

Unit and browser checks cover ranking exclusions, fresh facts, storage minimisation, mode/type isolation, same-day deduplication, saved and history persistence, opt-out/reset, explicit sort, current-request gating, and desktop/mobile actions. Local release validation passes all 195 Node tests, isolated Function packaging and the production asset check. The 132 browser cases were exercised, with affected scenarios rerun after fixing stale sidebar assumptions, small-screen card clearance, shared-address pins, modal dismissal and tour scrolling. The public recommendation endpoint returned 11 eligible candidates and zero known conflicts from Function deployment `6aab6aec227ecbf299be`. GitHub CI runs the complete browser suite for the release commit. `scripts/verify-site.mjs` checks the exact live source digest; `scripts/verify-recommendations.mjs` verifies real anonymous desktop/mobile search → compare → save → suggestions → detail navigation. Deployment journey screenshots and JSON receipts are written under `.build/release-2026-09-17/`.
