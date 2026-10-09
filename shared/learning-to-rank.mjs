// Linear RankNet: learn pairwise preferences with logistic loss and L2
// regularisation. This is a trained ranker, not LambdaMART or a neural network.
export const FEATURE_VERSION = 'ep-ranking-v1';
export const FEATURES = ['distance', 'known', 'preferences', 'learned', 'similarity', 'familiarity', 'itemCF', 'matrixFactor'];
export const dot = (a, b) => a.reduce((n, v, i) => n + v * (b[i] ?? 0), 0);
export const validFeatures = x => Array.isArray(x) && x.length === FEATURES.length && x.every(v => Number.isFinite(v) && Math.abs(v) <= 1);
export const baselineScore = x => x.slice(0, 6).reduce((a, b) => a + b, 0);
export const INITIAL_WEIGHTS = [1, 1, 1, 1, 1, 1, 0, 0];
export function preferencePairs(slates) {
  const pairs = [];
  for (const slate of slates) {
    const group = [];
    for (const a of slate.items) for (const b of slate.items) {
      if (a.reward > b.reward && validFeatures(a.features) && validFeatures(b.features))
        group.push({ x: a.features.map((v, i) => v - b.features[i]), weight: Math.min(3, a.reward - b.reward) });
    }
    // One busy page must not dominate many independent searches. An exposed,
    // unchosen item is only a weak relative comparison, never an explicit dislike.
    for (const p of group) pairs.push({ ...p, weight: p.weight / Math.max(1, group.length) });
  }
  return pairs;
}
export function trainRankNet(slates, { epochs = 100, rate = .3, regularisation = .03, initialWeights = INITIAL_WEIGHTS } = {}) {
  if (!Array.isArray(initialWeights) || initialWeights.length !== FEATURES.length || initialWeights.some(w => !Number.isFinite(w) || Math.abs(w) > 4)) throw Error('Invalid initial ranking weights');
  const pairs = preferencePairs(slates);
  if (!pairs.length) return null;
  const weights = [...initialWeights];
  const groups = Math.max(1, slates.filter(s => s.items.some(i => i.reward > 0)).length);
  for (let epoch = 0; epoch < Math.min(200, epochs); epoch++) {
    const gradient = weights.map((w, i) => regularisation * (w - initialWeights[i]));
    for (const p of pairs) {
      const error = -1 / (1 + Math.exp(Math.max(-30, Math.min(30, dot(weights, p.x)))));
      p.x.forEach((v, i) => { gradient[i] += p.weight * error * v / groups; });
    }
    weights.forEach((w, i) => { weights[i] = Math.max(-4, Math.min(4, w - rate * gradient[i])); });
  }
  return { algorithm: 'linear-ranknet', featureVersion: FEATURE_VERSION, weights, pairs: pairs.length, groups };
}
export function ndcg(slates, score, k = 10) {
  const values = slates.filter(s => s.items.some(i => i.reward > 0)).map(s => {
    const dcg = rows => rows.slice(0, k).reduce((sum, x, i) => sum + (2 ** x.reward - 1) / Math.log2(i + 2), 0);
    const ranked = [...s.items].sort((a, b) => score(b, s) - score(a, s) || a.position - b.position);
    return dcg(ranked) / dcg([...s.items].sort((a, b) => b.reward - a.reward));
  });
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
