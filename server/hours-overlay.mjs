import {createHash} from 'node:crypto';
import {safeURL} from './providers.mjs';
import {parsePublishedHours} from '../shared/published-hours.mjs';
const days=['MON','TUE','WED','THU','FRI','SAT','SUN'];
export function applyHoursEvidence(raw, records, baseRelease, expectedHash) {
 const sorted=[...records].sort((a,b)=>a.provider_id.localeCompare(b.provider_id));
 if(createHash('sha256').update(JSON.stringify(sorted)).digest('hex')!==expectedHash)throw Error('Invalid hours hash');
 const ids=new Set(raw.map(p=>p.id)),seen=new Set();
 for(const r of records){
  if(!ids.has(r.provider_id)||seen.has(r.provider_id)||r.base_release!==baseRelease||r.match?.status!=='matched'||!safeURL(r.source_url)||!Number.isFinite(Date.parse(r.observed_on))||!Array.isArray(r.weekly_windows)||!(r.weekly_windows.length||r.unscoped_windows?.length)||!Array.isArray(r.closed_weekdays)||!['waze_public_place','google_maps_public_search','provider_website','official_operator_schedule'].includes(r.source_kind))throw Error('Invalid hours evidence');
  if(r.unscoped_windows&&(!Array.isArray(r.unscoped_windows)||r.unscoped_windows.length>10||r.unscoped_windows.some(w=>!Number.isInteger(w.start_minute)||!Number.isInteger(w.end_minute)||w.start_minute<0||w.end_minute>1440||w.end_minute<=w.start_minute)))throw Error('Invalid undated hours interval');
  seen.add(r.provider_id);
  if(r.closed_weekdays.some(d=>!days.includes(d))||r.weekly_windows.some(w=>!days.includes(w.weekday)||!Number.isInteger(w.start_minute)||!Number.isInteger(w.end_minute)||w.start_minute<0||w.end_minute>1440||w.end_minute<=w.start_minute||r.closed_weekdays.includes(w.weekday)))throw Error('Invalid hours interval');
 }
 const byId=new Map(records.map(r=>[r.provider_id,r]));
 return raw.map(p=>{
  const r=byId.get(p.id);if(!r)return p;
  if(r.unscoped_windows?.length)p={...p,published_hours_schedule:{windows:r.unscoped_windows,notes:r.notes,source_url:r.source_url,source_kind:r.source_kind,retrieved_at:r.observed_on}};
  if(!r.weekly_windows.length)return p;
  const h=p.operating_hours??{};
  const existing=(h.weekly_windows??[]).filter(w=>!(h.excluded_estimated_weekdays??[]).includes(w.weekday));
  if(existing.length||parsePublishedHours(h.notes).windows.length)return {...p,additional_operating_hours:{weekly_windows:r.weekly_windows,closed_weekdays:r.closed_weekdays,notes:r.notes,source_url:r.source_url,source_kind:r.source_kind,retrieved_at:r.observed_on}};
  return {...p,operating_hours:{...h,weekly_windows:r.weekly_windows,closed_weekdays:r.closed_weekdays,excluded_estimated_weekdays:[],source_status:'observed',status:'observed',source_kind:r.source_kind,source_url:r.source_url,new_observation_source:r.source_url,observed_on:r.observed_on,source_retrieved_at:r.observed_on,notes:r.notes,unknown_weekdays:days.filter(d=>!r.closed_weekdays.includes(d)&&!r.weekly_windows.some(w=>w.weekday===d)),not_a_care_availability_guarantee:true}};
 });
}
