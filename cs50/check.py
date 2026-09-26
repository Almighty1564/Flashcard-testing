#!/usr/bin/env python3
"""Tomato08 CS50 Applied local checker. Run only code you trust.
This is a learning tool, not a security sandbox, proctor, or signed grader.
Python 3.10+; C needs GCC/Clang; JavaScript needs Node; Flask needs Flask.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from typing import Any

VERSION = '1.0.0'
COURSE = 'tomato08-cs50-applied'
MAX_OUTPUT = 256_000


def run(command: list[str], *, cwd: Path, text: str = '', timeout: float = 4,
        env: dict[str, str] | None = None) -> tuple[int, str, str]:
    """Bound output and wall time. This does not isolate malicious programs."""
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err, tempfile.TemporaryFile() as inp:
        inp.write(text.encode('utf-8'))
        inp.seek(0)
        process = subprocess.Popen(command, cwd=str(cwd), stdin=inp, stdout=out,
                                   stderr=err, env=env, start_new_session=os.name != 'nt')
        start = time.monotonic()
        reason = ''
        while process.poll() is None:
            if time.monotonic() - start > timeout:
                reason = f'Time limit exceeded ({timeout:g}s). Check for nonterminating loops.'
                break
            if os.fstat(out.fileno()).st_size + os.fstat(err.fileno()).st_size > MAX_OUTPUT:
                reason = 'Output limit exceeded. Check for repeated or unintended printing.'
                break
            time.sleep(0.02)
        if reason:
            try:
                if os.name != 'nt':
                    os.killpg(process.pid, signal.SIGKILL)
                else:
                    process.kill()
            except ProcessLookupError:
                pass
        process.wait()
        out.seek(0)
        err.seek(0)
        stdout = out.read(MAX_OUTPUT).decode('utf-8', errors='replace')
        stderr = err.read(MAX_OUTPUT).decode('utf-8', errors='replace')
        if not reason and os.fstat(out.fileno()).st_size + os.fstat(err.fileno()).st_size > MAX_OUTPUT:
            reason = 'Output limit exceeded.'
        return (-1 if reason else process.returncode), stdout, reason or stderr


HELPER = r'''
import importlib.util, json, pathlib, sqlite3, sys
payload = json.loads(sys.stdin.read())
mode = payload['mode']
source = pathlib.Path(payload['source'])
if mode == 'sql':
    db = sqlite3.connect(':memory:')
    db.executescript(payload['input'])
    db.set_authorizer(lambda action, *rest: sqlite3.SQLITE_DENY if action in (
        sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH, sqlite3.SQLITE_INSERT,
        sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_DELETE, sqlite3.SQLITE_DROP_TABLE,
        sqlite3.SQLITE_ALTER_TABLE, sqlite3.SQLITE_PRAGMA) else sqlite3.SQLITE_OK)
    result = db.execute(source.read_text(encoding='utf-8')).fetchall()
    print(json.dumps(result, allow_nan=False))
elif mode == 'flask':
    spec = importlib.util.spec_from_file_location('learner_solution', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    client = module.app.test_client()
    data = payload['input']
    kwargs = {}
    if 'json' in data: kwargs['json'] = data['json']
    if 'data' in data: kwargs['data'] = data['data']
    response = client.open(data['path'], method=data.get('method','GET'), **kwargs)
    result = {'status':response.status_code}
    if payload['check_json']: result['json'] = response.get_json(silent=True)
    print(json.dumps(result, allow_nan=False))
'''
JS_HELPER = r'''
const fs = require('fs');
const fn = require(process.argv[2]);
const value = JSON.parse(fs.readFileSync(0, 'utf8'));
const before = JSON.stringify(value);
const result = fn(value);
if (JSON.stringify(value) !== before) throw new Error('Function mutated its input.');
if (typeof result === 'undefined') throw new Error('Function returned undefined.');
console.log(JSON.stringify(result));
'''


def normalized(value: str) -> str:
    return value.replace('\r\n', '\n').strip()


def check(manifest_path: Path, source_override: Path | None, sanitize: bool) -> dict[str, Any]:
    manifest_path = manifest_path.resolve()
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('course_id') != COURSE or manifest.get('version') != VERSION:
        raise ValueError('This manifest is not supported by this checker version.')
    task = manifest['task']
    if not task.get('tests'):
        raise ValueError('This is a rubric-reviewed assignment. Record its evidence on the website.')
    filename = task['file']
    if Path(filename).name != filename:
        raise ValueError('Source filename must be a single filename without a directory.')
    source = (source_override or manifest_path.parent / filename).resolve()
    if not source.is_file():
        raise FileNotFoundError(f'Solution not found: {source}')
    if source.stat().st_size > 100_000:
        raise ValueError('Solution exceeds the 100 KB single-file limit. Use the project rubric for larger work.')
    code = source.read_text(encoding='utf-8')
    mode = task['runner']
    report: dict[str, Any] = {
        'schema': 1, 'course_id': COURSE, 'version': VERSION,
        'task_id': task['id'], 'runner': mode,
        'at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'source_sha256': hashlib.sha256(code.encode('utf-8')).hexdigest(),
        'source': code, 'provenance': 'local-unverified',
        'sanitizer': 'requested' if sanitize and mode == 'c' else 'not-run',
        'results': [], 'passed': False,
    }
    with tempfile.TemporaryDirectory(prefix='tomato08-lab-') as temp:
        work = Path(temp)
        isolated_source = work / filename
        isolated_source.write_text(code, encoding='utf-8')
        helper = work / '_check_helper.py'
        helper.write_text(HELPER, encoding='utf-8')
        js_helper = work / '_check_helper.cjs'
        js_helper.write_text(JS_HELPER, encoding='utf-8')
        command: list[str] = []
        env = os.environ.copy()
        env['PYTHONIOENCODING'] = 'utf-8'
        if mode == 'c':
            compiler = shutil.which('clang') or shutil.which('gcc')
            if not compiler:
                raise RuntimeError('No C compiler found. Use GCC/Clang locally or the CS50 browser development environment.')
            binary = work / ('program.exe' if os.name == 'nt' else 'program')
            flags = ['-std=c11', '-Wall', '-Wextra', '-g']
            if sanitize:
                flags += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
                env['ASAN_OPTIONS'] = 'detect_leaks=1:halt_on_error=1'
                env['UBSAN_OPTIONS'] = 'halt_on_error=1:print_stacktrace=1'
            status, output, errors = run([compiler, *flags, str(isolated_source), '-o', str(binary)], cwd=work, timeout=20, env=env)
            report['compile_output'] = (output + errors)[:16000]
            if status:
                report['error'] = 'Compilation failed. Read compile_output; sanitizer support depends on the compiler/platform.'
                return report
            command = [str(binary)]
            if sanitize:
                report['sanitizer'] = 'enabled-for-these-cases'
        elif mode == 'python':
            command = [sys.executable, '-I', str(isolated_source)]
        elif mode == 'javascript':
            node = shutil.which('node')
            if not node:
                raise RuntimeError('Node.js is required for this JavaScript function lab.')
            command = [node, str(js_helper), str(isolated_source)]
        elif mode in ('sql', 'flask'):
            command = [sys.executable, '-I', str(helper)]
        else:
            raise ValueError(f'Unsupported automatic runner: {mode}')
        for case in task['tests']:
            case_input = case['input']
            if mode in ('sql', 'flask'):
                case_input = json.dumps({'mode': mode, 'source': str(isolated_source), 'input': case_input,
                                         'check_json': mode == 'flask' and 'json' in case['expected']})
            elif mode == 'javascript':
                case_input = json.dumps(case_input)
            status, output, errors = run(command, cwd=work, text=case_input, env=env)
            actual: Any = normalized(output)
            if mode in ('sql', 'flask', 'javascript') and status == 0:
                try:
                    actual = json.loads(output)
                except json.JSONDecodeError:
                    errors = 'Expected one JSON result from the test harness. Extra printing may interfere.\n' + errors
                    status = -1
            expected = case['expected']
            if mode in ('c', 'python'):
                expected = normalized(expected)
            passed = status == 0 and actual == expected
            report['results'].append({'id': case['id'], 'label': case['label'], 'passed': passed,
                                      'expected': expected, 'actual': actual,
                                      'error': errors[:8000] if errors else ''})
        report['passed'] = bool(report['results']) and all(x['passed'] for x in report['results'])
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lab', type=Path, default=Path('lab.json'), help='Manifest path (default: lab.json)')
    parser.add_argument('--source', type=Path, help='Optional alternative source file')
    parser.add_argument('--sanitize', action='store_true', help='Use supported C address/undefined sanitizers')
    parser.add_argument('--output', type=Path, default=Path('result.json'), help='Result report path')
    args = parser.parse_args()
    print('LOCAL PRACTICE CHECK: runs your code on this computer. Not a sandbox or verified exam.\n')
    try:
        report = check(args.lab, args.source, args.sanitize)
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print(f'Setup error: {error}', file=sys.stderr)
        return 2
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    if report.get('compile_output'):
        print(report['compile_output'])
    if report.get('error'):
        print(report['error'])
    for result in report['results']:
        print(('PASS' if result['passed'] else 'FAIL') + '  ' + result['label'])
        if not result['passed']:
            print('  Expected:', repr(result['expected']))
            print('  Actual:  ', repr(result['actual']))
            if result['error']:
                print('  Detail:  ', result['error'])
    total = len(report['results'])
    passed = sum(item['passed'] for item in report['results'])
    print(f'\n{passed}/{total} cases passed. Report: {args.output.resolve()}')
    print('Upload result.json to the same assignment on your course website. Declare assistance there.')
    return 0 if report['passed'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
