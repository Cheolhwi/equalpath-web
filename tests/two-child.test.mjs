import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyPlan, planErrors, childRequest, buildOptions, legKey, checkJourney, planRuns,
  journeyStops, sameCentreMessage, childMessage, familyPlanText, changeLabel, leavePlan, planSteps, optionScore,
  startIds, legsNeeded, nextLegCall, firstStop,
} from "../shared/two-child.mjs";

// Worked examples from the E8 proposal double as fixtures. Road times are test inputs.
const legs = (pairs) => new Map(Object.entries(pairs).flatMap(([k, v]) => {
  const [from, to] = k.split(">");
  return [[legKey(from, to), v]];
}));
const check = (state) => [
  { id: "age", label: "Age", state },
  { id: "admission", label: "Care for a few hours", state: "supported" },
  { id: "care", label: "Care ends at", state: "supported" },
];
const centre = (id, distanceKm, state = "supported", extra = {}) => ({
  id, name: `Centre ${id.toUpperCase()}`, distanceKm, location: { lat: 3.1 + distanceKm / 100, lng: 101.6 }, fit: { conditions: check(state) }, ...extra,
});
const plan = (a, b, run = {}) => {
  const p = emptyPlan({ pickup: { label: "KL Sentral", lat: 3.134, lng: 101.686 }, date: "2026-10-09" });
  p.children = { a: { age: "1-3", ...a }, b: { age: "4-6", ...b } };
  p.run = { ...p.run, ...run };
  return p;
};
const AB = { kind: "pair", a: { id: "A", name: "Centre A" }, b: { id: "B", name: "Centre B" } };

test("8.1.3 names each problem with its child and keeps valid entries", () => {
  const p = emptyPlan();
  p.children.a = { age: "1-3", start: "14:00", end: "13:00" };
  p.children.b = { age: "", start: "09:00", end: "" };
  const e = planErrors(p);
  assert.equal(e.start, "Choose a starting point from the search results or the map.");
  assert.equal(e.date, "Choose a date for care.");
  assert.match(e["a.end"], /^Child 1: choose an end time after the start time/);
  assert.match(e["b.end"], /^Child 2: choose an end time/);
  assert.equal(e["a.start"], undefined);
  assert.equal(e["b.age"], undefined, "an unselected age is allowed and shown as unknown");
});

test("each child is searched with their own age and times, as a self-arranged short visit", () => {
  const r = childRequest(plan({ start: "14:00", end: "18:00" }, { start: "14:30", end: "18:30" }), "b");
  assert.deepEqual([r.careType, r.age, r.deadline, r.end, r.transport, r.includeConflicts, r.sort], ["short_term", "4-6", "14:30", "18:30", "self", false, "recommended"]);
});

test("Example 1: the brief's drop-off works with A then B and a 5-minute margin", () => {
  const j = checkJourney({
    stops: journeyStops(AB, plan({ start: "16:00", end: "18:00" }, { start: "16:30", end: "18:00" }), "dropoff"),
    departure: 15 * 60 + 30, origin: "start", journey: "dropoff",
    legs: legs({ "start>A": 20, "start>B": 30, "A>B": 15, "B>A": 15 }),
  });
  assert.equal(j.state, "works");
  assert.deepEqual(j.best.keys, ["a", "b"]);
  assert.deepEqual(j.best.rows.map((r) => [r.arrive, r.wait, r.complete]), [[950, 5, 960], [975, 10, 990]]);
  assert.equal(j.best.tightest.margin, 5);
  assert.equal(j.alternatives.length, 0, "B then A is 50 minutes late, so it is not an alternative");
  assert.equal(j.orders[1].late.minutes, 50);
});

