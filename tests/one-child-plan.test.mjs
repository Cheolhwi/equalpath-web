import test from "node:test";
import assert from "node:assert/strict";
import { oneChildPlan, oneChildSteps, oneChildPlanText, askChecks } from "../shared/one-child-plan.mjs";

const request = { careType: "short_term", date: "2026-10-12", deadline: "09:00", end: "15:00", age: "4-6", transport: "self", pickup: { label: "KL Sentral" } };
const centre = (minutes, conditions = []) => ({ name: "Garden House", driving: minutes === null ? { state: "unavailable" } : { state: "available", minutes }, fit: { conditions } });

test("Start is when care starts; both leave times work back from the road time", () => {
  const plan = oneChildPlan(centre(8), request);
  assert.equal(plan.start, 9 * 60);
  assert.equal(plan.arrive, 9 * 60);
  // 09:00 − 5 min handover − 8 min drive = 08:47 → 08:45 (earlier 5 minutes)
  assert.equal(plan.leaveBy, 8 * 60 + 45);
  // 15:00 − 5 min handover − 8 min drive = 14:47 → 14:45 (earlier 5 minutes)
  assert.equal(plan.leaveForPickup, 14 * 60 + 45);
  assert.equal(plan.short, false);
});

test("without a road time only the asked-for times are shown", () => {
  const plan = oneChildPlan(centre(null), request);
  assert.equal(plan.leaveBy, null);
  assert.equal(plan.leaveForPickup, null);
  const { steps } = oneChildSteps(centre(null), request);
  assert.deepEqual(steps.map((s) => s.time), [null, 540, null, 900]);
});

test("centre pickup: no parent drive in the morning, the parent still collects", () => {
  const { plan, steps } = oneChildSteps(centre(10), { ...request, transport: "institution" });
  assert.equal(plan.arrive, null);
  assert.equal(plan.leaveBy, null);
  assert.equal(steps[0].time, 9 * 60);
  assert.match(steps[0].label, /centre picks up your child from KL Sentral/);
  assert.equal(steps[2].time, 14 * 60 + 45);
});

test("a short visit suggests waiting nearby", () => {
  const plan = oneChildPlan(centre(20), { ...request, end: "09:40" });
  assert.equal(plan.short, true);
  assert.equal(oneChildPlan(centre(20), { ...request, end: "10:30" }).short, false);
});

test("questions follow the result-card count: arrival is never counted, pickup only for centre pickup", () => {
  const conditions = [
    { id: "age", state: "unknown", label: "Age" },
    { id: "transfer", state: "unknown", label: "Arrival time" },
    { id: "pickup", state: "unknown", label: "Pickup time" },
    { id: "care", state: "supported", label: "Care hours" },
  ];
  assert.deepEqual(askChecks(centre(5, conditions), request).map((c) => c.id), ["age"]);
  assert.deepEqual(askChecks(centre(5, conditions), { ...request, transport: "institution" }).map((c) => c.id), ["age", "pickup"]);
});

test("the plan text is a dated draft with the questions", () => {
  const text = oneChildPlanText(centre(8, [{ id: "age", state: "unknown", label: "Age" }]), request);
  assert.match(text, /DRAFT/);
  assert.match(text, /08:45 {2}Leave KL Sentral \(latest\)/);
  assert.match(text, /09:00 {2}Drop off your child at Garden House \(care starts\)/);
  assert.match(text, /14:45 {2}Leave KL Sentral for pickup \(latest\)/);
  assert.match(text, /- Age/);
});
