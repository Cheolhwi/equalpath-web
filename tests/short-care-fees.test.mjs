import test from 'node:test';
import assert from 'node:assert/strict';
import {feeSummary,feesForCare,shortFeeFrom} from '../shared/result-summary.mjs';
import {sortProviders,suggestProviders,bestForPriority} from '../shared/conditions.mjs';
import {createAPI} from '../server/api.mjs';
import {fixtureCatalog,demoPickup} from '../server/fixtures.mjs';

const fee=(amount,basis,extra={})=>({amount,basis,currency:'MYR',kind:'care',...extra});
const row=(id,fees,extra={})=>({...structuredClone(fixtureCatalog.items[0]),id,name:id,careType:'short_term',fees,feeRule:null,cost:{available:false},distanceKm:1,location:demoPickup,fit:{counts:{conflict:0},conditions:[]},...extra});
test('short-stay displays exclude monthly budgets, other long-term periods and extras without converting them',()=>{
  const monthly=[fee(500,'month',{verification:'area_estimate'}),fee(100,'term'),fee(1500,'year'),fee(1,'hour',{kind:'meal'}),fee(20,'one_off',{kind:'registration'}),fee(40,'unspecified')];
  const p=row('monthly-only',monthly);
  assert.deepEqual(feesForCare(p),[]);assert.equal(feeSummary(p).label,'Ask the centre');assert.equal(shortFeeFrom(p),null);
  const hourly=row('hourly',[...monthly,fee(null,'hour',{min:40,max:60}),fee(160,'day')]);
  assert.equal(feeSummary(hourly).label,'MYR 40–60 / hour · MYR 160 / day');
  assert.deepEqual(shortFeeFrom(hourly),{basis:'hour',amount:40,group:1});
  assert.match(feeSummary({...p,careType:'regular'}).label,/Estimated MYR 500 \/ month/);
  const total=row('total',monthly,{cost:{available:true,currency:'MYR',total:90}});
  assert.equal(feeSummary(total).label,'MYR 90 estimated total');assert.deepEqual(shortFeeFrom(total),{basis:'total',amount:90,group:0});
});
test('price ranking compares short-stay billing periods separately and never rewards a monthly-only or unknown price',()=>{
  const rows=[row('hour-high',[fee(60,'hour')]),row('monthly',[fee(1,'month')]),row('hour-low',[fee(40,'hour')]),row('day',[fee(20,'day')]),row('session',[fee(40,'session')]),row('foreign',[fee(1,'hour',{currency:'USD'})]),row('conflict',[fee(1,'hour')],{fit:{counts:{conflict:1},conditions:[]}})];
  assert.deepEqual(sortProviders(rows,'price').map(p=>p.id),['hour-low','hour-high','session','day','foreign','monthly','conflict']);
  const best=bestForPriority(rows,'price');assert.deepEqual(best.ids,['hour-low']);assert.equal(best.label,'Lowest hourly fee');
  const suggested=suggestProviders(rows,{sort:'price',age:'',transport:'self'}).filter(p=>p.suggested).map(p=>p.id);
  assert.deepEqual(suggested.sort(),['hour-high','hour-low','session']);
  const unpriced=[rows[1],rows[5]];
  assert.deepEqual(bestForPriority(unpriced,'price').ids,[]);assert.ok(suggestProviders(unpriced,{sort:'price',age:'',transport:'self'}).every(p=>!p.suggested));
});
test('API price availability, ranking and comparison use short-stay rates while regular care keeps monthly fees',async()=>{
  const items=[row('monthly',[fee(1,'month')]),row('hourly',[fee(40,'hour')]),row('day',[fee(20,'day')])];
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items})},drivingRoutes:async(_,rows)=>rows});
  const request={careType:'short_term',pickup:demoPickup,date:'2026-09-21',deadline:'13:00',end:'17:00',transport:'self',sort:'price'};
  const short=await api({action:'search',request});
  assert.equal(short.ordering.available.price,true);assert.deepEqual(short.items.map(p=>p.id),['hourly','day','monthly']);
  assert.match(short.ordering.explanation,/grouped by billing period/);assert.equal(feeSummary(short.items.at(-1)).label,'Ask the centre');
  const compare=await api({action:'compare',request,ids:['monthly','hourly','day']});
  assert.deepEqual(compare.items.map(p=>p.id),['hourly','day','monthly']);assert.match(compare.ordering.explanation,/Monthly fees and extras are excluded/);
  const noPrice=await api({action:'compare',request,ids:['monthly']});assert.equal(noPrice.ordering.available.price,false);
  const regular=await api({action:'search',request:{...request,careType:'regular'}});
  assert.equal(regular.items[0].id,'monthly');assert.match(regular.ordering.explanation,/Lowest monthly/);
});
