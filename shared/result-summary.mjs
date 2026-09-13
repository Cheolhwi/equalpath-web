const money = (n) => Number(n).toLocaleString("en-MY", { maximumFractionDigits: 2 });
export function feeSummary(p) {
  if (p.cost?.available) return { label: `${p.cost.currency || "MYR"} ${money(p.cost.total)} estimated total`, note: "For these care hours; see the breakdown in details." };
  const groups = new Map();
  for (const f of p.fees ?? []) {
    const min = f.amount ?? f.min, max = f.amount ?? f.max ?? min;
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max < min) continue;
    const key = `${f.currency || "MYR"}|${f.basis || "basis not listed"}`;
    const old = groups.get(key);
    groups.set(key, { min: Math.min(old?.min ?? min, min), max: Math.max(old?.max ?? max, max) });
  }
  const labels = [...groups].map(([key, { min, max }]) => {
    const [currency, basis] = key.split("|");
    return `${currency} ${money(min)}${max > min ? "–" + money(max) : ""} / ${basis}`;
  });
  return labels.length ? { label: labels.slice(0, 2).join(" · "), note: `${labels.length > 2 ? "More rates in details. " : ""}Published programme rates; ask about one-off care.` } : { label: "Ask the centre", note: "No published fee found." };
}
export function drivingLabel(driving) {
  return driving?.state === "available" ? `About ${driving.minutes} min by car` : "Driving time unavailable";
}
