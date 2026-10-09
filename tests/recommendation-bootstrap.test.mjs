import test from 'node:test';
import assert from 'node:assert/strict';
import bootstrap from '../shared/recommendation-bootstrap.json' with { type: 'json' };
import { createMLScorer, localRanker, rankAdjustment, validBootstrap } from '../shared/recommendation-learning.mjs';
import { emptyInterests, rankSearchResponse } from '../shared/recommendations.mjs';
import { emptyLibrary } from '../shared/saved.mjs';
import { FEATURE_VERSION, trainRankNet } from '../shared/learning-to-rank.mjs';

test('shipped initial weights affect all ten first-search candidates without fabricated browser history', () => {
  const provider = (id, distanceKm, supported) => ({ id, name: id, careType: 'short_term', location: { lat: 3, lng: 101 }, distanceKm,
    phone: { display: '123' }, fit: { counts: { conflict: 0 }, conditions: [
      { id: 'care', state: 'supported' }, { id: 'admission', state: supported ? 'supported' : 'unknown' }] } });
  const response = { request: { careType: 'short_term', sort: 'recommended', radius: 10 }, total: 10,
    items: [provider('more-known', 5.4, true), provider('nearer', 1, false),
      ...Array.from({ length: 8 }, (_, i) => provider(`other-${i}`, 8 + i / 10, false))] };
  const personal = { history: emptyInterests(), library: emptyLibrary() };
  const before = JSON.stringify(personal);
  const control = rankSearchResponse(response, { ...personal, bootstrapModel: null });
  const live = rankSearchResponse(response, personal);
  assert.equal(control.items[0].id, 'more-known');
  assert.equal(live.items[0].id, 'nearer', 'model changes real pipeline ordering from the very first search');
  assert.equal(live.items.length, 10);
  assert.ok(live.items.every(p => p.rankingModel === 'bootstrap-ranknet'));
  assert.equal(JSON.stringify(personal), before, 'no fake searches, saves or profiles are inserted');
  assert.ok(live.items.every(p => !p.personalised), 'a generic prior does not invent personal reasons');
  assert.deepEqual(rankSearchResponse({ ...response, request: { ...response.request, sort: 'nearest' } }, personal).items.map(p => p.id), response.items.map(p => p.id));
});

test('initial model is bounded, restricted to short care and honours learning opt-out', () => {
  assert.ok(validBootstrap(bootstrap, 'short_term'));
  assert.equal(validBootstrap(bootstrap, 'regular'), false);
  assert.equal(validBootstrap({ ...bootstrap, provenance: 'consented-interactions' }, 'short_term'), false);
  assert.equal(validBootstrap({ ...bootstrap, ranker: { ...bootstrap.ranker, weights: [NaN] } }, 'short_term'), false);
  const score = opts => createMLScorer({ history: emptyInterests(), seeds: [], careType: 'short_term', ...opts })('p', { distance: .4, known: .4 });
  assert.equal(score({}).source, 'bootstrap-ranknet');
  assert.ok(Math.abs(score({}).delta) <= .12);
  assert.equal(score({ history: { ...emptyInterests(), enabled: false } }).delta, 0);
  assert.equal(score({ careType: 'regular' }).delta, 0);
  assert.equal(score({ bootstrapModel: { ...bootstrap, status: 'rejected' } }).delta, 0);
});

test('personal training starts at shipped weights and replaces the prior only after independent validation', () => {
  const now = Date.now();
  const features = [0, .4, 0, 0, 0, 0, 0, 0], other = [.4, 0, 0, 0, 0, 0, 0, 0];
  const ranking = Array.from({ length: 15 }, (_, i) => ({ version: FEATURE_VERSION, id: `feedback_${i}`, careType: 'short_term', at: now - (20 - i) * 1000,
    items: [{ id: 'near', features: other, reward: 0, position: 1 }, { id: 'known', features, reward: 3, position: 2 }] }));
  const h = { ...emptyInterests(), ranking };
  const model = localRanker(h, 'short_term', now, bootstrap.ranker);
  assert.ok(model);
  assert.deepEqual(model.weights, trainRankNet(ranking.slice(0, 12), { initialWeights: bootstrap.ranker.weights }).weights);
  const result = createMLScorer({ history: h, seeds: [], careType: 'short_term', now })('known', { known: .4 });
  assert.equal(result.source, 'local-ranknet');
  assert.ok(Math.abs(result.delta - rankAdjustment(model, features)) < 1e-12, 'prior is not counted twice');
  const insufficient = createMLScorer({ history: { ...h, ranking: ranking.slice(0, 1) }, seeds: [], careType: 'short_term', now });
  assert.equal(insufficient('known', { known: .4 }).source, 'bootstrap-ranknet');
});
