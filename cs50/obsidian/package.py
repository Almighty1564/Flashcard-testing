"""Create the deterministic manual-install archive; no credentials or state are packaged."""
from pathlib import Path
import zipfile,hashlib
root=Path(__file__).resolve().parent
with zipfile.ZipFile(root/'tomato08-notebook-sync.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name in ['main.js','manifest.json','styles.css','SETUP.md']:
        item=zipfile.ZipInfo('tomato08-notebook-sync/'+name,(2026,9,27,0,0,0));item.compress_type=zipfile.ZIP_DEFLATED;item.external_attr=0o100644<<16
        z.writestr(item,(root/name).read_bytes())
(root/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256((root/name).read_bytes()).hexdigest()+'  '+name+'\n' for name in ['main.js','manifest.json','styles.css','tomato08-notebook-sync.zip']))
