# Epic 8 · Plan for two children (2 October 2026)

Short-term care ("A few hours") for two children on one date, with one adult doing the
drop-off and collection runs. Lives inside the main map search. Code: `shared/two-child.mjs`
(pure planning rules), `src/useFamily.js` (searches and drive times), `src/TwoChildren.jsx`
(map panel and Checklist card), `src/two-children.css`; tests: `tests/two-child.test.mjs`.

## Decisions (user, 2 Oct 2026)

- Persona unchanged: children of different ages are a normal case.
- The same adult does both runs. A different collecting adult is out of scope.
- It only needs to recommend; ten combinations are enough.
- Later the same day: EqualPath is short-term care only. The Care type chip and the
  side-panel care-type choice are removed (see "Short-term only" below).

## How it works

The user asked for the simplest possible flow ("a grandmother could use it") that reuses
the map design, chose "inside the main search" and "tell her when to leave".

1. **Who needs care.** The Age chip opens one menu: 1 child / 2 children, each child's age
   (1–3 or 4–6), and "Child 2's times: same as Child 1 / different" (Start/End pickers for
   Child 2 when different). With two children the chip reads "Children · 2 · 1–3, 4–6" and
   "Getting there" is hidden (the adult brings both). Start/End are Child 1's times, and
   Child 2's unless set differently.
2. **Search.** Find childcare runs one ordinary short-care search per child (transport `self`,
   known mismatches excluded, `sort: "recommended"`, the same interest `seedIds` as the main
   search), then road times through the existing `routes` action (see "Road times" below).
3. **Recommendation.** Each child's list is put in the same Recommended order as the main
   search with `personaliseSearchItems` (saved centres, history, chosen preferences). Each
   option gets a score:
   - average of both centres' Recommended rank (top = 1, last = 0);
   - +0.25 when both children go to the same centre (one stop), unless the preference
     is "separate";
   - +0.1 when listed details fit both, +0.1 when both centres can be contacted;
   - −0.025 per minute of drop-off driving (capped at 90 minutes), so a long detour loses
     to a slightly less preferred but closer pair.
   Options without a road time go last. The card shows the personal reason in short form,
   e.g. "Matches: Kind teachers".
4. **Options on the map.** A glass panel (bottom sheet on phones) lists the best three
   options; "Show N more" reveals up to ten, built from same-centre options and pairs from
   each child's first five conflict-free centres. Each card shows the map pin numbers of its
   centres, "one stop / two stops · about N min by car", "Leave by HH:MM", and what to ask
   the centre. The map shows only those centres (Compare is hidden here). On wider screens
   the first three distinct centres of the top options are "Suggested" and get the same
   floating map cards as a one-child search, with "For Child 1 / For Child 2 / Fits both
   children"; cards and the map fit keep clear of the panel (`leftInset`). Phones keep the
   bottom sheet and pins only.
   If either child has no centre, the same "No confirmed match" box with the Kiddocare and
   Babysits Malaysia links as a one-child search appears under the dock, and the panel says
   which child has no match and offers "Search within 10 km".
5. **Plan.** "See plan" opens a numbered timeline: leave by → drop off → leave for pickup →
   pick up, with a Call button per centre and "Ask: …" for open checks. Pin 01/02 match the
   stop order. Leave-by = planned handover − 5 min handover − drive time, rounded to the
   earlier 5 minutes; the better stop order is the one with the later leave time. The
   timeline is always shown: a journey that needs a change shows the times one person would
   actually manage in the fix's order, with "N min after Child 2's start/end time" on the late
   stop; a journey whose centre-to-centre time did not load shows the likely order and
   "Drive time from the last stop didn't load", with Try again.
6. **One-button fix.** If one adult cannot make both handovers (or pickup would have to start
   before the last drop-off), one button offers a single, re-checked change that shortens
   care where possible (drop Child 2 later / pick Child 1 up earlier), rounded to 5 minutes.
   Both journeys' changes are combined into one button. Applying it re-runs both searches.
7. **Ask and keep.** Copy a message per centre (one message about two places for a shared
   centre), Save to Checklist (a dated draft), or download the plan. Pickup starts from the
   starting point unless she changes it.

## Road times (2 Oct 2026, after live testing)

The live `routes` action calls the public OSRM service (routing.openstreetmap.de). From the
Function it answers roughly one table request every few seconds; a second request soon after
times out (about 6 s), and the server then pauses routing for 30 s ("service_busy"). The first
version asked for a road time from every pooled centre (up to 11 requests), so most
centre-to-centre times failed and two-centre plans showed no timeline. Now:

- One request for start → the ten centres most likely to appear (`startIds`).
- Centre-to-centre times only where they can change the three options shown first
  (`nextLegCall`): a pair without its time is scored with the shortest drive it could have (the
  longer start leg); it is looked up only while that best case could still beat the third fully
  known option. Each pair needs one direction per journey (`legsNeeded`: the earlier handover
  first; at equal times, the centre nearer the start first). Pairs more than 10 km apart are
  never requested (the routes action rejects them).
