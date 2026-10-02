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

test('matrix: one table request, every needed pair, cached per pair', async () => {
  const urls = [];
  const fetcher = async (url) => { urls.push(new URL(url));
    const u = new URL(url), src = u.searchParams.get('sources').split(';'), dst = u.searchParams.get('destinations').split(';');
    return { ok: true, json: async () => ({ code: 'Ok',
      durations: src.map((s, i) => dst.map((d, j) => (Number(s) * 10 + Number(d)) * 60)), distances: src.map(() => dst.map(() => 1000)),
      sources: src.map(() => ({ distance: 5 })), destinations: dst.map(() => ({ distance: 5 })) }) };
  };
  const routes = createDrivingRoutes({ interval: 0, fetcher });
  const start = { lat: 3.13, lng: 101.67 };
  const rows = [{ id: 'a', location: { lat: 3.14, lng: 101.68 } }, { id: 'b', location: { lat: 3.15, lng: 101.69 } }, { id: 'c', location: { lat: 3.16, lng: 101.7 } }];
  const pairs = await routes.matrix(start, rows);
  assert.equal(urls.length, 1, 'one request for the whole family search');
  assert.equal(pairs.length, 3 + 3 * 2);
  assert.ok(pairs.every(p => p.driving.state === 'available'));
  const ab = pairs.find(p => p.from?.id === 'a' && p.to.id === 'b'), ba = pairs.find(p => p.from?.id === 'b' && p.to.id === 'a');
  assert.ok(ab.driving.minutes !== ba.driving.minutes, 'both directions are their own road time');
  // The same pairs are reused, including by the one-origin routes lookup.
  await routes.matrix(start, rows); assert.equal(urls.length, 1);
  assert.equal((await routes(start, rows))[0].driving.minutes, pairs.find(p => !p.from && p.to.id === 'a').driving.minutes);
  assert.equal(urls.length, 1);
});
test('matrix: a refused table request pauses lookups and reports busy, never a guess', async () => {
  let calls = 0, clock = 0;
  const routes = createDrivingRoutes({ interval: 0, now: () => clock, fetcher: async () => { calls++; return { ok: false, json: async () => ({}) }; } });
  const rows = [{ id: 'a', location: { lat: 3.14, lng: 101.68 } }, { id: 'b', location: { lat: 3.15, lng: 101.69 } }];
  const pairs = await routes.matrix({ lat: 3.13, lng: 101.67 }, rows);
  assert.ok(pairs.every(p => p.driving.state === 'unavailable'));
  await routes.matrix({ lat: 3.13, lng: 101.67 }, rows); assert.equal(calls, 1, 'paused for 30 s after a refusal');
});
