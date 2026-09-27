"""Regression tests use only trusted fixture code in the local practice runner."""
from pathlib import Path
import importlib.util,json,tempfile,subprocess,sys,unittest,os
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('drill_checker',ROOT/'cs50/drills/check_drill.py');runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
class RunnerTests(unittest.TestCase):
 def test_bool_is_not_number(self):
  self.assertFalse(runner.equal(True,1));self.assertTrue(runner.equal(1,1.0));self.assertFalse(runner.equal([1],(1,)))
 def test_exceptions_are_case_failures(self):
  with tempfile.TemporaryDirectory() as root:
   for code in ['raise SystemExit(0)','raise KeyboardInterrupt','this is invalid syntax !!!']:
    self.assertFalse(runner.evaluate_case(code,{'id':'x','setup':'pass','check':'pass'},root)['passed'])
 def test_print_is_not_return(self):
  with tempfile.TemporaryDirectory() as root:
   self.assertFalse(runner.evaluate_case('print(5)',{'id':'x','setup':'pass','check':'pass'},root,quiet=True)['passed'])
 def test_typical_isolated_case(self):
  r=runner.isolated_case('result=data+1',{'id':'x','setup':'data=8','check':'expect(result,9)'},4);self.assertTrue(r['passed'],r)
 def test_timeout(self):
  r=runner.isolated_case('while True: pass',{'id':'x','setup':'pass','check':'pass'},.2);self.assertFalse(r['passed']);self.assertIn('Time limit',r['detail'])
 def test_print_bound(self):
  r=runner.isolated_case('print("x"*100000)',{'id':'x','setup':'pass','check':'pass'},4);self.assertFalse(r['passed']);self.assertIn('limit',r['detail'])
 def test_environment_filter(self):
  os.environ['T08_TEST_PRIVATE_SECRET']='not-for-learner'
  try:
   r=runner.isolated_case('import os\nresult=os.environ.get("T08_TEST_PRIVATE_SECRET")',{'id':'x','setup':'pass','check':'expect(result,None)'},4);self.assertTrue(r['passed'],r)
  finally:os.environ.pop('T08_TEST_PRIVATE_SECRET',None)
 def test_clean_case_fixture(self):
  code='result=(root/"created.txt").exists()\n(root/"created.txt").write_text("x")'
  for _ in range(2):
   r=runner.isolated_case(code,{'id':'x','setup':'pass','check':'expect(result,False)'},4);self.assertTrue(r['passed'],r)
 def test_report_cli(self):
  with tempfile.TemporaryDirectory() as root:
   path=Path(root);(path/'solutions').mkdir()
   cases=[{'id':'example','setup':'data=2','check':'expect(result,3)'}]
   task={'id':'fixture','topic':'fixture','mode':'practice','version':'1.0.0','title':'Harness fixture','cases':cases,'tests_sha256':runner.fingerprint(cases)}
   (path/'drills.json').write_text(json.dumps({'schema':1,'version':'1.0.0','tasks':[task]}));(path/'solutions/fixture.py').write_text('result=data+1')
   result=subprocess.run([sys.executable,str(ROOT/'cs50/drills/check_drill.py'),'--task','fixture'],cwd=path,capture_output=True,text=True,timeout=10);self.assertEqual(result.returncode,0,result.stdout+result.stderr)
   report=json.loads((path/'reports/fixture.json').read_text());self.assertTrue(report['passed']);self.assertEqual(report['source_sha256'],runner.source_hash('result=data+1'));self.assertEqual(report['trust'],'local-unverified')
 def test_unchanged_contract_hash(self):
  for file in (ROOT/'cs50/drills/packs').glob('*.json'):
   for task in json.loads(file.read_text())['tasks']:
    self.assertEqual(runner.fingerprint(task['cases']),task['tests_sha256'],task['id'])
if __name__=='__main__':unittest.main(verbosity=2)
