# Recommendation learning

Implementation: 9 October 2026. This is a local implementation record, not a
production deployment or evidence of improved real-user satisfaction.

## Hours correction — 10 October 2026 (current)

Known opening-time and midday-gap conflicts are filtered before ranking, in
addition to age and care-end constraints. The prior version checked only the
end time. Replaying its 4,049 candidate records found 92 opening conflicts,
including 35 positive simulated labels (24 in training). Six branches were
involved. Regenerate whole histories, not just individual labels, because saves
in earlier queries affect later profiles.

`ep-ranking-v2-hours` versions the corrected eligibility and known-facts feature.
Old slates are discarded on reading/training; explicit preferences, saved centres
and activity are preserved. An old approved model cannot pass the new feature
version check. New qualified personal RankNet fits remain available.

The unchanged six-persona simulation and training hyperparameters were rerun:
validation NDCG@10 **0.819417 versus 0.822764** (72 queries), test **0.821141
versus 0.818827** (120 queries). The validation margin remains +0.001.
The candidate is **rejected and inactive**. The test improvement cannot reverse
the validation decision. Default ranking therefore uses the content baseline,
explicit preferences and behaviour unless a new personal model independently
qualifies. No synthetic behaviour is injected into browser history.

Reproduce without overwriting historical training evidence:

```sh
node scripts/simulate-local-ranknet.mjs .build/recommendation-training/hours-v2
node scripts/train-bootstrap-ranknet.mjs .build/recommendation-training/hours-v2/synthetic-interactions.json shared/recommendation-bootstrap.json --record-rejected
```

`--record-rejected` records a disabled candidate; it never approves weights.
Without this explicit flag, failed validation still aborts before writing.
The earlier 9 October activation and metrics below are historical, superseded
by this correction. Further tuning must use training/validation data and a new
untouched final test; these inspected holdouts are now diagnostic evidence.

## What runs

The existing server eligibility, radius and nearest-page membership are
unchanged. The client applies the existing content score and, when a qualified
model exists, a bounded learned adjustment before the existing contact/hidden
groups and diversity rules. Factual sorts are unchanged. Both child lists in
the two-child planner use this shared ranking path before combination scoring.
There are no new Function calls, TablesDB reads, scheduled jobs or dependencies.

1. **Item-based collaborative filtering** builds cosine similarity over a
   user-by-centre weighted implicit-feedback matrix. Similarities need three
   distinct users in common, shrink by `support / (support + 5)`, and retain at
   most 20 neighbours. Same-item matches are excluded. Missing evidence is zero.
2. **Implicit ALS matrix factorisation** learns eight-dimensional user and
   item vectors by alternating ridge least-squares updates, with `p_ui = 1`
   for positive interactions, confidence `1 + 8 * interactionWeight`, L2 0.2,
   and 15 deterministic iterations. Only items with three contributing users
   are exported. Only item factors are bundled; a new browser folds its current
   saved/viewed/compared seeds into the fixed model locally. No user ID, user
   vector or raw interaction is included in the public model.
3. **Linear RankNet** learns feature weights using pairwise logistic loss and
   L2 regularisation toward its initial weights. It is a linear scorer,
   not LambdaMART, a deep network or a learned probability of availability.
   Features are the six existing content contributions plus CF and ALS scores.
   A model's change is bounded to ±0.12; combined global and local changes are
   bounded to ±0.18. These bounds are safety choices, not learned parameters.

The global candidate must beat the existing baseline on held-out NDCG@10,
have supported CF/MF items, use real consented interactions and be explicitly
activated. The collaborative bundle currently says **untrained**. No real multi-user
interaction dataset has been supplied. Synthetic regression tests exercise
the algorithms; their results are not production accuracy claims.

### Historical initial RankNet (9 October; superseded above)

