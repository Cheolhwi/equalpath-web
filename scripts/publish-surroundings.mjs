import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),backend=resolve(root,'../appwrite-backend');
const source=resolve(process.argv[2]||resolve(root,'../outputs/surrounding-photos-20261008/website-toned'));
const rows=JSON.parse(readFileSync(resolve(source,'manifest.json')));
const bucket='web-surroundings',table='web_provider_photos',project='6a916a6c0030a70a9d75',endpoint='https://sgp.cloud.appwrite.io/v1';
function cli(args,missing=false){const r=spawnSync(resolve(backend,'node_modules/.bin/appwrite'),[...args,'--json'],{cwd:backend,encoding:'utf8',timeout:60000,maxBuffer:2000000});if(r.status!==0){if(missing&&/not found|could not be found|not exist/i.test(r.stdout+r.stderr))return null;throw Error('Appwrite '+args.slice(0,2).join('/')+' failed: '+(r.stderr+r.stdout).replace(/https?:\/\/[^\s]+/g,'[url]').slice(0,500));}return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));}
const ta=['--database-id','equalpath','--table-id',table];
if(!cli(['storage','get-bucket','--bucket-id',bucket],true))cli(['storage','create-bucket','--bucket-id',bucket,'--name','Website surroundings','--permissions','read("any")','--file-security=false','--enabled=true','--maximum-file-size','5000000','--allowed-file-extensions','jpg','--compression','none','--encryption=true','--antivirus=true']);
const b=cli(['storage','get-bucket','--bucket-id',bucket]);if(b.$permissions?.length!==1||b.$permissions[0]!=='read("any")')throw Error('Unexpected bucket permissions');
if(!cli(['tablesdb','get-table',...ta],true))cli(['tablesdb','create-table',...ta,'--name','Website provider photos','--permissions','read("any")','--row-security=false']);
let t=cli(['tablesdb','get-table',...ta]);
if(t.$permissions?.length!==1||t.$permissions[0]!=='read("any")')throw Error('Unexpected table permissions');
for(const [key,size] of Object.entries({provider_id:128,bucket_id:64,file_id:64,version:64,payload:8000})){
 if(!t.columns?.some(c=>c.key===key))cli(['tablesdb','create-varchar-column',...ta,'--key',key,'--size',String(size),'--required=true']);
}
for(let n=0;n<30;n++){t=cli(['tablesdb','get-table',...ta]);if(t.columns?.length===5&&t.columns.every(c=>c.status==='available'))break;if(n===29)throw Error('Columns not ready');await new Promise(r=>setTimeout(r,1000));}
const index={};let count=0;
for(const row of rows){
 const path=resolve(source,row.toned),bytes=readFileSync(path),version=createHash('sha256').update(bytes).digest('hex'),fileId='s_'+version.slice(0,32);
 if(!cli(['storage','get-file','--bucket-id',bucket,'--file-id',fileId],true))cli(['storage','create-file','--bucket-id',bucket,'--file-id',fileId,'--file',path]);
 const url=`${endpoint}/storage/buckets/${bucket}/files/${fileId}/view?project=${project}`;
 const metadata={url,version,source:'Google Street View',captureDate:null,reviewStatus:row.review_status,reviewNote:row.reason};
 const rowId='p_'+createHash('sha256').update(row.provider_id).digest('hex').slice(0,32);
 const data={provider_id:row.provider_id,bucket_id:bucket,file_id:fileId,version,payload:JSON.stringify(metadata)};
 cli(['tablesdb','upsert-row',...ta,'--row-id',rowId,'--data',JSON.stringify(data)]);
 const actual=cli(['tablesdb','get-row',...ta,'--row-id',rowId]);
 if(Object.keys(data).some(k=>data[k]!==actual[k]))throw Error('Photo association readback mismatch');
 const response=await fetch(url);if(!response.ok)throw Error('Public image unavailable');const downloaded=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(downloaded).digest('hex')!==version)throw Error('Public image hash mismatch');
 index[actual.provider_id]=JSON.parse(actual.payload);
 if(++count%10===0)console.log(`Verified ${count}/${rows.length}`);
}
writeFileSync(resolve(root,'src/surroundings.json'),JSON.stringify(index,null,2)+'\n');
writeFileSync(resolve(root,'evidence/surroundings-storage.json'),JSON.stringify({checkedAt:new Date().toISOString(),bucket,table,photos:count,publicHashesVerified:true,databaseReadbackVerified:true,runtimeDatabaseReads:0},null,2));
console.log(`Published and verified ${count} photos and database associations.`);
