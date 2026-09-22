# Epic 6 search and recommendation direction

This note records the first implementation of Epic 6 personalised discovery. It is a search aid, not advertising. A centre must still pass the user’s current search before it can be suggested.

## What the user controls

On the Saved → For you view, a first-time visitor can choose up to three things that matter:

- Short visits
- Easy pickup
- Open later
- Clear fees
- Easy to contact

The choice is optional, can be skipped, and can be changed later. It is stored in the same mode-separated browser-local record as recommendation history. No address, date, age, time, notes, or provider snapshot is stored there.

## Ranking boundary

The current search remains the hard gate. It decides care type, radius, location, age, date, time, pickup choice, conflicts, and the user’s include-unknown setting. A recommendation cannot bypass those checks.

The ranking then combines:

1. proximity and known fit for the current request;
2. saved, compared, and viewed centres, with the existing decay and caps;
3. explicit preference matches from structured listed facts;
4. an explicit review topic only when the provider record carries traceable review evidence.

Explicit preferences are a gentle 22% maximum nudge. Unknown evidence is neutral and is never presented as a match. The UI explains a supported match in everyday words, for example “Matches your choice: Easy pickup”.

This deliberately does not create a single childcare score. Different parents can value different evidence, and an unknown fee or pickup rule must stay a question for the centre.

## Cold start

With no saved or viewed history, the system starts from the current request and the optional choices above. Nearby, known-fit centres remain available even when the visitor skips the choices. After the visitor saves, compares, or opens a centre, those actions can refine later suggestions. The current search always outranks inferred taste.

## Review topics and evidence gate

Epic 6 review themes remain temporary care, pickup, late collection, fees, and communication. The recommendation code accepts a provider’s explicit topic evidence only; it does not infer a topic from prose or turn review excerpts into a provider-wide rating. The D5 corpus requirements still apply: permitted use, scope, branch match, date, and excerpt traceability must be present before review topics are published.

## User-facing controls

The For you screen exposes the selected choices, a Change choices action, the current search used for checking, and a plain-language How suggestions work section. Viewing history can be paused or cleared without clearing saved centres or the selected choices.

When a first-time visitor has not chosen or skipped preferences, the map shows a small “Choose what matters” shortcut. After choices are saved, it disappears from the map and the For you view shows a compact preview: “Good matches, ready to check” for a cold start, or “Your usual centres, ready to check” once saved, compared, or viewed centres provide a real history signal. The preview is only a visual entry point: the same current-search gate and evidence rules apply.

The next Epic 6 slice can add review-topic evidence after the D5 corpus is approved, then test whether topic matches improve useful centre opens and saves without increasing unknown or conflict recommendations.
