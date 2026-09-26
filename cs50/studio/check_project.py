#!/usr/bin/env python3
"""Tomato08 local project grader. Executes trusted learner code, NOT a security sandbox.
Run from the extracted project: python tools/check_project.py --release fg-01
Use --fresh to create a clean virtual environment and install .[test] (network may be needed).
No report is sent anywhere until you explicitly import/sync it in the website.
"""
from __future__ import annotations
import argparse,datetime as dt,hashlib,importlib.metadata,json,os,pathlib,platform,shutil,signal,subprocess,sys,tempfile,time,uuid,venv,xml.etree.ElementTree as ET
VERSION='2.0.0'
MAX_SOURCE=900_000
ALLOWED_SUFFIXES={'.py','.toml','.md','.json','.txt','.html','.css','.js','.sql','.csv'}
EXCLUDED={'.git','.venv','venv','__pycache__','.pytest_cache','node_modules','build','dist','reports','.mypy_cache','.ruff_cache'}

def sha(data:bytes)->str:return hashlib.sha256(data).hexdigest()
def encoded(value)->bytes:return json.dumps(value,ensure_ascii=False,separators=(',',':')).encode('utf-8')
def tree_hash(files:dict[str,str])->str:return sha(encoded([[p,sha(v.encode('utf-8'))] for p,v in sorted(files.items())]))

def snapshot(root:pathlib.Path)->dict[str,str]:
    files={};total=0
    # Explicit project paths avoid accidental credential or personal-file collection.
    candidates=[]
    for directory in ('src','tests','templates','static'):
        base=root/directory
        if base.is_symlink():raise ValueError(f'Symlinks are not supported: {directory}')
        if base.exists():
            for here,dirs,names in os.walk(base,followlinks=False):
                dirs[:]=[d for d in dirs if d not in EXCLUDED and not d.endswith('.egg-info')]
                if any((pathlib.Path(here)/d).is_symlink() for d in dirs):raise ValueError('Project directory contains a symlink.')
                candidates.extend(pathlib.Path(here)/name for name in names)
    candidates += [root/name for name in ('pyproject.toml','README.md','requirements.txt') if (root/name).exists()]
    for p in candidates:
        if p.is_symlink():raise ValueError(f'Symlink not supported: {p.relative_to(root)}')
        if not p.is_file() or p.suffix not in ALLOWED_SUFFIXES or p.name.startswith('.env'):continue
        content=p.read_bytes();total+=len(content)
        if total>MAX_SOURCE:raise ValueError('Selected source exceeds 900 KB. Remove generated data from src/tests; keep reports outside these directories.')
        files[p.relative_to(root).as_posix()]=content.decode('utf-8')
    if not any(p.startswith('src/') and p.endswith('.py') for p in files):raise ValueError('No Python source found in src/.')
    return files

def environment(work:pathlib.Path,source:pathlib.Path)->dict[str,str]:
    # This reduces accidental secret inheritance, but code still runs with OS user permissions.
    env={k:os.environ[k] for k in ('PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','LANG','LC_ALL','SSL_CERT_FILE','SSL_CERT_DIR') if k in os.environ}
    env.update(HOME=str(work),USERPROFILE=str(work),TMPDIR=str(work),TEMP=str(work),TMP=str(work),PYTHONIOENCODING='utf-8',PYTHONDONTWRITEBYTECODE='1',PYTEST_DISABLE_PLUGIN_AUTOLOAD='1',PYTHONPATH=str(source),PIP_DISABLE_PIP_VERSION_CHECK='1',PIP_NO_INPUT='1')
    return env

def run(command:list[str],cwd:pathlib.Path,env:dict[str,str],timeout:int=45)->tuple[int,str]:
    with tempfile.TemporaryFile() as out:
        proc=subprocess.Popen(command,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=subprocess.STDOUT,start_new_session=os.name!='nt')
        deadline=time.monotonic()+timeout;reason=''
        while proc.poll() is None:
            if time.monotonic()>deadline:reason=f'Wall-time limit {timeout}s exceeded.';break
            if os.fstat(out.fileno()).st_size>500_000:reason='Output limit exceeded.';break
            time.sleep(.04)
        if reason:
            if os.name=='nt':proc.kill()
            else:
                try:os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError:pass
        proc.wait();out.seek(0);text=out.read(500_000).decode('utf-8',errors='replace')
        return (-1 if reason else proc.returncode),text+'\n'+reason

def parse_results(xml:pathlib.Path):
    if not xml.exists():return []
    out=[]
    for case in ET.parse(xml).iter('testcase'):
        failure=case.find('failure');error=case.find('error');skip=case.find('skipped')
        problem=failure if failure is not None else error
        out.append({'id':case.attrib.get('name',''),'passed':problem is None and skip is None,'skipped':skip is not None,'detail':((problem.text or '') if problem is not None else 'Skipped on this host' if skip is not None else '')[-6000:]})
    return out

