# Map navigation and compact choices

Local preview: `http://127.0.0.1:4187/#discover`. No deployment in this revision.

## References inspected

- [Apple: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/): read the official material guidance, including a distinct control layer and sufficient separation from content.
- [Apple's design announcement](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/): inspected the actual Safari example showing an anchored translucent menu. This informed the material layer, not the webpage's structure.
- [Navbar Gallery](https://www.navbar.gallery/): inspected the gallery and its static-navigation collection after the user rejected the first green glass treatment.
- [Supaste gallery entry](https://www.navbar.gallery/navbar/supaste): inspected desktop and mobile visuals; borrowed the compact grouping of navigation, not its black palette.
- [Solidroad gallery entry](https://www.navbar.gallery/navbar/solidroad): inspected the quiet light navigation against a full visual background. These are gallery screenshots, not a claim that the reference products' live interactions were tested.

## Applied design

- The map extends behind three compact desktop navigation groups: brand, primary navigation, and help/settings. Phones combine them into one compact bar. The current destination uses a filled capsule instead of a full-width header and underline.
- Search is split into an address capsule and a separate strip for care/date/age/times/filters. Both remain directly on the map; the full search panel stays optional.
- Neutral off-white translucent surfaces retain a very slight green cast. There is no yellow gradient or thick bevel. Deep green identifies the current destination and the primary search action. Centre text cards use a more opaque surface than small controls.
- Backdrop blur and soft edge/shadow treatment are CSS approximations, not Apple's native optical refraction. No external images, shaders or animation dependencies were added. Dark mode has its own smoky green material; unsupported blur, increased contrast, forced colours and reduced-transparency preferences receive opaque surfaces.
- Entry/exit fades and reduced-motion behavior remain. The material never transitions card coordinates, blur intensity or geographic anchors.
- Age and care type use two 46-pixel-high rows in a 180-pixel-wide menu, without a redundant heading or close button. Selecting a new value closes the menu and restores focus. Escape or clicking outside closes it. Date uses a narrower panel; filters retain room for their actual content. Time pickers omit the repeated question and time header; map pickers are 236 pixels tall where space allows. The full question remains available to assistive technology.
- EQUALPATH wordmarks have no trailing decorative slash, including the landing and entrance views.
- Menus anchor below their own control and clamp to the available width. Their layer is above the nearby/saved-centre controls. Address suggestions remain above the conditions strip. Card placement reserves the actual bottom edge of the search dock, including the new navigation offset.

No provider data, ranking, saved items, message content or live deployment was changed.

## Verification

- 28 focused browser scenarios passed: map cards, discovery, map-only search,
  compact choice menus and time editing. Covered 320/390-pixel phones, desktop,
  dark/reduced-motion mode, normal card animation, outside-click saving and
  geographic-anchor stability. Evidence: `.build/map-glass-final`.
- The new menu checks cover compact dimensions, alignment to the trigger,
  viewport bounds, a reachable 44-pixel-or-larger choice, selection, restored
  focus and Escape. Screenshots were visually inspected at desktop and phone
  sizes, including dark menus.
- Production build and whitespace checks passed. The existing bundle-size
  advisory remains. The unrelated full browser suite was not rerun.
- The actual local published-catalogue preview was inspected; the new Saved
  navigation still opened the existing TASKA ADAM UWAIS entry. No saved data was
  edited. These are implementation checks, not an older-adult usability study.
- Continued the actual map-only journey at the existing public-address pickup:
  selected age 1–3, entered 13:00–17:00 using the compact time menus, and searched.
  Three cards appeared among six returned centres. Opened Reliable Childcare
  Centre @ Damansara Perdana, then Contact the centre, then Get ready for child
  care. The centre name, age, date and times were carried through; preparation
  exposed both time-edit controls. Returned to the map. No call, WhatsApp
  message or booking was sent.
