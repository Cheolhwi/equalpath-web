// One child, one centre: the plan behind the one-child options panel.
// Start is when the parent leaves the starting point (the one-child meaning,
// confirmed 6 Oct 2026); End is when the child is collected at the centre.
// Arrival is a road estimate (OSRM, no traffic). Leaving for pickup uses the
// same 5-minute handover and earlier-5-minute rounding as the two-children plan.
import { minutes, timeLabel } from "./request.mjs";
import { childAge, visitDate } from "./enquiry-view.mjs";

export const HANDOVER_MINUTES = 5;
const floor5 = (n) => Math.floor(n / 5) * 5;
const PICKUP_CHECKS = ["transport", "coverage", "pickup"];

// What the parent still needs to ask: the same count as the result cards
// (arrival time is always asked; pickup checks only when the centre picks up).
export function askChecks(p, request) {
  return (p?.fit?.conditions ?? []).filter((c) => c.state === "conflict"
    || (c.state === "unknown" && c.id !== "transfer" && !(request?.transport !== "institution" && PICKUP_CHECKS.includes(c.id))));
}

export function oneChildPlan(p, request) {
  const start = minutes(request?.deadline), end = minutes(request?.end);
  const drive = p?.driving?.state === "available" && Number.isFinite(p.driving.minutes) ? p.driving.minutes : null;
  const centrePickup = request?.transport === "institution";
  const arrive = drive === null || centrePickup || start === null ? null : start + drive;
  const leaveForPickup = drive === null || end === null ? null : floor5(end - HANDOVER_MINUTES - drive);
  // A short visit: by the time the parent is back home it is already time to
  // leave again, so waiting nearby is the realistic plan.
  const short = arrive !== null && leaveForPickup !== null && leaveForPickup < arrive + drive;
  return { start, end, drive, centrePickup, arrive, leaveForPickup, short };
}

export function oneChildSteps(p, request, names = (x) => x.name) {
  const plan = oneChildPlan(p, request);
  const from = request?.pickup?.label ?? "your starting point", centre = names(p);
  const driveNote = plan.drive !== null ? `About ${plan.drive} min drive, no traffic included` : "Drive time didn’t load";
  const steps = [
    plan.centrePickup
      ? { kind: "leave", time: plan.start, label: `The centre picks up your child from ${from}`, note: "Ask the centre to confirm this pickup" }
      : { kind: "leave", time: plan.start, label: `Leave ${from}`, note: driveNote },
    { kind: "drop", time: plan.arrive, label: plan.centrePickup ? `Your child arrives at ${centre}` : `Drop off your child at ${centre}`,
      note: plan.arrive !== null ? "Estimated arrival" : plan.centrePickup ? null : "Arrival time depends on the drive" },
    { kind: "leave", time: plan.leaveForPickup, label: `Leave ${from} for pickup`, note: plan.leaveForPickup !== null ? `Latest time to leave · ${driveNote.toLowerCase()}` : driveNote },
    { kind: "collect", time: plan.end, label: `Pick up your child at ${centre}` },
  ];
  return { plan, steps };
}

export function oneChildPlanText(p, request, names = (x) => x.name) {
  const { plan, steps } = oneChildSteps(p, request, names);
  const asks = askChecks(p, request);
  return [
    "EqualPath plan — DRAFT, not confirmed with the centre",
    `Date: ${visitDate(request.date)}`,
    `Your child: ${request.age ? childAge(request.age).toLowerCase() : "age not chosen"}`,
    `Centre: ${names(p)}`,
    "",
    "Plan",
    ...steps.map((s) => `${s.time === null ? "  ?  " : timeLabel(s.time)}  ${s.label}${s.kind === "leave" && s.time !== null && s.label.endsWith("pickup") ? " (latest)" : ""}${s.kind === "drop" && s.time !== null ? " (estimate)" : ""}`),
    ...(plan.short ? ["This is a short visit: you may want to wait nearby instead of going back."] : []),
    "",
    "Still to ask",
    ...(asks.length ? asks.map((c) => `- ${c.label}`) : ["- Nothing from the published details."]),
    "- Is there a place on this date, and what time should my child arrive?",
    "",
    "Good to know",
    "- Drive times are road estimates from OpenStreetMap routing. They do not include traffic, so leave a little earlier.",
    "- The leave-for-pickup time allows 5 minutes for the handover and is rounded to the earlier 5 minutes.",
    "- The centre has not agreed to these times yet.",
  ].join("\n");
}
