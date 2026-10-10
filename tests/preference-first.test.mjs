import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInterests, recordInterest, rankCentres, rankSearchResponse, learnedPreferenceWeights } from '../shared/recommendations.mjs';
import { emptyLibrary } from '../shared/saved.mjs';
import { FEATURE_VERSION } from '../shared/learning-to-rank.mjs';
import { recordExposure, recordRankingFeedback, createMLScorer, localRanker, cleanSlates, REWARDS } from '../shared/recommendation-learning.mjs';
import { rankFamilyResults } from '../shared/family-learning.mjs';
import { buildOptions } from '../shared/two-child.mjs';

const now = Date.now(), date = new Date(now).toISOString().slice(0,10);
const request = { careType:'short_term', radius:10, sort:'recommended' };
const topic = () => ({ count:20, observations:[{date,count:20,positive:20,negative:0}] });
const provider = (id, ids=[]) => ({id,name:id,careType:'short_term',distanceKm:1,
  location:{lat:3,lng:101},phone:{display:'123'},fit:{counts:{conflict:0},conditions:[{id:'care',state:'supported'}]},
  reviewProfile:{topics:Object.fromEntries(ids.map(id=>[id,topic()])),excerpts:[]}});
const preferenceIds=['caring_teachers','engaging_activities','responsive_team'];
const personal=()=>({history:{...emptyInterests(),preferences:preferenceIds},library:emptyLibrary(),now});
const preferred=provider('preferred',preferenceIds), compared=provider('compared',['predictable_fees']);
const rows=[compared,provider('another',['predictable_fees']),preferred];
const response={request,items:rows};
const rank=(items,p)=>rankCentres({candidates:items,request,...p});

test('first two comparisons cannot displace supported onboarding choices at comparable distance and fit',()=>{
  let p=personal();
  const before=rankSearchResponse(response,p), frozen=JSON.stringify(before);
  for(let i=0;i<2;i++){
    p={...p,history:recordExposure(p.history,{id:`first_${i}`,at:now-200+i*100,careType:'short_term',items:before.items.map((r,j)=>({id:r.id,position:j+1,features:r.learningFeatures}))},now)};
    p.history=recordInterest(p.history,rows.slice(0,2),'compare',new Date(now).toISOString(),`first_${i}`);
    const next=rankSearchResponse(response,p);
    assert.equal(next.items[0].id,'preferred');
    assert.equal(next.items[0].personalisedReason,'Matches your choices: Kind teachers');
    assert.ok(next.items.find(r=>r.id==='compared').rerankScore>before.items.find(r=>r.id==='compared').rerankScore);
  }
  assert.equal(JSON.stringify(before),frozen);
  assert.ok(p.history.ranking.every(s=>s.items.filter(i=>i.id!=='preferred').every(i=>i.reward===REWARDS.compare)));
});

test('one multi-centre Compare does not multiply inferred-interest confidence',()=>{
  const branches=Array.from({length:3},(_,i)=>provider(`branch_${i}`,['predictable_fees']));
  const confidence=history=>learnedPreferenceWeights({seeds:branches,history,library:emptyLibrary(),careType:'short_term',now}).confidence;
  const one=recordInterest(emptyInterests(),branches.slice(0,1),'compare',new Date(now).toISOString());
  const three=recordInterest(emptyInterests(),branches,'compare',new Date(now).toISOString());
  assert.equal(confidence(one),confidence(three));
  assert.ok(confidence(three)<.05);
  const older=recordInterest(emptyInterests(),branches.slice(0,1),'compare',new Date(now-86400000).toISOString());
  assert.ok(confidence(recordInterest(older,branches.slice(1,2),'compare',new Date(now).toISOString()))>confidence(one));
  assert.equal(confidence(recordInterest(three,branches,'compare',new Date(now).toISOString())),confidence(three));
});

test('reason follows the strongest positive personal factor, not saved/compared precedence, and contains no score',()=>{
  const p=personal();
  p.history=recordInterest(p.history,[preferred],'compare',new Date(now).toISOString());
  p.library.favourites=[{id:preferred.id,careType:'short_term'}];
  let item=rank([preferred],p)[0];
  assert.ok(item.scoreParts.preferences>item.scoreParts.familiarity);
  assert.equal(item.reason,'Matches your choices: Kind teachers');
  item=rank([compared],{...p,library:{...emptyLibrary(),favourites:[{id:compared.id,careType:'short_term'}]}})[0];
  assert.equal(item.reason,'A centre you saved');
  assert.ok(!/[0-9+%]/.test(item.reason));
  const unknown=rank([provider('unknown')],personal())[0];
  assert.equal(unknown.reason,'Near your chosen location');
});

