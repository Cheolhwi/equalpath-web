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

export function childComparisonFit(p) {
  const conditions = CHILD_CHECKS.map(id => p?.fit?.conditions?.find(c => c.id === id));
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
