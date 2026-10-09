import { canonicalRequest } from './request.mjs';
import { childRequest, CHILD_CHECKS } from './two-child.mjs';

// Recheck every selected centre for BOTH children, including centres excluded
// from one child's search. Search membership is not evidence of a match.
export async function loadFamilyComparison({ api, mode, ids, plan, version }) {
  const children = {};
  for (const key of ['a', 'b']) {
    children[key] = await api({ action: 'compare', mode, ids, version,
      request: canonicalRequest({ ...childRequest(plan, key), sort: 'name' }) });
    if (children[key].version !== version || ids.some(id => !children[key].items.some(p => p.id === id)))
      throw Object.assign(new Error('The comparison changed.'), { code: 'FACTS_CHANGED' });
  }
  return { children, items: ids.map(id => ({
    ...children.a.items.find(p => p.id === id),
    children: { a: children.a.items.find(p => p.id === id), b: children.b.items.find(p => p.id === id) },
  })) };
}

// The start-time check only exists when hours are listed; a missing one is not a question.
const childConditions = p => CHILD_CHECKS.map(id => p?.fit?.conditions?.find(c => c.id === id)).filter((c, i) => c || CHILD_CHECKS[i] !== 'opening');
export function childComparisonFit(p) {
  const conditions = childConditions(p);
  if (conditions.some(c => c?.state === 'conflict')) return { state: 'conflict', label: 'Does not fit' };
  if (conditions.every(c => c?.state === 'supported')) return { state: 'supported', label: 'Fits listed details' };
  return { state: 'unknown', label: 'Ask the centre' };
}

export function familyComparisonFee(children) {
  const costs = ['a', 'b'].map(key => children[key]?.cost);
  if (!costs.every(c => c?.available && Number.isFinite(c.total) && c.total >= 0) ||
      (costs[0].currency || 'MYR') !== (costs[1].currency || 'MYR')) return 'Ask the centre';
  return `${costs[0].currency || 'MYR'} ${(costs[0].total + costs[1].total).toLocaleString('en-MY', { maximumFractionDigits: 2 })} estimated total`;
}

// One line per child for the comparison table: whether the listed details fit,
// and what to ask or what doesn't fit, without opening anything.
const CHECK_WORDS = { age: 'age', admission: 'short care', opening: 'start time', care: 'care hours' };
export function childFitLine(p) {
  const fit = childComparisonFit(p);
  const open = childConditions(p).filter(c => c && c.state !== 'supported');
  const words = state => open.filter(c => c.state === state).map(c => CHECK_WORDS[c.id] ?? c.label?.toLowerCase()).join(', ');
  if (fit.state === 'supported') return { state: 'supported', text: 'Fits' };
  if (fit.state === 'conflict') return { state: 'conflict', text: `Doesn’t fit: ${words('conflict')}` };
  const missing = CHILD_CHECKS.filter(id => id !== 'opening' && !p?.fit?.conditions?.some(c => c.id === id)).map(id => CHECK_WORDS[id]);
  return { state: 'unknown', text: `Ask: ${[words('unknown'), ...missing].filter(Boolean).join(', ')}` };
}

// A child's own estimate in short form for the line under the total.
export function childFeeShort(p) {
  const c = p?.cost;
  return c?.available && Number.isFinite(c.total) && c.total >= 0
    ? `${c.currency || 'MYR'} ${c.total.toLocaleString('en-MY', { maximumFractionDigits: 2 })}` : 'ask the centre';
}

// Sorting the two-children comparison, like the one-child "Sort by". A centre
// where either child doesn't fit always comes last; the best column (only when
// it actually stands out) gets a tag.
export const FAMILY_SORTS = [
  { value: 'distance', label: 'Nearest first', best: 'Nearest' },
  { value: 'price', label: 'Lowest total fee', best: 'Lowest total' },
  { value: 'closing', label: 'Open latest', best: 'Open latest' },
  { value: 'fit', label: 'Fewest questions', best: 'Fewest questions' },
];
export const FAMILY_SORT_REASONS = { distance: 'No drive times listed.', price: 'No total fee for both children.', closing: 'No closing times listed.' };
const toMinutes = s => /^\d{2}:\d{2}$/.test(s ?? '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null;
const WEIGHT = { conflict: 3, unknown: 1, supported: 0 };
export function familyTotal(children) {
  const fee = familyComparisonFee(children);
  if (fee === 'Ask the centre') return null;
  return ['a', 'b'].reduce((sum, k) => sum + children[k].cost.total, 0);
}
const hasConflict = p => ['a', 'b'].some(k => childComparisonFit(p.children?.[k]).state === 'conflict');
function sortKey(p, sort) {
  if (sort === 'distance') return p.driving?.state === 'available' && Number.isFinite(p.driving.minutes) ? p.driving.minutes : null;
  if (sort === 'price') return familyTotal(p.children ?? {});
  if (sort === 'closing') { const m = toMinutes(p.careEndTimeLabel ?? p.businessHoursLabel); return m === null ? null : -m; }
  return ['a', 'b'].reduce((sum, k) => sum + childConditions(p.children?.[k]).reduce((s, c) => s + (WEIGHT[c?.state] ?? 1), 0), 0);
}
export function familyCompareOrder(items, sort) {
  const available = Object.fromEntries(FAMILY_SORTS.map(s => [s.value, s.value === 'fit' || items.some(p => sortKey(p, s.value) !== null)]));
  const effective = available[sort] ? sort : 'distance' in available && available.distance ? 'distance' : 'fit';
  const keyed = items.map((p, i) => ({ p, i, k: sortKey(p, effective), off: hasConflict(p) }));
  const ordered = [...keyed].sort((a, b) => a.off - b.off || (a.k === null) - (b.k === null) || (a.k ?? 0) - (b.k ?? 0) || a.i - b.i);
  const eligible = keyed.filter(x => !x.off && x.k !== null);
  const min = eligible.length ? Math.min(...eligible.map(x => x.k)) : null;
  const ids = eligible.length >= 2 && !eligible.every(x => x.k === min) ? eligible.filter(x => x.k === min).map(x => x.p.id) : [];
  return { sort: effective, items: ordered.map(x => x.p), best: { ids, label: FAMILY_SORTS.find(s => s.value === effective).best }, available };
}