test("Example 2: equal care ends at two centres conflict, with verified single fixes", () => {
  const p = plan({ start: "16:00", end: "18:00" }, { start: "16:30", end: "18:00" }, {
    dropDepart: "15:30", collectPlace: { label: "Office", lat: 3.15, lng: 101.7 }, collectDepart: "17:00",
  });
  const runs = planRuns(AB, p, legs({ "start>A": 20, "start>B": 30, "A>B": 15, "B>A": 15, "collect>A": 25, "collect>B": 30 }));
  assert.equal(runs.drop.state, "works");
  assert.equal(runs.collect.state, "conflict");
  assert.equal(runs.state, "conflict");
  const [ab, ba] = runs.collect.orders;
  assert.deepEqual([ab.late.key, ab.late.minutes, ba.late.key, ba.late.minutes], ["b", 20, "a", 20]);
  assert.deepEqual(ab.fixes.map((f) => f.changes.map(changeLabel).join()), ["Child 2’s care end 18:20", "Child 1’s care end 17:40"]);
  assert.deepEqual(ba.fixes.map((f) => f.changes.map(changeLabel).join()), ["Child 1’s care end 18:20", "Child 2’s care end 17:40"]);
  // Applying a fix makes that order work with a 0-minute margin.
  const fixed = plan({ start: "16:00", end: "17:40" }, { start: "16:30", end: "18:00" }, p.run);
  const again = planRuns(AB, fixed, legs({ "start>A": 20, "start>B": 30, "A>B": 15, "B>A": 15, "collect>A": 25, "collect>B": 30 }));
  assert.equal(again.collect.state, "works");
  assert.deepEqual(again.collect.best.rows.map((r) => [r.arrive, r.wait, r.complete]), [[1045, 10, 1060], [1075, 0, 1080]]);
});

test("Example 3: both children at one centre at the same time are one stop with a combined allowance", () => {
  const same = { kind: "same", a: { id: "C" }, b: { id: "C" } };
  const p = plan({ start: "16:00", end: "18:00" }, { start: "16:00", end: "18:00" }, {
    dropDepart: "15:25", collectPlace: { label: "Office", lat: 3.15, lng: 101.7 }, collectDepart: "17:20",
  });
  assert.deepEqual(journeyStops(same, p, "dropoff"), [{ key: "ab", centre: "C", planned: 960, allowance: 10 }]);
  const runs = planRuns(same, p, legs({ "start>C": 20, "collect>C": 20 }));
  assert.equal(runs.state, "works");
  assert.deepEqual([runs.drop.best.rows[0].arrive, runs.drop.best.tightest.margin, runs.collect.best.tightest.margin], [945, 5, 10]);
});

test("Example 4: the same adult cannot leave for collection before the last drop-off", () => {
  const p = plan({ start: "14:00", end: "14:50" }, { start: "14:30", end: "15:30" }, {
    dropDepart: "13:30", collectPlace: { label: "Office", lat: 3.15, lng: 101.7 }, collectDepart: "14:15",
  });
  const runs = planRuns(AB, p, legs({ "start>A": 10, "start>B": 15, "A>B": 10, "B>A": 10, "collect>A": 20, "collect>B": 25 }));
  assert.equal(runs.drop.state, "works");
  assert.equal(runs.collect.departure, 870, "leaves at 14:30, not 14:15");
  assert.equal(runs.collect.delayed, true);
  const [ab, ba] = runs.collect.orders;
  assert.deepEqual([ab.late.minutes, ba.late.minutes], [5, 55]);
  assert.deepEqual(ab.fixes.map((f) => f.changes.map(changeLabel).join()), ["Child 1’s care end 14:55"], "leaving earlier is not offered");
  assert.deepEqual(ba.fixes.map((f) => f.changes.map(changeLabel).join()), ["Child 1’s care end 15:45"]);
});

test("fixes are rounded to 5-minute steps in the safe direction", () => {
  const p = plan({ start: "14:00", end: "18:00" }, { start: "14:00", end: "18:00" });
  const j = checkJourney({ stops: journeyStops(AB, p, "dropoff"), departure: 13 * 60 + 30, origin: "start", journey: "dropoff",
    legs: legs({ "start>A": 6, "start>B": 1, "A>B": 6, "B>A": 6 }) });
  assert.equal(j.state, "conflict");
  assert.deepEqual(j.orders[0].fixes.map((f) => f.changes.map(changeLabel).join()), ["Child 2’s care start 14:15", "Child 1’s care start 13:45"]);
});

