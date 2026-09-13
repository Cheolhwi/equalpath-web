import {createHash} from 'node:crypto';
const extra=f=>['meal','transport','registration','deposit','annual','late_pickup'].includes(f.kind);
const publicOperator=p=>/maiwp|kemas|perpaduan/i.test(p.registeredName??p.name);
const trusted=new Set(['provider_published','directory_published','school_reported_via_directory']);
const quantile=(v,q)=>{const a=[...v].sort((x,y)=>x-y),i=(a.length-1)*q;return a[Math.floor(i)]+(a[Math.ceil(i)]-a[Math.floor(i)])*(i%1);};
export function areaFeeReferences(providers,evidenceAsOf){
 const samples=providers.filter(p=>!publicOperator(p)).flatMap(p=>{
  const fees=(p.fees??[]).filter(f=>f.basis==='month'&&!extra(f)&&trusted.has(f.verification)&&Number.isFinite(f.amount??f.min)&&Number.isFinite(f.amount??f.max)&&f.source?.url&&f.source.kind!=='official_operator_schedule');
  if(!fees.length)return [];
  return [{id:p.id,region:p.region,district:p.district,category:p.category,min:Math.min(...fees.map(f=>f.amount??f.min)),max:Math.max(...fees.map(f=>f.amount??f.max)),sources:[...new Set(fees.map(f=>f.source.url))],retrievedAt:fees.map(f=>f.source.retrievedAt).filter(Boolean).sort().at(-1)}];
 });
 const references=[];
 for(const p of providers){
  // Never replace a price, copy a subsidised tariff to private care, or use estimates as samples.
  if(p.fees?.length||publicOperator(p))continue;
  const type=samples.filter(s=>s.category===p.category&&s.id!==p.id);
  let pool=type.filter(s=>s.region===p.region&&s.district===p.district),scope='district',area=`${p.district}, ${p.region}`;
  if(pool.length<5){pool=type.filter(s=>s.region===p.region);scope='region';area=p.region;}
  if(pool.length<5){pool=type;scope='service_area';area='KL and Selangor';}
  if(pool.length<5)continue;
  pool.sort((a,b)=>a.id.localeCompare(b.id));
  const min=Math.max(50,Math.floor(quantile(pool.map(s=>s.min),0.25)/50)*50),max=Math.max(min,Math.ceil(quantile(pool.map(s=>s.max),0.75)/50)*50);
  const urls=[...new Set(pool.flatMap(s=>s.sources))];
  const estimate={method:'Provider-level 25th percentile of lower programme prices to 75th percentile of upper programme prices; rounded outwards to MYR 50',scope,area,category:p.category,sample_count:pool.length,sample_provider_ids:pool.map(s=>s.id),sample_hash:createHash('sha256').update(JSON.stringify(pool)).digest('hex'),reference_urls:urls.slice(0,5),evidence_as_of:evidenceAsOf};
  references.push({provider_id:p.id,fee:{amount:null,min,max,currency:'MYR',basis:'month',kind:'programme',programme:'Area budget reference',verification:'area_estimate',source_kind:'area_fee_reference',source_url:urls[0],source_retrieved_at:pool.map(s=>s.retrievedAt).filter(Boolean).sort().at(-1)??evidenceAsOf,source_updated_at:null,original_fee_source_url:null,fee_document_url:null,estimate,conditions:`Estimated monthly budget based on ${pool.length} ${p.category} centres in ${area}. This is an area reference, not this centre's quote. Registration, transport and one-off care are separate.`}});
 }
 return {samples,references};
}
