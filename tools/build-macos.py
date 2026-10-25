#!/usr/bin/env python3
"""Build the experimental Mac package without local profiles or official app code."""
from pathlib import Path
import hashlib,json,zipfile,sys
root=Path(__file__).resolve().parent.parent
binary=root/'engine/node-darwin-arm64'
expected=json.loads((root/'macos/node-checksum.json').read_text())['binarySha256']
if not binary.exists() or hashlib.sha256(binary.read_bytes()).hexdigest()!=expected:
    raise SystemExit('Missing or mismatched official Node arm64 binary')
output=Path(sys.argv[1]) if len(sys.argv)>1 else root/'dist/bocchi-codex-macos-arm64-experimental.zip'
output.parent.mkdir(parents=True,exist_ok=True)
files=list((root/'theme').rglob('*'))+list((root/'macos').rglob('*'))
files += [root/'engine'/name for name in ['runtime.mjs','wallpaper-store.mjs','language.mjs','macos-identity.mjs','macos-app.mjs','node-darwin-arm64','LICENSE-Node.txt','LICENSE-Dynamic-Skin.txt']]
files += list(root.glob('*.command'))
files += [root/name for name in ['LICENSE','ASSETS.md','THIRD_PARTY_NOTICES.md']]
files += list((root/'tests').glob('macos-*.test.mjs'))+list((root/'tests').glob('runtime-*.test.mjs'))+list((root/'tests').glob('environment.test.mjs'))+list((root/'tests').glob('wallpaper-store.test.mjs'))
files += [root/'tools'/name for name in ['build-macos.py','inspect-macos.py','check-assets.mjs','test-macos-session.mjs','test-renderer.mjs']]
excluded={'macos/live-validation.json','macos/renderer-fixture-validation.json','macos/node-tests.txt'}
files=[p for p in files if p.is_file() and p.name!='.DS_Store' and p.relative_to(root).as_posix() not in excluded]
if any(p.is_symlink() or not p.resolve().is_relative_to(root) for p in files):
    raise SystemExit('Linked or foreign source file; review before packaging')
entries={str(Path('Bocchi-macOS')/p.relative_to(root)):p for p in files}
entries['Bocchi-macOS/README.md']=root/'macos/README.md'
manifest=''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+name+'\n' for name,p in sorted(entries.items()))
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for name,p in sorted(entries.items()):archive.write(p,name)
    archive.writestr('CHECKSUMS-macos.sha256',manifest)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert not any('/.local/' in n or n.endswith('installation.json') for n in archive.namelist())
    assert archive.getinfo('Bocchi-macOS/02-启动主题.command').external_attr>>16 & 0o111
print(output)
print('bytes:',output.stat().st_size)
print('sha256:',hashlib.sha256(output.read_bytes()).hexdigest())
