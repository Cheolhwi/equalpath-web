import test from 'node:test';
import assert from 'node:assert/strict';
import { createAPI } from '../server/api.mjs';
import { createSearchStore } from '../server/search-catalog.mjs';
import { assess, visitCoverage } from '../shared/conditions.mjs';
import { emptyInterests, rankSearchResponse } from '../shared/recommendations.mjs';
import { emptyLibrary } from '../shared/saved.mjs';
import { childComparisonFit } from '../shared/family-comparison.mjs';

test('whole-visit coverage includes exact boundaries and adjacent windows, but not gaps', () => {
  const windows = [{ start: 600, end: 720 }, { start: 720, end: 1080 }];
  assert.equal(visitCoverage(windows, 600, 1080).covered, true);
  assert.equal(visitCoverage(windows, 599, 720).covered, false);
  assert.equal(visitCoverage(windows, 600, 1081).covered, false);
  assert.equal(visitCoverage([{ start: 600, end: 720 }, { start: 721, end: 1080 }], 660, 780).covered, false);
});

test('real-catalog TOY8 is removed before ranking at 09:00; a saved preference cannot bring it back', async () => {
  const store = createSearchStore(), catalog = await store.catalog('short_term');
  const toy = catalog.items.find(p => p.name === 'TOY8 Playground — The Gardens Mall');
  assert.ok(toy);
  const noNetwork = () => { throw Error('This regression must not call external services'); };
  const api = createAPI({ store, drivingRoutes: noNetwork, placeSearch: noNetwork, reverseGeocode: noNetwork });
  const request = { careType: 'short_term', pickup: { ...toy.location, label: 'Test origin' },
    date: '2026-10-12', deadline: '09:00', end: '12:00', age: '4', radius: 5,
    transport: 'self', sort: 'recommended', includeConflicts: false };
  const query = extra => api({ action: 'search', mode: 'live', features: ['defer-driving-v1'], request: { ...request, ...extra } });
  const early = await query({});
  assert.equal(early.items.some(p => p.id === toy.id), false);
  assert.ok(early.items.every(p => !p.fit.counts.conflict));
  const ranked = rankSearchResponse(early, { history: { ...emptyInterests(), preferences: ['engaging_activities'] },
    library: { ...emptyLibrary(), favourites: [{ id: toy.id, careType: 'short_term' }] } });
  assert.equal(ranked.items.some(p => p.id === toy.id), false);
  const diagnostic = (await query({ includeConflicts: true })).items.find(p => p.id === toy.id);
  assert.equal(diagnostic.fit.conditions.find(c => c.id === 'opening').state, 'conflict');
  assert.equal(childComparisonFit(diagnostic).state, 'conflict');
  const onTime = await query({ deadline: '10:00' });
  assert.ok(onTime.items.some(p => p.id === toy.id));
  assert.equal(assess(toy, { ...request, deadline: '10:00' }).conditions.find(c => c.id === 'opening').state, 'supported');
});
