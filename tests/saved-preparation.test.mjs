import test from "node:test";
import assert from "node:assert/strict";
import {
  readLibrary,
  updateLibrary,
  favourite,
  template,
  reuseTemplate,
  factSnapshot,
  compareFacts,
  storageKey,
  matchedSavedPlace,
} from "../shared/saved.mjs";
import { preparationFor, preparationHTML } from "../shared/preparation.mjs";
import {
  fixtureProviders,
  demoPickup,
  fixtureCatalog,
} from "../server/fixtures.mjs";
import { createAPI } from "../server/api.mjs";
import { requestErrors, canonicalRequest } from "../shared/request.mjs";
const memory = () => {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
  };
};
const r = canonicalRequest({
  pickup: demoPickup,
  date: "2026-09-14",
  deadline: "16:00",
  end: "18:00",
  age: "4",
  transport: "institution",
});
const api = createAPI({ store: { catalog: async () => fixtureCatalog } });
const provider = async (request) =>
  (await api({ action: "details", mode: "demo", id: "demo-garden", request }))
    .items[0];

test("4.1 saved branch and reason survive reload without a request or previous fit", async () => {
  const storage = memory(),
    p = await provider(r);
  updateLibrary(storage, "demo", (x) => ({
    ...x,
    favourites: [favourite(p, "Near usual pickup")],
  }));
  const item = readLibrary(storage, "demo").favourites[0];
  assert.equal(item.id, p.id);
  assert.equal(item.reason, "Near usual pickup");
  assert.equal(item.snapshot.facts.fit, undefined);
  assert.equal(item.request, undefined);
  assert.equal(readLibrary(storage, "live").favourites.length, 0);
});
test("4.1.2 reopening re-evaluates different dates and time windows via the actual API", async () => {
  const p = await provider(r),
    next = await provider({ ...r, end: "20:00" });
  assert.notEqual(
    p.fit.conditions.find((c) => c.id === "care").state,
    next.fit.conditions.find((c) => c.id === "care").state,
  );
});
test("4.1.3 / 4.4.2 quota and denied storage preserve the previous saved version", () => {
  const storage = memory();
  updateLibrary(storage, "demo", (x) => ({
    ...x,
    favourites: [favourite(fixtureProviders[0], "old")],
  }));
  const before = storage.getItem(storageKey("demo"));
  storage.setItem = () => {
    throw Error("quota");
  };
  assert.throws(
    () => updateLibrary(storage, "demo", (x) => ({ ...x, favourites: [] })),
    /Not saved/,
  );
  assert.equal(storage.getItem(storageKey("demo")), before);
  assert.throws(
    () =>
      readLibrary(
        {
          getItem() {
            throw Error("denied");
          },
        },
        "demo",
      ),
    /could not be read/,
  );
});
test("unreadable / unsupported storage never gets silently replaced", () => {
  let writes = 0;
  for (const raw of ["{", '{"version":2,"favourites":[],"templates":[]}']) {
    assert.throws(() =>
      updateLibrary(
        { getItem: () => raw, setItem: () => writes++ },
        "demo",
        (x) => x,
      ),
    );
  }
  assert.equal(writes, 0);
});
test("4.2 reuse allows only public preferences and forces fresh date / age", () => {
  const saved = template(
    { ...r, childName: "PRIVATE", health: "PRIVATE", history: ["PRIVATE"] },
    "Weekday",
    "template-1",
  );
  const output = reuseTemplate(saved, {
    date: "2026-09-15",
    age: "6",
    radius: 5,
  });
  assert.equal(output.date, "");
  assert.equal(output.age, "");
  assert.equal(output.end, r.end);
  assert.deepEqual(output.pickup, r.pickup);
  assert.equal(output.transport, "institution");
  assert.deepEqual(
    Object.keys(saved).sort(),
    [
      "careType",
      "id",
      "name",
      "pickup",
      "deadline",
      "end",
      "transport",
      "updatedAt",
    ].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(saved),
    /PRIVATE|childName|health|history/,
  );
});
test("4.2.2 unavailable or moved branch cannot count as a matched saved place; times must be corrected", () => {
  assert.equal(matchedSavedPlace(demoPickup, [demoPickup]), true);
  assert.equal(
    matchedSavedPlace(demoPickup, [{ ...demoPickup, id: "other-branch" }]),
    false,
  );
  assert.equal(
    matchedSavedPlace(demoPickup, [{ ...demoPickup, lat: 4 }]),
    false,
  );
  assert.ok(requestErrors({ ...r, end: "15:00" }).end);
});
test("4.3 fact differences show specific changes; retrieval alone does not mean updated provider facts", () => {
  const p = structuredClone(fixtureProviders[0]);
  const before = factSnapshot(p, "2026-09-12");
  p.businessHours.source.retrievedAt = "2026-09-15";
  assert.equal(compareFacts(before, factSnapshot(p)).changes.length, 0);
  p.businessHours.windows[0].end = 1260;
  assert.deepEqual(
    compareFacts(before, factSnapshot(p)).changes.map((c) => c.key),
    ["businessHours"],
  );
  assert.equal(before.facts.businessHours.windows[0].end, 1140);
  assert.equal(compareFacts(null, factSnapshot(p)).comparable, false);
  assert.equal(compareFacts({facts:{}}, factSnapshot(p)).comparable, false);
});
test("4.4 editing and deleting one saved item preserves provider facts and other saved items", () => {
  const storage = memory(),
    p = structuredClone(fixtureProviders[0]),
    before = JSON.stringify(p);
  updateLibrary(storage, "live", (x) => ({
    ...x,
    favourites: [favourite(p, "old")],
    templates: [template(r, "Usual", "t1")],
  }));
  updateLibrary(storage, "live", (x) => ({
    ...x,
    favourites: x.favourites.map((f) => ({ ...f, reason: "new" })),
  }));
  assert.equal(readLibrary(storage, "live").favourites[0].reason, "new");
  updateLibrary(storage, "live", (x) => ({ ...x, favourites: [] }));
  assert.equal(readLibrary(storage, "live").templates.length, 1);
  assert.equal(JSON.stringify(p), before);
});
test("5.1 / 5.5 duration, age and transport alter relevant prompts without history", async () => {
  const short = preparationFor(await provider(r), r);
  const eveningRequest = { ...r, end: "21:00", age: "2", transport: "self" };
  const evening = preparationFor(
    await provider(eveningRequest),
    eveningRequest,
  );
  assert.ok(short.packing.some((x) => x.id === "transport-items"));
  assert.ok(!short.packing.some((x) => x.id === "evening"));
  for (const id of ["rest", "evening", "young", "self-items"])
    assert.ok(evening.packing.some((x) => x.id === id));
  assert.ok(!evening.packing.some((x) => x.id === "transport-items"));
  assert.notEqual(short.request, evening.request);
});
test("5.2 / 5.4 handover questions belong to three parties and do not assert assignment or authority", async () => {
  const sheet = preparationFor(await provider(r), r);
  assert.deepEqual(
    sheet.groups.map((g) => g.id),
    ["usual", "receiving", "transport"],
  );
  assert.match(sheet.groups[2].party, /Confirm who is collecting/);
  for (const id of ["release", "identity", "delay"])
    assert.ok(sheet.groups[0].questions.some((x) => x.id === id));
  assert.match(sheet.notice, /does not authorise collection/);
  assert.ok(
    !sheet.groups
      .flatMap((g) => g.questions)
      .some((q) => /availability|price|admission age/i.test(q.text)),
  );
});
test("5.3 sequence distinguishes requests and published facts; coordinates never generate an ETA", async () => {
  const sheet = preparationFor(await provider(r), r);
  assert.equal(sheet.sequence.length, 3);
  assert.equal(sheet.sequence[0].basis, "Your request");
  assert.match(sheet.sequence[1].detail, /Confirm the arrival time/);
  assert.equal(sheet.sequence[1].time, null);
  assert.equal(sheet.sequence[0].time, r.deadline);
  assert.equal(sheet.sequence[2].time, r.end);
  assert.equal(sheet.sequence[1].basis, "Centre address");
});
test("5.5 provider requirements need their own source and stay separate from general prompts", async () => {
  const p = await provider(r);
  p.preparationRequirements = [
    { text: "Bring a spare uniform", source: p.sources[0] },
    { text: "unsupported" },
  ];
  const sheet = preparationFor(p, r);
  assert.equal(sheet.published.length, 1);
  assert.equal(sheet.published[0].basis, "Provider-sourced requirement");
  assert.ok(
    sheet.packing.every((x) => x.basis === "General preparation prompt"),
  );
});
test("5.6 standalone export preserves dates, contacts, draft, blank offline spaces and ticks", async () => {
  const p = await provider(r);
  p.phone = { display: "03 1234 5678", source: p.sources[0] };
  const sheet = preparationFor(p, r, "2026-09-13T10:00:00Z");
  const html = preparationHTML(sheet, ["bag"]);
  for (const value of [
    "03 1234 5678",
    "2026-09-14",
    "2026-09-13T10:00:00Z",
    "At the pickup place",
    "Collector identification",
    "Health, allergy",
    "pickup permission",
    "☑",
    '<div class="line"></div>',
  ])
    assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /<input|<textarea|<script/);
});
test("Q2/Q6 exports escape hostile markup, reject active URL schemes, and exclude private notes", async () => {
  const p = await provider(r);
  p.name = "<img src=x onerror=alert(1)>";
  p.phone = {
    display: "<script>bad()</script>",
    source: { label: "Source", url: "javascript:alert(1)" },
  };
  p.reason = "PRIVATE REASON";
  const html = preparationHTML(preparationFor(p, r));
  assert.doesNotMatch(html, /<img|<script|href="javascript:|PRIVATE REASON/);
  assert.match(html, /&lt;img/);
});
