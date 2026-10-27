// Full-module Windows dependency probe. Runs only in an isolated VM child.
// Filesystem state/control writes and HTTP responses are fixtures; no client,
// process controls or network endpoint is accessed.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(process.argv[2]);
const original=await fs.readFile(path.join(root,'engine/runtime.mjs'),'utf8');
const release=JSON.parse(await fs.readFile(path.join(root,'release.json'),'utf8'));
const fixtureParent=path.join(root,'.test-output');
await fs.mkdir(fixtureParent,{recursive:true});
// mkdtemp needs an extended Windows path when nested ZIP checks exceed MAX_PATH.
// Keep ordinary paths for VM module URLs after creating the directory atomically.
const fixtureName=path.basename(await fs.mkdtemp(path.toNamespacedPath(path.join(fixtureParent,'windows-boundary-'))));
const fixtureBase=path.join(fixtureParent,fixtureName);
const route='app://-/index.html?initialRoute=%2Flocal%2F00000000-0000-0000-0000-000000000000';
const makeTarget=(id,url='app://-/index.html')=>({id,type:'page',url,webSocketDebuggerUrl:'ws://127.0.0.1:9347/devtools/page/'+id});

async function probe(name,{coexist=false,platform,mutation=''}={}){
 const fixture=path.join(fixtureBase,name),stateRoot=path.join(fixture,'.local');
 await fs.mkdir(path.join(fixture,'engine'),{recursive:true});
 if(coexist){
  await fs.mkdir(path.join(fixture,'macos'),{recursive:true});
  await fs.writeFile(path.join(fixture,'macos/adapter.json'),'{"platform":"darwin","packageVersion":"21828"}');
  for(const relative of ['engine/macos-app.mjs','engine/macos-identity.mjs'])await fs.writeFile(path.join(fixture,relative),'throw Error("Mac poison module executed on Windows");');
 }
 const logs={imports:[],reads:[],writes:[],http:[],forbidden:[]};
 const reject=(kind,value)=>{logs.forbidden.push({kind,value});throw Error('Windows platform boundary: '+kind);};
 const isMac=value=>/(^|\/)(?:macos|macos-[^/]+)(?:\/|$)/i.test(String(value).replaceAll('\\','/'));
 const checkedPath=value=>{const p=value instanceof URL?fileURLToPath(value):String(value);if(isMac(p))reject('Mac filesystem access',p);return path.resolve(p);};
 const translate=p=>p.startsWith(fixture+path.sep)?path.join(root,path.relative(fixture,p)):p;
 const state={schema:'bocchi-runtime/1',port:9347,browserId:'owner',generation:'fixture',appVersion:release.appVersion,packageVersion:release.packageVersion,...(platform===undefined?{}:{platform})};
 const memory=new Map([
  [path.join(stateRoot,'runtime-state.json'),JSON.stringify(state)],
  [path.join(fixture,'installation.json'),JSON.stringify({schema:'bocchi-local-install/1',stateRoot,...(platform===undefined?{}:{platform})})],
  [path.join(stateRoot,'control.json'),JSON.stringify({paused:true,stop:false})],
 ]);
 const safeFs={
  async readFile(value,options){const p=checkedPath(value);logs.reads.push(p);if(memory.has(p)){const value=Buffer.from(memory.get(p));return options?value.toString(typeof options==='string'?options:options.encoding):value;}if(p===path.join(fixture,'engine/runtime.mjs'))return options?code:Buffer.from(code);return fs.readFile(translate(p),options);},
  async stat(value,options){const p=checkedPath(value);if(memory.has(p))return{size:Buffer.byteLength(memory.get(p)),isFile:()=>true};return fs.stat(translate(p),options);},
  async lstat(value,options){const p=checkedPath(value);if(p===stateRoot)return{isSymbolicLink:()=>false};return fs.lstat(translate(p),options);},
  async writeFile(value,data){const p=checkedPath(value);if(!p.startsWith(stateRoot+path.sep))reject('write outside fixture state',p);logs.writes.push(p);memory.set(p,String(data));},
  async rename(from,to){from=checkedPath(from);to=checkedPath(to);if(!from.startsWith(stateRoot+path.sep)||!to.startsWith(stateRoot+path.sep))reject('rename outside fixture state',to);memory.set(to,memory.get(from));memory.delete(from);},
  async unlink(value){const p=checkedPath(value);if(!p.startsWith(stateRoot+path.sep))reject('unlink outside fixture state',p);memory.delete(p);},
 };
 let targets=[];
 const fakeProcess={argv:['node',path.join(fixture,'engine/runtime.mjs'),'once',path.join(stateRoot,'runtime-state.json')],platform:'win32',pid:4242,on:()=>{},exit:()=>reject('process exit','exit')};
 const context=vm.createContext({process:fakeProcess,Buffer,URL,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval,console:{log:()=>{}},
  fetch:async value=>{logs.http.push(value);if(!/^http:\/\/127\.0\.0\.1:9347\/json\/(version|list)$/.test(value))reject('unexpected endpoint',value);return{ok:true,text:async()=>JSON.stringify(value.endsWith('/version')?{webSocketDebuggerUrl:'ws://127.0.0.1:9347/devtools/browser/owner'}:targets)};},
  WebSocket:class {constructor(){reject('unexpected WebSocket connection','connect');}},
 });
 let code=original;
 if(mutation==='static-import')code="import './macos-app.mjs';\n"+code;
 if(mutation==='dynamic-import')code=code.replace('async function payload(){',"async function payload(){ await import('./macos-app.mjs');");
 if(mutation==='adapter-read')code=code.replace('async function payload(){',"async function payload(){ await fs.readFile(path.join(root,'macos','adapter.json'),'utf8');");
 if(mutation==='platform-command')code=code.replace('async function payload(){',"async function payload(){ (await import('node:child_process')).execFile('codesign',[]);");
 if(mutation==='guarded-import')code=code.replace('async function payload(){',"async function payload(){ if(process.platform==='darwin') await import('./macos-app.mjs');");
 code+='\nexport {payload,getTargets};\n';
 const modules=new Map();
 async function moduleFor(specifier,parent=pathToFileURL(path.join(fixture,'engine/runtime.mjs')).href){
  const identifier=specifier.startsWith('node:')?specifier:new URL(specifier,parent).href;
  logs.imports.push(identifier);
  if(isMac(identifier))reject('Mac module import',identifier);
  if(modules.has(identifier))return modules.get(identifier);
  let module;
  if(identifier.startsWith('node:')){
   let namespace;
   if(identifier==='node:fs/promises')namespace={default:safeFs,...safeFs};
   else if(identifier==='node:child_process')namespace={execFile:(command)=>reject('platform command',command),execSync:(command)=>reject('platform command',command),spawn:(command)=>reject('platform command',command)};
   else{if(!['node:path','node:crypto','node:zlib'].includes(identifier))reject('unreviewed builtin',identifier);namespace=await import(identifier);}
   module=new vm.SyntheticModule(Object.keys(namespace),function(){for(const [key,value] of Object.entries(namespace))this.setExport(key,value);},{context,identifier});
  }else{
   const p=fileURLToPath(identifier);
   if(!p.startsWith(fixture+path.sep))reject('module outside fixture',p);
   const body=p===path.join(fixture,'engine/runtime.mjs')?code:await fs.readFile(translate(p),'utf8');
   module=new vm.SourceTextModule(body,{context,identifier,
    initializeImportMeta:meta=>{meta.url=identifier;meta.dirname=path.dirname(p);meta.filename=p;},
    importModuleDynamically:async(specifier,referrer)=>{const child=await moduleFor(specifier,referrer.identifier);if(child.status==='unlinked')await child.link((specifier,referrer)=>moduleFor(specifier,referrer.identifier));if(child.status==='linked')await child.evaluate();return child;},
   });
  }
  modules.set(identifier,module);return module;
 }
 let failure=null,summary=null;
 try{
  const main=await moduleFor(pathToFileURL(path.join(fixture,'engine/runtime.mjs')).href);
  await main.link((specifier,referrer)=>moduleFor(specifier,referrer.identifier));await main.evaluate();
  const paused=JSON.parse(memory.get(path.join(stateRoot,'status.json')));
  if(paused.state!=='paused')throw Error('Expected isolated once/pause startup');
  const payload=await main.namespace.payload(),again=await main.namespace.payload();
  targets=[makeTarget('main'),makeTarget('task',route),makeTarget('web','https://example.invalid')];
  const discovered=await main.namespace.getTargets();
  summary={state:paused.state,payloadPlatform:payload.data.adapter.platform??'win32',appVersion:payload.data.adapter.appVersion,packageVersion:payload.data.adapter.packageVersion,wallpapers:payload.data.wallpaperCatalog.map(v=>v.id),cacheSame:payload.hash===again.hash,targets:discovered.map(v=>v.id)};
 }catch(error){failure=String(error.message);}
 return{name,coexist,platform:platform??'legacy-win32',mutation,failure,summary,...logs};
}
const cases=[];
for(const coexist of [false,true])for(const platform of [undefined,'win32'])cases.push(await probe((coexist?'coexist':'absent')+'-'+(platform??'legacy'),{coexist,platform}));
cases.push(await probe('guarded-mac-code',{coexist:true,platform:'win32',mutation:'guarded-import'}));
for(const mutation of ['static-import','dynamic-import','adapter-read','platform-command'])cases.push(await probe('negative-'+mutation,{coexist:true,platform:'win32',mutation}));
console.log(JSON.stringify({scope:'Actual ESM runtime and imported modules in isolated VM; simulated Windows host/CDP, no native client',fixtureBase,cases}));
