import test from 'node:test';
import assert from 'node:assert/strict';
import { trainItemCF, trainImplicitALS, cfScore, matrixScores } from '../shared/collaborative.mjs';
import { FEATURE_VERSION, trainRankNet, dot, ndcg, baselineScore } from '../shared/learning-to-rank.mjs';
import { recordExposure, recordRankingFeedback, cleanSlates, localRanker, exportLearningData, validModel, createMLScorer } from '../shared/recommendation-learning.mjs';
import { emptyInterests, readInterests, recordInterest, personaliseSearchItems, rankSearchResponse } from '../shared/recommendations.mjs';
import { emptyLibrary } from '../shared/saved.mjs';
import { trainRecommendationBundle } from '../scripts/train-recommendations.mjs';

const now = Date.now();
const features = [0, .4, 0, 0, 0, 0, 0, 0], other = [.4, 0, 0, 0, 0, 0, 0, 0];
const slate = (i, overrides = {}) => ({ version: FEATURE_VERSION, id: `search_${i}`, actor: `u_participant_${i % 6}`, careType: 'short_term', at: now - (100 - i) * 3600000,
  items: [{ id: 'bad', features: other, reward: 0, position: 1 }, { id: 'good', features, reward: 3, position: 2 }], ...overrides });
const syntheticUsers = () => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`u_${i}`, i < 6 ? { a: 4, b: 4, c: 2 } : { d: 4, e: 4, f: 2 }]));

test('item CF learns co-preference across users; self/cold/one-user coincidences do not create neighbours', () => {
  const model = trainItemCF({ ...syntheticUsers(), lone: { z: 4, a: 4 } });
  assert.ok(cfScore(model, 'b', [{ id: 'a', weight: 4 }]) > .4);
  assert.equal(cfScore(model, 'd', [{ id: 'a', weight: 4 }]), 0);
  assert.equal(cfScore(model, 'a', [{ id: 'a', weight: 4 }]), 0);
  assert.equal(cfScore(model, 'z', [{ id: 'a', weight: 4 }]), 0);
});

test('implicit ALS learns latent factors and folds in a new browser without exporting users', () => {
  const model = trainImplicitALS(syntheticUsers());
  const scores = matrixScores(model, [{ id: 'a', weight: 4 }]);
  assert.ok(scores.b > scores.d + .2, JSON.stringify(scores));
  assert.deepEqual(matrixScores(model, [{ id: 'unseen', weight: 4 }]), {});
  assert.ok(Object.values(model.factors).flat().every(Number.isFinite));
  assert.ok(!JSON.stringify(model).includes('u_'));
  assert.deepEqual(trainImplicitALS(syntheticUsers()), model, 'deterministic training');
});

test('RankNet learns a preference from labels and improves on held-out slates; no pairs means no model', () => {
  const train = Array.from({ length: 15 }, (_, i) => slate(i));
  const held = [slate(30), slate(31)], ranker = trainRankNet(train);
  assert.ok(dot(ranker.weights, features) > dot(ranker.weights, other));
  assert.ok(ndcg(held, i => dot(ranker.weights, i.features)) > ndcg(held, i => baselineScore(i.features)));
  assert.equal(trainRankNet([slate(0, { items: slate(0).items.map(i => ({ ...i, reward: 0 })) })]), null);
});

test('only observed items receive feedback, rewards use pre-action features, and exports project away private fields', () => {
  let h = { ...emptyInterests(), address: 'PRIVATE', age: 3 };
  h = recordExposure(h, { ...slate(95), items: [slate(95).items[0]], at: now - 1000 }, now);
  h = recordRankingFeedback(h, [{ id: 'good', careType: 'short_term' }], 'save', now, 'search_95');
  assert.equal(h.ranking[0].items.length, 1);
  assert.equal(h.ranking[0].items[0].reward, 0, 'unexposed item cannot label query');
  h = recordRankingFeedback(h, [{ id: 'bad', careType: 'short_term' }], 'save', now, 'search_95');
  h = recordExposure(h, { ...slate(95), at: now - 1000, items: [{ ...slate(95).items[0], features }] }, now);
  assert.equal(h.ranking[0].items[0].reward, 3);
  assert.deepEqual(h.ranking[0].items[0].features, other, 'first impression frozen');
  assert.equal(exportLearningData(h, 'u_example_test', 'live', now).sessions.length, 1, 'latest records are available without waiting');
  const data = exportLearningData(h, 'u_example_test', 'demo', now + 3600000);
  assert.equal(data.provenance, 'synthetic-test');
  const preview = readInterests({ getItem: () => JSON.stringify({ ...h, rankingProvenance: 'synthetic-test' }) }, 'live');
  assert.equal(exportLearningData(preview, 'u_example_test', 'live', now).provenance, 'synthetic-test', 'local real-catalog preview cannot masquerade as real-user training data');
  assert.ok(!JSON.stringify(data).includes('PRIVATE'));
  assert.ok(!JSON.stringify(data).includes('address'));
  assert.deepEqual(recordExposure({ ...h, enabled: false }, slate(3), now).ranking, h.ranking);
  const disabled = { ...h, enabled: false };
  assert.equal(recordRankingFeedback(disabled, [{ id: 'bad', careType: 'short_term' }], 'hide', now, 'search_95'), disabled);
});

