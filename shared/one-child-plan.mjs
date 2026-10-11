// One child, one centre: the plan behind the one-child options panel.
// Start is when care starts: the child is dropped off at the centre then
// (changed 11 Oct 2026; it used to be the time the parent left). End is when
// the child is collected. Both leave times work back from the road estimate
// (OSRM, no traffic) with the same 5-minute handover and earlier-5-minute
// rounding as the two-children plan.
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
  // Drop-off is the care start; with centre pickup the centre collects the
  // child at Start and the arrival time is theirs to say.
  const arrive = centrePickup || start === null ? null : start;
  const leaveBy = drive === null || arrive === null ? null : floor5(arrive - HANDOVER_MINUTES - drive);
  const leaveForPickup = drive === null || end === null ? null : floor5(end - HANDOVER_MINUTES - drive);
  // A short visit: by the time the parent is back home it is already time to
  // leave again, so waiting nearby is the realistic plan.
  const short = arrive !== null && leaveForPickup !== null && leaveForPickup < arrive + drive;
  return { start, end, drive, centrePickup, arrive, leaveBy, leaveForPickup, short };
}

export function oneChildSteps(p, request, names = (x) => x.name) {
  const plan = oneChildPlan(p, request);
  const from = request?.pickup?.label ?? "your starting point", centre = names(p);
  const driveNote = plan.drive !== null ? `${plan.drive} min drive` : "Drive time didn’t load";
  const steps = [
    plan.centrePickup
      ? { kind: "leave", time: plan.start, label: `The centre picks up your child from ${from}`, note: "Ask the centre to confirm this pickup" }
      : { kind: "leave", time: plan.leaveBy, label: `Leave ${from}`, note: plan.leaveBy !== null ? `Latest time · ${driveNote}` : driveNote },
    { kind: "drop", time: plan.arrive, label: plan.centrePickup ? `Your child arrives at ${centre}` : `Drop off your child at ${centre}`,
      note: plan.centrePickup ? null : "Care starts" },
    { kind: "leave", time: plan.leaveForPickup, label: `Leave ${from} for pickup`, note: plan.leaveForPickup !== null ? `Latest time · ${driveNote}` : driveNote },
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
    ...steps.map((s) => `${s.time === null ? "  ?  " : timeLabel(s.time)}  ${s.label}${s.kind === "leave" && s.time !== null && s.note?.startsWith("Latest") ? " (latest)" : ""}${s.kind === "drop" && s.time !== null ? " (care starts)" : ""}`),
    ...(plan.short ? ["This is a short visit: you may want to wait nearby instead of going back."] : []),
    "",
    "Still to ask",
    ...(asks.length ? asks.map((c) => `- ${c.label}`) : ["- Nothing from the published details."]),
    "- Is there a place on this date, and what time should my child arrive?",
    "",
    "Good to know",
    "- Drive times are road estimates from OpenStreetMap routing. They do not include traffic, so leave a little earlier.",
    "- Leave times allow 5 minutes for each handover and are rounded to the earlier 5 minutes.",
    "- The centre has not agreed to these times yet.",
  ].join("\n");
}
