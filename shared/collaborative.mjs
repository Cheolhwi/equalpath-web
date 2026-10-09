// Two distinct collaborative models over a user × item implicit-feedback
// matrix. Only item aggregates/factors are exported; never user factors/IDs.
import { dot } from './learning-to-rank.mjs';
const vector = k => Array(k).fill(0);
export function trainItemCF(users, minSupport = 3) {
  const norms = {}, pairs = {}, counts = {};
  for (const values of Object.values(users)) {
    const entries = Object.entries(values).filter(([, v]) => v > 0);
    for (const [id, v] of entries) { norms[id] = (norms[id] ?? 0) + v * v; counts[id] = (counts[id] ?? 0) + 1; }
    for (const [a, av] of entries) for (const [b, bv] of entries) if (a < b) {
      const key = JSON.stringify([a, b]), p = pairs[key] ??= { sum: 0, count: 0 };
      p.sum += av * bv; p.count++;
    }
  }
  const neighbours = {};
  for (const [key, p] of Object.entries(pairs)) if (p.count >= minSupport) {
    const [a, b] = JSON.parse(key), similarity = p.sum / Math.sqrt(norms[a] * norms[b]) * p.count / (p.count + 5);
    (neighbours[a] ??= []).push([b, similarity]); (neighbours[b] ??= []).push([a, similarity]);
  }
  for (const list of Object.values(neighbours)) list.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).splice(20);
  return { algorithm: 'item-cosine-shrinkage', neighbours, counts, minSupport };
}
export function cfScore(model, id, seeds) {
  let sum = 0, weight = 0;
  for (const s of seeds) if (s.id !== id) {
    const value = model?.neighbours?.[s.id]?.find(([other]) => other === id)?.[1];
    if (Number.isFinite(value)) { sum += s.weight * value; weight += s.weight; }
  }
  return weight ? sum / weight : 0;
}
// Ridge normal equations, solved using pivoted Gaussian elimination. The
// positive regularisation makes the implicit-ALS matrices positive definite.
function solve(matrix, rhs) {
  const a = matrix.map((row, i) => [...row, rhs[i]]), n = rhs.length;
  for (let j = 0; j < n; j++) {
    let pivot = j;
    for (let i = j + 1; i < n; i++) if (Math.abs(a[i][j]) > Math.abs(a[pivot][j])) pivot = i;
    [a[j], a[pivot]] = [a[pivot], a[j]];
    if (Math.abs(a[j][j]) < 1e-10) return vector(n);
    const d = a[j][j]; for (let k = j; k <= n; k++) a[j][k] /= d;
    for (let i = 0; i < n; i++) if (i !== j) {
      const factor = a[i][j]; for (let k = j; k <= n; k++) a[i][k] -= factor * a[j][k];
    }
  }
  return a.map(row => row[n]);
}
export function foldIn(factors, values, { dimensions = 8, alpha = 8, regularisation = .2 } = {}) {
  const k = dimensions, a = Array.from({ length: k }, (_, i) => vector(k).map((_, j) => i === j ? regularisation : 0)), b = vector(k);
  for (const [id, y] of Object.entries(factors)) {
    const r = Math.max(0, values[id] ?? 0), c = 1 + alpha * r;
    for (let i = 0; i < k; i++) {
      if (r) b[i] += c * y[i];
      for (let j = 0; j < k; j++) a[i][j] += c * y[i] * y[j];
    }
  }
  return solve(a, b);
}
export function trainImplicitALS(users, { dimensions = 8, iterations = 15, minSupport = 3, ...params } = {}) {
  const counts = {}, byItem = {};
  for (const [uid, values] of Object.entries(users)) for (const [id, weight] of Object.entries(values)) if (weight > 0) {
    counts[id] = (counts[id] ?? 0) + 1; (byItem[id] ??= {})[uid] = weight;
  }
  const ids = Object.keys(counts).filter(id => counts[id] >= minSupport).sort();
  let seed = 83;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296 - .5; };
  let factors = Object.fromEntries(ids.map(id => [id, Array.from({ length: dimensions }, () => random() * .1)]));
  const config = { dimensions, alpha: 8, regularisation: .2, ...params };
  for (let step = 0; step < iterations; step++) {
    const u = Object.fromEntries(Object.entries(users).map(([id, values]) => [id, foldIn(factors, values, config)]));
    factors = Object.fromEntries(ids.map(id => [id, foldIn(u, byItem[id], config)]));
  }
  return { algorithm: 'implicit-als', ...config, factors, counts, minSupport };
}
export function matrixScores(model, seeds) {
  if (!model?.factors || !seeds.some(s => model.factors[s.id])) return {};
  const values = Object.fromEntries(seeds.filter(s => s.weight > 0).map(s => [s.id, s.weight]));
  const user = foldIn(model.factors, values, model);
  return Object.fromEntries(Object.entries(model.factors).map(([id, y]) => [id, Math.max(-1, Math.min(1, dot(user, y)))]));
}
