import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DISCOVERY_PREFERENCES, aspectSentiment, reviewSentences, scoreReviewTopic } from '../shared/review-profile.mjs';
import { trainReviewClassifier, predictReviewTopics, labelledTopics, evaluateReviewClassifier } from './review-learning.mjs';

const input=process.argv[2];
if(!input)throw Error('Usage: node scripts/build-review-profiles.mjs <extracted-review-json> [as-of-date]');
const asOf=process.argv[3]??new Date().toISOString().slice(0,10);
const rows=JSON.parse(readFileSync(input,'utf8'));
const completed=JSON.parse(readFileSync(new URL('../server/data/short-care-completed-20260923.json',import.meta.url)));
const ids=new Set(completed.providers.map(p=>p.id));
if(rows.some(r=>!ids.has(r.provider_id)))throw Error('Review branch is outside the supplied provider handoff');
const model=trainReviewClassifier(rows);
const providers={};let duplicates=0;const seen=new Set();
const cleanText=text=>String(text).replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi,'[email removed]').replace(/(?:\+?60|01)[\d\s-]{7,14}/g,'[phone removed]');
for(const row of rows){
 const id=String(row.review_id??'');const text=String(row.review_text??'').trim();
 const hash=createHash('sha256').update(text.toLowerCase().replace(/\s+/g,' ')).digest('hex');
 const duplicateKey=`${row.provider_id}:${hash}`;
 if(!id||!text||seen.has(duplicateKey)||seen.has(`${row.provider_id}:${id}`)){duplicates++;continue;}
 seen.add(duplicateKey);seen.add(`${row.provider_id}:${id}`);
 const date=/^\d{4}-\d{2}-\d{2}$/.test(row.review_date??'')&&row.review_date<=asOf?row.review_date:null;
 const p=providers[row.provider_id]??={sampleCount:0,undatedCount:0,dates:{},topics:{},excerpts:[],source:{label:'Provided review sheet',kind:'user_provided_review_sheet',retrievedAt:'2026-09-23'},sourceLinksAvailable:false,scope:'Supplied sample. It may not include every review. Reviewer identity has not been independently checked.'};
 p.sampleCount++;if(!date)p.undatedCount++;else p.dates[date.slice(0,7)]=(p.dates[date.slice(0,7)]??0)+1;
 const annotated=labelledTopics(row);
 const inferred=annotated.length?annotated:predictReviewTopics(text,model).map(x=>x.id);
 // Additional narrow aspects have distinct wording within broader source
 // topics. Merely mentioning a pickup time does not mean pickup was smooth.
 for(const topic of ['smooth_pickup','clear_late_rules','predictable_fees']){
  const a=aspectSentiment(text,topic);if(a.sentiment!=='neutral')inferred.push(topic);
 }
 const topics=[...new Set(inferred)].filter(id=>aspectSentiment(text,id).sentences.length);const sentiments={};
 for(const topic of topics){
  const a=aspectSentiment(text,topic);sentiments[topic]=a.sentiment;
  const t=p.topics[topic]??={count:0,undatedCount:0,observations:[],excerpts:[]};t.count++;if(!date)t.undatedCount++;
  let o=t.observations.find(x=>x.date===date);if(!o)t.observations.push(o={date,count:0,positive:0,negative:0});o.count++;o.positive+=Number(['positive','mixed'].includes(a.sentiment));o.negative+=Number(['negative','mixed'].includes(a.sentiment));
 }
 // Keep bounded, verbatim topic passages. Introductory family/health context
 // and identifying names are not needed for the public evidence view.
 const passages=reviewSentences(text).filter(s=>!/(?:hospital|appointment|job interview|my \d|our \d|\d.year.old|\d.month.old|allergies in writing|my child is)/i.test(s));
 const context=cleanText(passages.join(' ')).slice(0,1400);
 const topicPassages=Object.fromEntries(topics.map(topic=>[topic,aspectSentiment(context,topic).sentences.join(' ')]).filter(([,quote])=>quote));
 const excerpt={id,date,rating:Number(row.stars)||null,topics:Object.keys(topicPassages),passages:topicPassages,sentiments,text:context,sourceUrl:/^https:\/\//.test(row.source_url??'')?row.source_url:null,contextNote:'Family details omitted. Wording is from the supplied review record.'};
 if(excerpt.text)p.excerpts.push(excerpt);
}
for(const p of Object.values(providers)){
 // Two recent examples of each observed polarity; no invented opposing view.
 const keep=new Set();
 for(const [id,t]of Object.entries(p.topics)){
  t.observations.sort((a,b)=>(a.date??'').localeCompare(b.date??''));
  for(const mood of ['positive','negative','mixed','neutral'])p.excerpts.filter(e=>e.topics.includes(id)&&e.sentiments[id]===mood).sort((a,b)=>(b.date??'').localeCompare(a.date??'')).slice(0,2).forEach(e=>keep.add(e.id));
  t.scoreAtBuild=scoreReviewTopic(t,Date.parse(asOf+'T23:59:59Z'));
 }
 p.excerpts=p.excerpts.filter(e=>keep.has(e.id));
}
const payload={schema:'equalpath-review-profiles-v2',asOf,sourceDigest:createHash('sha256').update(readFileSync(input)).digest('hex'),classifier:{method:model.method,version:2,annotationPolicy:'Supplied topics are retained; the corpus-trained classifier handles unlabelled text. Clause rules identify sentiment and narrow aspects.'},providers};
const topicStats=Object.fromEntries(DISCOVERY_PREFERENCES.map(t=>{const scores=Object.values(providers).map(p=>p.topics[t.id]?.scoreAtBuild).filter(Boolean);return[t.id,{branches:scores.length,supported:scores.filter(s=>s.state==='supported').length,distinctScores:new Set(scores.map(s=>s.score.toFixed(4))).size,min:Math.min(...scores.map(s=>s.score)),max:Math.max(...scores.map(s=>s.score))}];}));
mkdirSync('.build/epic6',{recursive:true});
writeFileSync(new URL('../server/data/review-profiles.json',import.meta.url),JSON.stringify(payload)+'\n');
writeFileSync('.build/epic6/review-classifier.json',JSON.stringify(model));
writeFileSync('.build/epic6/review-evaluation.json',JSON.stringify({asOf,sourceRows:rows.length,retained:Object.values(providers).reduce((n,p)=>n+p.sampleCount,0),duplicates,branches:Object.keys(providers).length,topicStats,classifier:evaluateReviewClassifier(rows)},null,2));
console.log(JSON.stringify({branches:Object.keys(providers).length,duplicates,topicStats}));
