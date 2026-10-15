import importlib.util,json,pathlib,unittest
from unittest.mock import patch
P=pathlib.Path(__file__).resolve().parents[1]/'scripts/export_appwrite.py'
spec=importlib.util.spec_from_file_location('exporter',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ExportTest(unittest.TestCase):
 def test_capped_total_does_not_truncate(self):
  def row(i):return {'$id':str(i),'release_id':'r','source_hash':'h','status':'ready','payload':'{}'}
  pages=[{'total':5000,'rows':[row(i) for i in range(100)]},{'total':5000,'rows':[row(100)]}]
  with patch.object(m,'get',side_effect=pages):
   _,_,meta=m.export('web_data_releases')
  self.assertEqual(meta['rows'],101)
 def test_duplicate_cursor_rows_rejected(self):
  r={'$id':'x','release_id':'r','source_hash':'h','status':'ready','payload':'{}'}
  with patch.object(m,'get',return_value={'total':2,'rows':[r,r]}):
   with self.assertRaises(RuntimeError):m.export('web_data_releases')
if __name__=='__main__':unittest.main()
