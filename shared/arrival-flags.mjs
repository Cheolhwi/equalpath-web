// Personal flags for arrival information that looks wrong (Epic 7.5,
// 8 Oct 2026). They live only in this browser: never sent to a server and
// never used to change public information.
export const FLAGS_KEY = "equalpath:arrival-flags:v1";
export const NOTE_MAX = 200;
export const FLAG_TYPES = [
  ["different-place", "Shows a different place"],
  ["changed", "Looks different now"],
  ["entrance", "The entrance is somewhere else"],
  ["address", "The address doesn’t match"],
  ["other", "Something else"],
];
const TYPE_IDS = new Set(FLAG_TYPES.map(([id]) => id));
export const flagTypeLabel = (id) => FLAG_TYPES.find(([key]) => key === id)?.[1] ?? "Something else";

// What can be flagged for one centre: its address, its place on the map and
// each street view that is shown for it.
export function flagItems(p, images = []) {
  return [
    { id: "address", label: "Address" },
    { id: "map", label: "Place on the map" },
    ...images.map((image, i) => ({ id: `photo:${i}`, label: `Street photo · ${image.direction || `View ${i + 1}`}` })),
  ];
}

const valid = (f) => f && typeof f.id === "string" && typeof f.providerId === "string" && TYPE_IDS.has(f.type)
  && f.item && typeof f.item.id === "string" && typeof f.item.label === "string" && typeof f.note === "string";

export function parseFlags(raw) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data?.flags) ? data.flags.filter(valid) : [];
  } catch { return []; }
}
export const serialiseFlags = (flags) => JSON.stringify({ version: 1, flags });

export function flagErrors(draft) {
  const e = {};
  if (!draft?.item?.id) e.item = "Choose what looks wrong.";
  if (!TYPE_IDS.has(draft?.type)) e.type = "Choose what kind of problem it is.";
  const note = (draft?.note ?? "").trim();
  if (!note) e.note = "Add a short note so you remember what to check.";
  else if (note.length > NOTE_MAX) e.note = `Keep the note to ${NOTE_MAX} characters.`;
  return e;
}

// Adds a new flag or replaces the one with the same id. Returns a new list.
export function upsertFlag(flags, p, draft, now = new Date().toISOString(), makeId = () => `flag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`) {
  const existing = draft.id && flags.find((f) => f.id === draft.id);
  const flag = {
    id: existing ? existing.id : makeId(),
    providerId: p.id, providerName: p.name,
    item: { id: draft.item.id, label: draft.item.label },
    type: draft.type, note: draft.note.trim().slice(0, NOTE_MAX),
    createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
  return existing ? flags.map((f) => (f.id === flag.id ? flag : f)) : [...flags, flag];
}
export const removeFlag = (flags, id) => flags.filter((f) => f.id !== id);
export const flagsFor = (flags, providerId) => flags.filter((f) => f.providerId === providerId);
