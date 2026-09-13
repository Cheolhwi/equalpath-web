# Current gallery update — 13 September 2026

Five user-supplied Robin childcare images now replace the four anime-v2 covers. The ivory / sage / warm-grey derivatives and unchanged originals are retained in `design-assets/childcare-gallery/robin-v3/`. Active runtime textures: `images/care-gallery/robin-v3/`. Sequence: READ → PLAY → CREATE → GROW → BUILD → GROW → CREATE → PLAY → READ. The displayed counter uses the actual artwork count. Earlier verification below remains historical.

The latest opening starts with the settled collection. After the first rendered frame and a 300 ms pause, the READ case rises automatically with its illustration already clear. The existing extraction/camera motion runs for a short opening, then the normal 6.5-second slideshow dwell begins. There is no decoding interlude. Pointer/keyboard interaction takes control, hidden tabs pause the opening, and unmount cancels it. Reduced motion and returning home in the same session show the raised card directly. The Find Childcare button is no longer automatically focused on a fresh landing entry; keyboard focus outlines remain available. Desktop and mobile coverage lives in `tests/browser/landing.spec.mjs`.

# Childcare landing scene

The 2026-09-13 revision follows the user's explicit request to use the original RhineLabUI 3D scene with childcare elements. The earlier map backdrop, right-hand marketing copy, and picture-book/letter-block arrangement are superseded by a minimal full-screen art collection.

## Real upstream scene

- Repository: https://github.com/LBEILC/RhineLabUI
- Pinned commit: `d9ecb6c6f7a36e8b522072a0ebbd7691a50550a7`.
- Runtime: upstream `ArchiveScene`, glass materials, depth of field, lighting, array layout, long-lens camera, card extraction, drag and selection behavior. The host centers framing in the full landing viewport.
- Models: `public/assets/archive-cassette.glb` and deferred assembly model `public/assets/archive-assembly.glb`.
- License: MIT, retained in `src/vendor/rhine/LICENSE` and `public/licenses/RhineLabUI-MIT.txt`. [Change notes](../src/vendor/rhine/UPSTREAM.md).
- Added art: four printed childcare illustrations in the selected transparent case. Original shell, fasteners, array and optics remain. The printed label uses EqualPath; the scene's sample items are decorative care themes, not provider data.

## Original image asset (superseded)

- Project asset: [childcare-book-cover.png](../public/images/childcare-book-cover.png).
- Generated using the built-in ImageGen tool; this was the original READ artwork. The current anime series below replaces it in the real 3D scene. It depicts fictional illustrated people.
- The original generated PNG was copied unchanged into the project. No actual institution, caregiver, availability or review is represented.

### Generation prompt

Use case: illustration-story.
Asset type: a finished editorial illustration for the LEFT half of an existing childcare website landing page, not a UI mockup.
Primary request: make the site feel unmistakably about childcare, companionship and a little breathing room for parents.
Scene: a warm quiet playroom moment. One kind adult caregiver sitting on a soft woven rug with two preschool children (around 3–5 years old), one child sharing an open picture book with the caregiver, another child stacking wooden arch blocks nearby. Full figures, clear natural body language and convincing hands, a tiny toy rabbit and a small house-shaped wooden block as secondary details. Malaysian everyday family context, dark hair and varied warm brown skin tones, ordinary modest casual clothing, no identifiable real people.
Style: sophisticated contemporary children's picture-book editorial illustration, layered cut paper and matte gouache, subtle visible paper grain, restrained organic shapes and very soft shadows. Drawn 2D art, not photorealism or 3D render. Warm and caring but not babyish, no enormous cartoon eyes. Strong designed silhouette and charming thoughtful details.
Composition: landscape 3:2 image, isolated central group, comfortably fitting all heads and limbs with generous soft empty margins, low small sun circle and one abstract plant only, no busy room interior. Light oat paper background #f2f0e6 extending to all four edges. Keep subjects crisp, with gentle softer paint edges on peripheral elements. Do not fade or blur the faces.
Palette: warm oat/ivory background, olive/sage, muted mustard, a restrained clay-orange accent; dark olive outlines only when necessary. Keep colors muted but subjects more saturated and clearly separated from background.
Constraints: no text, no typography, no logos, no watermark, no maps, no coordinates, no pins, no crosshair, no cards or interface elements, no realistic institutional signage. Render as a polished usable bitmap artwork at high resolution.

## Four-artwork gallery

READ, PLAY, CREATE and TOGETHER depict reading, cooperative play, drawing, and pickup. On 2026-09-13 the user requested new covers referencing their `Firefly.PNG`: fine anime linework, cel shading, expressive faces and selective optical softness, recolored to the site's ivory, sage and charcoal palette. All four covers were regenerated with built-in ImageGen. Exact prompts and unchanged original PNGs are retained in [the anime artwork source folder](../design-assets/childcare-gallery/anime-v2/PROVENANCE.md). The four active WebP textures total 725,144 bytes, preserve the full 1536 × 1024 composition, and use versioned `images/care-gallery/anime-v2/` URLs. [The earlier gouache series](../design-assets/childcare-gallery/PROVENANCE.md) is retained for rollback.

The page has one brand, a small region label, artwork controls, motion toggle, and a single entry button. No marketing column or process panel. The CD-style artwork is raised on first render.

## Runtime behavior

- The scene is a separate lazy-loaded chunk and mounts only on the landing. The search map remains flat and mounted in the existing app.
- Entry uses a 560 ms right-to-left ivory curtain: 220 ms to cover the landing, then 340 ms to reveal the same mounted search interface with a small horizontal settle. This follows the sidebar-navigation direction/easing from the user’s [ignoredone.space reference](https://www.ignoredone.space/index.php/graphic-design-arknights/), without its central slogan or navigation delay. Reduced motion enters immediately and Escape completes entry. It does not wait for the model or a backend response.
- Leaving the landing cancels rendering and disposes scene resources, including if model loading is still pending. Returning home creates a new scene while retaining the existing app state.
- The four artworks move 1 → 2 → 3 → 4 → 3 → 2 → 1 on a 6.5-second dwell. Manual selection, pointer interaction or keyboard focus pauses; Play resumes. Hidden tabs, collection mode and reduced motion suspend autoplay. Returning to visibility starts a full new dwell. A mount-time visibility refresh prevents a hidden-to-visible race during initialization.
- Textures load once before the first scene render, returning cases keep their own images, and every cached texture is disposed on exit.
- Canvas buttons provide previous/next artwork, play/pause and collection/close-up views. Collection drag changes the selected cell without treating a drag as a click; a click opens the close-up.
- No original audio, boot sequence, archived research documents, authentication or database mutations were included.

## Verification

Actual desktop and mobile checks are recorded in [design-qa.md](../design-qa.md) and `evidence/landing-gallery/` (the earlier `evidence/childcare-scene/` captures are historical). Release validation checks the lazy scene chunk, both binary model headers and all four WebP textures as well as the existing app checks.

The anime cover replacement has separate [verification evidence](../evidence/landing-anime-v2/verification.md), including all four desktop covers and the mobile layout. The scene geometry, materials, interactions and main app flow are unchanged.