test('model contribution allocation is exact and can change the explanation without exposing values',()=>{
  const bootstrapModel={schema:'ep-ranknet-bootstrap-v1',featureVersion:FEATURE_VERSION,provenance:'synthetic-bootstrap',status:'approved',careType:'short_term',
    ranker:{algorithm:'linear-ranknet',featureVersion:FEATURE_VERSION,weights:[1,1,-4,1,1,4,0,0]},validation:{passed:true,baselineNdcg:.7,ndcg:.8}};
  const history={...emptyInterests(),preferences:['caring_teachers','engaging_activities','responsive_team']};
  const modest=provider('modest',['caring_teachers']);
  const options={history,library:{...emptyLibrary(),favourites:[{id:'modest',careType:'short_term'}]},now,bootstrapModel};
  const item=rank([modest],options)[0];
  assert.equal(item.reason,'A centre you saved');
  const sum=Object.values(item.ml.contributions).reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(sum-item.ml.delta)<1e-12);
  const score=createMLScorer({...options,seeds:[],careType:'short_term'});
  for(const parts of [{preferences:.1,familiarity:.2},{preferences:.12,familiarity:.2},{preferences:0,familiarity:0}]){
    const m=score('modest',parts);
    assert.ok(Math.abs(Object.values(m.contributions).reduce((a,b)=>a+b,0)-m.delta)<1e-12);
  }
});

test('two independent feedback searches have a bounded model influence; sibling slates add no maturity',()=>{
  const make=(id,at,reward=REWARDS.compare)=>({version:FEATURE_VERSION,id,at,careType:'short_term',items:[
    {id:'near',features:[.4,0,0,0,0,0,0,0],position:1,reward:0},
    {id:'known',features:[0,.4,0,0,0,0,0,0],position:2,reward}]});
  const ranking=[make('one',now-200),make('two',now-100)], history={...emptyInterests(),ranking};
  const local=localRanker(history,'short_term',now);
  assert.ok(local?.validation.ndcg>local?.validation.baselineNdcg);
  assert.equal(local.blend,.2);
  const sibling={...history,ranking:ranking.flatMap(s=>[s,{...s,id:`${s.id}_b`}])};
  assert.equal(localRanker(sibling,'short_term',now).blend,.2);
  const score=createMLScorer({history,seeds:[],careType:'short_term',now,bootstrapModel:null});
  assert.ok(Math.abs(score('known',{known:.4}).delta)<=.024);
  const saveModel=localRanker({...history,ranking:[make('one',now-200,3),make('two',now-100,3)]},'short_term',now);
  assert.ok(Math.abs(local.weights[1]-1)<Math.abs(saveModel.weights[1]-1));
  const mature=localRanker({...history,ranking:Array.from({length:8},(_,i)=>make(`m_${i}`,now-1000+i*100))},'short_term',now);
  assert.ok(mature.blend>local.blend);
  assert.equal(cleanSlates([{...ranking[0],version:'ep-ranking-v2-hours'}],now).length,0);
  const labelled=recordRankingFeedback(recordExposure(emptyInterests(),ranking[0],now),[{id:'known',careType:'short_term'}],'compare',now,'one');
  assert.equal(cleanSlates(labelled.ranking,now)[0].items[1].reward,1.25);
});

test('single and both child lists share preference-first ranking; pair reason is not always taken from child 1',()=>{
  const p=personal();p.history=recordInterest(p.history,rows.slice(0,2),'compare',new Date(now-1000).toISOString());
  const family=rankFamilyResults({a:response,b:response},p,{id:'family',at:now,mode:'demo'});
  assert.deepEqual([family.a[0].id,family.b[0].id],['preferred','preferred']);
  assert.equal(family.a[0].personalisedReason,family.b[0].personalisedReason);
  const a=rank([compared],p)[0], b=rank([preferred],p)[0];
  const items={a:[{...a.p,personalisedReason:a.reason,personalisedReasonContribution:a.reasonContribution}],
    b:[{...b.p,personalisedReason:b.reason,personalisedReasonContribution:b.reasonContribution}]};
  const pair=buildOptions(items).all.find(o=>o.kind==='pair');
  assert.equal(pair.reason,'Matches: Kind teachers');
  assert.ok(!/[0-9+%]/.test(pair.reason));
});
