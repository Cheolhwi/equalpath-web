import { personaliseSearchItems, recordInterest } from './recommendations.mjs';
import { KIDS, hasConflict } from './two-child.mjs';

// Both children share a search timestamp: chronological training/validation
// must never treat siblings from one search as independent searches.
export function rankFamilyResults(responses, personal, { id, at, mode }) {
  const results = { version: responses.a.version, mode, learningSlates: {} };
  for (const k of KIDS) {
    const res = responses[k];
    const items = (res.items ?? []).filter(p => !hasConflict(p));
    results[k] = personal ? personaliseSearchItems({ ...personal, items,
      seeds: res.seeds ?? [], request: res.request, now: at }) : items;
    results.learningSlates[k] = { id: `${id}_${k}`, at };
  }
  return results;
}

const childrenFor = role => role === 'ab' ? KIDS : KIDS.includes(role) ? [role] : [];
export function familyLearningSlateIds(results, role = 'ab') {
  return childrenFor(role).map(k => results?.learningSlates?.[k]?.id).filter(Boolean);
}

export function recordFamilyOptionView(history, results, option, now = Date.now()) {
  // Selecting a plan is weak interest in its assigned centres, not a save or
  // confirmation that both children can attend every centre in the pair.
  return KIDS.reduce((next, k) => option?.[k]
    ? recordInterest(next, [option[k]], 'view', new Date(now).toISOString(), familyLearningSlateIds(results, k))
    : next, history);
}

// A pair card exposes its two displayed branches; a map card exposes only its
// labelled child(ren). Features always come from that child's search snapshot.
export function familyRankingExposures(results, dataset) {
  const pairs = dataset.providerId
    ? childrenFor(dataset.familyRole).map(k => [k, dataset.providerId])
    : KIDS.map(k => [k, dataset[k === 'a' ? 'familyProviderA' : 'familyProviderB']]);
  return pairs.flatMap(([k, id]) => {
    const slate = results?.learningSlates?.[k];
    const index = results?.[k]?.findIndex(p => p.id === id) ?? -1;
    const p = results?.[k]?.[index];
    if (!slate || !p?.learningFeatures || hasConflict(p) || p.fit?.counts?.conflict) return [];
    return [{ ...slate, careType: p.careType, items: [{ id: p.id,
      features: p.learningFeatures, position: index + 1 }] }];
  });
}
