import test from "node:test";
import assert from "node:assert/strict";
import { requestErrors, canonicalRequest } from "../shared/request.mjs";
import { checkAge } from "../shared/conditions.mjs";
import { referenceAgeFor } from "../shared/published-ages.mjs";
import { preparationFor } from "../shared/preparation.mjs";
import { fixtureProviders, demoPickup } from "../server/fixtures.mjs";

const request = { pickup: demoPickup, date: "2026-09-22", deadline: "13:00", end: "17:00", age: "", transport: "" };
test("both search forms require an age group; API canonicalisation retains the entire range", () => {
  for (const careType of ["short_term", "regular"]) {
    assert.ok(requestErrors({ ...request, careType }, { requireAge: true }).age);
    for (const age of ["1-3", "4-6"]) {
      const r = { ...request, careType, age };
      assert.deepEqual(requestErrors(r, { requireAge: true }), {});
      assert.equal(canonicalRequest(r).age, age);
    }
  }
});
test("age groups only pass if the full group fits; partial overlap needs a question", () => {
  const published = { min: 24, max: 72, maxInclusive: false, endpointKnown: true, wording: "2 to under 6 years" };
  for (const age of ["1-3", "4-6"]) assert.equal(checkAge(published, { age }).state, "unknown");
  assert.equal(checkAge({ ...published, min: 12, max: 48 }, { age: "1-3" }).state, "supported");
  assert.equal(checkAge({ ...published, min: 48, max: 84 }, { age: "1-3" }).state, "conflict");
  assert.equal(checkAge(referenceAgeFor("TASKA"), { age: "1-3" }).state, "supported");
  assert.equal(checkAge(referenceAgeFor("TADIKA"), { age: "4-6" }).state, "supported");
  assert.equal(checkAge(referenceAgeFor("TADIKA"), { age: "1-3" }).state, "conflict");
  assert.equal(checkAge({ ...referenceAgeFor("TASKA"), min: 24 }, { age: "1-3" }).state, "unknown");
});
test("younger-group preparation keeps the prompt about feeding and spare clothes", () => {
  assert.ok(preparationFor(fixtureProviders[0], { ...request, age: "1-3" }).packing.some(x => x.id === "young"));
  assert.ok(!preparationFor(fixtureProviders[0], { ...request, age: "4-6" }).packing.some(x => x.id === "young"));
});
