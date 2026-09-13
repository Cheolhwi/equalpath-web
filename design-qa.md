# Landing page and map entrance QA

## Contact-first recommendations (2026-09-14)

Search still selects each nearest-20 page inside the 10 km radius before ranking. Within the existing conflict groups, a published phone or explicit WhatsApp contact now takes priority over distance, fee, closing time, pickup or name. Known conflicts remain last. Search/map suggestions and comparison winners use contactable, conflict-free candidates first; a website alone does not qualify. If there are only one or two contactable candidates, spare suggestion slots remain empty. No-contact candidates become the fallback only when that eligible page/shortlist has no contactable option. Existing requirements for comparable monthly prices remain.

- 139 unit checks, the isolated function-package import, production build and asset validation passed. Five new checks cover contact classification, conflict precedence, no filler, fallback, comparison ties/missing prices and stable radius/page membership.
- Nine browser scenarios passed across contact priority, results, price/registration and comparison. The contact-priority scenario passed again after the final explanation copy was shortened. Desktop search/comparison and 390 px mobile-map screenshots in `.build/contact-priority/` were visually inspected; two contactable candidates produce exactly two highlighted cards/pins, while the no-contact second page uses the fallback. These browser data are controlled fixtures.
- Public query deployment `6aa734fad5d9fe79916d` is ready. Live distance and price requests for KL Sentral on 2026-09-14, 13:00–18:00, each returned the same 20 of 394 candidates within 10 km. Each page contained 10 contactable candidates without known conflicts; all three suggestions had contact details. Live comparison also put the contactable candidate first. Aggregate evidence: `.build/contact-priority/live-api.json` and `evidence/api-deployment.json`. No provider data or contact actions were changed.
- Frontend release source digest: `fc19d113aec2e6015b76bbc5826db247f87f7beb402285b67da267edf986f602`. Public site publication is verified separately below when complete.

## Questions page and linked checks (2026-09-14)

The enquiry page now starts with the selected centre, visit date, collect-by time, care-until time and pickup place. The main column contains selected questions; copy/preview and sourced contacts sit together on the right. Small screens stack the copy controls before the questions, then contacts and the secondary pickup-checklist action. The existing quiet palette, reduced-motion settings and dialog timing remain.

Each condition-derived question names its matching check and state, with a short parent-facing explanation. The expandable link reveals the original assessment and source, including alternate age sources. Conflicting checks come first initially. Availability and final fees are clearly labelled as questions to ask for every visit, not missing-provider-data checks. Fee references retain estimates and billing periods. Friendly display/copy wording is a frontend presentation of the existing API question IDs; this change does not alter fit states or require a query-function deployment.

- 134 unit checks and the production build/asset validation passed. Four new checks verify exact question membership, ID-to-assessment linkage, optional age/pickup handling, conflict ordering, selected-message context and fee distinctions.
- 16 browser scenarios passed across enquiry, phases 4–5 and guided-tour suites. The three enquiry cases passed again after final copy/style adjustments. They cover linked evidence, excluded matching checks, selection/reordering and reopen persistence, copied order, WhatsApp link scope without opening it, clipboard failure, no-contact fallback, checklist navigation and 320 px dark-mode layout.
- Desktop (1440 × 1000), mobile (390 × 844) and dark 320 × 700 screenshots in `.build/enquiry-redesign-final/` were visually inspected. Names, date/time fields, check links, expanded evidence and contacts stay within the dialog. These are controlled browser fixtures; they do not verify individual live provider facts or physical-device performance.
- Release source digest: `72a5d1c19f80b4d998515fbf7f1eb5e403722581087099ca0ed534c4016bc8d9`. Public deployment is checked separately after publication.

Date: 2026-09-12. Scope: the user-requested RhineLab-inspired landing page with Gaussian blur, integrated into the existing EqualPath website. The latest user revision replaces the cinematic transfer with one brief entrance.

## Current revision: artwork-led entry and slower surfaces (2026-09-14)

The user requested a slightly slower landing entrance filled by its current artwork and EQUALPATH branding. The right-to-left ivory curtain now takes 1200 ms: 480 ms cover, 720 ms reveal. A stationary composition is revealed by a clip, with the large wordmark on the left and the selected childcare print in a fine paper frame on the right. Phones stack them as a centred group. The artwork is frozen when entering, and scene autoplay pauses. This is a decorative transition into the same mounted app, not another destination.

