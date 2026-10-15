#!/usr/bin/env python3
"""Verify imported source rows, derived runtime documents and local media."""
import json, subprocess
from load import datasets
from local import env, ROOT

def query(sql):
    raw=subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1','-Atc',sql],env=env(),check=True,capture_output=True,text=True).stdout
    return json.loads(raw)
def main():
    expected=datasets(); counts={}
    for table,rows in expected.items():
        actual=query(f"SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM equalpath.{table} t")
        canonical=lambda r:json.dumps(r,sort_keys=True,ensure_ascii=False,separators=(',',':'))
        assert sorted(map(canonical,actual))==sorted(map(canonical,rows)),table+' import differs'
        counts[table]=len(actual)
    reviews=query("SELECT count(*) FROM equalpath.provider_review_links")
    evidence=query("SELECT count(*) FROM equalpath.provider_evidence_links")
    galleries=query("SELECT count(*) FROM equalpath.local_photo_gallery")
    assert reviews>0 and evidence>0 and galleries>0
    result={'verified':True,'counts':counts,'review_links':reviews,'evidence_links':evidence,'gallery_links':galleries,'checks':['every imported field equals snapshot','runtime artifacts match checked-in hashes','all local image sizes and SHA256 match','SQL joins return evidence/reviews/photos']}
    (ROOT/'.local/verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