The user explicitly requested that the simulated training affect the released
website, including the first search. `shared/recommendation-bootstrap.json`
therefore supplies a separate **synthetic bootstrap**, imported by the ordinary
production scorer. It contains eight weights and provenance/evaluation metadata,
not simulated users, saves, searches, CF neighbours or ALS factors. All eligible
short-care candidates on the page receive its bounded adjustment immediately.
Regular-care searches and explicit factual sorts do not use this model.

Six simulated personas supply 288 training, 72 validation and 120 test searches
(48/12/20 chronologically per persona). Pooled RankNet uses 5,430 preference pairs,
100 epochs, rate 0.3 and L2 0.03. Validation NDCG@10 is 0.823649 versus 0.821984;
the untouched test is **0.823941 versus 0.825345 (delta -0.001404)**. The validation
rule accepts the candidate, but the test does not establish an improvement.
This is an explicitly authorised initial model for the project, not a claim of
better real-parent recommendations. The test was not used to refit or tune it.

New users need no local history for inference. Personal RankNet starts from
these initial weights and must beat that same initial model on independent
later feedback before replacing it. The prior is not counted a second time.
Failed/sparse personal validation keeps the initial model. Clearing local
history returns to the shipped prior. Turning off learning disables both.
Weights ship in the static client and add no server execution or database read;
on-device fitting is bounded and cached for unchanged history.

Reproduce the exact synthetic dataset and initial model locally:

```sh
node scripts/simulate-local-ranknet.mjs
node scripts/train-bootstrap-ranknet.mjs
```

The simulation explicitly disables the bootstrap when collecting its logging
policy, so publishing the prior cannot contaminate its own reproducibility.

Explicit onboarding preferences personalise the first search. Each valid
detail view, comparison or save can update the interest profile used by the
next submitted search, without waiting for any number of searches or elapsed
time. Responses capture their ranking once; later activity does not reorder
the current cards or change their recommendation set.

Separately, the browser can fit a local RankNet from feedback-bearing slates.
It uses the first 80% chronologically for fitting and the final 20% for
validation, keeping equal timestamps together. Both independent partitions
must exist, and the bounded model must improve held-out NDCG before use.
This is a model-validation requirement, not a gate on personalisation.
Validation on sparse feedback remains weak evidence; the bounded adjustment
and fallback stay in place, and later feedback contributes to subsequent fits.
Collaborative columns are zeroed for local training and scoring. Without a
qualified personal model, the shipped short-care prior and content ranking
still use explicit preferences and activity.

## Local collection and controls

The existing `Use my activity` switch controls collection and all learned
adjustments. Explicit preferences and favourites continue to work when it is
off. Clear learning history deletes slates and the export pseudonym; Clear
local cache removes this with all other local app data. No telemetry is sent.

One-child and two-child Recommended searches can create training slates.
Actual result cards must be at least half visible for 400 ms in a visible
browser tab. Loading/nearby/manual sorts, tutorials, dirty requests, dialogs
and exiting cards do not generate impressions.

Two-child searches use one slate per child with a shared random search ID
prefix and exactly the same timestamp. Both siblings therefore remain in
the same chronological training or validation partition. An option card
exposes only its two assigned branches; a map card exposes its labelled
child or both children. Each entry retains that child's pre-action feature
vector and candidate rank. Repeated appearances across cards are deduplicated.
An impression alone has reward zero; it is not a pair of positive choices.

Opening a family plan gives weak view feedback to its assigned branches.
Details uses the map card's child context; an actual loaded family comparison
uses both child contexts, and a successful map-card save uses the card's
context. Each label still requires an existing eligible impression for that
child and search. A shared branch can have two distinct feature snapshots;
it does not create two independent validation searches. See
`shared/family-learning.mjs` and `tests/family-learning.test.mjs`.

Qualified personal weights rerank both child candidate lists on the next
search, after age and complete-hours filtering. Existing combination scoring
then accounts for the two child ranks, one versus two stops and known road
times; the personal model does not learn a separate travel-plan network.
Current results stay frozen. These changes add no API calls or server writes.

