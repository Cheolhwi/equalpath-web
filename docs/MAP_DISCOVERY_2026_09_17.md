# Map discovery: floating search and centre cards

Local preview: `http://127.0.0.1:4187/#discover`. This revision is local only.

The subsequent floating navigation, neutral glass surfaces and smaller option
menus are documented in [Map navigation and compact choices](MAP_GLASS_NAVIGATION_2026_09_17.md).

## Inspected references

- [Google Maps](https://www.google.com/maps/@3.139,101.6869,13z?hl=en): inspected the actual search field, separate function rail and compact icon-and-word controls. The search stays available independently of optional panels.
- [Felt public tutorial map](https://felt.com/map/Tutorial-Learn-to-Use-Felt-09AL7PoX7TEuM7X9A0gF5D1B): inspected the actual full-canvas map, compact top toolbar and small floating controls.
- [Felt UI upgrades](https://felt.com/blog/ui-upgrades) and [map design guidance](https://felt.com/blog/how-to-design-a-beautiful-map): use a quiet base map and clearly separated foreground controls; hide secondary panels until needed.
- [Mapstr](https://en.mapstr.com/): inspected its official phone-map visual, including compact entry controls, readable location markers and light map composition. The app's authenticated interactions were not tested.
- [MapLibre anchored popup example](https://maplibre.org/maplibre-gl-js/docs/examples/attach-a-popup-to-a-marker-instance/): opened its actual example and selected a marker to inspect point anchoring.

These inform the hierarchy and interaction, while EqualPath retains its own
ivory, dark green and sage identity. No reference artwork was copied into the app.

## Resulting interface

- The map fills the workspace. An address field and compact care/date/age/time/filter controls sit directly on it. Users can search, change filters, choose an address or map point and enter a centre without opening the sidebar.
- The full sidebar remains an optional alternate view, initially closed on desktop and mobile. Its button sits beside the address. Close and Escape return focus there. Both views share selections and even unfinished address text, and only one form is mounted at a time.
- Date, age, care type and optional filters open locally. Time controls say “Go to childcare” and “Pick up child”; the picker asks the full departure/pickup question. The same short labels appear in contact and preparation timelines. Time selections save on outside click; Escape cancels.
- All centres and saved centres sit below the map search. The saved-centre count comes from the existing local library, preserving live/demo separation. Saving/reusing a search is under More filters.
- Successful searches close the panel and show up to three eligible recommendations directly on the map. The existing conflict, contact, fee and ordering rules decide membership; the UI never fills missing slots with ineligible centres.
- Selecting any pin shows one compact card near its geographic point. Numbered badges and leader lines connect each card to its marker. Panning moves these cards without issuing data queries. The old fixed bottom-left preview is removed.
- Clicking empty map space clears the selected centre and returns to the recommendation previews, like closing the selected card. Dragging, zoom controls, centre cards and other pins do not accidentally clear selection. While choosing a pickup point, map clicks continue to move that point instead.
- Card placement tries nearby positions and available viewport space, avoids other cards and pins where space allows, and supports coincident points. Cards reserve space for the search and zoom controls. At very short phone heights, names use one line and the full name is available when the card opens. Each card can be closed to reveal covered pins; Fit restores the recommendations. The pickup-on-map action remains available beside the address.
- Each card opens the existing centre-details journey. Name, road-time estimate and fee remain visible; fee bases and estimate labels are preserved. No availability or agreement is invented.
- Panel transitions take 220–260 ms. Card entrances take 260 ms and exits 200 ms. Exiting cards are inert and hidden from accessibility APIs. Reduced motion removes these effects.
- Selection motion keeps the card's existing offset from its pin, clamped to the viewport, instead of rerunning the placement competition on each camera frame. Departing cards retain their last rendered rectangles for the fade. This fixes the reported 01 jump: previously both the selected card and the shrinking exit group could switch positions during the map's recentering animation.
- Modified or pending searches hide previous cards. Empty results and required-field errors stay with the map controls; an invalid date or age opens its own control. Map errors offer the centre list.

## Palette and accessibility

Light map: ivory background `#f0efe8`, sage parks `#dce3ce`, muted water
`#cbdad5`, near-white roads `#fffefa` and grey-green labels `#737b6c`.
Buildings and railway lines are quieter; small POI and house labels appear
only when zoomed in. The existing flat map, attribution, dark palette, zoom
controls, visible focus and labelled 44 px pin buttons remain.

## Verification

- All 179 domain tests passed, including dense-point card placement below a tall search dock.
- 43 distinct focused browser scenarios passed after fixes and reruns, across map-only search, shared sidebar state, map cards, location selection, simplified search, saved reminders, tour restoration, time inputs and editable preparation times. The main run passed 40/41; a 14-scenario rerun passed the repaired small-screen marker case and all affected card/time flows, including two preparation cases. Viewports include 320 × 568, 390 × 844, 320/390 × 900 and 1440 px desktop.
- Covered: three recommendations, overlapping geographic coordinates,
  selected-card movement, entering details, return to list, saved-centre
  persistence, dirty/empty/error states, no pan-triggered data requests,
  outside-click time saving, Escape and reduced motion.
- Production build and whitespace checks passed. The full unrelated browser
  suite was not rerun for this revision; older tests may still assume the
  former always-open search panel.
- Actual local preview was checked with the published catalogue using only the map controls. Little Explorers Child Care Centre, Learning Fresh — Damansara Heights and Little Playhouse — Menara Shell appeared as three recommendations. The updated departure question was opened and inspected. Existing saved-centre state remained intact.
- Automated screenshots and results are under `.build/map-search-dock-final` and `.build/map-dock-recheck`.
  These are implementation checks, not a usability study with older adults.

The subsequent position-jitter fix passed all 180 domain tests and 21 related
browser cases (`.build/map-jitter-final`), including frame-by-frame checks with
normal animation enabled. The pre-fix regression reproduced departing-card
repositioning. The actual Kawan-Kawan search was also rechecked: selecting 01
(Learning Fresh — Damansara Heights) maintained the same relative card offset
across 203 position samples. Build and whitespace checks passed.

No deployment, provider-data edits, contacts, bookings or external board changes
were performed.
