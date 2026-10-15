import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export async function queryJSON(sql) {
 const {stdout} = await exec('psql',['-X','-v','ON_ERROR_STOP=1','-Atc',sql],{maxBuffer:80*1024*1024});
 return stdout.trim() ? JSON.parse(stdout) : null;
}
export function createPostgresStore() {
 const pending=new Map();
 const read=key=>{
  if(!pending.has(key)) {
   const hex=Buffer.from(key).toString('hex');
   const task=queryJSON(`SELECT payload FROM equalpath.runtime_documents WHERE id=convert_from(decode('${hex}','hex'),'UTF8')`).then(value=>{if(!value)throw Error('Local runtime data missing. Run npm run local:setup.');return value;});
   pending.set(key,task);task.catch(()=>pending.delete(key));
  }
  return pending.get(key);
 };
 return {prepared:true,catalog:care=>read(care),extras:async id=>{
  const manifest=await read('manifest');return manifest.extras[id] ? (await read('extras:'+id)).fields : {};
 }};
}
