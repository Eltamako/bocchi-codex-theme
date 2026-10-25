import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {WallpaperCatalog,validatePng} from '../engine/wallpaper-store.mjs';
const root=path.resolve(import.meta.dirname,'..');
const source=await fs.readFile(path.join(root,'engine/runtime.mjs'),'utf8');
test('Windows target discovery preserves the native URL and endpoint ownership without Mac modules',async()=>{
 const state={port:9347,browserId:'owner'}; // Existing Windows state has no platform field.
 const targets=[{id:'native',type:'page',url:'app://-/index.html',webSocketDebuggerUrl:'ws://127.0.0.1:9347/devtools/page/native'},{id:'web',type:'page',url:'https://chatgpt.com'},{id:'frame',type:'iframe',url:'app://-/index.html'}];
 const calls=[];
 const context={state,URL,process:{platform:'win32'},json:async url=>{calls.push(url);return url.endsWith('/version')?{webSocketDebuggerUrl:'ws://127.0.0.1:9347/devtools/browser/owner'}:targets;}};
 vm.runInNewContext(source.slice(source.indexOf('function wsUrl('),source.indexOf('function transientError('))+source.slice(source.indexOf('async function getTargets('),source.indexOf('function cdpFailure(')),context);
 assert.deepEqual(JSON.parse(JSON.stringify(await context.getTargets())),[targets[0]]);
 assert.equal(calls.length,2);
 targets[0].webSocketDebuggerUrl='ws://127.0.0.1:9999/devtools/page/native';
 await assert.rejects(context.getTargets(),/Unexpected endpoint/);
});
test('Windows payload loads the stable adapter and all six assets without reading Mac files',async()=>{
 const adapter=JSON.parse(await fs.readFile(path.join(root,'theme/adapter.json'),'utf8'));
 const paths=[];
 const context={root,path,createHash,validatePng,state:{appVersion:adapter.appVersion,packageVersion:adapter.packageVersion},assetCache:null,catalogReader:new WallpaperCatalog(path.join(root,'theme')),fs:{stat:fs.stat,readFile:async(...args)=>{paths.push(args[0]);assert(!String(args[0]).includes('/macos/'));return fs.readFile(...args);}}};
 vm.runInNewContext(source.slice(source.indexOf('async function payload('),source.indexOf('const sessions=new Map()')),context);
 const result=await context.payload();
 assert.equal(result.data.adapter.appVersion,'26.1016.51333');
 assert.equal(result.data.adapter.packageVersion,'26.1016.6573.0');
 assert.equal(result.data.wallpaperCatalog.length,6);
 const reads=paths.length;assert.equal((await context.payload()).hash,result.hash);assert.equal(paths.length,reads);
 context.state.packageVersion='wrong';context.assetCache=null;
 await assert.rejects(context.payload(),/Adapter version mismatch/);
});