test("Example 5: a missing road time makes the drop-off undetermined unless another order works", () => {
  const p = plan({ start: "16:00", end: "18:00" }, { start: "16:30", end: "18:00" }, { dropDepart: "15:30" });
  const runs = planRuns(AB, p, legs({ "start>A": 20, "start>B": 30, "B>A": 15 }));
  assert.equal(runs.drop.state, "unknown");
  assert.deepEqual(runs.drop.orders[0].missing, { from: "A", to: "B" });
  assert.equal(runs.collect.state, "input");
  assert.deepEqual(runs.collect.needs, ["where the collection starts", "the time the adult leaves for the collection"]);
});

test("8.2/8.3: same-centre options first, pairs from the first five per child, ten shown", () => {
  const a = ["s", "a1", "a2", "a3", "a4", "a5", "a6"].map((id, i) => centre(id, i + 1));
  const b = [centre("s", 1, "unknown"), ...["b1", "b2", "b3", "b4", "b5"].map((id, i) => centre(id, i + 2)), centre("bx", 1, "conflict")];
  const L = new Map();
  for (const x of a) { L.set(legKey("start", x.id), 10 + x.distanceKm); for (const y of b) { L.set(legKey(x.id, y.id), 5); L.set(legKey(y.id, x.id), 5); } }
  for (const y of b) L.set(legKey("start", y.id), 10 + y.distanceKm);
  const built = buildOptions({ a, b }, { preference: "prefer", legs: L });
  assert.equal(built.sameCount, 1);
  assert.equal(built.options[0].kind, "same");
  assert.equal(built.options[0].status, "confirm", "an unknown age for one child needs confirmation");
  assert.equal(built.options.length, 10);
  assert.equal(built.total, 1 + 24, "one same-centre option plus 5 × 5 pairs minus the shared centre");
  assert.ok(built.options.every((o) => o.a.id !== "a5" && o.b.id !== "bx"), "only the first five per child; known conflicts excluded");
  assert.deepEqual(buildOptions({ a, b }, { preference: "same", legs: L }).options.map((o) => o.id), ["s|s"]);
  const kept = buildOptions({ a, b }, { preference: "separate", legs: L, keep: { child: "a", id: "a2" } });
  assert.ok(kept.options.length && kept.options.every((o) => o.a.id === "a2"));
  assert.deepEqual(buildOptions({ a, b: [] }).missing, ["b"]);
});

test("recommendation: each child's Recommended rank leads when drive times are close", () => {
  const a = [centre("a1", 3, "supported", { personalisedReason: "Matches your choices: Kind teachers" }), centre("a2", 1)];
  const b = [centre("b1", 3), centre("b2", 1)];
  const near = legs({ "start>a1": 9, "start>a2": 4, "start>b1": 9, "start>b2": 4, "a1>b1": 3, "b1>a1": 3, "a2>b2": 3, "b2>a2": 3, "a1>b2": 6, "b2>a1": 6, "a2>b1": 6, "b1>a2": 6 });
  const built = buildOptions({ a, b }, { preference: "separate", legs: near });
  assert.equal(built.options[0].id, "a1|b1", "top-ranked for both children, 5 minutes further, still first");
  assert.equal(built.options[0].reason, "Matches: Kind teachers");
  // A long extra drive outweighs the recommendation.
  const far = legs({ "start>a1": 50, "start>a2": 4, "start>b1": 50, "start>b2": 4, "a1>b1": 3, "b1>a1": 3, "a2>b2": 3, "b2>a2": 3, "a1>b2": 50, "b2>a1": 50, "a2>b1": 50, "b1>a2": 50 });
  assert.equal(buildOptions({ a, b }, { preference: "separate", legs: far }).options[0].id, "a2|b2");
});

test("recommendation: one centre for both, details that fit both and contacts add to the score", () => {
  const phone = { phone: { display: "03-1234 5678" } };
  const base = { kind: "pair", a: centre("x", 1), b: centre("y", 1), dropOff: 10, status: "confirm" };
  const s0 = optionScore(base, [base.a], [base.b]);
  assert.ok(optionScore({ ...base, status: "supported" }, [base.a], [base.b]) > s0);
  assert.ok(optionScore({ ...base, a: { ...base.a, ...phone }, b: { ...base.b, ...phone } }, [base.a], [base.b]) > s0);
  assert.ok(optionScore({ ...base, kind: "same", b: base.a }, [base.a], [base.a]) > s0);
  assert.ok(optionScore({ ...base, dropOff: 40 }, [base.a], [base.b]) < s0);
});

