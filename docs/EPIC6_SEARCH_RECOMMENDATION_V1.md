# Epic 6 search and recommendation direction

Epic 6 is an evidence-backed search aid, not advertising. A centre must first
pass the current search. Review signals only reorder eligible results that the
parent could already use.

## First use and cold start

Before the first live map opens, EqualPath shows a separate, skippable
preference page. It asks what matters in a childcare review, rather than
asking for search constraints:

- flexible short care;
- smooth pickup;
- clear late-pickup rules;
- predictable fees;
- a responsive team.

These are level-two preferences grouped under five level-one review themes:
temporary care, pickup, late collection, fees, and communication. A visitor
can choose up to three, skip, or change them later. The choices are stored in
the mode-separated browser-local record; addresses, dates, times, ages, notes,
and provider snapshots are not stored there.

This gives a new visitor a useful first signal without pretending that a
listed service fact is a personal preference. Saved, compared, and viewed
centres then add a separate, decaying history signal.

## Review taxonomy and evidence gate

Review collection is branch-specific. Each retained record must include its
public source, observed branch identity, retrieval date, permitted-use scope,
and enough positive evidence for the same level-two theme. The current gate is
at least two supporting reviews; when dates are available, at least two must be
within the recent review window. One review, an old review, a provider listing,
or a hard search fact stays unknown.

The classifier maps review text or an approved topic annotation to a level-one
theme and then to its level-two preference. It never converts an overall star
rating into a preference. For example, two recent reviews about parent updates
can support “Responsive team”; a published phone number cannot.

The September 22 short-care crawl publishes only derived themes for
branch-matched Google Maps public review pages. It does not publish full review
wording. At this point, communication evidence is supported for three
short-care branches; pickup, late collection, fees, and flexible short-care
preferences remain neutral until the corpus contains the required review
evidence.

## Ranking boundary

The current search remains the hard gate for care type, radius, location, age,
date, start and end time, pickup, conflicts, and the include-unknown setting.
After that gate, the ranking combines proximity and known fit, saved/compared/
viewed history, and the selected review preferences. Preference evidence is a
gentle capped nudge; unknown evidence contributes no match. The normal search
page uses the same rerank, so a parent does not need to open a separate
recommendation page. Explicit price, closing-time, and pickup sorts stay in
their chosen order.

The UI uses plain language such as “Matches what you value: Responsive team”.
It does not present a single childcare score, and it never implies that a
centre is available just because a review mentions a related service.

## Reset and controls

The settings action “Clear local cache” removes preferences, history, and saved
centres from this browser, then returns to the landing page so the next visit
starts as a new user. The preference page can be reopened from the landing
flow; the map no longer contains a second compact onboarding card.
