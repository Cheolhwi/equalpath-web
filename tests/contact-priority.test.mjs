import test from "node:test";
import assert from "node:assert/strict";
import { hasContact, sortProviders, suggestProviders, bestForPriority } from "../shared/conditions.mjs";
import { createAPI } from "../server/api.mjs";
import { fixtureCatalog, demoPickup } from "../server/fixtures.mjs";
const date = "2026-09-14";
const request = { careType: "regular", pickup: demoPickup, date, deadline: "13:00", end: "18:00", age: "4", transport: "self", radius: 10, sort: "distance" };
const source = { label: "Test contact", url: "https://example.com/contact" };
const phone = { display: "03-1234 5678", source };
const whatsapp = [{ href: "https://wa.me/60312345678", display: "03-1234 5678", scope: "website", source }];
const provider = (id, distance, extra = {}) => ({ ...structuredClone(fixtureCatalog.items[0]), id, name: id,
  distanceKm: distance, location: { lat: 3.139 + distance * .001, lng: 101.6869 }, phone: null, whatsapp: [],
  feeRule: null, fees: [{ amount: distance * 100, basis: "month", currency: "MYR", kind: "programme" }],
  fit: { counts: { conflict: 0 }, conditions: [] }, ...extra,
});
test("only visible phones and explicit WhatsApp links qualify; an ordinary website or empty contact does not", () => {
  assert.equal(hasContact({ phone }), true); assert.equal(hasContact({ whatsapp }), true);
  for (const p of [{}, { website: "https://example.com" }, { phone: {} }, { phone: { display: "  " }, whatsapp: [{ href: "" }] }]) assert.equal(hasContact(p), false);
});
test("contact availability precedes the chosen sort within fit groups and never promotes conflicts above non-conflicts", () => {
  const rows = [provider("A-nearest", 1), provider("Z-phone", 3, { phone }), provider("Y-whatsapp", 2, { whatsapp }), provider("B-conflict", .1, { phone, fit: { counts: { conflict: 1 }, conditions: [] } })];
  for (const sort of ["distance", "price", "closing", "pickup", "name"]) {
    const result = sortProviders(rows, sort, date);
    assert.ok(result.slice(0, 2).every(hasContact));
    assert.equal(result[2].id, "A-nearest"); assert.equal(result[3].id, "B-conflict");
  }
});
test("suggestions use only contactable candidates when present, without filling empty slots; otherwise fall back", () => {
  const rows = [provider("near", 1), provider("phone", 4, { phone }), provider("whatsapp", 3, { whatsapp }), provider("other", 2)];
  for (const sort of ["distance", "price", "closing", "pickup", "name"]) {
    assert.deepEqual(suggestProviders(rows, { ...request, sort }).filter(p => p.suggested).map(p => p.id), ["phone", "whatsapp"]);
  }
  assert.deepEqual(suggestProviders(rows.filter(p => !hasContact(p)), request).filter(p => p.suggested).map(p => p.id), ["near", "other"]);
  const conflict = provider("conflict-phone", 1, { phone, fit: { counts: { conflict: 1 }, conditions: [] } });
  assert.deepEqual(suggestProviders([conflict, rows[0]], request).filter(p => p.suggested).map(p => p.id), ["near"]);
});
test("comparison winners and ties use the same contact preference; missing prices cannot create a cheap winner", () => {
  const rows = [provider("near-cheap", 1), provider("phone", 3, { phone }), provider("wa", 3, { whatsapp })];
  for (const sort of ["distance", "price"]) assert.deepEqual(bestForPriority(rows, sort, date).ids, ["phone", "wa"]);
  assert.deepEqual(bestForPriority([rows[0]], "price", date).ids, ["near-cheap"]);
  assert.doesNotMatch(bestForPriority(rows, "price", date).message, /phone|WhatsApp|contact/i);
  const missing = { ...rows[1], fees: [] };
  assert.deepEqual(bestForPriority([rows[0], missing], "price", date).ids, []);
  assert.ok(suggestProviders([rows[0], missing], { ...request, sort: "price" }).every(p => !p.suggested));
});
test("contact ranking preserves the nearest 20, radius and totals, and recalculates fallback on the next page", async () => {
  const items = Array.from({ length: 25 }, (_, i) => provider(`p-${String(i).padStart(2, "0")}`, i + 1, i === 18 ? { phone } : {}));
  const far = provider("far-with-phone", 1, { location: { lat: 3.5, lng: 101.6869 }, phone });
  const api = createAPI({ store: { catalog: async () => ({ ...fixtureCatalog, items: [...items, far] }) }, drivingRoutes: async (_, rows) => rows });
  for (const sort of ["distance", "price", "name"]) {
    const first = await api({ action: "search", request: { ...request, sort } });
    assert.equal(first.total, 25); assert.equal(first.items.length, 20);
    assert.deepEqual(first.items.map(p => p.id).sort(), items.slice(0, 20).map(p => p.id));
    assert.equal(first.items[0].id, "p-18");
    assert.doesNotMatch(first.ordering.explanation, /phone|WhatsApp|contact/i);
    assert.deepEqual(first.items.filter(p => p.suggested).map(p => p.id), ["p-18"]);
    const next = await api({ action: "search", request: { ...request, sort }, page: 1 });
    assert.equal(next.items.length, 5); assert.equal(next.items.filter(p => p.suggested).length, 3);
    assert.ok(next.items.every(p => !hasContact(p)));
  }
});
