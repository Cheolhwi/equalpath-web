import test from "node:test";
import assert from "node:assert/strict";
import entry, { createEntry } from "../server/function.mjs";
import { checkAge } from "../shared/conditions.mjs";
const res = {
  json: (body, status, headers) => ({ body, status, headers }),
  text: (body, status, headers) => ({ body, status, headers }),
};
test("public function handles preflight and disallows unsupported methods without touching the store", async () => {
  const r = await entry({ req: { method: "OPTIONS" }, res });
  assert.equal(r.status, 204);
  assert.equal(r.headers["Cache-Control"], "no-store");
  assert.equal((await entry({ req: { method: "DELETE" }, res })).status, 405);
});
test("invalid JSON and oversized requests return bounded private errors", async () => {
  const r = await entry({ req: { method: "POST", bodyText: "{" }, res });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body), ["ok", "code"]);
  assert.equal(
    (await entry({ req: { method: "POST", bodyText: "a".repeat(12001) }, res }))
      .status,
    413,
  );
});
test("entry returns controlled examples only when demo mode is requested explicitly", async () => {
  const r = await entry({
    req: {
      method: "POST",
      bodyText: JSON.stringify({ action: "health", mode: "demo" }),
    },
    res,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, "demo");
  assert.equal(r.body.available, 10);
  assert.match(r.headers['Server-Timing'], /^app;dur=\d+\.\d, module;dur=\d+(?:\.\d)?, first;dur=[01], prewarmed;dur=[01], warm-age;dur=\d+(?:\.\d)?$/);
});
test("scheduled warmup primes both live catalogues and the next search reuses the loaded API", async () => {
  const calls = []; let loads = 0, time = 0;
  const handler = createEntry({ now: () => time, load: async () => {
    loads++; time += 12;
    return { api: async body => { calls.push(body); return { available: body.careType === 'regular' ? 3036 : 101 }; } };
  } });
  const warm = await handler({ req: { method: 'GET', headers: { 'x-appwrite-trigger': 'schedule' } }, res });
  assert.equal(warm.status, 200);
  assert.deepEqual(calls, ['short_term', 'regular'].map(careType => ({ action: 'health', mode: 'live', careType })));
  assert.deepEqual(warm.body.collections.map(c => c.available), [101, 3036]);
  time += 45000;
  const search = await handler({ req: { method: 'POST', bodyText: JSON.stringify({ action: 'search' }) }, res });
  assert.equal(search.status, 200);
  assert.equal(loads, 1);
  assert.match(search.headers['Server-Timing'], /first;dur=0, prewarmed;dur=1, warm-age;dur=45000\.0$/);
});
test("warmup failure stays bounded and a later scheduled execution can retry API initialization", async () => {
  let loads = 0;
  const handler = createEntry({ load: async () => {
    if (++loads === 1) throw Error('private deployment detail');
    return { api: async () => ({ available: 1 }) };
  } });
  const req = { headers: { 'x-appwrite-trigger': 'schedule' } };
  const failed = await handler({ req, res });
  assert.equal(failed.status, 503);
  assert.deepEqual(failed.body, { ok: false, code: 'WARMUP_FAILED' });
  assert.match(failed.headers['Server-Timing'], /prewarmed;dur=0/);
  assert.equal((await handler({ req, res })).status, 200);
});
test("age lower-exclusive endpoint cannot fully support a completed age interval", () => {
  assert.equal(
    checkAge(
      {
        min: 48,
        max: 72,
        minInclusive: false,
        endpointKnown: true,
        wording: "Older than 48 months",
      },
      { age: "4" },
    ).state,
    "unknown",
  );
});
