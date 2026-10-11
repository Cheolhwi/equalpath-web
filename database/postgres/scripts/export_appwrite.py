#!/usr/bin/env python3
"""Read only the five public Web tables; never load Appwrite credentials."""
import concurrent.futures, datetime, gzip, hashlib, json, pathlib, urllib.parse, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1]
ENDPOINT = 'https://sgp.cloud.appwrite.io/v1'
ACTIVE = {}
PROJECT = '6a916a6c0030a70a9d75'
FIELDS = {
 'web_provider_catalog': ['provider_id','provider_name','state','district','care_type','hours_status','release_id','payload'],
 'web_provider_reviews': ['provider_id','release_id','source_kind','source_review_id','payload'],
 'web_provider_evidence': ['provider_id','release_id','payload'],
 'web_provider_photos': ['provider_id','bucket_id','file_id','version','payload'],
 'web_data_releases': ['release_id','source_hash','status','payload'],
}
def get(table, queries=None, row=None):
    path = f'/tablesdb/equalpath/tables/{table}/rows' + ('/' + row if row else '')
    if queries: path += '?' + urllib.parse.urlencode([('queries[]',json.dumps(q)) for q in queries])
    req = urllib.request.Request(ENDPOINT+path, headers={'X-Appwrite-Project':PROJECT})
    with urllib.request.urlopen(req,timeout=60) as response: return json.load(response)
def query(method, values): return {'method':method,'values':values}
def export(table):
    rows=[]; cursor=None; total=None
    while True:
        qs=[query('limit',[100]), {'method':'orderAsc','attribute':'$id','values':[]}]
        if table in ACTIVE: qs.append({'method':'equal','attribute':'release_id','values':ACTIVE[table]})
        if cursor: qs.append(query('cursorAfter',[cursor]))
        page=get(table,qs)
        if total is None: total=page['total']
        if page['total'] != total: raise RuntimeError('Source changed during export: '+table)
        batch=page['rows']
        if not batch: break
        for row in batch:
            clean={'id':row['$id'], **{k:row[k] for k in FIELDS[table]}}
            clean['payload']=json.loads(clean['payload'])
            rows.append(clean)
        cursor=batch[-1]['$id']
        print(f'{table}: {len(rows)} rows',flush=True)
        if len(batch)<100: break
    if (total<5000 and len(rows)!=total) or len({r['id'] for r in rows})!=len(rows): raise RuntimeError('Count/identity mismatch: '+table)
    raw=b''.join((json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n').encode() for r in rows)
    packed=gzip.compress(raw,mtime=0)
    return table,packed,{'rows':len(rows),'reported_total':total,'sha256':hashlib.sha256(packed).hexdigest(),'uncompressed_sha256':hashlib.sha256(raw).hexdigest()}
def main():
    before=get('web_data_releases',row='current')
    summary=json.loads(before['payload'])
    ACTIVE.update({'web_provider_catalog':[before['release_id']],'web_provider_reviews':[before['release_id']],'web_provider_evidence':[before['release_id']]+[v for k,v in summary.items() if k.endswith('_release')]})
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: results=list(pool.map(export,FIELDS))
    after=get('web_data_releases',row='current')
    if before != after: raise RuntimeError('Current release changed; export rejected')
    directory=ROOT/'data'; directory.mkdir(exist_ok=True)
    manifest={'exported_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'anonymous Appwrite public Web tables; active base and component releases only','database':'equalpath','current_release':before['release_id'],'tables':{}}
    for table,packed,meta in results:
        (directory/(table+'.jsonl.gz')).write_bytes(packed); manifest['tables'][table]=meta
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))
if __name__=='__main__': main()
