export const CONTRACT = "equalpath-web-p03-v1";
export const MAX_SEARCH_RADIUS_KM = 10;
export const isShortCare = (request) => request?.careType !== "regular";
export const careTypeLabel = (request) => isShortCare(request) ? "Care for a few hours" : "Long-term childcare";
export const SHORT_CARE_RADIUS_KM = 5;
export const searchRadius = (value, careType = "regular") => careType === "short_term" ? SHORT_CARE_RADIUS_KM : Number(value) === 5 ? 5 : MAX_SEARCH_RADIUS_KM;
export const searchPageSize = (careType) => careType === "short_term" ? 10 : 20;
export const minutes = (s) =>
  typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
    ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
    : null;
export const timeLabel = (n) =>
  Number.isFinite(n)
    ? `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
    : "Not published";
export const todayKL = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const ageBounds = (age) => age === "1-3" ? [12, 48] : age === "4-6" ? [48, 84] : [Number(age) * 12, (Number(age) + 1) * 12];
export function requestErrors(r, { requireAge = false } = {}) {
  const errors = {};
  if (![undefined, "regular", "short_term"].includes(r?.careType))
    errors.careType = "Choose Short time or Long term.";
  if (
    !r?.pickup?.label?.trim() ||
    !Number.isFinite(r.pickup.lat) ||
    !Number.isFinite(r.pickup.lng)
  )
    errors.pickup = "Choose an address from the search results or the map.";
  if (isShortCare(r)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(r?.date ?? "") ||
      new Date(r.date + "T12:00:00+08:00").toString() === "Invalid Date" ||
      new Date(r.date + "T12:00:00Z").toISOString().slice(0, 10) !== r.date
    )
      errors.date = "Choose a date for care.";
    const start = minutes(r?.deadline),
      end = minutes(r?.end);
    if (start === null) errors.deadline = "When will your child leave the pickup address?";
    if (end === null) errors.end = "When will you pick up your child from childcare?";
    else if (start !== null && end <= start)
      errors.end = "Choose a later pickup time on the same day.";
  }
  if (
    r?.age !== "" &&
    r?.age !== null &&
    r?.age !== undefined &&
    !/^(?:[0-6]|1-3|4-6)$/.test(String(r.age))
  )
    errors.age = "Choose your child’s age.";
  if (requireAge && !["1-3", "4-6"].includes(r?.age))
    errors.age = "Choose 1–3 years or 4–6 years.";
  if (!["", "institution", "self", null, undefined].includes(r?.transport))
    errors.transport = "Choose who will handle pickup.";
  return errors;
}
export function canonicalRequest(input) {
  return {
    careType: isShortCare(input) ? "short_term" : "regular",
    pickup: {
      id:
        typeof input.pickup?.id === "string"
          ? input.pickup.id.slice(0, 80)
          : null,
      label: input.pickup.label.trim().slice(0, 160),
      lat: input.pickup.lat,
      lng: input.pickup.lng,
    },
    date: isShortCare(input) ? input.date : "",
    deadline: isShortCare(input) ? input.deadline : "",
    end: isShortCare(input) ? input.end : "",
    age: input.age === null || input.age === undefined ? "" : String(input.age),
    transport: input.transport ?? "",
    radius: searchRadius(input.radius, isShortCare(input) ? "short_term" : "regular"),
    query: String(input.query ?? "")
      .trim()
      .slice(0, 100),
    includeUnknown: input.includeUnknown !== false,
    includeConflicts: input.includeConflicts !== false,
    sort: (isShortCare(input) ? ["distance", "price", "closing", "pickup", "name"] : ["distance", "price", "pickup", "name"]).includes(input.sort)
      ? input.sort
      : "distance",
  };
}
export const requestKey = (r) => JSON.stringify(r);
export const needsPickupAddress = (p) => !!p && /^(Map point\b|Selected location$|My current location$)/i.test(p.label ?? "");
export function requestCaption(r) {
  return r
    ? `${needsPickupAddress(r.pickup) ? "Selected pickup location" : r.pickup.label} · ${isShortCare(r) ? `${r.date} · leave by ${r.deadline} · pick up from childcare at ${r.end}` : "Long-term childcare"}`
    : "";
}
