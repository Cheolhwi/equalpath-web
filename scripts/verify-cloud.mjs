import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const url =
    "https://sgp.cloud.appwrite.io/v1/functions/web-provider-query/executions",
  checks = [];
async function call(body) {
  const started = Date.now();
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": "6a916a6c0030a70a9d75",
      Origin: "http://127.0.0.1:4179",
    },
    body: JSON.stringify({
      body: JSON.stringify(body),
      async: false,
      method: "POST",
      path: "/",
      headers: { "content-type": "application/json" },
    }),
  });
  const x = await r.json();
  assert.equal(r.status, 201);
  assert.equal(x.status, "completed");
  checks.push({
    action: body.action,
    mode: body.mode ?? "live",
    status: x.responseStatusCode,
    ms: Date.now() - started,
    deployment: x.deploymentId,
    cors: r.headers.get("access-control-allow-origin"),
  });
  return { status: x.responseStatusCode, ...JSON.parse(x.responseBody) };
}
const h = await call({ action: "health" });
assert.equal(h.available, 3122);
const places = await call({ action: "places", query: "EDWETHINK" });
assert.equal(places.items.length, 1);
const request = {
  pickup: places.items[0],
  date: "2026-09-14",
  deadline: "16:00",
  end: "18:00",
  age: "4",
  transport: "self",
  radius: 5,
};
const r = await call({ action: "search", request });
assert.equal(r.items[0].name, "EDWETHINK");
assert.equal(r.items.length, 20);
assert.equal(r.request.age, "4");
const ids = r.items.slice(0, 2).map((p) => p.id),
  c = await call({
    action: "compare",
    request: { ...request, sort: "closing" },
    ids,
    version: r.version,
  });
assert.equal(c.items.length, 2);
assert.equal(c.items[0].name, "EDWETHINK");
assert.equal(c.items[0].phone.href, "tel:+60104660613");
assert.equal(
  c.items[0].fit.conditions.find((x) => x.id === "age").state,
  "supported",
);
assert.equal(c.items[0].cost.available, false);
const detail = await call({
  action: "details",
  request,
  id: ids[0],
  version: r.version,
});
assert.equal(
  detail.items[0].businessHours.source.url,
  "https://www.edwethink.com/child-care-centre",
);
assert.equal(
  (
    await call({
      action: "search",
      request: {
        ...request,
        pickup: {
          label: "Putrajaya public square",
          lat: 2.9264,
          lng: 101.6964,
        },
      },
    })
  ).code,
  "OUTSIDE_SERVICE_AREA",
);
assert.equal(
  (await call({ action: "compare", request, ids, version: "old" })).code,
  "FACTS_CHANGED",
);
assert.equal(
  (await call({ action: "details", request, id: "demo-garden" })).code,
  "PLACE_UNAVAILABLE",
);
assert.equal(
  (await call({ action: "publish", request })).code,
  "UNKNOWN_ACTION",
);
const demo = await call({
  action: "search",
  mode: "demo",
  request: {
    ...request,
    pickup: {
      id: "demo-pickup",
      label: "Demo public centre",
      lat: 3.139,
      lng: 101.6869,
    },
    transport: "institution",
  },
});
assert.equal(demo.total, 4);
assert.equal(demo.items.filter((p) => p.location).length, 3);
assert.equal(
  demo.items
    .find((p) => p.id === "demo-river")
    .fit.conditions.find((c) => c.id === "pickup").state,
  "conflict",
);
const report = {
  checked_at: new Date().toISOString(),
  endpoint: url,
  authentication: "none; public project identifier only",
  contract: h.contract,
  version: h.version,
  available: h.available,
  withheld: h.withheld,
  queryTotal: r.total,
  missingLocations: r.missingLocations,
  checks,
  passed: true,
  ownerWrites: 0,
};
writeFileSync(
  new URL("../evidence/cloud-verification.json", import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
