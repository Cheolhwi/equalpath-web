import bundledModel from './recommendation-model.json' with { type: 'json' };
import bundledBootstrap from './recommendation-bootstrap.json' with { type: 'json' };
import { FEATURE_VERSION, FEATURES, validFeatures, trainRankNet, dot, baselineScore, ndcg, INITIAL_WEIGHTS } from './learning-to-rank.mjs';
import { cfScore, matrixScores } from './collaborative.mjs';

const DAY = 86400000;
const safeId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(x) && !['__proto__', 'constructor', 'prototype'].includes(x);
const careType = x => ['short_term', 'regular'].includes(x);
export const REWARDS = { view: 1, compare: 2, save: 3, hide: -1 };
export function cleanSlates(input, now = Date.now()) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input.filter(s => s?.version === FEATURE_VERSION && safeId(s.id) && careType(s.careType) &&
    Number.isFinite(s.at) && s.at <= now && s.at >= now - 60 * DAY && Array.isArray(s.items))
    .filter(s => !seen.has(s.id) && seen.add(s.id)).slice(-60).map(s => {
      const ids = new Set();
      return { version: FEATURE_VERSION, id: s.id, at: s.at, careType: s.careType,
        items: s.items.filter(i => safeId(i?.id) && validFeatures(i.features) && Number.isInteger(i.position) && i.position >= 1 && i.position <= 20)
          .filter(i => !ids.has(i.id) && ids.add(i.id)).slice(0, 20).map(i => ({ id: i.id, features: [...i.features], position: i.position,
            reward: [-1, 0, 1, 2, 3].includes(i.reward) ? i.reward : 0 })) };
    });
}
export function recordExposure(history, { id, at, careType: type, items }, now = Date.now()) {
  if (!history.enabled) return history;
  const incoming = cleanSlates([{ version: FEATURE_VERSION, id, at, careType: type, items: items.map(i => ({ ...i, reward: 0 })) }], now)[0];
  if (!incoming?.items.length) return history;
  const slates = cleanSlates(history.ranking, now), previous = slates.find(s => s.id === id);
  if (previous) {
    const extra = incoming.items.filter(i => !previous.items.some(p => p.id === i.id));
    if (!extra.length) return history;
    previous.items = [...previous.items, ...extra].slice(0, 20);
  } else slates.push(incoming);
  return { ...history, ranking: slates.slice(-60) };
}
export function recordRankingFeedback(history, providers, kind, now = Date.now(), slateId) {
  if (!history.enabled || !(kind in REWARDS) || !safeId(slateId)) return history;
  const slates = cleanSlates(history.ranking, now);
  let changed = false;
  for (const p of providers) {
    // Attribute to the actual displayed search, not a time window or an old
    // search that happened to contain the same branch. Other-page activity
    // still updates the interest profile without inventing a ranking label.
    const slate = slates.find(s => s.id === slateId && s.careType === p.careType && s.items.some(i => i.id === p.id));
    const item = slate?.items.find(i => i.id === p.id);
    if (!item) continue;
    const reward = kind === 'hide' ? -1 : Math.max(item.reward, REWARDS[kind]);
    if (reward !== item.reward) { item.reward = reward; changed = true; }
  }
  return changed ? { ...history, ranking: slates } : history;
}
const localCache = new WeakMap();
export function localRanker(history, type, now = Date.now(), prior = null) {
  if (!history.enabled || !Array.isArray(history.ranking)) return null;
  const initialWeights = prior ? [...prior.weights.slice(0, 6), 0, 0] : INITIAL_WEIGHTS;
  const key = `${type}:${Math.floor(now / 60000)}:${initialWeights.join(',')}`;
  const cache = localCache.get(history.ranking);
  if (cache?.key === key) return cache.value;
  // Personalisation starts with explicit preferences and every valid action.
  // Model fitting is separate: keep a later independent validation partition,
  // with no fixed search-count threshold or waiting period. Only a new search
  // consumes this model; feedback cannot reorder the currently displayed one.
  const slates = cleanSlates(history.ranking, now).filter(s => s.careType === type &&
    s.items.length >= 2 && new Set(s.items.map(i => i.reward)).size > 1).sort((a, b) => a.at - b.at);
  let value = null;
  const boundary = slates[Math.floor(slates.length * .8)]?.at;
  const train = slates.filter(s => s.at < boundary), test = slates.filter(s => s.at >= boundary);
  if (train.length && test.length) {
    const ranker = trainRankNet(train.map(s => ({ ...s, items: s.items.map(i => ({ ...i, features: [...i.features.slice(0, 6), 0, 0] })) })), { initialWeights });
    const baseline = ndcg(test, i => baselineScore(i.features) + rankAdjustment(prior, [...i.features.slice(0, 6), 0, 0]));
    const metric = ranker && ndcg(test, i => baselineScore(i.features) + rankAdjustment(ranker, [...i.features.slice(0, 6), 0, 0]));
    if (metric > baseline + .001) value = { ...ranker, validation: { groups: test.length, baselineNdcg: baseline, ndcg: metric } };
  }
  localCache.set(history.ranking, { key, value });
  return value;
}
export function validModel(model, type, now = Date.now()) {
  if (model?.schema !== 'ep-collaborative-v1' || model.featureVersion !== FEATURE_VERSION || model.status !== 'approved' ||
      model.provenance !== 'consented-interactions' || model.careType !== type || !Number.isFinite(Date.parse(model.trainedAt)) ||
      Date.parse(model.trainedAt) > now || now - Date.parse(model.trainedAt) > 90 * DAY) return false;
  const neighbours = model.cf?.neighbours, mf = model.mf, weights = model.ranker?.weights;
  return neighbours && Object.keys(neighbours).length <= 500 && Object.entries(neighbours).every(([id, list]) => safeId(id) && Array.isArray(list) && list.length <= 20 && list.every(x => Array.isArray(x) && safeId(x[0]) && Number.isFinite(x[1]) && x[1] >= 0 && x[1] <= 1)) &&
    mf?.dimensions === 8 && mf.alpha === 8 && mf.regularisation === .2 && mf.factors && Object.keys(mf.factors).length <= 500 &&
    Object.entries(mf.factors).every(([id, v]) => safeId(id) && Array.isArray(v) && v.length === 8 && v.every(x => Number.isFinite(x) && Math.abs(x) < 100)) &&
    Array.isArray(weights) && weights.length === FEATURES.length && weights.every(x => Number.isFinite(x) && Math.abs(x) <= 4) &&
    model.validation?.passed === true;
}
export const rankAdjustment = (ranker, features) => ranker ? .12 * Math.tanh(dot(ranker.weights.map((w, i) => w - INITIAL_WEIGHTS[i]), features)) : 0;
// This explicitly authorised synthetic prior is separate from a consented
// collaborative model. It supplies weights, never fake users or user history.
export function validBootstrap(model, type) {
  return model?.schema === 'ep-ranknet-bootstrap-v1' && model.featureVersion === FEATURE_VERSION &&
    model.provenance === 'synthetic-bootstrap' && model.status === 'approved' && model.careType === type &&
    model.ranker?.algorithm === 'linear-ranknet' && model.ranker.featureVersion === FEATURE_VERSION && Array.isArray(model.ranker.weights) &&
    model.ranker.weights.length === FEATURES.length && model.ranker.weights.every(w => Number.isFinite(w) && Math.abs(w) <= 4) &&
    model.ranker.weights.slice(6).every(w => w === 0) && model.validation?.passed === true &&
    model.validation.ndcg > model.validation.baselineNdcg + .001;
}
export function createMLScorer({ history, seeds, careType: type, now = Date.now(), model = bundledModel, bootstrapModel = bundledBootstrap }) {
  const enabled = history.enabled, accepted = enabled && validModel(model, type, now);
  const bootstrap = enabled && validBootstrap(bootstrapModel, type) ? bootstrapModel.ranker : null;
  const prior = accepted ? model.ranker : bootstrap;
  const local = enabled ? localRanker(history, type, now, prior) : null;
  const factors = accepted ? matrixScores(model.mf, seeds) : {};
  return (id, parts) => {
    const cf = accepted ? cfScore(model.cf, id, seeds) : 0, mf = factors[id] ?? 0;
    const features = [...FEATURES.slice(0, 6).map(k => parts[k] ?? 0), cf, mf];
    // Learned weights choose how much collaborative signals matter. Local
    // models were trained against their own pre-action snapshots only.
    const globalDelta = rankAdjustment(prior, features);
    // A personal model replaces the initial weights; do not count the prior twice.
    const localFeatures = [...features.slice(0, 6), 0, 0];
    const localDelta = local ? rankAdjustment(local, localFeatures) - rankAdjustment(prior, localFeatures) : 0;
    return { features, delta: Math.max(-.18, Math.min(.18, globalDelta + localDelta)),
      source: local ? 'local-ranknet' : accepted ? 'collaborative-ranknet' : bootstrap ? 'bootstrap-ranknet' : 'cold-start', cf, mf };
  };
}

export function exportLearningData(history, actor, mode, now = Date.now()) {
  if (!safeId(actor) || !['live', 'demo'].includes(mode)) throw Error('Invalid export');
  // Projection only: never serialise the surrounding history/request objects.
  return { schema: 'ep-interactions-v1', featureVersion: FEATURE_VERSION, provenance: mode === 'live' && history.rankingProvenance !== 'synthetic-test' ? 'consented-interactions' : 'synthetic-test',
    sessions: cleanSlates(history.ranking, now).map(s => ({ ...s, actor })) };
}
