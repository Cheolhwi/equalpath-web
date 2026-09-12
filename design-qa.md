# Landing page and map entrance QA

Date: 2026-09-12. Scope: the user-requested RhineLab-inspired landing page with Gaussian blur, integrated into the existing EqualPath website. The latest user revision replaces the cinematic transfer with one brief entrance.

## Current revision: original 3D scene with childcare (2026-09-13)

The user replaced the earlier map-led landing direction with an explicit request to use the original RhineLabUI 3D scene and add childcare elements. The current implementation vendors the real `ArchiveScene` and its supporting modules at commit `d9ecb6c6f7a36e8b522072a0ebbd7691a50550a7`, with the original GLB cassette models, glass, lighting, depth of field, long-lens camera, collection drag and extraction. The dedicated landing viewport changes framing only. [Source, license, asset and generation-prompt record](docs/CHILDCARE_SCENE.md).

- Childcare changes: a picture book and physical A/B/C blocks on the selected cassette, EqualPath labels, care-themed objects, warmer parent-facing copy, and an explicit Find childcare action. The map backdrop, crosshair, coordinates and area selector have been removed from the landing. The search map remains flat.
- Actual visual checks: `evidence/childcare-scene/desktop-detail.png` at 1440 × 900, `desktop-collection.png`, `mobile-detail.png` at 390 × 844, and `small-mobile.png` at 320 × 568. The models, picture-book face, blocks, fine rules and existing MiSans hierarchy were inspected. No horizontal overflow; the compact phone's action ends around y=557 within a 568 px screen.
- [Resolved] The original selection callback also runs during dragging. The host now distinguishes browse updates from deliberate activation, so dragging stays in collection mode and clicking lifts the chosen card. Both paths were exercised in the real browser, along with previous/next and collection/close-up controls. Close-up dragging visibly rotates the same cassette; see `desktop-turned.png`.
- [Resolved] The small phone's scene overlapped the brand descriptor. Revised spacing places the scene below the brand (scene y=81.5, brand ends y=78.5) while preserving the visible entry action.
- Entry and reduced-motion keyboard entry return to the existing request input. After entry, the 3D scene is removed and only the existing map canvas remains; map pitch/bearing stay 0. Returning home recreates the scene. No backend or request/comparison logic changed.
- The 420 ms entrance is retained, with no intermediate screen. Model loading does not block entry. The lazy scene has a local error boundary and asynchronous model disposal guards.
- Existing How it works opens/closes, and existing landing process controls remain available. Browser console: zero error entries during the checked journeys.
- `evidence/childcare-scene/release.log`: 43 tests pass, production build passes, and release validation checks the lazy scene chunk, both GLB headers and the image texture.
- Limits: the captured scene is live WebGL, not a video or physical low-end phone frame-rate benchmark. The 3D bundle and cassette load on the landing; direct search does not mount them. Custom-domain HTTPS remains a separate deployment gate.

Current result: passed. The earlier sections below preserve the previous map-led design and entrance history; their visual targets are superseded by this revision.

## Previous revision: direct entrance (2026-09-12)

The user found the 3.5-second GTA sequence excessive. The current version has only `welcome → entering → ready`, lasting 420 ms, and shows the main interface from the first entering frame. A 2% map settle and 6 px content movement accompany a brief crossfade. No standalone map screen, transfer labels, progress bar, regional pan or extra panel animation remains. The landing design is unchanged.

- Actual browser checks: desktop and 390 × 844 mobile enter the existing search interface directly; the pickup input receives focus, one map canvas remains mounted, and no horizontal overflow was observed.
- `evidence/landing/simple-transition.json` records entering-frame DOM/style observations: the discovery panel is already visible and no `.map-transfer` element exists. Its timestamps include browser click dispatch latency; these are not precise animation-duration measurements.
- `simple-crossfade-desktop.png`, `simple-entry-desktop.png` and `simple-entry-mobile.png` show the short crossfade and resulting interface. All three were visually inspected.
- Reduced motion plus keyboard Enter enters immediately. Browser console reports zero errors. No data, search or comparison code was changed; the same App stays mounted across entry/home.
- Updated tests enforce completion within 450 ms, no intermediate camera destination, flat regional previews, cancellation and reduced-motion behavior. `evidence/landing/release-simple.log`: 43 tests pass, production build and asset validation pass.
- Temporary viewport overrides were reset. Current result: passed.

The following initial-design evidence is retained for provenance. Its longer GTA sequence and skip button describe the superseded version, not current behavior.

## Visual target and evidence

- Reference: https://github.com/LBEILC/RhineLabUI and the actual interface at https://rhine.lubeiluchen.cc/?scene=archive.
- Source visual truth: `evidence/landing/reference-archive-desktop.png` (1440 × 900) and `reference-archive-mobile.png` (390 × 844). The source entry and archive/detail states were also inspected in the browser.
- Implementation: `evidence/landing/landing-desktop.png` (1440 × 900) and `landing-mobile.png` (390 × 844), captured from http://127.0.0.1:4179/ with a ready map.
- Both pairs have matching CSS viewport and image dimensions, one image pixel per CSS pixel. `comparison-desktop.jpg` contains both 1440 × 900 views scaled identically to 65%; `comparison-mobile.jpg` contains both 390 × 844 views at 1:1. Both comparison files were opened together for review.
- State: source archive overview versus the requested EqualPath landing adaptation. This is style matching, not an identical product or 3D-scene reproduction. The replacement of archive models by the existing map, EqualPath copy, larger introductory headline, useful region choices, and the GTA camera sequence are intentional user-requested differences.
- Focused review: the full-resolution 390 × 844 comparison makes the brand, heading, body, primary action and footer legible without further cropping. Full-size desktop landing, process and transition screenshots were also inspected.

