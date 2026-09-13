import { minutes, requestCaption, todayKL } from "./request.mjs";
export const DRAFT_NOTICE =
  "Draft checklist. Confirm care and pickup permission with the centres directly. This sheet does not authorise collection.";
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
  const span = minutes(request.end) - minutes(request.deadline);
  const transport =
    request.transport === "institution"
      ? "Centre pickup requested"
      : request.transport === "self"
        ? "I’ll arrange transport"
        : "Pickup arrangement to be confirmed";
  const groups = [
    {
      id: "usual",
      name: "Usual centre",
      party: request.pickup.label,
      contact: "Ask who handles pickup",
      questions: [
        prompt(
          "release",
          `What do I need to arrange for pickup by ${request.deadline} on ${request.date}?`,
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
      name: "Receiving centre",
      party: p.name,
      contact:
        p.phone || p.whatsapp?.length
          ? "Contact details below. Ask who will welcome your child."
          : "Ask who will welcome your child",
      questions: [
        prompt(
          "receive",
          "Who will receive the child, and where should the handover take place?",
        ),
        prompt(
          "arrival",
          "What time should my child arrive after pickup?",
        ),
        prompt(
          "final",
          `Can I collect my child by ${request.end}? What happens if I’m late?`,
        ),
        prompt(
          "private",
          "How should I provide identity, emergency and health information privately?",
        ),
      ],
    },
    {
      id: "transport",
      name: "Person collecting your child",
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
          "Who should the collector meet, and how will they confirm my child has arrived?",
        ),
        prompt(
          "transport-delay",
          "Who should each centre contact if pickup or transfer is delayed?",
        ),
      ],
    },
  ];
  const packing = [
    prompt("bag", "A labelled bag, spare clothes and a water bottle."),
    prompt(
      "instructions",
      "Check pickup instructions and contact numbers with both centres.",
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
      prompt("rest", "Ask about rest time and any familiar comfort item."),
    );
  if (request.age !== "" && request.age != null && Number(request.age) < 3)
    packing.push(
      prompt(
        "young",
        "Ask about nappies, feeding supplies and spare changes for a younger child.",
      ),
    );
  if (minutes(request.end) >= 1140)
    packing.push(
      prompt("evening", "Check dinner and the evening collection routine."),
    );
  if (request.transport === "institution")
    packing.push(
      prompt(
        "transport-items",
        "Check bag labelling, child seating and what can be taken in the pickup vehicle.",
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
      title: "01 / Collection",
      text: `${request.pickup.label} · collect by ${request.deadline}`,
      basis: "Your request",
      detail:
        "Agree who will collect your child and what they need to bring.",
    },
    {
      title: "02 / Transfer & arrival",
      text: `To ${p.name}${p.address ? " · " + p.address : ""}`,
      basis: p.address
        ? "Centre address"
        : "Address to confirm",
      source: p.addressSource,
      detail: `${transport}. Confirm the arrival time. Travel time hasn’t been calculated.`,
    },
    {
      title: "03 / Final collection",
      text: `Collect from ${p.name} by ${request.end}`,
      basis: "Your request",
      detail: `Published care end time: ${p.careEndTimeLabel ?? p.businessHoursLabel ?? "Not published"}. Check this against your collection time.`,
      source: p.careEndTimeSource ?? p.businessHours?.source,
    },
  ];
  return {
    name: p.name,
    providerId: p.id,
    mode: p.mode,
    preparedAt,
    preparationDate: todayKL(),
    request: requestCaption(request),
    interval: `${request.deadline}–${request.end} · ${span} minutes including travel. Confirm the time at the centre.`,
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
export const preparationCSS = `body{font:14px/1.55 Arial,sans-serif;color:#30382f;background:#f5f4ee;margin:0}main{max-width:850px;margin:auto;padding:36px}h1{font-size:30px;line-height:1.2}h2{font-size:19px;border-top:1px solid #bbc3ae;padding-top:20px;margin-top:28px}h3{font-size:15px}p{margin:8px 0}small{display:block;color:#56614f;font-size:11px;overflow-wrap:anywhere}.notice{padding:14px;border-left:3px solid #6b7951;background:#e9ebe1}.step,li{break-inside:avoid;margin:10px 0}.line{height:30px;border-bottom:1px solid #adb4a6}.blank{break-inside:avoid}button{padding:12px 20px;background:#30382f;color:white;border:0;font:inherit;cursor:pointer}a{color:inherit;overflow-wrap:anywhere}@page{size:A4;margin:15mm}@media print{body{background:white;font-size:11pt}main{padding:0;max-width:none}.print-control{display:none}h2,h3{break-after:avoid}a{color:inherit;text-decoration:none}h1{font-size:22pt}small{font-size:8pt}}`;
export function preparationHTML(sheet, checked = []) {
  const selected = new Set(checked);
  const items = (list) =>
    `<ul>${list.map((x) => `<li>${selected.has(x.id) ? "☑" : "☐"} ${escape(x.text)}${sourceHTML(x.source)}</li>`).join("")}</ul>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EqualPath preparation — ${escape(sheet.name)}</title><style>${preparationCSS}</style></head><body><main>
  <p>EQUALPATH / CARE PREPARATION ${sheet.mode === "demo" ? " / CONTROLLED DEMO" : ""}</p><h1>${escape(sheet.name)}</h1>
  <p class="notice">${escape(sheet.notice)}</p><p>${escape(sheet.request)}</p><p>${escape(sheet.interval)}</p><small>Prepared ${escape(sheet.preparedAt)} · Times are Malaysia time.</small>
  ${sheet.conflicts.length ? `<h2>Conditions to resolve</h2>${items(sheet.conflicts.map((c) => ({ id: c.id, text: c.label + ": " + c.reason, source: c.source })))}` : ""}
  <h2>Pickup plan</h2>${sheet.sequence.map((x) => `<section class="step"><h3>${escape(x.title)}</h3><small>${escape(x.basis)}</small><p>${escape(x.text)}</p><p>${escape(x.detail)}</p>${sourceHTML(x.source)}</section>`).join("")}
  <h2>Contact details</h2><p>Receiving centre: ${escape(sheet.name)}</p>${sheet.phone ? `<p>Telephone: ${escape(sheet.phone.display)}</p>${sourceHTML(sheet.phone.source)}` : ""}${sheet.whatsapp.map((x) => `<p>WhatsApp: ${escape(x.display)}${x.scope === "website" ? " (website enquiry; may serve multiple branches)" : ""}</p>${sourceHTML(x.source)}`).join("")}${!sheet.phone && !sheet.whatsapp.length ? "<p>Ask who will welcome your child.</p>" : ""}<p>Also keep the usual centre’s number and the collector’s number handy.</p>
  <h2>Handover questions — to discuss</h2>${sheet.groups.map((g) => `<section><h3>${escape(g.name)}</h3><p>${escape(g.party)}</p><small>${escape(g.contact)}</small>${items(g.questions)}</section>`).join("")}
  <h2>Packing list</h2>${items(sheet.packing)}<h2>What the centre asks you to bring</h2>${sheet.published.length ? items(sheet.published) : "<p>We haven’t found a packing list for this centre. Ask them what to bring.</p>"}
  <h2>Personal details — fill in on paper</h2><p>Fill in these spaces on paper and share them privately with the centre.</p>${["Collector identification / authorisation reference", "Emergency contact", "Health, allergy or medication instructions for the institution"].map((x) => `<section class="blank"><p>${escape(x)}</p><div class="line"></div></section>`).join("")}
  <p class="notice">${escape(sheet.notice)} Tick items as you pack; confirm arrangements with the centre separately.</p></main></body></html>`;
}
