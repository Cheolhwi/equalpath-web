// Append a versioned, public hours evidence snapshot; never update owner tables.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {applyHoursEvidence} from '../server/hours-overlay.mjs';
const root=resolve(import.meta.dirname,'../..'),backend=resolve(root,'appwrite-backend'),out=resolve(root,'webapp-data/hours-coverage-20260913');
const prepared=JSON.parse(readFileSync(resolve(out,'prepared-hours.json'))),{summary,records}=prepared;
const raw=JSON.parse(readFileSync(resolve(root,'webapp-data/prepared/catalog.json'))).map(r=>JSON.parse(r.payload));
applyHoursEvidence(raw,records,summary.baseRelease,summary.hash);
const rows=records.map(r=>({$id:'wh_'+createHash('sha256').update(summary.release+':'+r.provider_id).digest('hex').slice(0,30),provider_id:r.provider_id,release_id:summary.release,payload:JSON.stringify(r)}));
if(rows.some(r=>r.payload.length>12000))throw Error('Oversized evidence payload');
const plan={mode:'dry_run',table:'web_provider_evidence',rows:rows.length,release:summary.release,baseRelease:summary.baseRelease,manifest:'web_data_releases/current',owner_tables_mutated:0};
if(!process.argv.includes('--publish')){console.log(JSON.stringify(plan));process.exit(0);}
function cli(args){
 const r=spawnSync(resolve(backend,'node_modules/.bin/appwrite'),[...args,'--json'],{cwd:backend,encoding:'utf8',maxBuffer:8000000,timeout:60000});
 if(r.status!==0)throw Error(`Appwrite ${args[0]}/${args[1]} failed; credential output withheld`);
 return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
}
const table=['--database-id','equalpath','--table-id','web_provider_evidence'];
const manifestArgs=['--database-id','equalpath','--table-id','web_data_releases','--row-id','current'];
const before=cli(['tablesdb','get-row',...manifestArgs]);
if(before.release_id!==summary.baseRelease||before.status!=='ready')throw Error('Catalogue changed; prepare again');
writeFileSync(resolve(out,'manifest-before.json'),JSON.stringify(before,null,2));
const receipt={...plan,mode:'publish',startedAt:new Date().toISOString(),verified:0};
const save=()=>writeFileSync(resolve(out,'publication-receipt.json'),JSON.stringify(receipt,null,2));save();
for(let offset=0;offset<rows.length;offset+=20){
 const chunk=rows.slice(offset,offset+20),args=['tablesdb','upsert-rows',...table];
 for(const row of chunk)args.push('--rows',JSON.stringify(row));cli(args);
 const query=JSON.stringify({method:'equal',attribute:'$id',values:chunk.map(r=>r.$id)});
 const actual=cli(['tablesdb','list-rows',...table,'--queries',query,'--queries',JSON.stringify({method:'limit',values:[100]})]).rows;
 for(const row of chunk){const x=actual.find(r=>r.$id===row.$id);if(!x||x.payload!==row.payload||x.release_id!==row.release_id||x.provider_id!==row.provider_id)throw Error('Evidence readback mismatch');}
 receipt.verified+=chunk.length;save();console.log(JSON.stringify({verified:receipt.verified,total:rows.length}));
}
const current=cli(['tablesdb','get-row',...manifestArgs]);
if(current.release_id!==before.release_id||current.payload!==before.payload)throw Error('Manifest changed during publication; snapshot remains inactive');
const payload=JSON.stringify({...JSON.parse(before.payload),hours_release:summary.release,hours_hash:summary.hash,hours_count:rows.length,hours_published_at:new Date().toISOString()});
cli(['tablesdb','update-row',...manifestArgs,'--data',JSON.stringify({payload})]);
const after=cli(['tablesdb','get-row',...manifestArgs]);if(after.payload!==payload||after.release_id!==before.release_id)throw Error('Manifest readback mismatch');
receipt.completedAt=new Date().toISOString();receipt.manifestVerified=true;save();console.log(JSON.stringify(receipt));
