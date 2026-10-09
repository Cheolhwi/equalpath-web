// Metadata and public health only. Does not run the legacy scheduler, query
// owner rows, send external handovers, or read secret variable values.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),backend=resolve(root,'../appwrite-backend'),out=resolve(root,'evidence/telegram-cloud-20261010/read-budget');
function meta(args){
 const r=spawnSync(resolve(backend,'node_modules/.bin/appwrite'),[...args,'--json'],{cwd:backend,encoding:'utf8',timeout:45000,maxBuffer:2000000});
 if(r.status!==0)throw Error('Cloud metadata check failed; private response withheld.');
 return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
}
const expected={
 'web-enquiry-demo':JSON.parse(readFileSync(resolve(root,'evidence/telegram-cloud-20261010/deployment.json'))),
 'support-coordination':JSON.parse(readFileSync(resolve(out,'support-deployment.json'))),
};
const functions={};
for(const [id,receipt] of Object.entries(expected)){
 const fn=meta(['functions','get','--function-id',id]);
 const dep=meta(['functions','get-deployment','--function-id',id,'--deployment-id',receipt.deployment]);
 assert.equal(fn.deploymentId,receipt.deployment);assert.equal(dep.status,'ready');assert.equal(fn.logging,false);
 assert.equal(fn.schedule,id==='web-enquiry-demo'?'*/5 * * * *':'* * * * *');
 functions[id]={activeDeployment:fn.deploymentId,status:dep.status,schedule:fn.schedule};
}
const search=meta(['functions','get','--function-id','web-provider-query']);
assert.equal(search.deploymentId,'6ac8d86e0489029360e1');assert.equal(search.schedule,'* * * * *');
const table=meta(['tablesdb','get-table','--database-id','equalpath-enquiry-demo','--table-id','events']);
assert.deepEqual(table.$permissions,[]);assert.equal(table.rowSecurity,true);
assert.equal(table.columns.find(c=>c.key==='payload').encrypt,true);
assert.equal(table.indexes.find(i=>i.key==='parent_kind').status,'available');
const endpoint='https://equalpath-enquiry-demo-6a916a6c.appwrite.network';
const health=await (await fetch(endpoint+'/health',{signal:AbortSignal.timeout(30000)})).json();
assert.equal(health.readBudget.version,2);assert.equal(health.enabled,true);
const rules=meta(['proxy','list-rules']).rules||[];
const domain=rules.find(r=>r.deploymentResourceId==='support-coordination'&&/\.appwrite\.(run|network)$/.test(r.domain||''))?.domain;
assert(domain,'Expected existing support Function domain');
const support=await fetch('https://'+domain,{method:'HEAD',signal:AbortSignal.timeout(30000)});
assert.equal(support.status,200);assert.equal(support.headers.get('x-equalpath-read-budget'),'2');
const publicBuild=await (await fetch('https://equalpathcare.me/build-info.json',{signal:AbortSignal.timeout(30000)})).json();
const digest=createHash('sha256');
function hashPackage(dir,path=''){
 for(const name of readdirSync(resolve(dir,path),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const file=path?path+'/'+name.name:name.name;
  if(name.isDirectory())hashPackage(dir,file);else digest.update(file).update('\0').update(readFileSync(resolve(dir,file))).update('\0');
 }
}
hashPackage(resolve(root,'.build/enquiry'));
const receipt={checkedAt:new Date().toISOString(),functions,health,eventIndexAvailable:true,privateTableAndEncryptedPayload:true,
 enquiryPackageDigest:digest.digest('hex'),legacyPublicHeaderVersion:2,legacyPublicStatus:support.status,
 searchUnchanged:{deployment:search.deploymentId,schedule:search.schedule},publicWebsiteSource:publicBuild.source,
 websiteFeatureEnabled:JSON.parse(readFileSync(resolve(root,'src/enquiry-config.json'))).enabled,
 ownerRowsRead:false,ownerRowsMutated:false,legacySchedulerManuallyInvoked:false,webpagePublished:false,
 localContactVisualCheck:'blocked by saved browser permission denial for http://127.0.0.1:4186',productionBotUiCheck:'pending, feature disabled'};
writeFileSync(resolve(out,'cloud-verification.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
