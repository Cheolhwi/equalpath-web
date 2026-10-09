import { mkdirSync,cpSync,writeFileSync,rmSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareSearchCatalog } from './prepare-search-catalog.mjs';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'.build/enquiry');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const files=['server/enquiry/function.mjs','server/enquiry/service.mjs','server/enquiry/store.mjs','server/enquiry/telegram.mjs','server/search-catalog.mjs','server/service-error.mjs','experiments/virtual-enquiry/model.mjs','shared/conditions.mjs','shared/published-hours.mjs','shared/published-ages.mjs','shared/request.mjs','shared/whatsapp.mjs','shared/result-summary.mjs'];
for(const f of files) {mkdirSync(resolve(out,f,'..'),{recursive:true});cpSync(resolve(root,f),resolve(out,f));}
await prepareSearchCatalog(resolve(out,'server/data/search-index'));
writeFileSync(resolve(out,'package.json'),JSON.stringify({name:'equalpath-enquiry-demo',version:'1.0.0',private:true,type:'module'}));
await import(pathToFileURL(resolve(out,'server/enquiry/function.mjs')));
const {createSearchStore}=await import(pathToFileURL(resolve(out,'server/search-catalog.mjs')));
const {virtualBranches}=await import(pathToFileURL(resolve(out,'experiments/virtual-enquiry/model.mjs')));
const branches=virtualBranches((await createSearchStore().catalog('short_term')).items);
if(branches.length!==101) throw Error('Unexpected short-care catalogue.');
console.log(JSON.stringify({mode:'dry_run',function:'web-enquiry-demo',package:out,branches:branches.length,searchFunctionChanged:false}));
