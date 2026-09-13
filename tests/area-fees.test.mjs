import test from 'node:test';
import assert from 'node:assert/strict';
import {areaFeeReferences} from '../shared/area-fees.mjs';
import {feeSummary} from '../shared/result-summary.mjs';
import {createAPI} from '../server/api.mjs';
const make=(id,amount,fields={})=>({id,name:id,region:'Selangor',district:'Petaling',category:'TASKA',fees:amount==null?[]:[{amount,basis:'month',verification:'provider_published',source:{url:'https://example.com/'+id,retrievedAt:'2026-09-13'}}],...fields});
const pool=[500,600,700,800,900].map((amount,i)=>make('sample'+i,amount));
test('area references require five distinct comparable providers and never replace known prices',()=>{
 assert.equal(areaFeeReferences([...pool.slice(0,4),make('target')],'2026-09-13').references.length,0);
 const {references}=areaFeeReferences([...pool,make('target')],'2026-09-13');
 assert.equal(references.length,1);assert.equal(references[0].provider_id,'target');
 const f=references[0].fee;assert.equal(f.min,600);assert.equal(f.max,800);assert.equal(f.estimate.sample_count,5);assert.equal(f.estimate.scope,'district');
 assert.equal(feeSummary({fees:[f]}).label,'Estimated MYR 600–800 / month');
});
test('older browser builds do not receive estimates they cannot label',async()=>{
 const provider={...make('target'),location:{lat:3.139,lng:101.6869},fees:[{min:600,max:800,basis:'month',verification:'area_estimate'}]};
 const api=createAPI({store:{catalog:async()=>({items:[provider],held:[],version:'v',release:'r'})}});
 const query={action:'nearby',mode:'live',center:provider.location};
 assert.equal((await api(query)).items[0].fees.length,0);
 assert.equal((await api({...query,features:['area-fees-v1']})).items[0].fees[0].verification,'area_estimate');
 assert.equal(provider.fees.length,1);
});
test('references do not use estimates, subsidy prices, extras, open-ended rates or different provider types as samples',()=>{
 const bad=[make('subsidy',20,{name:'Permata MAIWP'}),make('extra',80),make('estimate',900),make('from',null),make('other-type',900,{category:'TADIKA'})];
 bad[1].fees[0].kind='meal';bad[2].fees[0].verification='area_estimate';bad[3].fees=[{min:600,basis:'month',verification:'provider_published',source:{url:'https://example.com'}}];
 assert.equal(areaFeeReferences([...pool.slice(0,4),...bad,make('target')],'2026-09-13').references.some(r=>r.provider_id==='target'),false);
});
test('regional fallback is explicit and one school contributes once despite several programmes',()=>{
 const extra={...pool[0],fees:[...pool[0].fees,{...pool[0].fees[0],amount:650}]};
 const {references,samples}=areaFeeReferences([extra,...pool.slice(1),make('target',null,{district:'Sepang'})],'2026-09-13');
 assert.equal(samples.length,5);assert.equal(references[0].fee.estimate.scope,'region');assert.equal(references[0].fee.estimate.area,'Selangor');
});
