#!/usr/bin/env python3
"""Read a signed installed app's ASAR without executing or modifying app code."""
import datetime, hashlib, json, re, struct, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
app = Path(sys.argv[1] if len(sys.argv)>1 else '/Applications/ChatGPT.app').resolve()
requirement = '=anchor apple generic and identifier "com.openai.codex" and certificate leaf[subject.OU] = "2DC432GLL2"'
subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict','-R',requirement,str(app)],check=True)
plist = json.loads(subprocess.check_output(['/usr/bin/plutil','-convert','json','-o','-',str(app/'Contents/Info.plist')]))
adapter = json.loads((root/'macos/adapter.json').read_text())
assert plist['CFBundleShortVersionString']==adapter['appVersion']
assert str(plist['CFBundleVersion'])==adapter['packageVersion']
asar = app/'Contents/Resources/app.asar'
with asar.open('rb') as f:
    sizes=struct.unpack('<4I',f.read(16))
    header=f.read(sizes[3]); tree=json.loads(header); base=8+sizes[1]
    header_hash=hashlib.sha256(header).hexdigest()
    assert header_hash==plist['ElectronAsarIntegrity']['Resources/app.asar']['hash'], 'ASAR header integrity mismatch'
    def walk(files,prefix=''):
        for name,value in files.items():
            name=prefix+name
            if 'files' in value: yield from walk(value['files'],name+'/')
            else: yield name,value
    sources={}
    for name,value in walk(tree['files']):
        # Only application JS; vendor assets, user files and login data are excluded.
        if not value.get('unpacked') and name.endswith('.js') and (name.startswith('.vite/build/') or re.fullmatch(r'webview/assets/[^/]+\.js',name)):
            f.seek(base+int(value['offset']));sources[name]=f.read(value['size']).decode('utf-8')

keys=['activePage','surface','composer','composerBody','chatReader','localWorkComposer','requestCard','workComposerRoot','workThreadScroll','workReader','workSubmittingInput']
selectors={}
for key in keys:
    selector=adapter[key]
    tokens=re.findall(r'\[([\w-]+)',selector)+re.findall(r'\.([a-z][\w-]*)',selector)
    matches={t:[n for n,s in sources.items() if n.startswith('webview/') and t in s] for t in tokens}
    missing=[t for t,names in matches.items() if not names]
    selectors[key]={'selector':selector,'tokensPresent':not missing,'missing':missing,
                    'sources':{t:names[:8] for t,names in matches.items()},
                    'sourceCounts':{t:len(names) for t,names in matches.items()}}
    assert not missing, (key,missing)
profile=[n for n,s in sources.items() if n.startswith('.vite/') and 'CODEX_ELECTRON_USER_DATA_PATH' in s]
assert profile,'Profile isolation marker missing'
reader=[n for n,s in sources.items() if '[Rv]:c' in s and 'Rv=`data-chatgpt-conversation-selection-target`' in s]
assert reader, 'Reinspect conversation reader value; source implementation changed'
report={'schema':'bocchi-mac-static-validation/1','source':'installed signed application','appPath':str(app),'appVersion':adapter['appVersion'],'build':adapter['packageVersion'],'bundleId':plist['CFBundleIdentifier'],'signingRequirement':requirement,'signatureVerified':True,'inspectedOn':datetime.date.today().isoformat(),'asarHeaderSha256':header_hash,'selectors':selectors,'sourceListPolicy':'Up to eight filenames per marker; sourceCounts records all matches. Marker presence does not prove DOM structure.','conversationReader':{'attributeValue':'conversation ID, not boolean true','sources':reader},'profileIsolation':{'environment':'CODEX_ELECTRON_USER_DATA_PATH','sources':profile},'limitation':'Installed source inspection and signature verification only. Live launch, layout and restoration evidence is recorded separately in macos/validation.md.'}
dest=root/'macos/static-validation.json';dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'report':str(dest),'version':adapter['appVersion'],'build':adapter['packageVersion'],'selectorGroups':len(selectors),'signatureVerified':True,'asarHeaderSha256':header_hash},indent=2))
