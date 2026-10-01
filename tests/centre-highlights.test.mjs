import test from 'node:test';
import assert from 'node:assert/strict';
import { centreHighlights } from '../shared/recommendations.mjs';

const now = Date.parse('2026-10-01T04:00:00Z');
const topic = (positive, negative = 0, date = '2026-09-20') => ({ count: positive + negative,
  observations: [{ date, count: positive + negative, positive, negative }] });
const branch = topics => ({ reviewProfile: { topics, excerpts: [] } });

test('branch highlights show the strongest two review themes using short existing labels', () => {
  const provider = branch({ caring_teachers: topic(25), engaging_activities: topic(18), healthy_meals: topic(8) });
  const expected = [{ id: 'caring_teachers', label: 'Kind teachers' }, { id: 'engaging_activities', label: 'Fun activities' }];
  assert.deepEqual(centreHighlights(provider, now), expected);
  assert.deepEqual(centreHighlights({ ...provider, personalised: true, personalisedReason: 'Matches your choices: Good meals' }, now), expected);
  assert.deepEqual(centreHighlights({ ...provider, reviewProfile: { ...provider.reviewProfile, deferred: true } }, now), expected);
});

test('one strong theme stays a single tag; sparse, stale, missing and negative evidence do not fill a second slot', () => {
  assert.deepEqual(centreHighlights(branch({ clean_environment: topic(18), caring_teachers: topic(1),
    engaging_activities: topic(50, 0, '2024-01-01'), healthy_meals: topic(3, 30),
    responsive_team: topic(20, 0, '2027-01-01') }), now), [{ id: 'clean_environment', label: 'Clean spaces' }]);
  assert.deepEqual(centreHighlights(branch({ caring_teachers: topic(1), healthy_meals: topic(0, 20) }), now), []);
  assert.deepEqual(centreHighlights({ admission: { value: true }, phone: { display: '123' }, fees: [{ amount: 10, basis: 'hour' }] }, now), []);
});

test('equal evidence yields stable labels regardless of supplied topic order', () => {
  const entries = [['healthy_meals', topic(20)], ['engaging_activities', topic(20)], ['caring_teachers', topic(20)]];
  const result = centreHighlights(branch(Object.fromEntries(entries)), now);
  assert.equal(result.length, 2);
  assert.deepEqual(result, centreHighlights(branch(Object.fromEntries(entries.reverse())), now));
});
