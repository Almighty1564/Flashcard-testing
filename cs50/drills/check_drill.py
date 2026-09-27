#!/usr/bin/env python3
"""Run original Tomato08 drills locally, using disposable case directories.
Python 3.10+. Standard library only. This executes trusted learner code, NOT a
security sandbox or proctored grader. Never run untrusted submissions here.
"""
from __future__ import annotations
import argparse
import contextlib
import datetime as dt
import hashlib
import io
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import traceback
import types
import uuid

VERSION = '1.0.0'
MAX_SOURCE = 50000
MAX_FILE = 4_000_000
MAX_OUTPUT = 64000

def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))

def fingerprint(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()

def source_hash(source):
    # Same pair-list fingerprint contract as Project Studio.
    h=hashlib.sha256(source.encode('utf-8')).hexdigest()
    pairs=json.dumps([['src/solution.py',h]],ensure_ascii=False,separators=(',',':'))
    return hashlib.sha256(pairs.encode('utf-8')).hexdigest()

def equal(a,b):
    if isinstance(a,bool) or isinstance(b,bool):return type(a) is type(b) and a==b
    if type(a) in (int,float) and type(b) in (int,float):
        return a==b or math.isclose(a,b,rel_tol=1e-9,abs_tol=1e-9)
    if type(a) is not type(b):return False
    if isinstance(a,dict):return a.keys()==b.keys() and all(equal(a[k],b[k]) for k in a)
    if isinstance(a,(list,tuple)):return len(a)==len(b) and all(equal(x,y) for x,y in zip(a,b))
    return a==b

def expect(actual,expected):
    if not equal(actual,expected):
        raise AssertionError(f'Expected {expected!r}; received {actual!r}'[:4000])

def raises(error_type,operation):
    try:operation()
    except error_type:return
    except BaseException as error:raise AssertionError(f'Expected {error_type.__name__}; received {type(error).__name__}') from error
    raise AssertionError(f'Expected {error_type.__name__}; no exception was raised')

class BoundedText(io.StringIO):
    def write(self,value):
        if self.tell()+len(value)>MAX_OUTPUT:raise RuntimeError('Printed output limit exceeded')
        return super().write(value)

def evaluate_case(source,case,root,quiet=False):
    """Only call directly with trusted, reviewed reference code during authoring."""
    name='tomato08_learner_'+uuid.uuid4().hex
    module=types.ModuleType(name)
    sys.modules[name]=module
    namespace=module.__dict__
    namespace.update({'root':Path(root),'expect':expect,'raises':raises})
    stream=BoundedText()
    try:
        with contextlib.redirect_stdout(stream),contextlib.redirect_stderr(stream):
            exec(compile(case['setup'],'<fixture>','exec'),namespace)
            exec(compile(source,'solution.py','exec'),namespace)
            exec(compile(case['check'],'<check>','exec'),namespace)
        output=stream.getvalue()
        if quiet and output:raise AssertionError('The contract requires returning a value without printing.')
        return {'id':case['id'],'passed':True,'skipped':False,'detail':'Passed this behavior case.','output':output[:4000]}
    except BaseException as error:
        # SystemExit and KeyboardInterrupt from learner code are failures, not a lost report.
        return {'id':case['id'],'passed':False,'skipped':False,'detail':f'{type(error).__name__}: {error}\n'+''.join(traceback.format_exception(type(error),error,error.__traceback__))[-5000:],'output':stream.getvalue()[:4000]}
    finally:
        sys.modules.pop(name,None)

def worker(job_path):
    job=json.loads(Path(job_path).read_text(encoding='utf-8'))
    try:
        if os.name=='posix':
            import resource
            resource.setrlimit(resource.RLIMIT_CORE,(0,0))
            resource.setrlimit(resource.RLIMIT_FSIZE,(8*1024*1024,8*1024*1024))
            resource.setrlimit(resource.RLIMIT_NOFILE,(128,128))
    except (ImportError,ValueError,OSError):pass
    with tempfile.TemporaryDirectory(prefix='fixture-',dir=Path.cwd()) as root:
        result=evaluate_case(job['source'],job['case'],root,job.get('quiet',False))
    print(json.dumps(result,ensure_ascii=False))
    return 0

def isolated_case(source,case,timeout,quiet=False):
    with tempfile.TemporaryDirectory(prefix='t08-drill-') as directory:
        work=Path(directory)
        payload=work/'job.json'
        payload.write_text(json.dumps({'source':source,'case':case,'quiet':quiet}),encoding='utf-8')
        allowed=('PATH','SystemRoot','WINDIR','COMSPEC','PATHEXT')
        env={k:os.environ[k] for k in allowed if k in os.environ}
        env.update({'HOME':str(work),'USERPROFILE':str(work),'TMP':str(work),'TEMP':str(work),'TMPDIR':str(work),'PYTHONIOENCODING':'utf-8'})
        reason=''
        with tempfile.TemporaryFile() as out,tempfile.TemporaryFile() as err:
            process=subprocess.Popen([sys.executable,'-I',str(Path(__file__).resolve()),'--_worker',str(payload)],cwd=work,env=env,stdout=out,stderr=err,stdin=subprocess.DEVNULL,start_new_session=os.name!='nt')
            started=time.monotonic()
            while process.poll() is None:
                if time.monotonic()-started>timeout:reason='Time limit exceeded. Check loop termination.';break
                if os.fstat(out.fileno()).st_size+os.fstat(err.fileno()).st_size>MAX_OUTPUT:reason='Output limit exceeded.';break
                time.sleep(.015)
            if reason:
                try:
                    if os.name=='posix':os.killpg(process.pid,signal.SIGKILL)
                    else:process.kill()
                except ProcessLookupError:pass
            process.wait()
            out.seek(0);err.seek(0)
            stdout=out.read(MAX_OUTPUT).decode('utf-8',errors='replace')
            stderr=err.read(MAX_OUTPUT).decode('utf-8',errors='replace')
            if not reason and os.fstat(out.fileno()).st_size+os.fstat(err.fileno()).st_size>MAX_OUTPUT:reason='Output limit exceeded.'
        if reason:return {'id':case['id'],'passed':False,'skipped':False,'detail':reason,'output':''}
        try:
            result=json.loads(stdout)
            if process.returncode!=0 or result.get('id')!=case['id'] or not isinstance(result.get('passed'),bool):raise ValueError()
            return result
        except (ValueError,AttributeError):
            return {'id':case['id'],'passed':False,'skipped':False,'detail':'Case process failed or returned an invalid result.\n'+stderr[-4000:],'output':stdout[-1000:]}

def load_bank(path):
    if not path.is_file() or path.stat().st_size>MAX_FILE:raise ValueError('Missing/oversized drills.json; open the extracted kit folder.')
    bank=json.loads(path.read_text(encoding='utf-8'))
    if bank.get('schema')!=1 or bank.get('version')!=VERSION or not isinstance(bank.get('tasks'),list):raise ValueError('Unsupported drill bank version.')
    return bank

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--task',help='Exact task ID shown on the website')
    parser.add_argument('--source',type=Path,help='Default: solutions/<task-id>.py')
    parser.add_argument('--bank',type=Path,default=Path('drills.json'))
    parser.add_argument('--output',type=Path,help='Default: reports/<task-id>.json')
    parser.add_argument('--list',action='store_true')
    parser.add_argument('--timeout',type=float,default=4.0,help='Seconds per case, between 0.2 and 20')
    parser.add_argument('--_worker',help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args._worker:return worker(args._worker)
    try:
        bank=load_bank(args.bank)
        if args.list:
            for t in bank['tasks']:print(f'{t["id"]:28} {t["mode"]:8} {t["title"]}')
            return 0
        task=next((t for t in bank['tasks'] if t['id']==args.task),None)
        if not task:raise ValueError('Use --task <id>, or --list to list assignments.')
        if not .2<=args.timeout<=20:raise ValueError('Timeout must be between 0.2 and 20 seconds.')
        source_path=args.source or Path('solutions')/(task['id']+'.py')
        if source_path.is_symlink() or not source_path.is_file() or source_path.stat().st_size>MAX_SOURCE:raise ValueError('Source must be a regular Python text file under 50 KB, not a symlink.')
        source=source_path.read_text(encoding='utf-8')
        if fingerprint(task['cases'])!=task['tests_sha256']:raise ValueError('Reference cases changed. Download the current original kit.')
        print('Local practice check. Runs your code here; NOT a security sandbox or trusted exam.\n')
        results=[]
        for c in task['cases']:
            r=isolated_case(source,c,args.timeout,quiet=task['id']=='py-functions-11')
            results.append(r)
            print(('PASS ' if r['passed'] else 'FAIL ')+r['id'])
            if not r['passed']:print(r['detail'][:1600])
        report={'schema':1,'kind':'tomato08-python-drill-report','id':str(uuid.uuid4()),'task_id':task['id'],'task_version':task['version'],'topic':task['topic'],'runner_version':VERSION,'mode':task['mode'],'created_at':dt.datetime.now(dt.timezone.utc).isoformat(),'source_files':{'src/solution.py':source},'source_sha256':source_hash(source),'tests_sha256':task['tests_sha256'],'results':results,'passed':bool(results) and all(r['passed'] for r in results),'environment':{'python':sys.version.split()[0],'platform':sys.platform},'trust':'local-unverified'}
        path=args.output or Path('reports')/(task['id']+'.json')
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(f'\n{sum(r["passed"] for r in results)}/{len(results)} passed. Import {path} into the matching task.')
        return 0 if report['passed'] else 1
    except (OSError,ValueError,KeyError) as error:
        print('Setup error: '+str(error),file=sys.stderr)
        return 2
if __name__=='__main__':raise SystemExit(main())
