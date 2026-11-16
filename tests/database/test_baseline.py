import importlib.util,json,hashlib,unittest,subprocess,os,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('renderer',ROOT/'scripts/database/render-baseline.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BaselineTests(unittest.TestCase):
 def setUp(self):self.snapshot=json.loads((ROOT/'supabase/baseline/current-state-2026-11-16.json').read_text())
 def test_capture_coverage(self):
  s=self.snapshot;self.assertEqual(len([r for r in s['relations'] if r['kind']=='r']),243);self.assertEqual(len([r for r in s['relations'] if r['kind']=='v']),50);self.assertEqual(len(s['functions']),232);self.assertTrue(all(r['rls'] for r in s['relations'] if r['kind']=='r'))
 def test_ledger_bodies_and_hashes(self):
  rows=json.loads((ROOT/'supabase/baseline/recovered-ledger-2026-11-16.json').read_text());self.assertEqual(len(rows),229);self.assertEqual(sum(r['redacted'] for r in rows),1)
  for r in rows:
   self.assertTrue(r['statements'])
   if not r['redacted']:self.assertEqual(hashlib.sha256('\n'.join(r['statements']).encode()).hexdigest(),r['source_sha256'])
 def test_renderer_is_deterministic_and_current(self):
  text=m.render(self.snapshot);self.assertEqual(text,(ROOT/'supabase/baseline/current-state-2026-11-16.sql').read_text());self.assertIn('BEGIN;',text);self.assertTrue(text.rstrip().endswith('COMMIT;'));self.assertNotIn('cron.schedule(',text)
 def test_render_stable_across_hash_seeds(self):
  with tempfile.TemporaryDirectory() as directory:
   outputs=[]
   for seed in ['1','2']:
    target=Path(directory)/('render-'+seed+'.sql')
    subprocess.run(['python',str(ROOT/'scripts/database/render-baseline.py'),str(ROOT/'supabase/baseline/current-state-2026-11-16.json'),str(target)],env={**os.environ,'PYTHONHASHSEED':seed},check=True,capture_output=True)
    outputs.append(target.read_bytes())
   self.assertEqual(*outputs)
 def test_unsupported_objects_fail_closed(self):
  self.snapshot['other_types']=[{'kind':'d'}]
  with self.assertRaises(ValueError):m.render(self.snapshot)
 def test_invalid_source_index_fails_closed(self):
  self.snapshot['indexes'][0]['valid']=False
  with self.assertRaises(ValueError):m.render(self.snapshot)
 def test_view_dependency_cycle_fails_closed(self):
  v=next(r for r in self.snapshot['relations'] if r['kind']=='v');self.snapshot['view_dependencies'].append({'schema':v['schema'],'view':v['name'],'depends_schema':v['schema'],'depends':v['name']})
  with self.assertRaises(ValueError):m.render(self.snapshot)
if __name__=='__main__':unittest.main()
