import { minutes, requestCaption, todayKL, isShortCare } from "./request.mjs";
export const DRAFT_NOTICE =
  "This is your draft plan. Confirm care and pickup permission with the centre. This sheet does not authorise collection.";
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
      ? "Centre pickup requested"
      : request.transport === "self"
        ? "I’ll arrange transport"
        : "Choose who will handle pickup";
  const groups = [
    {
      id: "usual",
      name: "At the pickup place",
      party: request.pickup.label,
      contact: "Speak to the person handing over your child.",
      questions: [
        prompt(
          "release",
          shortCare ? `Can my child be ready for pickup by ${request.deadline}?` : "What is the usual pickup routine?",
        ),
        prompt(
          "identity",
          "What ID and permission does the collector need?",
        ),
        prompt("delay", "Who should we call if the collector is running late?"),
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
          shortCare ? `Can I collect my child by ${request.end}? What happens if I’m late?` : "What are the usual collection times and late pickup rules?",
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
      party: "Confirm who is collecting your child",
      contact: transport,
      questions: [
        prompt(
          "collector",
          request.transport === "institution"
            ? "Who will collect my child, and in which vehicle?"
            : request.transport === "self"
              ? "Who will pick up my child and take them to the centre?"
              : "Who can help with pickup and drop-off?",
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
    prompt("bag", "Pack a labelled bag, spare clothes and a water bottle."),
    prompt(
      "instructions",
      "Keep pickup instructions and contact numbers handy.",
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
  if (request.age !== "" && request.age != null && Number(request.age) < 3)
    packing.push(
      prompt(
        "young",
        "Check nappies, feeding supplies and extra changes of clothes.",
      ),
    );
  if (minutes(request.end) >= 1140)
    packing.push(
      prompt("evening", "Agree dinner and evening pickup arrangements."),
    );
  if (request.transport === "institution")
    packing.push(
      prompt(
        "transport-items",
        "Check the car seat and what your child can take in the vehicle.",
      ),
    );
  else if (request.transport === "self")
    packing.push(
      prompt(
        "self-items",
        "Make sure the collector has the address and pickup instructions.",
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
      title: "Pick up",
      time: shortCare ? request.deadline : null,
      timeLabel: "By",
      place: request.pickup.label,
      text: shortCare ? `${request.pickup.label} · collect by ${request.deadline}` : `Arrange pickup from ${request.pickup.label}`,
      basis: "Your request",
      detail:
        "Agree who will collect your child and what they need to bring.",
    },
    {
      title: "Drop off",
      time: null,
      timeLabel: "Arrival time",
      place: p.name,
      address: p.address,
      text: `To ${p.name}${p.address ? " · " + p.address : ""}`,
      basis: p.address
        ? "Centre address"
        : "Address to confirm",
      source: p.addressSource,
      detail: "Confirm the arrival time with the centre. Allow time for the drive after pickup.",
    },
    {
      title: "Collect your child",
      time: shortCare ? request.end : null,
      timeLabel: "By",
      place: p.name,
      text: shortCare ? `Collect from ${p.name} by ${request.end}` : `Agree collection from ${p.name}`,
      basis: "Your request",
      detail: "Agree where to collect your child and what to do if you’re late.",
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
    }).format(new Date(`${request.date}T12:00:00+08:00`)) : "Regular childcare",
    request: requestCaption(request),
    interval: shortCare ? `Pickup by ${request.deadline} · Collect by ${request.end}` : "Your regular care arrangements",
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
    : `<small>${safeURL(s.url) ? `<a href="${escape(safeURL(s.url))}" rel="noreferrer">${escape(s.label || "Source")}</a>` : escape(s.label)} · Retrieved ${escape(s.retrievedAt?.slice(0, 10) || "date unavailable")} · Source date ${escape(s.sourceDate || "unavailable")}</small>`;
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
  <p class="brand">EQUALPATH / YOUR VISIT${sheet.mode === "demo" ? " / FICTIONAL DEMO" : ""}</p><h1>Get ready for care</h1>
  <div class="visit"><div><small>CARE AT</small><strong>${escape(sheet.name)}</strong></div><div><strong>${escape(sheet.dateLabel)}</strong>${sheet.date ? `<small>${escape(sheet.date)} · Malaysia time</small>` : ""}</div></div>
  <p class="notice">${escape(sheet.notice)}</p>
  ${sheet.conflicts.length ? `<h2>Resolve before you go</h2>${items(sheet.conflicts.map((c) => ({ id: c.id, text: c.label + ": " + c.reason, source: c.source })), false)}` : ""}
  <h2>Your pickup plan</h2><div class="plan">${sheet.sequence.map((x, i) => `<section class="step"><h3>${i + 1}. ${escape(x.title)}</h3><strong class="time">${x.time ? `By ${escape(x.time)}` : "Agree a time"}</strong><p class="place">${escape(x.place)}</p>${x.address ? `<p>${escape(x.address)}</p>` : ""}<p class="detail">${escape(x.detail)}</p></section>`).join("")}</div><p class="notice">${escape(sheet.transport)}</p>
  <h2>Contact the centre</h2>${sheet.phone ? `<p>Telephone: ${escape(sheet.phone.display)}</p>` : ""}${sheet.whatsapp.map((x) => `<p>WhatsApp: ${escape(x.display)}${x.scope === "website" ? " (general enquiry; may cover several branches)" : ""}</p>`).join("")}${!sheet.phone && !sheet.whatsapp.length ? "<p>No contact number listed. Check the centre’s listing.</p>" : ""}<p class="notice">Keep the pickup contact and driver’s number handy too.</p>
  <h2>01 / Confirm the arrangements</h2>${groups.map((g) => `<section class="party"><h3>${escape(g.name)}</h3><p>${escape(g.party)}</p>${items(g.questions, false)}</section>`).join("")}
  <h2>02 / Before you leave</h2>${items(sheet.packing)}${sheet.published.length ? `<h3>The centre also asks for</h3>${items(sheet.published)}` : '<p class="notice">Ask the centre if they need anything else.</p>'}
  <h2>Private details — fill in on paper</h2><p class="notice">Share these privately with the centre.</p>${["Collector identification / pickup permission", "Emergency contact", "Health, allergy or medication notes"].map((x) => `<section class="blank"><p>${escape(x)}</p><div class="line"></div></section>`).join("")}
  <section class="sources"><h3>About this checklist</h3><p class="notice">${sheet.date ? "Times and pickup choices come from your request. Arrival still needs to be agreed." : "Agree your usual hours and pickup arrangements with the centre."}</p>${sheet.sequence.filter(x => x.source).map(x => sourceHTML(x.source)).join("")}${sheet.phone ? sourceHTML(sheet.phone.source) : ""}${sheet.whatsapp.map(x => sourceHTML(x.source)).join("")}<small>Prepared ${escape(sheet.preparedAt)}</small><p class="notice">${escape(sheet.notice)}</p></section></main></body></html>`;
}