The first observed feature vector and position are frozen before feedback.
Detail/plan view gives relevance 1, actual comparison 2, successful save 3; a
hidden recommendation can give -1 when linked to an exposed slate.
Feedback uses the exact displayed search ID and branch, with no time-window
guessing. Other-page activity without that context can update the interest
profile but cannot label an unrelated search. A never-displayed result gets no
label. Unchosen displayed cards
have 0, a weak relative implicit signal, not an explicit negative rating.
Repeated actions take the maximum grade rather than multiplying events.

Stored fields are schema version, random slate ID, timestamp, care type,
public centre IDs, displayed positions, bounded numerical feature vectors and
reward grades. There are no addresses, coordinates, child ages, care times,
review text or provider snapshots. Normalised distance and fit contributions
are still derived search information; exports describe them as search scores.
Retention is 60 days, at most 60 slates and 20 items/slate, pruned on read/write.
Browser storage write failure preserves the previous saved value and reports
the existing history error. Exports contain the current sanitised snapshot
immediately; later activity may update a subsequent export of the same slate.

Settings → How search learns from you allows a user-initiated JSON download.
Its random browser-local actor ID is created only at first export, so repeated
exports can be detected rather than counted as new users. Use one latest export
per browser; do not count a browser reset as a new consenting participant.
Do not mix live and demo exports. Demo exports are marked `synthetic-test`.
Private exports belong in ignored `.build/recommendations`, never in Git.

## Offline workflow

Collect user-authorised exports from at least five distinct participants and
at least 30 completed search slates. Those are engineering minimums, not an
adequate production sample-size guarantee. Concatenate their `sessions` under
one `ep-interactions-v1` document, preserving actor IDs and provenance. Import
rejects overlapping actor/slate IDs, expired/future records, malformed feature
vectors and mixed feature versions. Reviews and review IDs cannot replace
cross-user interaction histories.

```sh
node scripts/train-recommendations.mjs .build/recommendations/consented.json
# Inspect .build/recommendations/candidate.json and its validation first.
node scripts/train-recommendations.mjs .build/recommendations/consented.json .build/recommendations/candidate.json --activate
npm run release
```

The earliest 40% of timestamps fit CF/MF. The next 40% fit RankNet using only
prior activity for feature construction. The final 20% are held out, and their
outcomes never alter another held-out query's user vector. Equal timestamps
remain together. The exported model is this evaluated model, without a silent
refit on the test data. Report fields include baseline/hybrid NDCG@10 and CF/MF
ablations. No user identifiers are emitted in the model or report.

`--activate` fails for synthetic data, insufficient support, missing labels or
a non-improving holdout. It writes a local bundled artifact only; it does not
publish anything. Runtime also rejects wrong schema, incompatible care type,
invalid vectors, future timestamps and models older than 90 days. It then
falls back to qualified local learning, the separate synthetic short-care prior,
or the existing content ranking.

## Limits and evaluation

- This remains page-wide reranking, not personalised global retrieval.
- Exposed-but-unchosen items and graded actions are imperfect relevance
  labels; ordering/exposure bias remains. There is no propensity correction,
  randomised exploration or causal claim. Holdout NDCG is an offline diagnostic.
- The combined score is still hybrid: learned adjustments plus existing rules.
- There is no central automatic collection or cross-device synchronisation.
- A model can prefer previously saved centres; those are not filtered from
  ordinary search. The separate new-suggestions pool retains its exclusion.
- A model cannot override known age/hours conflicts or infer a booking/vacancy.
- New items/users and sparse data use content and explicit preferences.
- Existing Claude UI/arrival changes and care-hours changes are outside this
  implementation; no production publish is implied.

Algorithm references: [Implicit feedback ALS documentation](https://benfred.github.io/implicit/api/models/gpu/als.html)
and [Microsoft's RankNet overview](https://www.microsoft.com/en-us/research/publication/from-ranknet-to-lambdarank-to-lambdamart-an-overview/).
The dependency-free implementations here use those objectives, not those
libraries, and make no claim of equivalence to a full production library.
