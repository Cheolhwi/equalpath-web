import { timeLabel } from "./request.mjs";
// Explicit, browser-local saves only. No request history or child profile.
export const storageKey = (mode) => `equalpath:saved:v1:${mode}`;
export const emptyLibrary = () => ({
  version: 1,
  favourites: [],
  templates: [],
});
const text = (value, max = 160) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
export class SaveError extends Error {}
export function readLibrary(storage, mode) {
  try {
    const raw = storage.getItem(storageKey(mode));
    if (!raw) return emptyLibrary();
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      !Array.isArray(data.favourites) ||
      !Array.isArray(data.templates) ||
      [...data.favourites, ...data.templates].some(
        (x) => !x || typeof x.id !== "string",
      )
    )
      throw Error();
    if (
      data.favourites.some(
        (x) => typeof x.name !== "string" || typeof x.reason !== "string",
      ) ||
      data.templates.some(
        (x) =>
          typeof x.name !== "string" ||
          !x.pickup ||
          typeof x.pickup.label !== "string" ||
          !Number.isFinite(x.pickup.lat) ||
          !Number.isFinite(x.pickup.lng) ||
          typeof x.deadline !== "string" ||
          typeof x.end !== "string",
      )
    )
      throw Error();
    return data;
  } catch {
    throw new SaveError(
      "Saved items could not be read. Existing storage has been left untouched. Retry in this browser.",
    );
  }
}
export function updateLibrary(storage, mode, change) {
  const previous = readLibrary(storage, mode);
  const next = change(clone(previous));
  if (next.favourites.length > 100 || next.templates.length > 30)
    throw new SaveError(
      "This browser can keep up to 100 institutions and 30 templates. Remove an unused item first.",
    );
  try {
    storage.setItem(storageKey(mode), JSON.stringify(next));
  } catch {
    throw new SaveError(
      "Not saved: browser storage is unavailable or full. The previous saved version is unchanged; your current page is still available.",
    );
  }
  return next;
}
const FACTS = {
  name: "Branch name",
  category: "Institution type",
  region: "Region",
  district: "District",
  address: "Address",
  location: "Published location",
  phone: "Telephone",
  whatsapp: "WhatsApp",
  registration: "Registration record",
  age: "Admission age",
  admission: "Temporary admission",
  transport: "Transport and coverage",
  pickupWindows: "Pickup windows",
  careWindows: "Care schedule",
  businessHours: "Opening hours",
  dateExceptions: "Date exceptions",
  lateRule: "Late collection",
  fees: "Published fees",
  feeRule: "Fee basis",
  preparationRequirements: "Published preparation requirements",
};
export function factSnapshot(p, capturedAt = new Date().toISOString()) {
  return {
    version: p.version ?? null,
    capturedAt,
    facts: Object.fromEntries(Object.keys(FACTS).map((k) => [k, clone(p[k])])),
  };
}
export function favourite(
  p,
  reason = "",
  previous,
  now = new Date().toISOString(),
) {
  if (!p?.id) throw new SaveError("Choose an institution first.");
  return {
    id: p.id,
    name: text(p.name),
    category: text(p.category),
    region: text(p.region),
    reason: text(reason, 180),
    savedAt: previous?.savedAt ?? now,
    snapshot: previous?.snapshot ?? factSnapshot(p, now),
  };
}
export function template(request, name, id = globalThis.crypto.randomUUID()) {
  const p = request.pickup;
  if (!p?.label || !Number.isFinite(p.lat) || !Number.isFinite(p.lng))
    throw new SaveError(
      "Select a public pickup place before saving a template.",
    );
  return {
    id,
    name: text(name, 60) || "Usual pickup",
    pickup: {
      id: text(p.id, 80) || null,
      label: text(p.label),
      lat: p.lat,
      lng: p.lng,
    },
    deadline: text(request.deadline, 5),
    end: text(request.end, 5),
    transport: ["", "self", "institution"].includes(request.transport)
      ? request.transport
      : "",
    updatedAt: new Date().toISOString(),
  };
}
export function reuseTemplate(saved, defaults) {
  return {
    ...defaults,
    pickup: clone(saved.pickup),
    date: "",
    deadline: saved.deadline,
    end: saved.end,
    transport: saved.transport,
    age: "",
  };
}
export function matchedSavedPlace(saved, candidates) {
  return (
    !!saved?.id &&
    candidates.some(
      (p) => p.id === saved.id && p.lat === saved.lat && p.lng === saved.lng,
    )
  );
}
function factValue(value) {
  if (Array.isArray(value)) return value.map(factValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter(
          (k) =>
            !["retrievedAt", "retrieved_at", "capturedAt", "version"].includes(
              k,
            ),
        )
        .map((k) => [k, factValue(value[k])]),
    );
  return value;
}
export function compareFacts(before, after) {
  if (!before?.facts || !after?.facts)
    return { comparable: false, changes: [] };
  const comparable = Object.entries(FACTS).filter(([key]) => Object.hasOwn(before.facts, key) && Object.hasOwn(after.facts, key));
  return {
    comparable: comparable.length > 0,
    uncompared: Object.entries(FACTS).filter(([key]) => !Object.hasOwn(before.facts, key) || !Object.hasOwn(after.facts, key)).map(([,label]) => label),
    changes: comparable
      .filter(
        ([key]) =>
          JSON.stringify(factValue(before.facts[key] ?? null)) !==
          JSON.stringify(factValue(after.facts[key] ?? null)),
      )
      .map(([key, label]) => ({
        key,
        label,
        before: before.facts[key],
        after: after.facts[key],
      })),
  };
}
export function factDescription(value) {
  if (value == null || (Array.isArray(value) && !value.length))
    return "Not published";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map(factDescription).join("; ");
  if (Number.isFinite(value.start) && Number.isFinite(value.end))
    return `${value.days?.join(", ") ?? "Schedule"} ${timeLabel(value.start)}–${timeLabel(value.end)}`;
  if (value.display) return value.display;
  if (value.rangeLabel || value.wording)
    return [value.rangeLabel || value.wording, value.coverage ? `Coverage: ${factDescription(value.coverage)}` : null].filter(Boolean).join(' · ');
  const entries = Object.entries(value).filter(
    ([k, v]) =>
      !["source", "sources", "alternative", "retrievedAt"].includes(k) &&
      v != null,
  );
  return entries
    .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1")}: ${factDescription(v)}`)
    .join(" · ");
}
export function factDates(value) {
  const dates = new Set();
  const visit = (v) => {
    if (!v || typeof v !== "object") return;
    if (v.retrievedAt) dates.add(`Retrieved ${v.retrievedAt.slice(0, 10)}`);
    if (v.sourceDate) dates.add(`Source date ${v.sourceDate}`);
    Object.values(v).forEach(visit);
  };
  visit(value);
  return [...dates].join(" · ") || "Source / retrieval date unavailable";
}