- Opening a plan fetches whatever that option still needs, including the other direction when
  the likely order needs a change (`ensure` in `useFamily.js`).
- One request at a time with 1.5 s after each reply; a busy reply waits 31 s once ("The map
  service is busy. Trying again in about half a minute…") and asks again. Road times are never
  estimated from distance (AGENTS.md).

Live check on 2 Oct (Monash University Malaysia, 5 Oct 09:00–12:00, 1–3 and 4–6): options and
two-centre plans loaded with drive times from the production API.

### One request for all road times (`matrix`, 2 Oct evening)

Measured from the user's Mac: one OSRM table request for the starting point plus ten centres,
every direction, took 0.7 s; the per-origin lookups above took about 10 s (40 s when busy).
The search Function now has a `matrix` action: public IDs only (at most two result pages,
all within the search radius of the starting point), one table request with the start and
every centre as sources and every centre as destinations, the same queue, 30 s pause,
budget and per-pair cache as `routes`. `useFamily` asks for it first and falls back to the
per-origin lookups when the published Function answers `UNKNOWN_ACTION`, so the site keeps
working until the Function is republished. A family search is then: two searches + one
matrix request, the same routing cost as a one-child search; opening a plan needs nothing more.

### Hide the panel; the plan on the map (3 Oct)

- The panel has a hide button (top right; a down arrow on phones). Hidden, it becomes one
  pill under the search bar ("Show the options" / "Show your plan"); a new search opens it
  again. The map refits to the space it frees (`leftInset` 0), and on phones the centre
  cards appear in the bottom rail while the panel is hidden.
- Opening a plan fits the map to that plan's centres and the starting point and shows a card
  for each centre with whose care and the times ("Child 1 · 14:00–18:00", "Both children ·
  …"); pins 01/02 follow the stop order. The panel scrolls back to the top.
- Map fitting keeps at least 120 px for the pins (padding shrinks on small windows instead of
  the map refusing to move), and the desktop card rail starts right of the open panel.
- Smooth changes: the panel slides out to the left (sinks on phones) before the map moves,
  and slides back in from its tab. While the map moves by itself (fitting results or a plan,
  the panel opening or closing) the floating cards are hidden and appear once at their final
  place; re-placing them on every frame made them jump, switch to the rail and fade out at old
  spots. A pin the parent selects still keeps its card while the map centres on it.

## Short-term only (2 Oct 2026)

- The app always searches "A few hours" (`careType: "short_term"`, today's date, 5 km by
  default). The Care chip, the side-panel choice and the `?care=regular` link are gone.
- Reopening a saved centre that only offers regular childcare shows "… only offers regular
  childcare, which EqualPath no longer covers." instead of opening a regular search.
- Server, API and shared regular-care code are left in place (unused by the UI) so older
  links and tests keep working; nothing in the live data changes.

## Fixes

- "Different times" for Child 2 could not be used: the time picker is drawn outside the
  Age menu, so picking an hour counted as a click outside and closed the menu. The dock's
  outside-click check now ignores the time picker.
- After the Care chip was removed the dock kept its seven-column width and left an empty
  block. The dock is now only as wide as its chips (`auto` columns): 600 px with two children
  (five chips), 720 px with "Getting there" (six chips); 520/640 px at ≤960 px. Phones use two
  full rows: date, age, more / start, end (and getting there).

## Boundaries

No child identity, saved request, history, booking or contact. The planner and the family
plan live in memory and are cleared when switching live/demo. Demo centres have no drive
times, so runs cannot be checked there.

## Verification (2 Oct 2026)

- `npm test`: 278 passing (26 E8 tests: the proposal's worked examples, leave-by times and
  fixes, recommendation ordering, which road times are requested, and plans with a late stop
  or a missing centre-to-centre time).
- `vite build` succeeds.
- Local browser walk-through at 1440×900 and 390×844 with the real bundled catalogue
  (KL Sentral): who-needs-care menu, Different times (15:00 / 18:30 kept, menu stays open),
  dock chips Date / Age / Start / End / Getting there / More, options in Recommended order
  with "Matches: Kind teachers", same-centre and two-centre plans, the combined fix, messages
  and Checklist. That sandbox could not reach OSRM, so road times came from a local stand-in.
  Separately, the public API returned real start→centre and centre→centre drive times from
  the user's Mac; back-to-back route requests were refused, hence the spacing.

## Centre comparison (6 October 2026)

The map cards now offer Compare for up to three centres in two-child mode. The comparison checks every selected centre for both children through the existing compare API, including centres that did not appear in one child's search. Age, short-care admission and care-hour states remain separate per child; unknown evidence stays unknown. Each fee uses that child's own times. A same-centre total is shown only when both computed amounts are known and use the same currency; no sibling discount is assumed.

This compares centres, not two-stop itineraries. The table keeps the selected order and offers separate, labelled contact messages for Child 1 and Child 2. Phones show two centre columns with a selector for the third. Changed search inputs require a new search; switching back to one child clears the comparison. Both API replies must match the search catalogue version and include every selected ID. A partial or failed reply never becomes a one-child result in the family table.
