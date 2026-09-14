import { createHash } from 'node:crypto';
import { safeURL, normalizeProvider } from './providers.mjs';
import { applyAdmissionsEvidence } from './admissions-overlay.mjs';
import { parsePublishedAge } from '../shared/published-ages.mjs';

export const additionsHash = records => createHash('sha256').update(JSON.stringify([...records].sort((a,b)=>a.provider_id.localeCompare(b.provider_id)))).digest('hex');
const text = (value,max) => typeof value==='string' && value.trim().length>0 && value.length<=max;
const days=['MON','TUE','WED','THU','FRI','SAT','SUN'];
const validSource = s => s && safeURL(s.url) && text(s.label,150) && Number.isFinite(Date.parse(s.retrievedAt)) && /^[a-f0-9]{64}$/.test(s.snapshotHash ?? '') && ['provider_website','public_directory','social_post_mirror','map_listing'].includes(s.kind);

// Add reviewed physical branches independently of the historical register import.
// An addition never replaces an existing ID or grants a government-registration badge.
export function applyProviderAdditions(raw, records, baseRelease, expectedHash) {
  if (!records.length || records.length>1000 || additionsHash(records)!==expectedHash) throw Error('Invalid additions snapshot');
  const ids=new Set(raw.map(p=>p.id));
  const identity=p=>[p.official_name,p.address].map(s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'')).join('|');
  const identities=new Set(raw.map(identity));
  const result=[...raw];
  for(const record of records){
    const p=record.provider, sources=p?.profile_sources;
    if(record.base_release!==baseRelease || !/^provider_[a-f0-9]{27}$/.test(record.provider_id??'') || p?.id!==record.provider_id || ids.has(p.id) || identities.has(identity(p)) ||
      !text(record.identity_review,800) || !text(p.official_name,200) || !text(p.address,500) || !text(p.district,100) ||
      p.registration!=null || !safeURL(p.website) || !Array.isArray(sources) || !sources.length || sources.length>8 || !sources.every(validSource) ||
      !validSource(p.public_profile) || !sources.some(s=>s.url===p.public_profile.url) ||
      !Number.isFinite(p.location?.latitude) || !Number.isFinite(p.location?.longitude) || !sources.some(s=>s.url===p.location.source_url) ||
      !sources.some(s=>s.url===p.contact_source?.source_url) || !Array.isArray(p.fees) ||
      p.fees.some(f=> !['hour','month','unspecified'].includes(f.basis) || !['care','tuition'].includes(f.kind) || !Number.isFinite(f.amount) || f.amount<0 || f.currency!=='MYR' || !sources.some(s=>s.url===f.source_url) || !text(f.conditions,600)) ||
      (p.care_windows??[]).some(w=>!w.days?.length || w.days.some(d=>!days.includes(d)) || !Number.isInteger(w.start) || !Number.isInteger(w.end) || w.start<0 || w.end>1440 || w.end<=w.start || !validSource(w.source)) ||
      (p.public_profile_notes??[]).some(n=>!text(n,600))) throw Error('Invalid added provider');
    const age=parsePublishedAge(p.age_source?.raw);
    if(p.age_min_months!=null && (!Number.isInteger(p.age_min_months)||p.age_min_months<0 || !Number.isInteger(p.age_max_months)||p.age_max_months<=p.age_min_months||p.age_max_months>216||!sources.some(s=>s.url===p.age_source?.source_url)||age?.min!==p.age_min_months||age?.max!==p.age_max_months)) throw Error('Invalid added age evidence');
    const h=p.operating_hours??{};
    if((h.weekly_windows??[]).some(w=>!days.includes(w.weekday)||!Number.isInteger(w.start_minute)||!Number.isInteger(w.end_minute)||w.start_minute<0||w.end_minute>1440||w.end_minute<=w.start_minute) || (h.closed_weekdays??[]).some(d=>!days.includes(d)) || ((h.weekly_windows?.length||h.closed_weekdays?.length)&&!sources.some(s=>s.url===h.source_url))) throw Error('Invalid added hours');
    const review=p.admission_review;
    if(review?.provider_id!==p.id || review.status!=='published' || review.scope!=='branch') throw Error('Missing branch short-care evidence');
    applyAdmissionsEvidence([p],[review],baseRelease,additionsHash([review]));
    const normalized=normalizeProvider(p,baseRelease);
    if(!normalized.provider?.location || !normalized.provider.phone || normalized.provider.admission.value!==true || normalized.provider.registration.number) throw Error('Added branch is not searchable/contactable');
    ids.add(p.id);identities.add(identity(p));result.push(p);
  }
  return result;
}
