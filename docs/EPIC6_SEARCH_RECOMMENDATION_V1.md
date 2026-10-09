# Epic 6: search, review evidence and recommendations

Implementation record, updated 1 October 2026. This file describes the current code;
the earlier exported diagrams show the original five-theme design. This is a
local implementation record, not a production release receipt.

9 October extension: [RECOMMENDATION_ML.md](RECOMMENDATION_ML.md) documents
item-based CF, implicit ALS and a linear RankNet adjustment, local exposure
collection and offline training/evaluation. The formula below remains the
cold-start fallback. The bundled collaborative model is untrained until a real
consented interaction dataset passes evaluation; local learning also has a
minimum-data and holdout gate. Do not report these as trained production models.

## Data and two-level classification

The corrected, user-supplied `short-care-review.numbers` workbook contains
10,211 review records matched by provider ID to the 101 completed short-care
branches. Each review stays attached to its branch; matching brand names do not
transfer reviews between branches. Duplicate review IDs and repeated wording
within the same branch are removed before aggregation.

Six readable level-one groups contain twelve level-two preferences:

| Level one | Level two |
| --- | --- |
| Care | Kind teachers; Safe pickup |
| Daily care | Clean spaces; Good meals |
| Play and learning | Fun activities |
| Communication | Helpful updates |
| Visits and pickup | Flexible visits; Flexible hours; Easy drop-off; Clear late fees |
| Costs | Clear prices; Good value |

The groups and user-facing names are a stable, curated vocabulary, **not an
unsupervised discovery claim**. The import trains hierarchical TF-IDF centroids
from the supplied topic annotations. For unlabelled text, it first selects
level-one groups, then predicts level-two topics inside those groups; weak or
unrelated text is left unclassified. Existing source annotations are retained
as candidates, with a text-relevance gate. Clause rules separate sentiment and
narrow pickup/fee aspects. Overall stars never stand in for topic sentiment.

This is a lightweight, reproducible classifier. It is not an LLM, a
collaborative-filtering model, or an automatically retrained online model.

## Topic scores

`shared/review-profile.mjs` aggregates positive, negative, mixed and neutral
observations by topic and date. A mixed review can count on both sides. Neutral
mentions do not become praise. Prices, opening hours and phone listings never
become review evidence.

- Review recency has a 180-day half-life.
- Positive/negative proportions use a Beta(2,2) prior, shrunk toward neutral by
  `weightedCount / (weightedCount + 8)`.
- At least two positive reviews in the past 365 days are required for a
  supported theme. At least two recent negative reviews support a concern.
- Sparse, undated, future-dated and old-only evidence gives a neutral ranking
  contribution. Missing evidence is not a bad rating.
- Counts, positive/negative balance, dates and sample limits are visible.
  The internal score is not displayed as a childcare quality or safety rating.

## First use and learning from activity

The separate, skippable first-use screen starts with six familiar choices.
`More choices` reveals the remaining themes. Visitors can select up to three;
selected boxes, the count, the selection-limit hint and Continue make the
interaction explicit. Preferences can be changed in Settings.

Saved centres have weight 4; comparison activity starts at 2; detail viewing
starts at 0.5. Viewing and comparison signals have a 30-day half-life and count
at most once per branch/action/Kuala Lumpur calendar day. Counts are capped.
A hidden suggestion supplies a small negative signal and is not suggested
again. Turning activity use off removes view/compare/negative learning; saved
centres and explicitly chosen preferences still work.

A fresh API seed lookup includes relevant off-page branches, so previously
saved or compared centres can influence a new neighbourhood search. Their
current review topic profiles form the learned preference vector. Only IDs,
care types and bounded counts/timestamps are stored in browser history. No
review text, child information, request address or provider snapshot is stored
there. Live/demo and short/regular care remain separate.

## Search ranking and output

The server still determines the radius and nearest page membership, assesses
age/date/hours/pickup, and applies the requested filters. Known conflicts never
become recommendations. Unknown facts stay unknown. Review evidence cannot
confirm a vacancy or override a closed centre.

Within the current eligible page, **Recommended** is the default search order.
It combines these transparent heuristic contributions (not trained weights):

```text
(0.45 − 0.10 × activity confidence) proximity + 0.40 known condition fit
+ up to 0.22 selected-topic fit
+ up to 0.20 learned-topic fit × activity confidence
+ up to 0.12 service/fee similarity × activity confidence
+ up to 0.24 familiar-centre signal
```

