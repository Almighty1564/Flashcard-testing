"""Build the desktop plugin without downloading dependencies. Reproducible CommonJS bundle."""
from pathlib import Path
import json
root=Path(__file__).resolve().parent
names=['core','transport','engine','plugin']
parts=['/* Tomato08 Notebook Sync 1.0.0. Source modules are included in this repository. */\n',"'use strict';\nconst __modules = Object.create(null), __cache = Object.create(null);\n"]
for name in names:
    source=(root/'src'/f'{name}.cjs').read_text()
    for dep in names:source=source.replace(f"require('./{dep}.cjs')",f"__load('{dep}')")
    parts.append(f'__modules[{json.dumps(name)}] = (module, exports) => {{\n{source}\n}};\n')
parts.append("function __load(name){if(!__cache[name]){const m={exports:{}};__cache[name]=m;__modules[name](m,m.exports);}return __cache[name].exports;}\nmodule.exports=__load('plugin');\n")
(root/'main.js').write_text(''.join(parts))
