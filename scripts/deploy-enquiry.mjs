// Provisions only the isolated enquiry demo. No owner/search resources changed.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {DATABASE,TABLE} from '../server/enquiry/store.mjs';
const root=resolve(import.meta.dirname,'..'),backend=resolve(root,'../appwrite-backend'),id='web-enquiry-demo';
const cli=resolve(backend,'node_modules/.bin/appwrite');
const scopes=['rows.read','rows.write'];
const recoverySchedule='*/5 * * * *';
const run=(args,missing=false)=>{
 const r=spawnSync(cli,[...args,'--json'],{cwd:backend,encoding:'utf8',timeout:60000,maxBuffer:2000000});
 if(r.status!==0) { if(missing&&/not found|could not be found|not exist/i.test(r.stdout+r.stderr))return null; throw Error(`Appwrite ${args.slice(0,2).join('/')} failed (private response withheld).`); }
 return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
};
await import('./package-enquiry.mjs');
if(!process.argv.includes('--deploy'))process.exit(0);
if(!run(['tablesdb','get','--database-id',DATABASE],true))run(['tablesdb','create','--database-id',DATABASE,'--name','EqualPath enquiry demo']);
const ta=['--database-id',DATABASE,'--table-id',TABLE];
if(!run(['tablesdb','get-table',...ta],true))run(['tablesdb','create-table',...ta,'--name','Private short-lived enquiry events','--row-security=true','--enabled=true']);
let table=run(['tablesdb','get-table',...ta]);assert.deepEqual(table.$permissions||[],[]);assert.equal(table.rowSecurity,true);
for(const [key,size] of [['parent',64],['kind',24]])if(!table.columns?.some(x=>x.key===key))run(['tablesdb','create-varchar-column',...ta,'--key',key,'--size',String(size),'--required=true']);
if(!table.columns?.some(x=>x.key==='payload'))run(['tablesdb','create-text-column',...ta,'--key','payload','--required=true','--encrypt=true']);
for(const key of ['expiresAt','count'])if(!table.columns?.some(x=>x.key===key))run(['tablesdb','create-integer-column',...ta,'--key',key,'--required=true','--min','0']);
for(let n=0;n<20;n++) {table=run(['tablesdb','get-table',...ta]);if(table.columns?.length===5&&table.columns.every(x=>x.status==='available'))break;if(n===19)throw Error('Demo columns pending.');await new Promise(r=>setTimeout(r,1000));}
for(const key of ['parent','expiresAt','kind'])if(!table.indexes?.some(x=>x.key===key))run(['tablesdb','create-index',...ta,'--key',key,'--type','key','--columns',key]);
if(!table.indexes?.some(x=>x.key==='parent_kind'))run(['tablesdb','create-index',...ta,'--key','parent_kind','--type','key','--columns','parent','--columns','kind']);
for(let n=0;n<20;n++){
 const index=run(['tablesdb','get-table',...ta]).indexes?.find(x=>x.key==='parent_kind');
 if(index?.status==='available')break;
 if(index?.status==='failed'||n===19)throw Error('Demo event index pending or failed.');
 await new Promise(r=>setTimeout(r,1000));
}
const before=run(['functions','get','--function-id',id],true);
if(!before)run(['functions','create','--function-id',id,'--name','EqualPath Telegram enquiry demo','--runtime','node-22','--execute','any','--timeout','60','--enabled=true','--logging=false','--entrypoint','server/enquiry/function.mjs','--commands','node --version','--runtime-specification','s-0.5vcpu-512mb','--schedule','0 * * * *',...scopes.flatMap(s=>['--scopes',s])]);
const fn=run(['functions','get','--function-id',id]);
assert.equal(fn.runtime,'node-22');assert.deepEqual(fn.execute,['any']);assert.equal(fn.entrypoint,'server/enquiry/function.mjs');assert.equal(fn.logging,false);assert.deepEqual([...(fn.scopes||[])].sort(),scopes.sort());
if(fn.schedule!==recoverySchedule)run(['functions','update','--function-id',id,'--name',fn.name,'--runtime','node-22','--execute','any','--timeout','60','--enabled=true','--logging=false','--entrypoint',fn.entrypoint,'--commands','node --version','--runtime-specification','s-0.5vcpu-512mb','--schedule',recoverySchedule,...scopes.flatMap(s=>['--scopes',s]),'--force']);
const dep=run(['functions','create-deployment','--function-id',id,'--entrypoint','server/enquiry/function.mjs','--commands','node --version','--code',resolve(root,'.build/enquiry'),'--activate=true']);
const receipt={at:new Date().toISOString(),function:id,database:DATABASE,table:TABLE,publicTablePermissions:[],deployment:dep.$id,status:dep.status,queueConcurrency:1,queueRecoverySchedule:recoverySchedule,ownerResourcesChanged:false,searchFunctionChanged:false};
mkdirSync(resolve(root,'evidence/telegram-cloud-20261010'),{recursive:true});writeFileSync(resolve(root,'evidence/telegram-cloud-20261010/deployment.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
