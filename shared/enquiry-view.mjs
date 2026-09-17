import { isShortCare } from "./request.mjs";
import { feeSummary } from "./result-summary.mjs";

// Presentation only: the API still decides which checks need a question.
// Keep its IDs so selections stay tied to the same centre and dated request.
const topics = {
  age: "Age", admission: "Care for a few hours", transport: "Centre pickup",
  coverage: "Pickup area", pickup: "Pickup time", care: "Time to go home",
  transfer: "Travel time", capacity: "Can they take your child?", fees: "Fee",
};
export const visitDate = date => new Intl.DateTimeFormat("en-GB", {
  weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur",
}).format(new Date(`${date}T12:00:00+08:00`));
export const childAge = age => age === "" ? "Age not chosen" : age === "0" ? "Under 1 year" : `${String(age).replace("-", "–")} ${age === "1" ? "year" : "years"} old`;
export const pickupPreference = transport => transport === "self" ? "I’ll handle pickup" : transport === "institution" ? "Ask the centre for pickup" : "Pickup not decided yet";

// Plain-English versions of published service questions. Keep the original
// requirements and evidence on the check; unfamiliar services keep their wording.
const admissionQuestions = new Map([
  ["Do you still accept children who are not enrolled for an ad-hoc visit, and is there a place for my child at these times?",
    "Do you still offer childcare for a few hours?"],
  ["Is there an hourly-care slot for my child’s age and these hours, and what is the minimum stay and price?",
    "Can my child stay for a few hours? What is the shortest stay I can book, and how much does it cost?"],
  ["Can you accept this short-term visit with the required notice, and which session and daily price apply?",
    "How early will I need to book? What hours can my child stay, and how much will it cost?"],
  ["Is your holiday programme running on this date, and can my child join for these hours? What age range and daily fee apply?",
    "Is your holiday care open on this date? What ages can join, what are the hours, and how much is one day?"],
  ["Do you still offer hourly or daily care, and can you take my child for this visit? What are the hours and total fee?",
    "Do you still offer care for a few hours or one day? What are the hours and total cost?"],
  ["Can I book supervised drop-off for my child’s age and these hours, and what is the total price?",
    "Can I book someone to look after my child while I leave? What ages can you take, how long can they stay, and how much does it cost?"],
  ["Is there space in Art Drop for my child’s age and a visit of up to three hours?",
    "Can my child join Art Drop for up to three hours? What ages can join?"],
  ["Can you supervise my child for this 1–3-hour visit, with the required notice and toilet-training requirements?",
    "Can you look after my child for 1–3 hours? How early will I need to book? Will my child need to use the toilet without help?"],
]);

