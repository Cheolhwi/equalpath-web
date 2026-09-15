export const CONTRACT = "equalpath-web-p03-v1";
export const MAX_SEARCH_RADIUS_KM = 10;
export const isShortCare = (request) => request?.careType !== "regular";
export const careTypeLabel = (request) => isShortCare(request) ? "Short-term care" : "Regular childcare";
export const searchRadius = (value) => Number(value) === 5 ? 5 : MAX_SEARCH_RADIUS_KM;
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
export function requestErrors(r) {
  const errors = {};
  if (![undefined, "regular", "short_term"].includes(r?.careType))
    errors.careType = "Choose regular childcare or short-term care.";
  if (
    !r?.pickup?.label?.trim() ||
    !Number.isFinite(r.pickup.lat) ||
    !Number.isFinite(r.pickup.lng)
  )
    errors.pickup = "Choose a public pickup place from the results or the map.";
  if (isShortCare(r)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(r?.date ?? "") ||
      new Date(r.date + "T12:00:00+08:00").toString() === "Invalid Date" ||
      new Date(r.date + "T12:00:00Z").toISOString().slice(0, 10) !== r.date
    )
      errors.date = "Choose a valid service date.";
    const start = minutes(r?.deadline),
      end = minutes(r?.end);
    if (start === null) errors.deadline = "Enter the latest collection time.";
    if (end === null) errors.end = "Enter the care end time.";
    else if (start !== null && end <= start)
      errors.end = "Care must end after collection on the same day.";
  }
  if (
    r?.age !== "" &&
    r?.age !== null &&
    r?.age !== undefined &&
    !/^[0-6]$/.test(String(r.age))
  )
    errors.age = "Choose under 1, or a completed age from 1 to 6.";
  if (!["", "institution", "self", null, undefined].includes(r?.transport))
    errors.transport = "Choose an available transport preference.";
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
    radius: searchRadius(input.radius),
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
    ? `${needsPickupAddress(r.pickup) ? "Selected pickup location" : r.pickup.label} · ${isShortCare(r) ? `${r.date} · collect by ${r.deadline} · care until ${r.end}` : "Regular childcare"}`
    : "";
}
