// Presentation helpers only. Source records keep their published spelling;
// these functions tidy all-caps register text for reading on screen.
const KEEP_UPPER = new Set(["KL", "KLCC", "PJ", "USJ", "SS", "TTDI", "UIA", "UM", "UKM", "UPM", "IIUM", "KEMAS", "MARA", "ATM", "JKR", "KWSP", "PLT", "BMC", "II", "III", "IV"]);
const SPECIAL = new Map([["SDN", "Sdn"], ["BHD", "Bhd"]]);
const LOWER_INSIDE = new Set(["of", "and", "the", "at", "di", "dan", "&"]);

const titleWord = (word, first) => {
  const bare = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
  if (!bare) return word;
  if (SPECIAL.has(bare)) return word.replace(bare, SPECIAL.get(bare));
  if (KEEP_UPPER.has(bare) || /\d/.test(bare) || !/[AEIOUY]/.test(bare)) return word;
  const lower = word.toLowerCase();
  if (!first && LOWER_INSIDE.has(bare.toLowerCase())) return lower;
  // Capitalise the first letter of each part: "AZ-ZAHRAH" → "Az-Zahrah",
  // "BANGSAR/PUDU" → "Bangsar/Pudu", "CHILDREN'S" → "Children's".
  return lower.replace(/(^|[-/(])([a-z])/g, (_, before, letter) => before + letter.toUpperCase());
};

// Only rewrite text that has no lower-case letters; a mixed-case name is
// already how the centre spells it.
export function tidyCaps(text) {
  if (typeof text !== "string" || !text.trim() || /[a-z]/.test(text)) return text;
  return text.split(/(\s+)/).map((part, i) => /\s/.test(part) ? part : titleWord(part, i === 0)).join("");
}

export const displayName = (name) => tidyCaps(name) ?? name;

const cleanPlace = (value) => {
  if (typeof value !== "string" || !value.trim()) return "";
  return tidyCaps(value.trim()
    .replace(/^ZON\s+/i, "")
    .replace(/^W\.?\s?P\.?\s+/i, ""));
};

// One short locality for cards: district first, then state, without
// repeating the same place twice ("Kuala Lumpur, Kuala Lumpur").
export function placeLabel(p) {
  return cleanPlace(p?.district) || cleanPlace(p?.region) || "";
}
export function placeLine(p) {
  const parts = [cleanPlace(p?.district), cleanPlace(p?.region)].filter(Boolean);
  return parts.filter((part, i) => parts.findIndex(x => x.toLowerCase() === part.toLowerCase()) === i).join(", ");
}

export function categoryLabel(p) {
  const value = p?.category;
  if (!value) return "Childcare centre";
  if (value === "CHILDCARE") return "Childcare centre";
  if (["TASKA", "TADIKA", "TABIKA"].includes(value)) return value;
  return tidyCaps(value);
}

export const shortDateLabel = (date) => date
  ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))
  : "";
