import test from "node:test";
import assert from "node:assert/strict";
import {
  careArtworks,
  nextArtwork,
  artworkDwell,
} from "../src/care-artworks.js";

test("gallery visits every artwork and reverses at each end without duplicates", () => {
  let state = { index: 0, direction: 1 };
  const sequence = [state.index];
  for (let i = 0; i < 12; i++) {
    state = nextArtwork(state.index, state.direction);
    sequence.push(state.index);
  }
  assert.deepEqual(sequence, [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0]);
  assert.equal(new Set(careArtworks.map((a) => a.image)).size, 4);
});

test("single-art fallback never produces an out-of-bounds index", () => {
  assert.deepEqual(nextArtwork(0, -1, 1), { index: 0, direction: 1 });
});

test("pausing or unmounting cancels a dwell including an already queued callback", () => {
  let callback,
    cleared,
    count = 0;
  const stop = artworkDwell(() => count++, {
    schedule: (fn, delay) => {
      callback = fn;
      assert.equal(delay, 6500);
      return 7;
    },
    cancel: (id) => {
      cleared = id;
    },
  });
  stop();
  callback();
  assert.equal(cleared, 7);
  assert.equal(count, 0);
});

test("a resumed gallery gets a full dwell before advancing", () => {
  let stale,
    current,
    count = 0;
  const stop = artworkDwell(() => count++, {
    schedule: (fn) => {
      stale = fn;
      return 1;
    },
    cancel: () => {},
  });
  stop();
  artworkDwell(() => count++, {
    schedule: (fn, delay) => {
      current = fn;
      assert.equal(delay, 6500);
      return 2;
    },
    cancel: () => {},
  });
  stale();
  assert.equal(count, 0);
  current();
  assert.equal(count, 1);
});
