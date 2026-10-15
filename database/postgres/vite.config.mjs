import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {createReadStream} from 'node:fs';
import {stat,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
import {createAPI,errorResponse} from '../../server/api.mjs';
import {createPostgresStore,queryJSON} from './store.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=fileURLToPath(new URL('./',import.meta.url));
const api=createAPI({store:createPostgresStore()});
const photos=await queryJSON("SELECT coalesce(jsonb_object_agg(provider_id,payload),'{}'::jsonb) FROM equalpath.web_provider_photos");
const gallery=await queryJSON("SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) FROM equalpath.local_photo_gallery g");
for(const [id,p] of Object.entries(photos)) {
 const items=gallery.filter(g=>g.provider_id===id).sort((a,b)=>a.ordinal-b.ordinal);
 p.images=items.map((g,i)=>({...p.images?.[i],url:'/'+g.relative_path}));
 p.url=p.images[0]?.url;
}
await mkdir(resolve(directory,'.local'),{recursive:true});
const photoFile=resolve(directory,'.local/surroundings.json');await writeFile(photoFile,JSON.stringify(photos));
export default defineConfig({root,plugins:[react(),{name:'local-postgres-api',configureServer(server){
 server.middlewares.use('/media',async(req,res)=>{
  try {
   const name=decodeURIComponent((req.url||'').split('?')[0]);
   if(!/^\/web-surroundings\/[A-Za-z0-9_-]+\.jpg$/.test(name)){res.statusCode=404;res.end();return;}
   const path=resolve(directory,'media',name.slice(1));
   if(!path.startsWith(resolve(directory,'media')+sep))throw Error();
   const info=await stat(path);res.setHeader('Content-Type','image/jpeg');res.setHeader('Content-Length',info.size);createReadStream(path).pipe(res);
  }catch{res.statusCode=404;res.end();}
 });
 server.middlewares.use('/api',async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.statusCode=405;res.end('{}');return;}
  try {let text='';for await(const chunk of req){text+=chunk;if(text.length>12000){res.statusCode=413;res.end('{}');return;}}
   res.end(JSON.stringify({ok:true,...await api(JSON.parse(text))}));
  }catch(e){const result=errorResponse(e);res.statusCode=result.status;res.end(JSON.stringify(result.body));}
 });
}}],resolve:{alias:[{find:'./surroundings.json',replacement:photoFile}]},
 define:{'import.meta.env.VITE_EQUALPATH_API_URL':JSON.stringify('/api'),'import.meta.env.VITE_LOCAL_POSTGRES':JSON.stringify('1')},
 server:{host:'127.0.0.1',port:4180,strictPort:true,fs:{allow:[root]},watch:{ignored:['**/database/postgres/.local/**','**/database/postgres/media/**']}}
});
