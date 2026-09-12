import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCatalog} from '../server/providers.mjs';
import {parseGoogleHours,parseSchemaHours,weekdays} from '../shared/hours-observations.mjs';
import {assessMatch,distanceMeters} from '../../webapp-data/scripts/google-crawler/core.mjs';
const base=resolve(import.meta.dirname,'../../webapp-data'),out=resolve(base,'hours-coverage-20260913');
const read=p=>JSON.parse(readFileSync(p));
const rows=read(resolve(base,'prepared/catalog.json')).map(r=>JSON.parse(r.payload));
const raw=new Map(rows.map(r=>[r.id,r])),baseRelease=read(resolve(base,'prepared/summary.json')).release_id;
const before=buildCatalog(rows,baseRelease),missing=before.items.filter(p=>!p.businessHours.windows.length);
const search=new Map(read(resolve(base,'source/google-full-search.json')).rows.map(r=>[r.provider_id,r]));
const waze=new Map();for(const file of readdirSync(resolve(out,'waze'))){const x=read(resolve(out,'waze',file));for(const id of x.providerIds)waze.set(id,x);}
const records=[],held=[];
for(const p of missing){
 const r=raw.get(p.id),g=search.get(p.id),file=resolve(base,'crawl/google/search',p.id+'.json');
 const saved=existsSync(file)?read(file):null,observations=[];
 if(g?.status==='matched'&&g.selected?.google_fid===saved?.selected?.google_fid){
  const parsed=parseGoogleHours(saved.selected.published_hours_snapshot);
  if(parsed.weekly_windows.length)observations.push({...parsed,source_url:saved.selected.source_url,source_kind:'google_maps_public_search',observed_on:saved.queried_at,match:g.selected.match,raw_hours:saved.selected.published_hours_snapshot});
 }
 const w=waze.get(p.id);
 if(w?.status==='observed'&&w.place){
  const a=w.place.address??{},candidate={name:w.place.name,address:[a.streetAddress,a.postalCode,a.addressLocality,a.addressRegion].filter(Boolean).join(', '),latitude:w.place.geo?.latitude,longitude:w.place.geo?.longitude,phone:w.place.telephone,country:a.addressCountry,structured_address:[null,null,null,null,null,a.addressRegion]};
  let match=assessMatch(r,candidate);const parsed=parseSchemaHours(w.place.openingHoursSpecification);
  const linkedDistance=g?.selected?distanceMeters(g.selected,candidate):null;
  if(match.status!=='matched'&&g?.status==='matched'&&g.selected.place_id===w.placeId&&match.within_coarse_service_area&&match.name_score>=0.8&&!match.house_number_conflict&&linkedDistance!==null&&linkedDistance<50){
   match={...match,status:'matched',basis:'Same place ID as the already address-verified Google branch, compatible name and coordinates within 50 metres; Waze has an abbreviated address.',google_source:g.selected.source_url,google_address:g.selected.address,google_place_id:g.selected.place_id,linked_distance_m:Math.round(linkedDistance),google_match:g.selected.match};
  }
  if(parsed.weekly_windows.length){
   if(match.status==='matched')observations.unshift({...parsed,source_url:w.sourceURL,source_kind:'waze_public_place',observed_on:w.retrievedAt,match,raw_hours:w.place.openingHoursSpecification,response_sha256:w.sha256});
   else held.push({id:p.id,name:p.name,reason:'waze_branch_match_unresolved',candidate,match});
  }
 }
 if(!observations.length)continue;
 const chosen=observations[0];
 // Retain both observations. Conflicting days are not promoted to care checks.
 const shape=(o,d)=>JSON.stringify({windows:o.weekly_windows.filter(w=>w.weekday===d).map(w=>[w.start_minute,w.end_minute]).sort(),closed:o.closed_weekdays.includes(d)});
 const known=(o,d)=>o.closed_weekdays.includes(d)||o.weekly_windows.some(w=>w.weekday===d);
 const conflicts=weekdays.filter(d=>observations.length>1&&observations.every(o=>known(o,d))&&shape(observations[0],d)!==shape(observations[1],d));
 const weekly=chosen.weekly_windows.filter(w=>!conflicts.includes(w.weekday));
 if(!weekly.length){held.push({id:p.id,name:p.name,reason:'all_open_days_conflict',conflicts,observations});continue;}
 records.push({provider_id:p.id,base_release:baseRelease,provider_name:p.name,weekly_windows:weekly,closed_weekdays:chosen.closed_weekdays.filter(d=>!conflicts.includes(d)),source_url:chosen.source_url,source_kind:chosen.source_kind,observed_on:chosen.observed_on,match:chosen.match,notes:conflicts.length?`Public sources disagree for ${conflicts.join(', ')}; these days remain unconfirmed.`:'Published branch opening hours; date-specific admission and capacity are not confirmed.',evidence:observations,conflicting_weekdays:conflicts});
}
records.sort((a,b)=>a.provider_id.localeCompare(b.provider_id));
const hash=createHash('sha256').update(JSON.stringify(records)).digest('hex'),release='hours_'+hash.slice(0,24);
const summary={preparedAt:new Date().toISOString(),baseRelease,release,hash,usable:before.items.length,beforeWithHours:before.items.length-missing.length,added:records.length,afterWithHours:before.items.length-missing.length+records.length,lateAdded:records.filter(r=>r.weekly_windows.some(w=>w.end_minute>1140)).length,held:held.length,crawl:read(resolve(out,'crawl-progress.json')),sources:Object.fromEntries([...new Set(records.map(r=>r.source_kind))].map(s=>[s,records.filter(r=>r.source_kind===s).length]))};
writeFileSync(resolve(out,'prepared-hours.json'),JSON.stringify({summary,records},null,2));writeFileSync(resolve(out,'held-hours.json'),JSON.stringify(held,null,2));console.log(JSON.stringify(summary,null,2));
