# Simple search and plain English

Local preview: `http://127.0.0.1:4187/#discover`.

The default is “Short time”; “Long term” is a secondary tab. No preliminary
care-type screen or automatic tutorial interrupts search. Quick tour remains
available on demand and restores the user's actual inputs when closed.

The September 17 map revision now opens with the search panel collapsed on
desktop and mobile. A floating Find childcare / Change search button opens
the form. See [the map revision](MAP_DISCOVERY_2026_09_17.md) for its visual
references, point cards and focused verification.

## Journey review

| Screen | Main question or action | Changes and checks |
| --- | --- | --- |
| Home | Find childcare | One clear entry; artwork loading never blocks entry. |
| Search | Where, date, age, leave time, pickup time | Everyday questions, required age ranges, optional preferences folded. |
| Results | View centre | Age, driving time and fee lead each card; save and compare are secondary. |
| Centre details | Contact the centre | Main action near the key facts; request details and unknown checks folded. Known conflicts remain expanded. |
| Compare | Contact the centre | Contact button beside each centre name; extra checks, addresses and evidence expandable. A conflicting check remains visible even when extra checks are folded. |
| Contact | Call or WhatsApp | Search details open by default; a readable message is optional help. No question tags or mandatory copy step. |
| Prepare | Get ready for child care | Three illustrated journey stops and independent packing cards; details folded. |
| Saved | Use this search | Reuse is explicit, clears date/age, and does not submit automatically. Save/edit/remove flows remain covered by browser tests. |

## Search

- Short care shows the address, date, age and both times. Long-term care needs
  an address and age, without a date or time requirement.
- The address input keeps an accessible label (“Where will your child leave
  from?” or “Where do you need care?”), without a repeated visible heading.
  Age is required in both modes: `1–3` or `4–6` years, with neither preselected
  for a new search. Its visible label is simply “Age”.
- The time questions are “When will your child leave?” and “When will you pick
  up your child?”. Icons distinguish the starting address from childcare; the
  repeated location helper lines are removed. Arrival at childcare remains a
  separate unknown. The region subtitle and “Malaysia time” beside Date are
  also removed from the search form.
- Saved centres appear directly above the search form, with the latest saved
  centre's name and a count. Both this row and the “Saved centres” link below
  the form open the childcare tab, even after viewing saved searches. The
  general Saved navigation prefers centres when any exist. Existing saved
  data is retained; this shortcut does not submit a search automatically.
- Changed picker selections save on an outside click, Done or keyboard
  completion. Escape cancels; dismissing an untouched empty picker leaves it
  empty. Search and saved-search editing share this behavior.
- Optional pickup help and filters start closed. Validation retains input and
  focuses the field needing correction. The search form has no coursework or
  researched-centre notice.

## Contact first

The contact page opens with the centre name, date and age. Full request details
are open by default and can still be collapsed. The redundant “Ask if your child
can come” heading is removed. Published Call or WhatsApp actions follow the
search details; no message is sent automatically.

“Not sure what to say?” shows the actual greeting and two actual questions.
“Read all N questions” reveals the full message. “Copy message to send” is a
secondary action, followed by “Now paste it into WhatsApp or a text message.”
on success. Failed clipboard access retains the manual-copy fallback.

The rejected checkbox tags are removed. “Change the message” contains optional
full-question selection and reordering. Selections still control the preview
and copied message, retain stable API question IDs, and persist when reopening
the same centre/request. Removing every question disables copying but leaves
contact actions available; “Use suggested message” restores the questions.

Provider-specific questions also use everyday words: for example, “Do you
still offer childcare for a few hours?” replaces “ad-hoc”, “enrolled” and
“place”. Booking notice, holiday-only care, staff looking after the child,
maximum stay and toilet requirements remain represented in relevant questions
or their unchanged source-backed requirements. Unknown future source wording
is retained rather than guessed. Condition-derived conflicts and original
evidence remain available in the editor.

“After the centre says yes” introduces “Get ready for child care”. Creating a
checklist never records an agreement or changes provider availability.

## Visual preparation

“Get ready for child care” uses one main column. The centre and date lead to
three illustrated stops and independently tickable packing cards. Bag, spare
clothes and water are separate items. Each card has a short label and folded
Details. Addresses, further questions, sources and explanations are expandable.
The draft state and unresolved conflicts remain visible. The middle stop shows
the selected centre's name in preparation, contact and centre details. Arrival
time still needs to be agreed in the expanded details; no time or provider
agreement is inferred. Print/download retain independent ticks and detailed
offline instructions.

