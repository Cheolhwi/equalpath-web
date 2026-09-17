# Direct location actions

- Address search now includes two equally styled, always visible actions: **Choose your location** and **Use my location**. Both the map dock and optional sidebar share the same component and cancellation logic.
- Removed the location dropdown and the bottom-left **Choose pickup here** entry. Manual selection opens the map immediately, then keeps the existing confirmation/cancel flow.
- The chosen-location marker reads **You**. Its accessible label identifies it as the chosen location; it does not claim every manually selected point came from device GPS.
- A pending device-location request can be cancelled or replaced directly by map selection. Late callbacks cannot overwrite the new choice. No device-location request runs on page load.

## Motion reference

Reviewed [Obsidian UI components](https://www.obsidianui.dev/components) and the live documentation/source for [Arrow Fill Button](https://www.obsidianui.dev/docs/arrow-fill-button).

Adapted the idea with original CSS: a 220 ms sage fill inside location buttons, a 3 px arrow response on map-card Details and the comparison action, and a short fade/settle when map selection opens. Text, hit areas, and geographic anchors remain stationary. Keyboard focus receives the same feedback. System reduced motion and the app's reduced-motion setting disable animation and transitions. No additional animation dependency was installed.

## Verification

- Local preview checked on desktop and at 390 px, including direct entry and cancel.
- Location tests cover 320/390/768/1440 px, a persisted You marker, device success, denied permission, cancellation, and late callbacks. Device responses are mocked; no real location permission was requested during verification.
- Existing map-discovery tests passed (7); existing dock tests passed after reducing narrow-screen button padding. All controls retain at least 44 px height.
- 12 geolocation unit tests passed. Production build passed with the existing bundle-size advisory.
- Evidence: `.build/location-qa`, `.build/location-verified`, `.build/location-final`. The final focused run passed all 6 tests, including the 320 px complete journey and location failure/replacement cases.

## Search layout refinement

After the user rejected the oversized nested pills, the desktop search surface was reorganised into an address row and a full-width action row. Both location methods use quiet, equally sized segments with a thin divider; the primary Find care/Update action aligns on their right and uses an arrow. The address-lookup magnifier remains beside the address, distinguishing it from the childcare search. The outer surface has a tighter 20 px radius and less padding. Phones keep the primary action beside the address and the two location methods directly below, with 44 px minimum control heights.

All 16 existing dock/location browser scenarios passed at 320, 390, 768 and 1440 px, including complete searches, sidebar state sharing, dark/reduced-motion presentation and location failure/cancellation (`.build/search-layout`). The actual local preview was also visually checked on desktop and phone. The final mobile spacing refinement keeps both location labels on one line at 390 px.
