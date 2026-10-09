import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runSimulation, seededRandom } from '../scripts/simulate-local-ranknet.mjs';
import { localRanker, validBootstrap } from '../shared/recommendation-learning.mjs';
import { rankSearchResponse } from '../shared/recommendations.mjs';
import { INITIAL_WEIGHTS } from '../shared/learning-to-rank.mjs';
import { trainBootstrap } from '../scripts/train-bootstrap-ranknet.mjs';
import bootstrap from '../shared/recommendation-bootstrap.json' with { type: 'json' };

test('synthetic local training has isolated temporal splits, fitted weights and real inference replays', async () => {
  const output = await mkdtemp(join(tmpdir(), 'equalpath-synthetic-ranknet-'));
  try {
    const { report, fixtures, models } = await runSimulation({ output, onProgress: () => {} });
    const bytes = await readFile(join(output, 'synthetic-interactions.json'));
    const data = JSON.parse(bytes);
    assert.equal(report.datasetSha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(data.provenance, 'synthetic-test');
    const pooled = trainBootstrap(bytes.toString());
    assert.deepEqual(pooled, bootstrap, 'published weights reproduce exactly from isolated synthetic training');
    assert.equal(pooled.validation.passed, pooled.validation.ndcg > pooled.validation.baselineNdcg + .001);
    assert.equal(pooled.status, pooled.validation.passed ? 'approved' : 'rejected');
    assert.equal(validBootstrap(pooled, 'short_term'), pooled.validation.passed);
    assert.equal(pooled.test.delta, pooled.test.ndcg - pooled.test.baselineNdcg, 'report test gains or losses without changing the validation gate');
    assert.equal(data.sessions.length, 480);
    assert.equal(new Set(data.sessions.map(s => s.id)).size, 480);
    assert.equal(data.sessions.filter(s => s.stage === 'train').length, 288);
    assert.equal(data.sessions.filter(s => s.stage === 'validation').length, 72);
    assert.equal(data.sessions.filter(s => s.stage === 'test').length, 120);
    for (const entry of models) {
      assert.notDeepEqual(entry.candidate.weights, INITIAL_WEIGHTS, 'weights were actually fitted');
      assert.ok(entry.validation.trainLossAfter < entry.validation.trainLossBefore);
      const rows = data.sessions.filter(s => s.actor === `u_synthetic_${entry.persona}`);
      assert.ok(Math.max(...rows.filter(s => s.stage === 'train').map(s => s.at)) < Math.min(...rows.filter(s => s.stage === 'validation').map(s => s.at)));
      assert.ok(Math.max(...rows.filter(s => s.stage === 'validation').map(s => s.at)) < Math.min(...rows.filter(s => s.stage === 'test').map(s => s.at)));
      if (entry.activeModel) assert.ok(entry.validation.ndcg > entry.validation.baselineNdcg + .001);
    }
    assert.ok(fixtures.length > 0, 'at least one accepted model changes real candidate order');
    for (const fixture of fixtures) {
      const before = JSON.stringify(fixture.personal);
      assert.ok(fixture.personal.history.ranking.every(s => !data.sessions.some(t => t.stage === 'test' && t.id === s.id)), 'test labels never enter browser model history');
      const model = localRanker(fixture.personal.history, 'short_term', fixture.at);
      assert.deepEqual(model.weights, models.find(m => m.persona === fixture.persona).activeModel.weights);
      const replay = rankSearchResponse(fixture.response, { bootstrapModel: null, ...fixture.personal, now: fixture.at });
      assert.deepEqual(replay.items.map(p => p.id), fixture.expected);
      assert.ok(replay.items.every(p => p.rankingModel === 'local-ranknet' && p.fit.counts.conflict === 0));
      assert.notDeepEqual(fixture.before.map(p => p.id), fixture.expected);
      assert.equal(JSON.stringify(fixture.personal), before, 'inference does not rewrite behaviour');
      const noML = rankSearchResponse(fixture.response, { bootstrapModel: null, ...fixture.personal, history: { ...fixture.personal.history, ranking: [] }, now: fixture.at });
      assert.deepEqual(noML.items.map(p => p.id), fixture.before.map(p => p.id));
    }
    const a = seededRandom(20261009), b = seededRandom(20261009);
    assert.deepEqual(Array.from({ length: 100 }, a), Array.from({ length: 100 }, b));
  } finally { await rm(output, { recursive: true, force: true }); }
});
