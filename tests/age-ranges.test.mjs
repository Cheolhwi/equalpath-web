import test from "node:test";
import assert from "node:assert/strict";
import { requestErrors, canonicalRequest, CHILD_AGES, ageShort, ageBounds } from "../shared/request.mjs";
import { checkAge } from "../shared/conditions.mjs";
import { referenceAgeFor } from "../shared/published-ages.mjs";
import { preparationFor } from "../shared/preparation.mjs";
import { fixtureProviders, demoPickup } from "../server/fixtures.mjs";

const request = { pickup: demoPickup, date: "2026-09-22", deadline: "13:00", end: "17:00", age: "", transport: "" };
test("both search forms require an age; single years and the older groups are accepted", () => {
  for (const careType of ["short_term", "regular"]) {
    assert.ok(requestErrors({ ...request, careType }, { requireAge: true }).age);
    assert.ok(requestErrors({ ...request, careType, age: "7" }, { requireAge: true }).age);
    for (const age of [...CHILD_AGES.map(([a]) => a), "1-3", "4-6"]) {
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

test("the age choice is one row of whole years, from under 1 to 6", () => {
  assert.deepEqual(CHILD_AGES.map(([, label]) => label), ["Under 1", "1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(ageBounds("0"), [0, 12]);
  assert.deepEqual(ageBounds("4"), [48, 60]);
  assert.equal(ageShort("0"), "under 1");
  assert.equal(ageShort("1-3"), "1–3");
});
test("a single year answers the common published limits that a group could not", () => {
  const twoToUnderSix = { min: 24, max: 72, maxInclusive: false, endpointKnown: true, wording: "2 to under 6 years" };
  const fromEighteenMonths = { min: 18, max: 72, maxInclusive: false, endpointKnown: true, wording: "18 months to under 6 years" };
  // Each year inside the range fits; outside it doesn't; only the year that
  // crosses a published limit (1 year old vs. "from 18 months") needs asking.
  assert.deepEqual(["0", "1", "2", "3", "4", "5", "6"].map(age => checkAge(twoToUnderSix, { age }).state),
    ["conflict", "conflict", "supported", "supported", "supported", "supported", "conflict"]);
  assert.deepEqual(["0", "1", "2", "5"].map(age => checkAge(fromEighteenMonths, { age }).state),
    ["conflict", "unknown", "supported", "supported"]);
  assert.equal(checkAge(fromEighteenMonths, { age: "1-3" }).state, "unknown", "the old group could only ask");
  assert.equal(checkAge(referenceAgeFor("TASKA"), { age: "3" }).state, "supported");
  assert.equal(checkAge(referenceAgeFor("TADIKA"), { age: "3" }).state, "conflict");
});
