import { minutes, requestCaption, todayKL, isShortCare, ageBounds } from "./request.mjs";
import { dateLabel } from "./display.mjs";
import { plainReason, plainSource } from "./plain-copy.mjs";
export const DRAFT_NOTICE =
  "This is a draft plan. It doesn’t give anyone permission to collect your child. Agree the care and who collects your child with the centre.";
const prompt = (id, text) => ({
  id,
  text,
  basis: "General preparation prompt",
});
// What the checklist is based on (11 Oct 2026): the child's age, the hours of
// care and what this centre lists — not one list for everybody.
const ageYears = (request) => request.age === "" || request.age == null ? null : ageBounds(request.age)[0] / 12;
const stageOf = (years) => years == null ? null : years < 1 ? "baby" : years < 3 ? "toddler" : "preschool";
const ageWhy = (years) => years == null ? null : years < 1 ? "Under 1" : `Age ${years}`;
const overlap = (s, e, from, to) => Math.max(0, Math.min(e, to) - Math.max(s, from));
const hoursText = (m) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ` ${r} min` : ""}` : `${r} min`; };
export function basisLine(request) {
  const years = ageYears(request), age = years == null ? null : years < 1 ? "a baby under 1" : `a ${years}-year-old`;
  const span = isShortCare(request) ? minutes(request.end) - minutes(request.deadline) : null;
  return [age && `For ${age}`, span > 0 && `${hoursText(span)} of care`].filter(Boolean).join(" · ");
}
// The centre's listed extras ("meals RM8/day for drop-in; diapers & wipes
// provided by parent or RM5/day", "grip socks RM8"…) from its fee details.
export function centreExtras(p) {
  const fee = (p.fees ?? []).find((f) => /Extra charges:|Registration fee:/.test(f.conditions ?? ""));
  if (!fee) return { source: null, parts: [] };
  const c = fee.conditions;
  const extra = /Extra charges: (.*?)\.(?:\s|$)/.exec(c)?.[1] ?? "";
  const parts = extra.split(";").map((x) => x.trim()).filter(Boolean).map((text) => {
    let m;
    if ((m = /^meals RM(\d+(?:\.\d+)?)\/day/i.exec(text))) return { kind: "meals", amount: +m[1], text };
    if ((m = /^diapers? (?:&|and) wipes provided by parent or RM(\d+(?:\.\d+)?)\/day/i.exec(text))) return { kind: "diapers", amount: +m[1], text };
    if ((m = /^grip socks RM(\d+(?:\.\d+)?)/i.exec(text))) return { kind: "socks", amount: +m[1], text };
    if ((m = /^materials fee RM(\d+(?:\.\d+)?)\/session/i.exec(text))) return { kind: "materials", amount: +m[1], text };
    if ((m = /^accompanying adult RM(\d+(?:\.\d+)?)/i.exec(text))) return { kind: "adult", amount: +m[1], text };
    return { kind: "other", text };
  });
  const reg = /Registration fee: MYR (\d+(?:\.\d+)?)/.exec(c);
  if (reg && +reg[1] > 0) parts.push({ kind: "registration", amount: +reg[1], text: `Registration fee RM${reg[1]}` });
  return { source: fee.source ?? null, parts };
}
const rm = (n) => n == null ? "" : `RM${Number.isInteger(n) ? n : n.toFixed(2)}`;
function packingFor(p, request) {
  const shortCare = isShortCare(request);
  const start = shortCare ? minutes(request.deadline) : 480, end = shortCare ? minutes(request.end) : 1080;
  const span = end - start, years = ageYears(request), stage = stageOf(years), age = ageWhy(years);
  const { source, parts } = centreExtras(p), find = (k) => parts.find((x) => x.kind === k);
  const centre = (part, text) => part && { text, source };
  const item = (id, label, text, why = [], extra = {}) => ({ id, label, text, why: why.filter(Boolean), basis: "General preparation prompt", ...extra });
  const lunch = overlap(start, end, 690, 810) >= 45, napTime = overlap(start, end, 750, 900) >= 60;
  const late = end >= 1140;
  const packing = [
    item("bag", "Bag with name", stage === "baby" ? "Pack a nappy bag labelled with your child’s name." : "Pack a bag labelled with your child’s name."),
    item("clothes", stage === "preschool" ? "Spare clothes" : "Two sets of clothes",
      stage === "preschool" ? "Pack a spare set of clothes." : "Pack two spare sets of clothes — little ones get messy.", [stage !== "preschool" && age]),
  ];
  if (stage === "baby" || stage === "toddler") {
    const count = Math.max(2, Math.ceil(span / (stage === "baby" ? 150 : 180)) + 1), d = find("diapers");
    packing.push(item("young", "Diapers & wipes", `Pack about ${count} diapers, wipes and nappy cream.`, [age, d && "Centre listing"],
      { centre: centre(d, `Or the centre’s, ${rm(d?.amount)}/day`) }));
  }
  if (stage === "baby")
    packing.push(item("milk", "Milk & bottles", "Pack milk or formula, labelled bottles and any baby food, with feeding times written down.", [age]));
  else packing.push(item("water", stage === "toddler" ? "Water cup" : "Water bottle", stage === "toddler" ? "Pack a labelled water bottle or sippy cup." : "Pack a labelled water bottle.", [stage === "toddler" && age]));
  const meals = lunch ? find("meals") : null;
  if (stage !== "baby" && (lunch || span >= 120))
    packing.push(item("meal", lunch ? "Lunch & snack" : "Snack",
      lunch ? meals ? "Pack lunch and a snack — or pay for the centre’s meal." : "Pack lunch and a snack in a labelled box." : "Pack a snack in a labelled box.",
      [lunch ? "Over lunchtime" : `${hoursText(span)} of care`, meals && "Centre listing"],
      { centre: centre(meals, `Centre meal: ${rm(meals?.amount)}/day`) }));
  if (years != null && years < 6 && (napTime || (stage === "baby" && span >= 120)))
    packing.push(item("rest", "Nap things", stage === "baby" ? "Pack a sleeping bag or swaddle and a comfort item for naps." : "Pack a comfort item (a small blanket or toy) for nap time.", [stage === "baby" ? age : "Over nap time"]));
  else if (late && years != null && years < 4)
    packing.push(item("rest", "Sleep things", "Pack pyjamas or a comfort item in case your child falls asleep.", ["Evening pickup"]));
  if (late) packing.push(item("evening", "Dinner", "Agree on dinner and the evening pickup with the centre.", ["Pickup after 7 pm"]));
  packing.push(
    item("papers", "Child’s papers", "Bring your child’s MyKid or birth certificate and vaccination book — centres usually ask on a first visit.", ["First visit"]),
    item("notes", "Notes for staff", "Write down allergies, medicines and your child’s routine to share privately with the staff.", []),
    item("instructions", "Phone numbers", "Keep the plan and phone numbers with you.", []),
  );
  if (request.transport === "institution")
    packing.push(item("transport-items", "Car seat", "Check the car seat, and what your child can bring in the car.", ["Centre transport"]));
  else if (request.transport === "self")
    packing.push(item("self-items", "Centre address", "Make sure whoever takes your child has the centre’s address.", ["You take your child"]));
  // Things only this centre lists.
  const extras = [];
  const add = (id, label, text) => extras.push({ id, label, text, why: ["Centre listing"], source, basis: "Provider-sourced requirement" });
  for (const [i, x] of parts.entries()) {
    if (x.kind === "socks") add("socks", "Grip socks", `Bring grip socks — or buy a pair there for ${rm(x.amount)}.`);
    else if (x.kind === "materials") add("materials", "Materials fee", `Have ${rm(x.amount)} ready for the materials fee.`);
    else if (x.kind === "adult") add("adult", "Stay with your child", `An adult can stay with your child${x.amount ? ` (${rm(x.amount)})` : " at no charge"}. Ask whether you should.`);
    else if (x.kind === "registration") add("registration", "Registration fee", `Ask whether the ${rm(x.amount)} registration fee applies to a one-off visit.`);
    else if (x.kind === "other") add(`extra-${i}`, "Also listed", `The centre lists: ${x.text}.`);
  }
  return { packing, extras };
}
export function preparationFor(
  p,
  request,
  preparedAt = new Date().toISOString(),
) {
  const shortCare = isShortCare(request);
  const span = shortCare ? minutes(request.end) - minutes(request.deadline) : 0;
  const transport =
    request.transport === "institution"
      ? "The centre picks up your child"
      : request.transport === "self"
        ? "I’ll bring my child"
        : "Choose who takes your child to the centre";
  const groups = [
    {
      id: "usual",
      name: "At the starting point",
      party: request.pickup.label,
      contact: "Talk to whoever looks after your child there, for example the school.",
      questions: [
        prompt(
          "release",
          shortCare ? `Can my child be ready to leave by ${request.deadline}?` : "How does pickup work each day?",
        ),
        prompt(
          "identity",
          "What does the person collecting my child need to show?",
        ),
        prompt("delay", "Who should we call if the driver is late?"),
      ],
    },
    {
      id: "receiving",
      name: "With the childcare centre",
      party: p.name,
      contact: "Agree where to meet and who will be there.",
      questions: [
        prompt(
          "receive",
          "Who will meet my child, and where?",
        ),
        prompt(
          "arrival",
          "What time should we arrive?",
        ),
        prompt(
          "final",
          shortCare ? `Can I pick up my child at ${request.end}? What happens if I’m late?` : "What time is pickup each day? What happens if I’m late?",
        ),
        prompt(
          "private",
          "How can I share emergency contacts, allergies and other care needs privately?",
        ),
      ],
    },
    {
      id: "transport",
      name: "With the person driving",
      party: "Check who will pick up your child and drive them",
      contact: transport,
      questions: [
        prompt(
          "collector",
          request.transport === "institution"
            ? "Who will pick up my child, and in which car?"
            : request.transport === "self"
              ? "Who will take my child to the centre?"
              : "Who can take my child to the centre and back?",
        ),
        prompt(
          "handover",
          "Who will you meet, and can you let me know when my child arrives?",
        ),
        prompt(
          "transport-delay",
          "Who will you call if you’re running late?",
        ),
      ],
    },
  ];
  const { packing, extras } = packingFor(p, request);
  const published = (p.preparationRequirements ?? [])
    .filter((x) => x.text && x.source)
    .map((x, i) => ({
      id: `published-${i}`,
      text: x.text,
      source: x.source,
      basis: "Provider-sourced requirement",
    }))
    .concat(extras);
  const sequence = [
    {
      title: "Leave the starting point",
      time: shortCare ? request.deadline : null,
      timeLabel: "By",
      place: request.pickup.label,
      text: shortCare ? `${request.pickup.label} · leave by ${request.deadline}` : `Arrange pickup from ${request.pickup.label}`,
      basis: "Your request",
      detail: request.transport === "institution"
        ? "The centre picks up your child here. Agree the time and what to bring."
        : request.transport === "self"
          ? "You take your child to the centre."
          : "Decide who takes your child to the centre.",
    },
    {
      title: "At the centre",
      time: null,
      timeLabel: "Arrival time",
      place: p.name,
      address: p.address,
      text: `To ${p.name}${p.address ? " · " + p.address : ""}`,
      basis: p.address
        ? "Centre address"
        : "Address to confirm",
      source: p.addressSource,
      detail: "Agree the arrival time with the centre. Leave time for the drive.",
    },
    {
      title: "Collect your child",
      time: shortCare ? request.end : null,
      timeLabel: "At",
      place: p.name,
      text: shortCare ? `Collect your child from ${p.name} at ${request.end}` : `Agree when to collect your child from ${p.name}`,
      basis: "Your request",
      detail: "Agree where you collect your child, and what happens if you’re late.",
      source: p.careEndTimeSource ?? p.businessHours?.source,
    },
  ];
  return {
    name: p.name,
    providerId: p.id,
    mode: p.mode,
    preparedAt,
    preparationDate: todayKL(),
    date: shortCare ? request.date : null,
    dateLabel: shortCare ? new Intl.DateTimeFormat("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      timeZone: "Asia/Kuala_Lumpur",
    }).format(new Date(`${request.date}T12:00:00+08:00`)) : "Regular care",
    request: requestCaption(request),
    interval: shortCare ? `Leave by ${request.deadline} · Collect your child at ${request.end}` : "Your regular care plan",
    transport,
    groups,
    packing,
    basisLine: basisLine(request),
    published,
    sequence,
    phone: p.phone,
    whatsapp: p.whatsapp ?? [],
    conflicts: (p.fit?.conditions ?? []).filter((c) => c.state === "conflict"),
    notice: DRAFT_NOTICE,
  };
}
const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safeURL = (url) => {
  try {
    const u = new URL(url);
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};
const sourceHTML = (s) =>
  !s
    ? ""
    : `<small>${safeURL(s.url) ? `<a href="${escape(safeURL(s.url))}" rel="noreferrer">${escape(plainSource(s.label) || "Source")}</a>` : escape(plainSource(s.label))}${s.retrievedAt ? ` · checked ${escape(dateLabel(s.retrievedAt.slice(0, 10)))}` : ""}${s.sourceDate ? ` · published ${escape(dateLabel(s.sourceDate))}` : ""}</small>`;
export const preparationCSS = `
body{font:14px/1.55 Arial,sans-serif;color:#30382f;background:#f5f4ee;margin:0}
main{max-width:900px;margin:auto;padding:32px}h1{font-size:30px;line-height:1.2;margin:12px 0}h2{font-size:19px;margin:26px 0 12px;border-top:1px solid #cbd0c2;padding-top:18px}h3{font-size:15px;margin:12px 0 6px}p{margin:7px 0}small{display:block;color:#56614f;font-size:10px;overflow-wrap:anywhere}.brand{font-size:11px;letter-spacing:2px}.visit{display:flex;justify-content:space-between;gap:24px;margin:18px 0}.visit strong{font-size:17px}.notice{font-size:12px;color:#56614f}.plan{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid #cbd0c2;background:#e9ebe1;padding:18px;gap:18px}.step{min-width:0}.step h3{margin-top:0}.time{display:block;font-size:22px;margin:10px 0}.place{font-weight:bold}.step p{font-size:12px}.step .detail{color:#56614f}.party{break-inside:avoid;margin:14px 0}.party>p{color:#56614f;font-size:12px}ul{padding-left:20px}li{break-inside:avoid;margin:8px 0}.checklist{list-style:none;padding:0}.sources{border-top:1px solid #cbd0c2;margin-top:22px;padding-top:12px}.sources small{margin:5px 0}.line{height:30px;border-bottom:1px solid #adb4a6}.blank{break-inside:avoid}a{color:inherit;overflow-wrap:anywhere}.photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.photos figure{margin:0;break-inside:avoid}.photos img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;display:block}.photos figcaption{font-size:10px;color:#56614f;margin-top:4px}
@media(max-width:600px){main{padding:20px}.visit{display:block}.plan{grid-template-columns:1fr}.step+.step{border-top:1px solid #cbd0c2;padding-top:14px}}
@page{size:A4;margin:15mm}@media print{body{background:white;font-size:10pt;line-height:1.45}main{padding:0;max-width:none}h1{font-size:23pt}h2{font-size:14pt}h2,h3{break-after:avoid}.plan{break-inside:avoid;grid-template-columns:repeat(3,minmax(0,1fr))}.step p{font-size:9pt}.visit{display:flex}.step+.step{border-top:0;padding-top:0}a{color:inherit;text-decoration:none}small{font-size:8pt}.notice{font-size:9pt}}`;
export function preparationHTML(sheet, checked = [], { photos = [] } = {}) {
  const selected = new Set(checked);
  const items = (list, tickable = true) =>
    `<ul${tickable ? ' class="checklist"' : ""}>${list.map((x) => `<li>${tickable ? selected.has(x.id) ? "☑ " : "☐ " : ""}${escape(x.text)}${x.centre ? ` ${escape(x.centre.text)}` : ""}${x.why?.length ? `<small>Why: ${escape(x.why.join(" · "))}</small>` : ""}${sourceHTML(x.source ?? x.centre?.source)}</li>`).join("")}</ul>`;
  const safePhotos = photos.map((x) => ({ ...x, url: safeURL(x.url) })).filter((x) => x.url && x.url.startsWith("https:")).slice(0, 3);
  const groups = ["receiving", "usual", "transport"].map((id) => sheet.groups.find((g) => g.id === id));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EqualPath checklist — ${escape(sheet.name)}</title><style>${preparationCSS}</style></head><body><main>
  <p class="brand">EQUALPATH / YOUR VISIT${sheet.mode === "demo" ? " / FICTIONAL DEMO" : ""}</p><h1>Get ready for childcare</h1>
  <div class="visit"><div><small>CARE AT</small><strong>${escape(sheet.name)}</strong></div><div><strong>${escape(sheet.dateLabel)}</strong>${sheet.date ? `<small>${escape(sheet.date)} · Malaysia time</small>` : ""}</div></div>
  <p class="notice">${escape(sheet.notice)}</p>
  ${sheet.conflicts.length ? `<h2>Check before you go</h2>${items(sheet.conflicts.map((c) => ({ id: c.id, text: c.label + ": " + plainReason(c.reason), source: c.source })), false)}` : ""}
  <h2>Your plan for the day</h2><div class="plan">${sheet.sequence.map((x, i) => `<section class="step"><h3>${i + 1}. ${escape(x.title)}</h3><strong class="time">${x.time ? `${escape(x.timeLabel)} ${escape(x.time)}` : "Agree a time"}</strong><p class="place">${escape(x.place)}</p>${x.address ? `<p>${escape(x.address)}</p>` : ""}<p class="detail">${escape(x.detail)}</p></section>`).join("")}</div><p class="notice">${escape(sheet.transport)}</p>
  ${safePhotos.length ? `<h2>Finding the centre</h2><div class="photos">${safePhotos.map((x) => `<figure><img src="${escape(x.url)}" alt="${escape(x.direction || "Street view")} near ${escape(sheet.name)}"><figcaption>${escape(x.direction || "Street view")}</figcaption></figure>`).join("")}</div><p class="notice">Google Street View, taken on the street near the centre. It isn’t a confirmed view of the entrance.</p>` : ""}
  <h2>Contact the centre</h2>${sheet.phone ? `<p>Telephone: ${escape(sheet.phone.display)}</p>` : ""}${sheet.whatsapp.map((x) => `<p>WhatsApp: ${escape(x.display)}${x.scope === "website" ? " (main enquiry number; ask for this branch)" : ""}</p>`).join("")}${!sheet.phone && !sheet.whatsapp.length ? "<p>No phone number listed. Check the centre’s website.</p>" : ""}<p class="notice">Keep the driver’s phone number with you too.</p>
  <h2>01 / Check the plan</h2>${groups.map((g) => `<section class="party"><h3>${escape(g.name)}</h3><p>${escape(g.party)}</p>${items(g.questions, false)}</section>`).join("")}
  <h2>02 / Before you leave</h2>${sheet.basisLine ? `<p class="notice">${escape(sheet.basisLine)}</p>` : ""}${items(sheet.packing)}${sheet.published.length ? `<h3>The centre also asks for</h3>${items(sheet.published)}` : '<p class="notice">Ask the centre if they need anything else.</p>'}
  <h2>Private details — fill in on paper</h2><p class="notice">Share these privately with the centre.</p>${["Who may collect your child (name and ID)", "Emergency contact", "Health, allergy or medication notes"].map((x) => `<section class="blank"><p>${escape(x)}</p><div class="line"></div></section>`).join("")}
  <section class="sources"><h3>About this checklist</h3><p class="notice">${sheet.date ? "Times come from your search. Agree the arrival time with the centre." : "Agree your usual hours and pickup arrangements with the centre."}</p>${sheet.sequence.filter(x => x.source).map(x => sourceHTML(x.source)).join("")}${sheet.phone ? sourceHTML(sheet.phone.source) : ""}${sheet.whatsapp.map(x => sourceHTML(x.source)).join("")}<small>Prepared ${escape(dateLabel(sheet.preparedAt))}</small><p class="notice">${escape(sheet.notice)}</p></section></main></body></html>`;
}