The familiar-centre contribution is 0.24 for a current save, 0.12 for one fresh
comparison and 0.03 for one fresh detail view. Activity caps and decay still
apply. A save is a strong signal about that branch, not proof that the visitor
likes all of its attributes. Inferred topic fit and service/fee similarity remain
confidence-limited. Saved/compared explanations take precedence over the initial
preference explanation so the effect is visible when a branch is highlighted.

Same-brand repetition receives a 0.12 diversity penalty after a top result.
In positions 2–5, a candidate can receive a bounded 0.035 bonus for a strong
review theme not yet represented. Its two strongest supported themes qualify
only with a score of at least 0.60 and confidence of at least 0.25. Sparse or
stale evidence cannot create novelty. This deterministic adjustment applies
inside existing contact/hidden groups; it cannot override eligibility. There
is no fixed five-personalised/five-factual split and no random exploration.

**Nearest first**, fee, later closing, pickup and name search sorts keep the
server's factual order, without history-based promotion or preference badges.
Contact availability does not outrank a chosen factual sort in search; the
contactable suggestion pool and comparison contact preference remain intact.
Recommended retains contact priority. Every eligible result in a Recommended
page is scored and reranked, including
all ten short-care results when a page is full, not just three promoted cards.
New visitors, skipped preference setup and disabled activity use run through
the same pass; absent personal signals contribute zero, leaving proximity,
known condition fit and diversity. Hidden suggestions remain scored ordinary
results below other candidates in their contact group, without highlights.
Favourites
remain eligible in ordinary search; the separate new-suggestions panel excludes
already-saved branches. List badges, map pins and map cards share the same
three eligible suggestions. Each eligible result has an internal score and
rank for verification; only the top three receive suggestion highlights.
The API still selects page membership by distance inside the requested radius;
this is page-wide reranking, not global reranking before pagination.

Map previews and result-list cards show up to two short branch-characteristic
tags under the centre name only for non-suggested, non-personalised results
(for example, Kind teachers / Fun activities). Suggested results retain their
recommendation reason without the additional tags.
These use the strongest supported review themes with the same 0.60 score and
0.25 confidence thresholds as diversity. They describe the branch independently
of personal preferences and saves; changing which centres are suggested changes
which cards show tags. One strong theme gives one tag, and missing, sparse or stale
evidence gives no filler tags. Accessible labels identify parent reviews as
their basis. Both surfaces use the same selector and compact search profiles,
without fetching review text or adding API requests. Map-card placement reserves
room for the tags, including wrapping on narrow phones.

An all-conflict short-care search can show external alternatives; unresolved
facts alone do not trigger that fallback. Existing month-age conversion and
weekend missing-hours rules remain in the hard-condition layer.

## Inspecting evidence and asking about it

Centre details have an optional Parent reviews section with topic selection,
relevant verbatim passages, their dates, positive/negative balance, monthly
sample counts and the recent twelve-month subset. Each passage has a source
record ID and a privacy-trimmed context. Both favourable and critical examples
are shown when present; a missing side is never invented. Empty topics say so.

A recurring concern requires two distinct recent supporting excerpts. `Ask the
centre about this` opens the existing Contact page with a neutral question.
The parent can untick it before copying. Evidence remains under More details;
quoted allegations are not pasted into the outgoing message. Fee concerns
merge into the existing fee question and repeated additions do not duplicate
questions.

The supplied workbook has **no original review URLs**. The UI therefore says
“Provided review sheet” and explains the missing original link and unchecked
reviewer identity. It does not label the excerpts as verified Google reviews.
Provider promotional/listing text is not mixed into these counts. Importantly,
the product has an inspectable supplied sample, not independently verified
review provenance or complete-platform coverage.

## Rebuilding and checking

Raw extraction stays in ignored `.build/epic6`. The source workbook is never
modified. Use an isolated Python environment with `numbers-parser==4.19.0`:

```sh
python scripts/extract-review-workbook.py /path/to/short-care-review.numbers .build/epic6/reviews.json
node scripts/build-review-profiles.mjs .build/epic6/reviews.json 2026-09-29
npm test
npm run release
```

The build writes the bundled `server/data/review-profiles.json`, a local model
and a reproducible evaluation report. Function packaging includes the overlay
and data; it adds no runtime TablesDB reads or background data polling.

The classifier evaluation holds out whole branches and removes normalised
identical wording across the train/test boundary. It measures agreement with
the supplied annotations, not independently judged accuracy or parent
satisfaction. Regression tests cover varied preference rankings, off-page
history, negative feedback, sparse/old evidence, manual-sort preservation,
conflict gates, map/list consistency and enquiry deduplication.

Before publication, follow AGENTS.md: local desktop/mobile visual checks, the
release gate, explicitly authorised Function/site publication, matching public
source digest, and a separate journey on the real production website.
