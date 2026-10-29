import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../engine/runtime.mjs',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('async function readLauncherState('),source.indexOf('const state=await readLauncherState'));
function reader(readFile){
 const waits=[];
 const context={fs:{readFile},setTimeout:(fn,ms)=>{waits.push(ms);queueMicrotask(fn);}};
 vm.runInNewContext(helper,context);
 return {read:context.readLauncherState,waits};
}
test('launcher-state read recovers across the Windows replacement gap',async()=>{
 let reads=0;const r=reader(async file=>{assert.equal(file,'state.json');if(++reads<4)throw Object.assign(Error('missing'),{code:'ENOENT'});return '{"schema":"bocchi-runtime/1","generation":"same"}';});
 const result=await r.read('state.json');assert.equal(reads,4);assert.equal(result.generation,'same');assert.deepEqual(r.waits,[25,25,25]);
});
test('permanently missing launcher state has a bounded one-second retry budget',async()=>{
 let reads=0;const missing=Object.assign(Error('missing'),{code:'ENOENT'});
 const r=reader(async()=>{reads++;throw missing;});
 await assert.rejects(r.read('state.json'),error=>error===missing);assert.equal(reads,41);assert.equal(r.waits.length,40);assert.equal(r.waits.reduce((sum,ms)=>sum+ms,0),1000);
});
test('malformed state is rejected immediately instead of treated as a startup delay',async()=>{
 let reads=0;const r=reader(async()=>{reads++;return '{invalid';});
 await assert.rejects(r.read('state.json'),error=>error.name==='SyntaxError');assert.equal(reads,1);assert.deepEqual(r.waits,[]);
});
test('access-denied and unrelated I/O errors retain their original failure immediately',async()=>{
 for(const code of ['EACCES','EIO']){
  let reads=0;const failure=Object.assign(Error(code),{code});const r=reader(async()=>{reads++;throw failure;});
  await assert.rejects(r.read('state.json'),error=>error===failure);assert.equal(reads,1);assert.deepEqual(r.waits,[]);
 }
});
test('Windows delete-pending errors share the missing-file retry budget',async()=>{
 let reads=0;const r=reader(async()=>{if(++reads===1)throw Object.assign(Error('missing'),{code:'ENOENT'});if(reads===2)throw Object.assign(Error('delete-pending'),{code:'EPERM'});return '{"generation":"same"}';});
 const state=await r.read('state.json');assert.equal(state.generation,'same');assert.equal(reads,3);assert.deepEqual(r.waits,[25,25]);
});
test('persistent EPERM is not bypassed and throws the original error after one second',async()=>{
 let reads=0;const denied=Object.assign(Error('denied'),{code:'EPERM'});const r=reader(async()=>{reads++;throw denied;});
 await assert.rejects(r.read('state.json'),error=>error===denied);assert.equal(reads,41);assert.equal(r.waits.reduce((sum,ms)=>sum+ms,0),1000);
});
test('a recovered state still passes through the existing ownership and version checks',async()=>{
 const start=source.indexOf('const state=await readLauncherState(statePath);');
 const checks=source.slice(start,source.indexOf('const controlPath=',start));
 const root=path.resolve('theme-test-root');
 for(const invalid of ['schema','path','installation']){
  const statePath=path.join(root,'.local',invalid==='path'?'other.json':'runtime-state.json');
  const state={schema:invalid==='schema'?'wrong':'bocchi-runtime/1'};
  const installation={schema:invalid==='installation'?'wrong':'bocchi-local-install/1',stateRoot:path.join(root,'.local')};
  const context={root,statePath,path,readLauncherState:async()=>state,fs:{readFile:async()=>JSON.stringify(installation),lstat:async()=>({isSymbolicLink:()=>false})}};
  await assert.rejects(vm.runInNewContext('(async()=>{'+checks+'})()',context),/Invalid (runtime state|installation) ownership/);
 }
});
test('a control-file replacement gap preserves the current operation and observes pause',async()=>{
 const code=source.slice(source.indexOf('async function assertControlActive('),source.indexOf('async function install('));
 let reads=0;const r=reader(async file=>{assert.equal(file,'control.json');if(++reads<=2)throw Object.assign(Error('missing'),{code:'ENOENT'});return '{"paused":true,"stop":false}';});
 const context={readLauncherState:r.read,controlPath:'control.json',running:true,transientError:(code,message)=>Object.assign(Error(message),{code})};
 vm.runInNewContext(code,context);
 await assert.rejects(context.assertControlActive(),error=>error.code==='LOADER_PAUSED');assert.equal(reads,3);assert.deepEqual(r.waits,[25,25]);
});