test('feedback follows the displayed search even after 30 minutes; unrelated activity cannot label earlier searches', () => {
  const h = { ...emptyInterests(), ranking: [slate(1), slate(2)] };
  const providers = [{ id: 'bad', careType: 'short_term' }];
  assert.equal(recordRankingFeedback(h, providers, 'view', now), h, 'no displayed search context');
  assert.equal(recordRankingFeedback(h, providers, 'view', now, 'missing'), h, 'unknown search context');
  const next = recordRankingFeedback(h, providers, 'view', now, 'search_1');
  assert.equal(next.ranking[0].items[0].reward, 1);
  assert.equal(next.ranking[1].items[0].reward, 0, 'a more recent search is not mistaken for the displayed one');
});

test('local RankNet has no three-search or time gate; independent later validation is still required', () => {
  const ranking = Array.from({ length: 15 }, (_, i) => slate(i));
  const h = { ...emptyInterests(), ranking };
  assert.ok(localRanker(h, 'short_term', now)?.validation.ndcg > .9);
  assert.equal(localRanker({ ...h, ranking: [] }, 'short_term', now), null);
  assert.equal(localRanker({ ...h, ranking: ranking.slice(0, 1) }, 'short_term', now), null, 'one example cannot validate itself');
  const recent = [slate(90, { at: now - 2000 }), slate(91, { at: now - 1000 })];
  const earlyModel = localRanker({ ...h, ranking: recent }, 'short_term', now);
  assert.ok(earlyModel?.validation.ndcg > earlyModel?.validation.baselineNdcg, 'qualifying recent data works without a count or time gate');
  assert.equal(earlyModel.validation.groups, 1, 'latest search is held out');
  const earlyHistory = last => ({ ...h, ranking: [recent[0], last] });
  assert.equal(localRanker(earlyHistory({ ...recent[1], at: recent[0].at }), 'short_term', now), null, 'equal timestamps cannot leak across train and validation');
  assert.equal(localRanker(earlyHistory({ ...recent[1], items: recent[1].items.map(i => ({ ...i, reward: 0 })) }), 'short_term', now), null, 'no independent feedback to validate');
  assert.equal(localRanker(earlyHistory({ ...recent[1], items: recent[1].items.map(i => ({ ...i, reward: i.id === 'bad' ? 3 : 0 })) }), 'short_term', now), null, 'failed validation keeps the fallback');
  assert.equal(localRanker({ ...h, enabled: false }, 'short_term', now), null);
  assert.equal(localRanker(h, 'regular', now), null);
  assert.equal(localRanker(h, 'short_term', now + 61 * 86400000), null);
  const reversedHoldout = ranking.map((s, i) => i < 12 ? s : { ...s, items: s.items.map(x => ({ ...x, reward: x.id === 'bad' ? 3 : 0 })) });
  assert.equal(localRanker({ ...h, ranking: reversedHoldout }, 'short_term', now), null, 'regressing holdout rejects model');
});

test('first-use preferences and the first view/compare/save affect the next search without moving the current results', () => {
  const p = id => ({ id, name: id, careType: 'short_term', location: { lat: 3, lng: 101 }, distanceKm: 1,
    phone: { display: '123' }, fit: { counts: { conflict: 0 }, conditions: [{ id: 'care', state: 'supported' }] } });
  const a = p('a'), b = p('b');
  const response = { items: [a, b], request: { careType: 'short_term', sort: 'recommended', radius: 10 }, total: 2 };
  const personal = { history: emptyInterests(), library: emptyLibrary(), now };
  const original = rankSearchResponse(response, personal);
  assert.deepEqual(original.items.map(i => i.id), ['a', 'b']);
  const viewed = recordInterest(personal.history, [b], 'view', new Date(now).toISOString());
  assert.equal(localRanker(viewed, 'short_term', now), null, 'profile learning does not need RankNet');
  const afterView = rankSearchResponse(response, { ...personal, history: viewed });
  assert.equal(afterView.items[0].id, 'b', 'first view affects the next ranking immediately');
  const compared = recordInterest(personal.history, [b], 'compare', new Date(now).toISOString());
  const afterCompare = rankSearchResponse(response, { ...personal, history: compared });
  const afterSave = rankSearchResponse(response, { ...personal, library: { ...personal.library, favourites: [{ id: 'b', careType: 'short_term' }] } });
  assert.ok(afterCompare.items[0].rerankScore > afterView.items[0].rerankScore);
  assert.ok(afterSave.items[0].rerankScore > afterCompare.items[0].rerankScore);
  assert.deepEqual(original.items.map(i => i.id), ['a', 'b'], 'current page remains unchanged');
  assert.deepEqual(response.items.map(i => i.id), ['a', 'b'], 'raw response is not mutated');
  const preferred = { ...b, reviewTopics: { communication: { state: 'supported', reviewCount: 3, recentCount: 3, positiveCount: 3 } } };
  assert.equal(rankSearchResponse({ ...response, items: [a, preferred] }, { ...personal,
    history: { ...emptyInterests(), preferences: ['responsive_team'] } }).items[0].id, 'b', 'onboarding preference works with zero searches or feedback');
});

