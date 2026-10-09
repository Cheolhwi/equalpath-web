import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createAPI } from '../server/api.mjs';
import { createSearchStore } from '../server/search-catalog.mjs';
import { emptyInterests, interestSeeds, preferenceEvidence, rankSearchResponse, recordInterest } from '../shared/recommendations.mjs';
import { emptyLibrary } from '../shared/saved.mjs';
import { recordExposure, recordRankingFeedback, localRanker, rankAdjustment } from '../shared/recommendation-learning.mjs';
import { baselineScore, ndcg, FEATURES, FEATURE_VERSION, INITIAL_WEIGHTS, preferencePairs, trainRankNet, dot } from '../shared/learning-to-rank.mjs';

// GPT-authored virtual personas, not observed parents or an LLM labelling API.
// The policy, seeds, hyperparameters and splits are fixed before evaluation.
export const SIMULATION = {
  version: 'synthetic-local-ranknet-v2-hours', provenance: 'synthetic-test', seed: 20261009,
  asOf: '2026-10-09T04:00:00.000Z', collectionQueries: 60, testQueries: 20,
  personas: [
    { id: 'care_first', preferences: ['caring_teachers', 'secure_pickup', 'clean_environment'], topicWeights: [2, 1.5, 1], distancePenalty: .015 },
    { id: 'value_first', preferences: ['value_for_money', 'predictable_fees', 'flexible_short_care'], topicWeights: [2, 1.5, 1], distancePenalty: .018 },
    { id: 'updates_first', preferences: ['responsive_team', 'caring_teachers', 'smooth_pickup'], topicWeights: [2.5, 1, 1], distancePenalty: .012 },
    { id: 'play_first', preferences: ['engaging_activities', 'healthy_meals', 'clean_environment'], topicWeights: [2, 1, 1.5], distancePenalty: .015 },
    { id: 'flexibility_first', preferences: ['flexible_short_care', 'convenient_hours', 'clear_late_rules'], topicWeights: [2, 1.5, 1], distancePenalty: .02 },
    { id: 'nearby_first', preferences: ['secure_pickup', 'clean_environment', 'value_for_money'], topicWeights: [1, 1, 1], distancePenalty: .09 },
  ],
};
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
// V8 versions differ at ~1e-17 in review-score arithmetic. Persist fixed
// precision so the same simulated dataset hashes identically on Node 22/26.
const stableFeatures = values => values.map(v => Number(v.toFixed(12)));
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return (state + .5) / 4294967296; };
}
function policyChoices(items, persona, library, random, now) {
  // Utility uses source review evidence and distance, never the fitted weights,
  // baseline score, rank position, or labels of future queries.
  const candidates = items.map(p => {
    const fit = persona.preferences.reduce((sum, id, i) => sum + persona.topicWeights[i] *
      (preferenceEvidence(p, id, null, now).score - .5) * 2, 0) / persona.topicWeights.reduce((a, b) => a + b, 0);
    const saved = library.favourites.some(f => f.id === p.id);
    const noise = -.04 * Math.log(-Math.log(random()));
    return { p, utility: fit - persona.distancePenalty * p.distanceKm + (saved ? .06 : 0) + noise, saved };
  }).sort((a, b) => b.utility - a.utility || a.p.id.localeCompare(b.p.id));
  const actions = candidates.slice(0, 3).map(({ p }) => ({ id: p.id, kind: 'view' }));
  if (random() < .8) for (const { p } of candidates.slice(0, 2)) actions.push({ id: p.id, kind: 'compare' });
  const favourite = candidates.slice(0, 2).find(c => !c.saved);
  if (favourite && random() < .6) actions.push({ id: favourite.p.id, kind: 'save' });
  return actions;
}
function applyActions(history, library, items, actions, id, at) {
  for (const action of actions) {
    const p = items.find(p => p.id === action.id);
    if (action.kind === 'save') {
      history = recordRankingFeedback(history, [p], 'save', at, id);
      library = { ...library, favourites: [...library.favourites.filter(f => f.id !== p.id),
        { id: p.id, name: p.name, careType: p.careType, reason: 'Synthetic training choice' }].slice(-6) };
    } else history = recordInterest(history, [p], action.kind, new Date(at).toISOString(), id);
  }
  return { history, library };
}
function orderNdcg(items, labels) {
  const positions = new Map(items.map((p, i) => [p.id, i]));
  return ndcg([labels], i => -(positions.get(i.id) ?? 100));
}
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function pairwiseLoss(slates, weights) {
  const pairs = preferencePairs(slates), total = pairs.reduce((sum, p) => sum + p.weight, 0);
  return pairs.reduce((sum, p) => sum + p.weight * Math.log1p(Math.exp(-dot(weights, p.x))), 0) / total;
}

