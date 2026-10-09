import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FEATURE_VERSION, FEATURES, INITIAL_WEIGHTS, validFeatures, trainRankNet, baselineScore, ndcg } from '../shared/learning-to-rank.mjs';
import { rankAdjustment } from '../shared/recommendation-learning.mjs';

export function trainBootstrap(bytes) {
  const data = JSON.parse(bytes);
  if (data.provenance !== 'synthetic-test' || data.featureVersion !== FEATURE_VERSION || !Array.isArray(data.sessions)) throw Error('Expected labelled synthetic simulation');
  const seen = new Set();
  for (const s of data.sessions) {
    if (!['train', 'validation', 'test'].includes(s.stage) || s.careType !== 'short_term' || !Number.isFinite(s.at) || !s.actor ||
      !s.items?.length || s.items.some(i => !validFeatures(i.features) || ![-1, 0, 1, 2, 3].includes(i.reward)) || seen.has(s.id)) throw Error('Invalid synthetic slate');
    seen.add(s.id);
  }
  for (const actor of new Set(data.sessions.map(s => s.actor))) {
    const rows = data.sessions.filter(s => s.actor === actor);
    const stages = ['train', 'validation', 'test'].map(stage => rows.filter(s => s.stage === stage));
    if (stages.some(rows => !rows.length) || Math.max(...stages[0].map(s => s.at)) >= Math.min(...stages[1].map(s => s.at)) ||
      Math.max(...stages[1].map(s => s.at)) >= Math.min(...stages[2].map(s => s.at))) throw Error('Temporal split overlap');
  }
  const stage = name => data.sessions.filter(s => s.stage === name);
  // Hyperparameters stay fixed. Validation selects acceptance; the untouched
  // final test is reported even when it regresses, never used to refit weights.
  const ranker = trainRankNet(stage('train'));
  if (!ranker || ranker.weights.slice(6).some(w => w !== 0)) throw Error('Expected a content-only initial ranker');
  ranker.weights = ranker.weights.map(w => Number(w.toFixed(12)));
  const evaluate = rows => ({ groups: rows.length, baselineNdcg: ndcg(rows, i => baselineScore(i.features)),
    ndcg: ndcg(rows, i => baselineScore(i.features) + rankAdjustment(ranker, i.features)) });
  const validation = evaluate(stage('validation')), test = evaluate(stage('test'));
  validation.passed = validation.ndcg > validation.baselineNdcg + .001;
  test.delta = test.ndcg - test.baselineNdcg;
  return { schema: 'ep-ranknet-bootstrap-v1', featureVersion: FEATURE_VERSION, provenance: 'synthetic-bootstrap',
    status: validation.passed ? 'approved' : 'rejected', careType: 'short_term', trainedAt: data.config.asOf,
    version: 'synthetic-bootstrap-20261009-v1', features: FEATURES, initialWeights: INITIAL_WEIGHTS,
    training: { datasetSha256: createHash('sha256').update(bytes).digest('hex'), generator: 'scripts/simulate-local-ranknet.mjs',
      seed: data.config.seed, personas: new Set(data.sessions.map(s => s.actor)).size, groups: stage('train').length,
      method: 'Pooled linear RankNet; per-persona chronological 48/12/20 split', epochs: 100, rate: .3, regularisation: .03 },
    ranker, validation, test,
    limitations: ['Synthetic behaviour, not observed parents. No real-user quality claim.',
      'Final test did not improve on the heuristic baseline. Activation is an explicitly authorised bootstrap, not a proven quality upgrade.',
      'No user IDs, saved centres, CF neighbours or matrix factors are shipped in this prior.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const input = process.argv[2] ?? '.build/recommendation-training/2026-10-09/synthetic-interactions.json';
  const output = process.argv[3] ?? 'shared/recommendation-bootstrap.json';
  const model = trainBootstrap(readFileSync(input, 'utf8'));
  if (model.status !== 'approved') throw Error('Initial ranker did not pass validation');
  writeFileSync(output, JSON.stringify(model, null, 2) + '\n');
  console.log(JSON.stringify({ output, weights: model.ranker.weights, validation: model.validation, test: model.test }));
}
