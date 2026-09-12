# Childcare landing scene

The 2026-09-13 revision follows the user's explicit request to use the original RhineLabUI 3D scene with childcare elements. The earlier map backdrop, right-hand marketing copy, and picture-book/letter-block arrangement are superseded by a minimal full-screen art collection.

## Real upstream scene

- Repository: https://github.com/LBEILC/RhineLabUI
- Pinned commit: `d9ecb6c6f7a36e8b522072a0ebbd7691a50550a7`.
- Runtime: upstream `ArchiveScene`, glass materials, depth of field, lighting, array layout, long-lens camera, card extraction, drag and selection behavior. The host centers framing in the full landing viewport.
- Models: `public/assets/archive-cassette.glb` and deferred assembly model `public/assets/archive-assembly.glb`.
- License: MIT, retained in `src/vendor/rhine/LICENSE` and `public/licenses/RhineLabUI-MIT.txt`. [Change notes](../src/vendor/rhine/UPSTREAM.md).
- Added art: four printed childcare illustrations in the selected transparent case. Original shell, fasteners, array and optics remain. The printed label uses EqualPath; the scene's sample items are decorative care themes, not provider data.

## Image asset

- Project asset: [childcare-book-cover.png](../public/images/childcare-book-cover.png).
- Generated using the built-in ImageGen tool; the image is used as the READ artwork inside the real 3D scene. It depicts fictional illustrated people.
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

READ, PLAY, CREATE and TOGETHER depict reading, cooperative play, painting, and pickup. Three new ImageGen artworks match the existing reading picture. Exact new prompts, original PNGs and encoding details are retained in [the artwork source folder](../design-assets/childcare-gallery/PROVENANCE.md). All four runtime WebP textures total 921,418 bytes and preserve the full 3:2 composition.

The page has one brand, a small region label, artwork controls, motion toggle, and a single entry button. No marketing column or process panel. The CD-style artwork is raised on first render.

## Runtime behavior

- The scene is a separate lazy-loaded chunk and mounts only on the landing. The search map remains flat and mounted in the existing app.
- Entry remains one 420 ms transition; reduced motion enters immediately. It does not wait for the model or a backend response.
- Leaving the landing cancels rendering and disposes scene resources, including if model loading is still pending. Returning home creates a new scene while retaining the existing app state.
- The four artworks move 1 → 2 → 3 → 4 → 3 → 2 → 1 on a 6.5-second dwell. Manual selection, pointer interaction or keyboard focus pauses; Play resumes. Hidden tabs, collection mode and reduced motion suspend autoplay. Returning to visibility starts a full new dwell. A mount-time visibility refresh prevents a hidden-to-visible race during initialization.
- Textures load once before the first scene render, returning cases keep their own images, and every cached texture is disposed on exit.
- Canvas buttons provide previous/next artwork, play/pause and collection/close-up views. Collection drag changes the selected cell without treating a drag as a click; a click opens the close-up.
- No original audio, boot sequence, archived research documents, authentication or database mutations were included.

## Verification

Actual desktop and mobile checks are recorded in [design-qa.md](../design-qa.md) and `evidence/landing-gallery/` (the earlier `evidence/childcare-scene/` captures are historical). Release validation checks the lazy scene chunk, both binary model headers and all four WebP textures as well as the existing app checks.
