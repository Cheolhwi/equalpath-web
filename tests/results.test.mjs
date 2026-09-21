import test from "node:test";
import assert from "node:assert/strict";
import { createDrivingRoutes } from "../server/driving.mjs";
import { createAPI } from "../server/api.mjs";
import { fixtureCatalog, demoPickup } from "../server/fixtures.mjs";
import { sortProviders, suggestProviders, bestForPriority } from "../shared/conditions.mjs";
import { feeSummary } from "../shared/result-summary.mjs";
import { areaMoved, nearbyCacheKey } from "../shared/map-search.mjs";
import { canonicalRequest } from "../shared/request.mjs";
const origin = { lat: 3.139, lng: 101.6869 };
const places = [{ id:"a", location:{lat:3.15,lng:101.7} },{ id:"b",location:{lat:3.16,lng:101.72} }];
const response = { ok:true, json:async()=>({code:"Ok",durations:[[433, null]],distances:[[5485.2,null]],sources:[{distance:10}],destinations:[{distance:10},{distance:10}]}) };
test("regular care retains its 10 km cap and 20-item pages, including unlimited requests", async()=>{
  const base = fixtureCatalog.items[0];
  const north = km => ({ lat: origin.lat + km / 6371 * 180 / Math.PI, lng: origin.lng });
  const items = [
    ...Array.from({length:22},(_,i)=>({...base,id:`near-${i}`,location:north(4)})),
    {...base,id:"edge-inside",location:north(9.999)},
    {...base,id:"edge-outside",location:north(10.001)},
    {...base,id:"far",location:north(30)},
    {...base,id:"unlocated",location:null},
    {...base,id:"invalid",location:{lat:NaN,lng:origin.lng}},
  ];
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items})},drivingRoutes:async(_,rows)=>{
    assert.ok(rows.every(p=>Number.isFinite(p.distanceKm)&&p.distanceKm<=10));return rows;
  }});
  const request={careType:"regular",pickup:demoPickup,age:"",transport:"self"};
  for(const radius of [undefined,null,"",25,50,100000,"50",-1,"invalid"]){
    const r=await api({action:"search",request:{...request,radius}});
    assert.equal(r.request.radius,10);assert.equal(r.total,23);assert.equal(r.items.length,20);assert.equal(r.missingLocations,0);
    const last=await api({action:"search",request:{...request,radius},page:1});
    assert.equal(last.items.length,3);
    assert.ok([...r.items,...last.items].every(p=>p.distanceKm<=10));
    const nearby=await api({action:"nearby",careType:"regular",center:origin,radius});
    assert.equal(nearby.radius,10);assert.equal(nearby.total,23);assert.equal(nearby.items.length,20);
    assert.ok(nearby.items.every(p=>p.distanceKm<=10));
  }
  const r=await api({action:"search",request:{...request,radius:5}});
  assert.equal(r.request.radius,5);assert.equal(r.total,22);
  assert.equal((await api({action:"nearby",careType:"regular",center:origin,radius:5})).total,22);
  assert.equal(canonicalRequest({...request,radius:"5"}).radius,5);
});
test("no located centres within range returns an empty result without expanding the search",async()=>{
  const base=fixtureCatalog.items[0];
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items:[{...base,id:"unknown",location:null},{...base,id:"far",location:{lat:3.5,lng:101.7}}]})},drivingRoutes:async(_,rows)=>rows});
  const request={pickup:demoPickup,date:"2026-09-14",deadline:"13:00",end:"18:00"};
  for(const body of [{action:"search",request},{action:"nearby",center:origin}]){
    const r=await api(body);assert.equal(r.total,0);assert.deepEqual(r.items,[]);
  }
});
test("short-care search reports only fully checked centres as explicit matches", async () => {
  const base = fixtureCatalog.items[0];
  const request = { pickup: demoPickup, date: "2026-09-14", deadline: "13:00", end: "18:00", age: "4", transport: "self" };
  const api = createAPI({
    store: {
      catalog: async () => ({
        ...fixtureCatalog,
        items: [
          { ...base, id: "confirmed", admission: { value: true, requirements: [] } },
          { ...base, id: "needs-confirmation", admission: undefined },
          { ...base, id: "does-not-fit", admission: { value: false } },
        ],
      }),
    },
    drivingRoutes: async (_, rows) => rows,
  });
  const result = await api({ action: "search", request });
  assert.equal(result.total, 3);
  assert.equal(result.explicitMatchCount, 1);
  assert.deepEqual(
    result.items.find((p) => p.id === "confirmed").fit.conditions
      .filter((condition) => condition.id !== "transfer")
      .map((condition) => condition.state),
    ["supported", "supported", "supported", "supported", "supported", "supported"],
  );
});
test("driving uses one bounded table, caches pairs across search/compare and coalesces concurrent requests", async()=>{
  let calls=0;
  const routes=createDrivingRoutes({interval:0,fetcher:async url=>{
    calls++;assert.equal(url.searchParams.get("sources"),"0");assert.equal(url.searchParams.get("destinations"),"1;2");assert.equal(url.searchParams.has("fallback_speed"),false);return response;
  }});
  const [a,b]=await Promise.all([routes(origin,places),routes(origin,places)]);
  assert.deepEqual(a,b);assert.equal(a[0].driving.minutes,8);assert.equal(a[0].driving.distanceKm,5.5);assert.equal(a[1].driving.reason,"no_route");
  await routes(origin,[places[0]]);assert.equal(calls,1);
});
test("routing timeout/failure has a short cooldown and recovers without inventing travel times",async()=>{
  let clock=0,calls=0;
  const routes=createDrivingRoutes({interval:0,now:()=>clock,fetcher:async()=>{calls++;if(calls===1)throw Error("offline");return response;}});
  assert.equal((await routes(origin,places))[0].driving.state,"unavailable");
  await routes(origin,places);assert.equal(calls,1);clock=31000;
  assert.equal((await routes(origin,places))[0].driving.minutes,8);assert.equal(calls,2);
});
test("remote road snaps and null route values are not represented as zero-minute trips",async()=>{
  const routes=createDrivingRoutes({interval:0,fetcher:async()=>({ok:true,json:async()=>({...await response.json(),destinations:[{distance:900},{distance:10}]})})});
  const out=await routes(origin,[...places,{id:"c",location:null}]);
  assert.equal(out[0].driving.reason,"location_too_far_from_road");assert.equal(out[1].driving.reason,"no_route");assert.equal(out[2].driving.reason,"missing_location");
});
test("each short-care page of ten retains close conflicts, ranks them last and stays stable across strategies",async()=>{
  const base=fixtureCatalog.items[0];
  const items=Array.from({length:45},(_,i)=>({...base,id:String(i).padStart(2,"0"),name:`Centre ${44-i}`,location:{lat:origin.lat+(i+1)*.0009,lng:origin.lng},admission:{value:i%7!==0}})).reverse();
  const batches=[];
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items})},drivingRoutes:async(o,rows)=>{batches.push(rows);assert.ok(rows.length<=10);return rows;}});
  const request={pickup:demoPickup,date:"2026-09-14",deadline:"13:00",end:"18:00",age:"4",transport:"self",radius:5};
  for(const sort of ["distance","price","closing","pickup","name"]){
    const pages=[];
    for(let page=0;page<5;page++){
      const result=await api({action:"search",request:{...request,sort},page});
      pages.push(...result.items);
      const expected=Array.from({length:Math.min(10,45-page*10)},(_,i)=>String(i+page*10).padStart(2,"0"));
      assert.deepEqual(result.items.map(p=>p.id).sort(),expected);
      assert.equal(result.total,45);assert.equal(result.ordering.pageSelection,"nearest");
      const firstConflict=result.items.findIndex(p=>p.fit.counts.conflict>0);
      assert.ok(firstConflict>0);assert.ok(result.items.slice(firstConflict).every(p=>p.fit.counts.conflict>0));
      assert.ok(result.items.filter(p=>p.fit.counts.conflict>0).every(p=>!p.suggested));
      if(page===0)assert.ok(result.items.some(p=>p.id==="00"&&p.fit.counts.conflict>0));
    }
    assert.equal(new Set(pages.map(p=>p.id)).size,45);
  }
  const without=await api({action:"search",request:{...request,includeConflicts:false}});
  assert.equal(without.total,38);assert.equal(without.items.length,10);assert.ok(without.items.every(p=>!p.fit.counts.conflict));
  const before=batches.length;
  await api({action:"nearby",center:origin});assert.equal(batches.length,before);
});
test("a short-care neighbourhood of conflicting centres still returns the nearest ten without suggesting them",async()=>{
  const base=fixtureCatalog.items[0];
  const items=Array.from({length:25},(_,i)=>({...base,id:String(i).padStart(2,"0"),location:origin,admission:{value:false}})).reverse();
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items})},drivingRoutes:async(_,rows)=>rows});
  const request={pickup:demoPickup,date:"2026-09-14",deadline:"13:00",end:"18:00",transport:"self"};
  const result=await api({action:"search",request});
  assert.equal(result.total,25);assert.equal(result.items.length,10);
  assert.deepEqual(result.items.map(p=>p.id),Array.from({length:10},(_,i)=>String(i).padStart(2,"0")));
  assert.ok(result.items.every(p=>p.fit.counts.conflict>0&&!p.suggested));
});
test("fee summaries keep hourly/monthly ranges separate and only show totals with a complete rule",()=>{
  assert.equal(feeSummary({fees:[]}).label,"Ask the centre");
  const p={fees:[{amount:600,basis:"month"},{amount:1200,basis:"month"},{amount:20,basis:"hour"},{amount:null,basis:"visit"}]};
  assert.equal(feeSummary(p).label,"MYR 600–1,200 / month · MYR 20 / hour");
  assert.match(feeSummary({...p,cost:{available:true,total:90,currency:"MYR"}}).label,/90 estimated total/);
});
test("neighbourhood threshold ignores tiny movements; cache keys separate modes and radii",()=>{
  assert.equal(areaMoved(origin,{...origin,lat:3.1391}),false);assert.equal(areaMoved(origin,{...origin,lat:3.15}),true);
  assert.equal(nearbyCacheKey({center:origin}),nearbyCacheKey({center:{...origin,lat:3.13901}}));
  assert.notEqual(nearbyCacheKey({center:origin}),nearbyCacheKey({center:origin,mode:"demo"}));
});
test("map suggestions prefer stronger relevant matches, cap at three and exclude conflicts or unmappable centres",()=>{
  const p=(id,n,conflict=0,location=origin)=>({id,distanceKm:Number(id),location,fit:{counts:{conflict},conditions:[{id:"care",state:n>0?"supported":"unknown"},{id:"admission",state:n>1?"supported":"unknown"}]}});
  const rows=[p("1",0),p("2",2),p("3",1),p("4",2),p("5",2,1),p("6",2,0,null)];
  assert.deepEqual(suggestProviders(rows,{age:"",transport:"self"}).filter(p=>p.suggested).map(p=>p.id),["2","3","4"]);
  assert.equal(suggestProviders([p("1",2,1)],{age:"",transport:"self"}).some(p=>p.suggested),false);
});
test("comparison highlights switch with priority, share ties, and never prefer conflicts or missing facts",()=>{
  const p=(id,distance,end,pickup,conflict=0)=>({id,name:id,location:origin,distanceKm:distance,transport:{exists:pickup},careWindows:end==null?[]:[{days:["TUE"],start:420,end}],fit:{counts:{conflict},conditions:[]}});
  const rows=[p("near",1,1140,false),p("late",2,1200,true),p("tied",3,1200,true),p("conflict",.1,1380,true,1),p("unknown",null,null,null)];
  const date="2026-09-15";
  assert.deepEqual(bestForPriority(rows,"distance",date).ids,["near"]);
  assert.deepEqual(bestForPriority(rows,"closing",date).ids,["late","tied"]);
  assert.deepEqual(bestForPriority(rows,"pickup",date).ids,["late","tied"]);
  assert.deepEqual(bestForPriority(rows,"name",date).ids,[]);
  assert.deepEqual(bestForPriority(rows.slice(3),"closing",date).ids,[]);
  assert.deepEqual(bestForPriority(rows,"closing","2026-09-16").ids,[]);
});
test("map suggestions follow the selected strategy before fit-count tie breakers",()=>{
  const rows=Array.from({length:4},(_,i)=>({id:String(i),name:String(i),location:origin,distanceKm:i+1,careWindows:[{days:["TUE"],start:420,end:1080+i*60}],fit:{counts:{conflict:0},conditions:[]}}));
  const r={age:"",transport:"self",date:"2026-09-15"};
  assert.deepEqual(suggestProviders(rows,{...r,sort:"distance"}).filter(p=>p.suggested).map(p=>p.id),["0","1","2"]);
  assert.deepEqual(suggestProviders(rows,{...r,sort:"closing"}).filter(p=>p.suggested).map(p=>p.id),["1","2","3"]);
});