function wording(q, p, r, c) {
  if (!isShortCare(r)) return {
    capacity: "Are you accepting new children? How can my child join?",
    age: r.age === "" ? "What ages can you take?" : `My child is ${childAge(r.age).toLowerCase()}. Which care would suit them?`,
    transport: "Do you offer regular pickup?",
    coverage: `Can you arrange regular pickup from ${r.pickup.label}?`,
    fees: "What are the fees? Please include registration, meals and any pickup charges.",
  }[q.id] ?? q.text;
  switch (q.id) {
    case "admission": return p.admission?.requirements?.length
      ? admissionQuestions.get(p.admission.question) ?? p.admission.question
      : "Do you offer childcare for a few hours?";
    case "capacity": return `Can my child come on ${visitDate(r.date)} until ${r.end}?`;
    case "age":
      if (p.age?.alternative) return "I found different age ranges listed. Which one applies to a short visit?";
      if (r.age === "") return "What ages do you accept for a short visit?";
      return `My child is ${childAge(r.age).toLowerCase()}${r.age === "0" ? " old" : ""}. ${c?.state === "conflict" ? "Do you offer other care for this age?" : "Can they come for a short visit?"}`;
    case "transport": return "Can you arrange pickup for this visit?";
    case "coverage": return `Can you pick up from ${r.pickup.label}? Is there a seat available?`;
    case "pickup": return `Can you pick up my child by ${r.deadline}?`;
    case "care": return `Can my child stay until ${r.end} on ${visitDate(r.date)}? What happens if I’m late?`;
    case "transfer": return r.transport === "self"
      ? "What time should I arrive? How long does it take to drop off my child?"
      : "How long will the drive and drop-off take? When will my child arrive?";
    case "fees": return p.cost?.available
      ? `The estimated total is ${p.cost.currency || "MYR"} ${Number(p.cost.total).toLocaleString("en-MY")}. Is that right for this visit, and could there be any extra charges?`
      : `What would this short visit cost in total? Please include any minimum charge, meals, registration${r.transport === "self" ? "" : ", transport"} and late pickup fees.`;
    default: return q.text;
  }
}
function whyAsk(q, p, r, c) {
  if (!isShortCare(r) && q.id === "capacity") return "Ask if your child can join and when they can start.";
  if (!isShortCare(r) && q.id === "fees") return "Check which programme the price covers and any extra charges.";
  if (q.id === "capacity") return "Ask the centre if they can take your child on your date.";
  if (q.id === "admission" && p.admission?.requirements?.length) return p.admission.requirements.join(" ");
  if (q.id === "fees") return p.cost?.available
    ? "The estimate still needs to be agreed with the centre."
    : "Programme fees and budget estimates don’t give the total for a short visit.";
  if (c?.state === "conflict") return {
    age: "Your child’s age is outside the listed range.",
    admission: "The listed service doesn’t offer care for a few hours.",
    transport: "The listed service doesn’t offer centre pickup.",
    coverage: "Your pickup address is outside the listed area.",
    pickup: `The listed pickup times are after ${r.deadline}.`,
    care: `The listed hours or pickup rules don’t cover ${r.end} on this date.`,
  }[q.id] ?? "The listed details don’t match this part of your request.";
  if (q.id === "age") return p.age?.alternative ? "The sources list different age ranges." : r.age === "" ? "You haven’t selected an age yet." : "We couldn’t confirm that the listed ages cover your child.";
  if (q.id === "transport" && !r.transport) return "You haven’t chosen who will arrange pickup yet.";
  return {
    admission: "Care for a few hours hasn’t been confirmed for this centre.",
    transport: isShortCare(r) ? "Pickup for this visit needs checking." : "Regular pickup needs checking.",
    coverage: "Ask if the centre can pick up from your address.",
    pickup: `Pickup by ${r.deadline} hasn’t been confirmed.`,
    care: `Care until ${r.end} needs checking for this date.`,
    transfer: "Driving time does not include drop-off time or current traffic.",
  }[q.id] ?? "This detail needs checking with the centre.";
}
export function enquiryView(p, request) {
  return (p.enquiries ?? []).map(q => {
    const check = p.fit?.conditions?.find(c => c.id === q.id);
    const routine = q.id === "capacity" || q.id === "fees";
    const state = routine ? "routine" : check?.state ?? q.reason;
    return { ...q, text: wording(q, p, request, check), topic: topics[q.id] ?? check?.label ?? "Your visit",
      state, check, routine, why: whyAsk(q, p, request, check),
      status: routine ? isShortCare(request) ? "Ask for every visit" : "Ask before joining" : state === "conflict" ? "Doesn’t match" : "Ask the centre",
      fee: q.id === "fees" ? feeSummary(p) : null,
    };
  }).sort((a, b) => Number(b.state === "conflict") - Number(a.state === "conflict"));
}
export function enquiryMessage(p, request, selected) {
  if (!isShortCare(request)) return `Hello ${p.name}, I’m looking for long-term childcare.\n\nLocation: ${request.pickup.label}\n${childAge(request.age)} · ${pickupPreference(request.transport)}\n\n${selected.map((q, i) => `${i + 1}. ${q.text}`).join("\n\n")}\n\nThank you!`;
  return `Hello ${p.name}, I need childcare for a few hours.\n\nDate: ${visitDate(request.date)}\nPickup address: ${request.pickup.label}\nLeave pickup address by: ${request.deadline}\nPick up from childcare at: ${request.end}\n${childAge(request.age)} · ${pickupPreference(request.transport)}\n\n${selected.map((q, i) => `${i + 1}. ${q.text}`).join("\n\n")}\n\nThank you!`;
}
