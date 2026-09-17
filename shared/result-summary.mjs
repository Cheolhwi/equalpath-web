const money = (n) => Number(n).toLocaleString("en-MY", { maximumFractionDigits: 2 });
const feeExtra = f => ['meal','transport','registration','deposit','annual','late_pickup'].includes(f.kind) || ['one_off','deposit'].includes(f.basis);
const shortPeriods = ['hour', 'visit', 'session', 'day'];
export const feesForCare = p => p.careType === 'short_term'
  ? (p.fees ?? []).filter(f => shortPeriods.includes(f.basis) && !feeExtra(f))
    .sort((a,b)=>shortPeriods.indexOf(a.basis)-shortPeriods.indexOf(b.basis))
  : p.fees ?? [];
// Different billing periods are separate price groups; never divide a monthly
// programme fee into an invented hourly rate or assume a minimum booking.
export function shortFeeFrom(p) {
  if (p.cost?.available && (p.cost.currency ?? 'MYR') === 'MYR' && Number.isFinite(p.cost.total) && p.cost.total >= 0)
    return {basis:'total', amount:p.cost.total, group:0};
  for (const [index, basis] of shortPeriods.entries()) {
    const values=feesForCare({...p,careType:'short_term'})
      .filter(f=>{
        const min=f.amount??f.min,max=f.amount??f.max??min;
        return f.basis===basis&&(f.currency??'MYR')==='MYR'&&Number.isFinite(max)&&max>=min;
      })
      .map(f=>f.amount??f.min).filter(n=>Number.isFinite(n)&&n>=0);
    if(values.length)return {basis,amount:Math.min(...values),group:index+1};
  }
  return null;
}
export const feePriorityGroup = p => p.careType === 'short_term' ? shortFeeFrom(p)?.group ?? Infinity : 0;
export const feePriorityValue = p => p.careType === 'short_term' ? shortFeeFrom(p)?.amount ?? null : monthlyFeeFrom(p);
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
  if (p.cost?.available) return { label: `${p.cost.currency || "MYR"} ${money(p.cost.total)} estimated total`, note: "For these care hours. Open fee details to see what is included." };
  const fees = feesForCare(p);
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
  return labels.length ? { label: `${primary.length ? '' : 'Extras: '}${labels.slice(0, 2).join(" · ")}`, note: p.careType==='short_term' ? 'Ask about the minimum stay and any extra charges.' : fees.every(f=>f.verification==='area_estimate')?'Estimated from nearby centres. Ask this centre for its price.':`${labels.length > 2 ? "More rates in details. " : ""}Listed fees. Ask what is included.` } : { label: "Ask the centre", note: p.careType==='short_term' ? "Short-stay price not listed." : "No published fee found." };
}
export function drivingLabel(driving) {
  return driving?.state === "available" ? `About ${driving.minutes} min by car` : "Driving time unavailable";
}
