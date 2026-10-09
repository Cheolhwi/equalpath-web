import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const backend=resolve(import.meta.dirname,'../../appwrite-backend');
function read(args) {
 const r=spawnSync(resolve(backend,'node_modules/.bin/appwrite'),[...args,'--json'],{cwd:backend,encoding:'utf8',timeout:45000});
 if(r.status!==0) throw Error(`Status check failed (${r.status ?? r.error?.code ?? r.signal}); response withheld.`);
 return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
}
const variables=read(['functions','list-variables','--function-id','web-enquiry-demo']);
const fn=read(['functions','get','--function-id','web-enquiry-demo']);
const deploymentId=fn.deploymentId||fn.deployment||fn.activeDeploymentId;
const deployment=read(['functions','get-deployment','--function-id','web-enquiry-demo','--deployment-id',deploymentId]);
console.log(JSON.stringify({function:fn.$id,deployment:deploymentId,deploymentStatus:deployment.status,schedule:fn.schedule,variables:(variables.variables||[]).map(v=>({key:v.key,secretMetadata:v.secret}))},null,2));
