import test from 'node:test';
import assert from 'node:assert/strict';
import { createAPI } from '../server/api.mjs';
import { emptyLibrary } from '../shared/saved.mjs';
import { emptyInterests, recordInterest, personaliseSearchItems } from '../shared/recommendations.mjs';

const now = Date.parse('2026-10-01T04:00:00Z');
const request = { careType: 'short_term', pickup: { label: 'PJ test starting point', lat: 3.11, lng: 101.644 },
  date: '2026-10-01', deadline: '12:50', end: '17:50', age: '1-3', transport: '', radius: 5,
  query: '', includeUnknown: true, includeConflicts: false, sort: 'recommended' };
const topic = (date = '2026-09-20') => ({ count: 20, observations: [{ date, count: 20, positive: 20, negative: 0 }] });
const provider = (id, distanceKm, topics = {}) => ({ id, name: id, careType: 'short_term', distanceKm,
  location: request.pickup, phone: { display: '123' },
  fit: { counts: { conflict: 0 }, conditions: [{ id: 'care', state: 'supported' }] },
  reviewProfile: { topics, excerpts: [] } });
const options = { request, library: emptyLibrary(), history: emptyInterests(), now };
const saved = p => ({ ...emptyLibrary(), favourites: [{ id: p.id, careType: p.careType }] });
const rank = (items, extra = {}) => personaliseSearchItems({ ...options, items, ...extra });

test('saving a lower result changes the next full-page order; comparing matters more than viewing', () => {
  const items = Array.from({ length: 10 }, (_, i) => provider(`p${i}`, .5 + i * .3));
  const target = items[8];
  const baseline = rank(items);
  const viewed = rank(items, { history: recordInterest(emptyInterests(), [target], 'view', new Date(now).toISOString()) });
  const compared = rank(items, { history: recordInterest(emptyInterests(), [target], 'compare', new Date(now).toISOString()) });
  const favourite = rank(items, { library: saved(target) });
  const position = rows => rows.findIndex(p => p.id === target.id);
  assert.equal(position(baseline), 8);
  assert.ok(position(favourite) < position(compared));
  assert.ok(position(compared) <= position(viewed));
  assert.ok(compared.find(p => p.id === target.id).rerankScore > viewed.find(p => p.id === target.id).rerankScore,
    'a weak comparison can increase the score without forcing a position change');
  assert.ok(position(favourite) < 3);
  assert.equal(favourite.find(p => p.id === target.id).personalisedReason, 'A centre you saved');
  assert.deepEqual(favourite.map(p => p.id).sort(), items.map(p => p.id).sort());
  assert.deepEqual(favourite.filter(p => p.suggested).map(p => p.id), favourite.slice(0, 3).map(p => p.id));
  assert.deepEqual(rank(items).map(p => p.id), baseline.map(p => p.id), 'removing the save restores the no-history order');
  const old = rank(items, { history: recordInterest(emptyInterests(), [target], 'compare', '2026-01-01T04:00:00Z') });
  assert.deepEqual(old.map(p => p.id), baseline.map(p => p.id), 'old comparison signals fade');
});

test('bounded diversity exposes a different supported theme, without lifting far or stale options', () => {
  const items = [provider('a', 1, { caring_teachers: topic() }), provider('b', 1.03, { caring_teachers: topic() }),
    provider('c', 1.2, { engaging_activities: topic() }), provider('far', 4.8, { healthy_meals: topic() })];
  assert.deepEqual(rank(items).map(p => p.id), ['a', 'c', 'b', 'far']);
  assert.deepEqual(rank(items).map(p => p.id), rank([...items].reverse()).map(p => p.id), 'stable across input order');
  for (const topics of [{}, { engaging_activities: topic('2024-01-01') }]) {
    assert.deepEqual(rank(items.map(p => p.id === 'c' ? { ...p, reviewProfile: { topics } } : p)).map(p => p.id), ['a', 'b', 'c', 'far']);
  }
  const conflict = { ...items[2], fit: { counts: { conflict: 1 }, conditions: [] } };
  const result = rank([items[0], items[1], conflict], { library: saved(conflict) });
  assert.equal(result.at(-1).id, 'c');
  assert.equal(result.at(-1).suggested, false);
  assert.equal(result.at(-1).rerankScore, null);
});

test('explicit factual sorts do not change with saved/viewed/compared preferences', () => {
  const items = [provider('a', 1), provider('b', 2), provider('c', 3, { caring_teachers: topic() })];
  const history = { ...recordInterest(emptyInterests(), [items[2]], 'compare', new Date(now).toISOString()), preferences: ['caring_teachers'] };
  for (const sort of ['distance', 'price', 'closing', 'pickup', 'name']) {
    const result = rank(items, { request: { ...request, sort }, history, library: saved(items[2]) });
    assert.deepEqual(result.map(p => p.id), items.map(p => p.id));
    assert.ok(result.every(p => !p.personalised && p.personalisedReason === null));
  }
});

test('published catalogue reproduces the same-page save scenario and keeps all original eligibility and paging', async () => {
  const api = createAPI({ drivingRoutes: async (_, rows) => rows });
  const response = await api({ action: 'search', mode: 'live', request, features: ['search-summary-v1', 'defer-driving-v1'] });
  assert.equal(response.request.sort, 'recommended');
  assert.equal(response.ordering.available.recommended, true);
  const history = { ...emptyInterests(), preferences: ['engaging_activities', 'secure_pickup'] };
  const before = rank(response.items, { history });
  assert.ok(before.length >= 8);
  const target = before.at(-1);
  const next = await api({ action: 'search', mode: 'live', request, seedIds: [target.id], features: ['search-summary-v1', 'defer-driving-v1'] });
  const after = rank(next.items, { history, seeds: next.seeds, library: saved(target) });
  assert.ok(after.findIndex(p => p.id === target.id) < 3, 'a relevant saved lower-page branch should now be visible in map suggestions');
  assert.notEqual(after[0].id, target.id, 'one save need not override the stronger first choice');
  assert.deepEqual(after.map(p => p.id).sort(), before.map(p => p.id).sort());
  assert.ok(after.every(p => !p.fit.counts.conflict && p.distanceKm <= request.radius));
  const nearest = await api({ action: 'search', mode: 'live', request: { ...request, sort: 'distance' } });
  const factual = rank(nearest.items, { request: nearest.request, history, library: saved(target) });
  assert.deepEqual(factual.map(p => p.distanceKm), factual.map(p => p.distanceKm).sort((a, b) => a - b));
  assert.deepEqual(factual.map(p => p.id).sort(), before.map(p => p.id).sort());
});