## Comparison history and findings

1. Initial desktop capture passed the composition and interaction review: quiet warm background, top-left MiSans brand, right-side information and action, bottom indexed controls, square corners and thin rules. The Gaussian blur is applied to the real map; there are no replacement 3D objects or copied archive graphics.
2. [P2, resolved] The initial mobile secondary controls and footer were too small at 6–7 px. Evidence: `landing-mobile-v1.png`. Increased welcome navigation to 9 px, secondary labels/credits/motion control to 8 px and the motion control's height to 32 px. The final `landing-mobile.png` and combined mobile comparison show the revised readable controls without horizontal overflow.
3. [P2, resolved] Short mobile/landscape screens could clip the lower landing controls because the introductory layout was taller than the viewport. The landing now scrolls on small/short screens and does not impose a minimum height on the existing app. Verified at 320 × 568 and 844 × 390; the main action remains visible on the small phone, and the landscape region controls can be reached and activated by scrolling.
4. Integration corrections before final capture: force the introductory map visible on mobile even though the underlying app initially selects its list; cancel a pending location operation and close transient place results when returning home; keep manual reduced-motion mode effective for MapLibre camera movement, not only CSS; keep the request-form deep link usable.

No actionable P0/P1/P2 visual findings remain.

## Required fidelity surfaces

| Surface                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonts and typography     | Existing locally hosted MiSans matches the reference family. Bold compact brand, light large headline, restrained uppercase metadata and normal case explanatory text are intentional EqualPath hierarchy. No clipping or unintended heading wrapping at checked widths.                                                                                                                                                |
| Spacing and layout       | Desktop keeps the reference's upper-left brand, right-side focus and lower indexed controls. Mobile uses one readable column. Main action stays above the fold at 320 × 568; lower supplementary content scrolls. Square edges, thin separators and broad negative space are retained.                                                                                                                                  |
| Colors and tokens        | Warm off-white and dark olive follow both the source and the existing app. The subdued map is progressively sharpened during entry. Contrast is retained for core controls; revised small-screen metadata was checked at 1:1.                                                                                                                                                                                           |
| Image quality and assets | The background is the real OpenFreeMap / OpenMapTiles / OSM map already used by EqualPath, rendered in one persistent MapLibre canvas. Blur and translucent surfaces are CSS effects explicitly requested by the user. No stock images, generated archive objects, models or copied logos. Existing Lucide arrows/crosshair match the simple line controls and the product's icon set. Map attribution remains visible. |
| Copy and content         | The landing describes discover, compare and prepare-to-contact outcomes. Public city-centre coordinates are labelled as preview areas, not user location. No fictional availability, acceptance, booking or authentication claims.                                                                                                                                                                                      |

## Interaction and technical verification

- Selected Kuala Lumpur / Selangor: active label and city-centre camera change. These choices preview the area and do not overwrite a user's pickup request.
- Selected process tabs and opened/closed How it works on desktop and mobile.
- Actual stage capture in `transition.json`: depart at approximately 344 ms (zoom 12.73), travel at 1058 ms (zoom 8.1), arrive at 1768 ms (zoom 8.1), reveal at 3110 ms (zoom 10.8), ready at 3599 ms (zoom 10.8). Each observation found exactly one canvas and pitch/bearing 0. The final desktop focus moved to `pickup-search`.
- `transition-depart.png`, `transition-travel.png`, `transition-arrive.png`, `transition-reveal.png`, `transition-ready.png` and `transition-mobile.png` are actual browser frames. They are stage samples, not a video or frame-rate benchmark.
- Skip animation works. Escape exits the mobile transition. Reduced motion plus keyboard Enter reached the existing app in the next frame without waiting for a map/backend response.
- Existing live place search and provider search still work: EDWETHINK, 2026-09-14, 17:00–19:00 returned 983 candidates (68 located plus 915 without coordinates). After selecting one comparison institution, returning home and re-entering retained the request, results and selection.
- Introductory app content is inert and hidden from assistive technology until entry. No automatic device location, music, messaging, booking, new account or backend mutation was added.
- Browser console: zero error entries during the checked landing, transition, mobile and existing-search journey. No new network providers or runtime dependencies.
- `evidence/landing/release.log`: 43 tests pass, Vite production build and public-asset release validation pass. Four new tests cover cancelled/queued callbacks, reduced motion, completion independent of external services, and flat camera constraints in the served region.
- Screenshot evidence includes 1440 × 900 desktop, 390 × 844 mobile, 320 × 568 small mobile and 844 × 390 landscape. Temporary viewport overrides are reset after testing.

## Follow-up polish and limits

- [P3] Motion captures prove the stage sequence and continuity; they do not measure frame rate on low-end physical phones. Gaussian blur performance and external map tile latency depend on the device/network.
- The live catalog's previously recorded missing facts and registration limitations remain unchanged.
- Custom-domain certificate status and GitHub's production verification gate are recorded separately in the deployment documentation; a visual QA pass is not proof that custom-domain HTTPS is ready.

## Implementation checklist

- [x] Capture reference and implementation on desktop and mobile.
- [x] Compare combined images; repair mobile readability and short-screen overflow.
- [x] Verify a continuous flat map entrance, skip, reduced motion and keyboard entry.
- [x] Verify existing request/results/comparison state survives return to landing.
- [x] Run the release checks and inspect browser errors.

final result: passed