Result cards now reveal in 480 ms, with a stagger capped at 210 ms; dialogs use 440 ms, backdrops 300 ms, and select menus/registration popovers 240 ms. These changes slow the recently added motion by roughly one third. Pointer feedback remains responsive. Native cursors and immediate entry remain available for reduced motion; input, map dragging, touch and keyboard behavior are preserved.

- Six relevant browser scenarios passed across landing and interaction suites, including card reveals without duplicate queries, pointer/dialog controls, reduced-motion/touch fallback, first-load collection-to-raised behavior, Escape and request preservation. After the final spacing adjustment, all three landing scenarios passed again.
- Final screenshots were visually inspected at `.build/entry-art-final/entry-composition.png` (1440 × 1000, PLAY) and `entry-composition-mobile.png` (390 × 844, GROW). Wordmark, slash and artwork do not overlap. The print stays within the viewport and no horizontal overflow occurs.
- Current cover/reveal samples are captured at 120 ms and 590 ms, with the full composition at 480 ms. The original landing stays visible before coverage and the existing search interface appears during reveal. Samples pause the real CSS animations; they are not frame-rate measurements.
- The artwork assertion checks both selection and successful image load. Selecting PLAY before desktop entry uses PLAY; selecting GROW before phone entry uses GROW.
- The same App element survives entry. It remains inert until entry completes, then the curtain and scene are removed and pickup-input focus is restored. Escape also completes entry while the optional 3D scene is unavailable. Returning home retains the current request.
- 130 unit checks and the production build/asset validation pass. Browser checks use Chrome viewport emulation and controlled/empty API responses; they do not establish live catalogue accuracy or physical-device performance. Live deployment is verified separately against the release digest.

### Empty-frame correction (2026-09-14)

The user observed a blank art frame on the live transition. The old implementation only mounted the HTML image after entry started; the live image responses require cache revalidation, so a slow request could outlast the 900 ms transition. Earlier screenshots paused the completion timer and waited for the image, which did not cover this failure.

- All five transition images now mount/decode on the landing and use the same anonymous request mode as the 3D textures. Entry keeps the selected image element instead of creating another request. The curtain stays clipped and inactive until entry starts.
- No decoded cover means immediate entry, with no empty frame or network wait. Returning home prepares fresh elements and readiness state.
- Five landing browser scenarios passed: desktop/mobile composition and image identity, reduced motion, Escape/request preservation, a cold cache with delayed images and later image requests blocked after clicking entry, and unavailable images. The real-time transition test observes every animation frame, verifies a loaded visible image throughout, and records zero image requests during entry.
- Current inspected screenshots: `.build/entry-image-fix/entry-composition.png` and `entry-composition-mobile.png`. The cover and wordmark remain intact on desktop and phone.

### White illustration paper (2026-09-14)

The user requested white image backgrounds instead of the yellow cast. Transition frames now use white, and the image no longer multiplies with the warm page. A display-only SVG filter selects near-white pixels using the minimum RGB channel and smoothly overlays white from 220 to 229; coloured subjects and darker pixels are retained. Runtime artwork files and the 3D landing textures are untouched.

The existing desktop/mobile landing scenario passed, including prepared-image identity and successful entry. `.build/entry-white-paper-final/entry-composition.png` and `entry-composition-mobile.png` were visually inspected: white paper, sage clothing, readable details, no wordmark overlap. The warm surrounding page remains consistent with the site's palette.

### Entrance timing only (2026-09-14)

The user requested a slightly longer landing-to-search transition only. Cover/reveal timings changed from 360/540 ms to 480/720 ms (1.2 seconds total). Card, dialog, popover and pointer timings are unchanged. The preloaded current artwork, white paper, Escape and reduced-motion behavior remain intact. The existing landing browser scenario checks desktop and phone entry using the shared timing constants; evidence is in `.build/entry-timing-1200/`.

### Time selection and comparison language (2026-09-14)

Search and saved-template time fields now share a themed hour/minute chooser. Sage checks and quiet paper backgrounds replace native blue selection. Users can type a time or choose exact hours/minutes, then apply with Done. Clear empties the field; Escape/outside dismissal cancels the draft. Existing same-day request validation and HH:mm API values are preserved.

