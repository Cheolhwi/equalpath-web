# Epic 6 search and recommendation direction

This note records the first implementation of Epic 6 personalised discovery. It is a search aid, not advertising. A centre must still pass the user’s current search before it can be suggested.

## What the user controls

On a first visit to the live map, a visitor sees a small preference card and can choose up to three things that matter:

- Short visits
- Easy pickup
- Open later
- Clear fees
- Easy to contact

The choice is optional, can be skipped, and can be changed later from Saved → For you. It is stored in the same mode-separated browser-local record as recommendation history. No address, date, age, time, notes, or provider snapshot is stored there.

## Ranking boundary

The current search remains the hard gate. It decides care type, radius, location, age, date, time, pickup choice, conflicts, and the user’s include-unknown setting. A recommendation cannot bypass those checks.

The ranking then combines:

1. proximity and known fit for the current request;
2. saved, compared, and viewed centres, with the existing decay and caps;
3. explicit preference matches from structured listed facts;
4. an explicit review topic only when the provider record carries traceable review evidence.

Explicit preferences are a gentle 22% maximum nudge. Unknown evidence is neutral and is never presented as a match. The UI explains a supported match in everyday words, for example “Matches your choice: Easy pickup”.

The same score is also used inside the normal search page. The server still owns the current result page and all hard eligibility checks; local history and choices only annotate and gently reorder matching centres already returned by that search. Nearest first keeps the gentle reorder, while an explicit price, closing-time, or pickup sort remains unchanged.

This deliberately does not create a single childcare score. Different parents can value different evidence, and an unknown fee or pickup rule must stay a question for the centre.

## Cold start

With no saved or viewed history, the first-use map card asks for up to three preferences before the user has to understand a separate recommendation page. The visitor can skip it and search immediately; nearby, known-fit centres remain available. After the visitor saves, compares, or opens a centre, those actions refine later search ordering and For you suggestions. The current search always outranks inferred taste.

## Review topics and evidence gate

Epic 6 review themes remain temporary care, pickup, late collection, fees, and communication. The recommendation code accepts a provider’s explicit topic evidence only; it does not infer a topic from prose or turn review excerpts into a provider-wide rating. The D5 corpus requirements still apply: permitted use, scope, branch match, date, and excerpt traceability must be present before review topics are published.

## User-facing controls

The For you screen exposes the selected choices, a Change choices action, the current search used for checking, and a plain-language How suggestions work section. Viewing history can be paused or cleared without clearing saved centres or the selected choices.

When a first-time visitor has not chosen or skipped preferences, the map shows the compact setup card directly below the search controls. After choices are saved, it disappears from the map and the For you view shows a compact preview: “Good matches, ready to check” for a cold start, or “Your usual centres, ready to check” once saved, compared, or viewed centres provide a real history signal. The preview and normal search tags are visual explanations only: the same current-search gate and evidence rules apply.

The next Epic 6 slice can add review-topic evidence after the D5 corpus is approved, then test whether topic matches improve useful centre opens and saves without increasing unknown or conflict recommendations.
