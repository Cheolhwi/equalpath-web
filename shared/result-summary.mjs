const money = (n) => Number(n).toLocaleString("en-MY", { maximumFractionDigits: 2 });
const feeExtra = f => ['meal','transport','registration','deposit','annual','late_pickup'].includes(f.kind) || ['one_off','deposit'].includes(f.basis);
export function monthlyFeeFrom(p) {
  const values = (p.fees ?? []).filter(f => f.basis === 'month' && (f.currency ?? 'MYR') === 'MYR' && !feeExtra(f))
    .map(f => f.amount ?? f.min).filter(n => Number.isFinite(n) && n >= 0);
  return values.length ? Math.min(...values) : null;
}
const period = basis => !basis || basis === 'unspecified' ? ' · period not listed' : basis === 'one_off' ? ' one-time' : basis === 'deposit' ? ' deposit' : ` / ${basis}`;
export function formatFee(f) {
  const min=f.amount??f.min,max=f.amount??f.max;
  if(!Number.isFinite(min))return 'Amount not listed';
  return `${f.verification==='area_estimate'?'Estimated ':''}${f.amount==null&&f.max==null?'From ':''}${f.currency||'MYR'} ${money(min)}${Number.isFinite(max)&&max>min?'–'+money(max):''}${period(f.basis)}`;
}
export function feeSummary(p) {
  if (p.cost?.available) return { label: `${p.cost.currency || "MYR"} ${money(p.cost.total)} estimated total`, note: "For these care hours; see the breakdown in details." };
  const fees = p.fees ?? [];
  const primary = fees.filter(f => !feeExtra(f));
  const listed = primary.length ? primary : fees;
  const groups = new Map();
  for (const f of listed) {
    const min = f.amount ?? f.min, max = f.amount ?? f.max ?? min;
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max < min) continue;
    const key = `${f.currency || "MYR"}|${f.basis || "basis not listed"}|${f.verification === 'area_estimate' ? 'area_estimate' : f.verification === 'directory_estimate' ? 'estimate' : 'published'}`;
    const old = groups.get(key);
    groups.set(key, { min: Math.min(old?.min ?? min, min), max: Math.max(old?.max ?? max, max), open: old?.open || (f.amount == null && f.max == null) });
  }
  const labels = [...groups].map(([key, { min, max, open }]) => {
    const [currency, basis, status] = key.split("|");
    return `${status === 'area_estimate' ? 'Estimated ' : status === 'estimate' ? 'Est. ' : ''}${formatFee({currency,basis,min,max:open?null:max})}`;
  });
  return labels.length ? { label: `${primary.length ? '' : 'Extras: '}${labels.slice(0, 2).join(" · ")}`, note: fees.every(f=>f.verification==='area_estimate')?'Area budget reference; ask the centre for its quote.':`${labels.length > 2 ? "More rates in details. " : ""}Published programme rates; ask about one-off care.` } : { label: "Ask the centre", note: "No published fee found." };
}
export function drivingLabel(driving) {
  return driving?.state === "available" ? `About ${driving.minutes} min by car` : "Driving time unavailable";
}
