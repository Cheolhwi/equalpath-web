import test from "node:test";
import assert from "node:assert/strict";
import { assess, costFor, enquiries } from "../shared/conditions.mjs";
import { enquiryMessage, enquiryView } from "../shared/enquiry-view.mjs";
import { fixtureProviders, demoPickup } from "../server/fixtures.mjs";
const request = { pickup: demoPickup, date: "2026-09-14", deadline: "13:00", end: "18:00", age: "4", transport: "institution" };
function hydrated(provider, r = request) {
  const p = structuredClone(provider), fit = assess(p, r);
  return { ...p, fit, enquiries: enquiries(p, r, fit), cost: costFor(p, r) };
}
test("questions retain API membership and link by condition ID, with conflicts first and routine questions separate", () => {
  const p = hydrated(fixtureProviders[1]), rows = enquiryView(p, request);
  assert.deepEqual(rows.map(q => q.id).sort(), p.enquiries.map(q => q.id).sort());
  assert.equal(rows[0].state, "conflict");
  for (const q of rows) {
    if (q.routine) {
      assert.equal(q.check, undefined);
      assert.equal(q.status, "Ask for every visit");
    } else {
      assert.strictEqual(q.check, p.fit.conditions.find(c => c.id === q.id));
      assert.notEqual(q.check.state, "supported");
      assert.equal(q.state, q.check.state);
    }
  }
  assert.deepEqual(rows.filter(q => q.routine).map(q => q.id).sort(), ["capacity", "fees"]);
  assert.ok(rows.find(q => q.id === "care").text.includes("18:00"));
  assert.ok(rows.find(q => q.id === "pickup").text.includes("13:00"));
});
test("unspecified pickup and age are described as user choices, not missing provider facts; self transport omits pickup questions", () => {
  const r = { ...request, age: "", transport: "" }, p = hydrated(fixtureProviders[0], r), rows = enquiryView(p, r);
  assert.match(rows.find(q => q.id === "age").why, /haven’t selected an age/);
  assert.match(rows.find(q => q.id === "transport").why, /haven’t chosen/);
  const self = { ...request, transport: "self" }, selfRows = enquiryView(hydrated(fixtureProviders[0], self), self);
  assert.ok(selfRows.every(q => !["transport", "coverage", "pickup"].includes(q.id)));
  assert.match(selfRows.find(q => q.id === "transfer").text, /What time should I arrive/);
});
test("copied message follows selected order and keeps visit context, without internal condition text or unselected questions", () => {
  const p = hydrated(fixtureProviders[1]), rows = enquiryView(p, request);
  const selected = [rows.find(q => q.id === "fees"), rows.find(q => q.id === "care")];
  const message = enquiryMessage(p, request, selected);
  assert.match(message, /Mon, 14 Sept 2026/);
  assert.ok(message.includes(p.name)); assert.ok(message.includes(demoPickup.label));
  assert.ok(message.includes("Collect by: 13:00\nCare until: 18:00"));
  assert.ok(message.indexOf(selected[0].text) < message.indexOf(selected[1].text));
  assert.ok(!message.includes(rows.find(q => q.id === "capacity").text));
  assert.ok(!message.includes(selected[1].check.reason));
});
test("fee question distinguishes a validated visit estimate from monthly rates and preserves conflicting age sources", () => {
  const p = hydrated(fixtureProviders[0]), fees = enquiryView(p, request).find(q => q.id === "fees");
  assert.match(fees.text, /estimated total is MYR 90/);
  const other = structuredClone(fixtureProviders[1]);
  other.age.alternative = { wording: "3–5 years", source: { label: "Other age source", url: "https://example.com/age" } };
  const rows = enquiryView(hydrated(other), request);
  assert.match(rows.find(q => q.id === "fees").text, /one-off visit cost in total/);
  assert.match(rows.find(q => q.id === "age").text, /different age ranges/);
  assert.match(rows.find(q => q.id === "age").check.reason, /another source lists/);
});
