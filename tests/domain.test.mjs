import test from "node:test";
import assert from "node:assert/strict";
import {
  fixtureCatalog,
  demoPickup,
  fixtureProviders,
} from "../server/fixtures.mjs";
import { createAPI } from "../server/api.mjs";
import { requestErrors, canonicalRequest } from "../shared/request.mjs";
import {
  assess,
  checkAge,
  costFor,
  enquiries,
  sortProviders,
} from "../shared/conditions.mjs";
import { providerRegion, regionAt } from "../server/geography.mjs";
import {
  safeURL,
  phoneFact,
  source,
  buildCatalog,
} from "../server/providers.mjs";
import { readFileSync } from "node:fs";
const req = canonicalRequest({
  pickup: demoPickup,
  date: "2026-09-14",
  deadline: "16:00",
  end: "18:00",
  age: "4",
  transport: "institution",
  radius: 5,
});
const api = createAPI({ store: { catalog: async () => fixtureCatalog } }),
  body = { action: "search", mode: "demo", request: req };
test("essential fields, impossible dates and same-day time ordering fail without changing valid values", () => {
  const r = { ...req, date: "2026-02-30", end: "15:00" };
  assert.deepEqual(Object.keys(requestErrors(r)), ["date", "end"]);
  assert.equal(r.pickup.label, req.pickup.label);
  assert.ok(requestErrors({ ...req, pickup: null }).pickup);
});
test("omitted age and transport are accepted and visibly unspecified", async () => {
  const r = await api({ ...body, request: { ...req, age: "", transport: "" } });
  assert.equal(
    r.items[0].fit.conditions.find((c) => c.id === "age").state,
    "unknown",
  );
  assert.equal(
    r.items[0].fit.conditions.find((c) => c.id === "transport").state,
    "unknown",
  );
});
test("age four is a full [48,60) month interval, with partial and ambiguous overlap unknown", () => {
  const s = {
    min: 48,
    max: 72,
    endpointKnown: true,
    wording: "48 to under 72",
  };
  assert.equal(checkAge(s, req).state, "supported");
  assert.equal(checkAge({ ...s, min: 54 }, req).state, "unknown");
  assert.equal(
    checkAge({ ...s, max: 48, maxInclusive: false }, req).state,
    "conflict",
  );
  assert.equal(checkAge({ ...s, endpointKnown: false }, req).state, "unknown");
});
test("regular enrolment does not become one-off admission", () => {
  assert.equal(
    assess(fixtureProviders[2], req).conditions.find(
      (c) => c.id === "admission",
    ).state,
    "unknown",
  );
});
test("pickup window wholly before, wholly after and spanning the deadline produce three different states", () => {
  assert.equal(
    assess(fixtureProviders[0], req).conditions.find((c) => c.id === "pickup")
      .state,
    "supported",
  );
  assert.equal(
    assess(fixtureProviders[1], req).conditions.find((c) => c.id === "pickup")
      .state,
    "conflict",
  );
  assert.equal(
    assess(fixtureProviders[2], req).conditions.find((c) => c.id === "pickup")
      .state,
    "unknown",
  );
});
test("transport existence does not supply missing pickup coverage or an arrival estimate", () => {
  const f = assess(fixtureProviders[2], req);
  assert.equal(
    f.conditions.find((c) => c.id === "transport").state,
    "supported",
  );
  assert.equal(f.conditions.find((c) => c.id === "coverage").state, "unknown");
  assert.equal(f.conditions.find((c) => c.id === "transfer").state, "unknown");
});
test("self delivery removes institutional transport requirement, preserving other request conditions", () => {
  const f = assess(fixtureProviders[3], { ...req, transport: "self" });
  assert.equal(
    f.conditions.find((c) => c.id === "transport").state,
    "supported",
  );
  assert.equal(
    f.conditions.find((c) => c.id === "admission").state,
    "conflict",
  );
});
test("opening hours supply care timing while unresolved holiday exceptions stay unknown", () => {
  assert.equal(
    assess({ ...fixtureProviders[0], careWindows: [] }, req).conditions.find(
      (c) => c.id === "care",
    ).state,
    "supported",
  );
  assert.equal(
    assess(
      {
        ...fixtureProviders[0],
        dateExceptions: [{ date: req.date, label: "Holiday hours unresolved" }],
      },
      req,
    ).conditions.find((c) => c.id === "care").state,
    "unknown",
  );
});
test("care end and applicable latest collection restrictions preserve conflicts", () => {
  assert.equal(
    assess(fixtureProviders[1], req).conditions.find((c) => c.id === "care")
      .state,
    "conflict",
  );
  assert.equal(
    assess(fixtureProviders[0], req).acceptance,
    "Provider acceptance and availability remain unconfirmed.",
  );
});
test("monthly fees and missing extras do not generate fabricated hourly prices", () => {
  assert.equal(costFor(fixtureProviders[1], req).available, false);
  assert.equal(
    costFor(
      {
        ...fixtureProviders[0],
        feeRule: { ...fixtureProviders[0].feeRule, complete: false },
      },
      req,
    ).available,
    false,
  );
});
test("controlled complete tariff explains duration, minimum, rounding and extras", () => {
  const c = costFor(fixtureProviders[0], { ...req, end: "18:10" });
  assert.equal(c.total, 45);
  assert.equal(c.chargedMinutes, 150);
  assert.equal(c.minimumMinutes, 120);
  assert.ok(c.includedExtras.includes("Transport"));
});
test("one deduplicated enquiry list carries unknown service conditions without any reviews", () => {
  const q = enquiries(fixtureProviders[2], req);
  assert.equal(new Set(q.map((x) => x.id)).size, q.length);
  assert.ok(q.some((x) => x.id === "fees"));
  assert.ok(q.some((x) => x.id === "coverage"));
  assert.ok(q.some((x) => x.text.includes(req.date)));
});
test("nearby search excludes missing coordinates instead of counting unlocated centres", async () => {
  const r = await api(body);
  assert.equal(r.items.length, 9);
  assert.equal(r.missingLocations, 0);
  assert.ok(r.items.every(p => p.location && Number.isFinite(p.distanceKm) && p.distanceKm <= 5));
  assert.equal(r.items.some(p => p.id === "demo-cloud"), false);
});
test("comparison uses separate branch facts and deterministic unknown-last priorities", async () => {
  const r = await api({
    ...body,
    action: "compare",
    ids: ["demo-cloud", "demo-river", "demo-garden"],
    request: { ...req, sort: "closing" },
  });
  assert.deepEqual(
    r.items.map((p) => p.id),
    ["demo-garden", "demo-cloud", "demo-river"],
  );
  assert.equal(r.items.find(p => p.id === "demo-cloud").cost.available, false);
});
test("no result is distinct from source failure", async () => {
  assert.equal(
    (await api({ ...body, request: { ...req, query: "no such institution" } }))
      .total,
    0,
  );
  const unavailable = createAPI({
    store: {
      catalog: async () => {
        throw Error("offline");
      },
    },
  });
  await assert.rejects(() => unavailable({ ...body, mode: "live" }));
});
test("request revisions update evaluations and stale facts cannot be presented as current", async () => {
  const r = await api({
    ...body,
    request: { ...req, deadline: "17:00", end: "18:00" },
  });
  assert.equal(
    r.items
      .find((x) => x.id === "demo-river")
      .fit.conditions.find((c) => c.id === "pickup").state,
    "supported",
  );
  await assert.rejects(
    () => api({ ...body, version: "old-facts" }),
    (e) => e.code === "FACTS_CHANGED",
  );
});
test("KL, Selangor, Putrajaya and other states are enforced on server requests", async () => {
  assert.equal(regionAt({ lat: 3.139, lng: 101.6869 }), "Kuala Lumpur");
  assert.equal(regionAt({ lat: 3.0738, lng: 101.5183 }), "Selangor");
  assert.equal(regionAt({ lat: 2.9264, lng: 101.6964 }), "Putrajaya");
  await assert.rejects(
    () =>
      api({
        ...body,
        request: {
          ...req,
          pickup: { label: "Putrajaya", lat: 2.9264, lng: 101.6964 },
        },
      }),
    (e) => e.code === "OUTSIDE_SERVICE_AREA",
  );
  await assert.rejects(
    () => api({ ...body, action: "details", id: "outside-region-provider" }),
    (e) => e.code === "PLACE_UNAVAILABLE",
  );
});
test("source-region disagreement is held, while sourced regional records without coordinates remain usable", () => {
  assert.equal(
    providerRegion({
      state: "Selangor",
      district: "Petaling",
      location: { latitude: 3.139, longitude: 101.6869 },
    }).allowed,
    false,
  );
  assert.equal(
    providerRegion({ state: "Selangor", district: "Petaling" }).allowed,
    true,
  );
  assert.equal(
    providerRegion({ state: "Johor", district: "Johor Bahru" }).allowed,
    false,
  );
});
test("imported links and phone actions cannot inject executable schemes", () => {
  assert.equal(safeURL("javascript:alert(1)"), null);
  assert.equal(safeURL("https://secret:password@example.com"), null);
  assert.equal(
    phoneFact("010-466 0613", source("site", "https://www.edwethink.com/"))
      .href,
    "tel:+60104660613",
  );
  assert.equal(phoneFact("010-466 0613", null), null);
});
test("representative public source import is deterministic and real contact facts retain separate provenance", () => {
  const rows = JSON.parse(
    readFileSync(
      new URL("./fixtures/public-catalog-sample.json", import.meta.url),
    ),
  );
  const c = buildCatalog(rows, "web_79f1397603c1e28325955f64"),
    repeat = buildCatalog(rows, "web_79f1397603c1e28325955f64");
  assert.equal(c.hash, repeat.hash);
  assert.equal(c.items.length + c.held.length, rows.length);
  const p = c.items.find((p) => p.name === "EDWETHINK");
  assert.ok(p.phone.source.url.includes("edwethink.com"));
  assert.deepEqual(p.registration.missingImportedFields, [
    "postal address",
    "telephone",
  ]);
  assert.equal(
    c.items.find((p) => p.registration.authority === "KPM").registration
      .official,
    false,
  );
  assert.equal(c.items.length, 3);
  assert.equal(c.held.length, 1);
  assert.ok(c.items.some((p) => !p.location));
});
test("Malay notes fallback never restores weekdays excluded as estimates", () => {
  const rows = JSON.parse(readFileSync(new URL("./fixtures/public-catalog-sample.json", import.meta.url)));
  const raw = structuredClone(rows.find(p => p.state === "Selangor"));
  raw.id = "hours-parser-regression";
  raw.operating_hours = {
    weekly_windows: [],
    source_url: "https://example.org/hours",
    notes: "Isnin - Jumaat: 7 pagi hingga 6 petang",
    excluded_estimated_weekdays: ["FRI"],
  };
  const p = buildCatalog([raw], "parser-regression").items[0];
  assert.deepEqual(p.businessHours.windows[0].days, ["MON", "TUE", "WED", "THU"]);
});
