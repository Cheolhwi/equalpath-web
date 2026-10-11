// Sharing a Checklist (11 Oct 2026, user: "checklist…加入一个短链接sharing的功能"): the
// plan travels in the link's #fragment, which browsers never send to a
// server, so nothing about the child is stored anywhere. The person who
// opens it sees the same checklist, read from the centre's current details.
//
// #checklist=1~L~20261012~3.1339,101.6869~KL%20Sentral~S~<centre>.0900.1500.3*<centre>.1300.1800.2~bag.a%3Awater
const MODES = { live: "L", demo: "D" }, TRANSPORT = { self: "S", institution: "I" };
const back = (map, v) => Object.keys(map).find((k) => map[k] === v) ?? "";
const time = (t) => /^\d\d:\d\d$/.test(t ?? "") ? t.replace(":", "") : "";
const untime = (t) => /^\d{4}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2)}` : "";
const id = (x) => String(x).replace(/^provider_/, "");
const unid = (x) => /^[a-f0-9]{20,40}$/.test(x) ? `provider_${x}` : x;
const enc = (s) => encodeURIComponent(String(s ?? "")).replace(/[~.*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function encodeChecklist({ mode = "live", pickup, date, transport, items, checked = [] }) {
  if (!date || !items?.length || !pickup || !Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) return null;
  return ["1", MODES[mode] ?? "L", date.replaceAll("-", ""), `${pickup.lat.toFixed(4)},${pickup.lng.toFixed(4)}`, enc(pickup.label),
    TRANSPORT[transport] ?? "", items.map((it) => [enc(id(it.id)), time(it.start), time(it.end), enc(it.age ?? "")].join(".")).join("*"),
    checked.map(enc).join(".")].join("~");
}

export function decodeChecklist(text) {
  try {
    const [v, m, d, ll, label, t, list, ticks = ""] = String(text).split("~");
    if (v !== "1" || !/^\d{8}$/.test(d)) return null;
    const [lat, lng] = ll.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const items = list.split("*").filter(Boolean).map((x) => {
      const [i, s, e, a] = x.split(".");
      return { id: unid(decodeURIComponent(i)), start: untime(s), end: untime(e), age: decodeURIComponent(a ?? "") };
    });
    if (!items.length || items.length > 2 || items.some((x) => !x.id || !x.start || !x.end)) return null;
    return { mode: back(MODES, m) || "live", date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`,
      pickup: { label: decodeURIComponent(label) || "Starting point", lat, lng }, transport: back(TRANSPORT, t),
      items, checked: ticks ? ticks.split(".").map(decodeURIComponent).filter(Boolean) : [] };
  } catch { return null; }
}
