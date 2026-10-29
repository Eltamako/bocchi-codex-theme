import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {WallpaperCatalog,validatePng} from '../engine/wallpaper-store.mjs';

const root=path.resolve(import.meta.dirname,'..');
const source=await fs.readFile(path.join(root,'engine/runtime.mjs'),'utf8');
const run=promisify(execFile);
let boundaryResult;
function boundary(){
 return boundaryResult??=run(process.execPath,['--preserve-symlinks','--preserve-symlinks-main','--experimental-vm-modules',path.join(root,'tests/windows-boundary-probe.mjs'),root],{timeout:120000,maxBuffer:8*1024*1024}).then(({stdout})=>JSON.parse(stdout));
}
function between(start,end){
 const begin=source.indexOf(start),finish=source.indexOf(end,begin);
 assert(begin>=0&&finish>begin,'Expected Windows runtime section: '+start);
 return source.slice(begin,finish);
}
const discovery=between('function wsUrl(', 'function transientError(')+between('function isMainPageUrl(', 'function cdpFailure(');
const state={port:9347,browserId:'owner'};
const route='app://-/index.html?initialRoute=%2Flocal%2F00000000-0000-0000-0000-000000000000';
const page=(id,url='app://-/index.html')=>({id,type:'page',url,webSocketDebuggerUrl:'ws://127.0.0.1:9347/devtools/page/'+id});
function discoveryContext(list,browserIds=['owner','owner']){
 let probes=0;const calls=[];
 const context={state,URL,json:async url=>{calls.push(url);return url.endsWith('/version')?{webSocketDebuggerUrl:'ws://127.0.0.1:9347/devtools/browser/'+browserIds[probes++]}:list;}};
 vm.runInNewContext(discovery,context);return{context,calls};
}

test('Windows discovery keeps both main and routed windows between two browser-identity probes',async()=>{
 const targets=[page('main'),page('task',route),page('web','https://chatgpt.com'),{...page('frame'),type:'iframe'},page('query','app://-/index.html?initialRoute=/local/not-a-uuid')];
 const {context,calls}=discoveryContext(targets);
 assert.deepEqual(JSON.parse(JSON.stringify(await context.getTargets())),targets.slice(0,2));
 assert.deepEqual(calls,['http://127.0.0.1:9347/json/version','http://127.0.0.1:9347/json/list','http://127.0.0.1:9347/json/version']);
});

test('Windows discovery rejects browser swaps, duplicate targets and substituted page endpoints',async()=>{
 for(const [list,browserIds,reason] of [
  [[page('main')],['other','owner'],/Unexpected endpoint/],
  [[page('main')],['owner','other'],/Unexpected endpoint/],
  [{targets:[]},['owner','owner'],/Invalid target list/],
  [[page('same'),page('same',route)],['owner','owner'],/Invalid target identity/],
  [[page('bad/id')],['owner','owner'],/Invalid target identity/],
  [[{...page('main'),webSocketDebuggerUrl:'ws://127.0.0.1:9999/devtools/page/main'}],['owner','owner'],/Unexpected endpoint/],
  [[{...page('main'),webSocketDebuggerUrl:'ws://127.0.0.1:9347/devtools/page/other'}],['owner','owner'],/Unexpected endpoint/]
 ]){
  const {context}=discoveryContext(list,browserIds);
  await assert.rejects(context.getTargets(),reason);
 }
});

test('Windows payload uses the current 2.8.1 adapter, six real wallpapers and bounded renderer assets',async()=>{
 const release=JSON.parse(await fs.readFile(path.join(root,'release.json'),'utf8'));
 assert.equal(release.releaseVersion,'2.8.1');assert.equal(release.themeVersion,'2.8.1');assert.equal(release.launcherVersion,'1.3.1');
 assert.equal(release.appVersion,'26.1023.51421');assert.equal(release.packageVersion,'26.1023.6621.0');
 const context={root,fs,path,state:{platform:'win32',appVersion:release.appVersion,packageVersion:release.packageVersion},process:{platform:'win32'},catalogReader:new WallpaperCatalog(path.join(root,'theme')),assetCache:null,createHash,validatePng};
 // The shared integration has an additional exact platform validator. Exercise
 // it when present instead of forbidding its existence in a source checkout.
 const platformPolicy=source.includes('function validateRuntimePlatform(')?between('function validateRuntimePlatform(', 'async function json('):'';
 const payloadCode=platformPolicy+between('async function payload(', 'const sessions=new Map()');
 vm.runInNewContext(payloadCode,context);
 const payload=await context.payload();
 assert.equal(payload.data.adapter.themeVersion,release.themeVersion);
 assert.equal(payload.data.adapter.appVersion,release.appVersion);
 assert.equal(payload.data.adapter.packageVersion,release.packageVersion);
 assert.notEqual(payload.data.adapter.platform,'darwin');
 assert.deepEqual(Array.from(payload.data.wallpaperCatalog,item=>item.id),['night-stage','color-portraits','backstage','floating-bocchi','winter-night','headphone-evening']);
 assert(payload.source.length<=128000&&payload.data.css.length<=128000);
 assert(payload.data.sticker.startsWith('data:image/png;base64,')&&payload.data.bandSticker.startsWith('data:image/png;base64,'));
 assert.equal((await context.payload()).hash,payload.hash);
 for(const diff of [{appVersion:'unsupported'},{packageVersion:'21828'}]){
  const wrong={...context,state:{...context.state,...diff},assetCache:null};
  vm.runInNewContext(payloadCode,wrong);
  await assert.rejects(wrong.payload(),/Adapter version mismatch/);
 }
});

function assertWindowsProbe(result){
 assert.equal(result.failure,null,result.name+': '+result.failure);
 assert.deepEqual(result.forbidden,[]);
 assert.equal(result.summary.state,'paused');
 assert.equal(result.summary.payloadPlatform,'win32');
 assert.equal(result.summary.appVersion,'26.1023.51421');
 assert.equal(result.summary.packageVersion,'26.1023.6621.0');
 assert.equal(result.summary.cacheSame,true);
 assert.deepEqual(result.summary.targets,['main','task']);
 assert.equal(result.summary.wallpapers.length,6);
 assert(result.imports.some(value=>value.endsWith('/engine/wallpaper-store.mjs')));
 assert(result.reads.some(value=>value.replaceAll('\\','/').endsWith('/theme/adapter.json')));
}

test('full Windows runtime executes without Mac files for legacy and explicit Windows state',async()=>{
 const results=(await boundary()).cases.filter(value=>value.name.startsWith('absent-'));
 assert.equal(results.length,2);for(const result of results)assertWindowsProbe(result);
});

test('source coexistence permits Mac files without loading their modules, adapter or commands',async()=>{
 const results=(await boundary()).cases.filter(value=>value.name.startsWith('coexist-'));
 assert.equal(results.length,2);for(const result of results)assertWindowsProbe(result);
});

test('a dormant platform-guarded Mac branch is allowed in shared runtime source',async()=>{
 assertWindowsProbe((await boundary()).cases.find(value=>value.name==='guarded-mac-code'));
});

test('dependency probes detect erroneous static/dynamic Mac imports, adapter reads and platform commands',async()=>{
 const results=(await boundary()).cases.filter(value=>value.name.startsWith('negative-'));
 assert.equal(results.length,4);
 for(const result of results){assert(result.failure,result.name);assert(result.forbidden.length>0,result.name);assert.equal(result.summary,null);}
});
