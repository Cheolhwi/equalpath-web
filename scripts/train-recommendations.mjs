import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { cleanSlates, rankAdjustment, validReward, REWARDS } from '../shared/recommendation-learning.mjs';
import { FEATURE_VERSION, trainRankNet, ndcg, baselineScore } from '../shared/learning-to-rank.mjs';
import { trainItemCF, trainImplicitALS, cfScore, matrixScores } from '../shared/collaborative.mjs';

function validate(data) {
  if (data?.schema !== 'ep-interactions-v1' || data.featureVersion !== FEATURE_VERSION ||
      !['consented-interactions', 'synthetic-test'].includes(data.provenance) || !Array.isArray(data.sessions) || data.sessions.length > 5000)
    throw Error('Expected ep-interactions-v1 exports; no review IDs or review stars may substitute for users/actions.');
  const unique = new Set();
  for (const s of data.sessions) {
    if (!/^u_[A-Za-z0-9_-]{8,100}$/.test(s.actor ?? '') || cleanSlates([s]).length !== 1 || s.items.length < 2 ||
        cleanSlates([s])[0].items.length !== s.items.length || s.items.some(i => !validReward(i.reward))) throw Error('Invalid or expired slate');
    const key = `${s.actor}:${s.id}`; if (unique.has(key)) throw Error('Duplicate actor/slate; do not import overlapping exports twice.'); unique.add(key);
  }
}
function update(users, s) {
  const user = users[s.actor] ??= {};
  for (const item of s.items) if (item.reward > 0) user[item.id] = Math.max(user[item.id] ?? 0,
    item.reward === REWARDS.save ? 4 : item.reward === REWARDS.compare ? .4 : .2);
}
export function trainRecommendationBundle(data, type = 'short_term') {
  validate(data);
  const sessions = data.sessions.filter(s => s.careType === type).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  if (sessions.length < 30 || new Set(sessions.map(s => s.actor)).size < 5) throw Error('Need at least 30 completed slates from 5 distinct consenting users.');
  if (new Set(sessions.flatMap(s => s.items.map(i => i.id))).size > 500) throw Error('At most 500 items per model');
  // Three chronological partitions: CF/MF history, RankNet fitting, untouched
  // evaluation. Equal timestamps stay in one partition. No current reward is
  // used to construct the features predicting that reward.
  const historyEnd = sessions[Math.floor(sessions.length * .4)].at, trainEnd = sessions[Math.floor(sessions.length * .8)].at;
  const first = sessions.filter(s => s.at < historyEnd), middle = sessions.filter(s => s.at >= historyEnd && s.at < trainEnd), last = sessions.filter(s => s.at >= trainEnd);
  if (!first.length || middle.length < 5 || last.length < 5) throw Error('Insufficient distinct timestamps for chronological evaluation');
  const users = {}; first.forEach(s => update(users, s));
  const cf = trainItemCF(users), mf = trainImplicitALS(users);
  const enrich = slate => {
    const seeds = Object.entries(users[slate.actor] ?? {}).map(([id, weight]) => ({ id, weight }));
    const matrix = matrixScores(mf, seeds);
    return { ...slate, items: slate.items.map(item => ({ ...item, features: [...item.features.slice(0, 6), cfScore(cf, item.id, seeds), matrix[item.id] ?? 0] })) };
  };
  const train = middle.map(s => { const result = enrich(s); update(users, s); return result; });
  // Freeze history at the evaluation boundary too: no held-out outcomes leak
  // into another held-out query or the user fold-in used by that query.
  const test = last.map(enrich), ranker = trainRankNet(train);
  const baseline = ndcg(test, i => baselineScore(i.features));
  const hybrid = ranker ? ndcg(test, i => baselineScore(i.features) + rankAdjustment(ranker, i.features)) : null;
  const validation = { method: 'chronological-40-40-20', historySlates: first.length, trainSlates: train.length, testSlates: test.length,
    labelledTestSlates: test.filter(s => s.items.some(i => i.reward > 0)).length,
    baselineNdcg10: baseline, hybridNdcg10: hybrid, cfNdcg10: ndcg(test, i => i.features[6]), mfNdcg10: ndcg(test, i => i.features[7]),
    passed: !!ranker && baseline !== null && hybrid > baseline + .001 && test.filter(s => s.items.some(i => i.reward > 0)).length >= 5 &&
      Object.keys(cf.neighbours).length >= 3 && Object.keys(mf.factors).length >= 3 };
  return { schema: 'ep-collaborative-v1', featureVersion: FEATURE_VERSION, status: 'candidate', provenance: data.provenance,
    careType: type, trainedAt: new Date().toISOString(), trainingDigest: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    cf, mf, ranker, validation };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), input = args[0], output = args[1] ?? '.build/recommendations/candidate.json';
  if (!input) throw Error('Usage: node scripts/train-recommendations.mjs <combined-export.json> [candidate.json] [--activate]');
  const model = trainRecommendationBundle(JSON.parse(readFileSync(input, 'utf8')));
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(model, null, 2) + '\n');
  console.log(JSON.stringify({ status: model.status, provenance: model.provenance, validation: model.validation }));
  if (args.includes('--activate')) {
    if (model.provenance !== 'consented-interactions' || !model.validation.passed) throw Error('Activation refused: requires real consented interactions and a passing chronological holdout. Candidate/report retained.');
    model.status = 'approved';
    writeFileSync(new URL('../shared/recommendation-model.json', import.meta.url), JSON.stringify(model) + '\n');
  }
}
