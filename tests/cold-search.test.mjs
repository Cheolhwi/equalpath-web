import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSearchStore } from '../server/search-catalog.mjs';
import { createPublishedStore } from '../server/published-catalog.mjs';
import { createAPI } from '../server/api.mjs';
import { prepareSearchCatalog } from '../scripts/prepare-search-catalog.mjs';

const root = new URL('../server/data/search-index/', import.meta.url);
const request = {careType:'short_term',pickup:{label:'Bangsar Village',address:'Jalan Telawi',lat:3.1297,lng:101.6714},date:'2026-09-30',deadline:'10:00',end:'12:00',age:'1-3',transport:'self',radius:10};
const features = ['area-fees-v1','search-summary-v1','defer-driving-v1'];
const wire = value => JSON.parse(JSON.stringify(value));
const options = { reverseGeocode:null, drivingRoutes:async (_,rows)=>rows.map(p=>({...p,driving:{state:'unavailable'}})) };

test('short-care cold search reads only its validated partition; individual reviews load on demand', async () => {
  const reads=[];
  const store=createSearchStore({read:async name=>{reads.push(name);return readFile(new URL(name,root));}});
  const api=createAPI({...options,store});
  const [a,b]=await Promise.all([api({action:'search',request,features}),api({action:'health'})]);
  assert.equal(a.items.length,10);assert.equal(b.available,101);
  assert.deepEqual(reads.sort(),['manifest.json','short_term.json.gz']);
  assert.ok(a.items.every(p=>p.reviewProfile.deferred&&p.reviewProfile.excerpts.length===0));
  const review=await api({action:'reviews',careType:'short_term',id:a.items[0].id,version:a.version});
  assert.ok(review.reviewProfile.excerpts.length>0);
  assert.equal(reads.filter(p=>p.startsWith('extras/')).length,1);
  await api({action:'reviews',careType:'short_term',id:a.items[0].id,version:a.version});
  assert.equal(reads.length,3);
});

test('prepared publication preserves full and compact search, fee, fit, review and regular-care contracts', async () => {
  const baseline=createAPI({...options,store:createPublishedStore()}), prepared=createAPI(options);
  for(const change of [{},{date:'2026-10-03'},{age:'4-6',deadline:'22:00',end:'23:00',includeConflicts:true},{careType:'regular',date:undefined,deadline:undefined,end:undefined}]) {
    for(const flags of [features,['area-fees-v1']]) {
      const body={action:'search',request:{...request,...change},features:flags};
      assert.deepEqual(wire(await prepared(body)),wire(await baseline(body)));
    }
  }
});

test('missing or corrupted search artifacts fail closed without database fallback', async t => {
  const fetch=t.mock.method(globalThis,'fetch',()=>{throw Error('No network allowed');});
  for(const corrupt of ['missing','tampered']) {
    const store=createSearchStore({read:async name=> {
      if(name==='short_term.json.gz') {if(corrupt==='missing')throw Error('Private path');return Buffer.from('broken');}
      return readFile(new URL(name,root));
    }});
    await assert.rejects(store.catalog('short_term'),e=>e.code===(corrupt==='missing'?'SOURCE_UNAVAILABLE':'SOURCE_INVALID'));
  }
  assert.equal(fetch.mock.callCount(),0);
});

test('release preparation preserves catalog content across compression runtimes', async () => {
  const directory=await mkdtemp(join(tmpdir(),'equalpath-prepared-'));
  try {
    const result=await prepareSearchCatalog(directory);
    // Node/zlib releases can encode identical bytes into slightly different
    // gzip sizes. Identity is the uncompressed SHA-256, byte count, membership
    // and source version; keep every one of those checks across platforms.
    const identity = value => JSON.parse(JSON.stringify(value, (key, field) => key === 'compressedBytes' ? undefined : field));
    assert.deepEqual(identity(result),identity(JSON.parse(await readFile(new URL('manifest.json',root),'utf8'))));
  } finally {await rm(directory,{recursive:true,force:true});}
});
