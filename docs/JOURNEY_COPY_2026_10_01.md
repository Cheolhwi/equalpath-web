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

## Round 3 — fixes from a parent's walk-through (1 October, afternoon)

Walked in the real local preview (real map, address search and routes) as a
parent: phone, “tomorrow 9–13 near KL Sentral, child is 2, I’ll bring her”;
desktop, the same plus comparison and checklist. Regular care was left as it
is: the user said it is an extension and should not be changed.

Fixed:
- Checklist with no chosen centre: the shortlist buttons spilled out of the
  dialog on phones (grid items could not shrink).
- Result card and centre details now count the same “things to ask”. Arrival
  time is never counted; details show it once as “Always ask: is there a place
  on your date, and what time should your child arrive?”.
- Comparison: “Open at 13:00” read like an opening time. Now “Still open at
  13:00” / “Not open at 13:00” / “Ask about 13:00”.
- Age explanation says what to ask: “Your child is 1–3 years old. This centre
  lists 18 months–under 6 years, so ask first if your child is younger than 18
  months.”
- Data and API wording is shown in plain English through
  `shared/plain-copy.mjs` (presentation only, like `enquiry-view.mjs`): no
  “current provider data / user-provided completion sheet”, double full stops,
  raw service codes (“drop_in”), “1 hours”, or internal notes. Source names
  read “EqualPath research sheet” / “EqualPath fee sheet”; dates read
  “Checked 14 Sep 2026” instead of “Retrieved 2026-09-14 · Publication date
  not listed”. The API, conditions and search index keep their wording, so no
  Function or data publication is needed.
- “About our information” is split into short headed sections in plain words.
- Checklist wording no longer uses “pickup” for two things: the morning trip
  says who takes the child to the centre; the afternoon says “collect”.
- Results panel: the search summary is one block with its own Change search
  button; the extra “Your search” row and “Saved centres” link are gone once
  there are results. Cards are shorter and Save / Compare / Details share one
  row (the list button now says “Details”, like the map cards).
- Centre details: the things to ask are open, each with its reason; the banner
  appears only for mismatches or when everything matches; on phones the
  checks come before the contact card (the agreed decision order); fact tiles
  use smaller type on phones.
- Map: a newly chosen starting point is placed below the search box (a
  one-off offset, not camera padding, which had stopped later fits); after a
  phone search the map refits once when the search box shrinks and leaves room
  for the centre card; pins that touch on screen are nudged apart, also away
  from the “You” pin.
- Checklist on phones: the three stops are rows, not squeezed columns; packing
  items show their one line of advice instead of a “Details” toggle; “Driver’s
  details” became “Centre address” for parents who bring their child.
- Date: “Today” / “Tomorrow” buttons, and the chosen date is written out
  (“Friday 2 October 2026”) because the browser’s own date box follows the
  computer’s locale (10/01/2026).
- Time picker lists minutes in 5-minute steps. An exact minute can still be
  typed (in the picker or the field) and is never rounded.
- Address search suggests places after a 600 ms pause in typing (3+ letters);
  Enter or the search button still search at once. Identical results are shown
  once.
- “Getting there” (I’ll bring / Centre pickup / Not sure) is its own search
  chip for a few hours of care, instead of being inside More filters.
- First visit: a small “New here?” card offers the tour once (Show me / Not
  now). The tour still never starts on its own.
- The search summary keeps the place and Change search on one line and lets
  the details use the full width below, so 320 px phones don't squeeze them
  into a thin column.

Browser tests updated for this round: wording (`phase4-5`, `fees`,
`comparison-priority`, `enquiry`), and `map-search-dock` now uses the
“Getting there” chip. A run of the same specs on the code before this round
(with the parallel Recommended-order work) showed these failures already
there and unrelated to this round: `care-types:77`, `centre-details:19`,
`contact-priority:8`, `enquiry` (the fixture centre closes at 17:00 and is
hidden because centres that don't meet the search are hidden by default;
with that option ticked the enquiry and centre-details journeys pass),
`location-actions:34`, `map-cards:139`, `price-registration:7/69`,
`results:40/65`, `sort-availability:21`, `sort-menu:45`, `time-input:72`,
plus `compare-refresh:31`, `recommendations:60` and `tour:65/107` from
earlier runs.
