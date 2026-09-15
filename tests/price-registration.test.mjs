import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyFeeFrom} from '../shared/result-summary.mjs';
import {sortProviders,suggestProviders,bestForPriority} from '../shared/conditions.mjs';
import {registrationBadge} from '../shared/registration.mjs';
import {createAPI} from '../server/api.mjs';
import {fixtureCatalog,demoPickup} from '../server/fixtures.mjs';
const fee=(amount,fields={})=>({amount,currency:'MYR',basis:'month',kind:'programme',...fields});
const row=(id,fees,conflict=0)=>({id,name:id,fees,distanceKm:1,location:{lat:3.139,lng:101.6869},fit:{counts:{conflict},conditions:[]}});
test('monthly price uses care starting rates and never treats other periods, currencies or extras as cheap care',()=>{
  const fees=[fee(900),fee(null,{min:600,max:1000}),fee(50,{kind:'meal'}),fee(20,{kind:'transport'}),fee(10,{kind:'registration'}),fee(1,{basis:'unspecified'}),fee(25,{basis:'hour'}),fee(5,{currency:'USD'})];
  assert.equal(monthlyFeeFrom({fees}),600);
  assert.equal(monthlyFeeFrom({fees:fees.slice(2)}),null);
  assert.equal(monthlyFeeFrom({fees:[fee(null,{min:450,max:null})]}),450);
  assert.equal(monthlyFeeFrom({fees:[fee(0)]}),0);
});
test('price priority keeps conflicts last, includes labelled budgets and excludes unknown prices from highlights',()=>{
  const rows=[row('high',[fee(900)]),row('budget',[fee(null,{min:450,max:650,verification:'area_estimate'})]),row('tie',[fee(450)]),row('unknown',[fee(10,{basis:'unspecified'})]),row('conflict',[fee(5)],1)];
  assert.deepEqual(sortProviders(rows,'price','2026-09-14').map(p=>p.id),['budget','tie','high','unknown','conflict']);
  assert.deepEqual(bestForPriority(rows,'price','2026-09-14').ids,['budget','tie']);
  assert.deepEqual(suggestProviders(rows,{sort:'price',age:'',transport:'self'}).filter(p=>p.suggested).map(p=>p.id),['high','budget','tie']);
  assert.equal(suggestProviders([rows[3]],{sort:'price',age:'',transport:'self'})[0].suggested,false);
});
test('price sorts each nearest page without replacing nearby centres with farther cheaper ones',async()=>{
  const base=fixtureCatalog.items[0],items=Array.from({length:25},(_,i)=>({...base,id:`price-${i}`,name:`Price ${i}`,location:{lat:demoPickup.lat+i*.001,lng:demoPickup.lng},fees:[fee(1000-i*10)],feeRule:null}));
  items.push({...base,id:'unknown',location:{lat:demoPickup.lat+.03,lng:demoPickup.lng},fees:[fee(1,{basis:'unspecified'})]});
  items.push({...base,id:'outside-cheapest',location:{lat:3.5,lng:101.6869},fees:[fee(1)]}, {...base,id:'unlocated-cheapest',location:null,fees:[fee(0)]});
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items})},drivingRoutes:async(_,rows)=>rows});
  const request={careType:'regular',pickup:demoPickup,transport:'self',sort:'price'};
  const first=await api({action:'search',request}),second=await api({action:'search',request,page:1});
  assert.equal(first.request.sort,'price');assert.equal(first.ordering.available.price,true);assert.match(first.ordering.explanation,/monthly.*Estimated/s);
  assert.equal(first.total,26);assert.equal(first.items.length,20);assert.equal(second.items.length,6);
  assert.equal(first.items[0].id,'price-19');assert.equal(first.items.at(-1).id,'price-0');assert.equal(second.items[0].id,'price-24');assert.equal(second.items.at(-1).id,'unknown');
  assert.equal(first.ordering.pageSelection,'nearest');assert.match(first.ordering.explanation,/next 20 nearest.*within 10 km/);
});
test('registration badges distinguish imported government records, listed codes and inactive registrations',()=>{
  const today='2026-09-14',p={mode:'live',registration:{authority:'JKM',number:'A123',official:true,match:'existing_registered_record',until:'2027-01-01',source:{url:'https://www.jkm.gov.my/main/taska'}}};
  assert.equal(registrationBadge(p,today).state,'official');
  assert.equal(registrationBadge({...p,registration:{...p.registration,authority:'KPM',official:false}},today).state,'listed');
  assert.equal(registrationBadge({...p,registration:{...p.registration,until:'2026-08-01'}},today).state,'attention');
  assert.equal(registrationBadge({...p,registration:{...p.registration,from:'2027-01-01'}},today).state,'attention');
  assert.equal(registrationBadge({...p,registration:{...p.registration,match:'unresolved'}},today).state,'attention');
  assert.equal(registrationBadge({...p,mode:'demo'},today),null);
  assert.equal(registrationBadge({...p,registration:{...p.registration,number:null}},today),null);
  assert.equal(registrationBadge({...p,registration:{...p.registration,source:null}},today),null);
});
