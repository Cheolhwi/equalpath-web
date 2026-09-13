// Read only the fields used by CariSchool's anonymous public school profiles.
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const out=resolve(import.meta.dirname,'../../webapp-data/source/directory-fees-20260913');
const sourceURL='https://www.carischools.com/school/tadika-holy-light-zon-bangsarpudu-kuala-lumpur';
const res=await fetch(sourceURL,{signal:AbortSignal.timeout(30000)});
if(!res.ok)throw Error('Public profile unavailable: '+res.status);
const html=await res.text();
const config=k=>html.match(new RegExp(`const ${k}\\s*=\\s*['\"]([^'\"]+)['\"]`))?.[1];
const endpoint=config('SB_URL'),publicKey=config('SB_KEY');
if(!endpoint||!publicKey||!new URL(endpoint).hostname.endsWith('.supabase.co'))throw Error('Unexpected public endpoint');
const fields=['id','name','commercial_name','slug','school_code','jkm_registration_no','address','state','district','category','fee_min','fee_max','monthly_fee','billing_period','registration_fee','annual_fee','fee_programs','fee_source_url','fee_document_url','fee_updated_at','is_claimed','registration_code_pending_since'];
for(const f of fields)if(!html.includes('s.'+f)&&!html.includes("'"+f+"'"))throw Error('Field not rendered by public profile: '+f);
mkdirSync(out,{recursive:true});
const rows=[];let expected;
for(let offset=0;offset<15000;offset+=200){
  const url=new URL(endpoint+'/rest/v1/schools');
  for(const [k,v] of Object.entries({select:fields.join(','),is_active:'eq.true',is_demo:'eq.false',state:'in.(SELANGOR,KUALA LUMPUR)',order:'id.asc',offset:String(offset),limit:'200'}))url.searchParams.set(k,v);
  let r;
  for(let attempt=0;attempt<3;attempt++){
    r=await fetch(url,{headers:{apikey:publicKey,Authorization:'Bearer '+publicKey,Prefer:'count=exact'},signal:AbortSignal.timeout(30000)});
    if(r.ok)break;if(![429,500,502,503,504].includes(r.status))throw Error('Public directory HTTP '+r.status);
    await new Promise(resolve=>setTimeout(resolve,2000*2**attempt));
  }
  if(!r.ok)throw Error('Public directory unavailable after retries');
  const page=await r.json(),total=Number(r.headers.get('content-range')?.split('/')[1]);
  if(!Array.isArray(page)||!Number.isFinite(total)||expected!==undefined&&total!==expected)throw Error('Incomplete/changing directory');
  expected=total;
  if(page.some(p=>!['SELANGOR','KUALA LUMPUR'].includes(p.state)))throw Error('Out of scope');
  rows.push(...page);writeFileSync(resolve(out,`page-${offset}.json`),JSON.stringify(page,null,2));
  console.log(JSON.stringify({collected:rows.length,total}));
  if(rows.length===expected)break;
  await new Promise(resolve=>setTimeout(resolve,1000));
}
if(!rows.length||rows.length!==expected||new Set(rows.map(p=>p.id)).size!==rows.length)throw Error('Incomplete collection');
const holy=rows.find(p=>p.slug==='tadika-holy-light-zon-bangsarpudu-kuala-lumpur');
let holyParentEstimate=null;
if(holy){
  // This same read-only aggregate appears on a profile with no other fee. No submissions or identities.
  const r=await fetch(endpoint+'/rest/v1/rpc/get_school_fee_estimate',{method:'POST',headers:{apikey:publicKey,Authorization:'Bearer '+publicKey,'Content-Type':'application/json'},body:JSON.stringify({p_school_id:holy.id}),signal:AbortSignal.timeout(30000)});
  if(r.ok)holyParentEstimate=await r.json();
}
const count=fn=>rows.filter(fn).length;
const manifest={retrieved_at:new Date().toISOString(),source_url:sourceURL,access:'Anonymous public profile fields; read only',scope:['Kuala Lumpur','Selangor'],count:rows.length,withRange:count(p=>p.fee_min>0),withEstimate:count(p=>p.monthly_fee>0&&!p.fee_min),withPrograms:count(p=>p.fee_programs?.length>0),withRegistration:count(p=>Number.isFinite(p.registration_fee)),withAnnual:count(p=>Number.isFinite(p.annual_fee)),sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),holyLight:{school_code:holy?.school_code,fee_min:holy?.fee_min,fee_max:holy?.fee_max,monthly_fee:holy?.monthly_fee,parentEstimate:holyParentEstimate,inputPlaceholder450:html.includes('id="feeSubmitInput" placeholder="450"')}};
writeFileSync(resolve(out,'rows.json'),JSON.stringify(rows,null,2));writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
