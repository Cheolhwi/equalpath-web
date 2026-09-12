import test from "node:test";
import assert from "node:assert/strict";
import entry from "../server/function.mjs";
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