test('storage rejects poisoned vectors and unsafe IDs; mode boundary and clear history retain existing behavior', () => {
  const bad = { ...slate(1), items: [{ ...slate(1).items[0], id: '__proto__' }, { ...slate(1).items[1], features: [Infinity] }] };
  assert.equal(cleanSlates([bad], now)[0].items.length, 0);
  const h = { ...emptyInterests(), ranking: [slate(1)], rankingActor: 'u_anonymous_export' };
  const storage = { getItem: key => key.endsWith(':live') ? JSON.stringify(h) : null };
  assert.equal(readInterests(storage, 'live').ranking.length, 1);
  assert.deepEqual(readInterests(storage, 'demo'), emptyInterests());
});

test('offline pipeline has disjoint chronological stages and synthetic candidates can never run as production models', () => {
  const sessions = Array.from({ length: 60 }, (_, i) => slate(i, { items: [
    { id: 'bad', features: other, reward: 0, position: 1 },
    ...['good', 'better', 'best'].map((id, k) => ({ id, features, reward: 3, position: k + 2 }))] }));
  const data = { schema: 'ep-interactions-v1', featureVersion: FEATURE_VERSION, provenance: 'synthetic-test', sessions };
  const model = trainRecommendationBundle(data);
  assert.equal(model.validation.historySlates + model.validation.trainSlates + model.validation.testSlates, 60);
  assert.ok(model.validation.passed, JSON.stringify(model.validation));
  assert.equal(validModel({ ...model, status: 'approved' }, 'short_term'), false);
  const real = { ...model, status: 'approved', provenance: 'consented-interactions' };
  assert.ok(validModel(real, 'short_term'));
  assert.equal(validModel(real, 'regular'), false);
  assert.equal(validModel(real, 'short_term', now + 91 * 86400000), false);
  assert.equal(validModel({ ...real, mf: { ...real.mf, factors: { good: [NaN] } } }, 'short_term'), false);
  assert.throws(() => trainRecommendationBundle({ ...data, sessions: [...sessions, sessions[0]] }), /Duplicate/);
});

test('learned ranker affects Recommended but cannot override conflicts, contact groups, manual sorts or opt-out', () => {
  const history = { ...emptyInterests(), ranking: Array.from({ length: 3 }, (_, i) => slate(i)) };
  const score = createMLScorer({ history, careType: 'short_term', seeds: [], now });
  assert.equal(score('p', { known: .4 }).source, 'local-ranknet');
  assert.ok(score('p', { known: .4 }).delta > score('p', { distance: .4 }).delta);
  const provider = (id, conflict = 0, phone = true) => ({ id, name: id, careType: 'short_term', location: { lat: 3, lng: 101 }, distanceKm: 1, phone: phone ? { display: '123' } : null,
    fit: { counts: { conflict }, conditions: [{ id: 'care', state: 'supported' }] } });
  const items = [provider('bad', 1), provider('good'), provider('noPhone', 0, false)];
  const opts = { items, request: { careType: 'short_term', sort: 'recommended', radius: 10 }, history, library: emptyLibrary(), now };
  const result = personaliseSearchItems(opts);
  assert.equal(result[0].id, 'good');
  assert.equal(result.at(-1).id, 'bad');
  assert.equal(result.at(-1).learningFeatures, null);
  assert.deepEqual(personaliseSearchItems({ ...opts, request: { ...opts.request, sort: 'price' } }).map(p => p.id), items.map(p => p.id));
  assert.equal(createMLScorer({ history: { ...history, enabled: false }, careType: 'short_term', seeds: [], now })('good', { known: .4 }).delta, 0);
});