test("pairs without a road time come last", () => {
  const a = [centre("a1", 1), centre("a2", 2)], b = [centre("b1", 1), centre("b2", 2)];
  const L = legs({ "start>a1": 5, "start>a2": 6, "start>b1": 5, "start>b2": 6, "a1>b1": 4, "b1>a1": 4, "a2>b2": 3 });
  const built = buildOptions({ a, b }, { preference: "separate", legs: L });
  assert.equal(built.options.at(-1).dropOff, null);
  assert.deepEqual(built.options.slice(0, 2).map((o) => [o.id, o.dropOff]), [["a1|b1", 9], ["a2|b2", 9]]);
});

test("lookups: start times for the ten centres most likely to appear, best rank first", () => {
  const a = ["s", "a1", "a2", "a3", "a4", "a5", "a6"].map((id, i) => centre(id, 1 + i / 10));
  const b = ["b1", "s", "b2", "b3", "b4", "b5", "b6", "a6"].map((id, i) => centre(id, 1 + i / 10));
  const ids = startIds({ a, b });
  assert.equal(ids.length, 10, "one routes request");
  assert.deepEqual(ids.slice(0, 3), ["s", "b1", "a1"]);
  assert.ok(ids.includes("a6"), "listed for both children: a possible one-stop option");
  assert.ok(!ids.includes("a5") && !ids.includes("b6"), "outside the first five and listed for one child only");
});

test("lookups: each journey needs one centre-to-centre time in its likely order", () => {
  const o = { kind: "pair", a: centre("A", 1), b: centre("B", 2) };
  const near = legs({ "start>A": 12, "start>B": 4 });
  // Same times: the centre nearer the start first (a later leave time).
  const same = plan({ start: "09:00", end: "12:00" }, { start: "09:00", end: "12:00" });
  assert.equal(firstStop(o, same, "dropoff", near), "b");
  assert.deepEqual(legsNeeded(o, same, near), [["B", "A"]]);
  // Different times: the earlier handover first on each journey.
  const split = plan({ start: "09:00", end: "13:00" }, { start: "09:30", end: "12:00" });
  assert.deepEqual(legsNeeded(o, split, near), [["A", "B"], ["B", "A"]]);
  assert.deepEqual(legsNeeded(o, same, near, { both: true }), [["B", "A"], ["A", "B"]]);
  // The routes action only accepts centres within 10 km of the origin.
  const far = { kind: "pair", a: centre("A", 1), b: { ...centre("B", 2), location: { lat: 3.3, lng: 101.6 } } };
  assert.deepEqual(legsNeeded(far, same, near), []);
  assert.deepEqual(legsNeeded({ kind: "same", a: o.a, b: o.a }, same, near), []);
});

test("lookups: ask only while a pair could still beat the third known option", () => {
  const a = [centre("a1", 1), centre("a2", 1.1), centre("a3", 1.2)], b = [centre("b1", 1), centre("b2", 1.1), centre("b3", 1.2)];
  const p = plan({ start: "09:00", end: "12:00" }, { start: "09:00", end: "12:00" });
  const start = { "start>a1": 5, "start>a2": 6, "start>a3": 7, "start>b1": 6, "start>b2": 7, "start>b3": 8 };
  // Only start times: the best pair is looked up first, from its nearer centre,
  // together with every other needed time from that centre.
  const first = nextLegCall({ a, b }, p, legs(start), { want: 3 });
  assert.equal(first.from, "a1");
  assert.ok(first.ids.includes("b1") && first.ids.length <= 10);
  // Once three options are known and nothing left could beat them, stop.
  const known = legs({ ...start, "a1>b1": 2, "a1>b2": 2, "a1>b3": 2, "a2>b1": 2, "a2>b2": 2, "a2>b3": 2, "a3>b1": 40, "a3>b2": 40, "a3>b3": 40 });
  assert.equal(nextLegCall({ a, b }, p, known, { want: 3 }), null);
  // A road time that cannot be found is not asked for again.
  const skip = new Set(["a1>b1", "a1>b2", "a1>b3"].map((k) => legKey(...k.split(">"))));
  assert.notEqual(nextLegCall({ a, b }, p, legs(start), { want: 3, skip })?.from, "a1");
});

