import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouteCache } from '../shared/route-cache.mjs';
import { createDrivingRoutes } from '../server/driving.mjs';

const results={version:'v1',request:{careType:'short_term',pickup:{lat:3.13,lng:101.67},date:'2026-09-30',end:'12:00'},items:[{id:'a'},{id:'b'}]};
const response=body=>({version:body.version,items:body.ids.map(id=>({id,driving:{state:'available',minutes:8}}))});
test('changing date/time reuses route pairs and only new centres need a lookup',async()=>{
  const calls=[];const cache=createRouteCache(async body=>{calls.push(body);return response(body);});
  await cache.load(results,'live');
  const changed={...results,request:{...results.request,date:'2026-10-01',end:'15:00'}};
  assert.equal(cache.snapshot(changed,'live').items[0].driving.minutes,8);
  await cache.load(changed,'live');assert.equal(calls.length,1);
  await cache.load({...changed,items:[{id:'b'},{id:'c'}]},'live');assert.deepEqual(calls[1].ids,['c']);
  await cache.load({...changed,version:'v2'},'live');assert.equal(calls.length,3);
  await cache.load(changed,'demo');assert.equal(calls.length,4);
  await cache.load({...changed,request:{...changed.request,pickup:{lat:3.15,lng:101.67}}},'live');assert.equal(calls.length,5);
});
test('in-flight routes are shared, and clearing local data blocks stale cache writes',async()=>{
  let release,calls=0;const gate=new Promise(r=>release=r);
  const cache=createRouteCache(async body=>{calls++;await gate;return response(body);});
  const a=cache.load(results,'live'),b=cache.load(results,'live');
  await Promise.resolve();assert.equal(calls,1);
  cache.clear();release();await Promise.all([a,b]);
  assert.ok(cache.snapshot(results,'live').items.every(p=>p.driving.state==='loading'));
  await cache.load(results,'live');assert.equal(calls,2);
});
test('failed routes have a short retry window; successful routes expire after a day',async()=>{
  let now=0,calls=0;const cache=createRouteCache(async body=>{if(++calls===1)throw Error();return response(body);},{now:()=>now});
  assert.equal((await cache.load(results,'live')).items[0].driving.state,'unavailable');
  await cache.load(results,'live');assert.equal(calls,1);
  now=31000;await cache.load(results,'live');assert.equal(calls,2);
  now+=86400001;await cache.load(results,'live');assert.equal(calls,3);
});
test('route budget covers queued work; an outage pauses new external lookups',async()=>{
  let calls=0;
  const routes=createDrivingRoutes({interval:0,budgetMs:50,timeoutMs:30,fetcher:async(_url,{signal})=>{
    calls++;await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  }});
  const start=performance.now();
  const rows=await Promise.all([0,1,2].map(i=>routes({lat:3.13+i*.001,lng:101.67},[{id:'a',location:{lat:3.14,lng:101.68}}])));
  assert.ok(performance.now()-start<200);
  assert.ok(rows.flat().every(p=>p.driving.state==='unavailable'));
  assert.equal(calls,1);
});
