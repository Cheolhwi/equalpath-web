import test from 'node:test';
import assert from 'node:assert/strict';
import {createAPI} from '../server/api.mjs';
import {fixtureCatalog,demoPickup} from '../server/fixtures.mjs';

const request={careType:'short_term',pickup:demoPickup,date:'2026-09-21',deadline:'13:00',end:'17:00',transport:'self',sort:'price'};
const provider=(id,i,fees=[])=>({...structuredClone(fixtureCatalog.items[0]),id,name:id,location:{lat:demoPickup.lat+i*.001,lng:demoPickup.lng},fees,feeRule:null});
const fee={amount:30,basis:'hour',currency:'MYR',kind:'care'};
const apiFor=items=>createAPI({store:{catalog:async()=>({...fixtureCatalog,items})},drivingRoutes:async(_,rows)=>rows});
test('missing short-stay and monthly quotes reset the active sort before results and suggestions are calculated',async()=>{
  const api=apiFor([provider('near',0,[{...fee,basis:'month'}]),provider('far',1)]);
  const short=await api({action:'search',request});
  assert.equal(short.request.sort,'distance');assert.equal(short.ordering.factor,'distance');assert.equal(short.ordering.available.price,false);
  assert.deepEqual(short.ordering.fallback,{from:'price',to:'distance',reason:'No fees listed nearby.'});
  assert.deepEqual(short.items.map(p=>p.id),['near','far']);assert.ok(short.items.some(p=>p.suggested));
  const regular=await apiFor([provider('hourly',0,[fee])])({action:'search',request:{...request,careType:'regular'}});
  assert.equal(regular.request.sort,'distance');assert.equal(regular.ordering.unavailableReasons.price,'No monthly fees listed nearby.');
});
test('page-specific availability does not claim the whole radius has no quote and quoted later pages remain sortable',async()=>{
  const api=apiFor(Array.from({length:12},(_,i)=>provider(String(i).padStart(2,'0'),i,i>=10?[{...fee,amount:42-i}]:[])));
  const first=await api({action:'search',request});
  assert.equal(first.request.sort,'distance');assert.equal(first.total,12);
  assert.equal(first.ordering.unavailableReasons.price,'No fees on this page.');
  const next=await api({action:'search',request,page:1});
  assert.equal(next.request.sort,'price');assert.equal(next.ordering.available.price,true);assert.equal(next.ordering.fallback,undefined);
  assert.deepEqual(next.items.map(p=>p.id),['11','10']);
  const filtered=await api({action:'search',request:{...request,query:'01'}});
  assert.match(filtered.ordering.unavailableReasons.price,/No fees for these results/);
});
test('comparison resets after the last quoted centre is removed; expiry of hours and missing pickup have specific reasons',async()=>{
  const unknown=provider('unknown',2),other=provider('other',1);
  for(const p of [unknown,other]){p.careWindows=[];p.businessHours={windows:[],closedDays:[]};p.lateRule=null;p.transport={exists:null};}
  const api=apiFor([provider('priced',0,[fee]),unknown,other]);
  const before=await api({action:'compare',request,ids:['priced','unknown','other']});assert.equal(before.request.sort,'price');
  for(const sort of ['price','closing','pickup']){
    const after=await api({action:'compare',request:{...request,sort},ids:['unknown','other']});
    assert.equal(after.request.sort,'distance');assert.equal(after.ordering.factor,'distance');assert.equal(after.ordering.available[sort],false);
    assert.match(after.ordering.unavailableReasons[sort],/^No /);
    assert.deepEqual(after.items.map(p=>p.id),['other','unknown']);
  }
  const valid=await api({action:'search',request:{...request,sort:'closing'}});
  assert.equal(valid.ordering.available.closing,true);assert.equal(valid.request.sort,'closing');
});
test('foreign-currency fees and empty results give accurate reasons without retaining price order',async()=>{
  const foreign=await apiFor([provider('usd',0,[{...fee,currency:'USD'}])])({action:'search',request});
  assert.match(foreign.ordering.unavailableReasons.price,/No comparable MYR fees/);assert.equal(foreign.request.sort,'distance');
  const empty=await apiFor([])({action:'search',request});
  assert.equal(empty.total,0);assert.equal(empty.request.sort,'distance');assert.match(empty.ordering.unavailableReasons.price,/No fees listed nearby/);
  assert.ok(Object.values(empty.ordering.unavailableReasons).every(reason=>!reason.includes('Unavailable')));
});
