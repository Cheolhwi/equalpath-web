import {createHash} from 'node:crypto';
import {safeURL} from './providers.mjs';
const bases = ['month','term','semester','year','one_off','deposit','hour','day','visit','unspecified'];
export function applyFeesEvidence(raw, records, baseRelease, expectedHash) {
  const sorted=[...records].sort((a,b)=>a.provider_id.localeCompare(b.provider_id));
  if(createHash('sha256').update(JSON.stringify(sorted)).digest('hex')!==expectedHash)throw Error('Invalid fees hash');
  const ids=new Set(raw.map(p=>p.id)),seen=new Set();
  for(const r of records){
    if(!ids.has(r.provider_id)||seen.has(r.provider_id)||r.base_release!==baseRelease||r.match?.status!=='matched'||!Array.isArray(r.fees)||!r.fees.length||r.fees.length>40)throw Error('Invalid fee identity');
    for(const f of r.fees){
      const min=f.amount??f.min,max=f.amount??f.max??min;
      if(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max<min||f.currency!=='MYR'||!bases.includes(f.basis)||!safeURL(f.source_url)||!Number.isFinite(Date.parse(f.source_retrieved_at))||typeof f.conditions!=='string'||!['school_reported_via_directory','directory_published','directory_estimate','provider_published','area_estimate'].includes(f.verification))throw Error('Invalid fee fact');
      if(f.verification==='area_estimate'&&(!Number.isInteger(f.estimate?.sample_count)||f.estimate.sample_count<5||f.estimate.sample_provider_ids?.length!==f.estimate.sample_count||new Set(f.estimate.sample_provider_ids).size!==f.estimate.sample_count||f.estimate.sample_provider_ids.includes(r.provider_id)||f.basis!=='month'||f.source_kind!=='area_fee_reference'||!Array.isArray(f.estimate.reference_urls)||f.estimate.reference_urls.some(u=>!safeURL(u))))throw Error('Invalid budget reference');
      for(const link of [f.original_fee_source_url,f.fee_document_url])if(link&&!safeURL(link))throw Error('Invalid fee source link');
    }
    if(!Array.isArray(r.replaces_sources)||r.replaces_sources.some(u=>!safeURL(u)))throw Error('Invalid replacement scope');
    seen.add(r.provider_id);
  }
  const byId=new Map(records.map(r=>[r.provider_id,r]));
  return raw.map(p=>{
    const r=byId.get(p.id);if(!r)return p;
    // Replace only refreshed source facts; keep prices from other sources with their own provenance.
    const fees=[...(p.fees??[]).filter(f=>!r.replaces_sources.includes(f.source_url)),...r.fees];
    return {...p,fees};
  });
}
