# Saved shortcuts and shared task surfaces

Local preview: `http://127.0.0.1:4187/#discover`. No deployment in this revision.

## Direction

The user clarified that "last time saved" means previously saved childcare and
searches, not a save timestamp. They also requested the Compare, childcare and
other windows follow the map's updated design, keeping its current palette.

Inspected the desktop/mobile reference images in Navbar Gallery's
[Solidroad](https://www.navbar.gallery/navbar/solidroad) and
[Supaste](https://www.navbar.gallery/navbar/supaste) entries. Adapted compact
navigation grouping, contained surfaces and a clear primary action; did not
copy their branding or palettes. EqualPath keeps ivory, dark grey-green and
sage, with matching dark mode.

## Changes

- The map shows Saved centres and Saved searches directly beneath search.
  Where records exist, each shortcut previews the most recently saved/updated
  name and opens the correct library tab. The library puts recent records first.
  A small phone uses a labelled List icon to retain room for both saved shortcuts.
- Existing browser-local, mode-separated storage remains authoritative. No
  automatic search history, dates or child ages were added to persistence.
  Reuse still clears the date and age and requires an explicit new search.
- Dialogs share a rounded frame, compact sticky title/close bar, quieter borders
  and grouped actions. Empty Compare is narrower than a populated comparison.
  Saved items use segmented tabs and individual cards. Centre metrics, contact,
  packing cards, editors and settings use the same surface treatment.
- Comparison retains aligned facts and expandable evidence. On phones, one
  centre column fits beside the row labels; horizontal scrolling reveals the
  other centres. The primary contact action stays in each centre header.
- Measure the full map overlay, including saved shortcuts, for card placement.
  Small-screen cards keep their title and truncate the compact fee line rather
  than losing the centre name. The bottom inset still reserves map attribution.
- Existing entrance/exit animation, Escape, outside dismissal, focus restoration,
  reduced-motion behavior and preparation time editing remain.

## Verification

- Targeted browser evidence: `.build/saved-and-surfaces-final` and
  `.build/saved-and-surfaces-small`. The 30-case run passed 29 cases and exposed
  a short-phone bottom-inset regression. Restored the original attribution
  clearance, compacted the short-screen search controls (44-pixel targets),
  and passed all three affected short-phone scenarios on rerun.
  The final seven surface/time-picker scenarios also passed after the last
  alignment adjustments; evidence is in `.build/surface-final-check`.
  Covers map-only search, existing/reloaded/deleted saves, search reuse,
  320-pixel small-screen card placement, centre/compare/contact/preparation,
  time editing, normal/reduced motion, keyboard closing and dark mode.
- Visually inspected screenshots for desktop and phone layouts, including long
  names and empty states. The actual local preview displayed the existing
  TASKA ADAM UWAIS save; its library had no saved searches. No user save was
  created, modified or removed during that check.
- Production build and whitespace checks pass; the existing bundle-size
  advisory remains. The full browser suite is not a release claim: older
  centre-details and result-reveal test setups still assume the full search
  panel is initially open. Those attempts were stopped at setup; the new
  surface journey uses the current map/panel controls.
