import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aspectSentiment, scoreReviewTopic, DISCOVERY_PREFERENCES, reviewConcerns } from '../shared/review-profile.mjs';
import { emptyInterests, recordInterest, hideRecommendation, learnedPreferenceWeights, personaliseSearchItems, recommendCentres } from '../shared/recommendations.mjs';
import { contactQuestions, contactMessage, addReviewQuestion, withReviewQuestions } from '../shared/contact-message.mjs';
import { emptyLibrary } from '../shared/saved.mjs';
import { createAPI } from '../server/api.mjs';
import { demoPickup } from '../server/fixtures.mjs';
import { trainReviewClassifier, predictReviewTopics } from '../scripts/review-learning.mjs';
const now=Date.parse('2026-09-29T12:00:00Z');
const request={careType:'short_term',pickup:demoPickup,date:'2026-09-30',deadline:'10:00',end:'12:00',age:'1',transport:'self',radius:5,sort:'distance',query:'',includeUnknown:true,includeConflicts:true};
const topic=(positive,negative=0,date='2026-09-20')=>({count:positive+negative,observations:[{date,count:positive+negative,positive,negative}]});
const p=(id,topics={},extra={})=>({id,name:id,careType:'short_term',location:demoPickup,distanceKm:1,phone:{display:'123'},fit:{counts:{conflict:0},conditions:[{id:'care',state:'supported'}]},reviewProfile:{topics,excerpts:[]},...extra});
const inputs={request,library:emptyLibrary(),history:emptyInterests(),now};
test('aspect sentiment keeps praise, complaints and neutral facts distinct without using stars',()=>{
 assert.equal(aspectSentiment('Teachers are kind but meals were poor.','caring_teachers').sentiment,'positive');
 assert.equal(aspectSentiment('Teachers are kind but meals were poor.','healthy_meals').sentiment,'negative');
 assert.equal(aspectSentiment('The hourly rate is RM20.','value_for_money').sentiment,'neutral');
 assert.equal(aspectSentiment('The gate was left unlatched.','secure_pickup').sentiment,'negative');
 assert.equal(aspectSentiment('Door has a fingerprint lock.','secure_pickup').sentiment,'positive');
});
test('scores distinguish strength, negative evidence and genuinely missing evidence',()=>{
 const good=scoreReviewTopic(topic(12,1),now),mixed=scoreReviewTopic(topic(3,10),now);
 assert.ok(good.score>.5 && mixed.score<.5 && good.score>mixed.score);
 assert.equal(scoreReviewTopic(null,now).score,.5);
 assert.equal(scoreReviewTopic(topic(1),now).state,'unknown');
 assert.equal(scoreReviewTopic(topic(8,0,'2024-01-01'),now).state,'unknown');
 assert.equal(scoreReviewTopic(topic(8,0,null),now).state,'unknown');
 assert.equal(scoreReviewTopic(topic(8,0,'2027-01-01'),now).state,'unknown');
});
test('different first-use choices change the order using graded review profiles',()=>{
 const items=[p('teachers',{caring_teachers:topic(20),clean_environment:topic(2,12)}),p('clean',{caring_teachers:topic(2,12),clean_environment:topic(20)})];
 for(const [pref,first]of [['caring_teachers','teachers'],['clean_environment','clean']]){
  const result=personaliseSearchItems({...inputs,items,history:{...emptyInterests(),preferences:[pref]}});
  assert.equal(result[0].id,first);assert.equal(result[0].suggested,true);assert.equal(result[0].personalised,true);
 }
});
test('off-page saved and compared branches teach a topic profile, while other care types do not',()=>{
 const seed=p('off-page',{healthy_meals:topic(20)});
 const items=[p('plain'),p('meals',{healthy_meals:topic(20)})];
 const library={favourites:[{id:seed.id,careType:'short_term'}]};
 assert.equal(personaliseSearchItems({...inputs,items,seeds:[seed],library})[0].id,'meals');
 const history=recordInterest(emptyInterests(),[seed],'compare','2026-09-29T10:00:00Z');
 assert.ok(learnedPreferenceWeights({...inputs,seeds:[seed],history,careType:'short_term'}).weights.healthy_meals>0);
 assert.equal(learnedPreferenceWeights({...inputs,seeds:[seed],history,careType:'regular'}).confidence,0);
 assert.equal(learnedPreferenceWeights({...inputs,seeds:[seed],history:{...history,enabled:false},careType:'short_term'}).confidence,0);
});
test('all ten page candidates are reranked, favourites remain eligible, and map suggestions use the same top three',()=>{
 const items=Array.from({length:10},(_,i)=>p(String(i),{clean_environment:topic(i+2)}));
 const library={favourites:[{id:'9',careType:'short_term'}]};
 const history={...emptyInterests(),preferences:['clean_environment']};
 const result=personaliseSearchItems({...inputs,items,library,history});
 assert.equal(result[0].id,'9');assert.deepEqual(result.filter(p=>p.suggested).map(p=>p.id),result.slice(0,3).map(p=>p.id));
 assert.deepEqual(result.map(p=>p.personalisedRank),[1,2,3,4,5,6,7,8,9,10]);
 assert.ok(result.every(p=>Number.isFinite(p.rerankScore)));
 assert.deepEqual(result.slice(3).map(p=>p.id),['6','5','4','3','2','1','0']);
 assert.equal(result.at(-1).id,'0');
 assert.ok(!recommendCentres({...inputs,candidates:items,seeds:items,library,history}).some(x=>x.p.id==='9'));
});
test('new, skipped and opted-out visitors still score and rerank all ten results',()=>{
 const items=Array.from({length:10},(_,i)=>p(String(i),{}, {
  distanceKm:.5+i*.02,
  fit:{counts:{conflict:0},conditions:[{id:'care',state:i%2?'supported':'unknown'}]},
 }));
 for(const history of [emptyInterests(),{...emptyInterests(),preferenceSetup:'skipped'},{...emptyInterests(),enabled:false}]){
  const result=personaliseSearchItems({...inputs,items,history});
  assert.equal(result.length,10);
  assert.deepEqual(result.map(p=>p.id),['1','3','5','7','9','0','2','4','6','8']);
  assert.deepEqual(result.map(p=>p.personalisedRank),[1,2,3,4,5,6,7,8,9,10]);
  assert.ok(result.every(p=>Number.isFinite(p.rerankScore)&&!p.personalised));
  assert.deepEqual(result.filter(p=>p.suggested).map(p=>p.id),['1','3','5']);
 }
});
test('hidden ordinary results are scored without becoming suggestions or removing page members',()=>{
 const items=Array.from({length:10},(_,i)=>p(String(i)));
 const history=hideRecommendation(emptyInterests(),items[0]);
 const result=personaliseSearchItems({...inputs,items,history});
 assert.equal(result.length,10);
 assert.equal(result.at(-1).id,'0');
 assert.equal(result.at(-1).personalisedRank,10);
 assert.ok(Number.isFinite(result.at(-1).rerankScore));
 assert.equal(result.at(-1).suggested,false);
 assert.deepEqual(result.filter(p=>p.suggested).map(p=>p.id),['1','2','3']);
});
test('explicit sorts, conflicts and radius membership are not overturned by personalisation',()=>{
 const items=[p('cheap',{}, {fees:[{amount:5,basis:'hour'}]}),p('favourite',{caring_teachers:topic(40)},{fees:[{amount:30,basis:'hour'}]}),p('conflict',{caring_teachers:topic(99)},{fit:{counts:{conflict:1},conditions:[]}})];
 const result=personaliseSearchItems({...inputs,items,request:{...request,sort:'price'},history:{...emptyInterests(),preferences:['caring_teachers']}});
 assert.deepEqual(result.map(p=>p.id),items.map(p=>p.id));assert.equal(result[2].suggested,false);
 assert.ok(result.slice(0,2).every(p=>Number.isFinite(p.rerankScore)));
 assert.equal(result[2].rerankScore,null);
 const hidden=hideRecommendation({...emptyInterests(),preferences:['caring_teachers']},items[1]);
 assert.equal(personaliseSearchItems({...inputs,items,history:hidden}).find(p=>p.id==='favourite').suggested,false);
});
test('actual imported corpus has diverse scores and rejects the all-topics-identical regression',()=>{
 const data=JSON.parse(readFileSync(new URL('../server/data/review-profiles.json',import.meta.url)));
 assert.equal(Object.keys(data.providers).length,101);
 assert.equal(Object.values(data.providers).reduce((s,p)=>s+p.sampleCount,0),10211);
 for(const id of ['caring_teachers','clean_environment','engaging_activities','responsive_team']){
  const scores=Object.values(data.providers).map(p=>scoreReviewTopic(p.topics[id],now).score.toFixed(4));
  assert.ok(new Set(scores).size>10,`${id} must distinguish providers`);
 }
 const input=Object.entries(data.providers).slice(0,20).map(([id,profile])=>p(id,profile.topics));
 const orders=DISCOVERY_PREFERENCES.map(t=>personaliseSearchItems({...inputs,items:input,history:{...emptyInterests(),preferences:[t.id]}}).slice(0,3).map(p=>p.id).join(','));
 assert.ok(new Set(orders).size>=5,'different choices should produce different top threes at equal distance');
});
test('review concerns require two recent records and merge with existing contact questions',()=>{
 const profile={topics:{value_for_money:topic(2,3)},source:{label:'Provided review sheet'},excerpts:[1,2].map(n=>({id:String(n),date:'2026-09-20',topics:['value_for_money'],sentiments:{value_for_money:'negative'},text:'The price was expensive.'}))};
 const centre=p('reviewed',{}, {reviewProfile:profile,reviewQuestionIds:['value_for_money'],enquiries:[{id:'fees',text:'What is the total cost?',always:true}]});
 assert.equal(reviewConcerns(centre,now).length,1);
 const questions=contactQuestions(centre,request,now);
 assert.equal(questions.filter(q=>q.id==='fees').length,1);
 assert.ok(questions.find(q=>q.id==='fees').checks.some(c=>c.reviewTopic==='value_for_money'));
 assert.doesNotMatch(contactMessage(centre,request,questions),/price was expensive/);
 assert.equal(reviewConcerns({...centre,reviewProfile:{...profile,topics:{value_for_money:topic(2,3,'2024-01-01')}}},now).length,0);
});
test('hiding a suggestion supplies a small negative signal even without earlier positive activity',()=>{
 const seed=p('hidden',{healthy_meals:topic(30)});
 const history=hideRecommendation(emptyInterests(),seed);
 const learned=learnedPreferenceWeights({...inputs,seeds:[seed],history,careType:'short_term'});
 assert.ok(learned.weights.healthy_meals<0 && learned.confidence>0);
 const result=personaliseSearchItems({...inputs,items:[p('meals',{healthy_meals:topic(20)}),p('plain')],seeds:[seed],history});
 assert.equal(result[0].id,'plain');
});
test('review choices survive refreshed details and copying respects unchecking without duplication',()=>{
 const ids=['secure_pickup','healthy_meals'];
 const centre=p('branch',{}, {reviewProfile:{topics:Object.fromEntries(ids.map(id=>[id,topic(2,3)])),source:{label:'Provided review sheet'},excerpts:ids.flatMap(id=>[1,2].map(n=>({id:id+n,date:'2026-09-20',topics:[id],sentiments:{[id]:'negative'},text:'Reported concern.'})))},enquiries:[{id:'fees',text:'What is the total cost?',always:true}]});
 const key='visit-one';
 const first=addReviewQuestion(centre,request,ids[0],{},key,now);
 const second=addReviewQuestion(centre,request,ids[1],first.selection,key,now);
 const restored=withReviewQuestions(centre,second.selection,key);
 const questions=contactQuestions(restored,request,now);
 assert.equal(questions.filter(q=>q.id.startsWith('review:')).length,2);
 assert.match(contactMessage(restored,request,questions),/How do you check who is allowed to collect my child/);
 assert.doesNotMatch(contactMessage(restored,request,questions.filter(q=>q.id!=='review:secure_pickup')),/How do you check who is allowed to collect my child/);
 const repeated=addReviewQuestion(centre,request,ids[0],{...second.selection,[key]:questions.map(q=>q.id)},key,now);
 assert.equal(repeated.selection[key].filter(id=>id==='review:secure_pickup').length,1);
 assert.deepEqual(withReviewQuestions(centre,second.selection,'different-visit').reviewQuestionIds,[]);
});
test('search API refreshes same-type off-page seed profiles without changing page membership',async()=>{
 const api=createAPI({drivingRoutes:async(_,rows)=>rows,reverseGeocode:async()=>({pickup:null})});
 const basic=await api({action:'search',mode:'live',request});
 const id='provider_6608d9c70e9c6ad94b4600b1e22';
 const withSeeds=await api({action:'search',mode:'live',request,seedIds:[id]});
 assert.deepEqual(withSeeds.items.map(p=>p.id),basic.items.map(p=>p.id));
 assert.ok(withSeeds.seeds.find(p=>p.id===id)?.reviewProfile.topics);
 await assert.rejects(api({action:'search',mode:'live',request,seedIds:Array(101).fill(id)}));
});
test('both live short-care pages enter reranking with their exact eligible membership',async()=>{
 const api=createAPI({drivingRoutes:async(_,rows)=>rows,reverseGeocode:async()=>({pickup:null})});
 const allIds=[];
 for(const page of [0,1]){
  const response=await api({action:'search',mode:'live',page,request:{...request,radius:10,includeConflicts:false}});
  assert.equal(response.items.length,Math.min(10,response.total-page*10));
  assert.ok(response.items.length>0);
  const ranked=personaliseSearchItems({...inputs,request:response.request,items:response.items,seeds:response.seeds});
  assert.deepEqual(ranked.map(p=>p.id).sort(),response.items.map(p=>p.id).sort());
  assert.deepEqual(ranked.map(p=>p.personalisedRank),Array.from({length:response.items.length},(_,i)=>i+1));
  assert.ok(ranked.every(p=>Number.isFinite(p.rerankScore)&&!p.fit.counts.conflict&&p.distanceKm<=10));
  allIds.push(...ranked.map(p=>p.id));
 }
 assert.ok(allIds.length>10);
 assert.equal(new Set(allIds).size,allIds.length);
});
test('corpus classifier learns topic vocabulary and abstains for unrelated text',()=>{
 const rows=[...Array(4)].flatMap(()=>[{topics:'staff',review_text:'Patient caring teachers comfort children kindly'},{topics:'cleanliness',review_text:'Clean rooms washed toys spotless floors'}]);
 const model=trainReviewClassifier(rows);
 assert.equal(predictReviewTopics('clean washed toys floors',model)[0].id,'clean_environment');
 assert.equal(predictReviewTopics('clean washed toys floors',model)[0].group,'environment');
 assert.deepEqual(predictReviewTopics('galaxies telescope moon',model),[]);
});
test('published topic passages are relevant, traceable snippets of their supplied context',()=>{
 const data=JSON.parse(readFileSync(new URL('../server/data/review-profiles.json',import.meta.url)));
 for(const profile of Object.values(data.providers))for(const excerpt of profile.excerpts){
  for(const id of excerpt.topics){
   assert.ok(excerpt.passages[id]);
   assert.ok(aspectSentiment(excerpt.passages[id],id).sentences.length);
   for(const sentence of aspectSentiment(excerpt.passages[id],id).sentences)assert.ok(excerpt.text.includes(sentence));
  }
  assert.ok(!excerpt.sourceUrl || excerpt.sourceUrl.startsWith('https://'));
 }
});