test("8.6: one message for one centre asks about two places; two centres get their own child only", () => {
  const p = plan({ start: "09:00", end: "12:00" }, { start: "09:30", end: "12:00" });
  const pa = { ...centre("c", 1), enquiries: [{ id: "capacity", text: "x", reason: "availability" }, { id: "fees", text: "y", reason: "charges" }] };
  const same = { kind: "same", a: pa, b: { ...pa } };
  const text = sameCentreMessage(same, p);
  assert.match(text, /places for both children/);
  assert.match(text, /Child 1: 1–3 years old, from 09:00 to 12:00/);
  assert.doesNotMatch(text, /name|birth/i);
  const own = childMessage({ kind: "pair", a: pa, b: pa }, p, "b");
  assert.match(own, /Drop-off: 09:30 · Collection: 12:00/);
  assert.doesNotMatch(own, /Child 1|1–3/);
});

const L = (pairs) => legs(pairs);
const run = { collectPlace: { label: "Office", lat: 3.15, lng: 101.7 } };

test("leave-by: Example 1 drop-off says leave by 15:35, A first, and B 10 minutes to spare", () => {
  const lp = leavePlan(AB, plan({ start: "16:00", end: "18:00" }, { start: "16:30", end: "18:00" }, run),
    L({ "start>A": 20, "start>B": 30, "A>B": 15, "B>A": 15, "collect>A": 25, "collect>B": 30 }));
  assert.equal(lp.dropoff.state, "works");
  assert.deepEqual([lp.dropoff.best.leaveBy, lp.dropoff.best.order.map((x) => x.key), lp.dropoff.best.slack], [935, ["a", "b"], 10]);
});

test("leave-by: equal pickup times at two centres offer one fix — pick up Child 1 earlier", () => {
  const p = plan({ start: "16:00", end: "18:00" }, { start: "16:30", end: "18:00" }, run);
  const legsEx2 = L({ "start>A": 20, "start>B": 30, "A>B": 15, "B>A": 15, "collect>A": 25, "collect>B": 30 });
  const lp = leavePlan(AB, p, legsEx2);
  assert.equal(lp.collection.state, "late");
  assert.equal(lp.state, "change");
  assert.deepEqual(lp.collection.fix.changes, [{ child: "a", field: "end", value: "17:40" }]);
  const fixed = leavePlan(AB, plan({ start: "16:00", end: "17:40" }, { start: "16:30", end: "18:00" }, run), legsEx2);
  assert.equal(fixed.state, "works");
  assert.equal(fixed.collection.best.leaveBy, 17 * 60 + 10, "17:40 − 5 handover − 25 drive");
});

test("leave-by: equal start times at two centres offer one fix — drop Child 2 later, rounded up", () => {
  const p = plan({ start: "14:00", end: "18:00" }, { start: "14:00", end: "18:00" }, run);
  const lp = leavePlan(AB, p, L({ "start>A": 6, "start>B": 1, "A>B": 6, "B>A": 6, "collect>A": 6, "collect>B": 6 }));
  assert.equal(lp.dropoff.state, "late");
  assert.deepEqual(lp.dropoff.fix.changes, [{ child: "b", field: "start", value: "14:15" }]);
});

test("leave-by: a journey that needs a change still shows its timeline with how late each stop would be", () => {
  const p = plan({ start: "14:00", end: "18:00" }, { start: "14:00", end: "18:00" }, run);
  const lp = leavePlan(AB, p, L({ "start>A": 6, "start>B": 1, "A>B": 6, "B>A": 6, "collect>A": 6, "collect>B": 6 }));
  const drop = planSteps(AB, p, lp, (c) => c.name).filter((x) => x.journey === "dropoff");
  // Same order as the fix (drop Child 2 later), so the two never disagree.
  assert.deepEqual(lp.dropoff.fix.changes, [{ child: "b", field: "start", value: "14:15" }]);
  assert.deepEqual(drop.map((x) => [x.kind, x.key ?? null, x.time, x.lateBy ?? 0]), [["leave-drop", null, 13 * 60 + 45, 0], ["drop", "a", 14 * 60, 0], ["drop", "b", 14 * 60 + 11, 11]]);
  assert.match(familyPlanText(AB, p, lp, (c) => c.name), /11 min late/);
});

