import { feeSummary } from "./result-summary.mjs";

// Presentation only: the API still decides which checks need a question.
// Keep its IDs so selections stay tied to the same centre and dated request.
const topics = {
  age: "Age", admission: "Temporary care", transport: "Centre pickup",
  coverage: "Pickup area", pickup: "Collection time", care: "Care end time",
  transfer: "Travel & handover", capacity: "Availability", fees: "Fee",
};
export const visitDate = date => new Intl.DateTimeFormat("en-GB", {
  weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur",
}).format(new Date(`${date}T12:00:00+08:00`));
export const childAge = age => age === "" ? "Age not specified" : age === "0" ? "Under 1 year" : `${age} ${age === "1" ? "year" : "years"} old`;
export const pickupPreference = transport => transport === "self" ? "I’ll arrange transport" : transport === "institution" ? "Centre pickup requested" : "Pickup not decided yet";

function wording(q, p, r, c) {
  switch (q.id) {
    case "admission": return `Can my child come for a one-off visit on ${visitDate(r.date)}?`;
    case "capacity": return `Do you have a place on ${visitDate(r.date)} until ${r.end}? How much notice do you need, and which documents should I bring?`;
    case "age":
      if (p.age?.alternative) return "I found different age ranges listed. Which one applies to a one-off visit?";
      if (r.age === "") return "What ages do you accept for a one-off visit?";
      return `My child is ${childAge(r.age).toLowerCase()}${r.age === "0" ? " old" : ""}. ${c?.state === "conflict" ? "Do you have another programme for this age?" : "Can they come for a one-off visit?"}`;
    case "transport": return "Can you arrange pickup for this visit?";
    case "coverage": return `Can you pick up from ${r.pickup.label}? Is there a seat available?`;
    case "pickup": return `Can you pick up my child by ${r.deadline}?`;
    case "care": return `Can my child stay until ${r.end} on ${visitDate(r.date)}? What happens if I’m late?`;
    case "transfer": return r.transport === "self"
      ? "What time should I arrive, and how long should I allow for handover?"
      : "How long will the journey take, including handover, and when will my child arrive?";
    case "fees": return p.cost?.available
      ? `The estimated total is ${p.cost.currency || "MYR"} ${Number(p.cost.total).toLocaleString("en-MY")}. Is that right for this visit, and could there be any extra charges?`
      : `What would this one-off visit cost in total? Please include any minimum charge, meals, registration${r.transport === "self" ? "" : ", transport"} and late pickup fees.`;
    default: return q.text;
  }
}
function whyAsk(q, p, r, c) {
  if (q.id === "capacity") return "A listing can’t tell us whether a place is free on your date.";
  if (q.id === "fees") return p.cost?.available
    ? "The estimate still needs to be agreed with the centre."
    : "Programme fees and budget estimates don’t give the total for a one-off visit.";
  if (c?.state === "conflict") return {
    age: "Your child’s age is outside the listed range.",
    admission: "The listed service doesn’t offer one-off care.",
    transport: "The listed service doesn’t offer centre pickup.",
    coverage: "Your pickup place is outside the listed area.",
    pickup: `The listed pickup times are after ${r.deadline}.`,
    care: `The listed hours or collection rules don’t cover ${r.end} on this date.`,
  }[q.id] ?? "The listed details don’t match this part of your request.";
  if (q.id === "age") return p.age?.alternative ? "The sources list different age ranges." : r.age === "" ? "You haven’t selected an age yet." : "We couldn’t confirm that the listed ages cover your child.";
  if (q.id === "transport" && !r.transport) return "You haven’t chosen who will arrange pickup yet.";
  return {
    admission: "One-off care hasn’t been confirmed for this centre.",
    transport: "Pickup for this visit needs checking.",
    coverage: "Coverage of your pickup place needs checking.",
    pickup: `Pickup by ${r.deadline} hasn’t been confirmed.`,
    care: `Care until ${r.end} needs checking for this date.`,
    transfer: "Driving time doesn’t include handover or live traffic.",
  }[q.id] ?? "This detail needs checking with the centre.";
}
export function enquiryView(p, request) {
  return (p.enquiries ?? []).map(q => {
    const check = p.fit?.conditions?.find(c => c.id === q.id);
    const routine = q.id === "capacity" || q.id === "fees";
    const state = routine ? "routine" : check?.state ?? q.reason;
    return { ...q, text: wording(q, p, request, check), topic: topics[q.id] ?? check?.label ?? "Your visit",
      state, check, routine, why: whyAsk(q, p, request, check),
      status: routine ? "Ask for every visit" : state === "conflict" ? "Doesn’t match" : "Needs confirmation",
      fee: q.id === "fees" ? feeSummary(p) : null,
    };
  }).sort((a, b) => Number(b.state === "conflict") - Number(a.state === "conflict"));
}
export function enquiryMessage(p, request, selected) {
  return `Hello ${p.name}, I’m looking for one-off care for my child.\n\nDate: ${visitDate(request.date)}\nPickup from: ${request.pickup.label}\nCollect by: ${request.deadline}\nCare until: ${request.end}\n${childAge(request.age)} · ${pickupPreference(request.transport)}\n\n${selected.map((q, i) => `${i + 1}. ${q.text}`).join("\n\n")}\n\nThank you!`;
}
