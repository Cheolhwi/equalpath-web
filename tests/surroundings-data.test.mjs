import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const photos = JSON.parse(readFileSync(new URL('../src/surroundings.json', import.meta.url)));
test('published surrounding galleries have distinct versioned public images and a compatible cover', () => {
  assert.ok(Object.keys(photos).length > 0);
  for (const gallery of Object.values(photos)) {
    const images = gallery.images || [gallery];
    assert.ok(images.length === 1 || images.length === 3);
    assert.equal(images[0].url, gallery.url);
    assert.equal(new Set(images.map(i => i.version)).size, images.length);
    for (const image of images) {
      const url = new URL(image.url);
      assert.equal(url.origin, 'https://sgp.cloud.appwrite.io');
      assert.match(image.version, /^[a-f0-9]{64}$/);
      assert.ok(url.pathname.includes(`/web-surroundings/files/s_${image.version.slice(0,32)}/view`));
      assert.equal(url.searchParams.get('project'), '6a916a6c0030a70a9d75');
    }
  }
});
