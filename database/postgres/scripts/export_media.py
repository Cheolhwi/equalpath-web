#!/usr/bin/env python3
"""Download the allowlisted public bucket for a local replica (explicit export only)."""
import concurrent.futures,gzip,hashlib,json,pathlib,re,urllib.request,urllib.parse
from export_appwrite import ROOT,ENDPOINT,PROJECT
BUCKET='web-surroundings'
def download(file_id):
    assert re.fullmatch(r'[A-Za-z0-9_-]+',file_id)
    rel=f'media/{BUCKET}/{file_id}.jpg'; path=ROOT/rel
    if path.exists(): raw=path.read_bytes()
    else:
        url=f'{ENDPOINT}/storage/buckets/{BUCKET}/files/{file_id}/download?project={PROJECT}'
        with urllib.request.urlopen(url,timeout=60) as response: raw=response.read()
        if not raw.startswith(b'\xff\xd8\xff'): raise RuntimeError('Not a JPEG: '+file_id)
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
    return {'bucket_id':BUCKET,'file_id':file_id,'relative_path':rel,'sha256':hashlib.sha256(raw).hexdigest(),'size_bytes':len(raw),'mime_type':'image/jpeg'}
def main():
    photos=[json.loads(x) for x in gzip.decompress((ROOT/'data/web_provider_photos.jsonl.gz').read_bytes()).splitlines()]
    # Enumerate bucket as well: unreferenced files belong in the replica too.
    ids=[];cursor=None
    while True:
        qs=[{'method':'limit','values':[100]},{'method':'orderAsc','attribute':'$id','values':[]}]
        if cursor: qs.append({'method':'cursorAfter','values':[cursor]})
        url=f'{ENDPOINT}/storage/buckets/{BUCKET}/files?'+urllib.parse.urlencode([('project',PROJECT)]+[('queries[]',json.dumps(q)) for q in qs])
        with urllib.request.urlopen(url,timeout=60) as response: page=json.load(response)
        ids.extend(f['$id'] for f in page['files'])
        if len(page['files'])<100: break
        cursor=page['files'][-1]['$id']
    assert len(ids)==page['total'] and len(set(ids))==len(ids)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: files=list(pool.map(download,ids))
    by_id={f['file_id']:f for f in files};links=[]
    for row in photos:
        assert row['bucket_id']==BUCKET
        for n,img in enumerate(row['payload'].get('images') or [row['payload']]):
            fid=img.get('fileId',row['file_id']);f=by_id[fid]
            assert f['sha256']==img.get('version',row['version'])
            links.append({'photo_id':row['id'],'ordinal':n,'bucket_id':BUCKET,'file_id':fid,'direction':img.get('direction',''),'capture_date':img.get('captureDate') or ''})
    manifest={'bucket_id':BUCKET,'files':files,'links':links}
    (ROOT/'data/media-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'files':len(files),'links':len(links),'providers':len(photos),'bytes':sum(f['size_bytes'] for f in files)}))
if __name__=='__main__': main()