Leave and Pick up times in the final short-care checklist are clickable, with
a pencil icon. They reuse the themed picker: Done and clicking outside save;
Escape cancels. Pickup has to be later than leaving on the same day. Invalid
edits show a short error and retain the previous valid time. Editing keeps
existing ticks, rechecks conditions and cost against the loaded centre facts,
updates packing prompts, and supplies the new times to contact messages and
print/download. It does not resubmit the discovery search. The original search
snapshot remains separate so editing this checklist does not falsely claim the
search changed. A genuine later search still offers an explicit checklist update.

The time-edit follow-up passed 17 browser scenarios across preparation, saved
items, short/long-term flows and shared time controls. New 390 px and 1440 px
checks cover outside-click saving, Escape, invalid time order, retained ticks,
changed conflicts/packing, exported times and copied messages. Build passed;
320 px dark layout and the actual local TASKA ADAM UWAIS picker were inspected.
Evidence is under `.build/preparation-edit-times`.

## Data meaning

Age ranges cover completed ages: `1-3` means 12 to under 48 months; `4-6` means
48 to under 84 months. Only a fully covered range passes. A disjoint range
conflicts; partial overlap requires checking the exact age. The younger range
retains feeding and spare-clothes prompts. Historical exact ages remain valid
in the API; the current search form requires a range. Saved templates omit age.

Short/long-term catalogue membership, distance limits, ranking, fee periods,
registration meanings and source disagreements are preserved. UI work did not
edit live directory records, owner data, billing or external cards.

## Verification

The subsequent map-first search redesign is documented in
[`MAP_DISCOVERY_2026_09_17.md`](MAP_DISCOVERY_2026_09_17.md). Compact map controls
now complete the search independently; the full sidebar remains optional and
shares the same input state. “Go to childcare” and “Pick up child” replace the
ambiguous one-word timeline labels, with the precise departure/pickup question
shown in the time picker.

The September 17 search cleanup passed 32 related browser scenarios, including
320 px and 1440 px checks for saved-centre visibility, reload persistence, correct
saved-tab selection, empty-state removal, required age and short/long-term search.
Build and whitespace checks passed. The actual local preview displays the user's
existing TASKA ADAM UWAIS in the new shortcut and opens it in Saved for later;
its saved record was not changed. Evidence is under
`.build/short-time-saved-centres`.

A manual local walkthrough used the current published catalogue: home, short
care search, real centre details, comparison, contact and preparation. Contact
content was visually checked using TASKA ADAM UWAIS; the old provider question
was caught in that walkthrough and simplified. No calls or messages were sent.
Saved screens were inspected separately; controlled browser tests cover their
mutations without changing the user's existing saved items.

- The full browser run passed 75 of 77 scenarios. Two older read-budget tests
  assumed long-term care was the default and used obsolete action names. They
  were updated to explicitly choose long-term care and the current controls;
  both passed on rerun at 1440 px and 390 px.
- The comparison rerun also verified contact buttons in the column headers and
  expanding/collapsing extra checks. The five contact-page tests were rerun
  after the final provider-question wording change.
- Comparison ordering explanations are folded with “How are these ordered?”.
  Final comparison/contact-ranking reruns passed, along with 24 related domain
  checks. Returning from empty Saved to search also passed at 390 px and 1440
  px without submitting or showing validation errors.
- Coverage includes 320 px/390 px and desktop layouts, required age, search
  failure recovery, outside-click saving, keyboard cancellation, selections,
  clipboard fallback, saved searches, printing, dark mode and reduced motion.
- All 174 domain tests passed before the final provider-question change; all
  five enquiry-view tests passed afterwards, including the new requirement-
  preservation case. The production build and entry-asset checks passed.
- Screenshots are under `.build/journey-full`, `.build/journey-recheck` and
  `.build/journey-contact-final`.

These are implementation checks and a manual walkthrough, not an older-adult
or non-native-speaker usability study, and not evidence of provider availability.
The earlier live database read-quota failure was addressed by a separate change
to a validated published catalogue. Current local searches succeeded during
this walkthrough. This UI iteration has not been deployed; local results do not
establish the current state of the public production site. Frontend and
age-range API support need compatible release versions.
