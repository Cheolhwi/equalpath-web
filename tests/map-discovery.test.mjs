import test from "node:test";
import assert from "node:assert/strict";
import { createAPI } from "../server/api.mjs";
import { fixtureCatalog } from "../server/fixtures.mjs";
import { createPlaceSearch, photonPlaces, placeQuery } from "../server/places.mjs";
import { DEFAULT_MAP, readMapMemory, writeMapMemory, mapStorageKey } from "../shared/map-memory.mjs";
const feature = (id, name, coordinate = [101.6865153, 3.1341106]) => ({ type: "Feature", geometry: { type: "Point", coordinates: coordinate }, properties: { osm_type: "N", osm_id: id, name, city: "Kuala Lumpur", osm_value: "station" } });
test("OSM places are independent of provider data; typo terms reach the fuzzy geocoder", async () => {
  let query;
  const api = createAPI({ store: { catalog: () => { throw Error("directory down"); } }, placeSearch: async (q) => { query = q; return { items: [{ label: "KL Sentral" }] }; } });
  const r = await api({ action: "places", query: "KL sentrl" });
  assert.equal(query, "KL sentrl"); assert.equal(r.items[0].label, "KL Sentral");
});
test("Photon sends bounded general place queries, expands Malay abbreviations, coalesces and caches", async () => {
  let calls = 0;
  const search = createPlaceSearch({ interval: 0, fetcher: async (url) => {
    calls++; assert.equal(url.searchParams.get("q"), "Jalan Ampang");
    assert.equal(url.searchParams.has("osm_tag"), false);
    assert.equal(url.searchParams.get("bbox"), "100.7,2.55,102.05,3.95");
    return { ok: true, json: async () => ({ features: [feature(1, "Jalan Ampang")] }) };
  } });
  const [a,b] = await Promise.all([search("Jln Ampang"), search("Jln Ampang")]);
  assert.deepEqual(a,b); await search("Jln Ampang"); assert.equal(calls, 1);
  assert.equal(placeQuery("tmn Melati kg Baru"), "Taman Melati Kampung Baru");
  await search("a"); assert.equal(calls, 1);
});
test("OSM results exclude Putrajaya, other states, malformed coordinates and duplicate IDs", () => {
  const items = photonPlaces({ features: [feature(1,"KL Sentral"),feature(1,"KL Sentral"),feature(5,"KL Sentral",[101.68652,3.13411]),feature(2,"Putrajaya",[101.6964,2.9264]),feature(3,"Singapore",[103.8,1.3]), feature(4,"broken",[null,null])] });
  assert.equal(items.length,1); assert.equal(items[0].id,"osm:N:1"); assert.equal(items[0].source,"OpenStreetMap");
});
test("geocoder failures never fabricate places or poison the retry cache", async () => {
  let calls = 0;
  const search = createPlaceSearch({ interval: 0, fetcher: async () => ({ ok: ++calls > 1, json: async () => ({ features: [] }) }) });
  await assert.rejects(search("station"), { code: "PLACE_SEARCH_UNAVAILABLE" });
  assert.deepEqual((await search("station")).items, []); assert.equal(calls,2);
});
test("confirmed pickup reverse lookup is bounded, shared, cached, and never moves the pickup to a road centroid", async()=>{
  let calls=0;
  const point={lat:3.1624,lng:101.5728};
  const search=createPlaceSearch({interval:0,fetcher:async url=>{
    calls++;assert.equal(url.pathname,"/reverse/");assert.equal(url.searchParams.get("layer"),"street");assert.equal(url.searchParams.get("radius"),"1");
    return {ok:true,json:async()=>({features:[{...feature(2,"Persiaran Sungai Buloh",[101.5736214,3.1638001]),properties:{osm_key:"highway",name:"Persiaran Sungai Buloh",locality:"Taman Industri Sungai Buloh",city:"Petaling Jaya"}}]})};
  }});
  const [a,b]=await Promise.all([search.reverse(point),search.reverse(point)]);
  assert.deepEqual(a,b);assert.match(a.pickup.label,/^Persiaran Sungai Buloh, Taman Industri/);
  assert.equal(a.pickup.lat,point.lat);assert.equal(a.pickup.lng,point.lng);assert.equal(a.pickup.id,null);
  const nearbyPoint={lat:3.1624001,lng:101.5728001};const cached=await search.reverse(nearbyPoint);
  assert.equal(calls,1);assert.equal(cached.pickup.lat,nearbyPoint.lat);
  await assert.rejects(search.reverse({lat:1,lng:1}),{code:"OUTSIDE_SERVICE_AREA"});assert.equal(calls,1);
});
test("reverse is independent of directory health and ignores far-away or unnamed roads",async()=>{
  const reverse=createPlaceSearch({interval:0,fetcher:async()=>({ok:true,json:async()=>({features:[feature(1,"Another city",[101.8,3.5]),feature(2,"Shop")]})})}).reverse;
  const api=createAPI({store:{catalog:()=>{throw Error("offline");}},reverseGeocode:reverse});
  assert.equal((await api({action:"reverse",point:DEFAULT_MAP.center})).pickup,null);
  await assert.rejects(api({action:"reverse",point:{lat:"3",lng:101}}),{code:"OUTSIDE_SERVICE_AREA"});
});
test("nearby discovery works without date/time and returns distance-ordered coordinates without fit claims", async () => {
  const api = createAPI({ store: { catalog: async () => fixtureCatalog } });
  const r = await api({ action: "nearby", center: DEFAULT_MAP.center });
  assert.ok(r.items.length > 0); assert.ok(r.items.length <= 20);
  for (const [i,p] of r.items.entries()) {
    assert.ok(p.location); assert.ok(p.distanceKm <= 10); assert.equal(p.fit,undefined); assert.equal(p.enquiries,undefined);
    if(i) assert.ok(r.items[i-1].distanceKm <= p.distanceKm);
  }
  await assert.rejects(api({ action: "nearby", center: {lat:2.9264,lng:101.6964} }), { code:"OUTSIDE_SERVICE_AREA" });
  await assert.rejects(api({ action: "nearby", center: {lat:"3.1",lng:101.68} }), { code:"OUTSIDE_SERVICE_AREA" });
});
test("last-map memory restores geographic state only, separated by mode; broken or blocked storage is harmless", () => {
  const rows = new Map(); const storage = { getItem: (k) => rows.get(k), setItem: (k,v) => rows.set(k,v) };
  const value = { ...DEFAULT_MAP, pickup: { id:"osm:N:1",label:"KL Sentral",lat:3.1341,lng:101.6865,age:4 }, date:"2026-09-20", age:4, items:[{id:1}] };
  assert.equal(writeMapMemory(storage,"live",value),true);
  const saved = readMapMemory(storage,"live");
  assert.equal(saved.pickup.label,"KL Sentral"); assert.equal(saved.date,undefined); assert.equal(saved.age,undefined); assert.equal(saved.pickup.age,undefined); assert.equal(saved.items,undefined);
  assert.equal(readMapMemory(storage,"demo"),null);
  rows.set(mapStorageKey("live"),"broken"); assert.equal(readMapMemory(storage,"live"),null);
  assert.equal(writeMapMemory(storage,"live",{...value,center:{lat:NaN,lng:101}}),false);
  assert.equal(writeMapMemory({setItem:()=>{throw Error();}},"live",value),false);
});
