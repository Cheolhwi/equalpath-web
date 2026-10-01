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
  const packing = [
    prompt("bag", "Pack a bag with your child’s name."),
    prompt("clothes", "Pack spare clothes."),
    prompt("water", "Pack a water bottle."),
    prompt(
      "instructions",
      "Keep the plan and phone numbers with you.",
    ),
  ];
  if (span >= 120)
    packing.push(
      prompt(
        "meal",
        "Check whether to pack a meal or snack.",
      ),
    );
  if (span >= 240)
    packing.push(
      prompt("rest", "Ask whether to bring a comfort item for rest time."),
    );
  if (request.age !== "" && request.age != null && ageBounds(request.age)[0] < 36)
    packing.push(
      prompt(
        "young",
        "Pack diapers, milk or food, and extra clothes.",
      ),
    );
  if (minutes(request.end) >= 1140)
    packing.push(
      prompt("evening", "Agree on dinner and the evening pickup."),
    );
  if (request.transport === "institution")
    packing.push(
      prompt(
        "transport-items",
        "Check the car seat, and what your child can bring in the car.",
      ),
    );
  else if (request.transport === "self")
    packing.push(
      prompt(
        "self-items",
        "Make sure whoever takes your child has the centre’s address.",
      ),
    );
  const published = (p.preparationRequirements ?? [])
    .filter((x) => x.text && x.source)
    .map((x, i) => ({
      id: `published-${i}`,
      text: x.text,
      source: x.source,
      basis: "Provider-sourced requirement",
    }));
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
main{max-width:900px;margin:auto;padding:32px}h1{font-size:30px;line-height:1.2;margin:12px 0}h2{font-size:19px;margin:26px 0 12px;border-top:1px solid #cbd0c2;padding-top:18px}h3{font-size:15px;margin:12px 0 6px}p{margin:7px 0}small{display:block;color:#56614f;font-size:10px;overflow-wrap:anywhere}.brand{font-size:11px;letter-spacing:2px}.visit{display:flex;justify-content:space-between;gap:24px;margin:18px 0}.visit strong{font-size:17px}.notice{font-size:12px;color:#56614f}.plan{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid #cbd0c2;background:#e9ebe1;padding:18px;gap:18px}.step{min-width:0}.step h3{margin-top:0}.time{display:block;font-size:22px;margin:10px 0}.place{font-weight:bold}.step p{font-size:12px}.step .detail{color:#56614f}.party{break-inside:avoid;margin:14px 0}.party>p{color:#56614f;font-size:12px}ul{padding-left:20px}li{break-inside:avoid;margin:8px 0}.checklist{list-style:none;padding:0}.sources{border-top:1px solid #cbd0c2;margin-top:22px;padding-top:12px}.sources small{margin:5px 0}.line{height:30px;border-bottom:1px solid #adb4a6}.blank{break-inside:avoid}a{color:inherit;overflow-wrap:anywhere}
@media(max-width:600px){main{padding:20px}.visit{display:block}.plan{grid-template-columns:1fr}.step+.step{border-top:1px solid #cbd0c2;padding-top:14px}}
@page{size:A4;margin:15mm}@media print{body{background:white;font-size:10pt;line-height:1.45}main{padding:0;max-width:none}h1{font-size:23pt}h2{font-size:14pt}h2,h3{break-after:avoid}.plan{break-inside:avoid;grid-template-columns:repeat(3,minmax(0,1fr))}.step p{font-size:9pt}.visit{display:flex}.step+.step{border-top:0;padding-top:0}a{color:inherit;text-decoration:none}small{font-size:8pt}.notice{font-size:9pt}}`;
export function preparationHTML(sheet, checked = []) {
  const selected = new Set(checked);
  const items = (list, tickable = true) =>
    `<ul${tickable ? ' class="checklist"' : ""}>${list.map((x) => `<li>${tickable ? selected.has(x.id) ? "☑ " : "☐ " : ""}${escape(x.text)}${sourceHTML(x.source)}</li>`).join("")}</ul>`;
  const groups = ["receiving", "usual", "transport"].map((id) => sheet.groups.find((g) => g.id === id));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EqualPath checklist — ${escape(sheet.name)}</title><style>${preparationCSS}</style></head><body><main>
  <p class="brand">EQUALPATH / YOUR VISIT${sheet.mode === "demo" ? " / FICTIONAL DEMO" : ""}</p><h1>Get ready for childcare</h1>
  <div class="visit"><div><small>CARE AT</small><strong>${escape(sheet.name)}</strong></div><div><strong>${escape(sheet.dateLabel)}</strong>${sheet.date ? `<small>${escape(sheet.date)} · Malaysia time</small>` : ""}</div></div>
  <p class="notice">${escape(sheet.notice)}</p>
  ${sheet.conflicts.length ? `<h2>Check before you go</h2>${items(sheet.conflicts.map((c) => ({ id: c.id, text: c.label + ": " + plainReason(c.reason), source: c.source })), false)}` : ""}
  <h2>Your plan for the day</h2><div class="plan">${sheet.sequence.map((x, i) => `<section class="step"><h3>${i + 1}. ${escape(x.title)}</h3><strong class="time">${x.time ? `${escape(x.timeLabel)} ${escape(x.time)}` : "Agree a time"}</strong><p class="place">${escape(x.place)}</p>${x.address ? `<p>${escape(x.address)}</p>` : ""}<p class="detail">${escape(x.detail)}</p></section>`).join("")}</div><p class="notice">${escape(sheet.transport)}</p>
  <h2>Contact the centre</h2>${sheet.phone ? `<p>Telephone: ${escape(sheet.phone.display)}</p>` : ""}${sheet.whatsapp.map((x) => `<p>WhatsApp: ${escape(x.display)}${x.scope === "website" ? " (main enquiry number; ask for this branch)" : ""}</p>`).join("")}${!sheet.phone && !sheet.whatsapp.length ? "<p>No phone number listed. Check the centre’s website.</p>" : ""}<p class="notice">Keep the driver’s phone number with you too.</p>
  <h2>01 / Check the plan</h2>${groups.map((g) => `<section class="party"><h3>${escape(g.name)}</h3><p>${escape(g.party)}</p>${items(g.questions, false)}</section>`).join("")}
  <h2>02 / Before you leave</h2>${items(sheet.packing)}${sheet.published.length ? `<h3>The centre also asks for</h3>${items(sheet.published)}` : '<p class="notice">Ask the centre if they need anything else.</p>'}
  <h2>Private details — fill in on paper</h2><p class="notice">Share these privately with the centre.</p>${["Who may collect your child (name and ID)", "Emergency contact", "Health, allergy or medication notes"].map((x) => `<section class="blank"><p>${escape(x)}</p><div class="line"></div></section>`).join("")}
  <section class="sources"><h3>About this checklist</h3><p class="notice">${sheet.date ? "Times come from your search. Agree the arrival time with the centre." : "Agree your usual hours and pickup arrangements with the centre."}</p>${sheet.sequence.filter(x => x.source).map(x => sourceHTML(x.source)).join("")}${sheet.phone ? sourceHTML(sheet.phone.source) : ""}${sheet.whatsapp.map(x => sourceHTML(x.source)).join("")}<small>Prepared ${escape(dateLabel(sheet.preparedAt))}</small><p class="notice">${escape(sheet.notice)}</p></section></main></body></html>`;
}
