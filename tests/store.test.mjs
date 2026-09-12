import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../server/appwrite-store.mjs";
const raw = {
  id: "test",
  display_name: "Test branch",
  official_name: "Test",
  state: "Selangor",
  district: "Petaling",
  registration: {
    authority: "KPM",
    source_url: "https://example.com",
    match_status: "third_party_code_claim",
  },
  data_limits: {},
  operating_hours: {},
  fees: [],
};
const manifest = {
    status: "ready",
    release_id: "test-release",
    payload: JSON.stringify({ provider_count: 1 }),
  },
  row = {
    provider_id: "test",
    release_id: "test-release",
    payload: JSON.stringify(raw),
  };
const response = (value) => ({ ok: true, json: async () => value });
test("cold requests coalesce, public-only table reads are bounded, and failed refresh does not renew the cache", async () => {
  let calls = [],
    time = 100000,
    fail = false;
  const fetcher = async (url, options) => {
    calls.push({ url, headers: options.headers });
    if (fail) throw Error("sensitive URL must never leave adapter");
    return response(url.includes("/current") ? manifest : { rows: [row] });
  };
  const s = createStore({ fetcher, now: () => time });
  const [a, b] = await Promise.all([s.catalog(), s.catalog()]);
  assert.equal(a, b);
  assert.equal(calls.length, 3);
  assert.ok(
    calls.every(
      (c) =>
        c.url.includes("/web_") &&
        !Object.keys(c.headers).some((h) => /key|jwt|cookie/i.test(h)),
    ),
  );
  time += 61000;
  fail = true;
  await assert.rejects(
    () => s.catalog(),
    (e) => e.code === "SOURCE_UNAVAILABLE",
  );
  fail = false;
  assert.equal((await s.catalog()).items.length, 1);
});
test("partial source pages never become a new complete directory", async () => {
  const s = createStore({
    fetcher: async (url) =>
      response(url.includes("/current") ? manifest : { rows: [] }),
  });
  await assert.rejects(
    () => s.catalog(),
    (e) => e.code === "SOURCE_INCOMPLETE",
  );
});
test("release changes during collection are rejected and a later retry can recover", async () => {
  let read = 0;
  const s = createStore({
    fetcher: async (url) =>
      response(
        url.includes("/current")
          ? ++read === 2
            ? { ...manifest, release_id: "changed" }
            : manifest
          : { rows: [row] },
      ),
  });
  await assert.rejects(
    () => s.catalog(),
    (e) => e.code === "SOURCE_CHANGED",
  );
  assert.equal((await s.catalog()).release, "test-release");
});