export async function runSimulation({ output = '.build/recommendation-training/2026-10-09', config = SIMULATION, onProgress = console.log } = {}) {
  const now = Date.parse(config.asOf), store = createSearchStore();
  const catalog = await store.catalog('short_term');
  // Fail closed if a future code change attempts routing/geocoding or database IO.
  const noNetwork = () => { throw Error('Synthetic training must not call external services'); };
  const api = createAPI({ store, drivingRoutes: noNetwork, placeSearch: noNetwork, reverseGeocode: noNetwork });
  const anchors = catalog.items.filter(p => p.location).sort((a, b) => a.id.localeCompare(b.id));
  const sessions = [], actionLog = [], results = [], models = [], fixtures = [];
  const dates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
  for (const [personaIndex, persona] of config.personas.entries()) {
    const random = seededRandom(config.seed + personaIndex * 1009);
    let history = { ...emptyInterests(), preferences: persona.preferences, preferenceSetup: 'done' }, library = emptyLibrary();
    let trainState, model, candidate, validation, fitMilliseconds;
    const checks = [];
    for (let q = 0; q < config.collectionQueries + config.testQueries; q++) {
      if (q === config.collectionQueries) {
        trainState = clone({ history, library });
        const start = performance.now();
        model = localRanker(history, 'short_term', now);
        fitMilliseconds = performance.now() - start;
        const boundary = Math.floor(config.collectionQueries * .8);
        const train = history.ranking.slice(0, boundary), held = history.ranking.slice(boundary);
        candidate = trainRankNet(train);
        validation = { groups: held.length, baselineNdcg: ndcg(held, i => baselineScore(i.features)),
          ndcg: ndcg(held, i => baselineScore(i.features) + rankAdjustment(candidate, i.features)),
          trainLossBefore: pairwiseLoss(train, INITIAL_WEIGHTS), trainLossAfter: pairwiseLoss(train, candidate.weights),
          validationLossBefore: pairwiseLoss(held, INITIAL_WEIGHTS), validationLossAfter: pairwiseLoss(held, candidate.weights) };
      }
      const stage = q < Math.floor(config.collectionQueries * .8) ? 'train' : q < config.collectionQueries ? 'validation' : 'test';
      const at = now - (config.collectionQueries + config.testQueries - q) * 20 * 60000;
      let response;
      for (let attempt = 0; attempt < 30; attempt++) {
        const anchor = anchors[Math.floor(random() * anchors.length)];
        const hour = 9 + Math.floor(random() * 5);
        response = await api({ action: 'search', mode: 'live', features: ['defer-driving-v1'],
          seedIds: interestSeeds(library, history, 'short_term', at).map(s => s.id),
          request: { careType: 'short_term', pickup: { label: 'Synthetic query point',
            lat: anchor.location.lat + (random() - .5) * .018, lng: anchor.location.lng + (random() - .5) * .018 },
          date: dates[Math.floor(random() * dates.length)], deadline: `${String(hour).padStart(2, '0')}:00`,
          end: `${String(hour + 2).padStart(2, '0')}:00`, age: String(1 + Math.floor(random() * 5)),
          radius: random() < .6 ? 10 : 5, transport: 'self', sort: 'recommended', includeConflicts: false } });
        if (response.items.length >= 5 && response.request.sort === 'recommended') break;
      }
      if (response.items.length < 5 || response.request.sort !== 'recommended') throw Error('Not enough eligible candidates');
      // Fixed logging policy: preferences + accumulated factual/profile signals,
      // without fitting RankNet while collecting data. Full list exposure is an
      // explicit simulation assumption, not an assertion about real visitors.
      const baseline = rankSearchResponse(response, { bootstrapModel: null, history: { ...history, ranking: [] }, library, now: at });
      const id = `sim_${persona.id}_${q}`;
      const exposure = { id, at, careType: 'short_term', items: baseline.items.map((p, i) => ({ id: p.id, position: i + 1, features: stableFeatures(p.learningFeatures) })) };
      const actions = policyChoices(baseline.items, persona, library, random, at);
      const labelled = applyActions(recordExposure(history, exposure, at), library, baseline.items, actions, id, at);
      const slate = { ...labelled.history.ranking.find(s => s.id === id), actor: `u_synthetic_${persona.id}`, stage };
      sessions.push(slate);
      actionLog.push({ id, actor: slate.actor, stage, at, request: response.request, actions });
      if (stage !== 'test') { history = labelled.history; library = labelled.library; }
      else {
        // Entire history/profile/model frozen for final test. Test actions are
        // retained only as evaluation labels and never fed back into training.
        const ranked = rankSearchResponse(response, { bootstrapModel: null, history: trainState.history, library: trainState.library, now });
        // Evaluate the same features/time for both pipelines; timestamps affect
        // review freshness and interest decay, independently of RankNet.
        const control = rankSearchResponse(response, { bootstrapModel: null, history: { ...trainState.history, ranking: [] }, library: trainState.library, now });
        const labels = { ...slate, items: slate.items.map(i => ({ ...i,
          position: control.items.findIndex(p => p.id === i.id) + 1,
          features: stableFeatures(control.items.find(p => p.id === i.id).learningFeatures) })) };
        sessions[sessions.length - 1] = labels;
        const changed = ranked.items.some((p, i) => p.id !== control.items[i].id);
        const check = { id, changed, activeItems: ranked.items.filter(p => p.rankingModel === 'local-ranknet').length,
          baselineNdcg: ndcg([labels], i => baselineScore(i.features)),
          ranknetNdcg: ndcg([labels], i => baselineScore(i.features) + rankAdjustment(model, i.features)),
          pipelineBaselineNdcg: orderNdcg(control.items, labels), pipelineNdcg: orderNdcg(ranked.items, labels) };
        checks.push(check);
        if (changed && !fixtures.some(f => f.persona === persona.id)) fixtures.push({ provenance: 'synthetic-test', persona: persona.id, at: now,
          response, personal: trainState, labels, expected: ranked.items.map(p => p.id),
          before: control.items.map(p => ({ id: p.id, name: p.name, score: p.rerankScore, model: p.rankingModel })),
          after: ranked.items.map(p => ({ id: p.id, name: p.name, score: p.rerankScore, model: p.rankingModel })) });
      }
    }
    models.push({ persona: persona.id, status: model ? 'accepted-by-local-validation' : 'rejected-by-local-validation',
      preferences: persona.preferences, candidate, activeModel: model, validation });
    results.push({ persona: persona.id, active: !!model, fitMilliseconds, weights: candidate.weights,
      validation, trainQueries: Math.floor(config.collectionQueries * .8),
      validationQueries: config.collectionQueries - Math.floor(config.collectionQueries * .8), testQueries: checks.length,
      changedQueries: checks.filter(c => c.changed).length, activeTestItems: checks.reduce((n, c) => n + c.activeItems, 0),
      test: Object.fromEntries(['baselineNdcg', 'ranknetNdcg', 'pipelineBaselineNdcg', 'pipelineNdcg'].map(k => [k, mean(checks.map(c => c[k]))])), checks });
    onProgress(JSON.stringify(results.at(-1), (key, value) => key === 'checks' ? undefined : value));
  }
  const data = { schema: 'ep-interactions-v1', featureVersion: FEATURE_VERSION, provenance: 'synthetic-test', config, sessions };
  const bytes = JSON.stringify(data, null, 2) + '\n';
  const manifest = JSON.parse(await readFile(new URL('../server/data/search-index/manifest.json', import.meta.url), 'utf8'));
  const report = { provenance: 'synthetic-test', scope: 'Offline local RankNet simulation; no production activation or browser-history changes.',
    featureNames: FEATURES, datasetSha256: sha(bytes), sourceCatalogSha256: manifest.partitions.short_term.sha256,
    generatorSha256: sha(await readFile(fileURLToPath(import.meta.url))), asOf: config.asOf,
    sessions: sessions.length, exposedItems: sessions.reduce((n, s) => n + s.items.length, 0),
    trainingPairs: sessions.filter(s => s.stage === 'train').reduce((n, s) => n + preferencePairs([s]).length, 0),
    providers: new Set(sessions.flatMap(s => s.items.map(i => i.id))).size,
    actionCounts: actionLog.flatMap(s => s.actions).reduce((o, a) => ({ ...o, [a.kind]: (o[a.kind] ?? 0) + 1 }), {}),
    warnings: ['Simulated behaviour is not evidence of real-user quality.', 'All displayed list items are assumed viewed.',
      'Real source data is reused across splits; this measures future-query behaviour, not unseen-centre generalisation.',
      'Only local RankNet is fitted; collaborative filtering and matrix factorisation are not activated.'], results };
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'synthetic-interactions.json'), bytes);
  for (const [name, value] of Object.entries({ 'simulation-actions': actionLog, 'local-ranknet-models': { provenance: 'synthetic-test', asOf: config.asOf, models }, 'training-report': report, 'inference-replays': fixtures }))
    await writeFile(resolve(output, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
  return { report, fixtures, models };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await runSimulation({ output: process.argv[2] ?? undefined });
