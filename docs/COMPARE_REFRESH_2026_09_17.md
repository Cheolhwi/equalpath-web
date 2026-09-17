# Comparison and remaining map surfaces

## Changes

- Compare now puts fee, estimated driving time, actual age range, short-time offering and care end time first. Generic `Matches` and `Confirmed range` pills are replaced with values and context-specific wording.
- Pickup-service details appear by default when requested. Any conflicting pickup check stays visible. Addresses, registration, explanations and sources remain available through disclosures.
- Desktop keeps all selected centres side by side. Phones show two readable columns, with a `Change centres` control for a third selection. Centre names and Contact actions stay visible during scrolling. Removing a centre and server-owned priority/tie logic are preserved.
- The bottom Compare tray and map-point confirmation use the existing ivory, sage and green rounded controls. Picking mode moves zoom controls away from the confirmation card; duplicate instructions are removed. Coordinates are folded away.
- Messages appear in a centred, dismissible surface. Entering discovery focuses the app container instead of the address input; deliberate keyboard search and missing-field focus still work.

## References

- [Navbar Gallery](https://www.navbar.gallery/): continued use of the current grouped, rounded navigation language.
- [Apple Compare](https://www.apple.com/iphone/compare/): aligned attributes and persistent product identity.
- [NN/g comparison tables](https://www.nngroup.com/articles/comparison-tables/): short comparable values, limited default attributes, progressive disclosure and a two-item mobile comparison.

## Verification

- `tests/browser/compare-refresh.spec.mjs`: 6 passed. Widths 320, 390, 768 and 1440; column containment; mobile pair order; hidden extra facts; long-term mode; initial input focus; map confirmation/zoom separation; centred message dismissal. Screenshots: `.build/compare-complete/`.
- `tests/browser/comparison-priority.spec.mjs` and `tests/browser/surfaces.spec.mjs`: 4 passed, including tied rankings, removal, contact and preparation continuation, light/dark surfaces. Evidence: `.build/compare-verified/`.
- Two targeted landing tests passed for reduced-motion keyboard entry and missing-artwork entry: `.build/entry-focus/`.
- `tests/comparison-view.test.mjs`: 3 passed. Unknown data, source-based age guidance, conflicts and self-handled pickup retain their meaning.
- Production build and whitespace checks passed. Existing bundle-size advisory remains.
- Local preview on port 4187 visually checked with the published Little Playhouse KL Sentral, Little Explorers and Learning Fresh Damansara Heights records. Automated cases use controlled fixtures. No deployment or external contact was performed.

Published service information is not a booking or date-specific acceptance. Estimates, type-based age guidance, conflicting sources and unknown values remain distinguishable.
