import { DISCOVERY_PREFERENCES, preferenceById } from '../shared/review-profile.mjs';
const stop = new Set('the a an and or for to of in on at is was were are i we our my their they it this that with from as so had have has be but because after before about used child centre care years year months month old days day hours hour rm'.split(' '));
export const tokens = text => [...new Set((String(text).toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(t => !stop.has(t)))];
export const labelledTopics = row => DISCOVERY_PREFERENCES.filter(p => p.sourceTopics.some(t => String(row.topics ?? '').split('|').includes(t))).map(p => p.id);
const normalise = vector => { const norm = Math.hypot(...Object.values(vector)); return Object.fromEntries(Object.entries(vector).map(([k,v]) => [k,v/(norm||1)])); };
export function trainReviewClassifier(rows) {
  const docs = rows.map(row => ({ terms: tokens(row.review_text), labels: labelledTopics(row) }));
  const df = {};
  for (const d of docs) for (const t of d.terms) df[t] = (df[t] ?? 0) + 1;
  const idf = Object.fromEntries(Object.entries(df).filter(([,n]) => n >= 3).map(([t,n]) => [t, Math.log((docs.length+1)/(n+1))+1]));
  const centroids = {}, groupCentroids = {}, counts = {};
  for (const d of docs) {
    const vector = normalise(Object.fromEntries(d.terms.filter(t => idf[t]).map(t => [t,idf[t]])));
    for (const label of d.labels) {
      counts[label]=(counts[label]??0)+1;
      centroids[label]??={};
      for(const [t,v]of Object.entries(vector)) centroids[label][t]=(centroids[label][t]??0)+v;
    }
    for (const group of new Set(d.labels.map(id=>preferenceById.get(id).topic))) {
      groupCentroids[group]??={};
      for(const [t,v]of Object.entries(vector)) groupCentroids[group][t]=(groupCentroids[group][t]??0)+v;
    }
  }
  for (const label of Object.keys(centroids)) centroids[label]=normalise(centroids[label]);
  for (const group of Object.keys(groupCentroids)) groupCentroids[group]=normalise(groupCentroids[group]);
  return { version: 2, method: 'hierarchical-tf-idf-centroids', documents: rows.length, idf, groupCentroids, centroids, counts };
}
export function predictReviewTopics(text, model) {
  const vector=normalise(Object.fromEntries(tokens(text).filter(t=>model.idf[t]).map(t=>[t,model.idf[t]])));
  const cosine=c=>Object.entries(vector).reduce((s,[t,v])=>s+v*(c[t]??0),0);
  const groups=Object.entries(model.groupCentroids).map(([id,c])=>({id,score:cosine(c)})).sort((a,b)=>b.score-a.score);
  const selected=new Set(groups.filter(g=>g.score>=.2&&g.score>=(groups[0]?.score??1)*.75).map(g=>g.id));
  const scores=Object.entries(model.centroids).filter(([id])=>selected.has(preferenceById.get(id).topic)).map(([id,c])=>({id,group:preferenceById.get(id).topic,score:cosine(c)})).sort((a,b)=>b.score-a.score);
  return scores.filter(x=>x.score>=.24 && x.score>=(scores[0]?.score??1)*.8).slice(0,5);
}
export function evaluateReviewClassifier(rows) {
  // Hold out entire branches; deduplicate identical normalised wording across
  // both partitions. This measures topic annotation agreement, not usefulness.
  const ids=[...new Set(rows.map(r=>r.provider_id))].sort();
  const held=new Set(ids.filter((_,i)=>i%5===0));
  const key=r=>String(r.review_text).toLowerCase().replace(/\d+(?:[.:]\d+)?/g,'#').replace(/\s+/g,' ').trim();
  const train=rows.filter(r=>!held.has(r.provider_id));
  const seen=new Set(train.map(key));
  const test=rows.filter(r=>held.has(r.provider_id)&&!seen.has(key(r)));
  const model=trainReviewClassifier(train);
  let tp=0,fp=0,fn=0;
  for(const r of test){const truth=new Set(labelledTopics(r));const predicted=new Set(predictReviewTopics(r.review_text,model).map(x=>x.id));for(const t of predicted)truth.has(t)?tp++:fp++;for(const t of truth)if(!predicted.has(t))fn++;}
  return { method:model.method, heldOutBranches:held.size, trainReviews:train.length,testReviews:test.length,precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),f1:2*tp/(2*tp+fp+fn||1), limitation:'Agreement with supplied topic annotations. Not independent human evaluation or online recommendation quality.' };
}