Two focused browser scenarios passed for minute precision, explicit commit/cancel, keyboard navigation, field normalization, invalid/valid submissions, no picker-triggered searches, 320 px viewport placement, nested-dialog Escape, dark theme and reduced motion. Desktop, small-phone, template and dark screenshots in `.build/time-picker/` were visually inspected. These are Chrome viewport checks, not physical-device certification.

Comparison now uses “Compare childcare” and “Your shortlist”. Empty states tell users how to add options and return through “Find childcare”; one selected option gets a specific “Add one more option” prompt. Table labels and loading/update copy are shorter. Registration, fee attribution, condition results and sorting are retained.

The complete 13-scenario regression run also passed, covering comparison priorities, themed sorting, saved-template reuse, failed writes, preparation, phone layouts and printing. Final evidence is in `.build/time-compare-final/`.

### Saved items and a reusable-search reminder (2026-09-14)

“Saved for later” has Childcare and Searches tabs, plain “Use this search” actions, labelled pickup/collect/care details, folded source dates and storage guidance at the bottom. Find childcare shows a sage saved-search reminder before its form. One saved search loads on request; multiple searches open the Searches tab. The navigation count includes both types. Existing date/age reset and public-place validation are reused; ordinary discovery never applies a saved search automatically.

The new reminder scenarios verify reload persistence without automatic application, exact saved times, a fresh date/age, no automatic search, phone placement, multiple-choice routing, mode isolation and removal of the last reminder after deletion. Desktop reminder, 320 px reminder/library and saved-childcare screenshots in `.build/saved-language-final/` were visually inspected.

All 15 relevant browser scenarios passed across the initial run and focused reruns after updating assertions for the new labels/layout. The final saved edit/reuse/delete journey is recorded in `.build/saved-language-recheck/`. The 130 unit checks passed as well.

## Previous revision: minimal four-artwork gallery (2026-09-13)

The latest user request removes the entire marketing column and makes the landing a minimal art collection close to the reference. The original scene now fills the viewport. READ is raised by default; READ / PLAY / CREATE / TOGETHER use four distinct illustrated prints. The scene automatically cycles back and forth on a 6.5-second dwell. Branding, tiny regional context, gallery controls, motion toggle and one entry button are the only interface elements.

- Three new images were generated and visually reviewed; exact prompts and unchanged PNGs are in `design-assets/childcare-gallery/`. The existing reading artwork is retained. WebP runtime encodings preserve all compositions, totalling 921,418 bytes.
- Actual desktop rendering: `evidence/landing-gallery/default-raised.png`, `desktop.png` (PLAY), `create.png`, `together.png`. All four distinct images are visible inside the original glass shell, clear of the printed label. The right-hand marketing column is absent.
- Automatic READ → PLAY was observed in the actual browser; resuming from TOGETHER returned through the gallery. Manual next, pause and resume were exercised. The scheduler tests additionally enforce the complete 0,1,2,3,2,1,0 sequence, cancellation of already queued callbacks and a full dwell after resuming.
- [Resolved] A visibility change could occur between mounting and registering the listener, leaving autoplay incorrectly paused. Registering the listener now immediately refreshes visibility. The browser subsequently reported `playing` and advanced normally.
- Original interactions: `collection.png` and `turned.png` record array exploration and rotated detail. Dragging the array retains collection mode; close-up returns to a raised artwork. Manual interaction suspends autoplay. Reduced motion disables autoplay and its play button.
- Mobile: `mobile.png` at 390 × 844 and `small-mobile.png` at 320 × 568. No horizontal overflow, full artwork visible, no marketing copy covering it. Entry ends at y=762 and y=502 respectively, inside the viewport.
- Normal and reduced-motion keyboard entry reach the existing main interface. After entry, the scene is removed, only one map canvas remains, and map pitch/bearing are 0. The normal keyboard entry focused `pickup-search`. Returning home and entering again retained the checked 18:30 care-until value.
- Browser console: zero error entries during the checked local journeys. `evidence/landing-gallery/release.log`: 47 tests pass, production build and all four WebP/model/chunk checks pass.
- Limits: browser viewport emulation, not a physical low-end phone performance benchmark. Hidden-tab gating and pending-load disposal have been reviewed in code; no new claim of physical-device or custom-domain verification is made.

The 420 ms entrance remains direct. Earlier visual sections below are historical and superseded.

## Previous revision: original 3D scene with childcare (2026-09-13)

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