def grade(root:pathlib.Path,release_id:str,fresh:bool=False,timeout:int=45)->dict:
    catalog=json.loads((root/'.tomato08/project.json').read_text(encoding='utf-8'))
    release=next((r for r in catalog['releases'] if r['id']==release_id),None)
    if not release:raise ValueError('Release does not belong to this project.')
    if release['mode']!='checked':raise ValueError('This release uses artifact review. Record the tests, repository and review in the website.')
    source=snapshot(root);test_path=release['test_file'];suite=(root/test_path).read_text(encoding='utf-8')
    if sha(suite.encode())!=release['checks_sha256']:raise ValueError('The supplied reference checks changed. Restore the original kit or update its version explicitly.')
    report={'schema':2,'kind':'tomato08-project-report','id':str(uuid.uuid4()),'project_id':catalog['project_id'],'release_id':release_id,'release_version':release['version'],'grader_version':VERSION,'created_at':dt.datetime.now(dt.timezone.utc).isoformat(),'source_files':source,'source_sha256':tree_hash(source),'checks_sha256':release['checks_sha256'],'runtime':{'python':platform.python_version(),'platform':platform.system(),'mode':'fresh-install' if fresh else 'active-environment'},'provenance':'local-unverified','results':[],'passed':False,'learner_tests':{'passed':0,'failed':0,'skipped':0},'git':{}}
    try:
        def git(*args):return subprocess.run(['git',*args],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=3,check=True).stdout.strip()
        report['git']={'commit':git('rev-parse','HEAD'),'dirty':bool(git('status','--porcelain'))}
    except (OSError,subprocess.SubprocessError):pass
    with tempfile.TemporaryDirectory(prefix='t08-project-') as temporary:
        work=pathlib.Path(temporary);project=work/'project';project.mkdir()
        for p,text in source.items():
            target=project/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text,encoding='utf-8',newline='')
        checkdir=work/'reference_checks';checkdir.mkdir();checkfile=checkdir/pathlib.Path(test_path).name;checkfile.write_text(suite,encoding='utf-8',newline='')
        config=work/'pytest.ini';config.write_text('[pytest]\n',encoding='utf-8');env=environment(work,project/'src');python=sys.executable
        if fresh:
            envpath=work/'venv';venv.EnvBuilder(with_pip=True).create(envpath)
            python=str(envpath/('Scripts/python.exe' if os.name=='nt' else 'bin/python'))
            status,log=run([python,'-m','pip','install','.[test]'],project,env,240)
            if status:raise RuntimeError('Fresh installation failed. Inspect pyproject.toml, network access and dependencies.\n'+log[-6000:])
            # No source-tree import shortcut in a clean-install assessment.
            env.pop('PYTHONPATH',None)
        xml=work/'official.xml'
        status,log=run([python,'-m','pytest',str(checkfile),'-c',str(config),'--confcutdir='+str(checkdir),'--junitxml='+str(xml),'-q'],work,env,timeout)
        report['results']=parse_results(xml);report['runner_exit_code']=status;report['runner_output']=log[-10000:]
        expected=release['test_cases'];actual=[r['id'] for r in report['results']]
        report['passed']=status==0 and sorted(actual)==sorted(expected) and all(r['passed'] for r in report['results'])
        if sorted(actual)!=sorted(expected):report['runner_output']+='\nMissing or unexpected test cases. No pass recorded.'
        if (project/'tests').exists():
            own_xml=work/'own.xml';own_status,own_log=run([python,'-m','pytest',str(project/'tests'),'-c',str(config),'--junitxml='+str(own_xml),'-q'],work,env,timeout)
            own=parse_results(own_xml);report['learner_tests']={'passed':sum(r['passed'] for r in own),'failed':sum(not r['passed'] and not r['skipped'] for r in own),'skipped':sum(r['skipped'] for r in own),'exit_code':own_status,'output':own_log[-6000:]}
        if snapshot(project)!=source:
            report['passed']=False;report['runner_output']+='\nSource changed during execution. Rerun from a stable snapshot.'
        if sha(checkfile.read_bytes())!=release['checks_sha256']:
            report['passed']=False;report['runner_output']+='\nReference checks changed during execution.'
        status,versions=run([python,'-c',"import json,importlib.metadata as m; print(json.dumps({x:m.version(x) for x in ('pytest','setuptools')}))"],work,env,10)
        if status==0:
            try:report['runtime']['dependencies']=json.loads(versions)
            except ValueError:pass
    return report

def main()->int:
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--release',required=True);parser.add_argument('--root',type=pathlib.Path,default=pathlib.Path.cwd());parser.add_argument('--fresh',action='store_true');parser.add_argument('--timeout',type=int,default=45);parser.add_argument('--output',type=pathlib.Path)
    args=parser.parse_args();root=args.root.resolve()
    print('Runs YOUR code locally. Not a sandbox or signed grading service. Use fictional data and no production credentials.')
    try:
        report=grade(root,args.release,args.fresh,max(5,min(180,args.timeout)))
        output=args.output or root/'reports'/f'{args.release}-{report["id"]}.json';output.parent.mkdir(parents=True,exist_ok=True)
        # Each default result path is unique; report history is not overwritten.
        output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        for r in report['results']:print(('PASS' if r['passed'] else 'SKIP' if r['skipped'] else 'FAIL')+' '+r['id'])
        print(f'\nReport: {output}\nOverall: {"PASS" if report["passed"] else "NEEDS WORK"}')
        if not report['passed']:print(report['runner_output'][-4000:])
        return 0 if report['passed'] else 1
    except (OSError,ValueError,RuntimeError,KeyError) as error:print(f'Could not grade: {error}',file=sys.stderr);return 2
if __name__=='__main__':raise SystemExit(main())
