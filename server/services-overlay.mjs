import {createHash} from 'node:crypto';
import {safeURL} from './providers.mjs';
import {whatsappLink} from '../shared/whatsapp.mjs';
import {parsePublishedHours} from '../shared/published-hours.mjs';
import {parsePublishedAge} from '../shared/published-ages.mjs';
const days=['MON','TUE','WED','THU','FRI','SAT','SUN'];
export function applyServicesEvidence(raw, records, baseRelease, expectedHash) {
  const sorted=[...records].sort((a,b)=>a.provider_id.localeCompare(b.provider_id));
  if(createHash('sha256').update(JSON.stringify(sorted)).digest('hex')!==expectedHash)throw Error('Invalid services hash');
  const ids=new Set(raw.map(p=>p.id)),seen=new Set();
  for(const r of records){
    if(!ids.has(r.provider_id)||seen.has(r.provider_id)||r.base_release!==baseRelease||r.match?.status!=='matched'||!safeURL(r.source_url)||!Number.isFinite(Date.parse(r.observed_on))||!Array.isArray(r.whatsapp)||r.whatsapp.length>5||r.whatsapp.some(w=>!whatsappLink(w))||!['kiddy123_directory','provider_website'].includes(r.source_kind))throw Error('Invalid services evidence');
    if(r.transport && (![true,false,null].includes(r.transport.published)||typeof r.transport.wording!=='string'))throw Error('Invalid transport evidence');
    if(r.age){
      const parsed=parsePublishedAge(r.age.raw);
      if(!parsed||parsed.min!==r.age.min_months||parsed.max!==r.age.max_months)throw Error('Invalid admission age evidence');
    }
    if(r.website_contact && (!safeURL(r.website_contact.source_url)||!Number.isFinite(Date.parse(r.website_contact.retrieved_at))||!Array.isArray(r.website_contact.links)||r.website_contact.links.length<1||r.website_contact.links.length>3||(r.website_contact.scope!=null&&!['branch','website'].includes(r.website_contact.scope))||r.website_contact.links.some(w=>!whatsappLink(w))))throw Error('Invalid website contact');
    if(r.hours && (!Array.isArray(r.hours.weekly_windows)||!Array.isArray(r.hours.closed_weekdays)||r.hours.closed_weekdays.some(d=>!days.includes(d))||r.hours.weekly_windows.some(w=>!days.includes(w.weekday)||!Number.isInteger(w.start_minute)||!Number.isInteger(w.end_minute)||w.start_minute<0||w.end_minute>1440||w.end_minute<=w.start_minute||r.hours.closed_weekdays.includes(w.weekday))))throw Error('Invalid services hours');
    seen.add(r.provider_id);
  }
  const byId=new Map(records.map(r=>[r.provider_id,r]));
  return raw.map(p=>{
    const r=byId.get(p.id);if(!r)return p;
    const evidence={source_url:r.source_url,retrieved_at:r.observed_on,source_kind:r.source_kind};
    const contacts=r.whatsapp.map(url=>({url,...evidence,scope:'branch'}));
    if(!contacts.length&&r.website_contact)contacts.push(...r.website_contact.links.map(url=>({url,source_url:r.website_contact.source_url,retrieved_at:r.website_contact.retrieved_at,source_kind:'provider_website',scope:r.website_contact.scope==='branch'?'branch':'website'})));
    const updated={...p,whatsapp_contacts:contacts,transport:r.transport?{...p.transport,...r.transport,...evidence}:p.transport};
    if(!p.public_phone&&r.phone){updated.public_phone=r.phone;updated.contact_source=evidence;}
    if(r.age){
      const age={raw:r.age.raw,...evidence};
      if(p.age_min_months==null){
        updated.age_min_months=r.age.min_months;updated.age_max_months=r.age.max_months;updated.age_source=age;
      }else updated.additional_admission_age=age;
    }
    const h=p.operating_hours??{};
    // Existing sourced hours retain precedence. New contradictory observations are held by the preparer.
    if(r.hours?.weekly_windows.length&&!(h.weekly_windows??[]).some(w=>!(h.excluded_estimated_weekdays??[]).includes(w.weekday))&&!parsePublishedHours(h.notes).windows.length){
      updated.operating_hours={...h,...r.hours,excluded_estimated_weekdays:[],source_status:'observed',status:'observed',source_kind:r.source_kind,source_url:r.source_url,new_observation_source:r.source_url,observed_on:r.observed_on,source_retrieved_at:r.observed_on,not_a_care_availability_guarantee:true};
    } else if(r.hours?.weekly_windows.length) {
      updated.additional_operating_hours={...r.hours,...evidence};
    }
    return updated;
  });
}
