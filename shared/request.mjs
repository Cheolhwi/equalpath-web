export const CONTRACT = "equalpath-web-p03-v1";
export const MAX_SEARCH_RADIUS_KM = 10;
export const isShortCare = (request) => request?.careType !== "regular";
export const careTypeLabel = (request) => isShortCare(request) ? "A few hours of care" : "Regular childcare";
export const SHORT_CARE_RADIUS_KM = 5;
// Short care starts nearby; expanding to 10 km is an explicit user choice.
export const searchRadius = (value, careType = "regular") => Number(value) === MAX_SEARCH_RADIUS_KM ? MAX_SEARCH_RADIUS_KM : Number(value) === 5 ? 5 : careType === "short_term" ? SHORT_CARE_RADIUS_KM : MAX_SEARCH_RADIUS_KM;
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
// A child's age in whole years (6 October 2026). Single years replace the old
// 1–3 / 4–6 groups: centres publish limits like 18 months or under 6, and a
// group that crosses them could only ever say "Ask". "1-3" and "4-6" stay
// valid so saved searches and older links still work.
export const CHILD_AGES = [["0", "Under 1"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"]];
export const isChildAge = (age) => /^(?:[0-6]|1-3|4-6)$/.test(String(age ?? ""));
// Short text for chips and table headers: "under 1", "4", "1–3".
export const ageShort = (age) => age === "0" ? "under 1" : age ? String(age).replace("-", "–") : "?";
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
    if (start === null) errors.deadline = "Choose a start time.";
    if (end === null) errors.end = "Choose an end time.";
    else if (start !== null && end <= start)
      errors.end = "Choose an end time after the start time, on the same day.";
  }
  if (
    r?.age !== "" &&
    r?.age !== null &&
    r?.age !== undefined &&
    !isChildAge(r.age)
  )
    errors.age = "Choose your child’s age.";
  if (requireAge && !isChildAge(r?.age))
    errors.age = "Choose your child’s age.";
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
    includeConflicts: input.includeConflicts === true,
    sort: (isShortCare(input) ? ["recommended", "distance", "price", "closing", "pickup", "name"] : ["recommended", "distance", "price", "pickup", "name"]).includes(input.sort)
      ? input.sort
      : "distance",
  };
}
export const requestKey = (r) => JSON.stringify(r);
export const needsPickupAddress = (p) => !!p && /^(Map point\b|Selected location$|My current location$)/i.test(p.label ?? "");
export function requestCaption(r) {
  return r
    ? `${needsPickupAddress(r.pickup) ? "Selected starting point" : r.pickup.label} · ${isShortCare(r) ? `${r.date} · ${r.deadline}–${r.end}` : "Regular childcare"}`
    : "";
}
