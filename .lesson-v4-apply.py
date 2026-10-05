"""Temporary, checksummed source transfer; removed before publishing the implementation."""
from pathlib import Path
import base64, hashlib, json, subprocess, zlib
root=Path.cwd()
assert subprocess.check_output(['git','branch','--show-current'],text=True).strip()=='ui/lesson-workspace-v4'
parts=[root/f'.lesson-v4-payload-{i}.txt' for i in range(1,4)]
encoded=''.join(p.read_text().strip() for p in parts)
assert hashlib.sha256(encoded.encode()).hexdigest()=='a325c8c6c76079d85da79ddf180ecaf8e3ccc9793f24f93e7138c920a81b909c', 'Source transfer checksum mismatch'
records=json.loads(zlib.decompress(base64.b64decode(encoded,validate=True)))
allowed={'cs50/index.html','cs50/lesson/media.js','cs50/lesson/workspace.js','cs50/lesson/workspace.css','cs50/lesson/README.md','tests/lesson-workspace.test.cjs','tests/lesson-workspace-browser.py','tests/lesson-provider-browser.py','tests/course-path-browser.py','tests/python-drills-browser.py'}
assert {r['path'] for r in records}==allowed and len(records)==len(allowed)
for r in records:
 p=root/r['path']
 if r['before'] is None: assert not p.exists(), 'Unexpected existing file: '+str(p)
 else: assert p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==r['before'], 'Source changed since inspection: '+str(p)
 assert hashlib.sha256(r['content'].encode()).hexdigest()==r['after']
for r in records:
 p=root/r['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(r['content'].encode())
cleanup=['.lesson-v4-apply.py']+[p.name for p in parts]
for name in cleanup:(root/name).unlink()
(root/'.git/lesson-v4-paths.txt').write_text('\n'.join(sorted(allowed)+cleanup)+'\n')
print('Validated and installed 10 lesson interface/test files. Existing data engines unchanged.')
