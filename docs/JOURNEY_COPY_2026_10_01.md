# Journey copy and UI pass — 1 October 2026

The user asked for a journey-wide pass over wording and interface details on
`https://equalpathcare.me/#discover`. This changes presentation only: no search,
ranking, condition, fee or data rule changes, and no API contract change.

## One vocabulary across the journey

| Concept | Before (mixed) | Now |
| --- | --- | --- |
| Care type | Short time / Long term; Care for a few hours / Long-term childcare | **A few hours** / **Regular** (chips and choices); “A few hours of care” / “Regular childcare” in summaries |
| Short-care times | Leave → Pick up; Go to childcare / Pick up child | **Start** / **End** on every time picker (the user asked to keep these after briefly trying “Leave at / Care until”); summaries show the range, e.g. “09:00–13:00”; the checklist plan keeps “Leave for the centre / At the centre / Collect your child” |
| Search address | Pickup address, Your starting address, Leaving from | **Starting point** |
| Transport preference | Pickup help: The centre / I’ll handle it; Pickup not chosen | **Getting to the centre**: The centre picks my child up / I’ll bring my child (omitted from summaries when not chosen) |
| Map placement | Choose your location | **Pick on map** / Pick a location |
| Highlighted results | Suggested first, For you, ★ Nearest | **Suggested** (★) everywhere; personal reasons shown as the reason itself; comparison winner uses an award icon |
| Childcare | child care / childcare | **childcare** |
| Travel check | Travel time | **Arrival time** |

## Search and results

- Placeholders say what to enter: “Starting point, e.g. KL Sentral” (a few hours)
  and “Home, work or school, e.g. KL Sentral” (regular).
- Empty time pickers open on 09:00 for a future date, and the end time opens
  three hours after the start time. Typing and minute precision are unchanged.
  Time errors read “Choose a start time.”, “Choose an end time.” and “Choose an
  end time after the start time, on the same day.”
- Result cards show the same number as their map pin, a tidy locality instead
  of zone codes or repeated places, and a status that only counts what the parent
  still needs to ask. Arrival time is always a question, and pickup-service checks
  only count when the parent asked the centre to pick up; otherwise the card says
  “No known issues”.
- Area-estimate fees are shown in the muted colour so published prices stand out.
  `feeSummary` exposes `estimate` for this; the label keeps “Estimated”.
- “Why this order?” describes the actual order: nearest page, best fit first
  within the page, choices and saved/viewed centres can move a centre up, and
  mismatches are hidden unless the More filters option is on. Contact priority is
  still not explained, as agreed on 14 September.
- The short-care footer labels the researched collection as a coursework demo
  (the header badge has been hidden since 17 September).
- All-caps register names and districts are displayed in title case through
  `shared/display.mjs`. Source records and search keys are unchanged.

## Details, contact, compare, saved and checklist

- Details list “things to ask”, “things that match”, and a separate optional
  group for the centre’s pickup service when the parent has not asked for pickup.
- The contact message says where the child comes from and when the parent will
  collect them. Without a transport choice, the pickup question asks whether
  pickup is offered instead of assuming it.
- Dialog eyebrows that repeated the title were removed; only centre details keep one.
- For you: “Similar to …”, “Centres you’ve looked at”, and review-based reasons read
  “Parents mention: …” instead of “Based on your activity: …”.
- Reviews: the topic title is no longer repeated, and the balance line counts
  positive, concern and neutral mentions without contradicting itself.
- The checklist without a chosen centre offers the current shortlist (compared or
  saved centres in the results) directly.
- Settings: “Clear data on this device” instead of “Clear local cache”; the
  onboarding note now points to Saved → For you, where choices can be changed.

## Landing and onboarding

- The landing keeps the loader’s line “Find childcare that fits your day.” under
  the wordmark at a readable size, and its micro-labels are 9–10 px instead of 7–9 px.
- The motion toggle reads “REDUCE MOTION: ON/OFF” rather than a plus/minus sign.
- Onboarding asks “What matters most to you?” once, explains the effect, and drops
  the repeated “Pick up to 3” heading, the all-caps welcome line and the card
  inside a card. Desktop splits it: the EQUALPATH wordmark, question and decision
  (three filling slots, “N of 3 chosen”, Continue, Skip for now) on the left, the
  choices as one list on the right; with more choices open the decision stays in
  view. Phones and tablets stack it and keep the decision bar at the bottom of the
  screen. Selected choices fill sage with the tick at the end of the row; once
  three are chosen the rest dim. Every choice has its own icon. The onboarding
  supplies its own colour tokens, because it sits outside `.equalpath`.

## Fixes found on the way

- Quick tour step 6 failed on every run since 29 September: the tour compared the
  fixed `demo-river`, which is a known mismatch and is now hidden by default. It
  compares the next demo centre instead.
- More filters field labels no longer push their text to the right edge.
- The header’s settings button was a block box with an inline icon, so its gear
  sat 3px above the Quick tour icon; both header buttons now centre their icons.
- The empty rule under the results panel header is gone.
- On phones, the map’s locate/zoom buttons no longer sit on top of the results
  sheet or an open search popover.

## Not changed

- The “Nearest first” and “Search radius” labels, the three floating map cards,
  the Childcare/For you tab names and “Parent review” headings stay as the user
  decided earlier.
- Age choices remain 1–3 and 4–6; adding “Under 1” needs an API change.
- Server-side condition reasons (`shared/conditions.mjs`) are untouched, so the
  live API wording stays in sync without a Function deployment.
