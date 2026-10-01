// Presentation only, like the plain questions in enquiry-view.mjs. The API,
// conditions and published evidence keep their original wording (some of it
// is baked into the prepared search index); this turns the most common
// machine-like phrases into short, plain English for parents who read English
// as a second language. Text that matches no rule is shown unchanged.

const SERVICE_WORDS = {
  hourly: "hourly care",
  occasional: "occasional visits",
  drop_in: "drop-in care",
  flexi: "flexible hours",
  daily: "daily care",
  holiday: "holiday care",
};
const joinWords = items => items.length < 2 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const services = list => joinWords(list.split(/,\s*/).filter(Boolean).map(t => SERVICE_WORDS[t] ?? t.replace(/_/g, " ")));
const hours = n => `${n} ${n === "1" ? "hour" : "hours"}`;

// Evidence wording written by the data pipeline. Rules are not anchored at the
// end because condition reasons often add a sentence after the evidence.
const EVIDENCE = [
  [/The current provider data lists ([^.]+)\. Confirm a place, notice and the actual fee before travelling\./,
    (_, list) => `The centre offers ${services(list)}. Before you go, check there is a place, how early to book, and the price.`],
  [/ for short-time care \(current provider data; confirm the child['’]s exact age\)\.?/, ""],
  [/The current provider data does not list centre transport\./, "The centre’s information doesn’t mention transport."],
  [/Current fee data lists this hourly rate\. Minimum booking: (\d+|not listed) hours?; confirm extras and actual charges\./,
    (_, n) => n === "not listed" ? "Hourly rate. Ask about the minimum booking and extra charges." : `Hourly rate. Minimum booking: ${hours(n)}. Ask about extra charges.`],
  [/Current fee data lists this daily rate; confirm what is included\./, "Daily rate. Ask what it includes."],
  [/Stable imported branch record; separate directory facts retain their own sources\./, ""],
  [/CariSchool lists this KPM code for the named branch\. The current official registration status has not been independently checked\./,
    "CariSchool lists this KPM code for this branch. We haven’t checked it with the government."],
  [/Service and contact details come from public provider pages\. No government registration record has been matched\./,
    "Service and contact details come from the centre’s own pages. We haven’t found it in a government register."],
  [/Branch and age details are published by the operator\. A current government registration record was not independently matched for this addition\./,
    "The centre published its branch and age details. We haven’t found it in a government register."],
  [/Prices are daily short-term programme fees, not an hourly quote or a guaranteed total\./,
    "These are daily prices, not hourly prices or a final total."],
  [/The listed number is the provider['’]s shared enquiry contact\./, "This is the main enquiry number, not this branch’s own line."],
];

// Reasons from shared/conditions.mjs (computed by the API).
const REASONS = [
  [/^Published care hours: (.+?)\. Your pickup from childcare: (\d{2}:\d{2})\./, (_, open, end) => `Open ${open}. You collect your child at ${end}.`],
  [/^You haven’t chosen who will handle pickup\.$/, "You haven’t said who takes your child to the centre."],
  [/^You’ll handle pickup\. The centre does not need to pick up your child\.$/, "You’ll bring your child, so the centre doesn’t need to pick them up."],
  [/^You’ll handle pickup, so the centre’s pickup area does not matter\.$/, "You’ll bring your child, so the pickup area doesn’t matter."],
  [/^You’ll handle pickup by (\d{2}:\d{2})\.$/, "You’ll leave with your child by $1."],
  [/^You’ll handle pickup\.$/, "You’ll bring your child yourself."],
  [/^Published pickup: /, "Listed pickup times: "],
  [/^No care hours are published for this date\.$/, "No care hours are listed for this date."],
  [/^Date-specific hours unresolved\. /, "Hours for this date aren’t confirmed. "],
  [/ Confirm temporary care for this date\.$/, " Ask if they can take your child on this date."],
  [/ Another listing (says closed|lists [^;]+); the sources disagree for your requested time\./,
    (_, said) => ` Another listing ${said}. The two sources don’t agree, so check with the centre.`],
  [/^No care end time is listed for this weekend date, so this centre does not match your search\.$/,
    "No hours are listed for this weekend day, so this centre doesn’t match your search."],
  [/ · Official type age range\. /, " · Official age range for this type of centre. "],
  [/Select an age to check whether it falls within this range\./, "Choose your child’s age to check it."],
  [/Select the child’s age to check this range\./, "Choose your child’s age to check it."],
  [/Ask the centre about the exact ages it can take\./, "Ask the centre which ages it can take."],
  [/^Age has not been selected\.$/, "You haven’t chosen an age."],
  [/ The latest pickup time is (\d{2}:\d{2})\./, " You need to collect your child by $1."],
  [/^Ask when your child will arrive\. Driving times do not include drop-off time or current traffic\.$/,
    "Ask what time your child should arrive. Driving times don’t include traffic or the time to drop off."],
  [/^Reference estimate for the stated duration\. Confirm actual arrival, charges and acceptance with the provider\.$/,
    "Estimate for your hours. Ask the centre to confirm the price and that they can take your child."],
  [/^A complete one-off fee total is unavailable\.$/, "We can’t work out a total price for this visit."],
];

const tidy = text => text
  .replace(/\.\s*\./g, ".")
  .replace(/\s{2,}/g, " ")
  .trim();

const apply = (text, rules) => rules.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);

export function plainEvidence(text) {
  if (typeof text !== "string" || !text) return text;
  return tidy(apply(text, EVIDENCE));
}

export function plainReason(text) {
  if (typeof text !== "string" || !text) return text;
  return tidy(apply(apply(text, EVIDENCE), REASONS));
}

// Source names are shown under every fact; keep them short and readable.
const SOURCE_NAMES = new Map([
  ["Current provider data · user-provided completion sheet", "EqualPath research sheet"],
  ["Current fee data · user-provided fee sheet", "EqualPath fee sheet"],
  ["JKM imported register", "JKM government register"],
  ["Published branch contact", "Centre’s published contact"],
  ["CariSchool branch directory", "CariSchool directory"],
]);
export const plainSource = label => SOURCE_NAMES.get(label) ?? label;
