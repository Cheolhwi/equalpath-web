#!/usr/bin/env python3
"""Validate checksums and transactionally import the bundled snapshot; repeatable."""
import csv,gzip,hashlib,io,json,pathlib,subprocess
from local import ROOT,env

def datasets():
    manifest=json.loads((ROOT/'data/manifest.json').read_text()); result={}
    for name,meta in manifest['tables'].items():
        packed=(ROOT/'data'/f'{name}.jsonl.gz').read_bytes()
        assert hashlib.sha256(packed).hexdigest()==meta['sha256'],name+' checksum mismatch'
        rows=[json.loads(line) for line in gzip.decompress(packed).splitlines()]
        assert len(rows)==meta['rows'] and len({r['id'] for r in rows})==len(rows)
        result[name]=rows
    media=json.loads((ROOT/'data/media-manifest.json').read_text())
    for f in media['files']:
        path=(ROOT/f['relative_path']).resolve()
        assert path.is_relative_to((ROOT/'media').resolve())
        raw=path.read_bytes()
        assert len(raw)==f['size_bytes'] and hashlib.sha256(raw).hexdigest()==f['sha256']
    result['storage_files']=media['files'];result['provider_photo_files']=media['links']
    runtime=ROOT.parents[1]/'server/data/search-index'
    index=json.loads((runtime/'manifest.json').read_text())
    docs=[{'id':'manifest','payload':index}]
    for care,info in index['partitions'].items():
        raw=gzip.decompress((runtime/(care+'.json.gz')).read_bytes())
        assert hashlib.sha256(raw).hexdigest()==info['sha256']
        docs.append({'id':care,'payload':json.loads(raw)})
    for provider,info in index['extras'].items():
        raw=gzip.decompress((runtime/'extras'/(hashlib.sha256(provider.encode()).hexdigest()+'.json.gz')).read_bytes())
        assert hashlib.sha256(raw).hexdigest()==info['sha256']
        docs.append({'id':'extras:'+provider,'payload':json.loads(raw)})
    result['runtime_documents']=docs
    return result

def sql(data):
    out=io.StringIO();out.write('BEGIN;\n'+(ROOT/'schema.sql').read_text()+'\n')
    for table,rows in data.items():
        if not rows: continue
        assert table in {'web_data_releases','web_provider_catalog','web_provider_evidence','web_provider_reviews','web_provider_photos','storage_files','provider_photo_files','runtime_documents'}
        cols=list(rows[0]); assert all(set(r)==set(cols) for r in rows)
        columns=','.join('"'+c+'"' for c in cols)
        out.write(f'CREATE TEMP TABLE staging (LIKE equalpath.{table} INCLUDING DEFAULTS) ON COMMIT DROP;\nCOPY staging ({columns}) FROM STDIN WITH (FORMAT csv);\n')
        writer=csv.writer(out,lineterminator='\n',quoting=csv.QUOTE_ALL)
        for row in rows: writer.writerow([json.dumps(row[c],ensure_ascii=False) if isinstance(row[c],(dict,list)) else row[c] if row[c] is not None else '' for c in cols])
        out.write('\\.\n')
        keys={'storage_files':['bucket_id','file_id'],'provider_photo_files':['photo_id','ordinal']}.get(table,['id'])
        updates=','.join(f'"{c}"=EXCLUDED."{c}"' for c in cols if c not in keys)
        out.write(f'INSERT INTO equalpath.{table} ({columns}) SELECT {columns} FROM staging ON CONFLICT ({",".join(keys)}) DO UPDATE SET {updates};\nDROP TABLE staging;\n')
    out.write('COMMIT;\n');return out.getvalue()
if __name__=='__main__':
    data=datasets()
    subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1','-q'],input=sql(data),text=True,check=True,env=env())
    print(json.dumps({k:len(v) for k,v in data.items()},indent=2))
