# Map card actions and responsive surface corrections

The floating map card now has a separate row of labelled Save, Compare and
Details buttons. Saved and comparison states come from the same existing
library and comparison selection used elsewhere. Before a first search,
Compare directs the user to the required visit inputs instead of an empty comparison.
Save opens the existing
centre/note editor; it does not create another storage mechanism. Each action
has a 44-pixel minimum height, hover/press feedback and keyboard focus support.

The layout follows the separation of content and supplemental actions in
[Material UI's card guidance](https://mui.com/material-ui/react-card/), using
EqualPath's existing ivory, dark green and sage colours. No new UI library.

Three recommendations remain floating on maps with enough room. Constrained
maps use a horizontally scrollable row of full cards instead of overlapping
them or compressing their controls. The map's zoom controls have a reserved
gutter. The existing fixed-offset selected-card positioning is retained.

The result drawer heading now covers its entire top edge while scrolling,
including the padding that previously exposed the result count above the
heading. Result actions and status labels use the same rounded treatment.
Dialogs now have a separate scrolling body beneath a stationary header;
their body scroll position resets when switching tasks. Phone and WhatsApp
links use rounded buttons matching other primary actions.

## Verification

- 33 browser cases passed in `.build/card-adaptation`: map search, cards,
  saved reminders, and centre/compare/contact/preparation surfaces.
- After final spacing and contrast corrections, all 15 map-card and responsive
  regression cases passed again in `.build/card-actions-final`. The desktop
  placement follow-up passed 16 browser cases in `.build/card-placement-final`
  and seven geometry checks, including a wide, short viewport and a two-column
  fallback for dense pins.
- The final four first-use/save/compare cases passed in `.build/card-first-use`.
  The first assertion was corrected to check the current map-input guidance
  and focus, rather than expecting the optional full sidebar to open.
- Responsive checks cover 320, 390, 927 and 1440 pixel widths, including a
  320 × 568 screen, long centre names, scroll positions, explicit save and
  comparison states, reachable actions, map deselection, normal/reduced motion,
  marker animation stability and result-button contrast.
- Actual local preview at `http://127.0.0.1:4187/#discover` was visually checked
  with the public listing for Little Playhouse — Menara Shell (KL Sentral),
  including the result drawer and scrolled contact dialog. Contact links were
  inspected without calling or messaging anyone. Fixture saves stayed in
  isolated browser tests; the user's saved library was not changed.
- Build and whitespace checks passed. This is local UI verification, not a
  deployment or a claim that the entire browser suite was rerun.
