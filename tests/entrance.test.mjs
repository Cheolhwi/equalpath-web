import test from "node:test";
import assert from "node:assert/strict";
import { ENTRANCE_COVER_MS, ENTRANCE_DURATION_MS, entranceCamera, startEntrance } from "../src/entrance.js";

function scheduler() {
  const jobs = new Map();
  let id = 0;
  return {
    jobs,
    schedule(fn, at) {
      jobs.set(++id, { fn, at });
      return id;
    },
    cancel(id) {
      jobs.delete(id);
    },
  };
}

test("skipping cancels pending entrance phases and ignores already queued callbacks", () => {
  const clock = scheduler();
  const phases = [];
  const stop = startEntrance((phase) => phases.push(phase), clock);
  const queued = [...clock.jobs.values()].map((job) => job.fn);
  stop();
  queued.forEach((fn) => fn());
  assert.deepEqual(phases, ["entering"]);
  assert.equal(clock.jobs.size, 0);
});

test("reduced motion enters immediately without scheduling camera animation", () => {
  const clock = scheduler();
  const phases = [];
  const stop = startEntrance((phase) => phases.push(phase), {
    ...clock,
    reduced: true,
  });
  assert.deepEqual(phases, ["ready"]);
  assert.equal(clock.jobs.size, 0);
  stop();
});

test("entrance always completes without waiting for map tiles or a backend response", () => {
  const clock = scheduler();
  const phases = [];
  startEntrance((phase) => phases.push(phase), clock);
  for (const job of [...clock.jobs.values()].sort((a, b) => a.at - b.at))
    job.fn();
  assert.deepEqual(phases, ["entering", "ready"]);
  assert.equal(phases.filter((phase) => phase === "ready").length, 1);
  assert.ok(ENTRANCE_COVER_MS < ENTRANCE_DURATION_MS);
  assert.ok(Math.max(...[...clock.jobs.values()].map((job) => job.at)) <= 600);
});

test("city previews stay flat and entrance adds no intermediate camera destination", () => {
  for (const area of [0, 1, 99]) {
    for (const phase of ["welcome"]) {
      const shot = entranceCamera(phase, area);
      assert.equal(shot.pitch, 0);
      assert.equal(shot.bearing, 0);
      assert.ok(shot.center[0] > 101 && shot.center[0] < 102);
      assert.ok(shot.center[1] > 2.8 && shot.center[1] < 3.5);
    }
  }
  assert.equal(entranceCamera("entering"), null);
  assert.equal(entranceCamera("ready"), null);
});
