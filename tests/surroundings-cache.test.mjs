import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSurrounding,clearSurroundingsCache} from '../src/surroundings-cache.js';
test('photo cache deduplicates, persists, versions and clears', async () => {
 const oldFetch=globalThis.fetch,oldCaches=globalThis.caches;
 const store=new Map();let calls=0;
 globalThis.caches={open:async()=>({match:async k=>store.get(k)?.clone(),put:async(k,v)=>store.set(k,v),keys:async()=>[...store.keys()],delete:async k=>store.delete(k)}),keys:async()=>['equalpath:surroundings:v1'],delete:async()=>store.clear()};
 globalThis.fetch=async()=>{calls++;return new Response('photo',{headers:{'content-type':'image/jpeg'}});};
 try {
  await Promise.all([loadSurrounding('https://example.com/version1'),loadSurrounding('https://example.com/version1')]);assert.equal(calls,1);
  await loadSurrounding('https://example.com/version1');assert.equal(calls,1);
  await loadSurrounding('https://example.com/version2');assert.equal(calls,2);
  await clearSurroundingsCache();await loadSurrounding('https://example.com/version1');assert.equal(calls,3);
 }finally{globalThis.fetch=oldFetch;globalThis.caches=oldCaches;}
});