test("leave-by: one stop for both children at one centre", () => {
  const same = { kind: "same", a: { id: "C" }, b: { id: "C" } };
  const lp = leavePlan(same, plan({ start: "16:00", end: "18:00" }, { start: "16:00", end: "18:00" }, run), L({ "start>C": 20, "collect>C": 20 }));
  assert.equal(lp.state, "works");
  assert.deepEqual([lp.dropoff.best.leaveBy, lp.collection.best.leaveBy], [930, 1050]);
  const steps = planSteps(same, plan({ start: "16:00", end: "18:00" }, { start: "16:00", end: "18:00" }, run), lp, () => "Centre C");
  assert.deepEqual(steps.map((x) => x.label), ["Leave KL Sentral", "Drop off both children at Centre C", "Leave Office for pickup", "Pick up both children at Centre C"]);
});

test("leave-by: pickup that would have to start before the last drop-off is flagged with a fix", () => {
  const p = plan({ start: "14:00", end: "14:50" }, { start: "14:30", end: "15:30" }, run);
  const lp = leavePlan(AB, p, L({ "start>A": 10, "start>B": 15, "A>B": 10, "B>A": 10, "collect>A": 20, "collect>B": 25 }));
  assert.equal(lp.dropoff.state, "works");
  assert.equal(lp.collection.state, "short");
  assert.deepEqual(lp.collection.fix.changes, [{ child: "a", field: "end", value: "14:55" }]);
});

test("leave-by: a missing road time is 'unknown', never a guess", () => {
  const lp = leavePlan(AB, plan({ start: "16:00", end: "18:00" }, { start: "16:30", end: "18:00" }, run), L({ "start>A": 20, "start>B": 30 }));
  assert.equal(lp.dropoff.state, "unknown");
  assert.equal(lp.state, "unknown");
});

test("leave-by: a known order that needs a change is used when the other order is not loaded", () => {
  const p = plan({ start: "14:00", end: "18:00" }, { start: "14:00", end: "18:00" }, run);
  const lp = leavePlan(AB, p, L({ "start>A": 6, "start>B": 1, "B>A": 6, "collect>A": 6, "collect>B": 6 }));
  assert.equal(lp.dropoff.state, "late");
  assert.ok(lp.dropoff.unchecked, "the other order is looked up when the plan opens");
  assert.deepEqual(lp.dropoff.fix.changes, [{ child: "a", field: "start", value: "14:15" }]);
});

test("leave-by: without the centre-to-centre time the plan still shows the likely order, marked as not loaded", () => {
  const p = plan({ start: "16:00", end: "18:00" }, { start: "16:30", end: "18:00" }, run);
  const lp = leavePlan(AB, p, L({ "start>A": 20, "start>B": 30, "collect>A": 25, "collect>B": 30 }));
  assert.equal(lp.state, "unknown");
  const steps = planSteps(AB, p, lp, (c) => c.name);
  assert.deepEqual(steps.slice(0, 3).map((x) => [x.kind, x.time, !!x.unknownDrive]), [["leave-drop", 935, false], ["drop", 960, false], ["drop", 990, true]]);
  assert.ok(steps[0].partial);
  assert.match(familyPlanText(AB, p, lp, (c) => c.name), /did not load/);
});

test("8.6.3: the family plan is a labelled draft with leave-by steps and open questions", () => {
  const option = { kind: "pair", a: centre("a1", 1, "unknown"), b: centre("b1", 2) };
  const p = plan({ start: "16:00", end: "18:00" }, { start: "16:30", end: "18:00" }, run);
  const text = familyPlanText(option, p, leavePlan(option, p, L({ "start>a1": 20, "a1>b1": 15, "collect>a1": 10, "b1>a1": 15, "collect>b1": 10 })));
  assert.match(text, /^EqualPath family plan — DRAFT, not confirmed with any centre/);
  assert.match(text, /15:35  Leave KL Sentral \(latest\)/);
  assert.match(text, /16:00  Drop off Child 1 at Centre A1 by 16:00/);
  assert.match(text, /Child 1 at Centre A1: Age/);
  assert.match(text, /do not include traffic/);
});
