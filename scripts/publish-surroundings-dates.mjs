import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),backend=resolve(root,'../appwrite-backend');
const records=JSON.parse(readFileSync(resolve(root,'evidence/surroundings-capture-dates.json'))).records;
const ta=['--database-id','equalpath','--table-id','web_provider_photos'];
function cli(args){for(let n=0;n<3;n++){const r=spawnSync(resolve(backend,'node_modules/.bin/appwrite'),[...args,'--json'],{cwd:backend,encoding:'utf8',timeout:60000,maxBuffer:2000000});if(r.status===0)return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));if(n===2)throw Error('Appwrite photo date update failed: '+args.slice(0,2).join('/'));}}
const list=()=>cli(['tablesdb','list-rows',...ta,'--queries',JSON.stringify({method:'limit',values:[100]})]).rows;
const before=list();if(before.length<92||records.length!==92)throw Error('Unexpected provider count');
const canonical = r => r.$id === 'p_'+createHash('sha256').update(r.provider_id).digest('hex').slice(0,32);
const byId=new Map(before.filter(canonical).map(r=>[r.provider_id,r]));
let count=0;
for(const record of records){
 const row=byId.get(record.provider_id);if(!row||!/^\d{4}-(0[1-9]|1[0-2])$/.test(record.captureDate))throw Error('Missing provider or date');
 const payload=JSON.parse(row.payload);
 Object.assign(payload,{captureDate:record.captureDate,captureDateSource:record.sourceUrl,panoramaId:record.panorama_id});
 for(const image of payload.images||[])image.captureDate=record.captureDate;
 cli(['tablesdb','update-row',...ta,'--row-id',row.$id,'--data',JSON.stringify({payload:JSON.stringify(payload)})]);
 if(++count%20===0)console.log(`Updated ${count}/92`);
}
const wanted=new Set(records.map(r=>r.provider_id));
const actual=list().filter(r=>wanted.has(r.provider_id)&&canonical(r)),index={};
if(actual.length!==records.length)throw Error('Missing readback records');
for(const row of actual){const prior=byId.get(row.provider_id),expected=records.find(r=>r.provider_id===row.provider_id),p=JSON.parse(row.payload),old=JSON.parse(prior.payload);if(p.captureDate!==expected.captureDate||p.panoramaId!==expected.panorama_id||p.url!==old.url||JSON.stringify(p.images.map(i=>i.version))!==JSON.stringify(old.images.map(i=>i.version)))throw Error('Date readback or image preservation failed');index[row.provider_id]=p;}
writeFileSync(resolve(root,'src/surroundings.json'),JSON.stringify(index,null,2)+'\n');
writeFileSync(resolve(root,'evidence/surroundings-dates-publication.json'),JSON.stringify({checkedAt:new Date().toISOString(),providers:actual.length,datesReadbackVerified:true,imageFilesUnchanged:true,table:'web_provider_photos'},null,2)+'\n');
console.log('Verified 92 photo-date records; image files unchanged.');
