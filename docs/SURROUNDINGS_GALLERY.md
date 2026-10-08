# Surroundings gallery

92 providers have three directional street images each (276 images). These are different headings from the same panorama, not three independently surveyed places. The remaining nine providers have no photo in this release. Existing location-review notes and unknown capture dates remain in the metadata.

Images are content-addressed JPEGs in the public-read-only `web-surroundings` bucket. Each `web_provider_photos` row retains the compatible cover fields and a payload containing an ordered `images` array. The publisher verifies anonymous image hashes and reads back each database association before exporting `src/surroundings.json`. Search performs zero database reads for photos.

The compact detail thumbnail opens a large viewer with Previous/Next, an image count, arrow-key navigation and Escape. Only the selected view loads. The existing cache deduplicates requests, retains up to 100 images, and is cleared by Clear local cache. New content gets a new file URL. Failed views retain navigation so another image can still be opened.

Publication: `node scripts/publish-surroundings.mjs <prepared-directory>`, where `manifest.json` contains provider IDs, existing review notes and three `{file, direction}` entries. Publish only after all images are verified, then follow the website release runbook and check the gallery on the real production page.
