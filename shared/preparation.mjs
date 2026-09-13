import { minutes, requestCaption, todayKL } from "./request.mjs";
export const DRAFT_NOTICE =
  "Preparation draft. Arrange provider agreement and institution-managed pickup authorisation separately. This sheet does not authorise collection.";
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
      ? "Institutional pickup requested"
      : request.transport === "self"
        ? "Self-arranged delivery requested"
        : "Transport arrangement to be confirmed";
  const groups = [
    {
      id: "usual",
      name: "Usual centre",
      party: request.pickup.label,
      contact: "Release contact to be confirmed",
      questions: [
        prompt(
          "release",
          `What release procedure is needed for collection by ${request.deadline} on ${request.date}?`,
        ),
        prompt(
          "identity",
          "Which identification and prior authorisation must the collector present?",
        ),
        prompt("delay", "Whom should we contact if the collector is delayed?"),
      ],
    },
    {
      id: "receiving",
      name: "Receiving centre",
      party: p.name,
      contact:
        p.phone || p.whatsapp?.length
          ? "Published enquiry contact below; receiving staff member to be confirmed"
          : "Receiving contact to be confirmed",
      questions: [
        prompt(
          "receive",
          "Who will receive the child, and where should the handover take place?",
        ),
        prompt(
          "arrival",
          "What arrival time should we agree after pickup? Transfer duration is not yet confirmed.",
        ),
        prompt(
          "final",
          `What collection and delay procedure applies when I return by ${request.end}?`,
        ),
        prompt(
          "private",
          "How should I provide identity, emergency and health information privately?",
        ),
      ],
    },
    {
      id: "transport",
      name: "Transport / collector",
      party: "Collector or transport contact to be confirmed",
      contact: transport,
      questions: [
        prompt(
          "collector",
          request.transport === "institution"
            ? "Which named collector and vehicle will the institution arrange?"
            : request.transport === "self"
              ? "Who will collect and deliver the child under my arrangement?"
              : "Who can provide collection and transfer for this occasion?",
        ),
        prompt(
          "handover",
          "How will the collector identify the receiving staff member and confirm the handover directly?",
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
      "Check the centres’ release instructions and agreed collection contacts.",
    ),
  ];
  if (span >= 120)
    packing.push(
      prompt(
        "meal",
        "Check whether a meal or snack is needed for this care interval.",
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
        "Check your collector has the agreed address and the institution’s release instructions.",
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
        "Release procedure and collector to be agreed with the usual centre.",
    },
    {
      title: "02 / Transfer & arrival",
      text: `To ${p.name}${p.address ? " · " + p.address : ""}`,
      basis: p.address
        ? "Published destination"
        : "Destination details unresolved",
      source: p.addressSource,
      detail: `${transport}. Arrival to be confirmed — no journey time has been calculated.`,
    },
    {
      title: "03 / Final collection",
      text: `Collect from ${p.name} by ${request.end}`,
      basis: "Your request",
      detail: `Published care end time: ${p.careEndTimeLabel ?? p.businessHoursLabel ?? "Not published"}. Check the condition results for this date.`,
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
    interval: `${request.deadline}–${request.end} · ${span} minutes requested (transfer included; actual care duration to be agreed)`,
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
  <h2>Collection and handover sequence</h2>${sheet.sequence.map((x) => `<section class="step"><h3>${escape(x.title)}</h3><small>${escape(x.basis)}</small><p>${escape(x.text)}</p><p>${escape(x.detail)}</p>${sourceHTML(x.source)}</section>`).join("")}
  <h2>Published institutional contacts</h2><p>Receiving centre: ${escape(sheet.name)}</p>${sheet.phone ? `<p>Telephone: ${escape(sheet.phone.display)}</p>${sourceHTML(sheet.phone.source)}` : ""}${sheet.whatsapp.map((x) => `<p>WhatsApp: ${escape(x.display)}${x.scope === "website" ? " (website enquiry; may serve multiple branches)" : ""}</p>${sourceHTML(x.source)}`).join("")}${!sheet.phone && !sheet.whatsapp.length ? "<p>Receiving contact to be confirmed.</p>" : ""}<p>Usual centre release contact and collector / transport contact: to be confirmed.</p>
  <h2>Handover questions — to discuss</h2>${sheet.groups.map((g) => `<section><h3>${escape(g.name)}</h3><p>${escape(g.party)}</p><small>${escape(g.contact)}</small>${items(g.questions)}</section>`).join("")}
  <h2>General packing prompts</h2>${items(sheet.packing)}<h2>Provider-sourced requirements</h2>${sheet.published.length ? items(sheet.published) : "<p>No specific packing or handover requirements are published in the current record. Ask the receiving centre.</p>"}
  <h2>Private information — complete on paper only</h2><p>Provide identity, emergency and health details privately to the institution. These blank spaces contain no saved personal information.</p>${["Collector identification / authorisation reference", "Emergency contact", "Health, allergy or medication instructions for the institution"].map((x) => `<section class="blank"><p>${escape(x)}</p><div class="line"></div></section>`).join("")}
  <p class="notice">${escape(sheet.notice)} Ticked packing items mean prepared, not provider agreement.</p></main></body></html>`;
}
