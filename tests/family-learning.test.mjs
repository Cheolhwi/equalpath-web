import test from 'node:test';
import assert from 'node:assert/strict';
import { rankFamilyResults, familyLearningSlateIds, familyRankingExposures, recordFamilyOptionView } from '../shared/family-learning.mjs';
import { emptyInterests, recordInterest, readInterests } from '../shared/recommendations.mjs';
import { emptyLibrary } from '../shared/saved.mjs';
import { recordExposure, recordRankingFeedback, localRanker, exportLearningData } from '../shared/recommendation-learning.mjs';
import { buildOptions } from '../shared/two-child.mjs';

const now = Date.now();
const provider = (id, extra = {}) => ({ id, name: id, careType: 'short_term', location: { lat: 3, lng: 101 }, distanceKm: 1,
  phone: { display: '123' }, fit: { counts: { conflict: 0 }, conditions: [{ id: 'care', state: 'supported' }] }, ...extra });
const response = (items, age = '3') => ({ version: 'test', items, request: { careType: 'short_term', sort: 'recommended', radius: 10, age } });
const responses = () => ({ a: response([provider('first'), provider('later')]), b: response([provider('first'), provider('later')], '5') });
const personal = () => ({ history: emptyInterests(), library: emptyLibrary() });
const ranked = (data = responses(), prefs = personal(), i = 0) => rankFamilyResults(data, prefs, { id: `family_${i}`, at: now - 10000 + i * 100, mode: 'live' });
const expose = (h, results, dataset) => familyRankingExposures(results, dataset).reduce((next, slate) => recordExposure(next, slate, now), h);
const reward = (h, k, id, i = 0) => h.ranking.find(s => s.id === `family_${i}_${k}`)?.items.find(p => p.id === id)?.reward;

test('family exposure keeps separate pre-action features for each child and only records rendered branches', () => {
  const data = responses();
  data.b.items[0].fit.conditions.push({ id: 'opening', state: 'unknown' });
  const results = ranked(data);
  assert.equal(results.learningSlates.a.at, results.learningSlates.b.at);
  assert.notDeepEqual(results.a[0].learningFeatures, results.b.find(p => p.id === 'first').learningFeatures);
  let h = expose(emptyInterests(), results, { familyProviderA: 'first', familyProviderB: 'later' });
  assert.deepEqual(h.ranking.map(s => s.items.map(p => p.id)), [['first'], ['later']]);
  assert.equal(expose(h, results, { familyProviderA: 'first', familyProviderB: 'later' }), h, 'repeated pair/map cards do not duplicate impressions');
  h = expose(h, results, { providerId: 'first', familyRole: 'ab' });
  assert.deepEqual(h.ranking[1].items.find(p => p.id === 'first').features, results.b.find(p => p.id === 'first').learningFeatures);
  assert.deepEqual(familyRankingExposures(results, { providerId: 'first' }), [], 'an unrelated card is not a family impression');
  assert.deepEqual(familyRankingExposures(results, { familyProviderA: 'never_returned' }), []);
});

test('Details, actual comparison and successful save use the displayed child context and maximum reward', () => {
  const results = ranked();
  let h = expose(emptyInterests(), results, { providerId: 'later', familyRole: 'ab' });
  h = recordInterest(h, [provider('later')], 'view', new Date(now).toISOString(), familyLearningSlateIds(results, 'b'));
  assert.equal(reward(h, 'a', 'later'), 0);
  assert.equal(reward(h, 'b', 'later'), 1);
  h = recordInterest(h, [provider('later'), provider('first')], 'compare', new Date(now).toISOString(), familyLearningSlateIds(results));
  assert.deepEqual(['a', 'b'].map(k => reward(h, k, 'later')), [1.25, 1.25]);
  assert.equal(reward(h, 'a', 'first'), undefined, 'comparison cannot invent a missing impression');
  h = recordRankingFeedback(h, [provider('later')], 'save', now, familyLearningSlateIds(results, 'a'));
  assert.deepEqual(['a', 'b'].map(k => reward(h, k, 'later')), [3, 1.25]);
  assert.equal(recordRankingFeedback(h, [provider('later')], 'view', now, familyLearningSlateIds(results)), h, 'repeated weaker actions do not inflate rewards');
  const older = ranked(responses(), personal(), 1);
  h = expose(h, older, { providerId: 'later', familyRole: 'ab' });
  h = recordRankingFeedback(h, [provider('later')], 'save', now, familyLearningSlateIds(results));
  assert.deepEqual(['a', 'b'].map(k => reward(h, k, 'later', 1)), [0, 0], 'never attribute to a different search');
});

