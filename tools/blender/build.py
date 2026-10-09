"""Build Folio scenes: blender -b -P tools/blender/build.py -- [--only woods] [--no-preview]"""
import importlib
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import kit  # noqa: E402
import props  # noqa: E402
import book  # noqa: E402
import export  # noqa: E402

for m in (kit, props, book, export):
    importlib.reload(m)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
only = None
if '--only' in argv:
    only = set(argv[argv.index('--only') + 1].split(','))
preview = '--no-preview' not in argv

SCENES = ['woods', 'attic', 'lantern', 'deep']

for name in SCENES:
    if only and name not in only:
        continue
    path = os.path.join(HERE, f'{name}.py')
    if not os.path.exists(path):
        print(f'[build] skip {name} (no {name}.py yet)')
        continue
    mod = importlib.import_module(name)
    importlib.reload(mod)
    t0 = time.time()
    scene = mod.build_scene()
    export.build(scene, getattr(mod, 'CAMS', None), do_preview=preview)
    print(f'[build] {name} done in {time.time() - t0:.1f}s')
