"""Temporary, hash-checked source transfer. Removed before the implementation commit."""
from pathlib import Path
from io import BytesIO
import base64, hashlib, json, lzma, os, subprocess, urllib.request
from PIL import Image, ImageOps
root = Path.cwd()
branch = subprocess.check_output(['git','branch','--show-current'], text=True).strip()
assert branch == 'ui/minimal-focus-v3', 'Implementation must stay on its isolated branch'
parts = [root / ('.minimal-focus-payload-' + str(i) + '.txt') for i in range(1, 4)]
encoded = ''.join(p.read_text().strip() for p in parts)
assert hashlib.sha256(encoded.encode()).hexdigest() == 'b7f894d1067dc5cd6f494a38fa1b96dba878a451703718c1bd4acc74fa987024', 'Source transfer checksum mismatch'
files = json.loads(lzma.decompress(base64.b64decode(encoded)))
for record in files:
    p = Path(record['path'])
    assert not p.is_absolute() and '..' not in p.parts and '.git' not in p.parts
    p = root / p
    if record['before'] is None:
        assert not p.exists(), 'Unexpected existing file: ' + str(p)
    else:
        assert p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() == record['before'], 'Source changed since inspection: ' + str(p)
for record in files:
    p = root / record['path']
    if record.get('delete'):
        p.unlink()
        continue
    if 'content' in record:
        data = record['content'].encode()
    else:
        data = p.read_bytes()
        for start, end, replacement in reversed(record['ops']):
            data = data[:start] + replacement.encode() + data[end:]
    assert hashlib.sha256(data).hexdigest() == record['after'], 'Reconstruction mismatch: ' + str(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
# Await the browser's responsive event instead of immediately asserting state.
p = root / 'tests/workspace-browser.py'
s = p.read_text()
a = "        passed('Resizing to desktop resets drawer state'"
assert s.count(a) == 1
s = s.replace(a, "        expect(page.locator('#menuButton')).to_have_attribute('aria-expanded','false')\n" + a)
a = '    finally:\n        browser.close();server.shutdown()'
assert s.count(a) == 1
s = s.replace(a, "    except Exception:\n        try: page.screenshot(path=str(OUT/'failure.png'),full_page=True)\n        except Exception: pass\n        raise\n" + a)
p.write_text(s)
# The requested removal of motivational filler includes the podcast footer.
p = root / 'podcast.html'
data = p.read_bytes()
slogan = b' <span>A little further, every day.</span>'
assert data.count(slogan) == 1, 'Unexpected podcast footer'
p.write_bytes(data.replace(slogan, b''))
subprocess.run(['git','config','core.whitespace','trailing-space,space-before-tab,cr-at-eol'], check=True)
url = 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia17/pia17792/PIA17792.jpg?crop=faces%2Cfocalpoint&fit=clip&h=3456&w=5184'
request = urllib.request.Request(url, headers={'User-Agent':'Tomato08-Atelier-Artwork/1.0'})
with urllib.request.urlopen(request, timeout=60) as response:
    raw = response.read(20 * 1024 * 1024)
image = Image.open(BytesIO(raw)).convert('RGB')
assert image.width >= 1000 and image.height >= 600
image = ImageOps.fit(image, (1000, 1200), method=Image.Resampling.LANCZOS, centering=(0.56, 0.53))
asset = root / 'assets/workspace/communicator.jpg'
image.save(asset, 'JPEG', quality=86, optimize=True, progressive=True)
print('NASA/JPL-Caltech PIA17792 source SHA256:', hashlib.sha256(raw).hexdigest())
print('Self-hosted artwork bytes:', asset.stat().st_size)
cleanup = ['.minimal-focus-apply.py', '.github/workflows/minimal-focus-preview.yml'] + [p.name for p in parts]
paths = [r['path'] for r in files] + ['assets/workspace/communicator.jpg', 'podcast.html'] + cleanup
for name in cleanup:
    (root / name).unlink()
(root / '.git/minimal-focus-paths.txt').write_text('\n'.join(paths) + '\n')
print('Applied and verified', len(files), 'source changes. Production branch unchanged.')