test('opening a plan is weak feedback only for the assigned child and repeated views do not inflate it', () => {
  const results = ranked();
  let h = emptyInterests();
  for (const id of ['first', 'later']) h = expose(h, results, { providerId: id, familyRole: 'ab' });
  const option = { a: results.a.find(p => p.id === 'first'), b: results.b.find(p => p.id === 'later') };
  h = recordFamilyOptionView(h, results, option, now);
  assert.deepEqual(['first', 'later'].map(id => reward(h, 'a', id)), [1, 0]);
  assert.deepEqual(['first', 'later'].map(id => reward(h, 'b', id)), [0, 1]);
  assert.deepEqual(recordFamilyOptionView(h, results, option, now), h);
  const off = { ...h, enabled: false };
  assert.equal(recordFamilyOptionView(off, results, option, now), off);
});

test('ages and full hours are filtered per child before ranking, combinations and feedback', () => {
  const conflict = (id, condition) => provider(id, { fit: { counts: { conflict: 1 }, conditions: [{ id: condition, state: 'conflict' }] } });
  const data = { a: response([conflict('too_young', 'age'), conflict('closed', 'opening'), provider('ok')]),
    b: response([provider('too_young'), provider('closed'), provider('ok')]) };
  const results = ranked(data, { ...personal(), library: { ...emptyLibrary(), favourites: [{ id: 'closed', careType: 'short_term' }] } });
  assert.deepEqual(results.a.map(p => p.id), ['ok']);
  assert.ok(results.b.some(p => p.id === 'closed'), 'a branch may still fit the other child');
  assert.ok(buildOptions(results).all.every(o => o.a.id === 'ok'));
  let h = expose(emptyInterests(), results, { providerId: 'closed', familyRole: 'ab' });
  h = recordRankingFeedback(h, [provider('closed')], 'save', now, familyLearningSlateIds(results));
  assert.equal(reward(h, 'a', 'closed'), undefined);
  assert.equal(reward(h, 'b', 'closed'), 3);
});

test('first family Details feedback changes the next two child lists, leaving the existing result snapshot frozen', () => {
  const prefs = personal(), data = responses(), results = ranked(data, prefs), before = JSON.stringify(results);
  let h = expose(prefs.history, results, { providerId: 'later', familyRole: 'ab' });
  h = recordInterest(h, [provider('later')], 'view', new Date(now).toISOString(), familyLearningSlateIds(results));
  const next = ranked(data, { ...prefs, history: h }, 1);
  assert.deepEqual([next.a[0].id, next.b[0].id], ['later', 'later']);
  assert.equal(JSON.stringify(results), before);
  assert.deepEqual(data.a.items.map(p => p.id), ['first', 'later']);
});

test('family-only feedback trains a validated personal RankNet; one family search cannot validate itself', () => {
  let h = emptyInterests();
  for (let i = 0; i < 3; i++) {
    const results = ranked(responses(), personal(), i);
    // Deliberately controlled scores for this training test: prefer known
    // information over an equally weighted distance contribution.
    for (const k of ['a', 'b']) for (const p of results[k]) p.learningFeatures = p.id === 'later'
      ? [0, .4, 0, 0, 0, 0, 0, 0] : [.4, 0, 0, 0, 0, 0, 0, 0];
    for (const id of ['first', 'later']) h = expose(h, results, { providerId: id, familyRole: 'ab' });
    h = recordRankingFeedback(h, [provider('later')], 'save', now, familyLearningSlateIds(results));
    if (i === 0) assert.equal(localRanker(h, 'short_term', now), null, 'siblings stay on the same side of the validation boundary');
  }
  const model = localRanker(h, 'short_term', now);
  assert.ok(model && model.validation.ndcg > model.validation.baselineNdcg + .001);
  const next = ranked(responses(), { ...personal(), history: h }, 4);
  assert.ok([...next.a, ...next.b].every(p => p.rankingModel === 'local-ranknet'));
  const reversed = { ...h, ranking: h.ranking.map((s, i) => i < 4 ? s : { ...s, items: s.items.map(p => ({ ...p, reward: p.id === 'first' ? 3 : 0 })) }) };
  assert.equal(localRanker(reversed, 'short_term', now), null, 'poor validation still rejects a family-trained model');
});

test('family learning obeys activity opt-out, mode isolation, storage bounds and privacy projection', () => {
  const results = ranked(), off = { ...emptyInterests(), enabled: false };
  assert.equal(expose(off, results, { providerId: 'later', familyRole: 'ab' }), off);
  assert.equal(recordRankingFeedback(off, [provider('later')], 'save', now, familyLearningSlateIds(results)), off);
  let h = emptyInterests();
  for (let i = 0; i < 40; i++) h = expose(h, ranked(responses(), personal(), i), { providerId: 'later', familyRole: 'ab' });
  assert.equal(h.ranking.length, 60);
  const storage = { getItem: key => key.endsWith(':live') ? JSON.stringify(h) : null };
  assert.equal(readInterests(storage, 'live').ranking.length, 60);
  assert.deepEqual(readInterests(storage, 'demo'), emptyInterests());
  const exported = exportLearningData({ ...h, request: responses().a.request }, 'test_actor', 'demo', now);
  assert.ok(!/"(age|deadline|end|pickup|children|request|location)":/.test(JSON.stringify(exported)));
  assert.equal(localRanker(h, 'short_term', now + 61 * 86400000), null);
});
