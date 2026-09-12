// Resume public hours collection for usable KL/Selangor records without windows.
// This collector writes observations only. Preparation reviews branch matches.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {buildCatalog} from '../server/providers.mjs';
const root=resolve(import.meta.dirname,'../..');
const out=resolve(root,'webapp-data/hours-coverage-20260913');
const dir=resolve(out,'waze');mkdirSync(dir,{recursive:true});
const rows=JSON.parse(readFileSync(resolve(root,'webapp-data/prepared/catalog.json'))).map(r=>JSON.parse(r.payload));
const raw=new Map(rows.map(r=>[r.id,r]));
const search=new Map(JSON.parse(readFileSync(resolve(root,'webapp-data/source/google-full-search.json'))).rows.map(r=>[r.provider_id,r]));
const catalog=buildCatalog(rows,'web_79f1397603c1e28325955f64');
const queue=new Map();
for(const p of catalog.items.filter(p=>!p.businessHours.windows.length)){
 const google=search.get(p.id);const id=(google?.status==='matched'&&google.selected?.place_id)||raw.get(p.id).google_place_id;
 if(!/^ChIJ[\w-]+$/.test(id??''))continue;
 if(!queue.has(id))queue.set(id,{placeId:id,providerIds:[]});queue.get(id).providerIds.push(p.id);
}
const interval=Math.max(1200,Number(process.env.HOURS_INTERVAL_MS)||1200),workers=Math.min(2,Math.max(1,Number(process.env.HOURS_WORKERS)||2));
const retryLimited=process.argv.includes('--retry-limited');
let cursor=0,done=0,blocked=null,nextAt=0;const work=[...queue.values()];
if(retryLimited){
 const previous=work.map(i=>resolve(dir,i.placeId+'.json')).filter(existsSync).map(f=>JSON.parse(readFileSync(f))).filter(r=>r.status==='access_limited');
 nextAt=Math.max(0,...previous.map(r=>Date.parse(r.retrievedAt)+Math.max(300000,Number(r.retryAfter)*1000||0)));
 if(nextAt>Date.now())console.log(JSON.stringify({cooldownUntil:new Date(nextAt).toISOString(),interval,workers}));
}

const save=()=>writeFileSync(resolve(out,'crawl-progress.json'),JSON.stringify({updatedAt:new Date().toISOString(),total:work.length,completed:done,blocked},null,2));
async function pace(){const slot=Math.max(nextAt,Date.now());nextAt=slot+interval;await new Promise(r=>setTimeout(r,slot-Date.now()));}
async function worker(){while(cursor<work.length&&!blocked){
 const item=work[cursor++],file=resolve(dir,item.placeId+'.json');
 if(existsSync(file)){
  const previous=JSON.parse(readFileSync(file));
  if(!(retryLimited&&previous.status==='access_limited')){done++;continue;}
  const archive=resolve(out,'attempts');mkdirSync(archive,{recursive:true});writeFileSync(resolve(archive,item.placeId+'-'+Date.parse(previous.retrievedAt)+'.json'),JSON.stringify(previous,null,2));
 }
 const url='https://www.waze.com/en-GB/live-map/directions?to=place.'+item.placeId;
 const result={...item,requestedURL:url,retrievedAt:new Date().toISOString()};
 try{await pace();if(blocked)break;const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'EqualPathCoursework/1.0 public-institution-hours'}});result.httpStatus=r.status;result.sourceURL=r.url;
  if([403,429].includes(r.status)){result.status='access_limited';result.retryAfter=r.headers.get('retry-after');blocked={status:r.status,retryAfter:result.retryAfter};}
  else if(!r.ok)result.status='unavailable';
  else{const html=await r.text();if(html.length>2500000)throw Error('oversized');if(/<title[^>]*>[^<]*(?:unusual traffic|verify you are human|access denied)/i.test(html)){result.status='challenge';blocked={status:'challenge'};}else{
   result.sha256=createHash('sha256').update(html).digest('hex');
   const blocks=[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m=>{try{const x=JSON.parse(m[1]);return Array.isArray(x)?x:[x];}catch{return []}});
   result.place=blocks.find(x=>x['@type']==='Place'||x.openingHoursSpecification);
   result.status=result.place?'observed':'no_place_details';
  }}
 }catch(e){result.status='fetch_failed';result.error=e.cause?.code??e.message;}
 writeFileSync(file,JSON.stringify(result,null,2));done++;save();if(done%50===0||blocked)console.log(JSON.stringify({completed:done,total:work.length,blocked}));
}}
await Promise.all(Array.from({length:workers},()=>worker()));save();console.log(JSON.stringify({completed:done,total:work.length,blocked,output:dir}));
