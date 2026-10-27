import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {SelectionCoordinator} from '../engine/wallpaper-store.mjs';
const source=await fs.readFile(new URL('../engine/runtime.mjs',import.meta.url),'utf8');
const between=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const queue=between('let selectionTail=','const targetFailures=');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}

test('only exact main pages from the same browser can join; duplicate and substituted endpoints fail closed',async()=>{
 let changed=false;
 const make=id=>({id,type:'page',url:'app://-/index.html',webSocketDebuggerUrl:'ws://127.0.0.1:9347/devtools/page/'+id});
 let list=[make('first'),make('second'),{...make('other'),url:'https://example.com'}, {...make('panel'),url:'app://-/settings.html'}, {...make('worker'),type:'worker'}];
 let probes=0;
 const ctx={URL,state:{port:9347,browserId:'owner'},json:async url=>url.endsWith('/list')?list:{webSocketDebuggerUrl:'ws://127.0.0.1:9347/devtools/browser/'+(changed&&++probes===2?'other':'owner')}};
 vm.runInNewContext(between('function wsUrl(', 'function transientError(')+between('function isMainPageUrl(', 'function cdpFailure('),ctx);
 assert.deepEqual(Array.from(await ctx.getTargets(),t=>t.id),['first','second']);
 list=[make('first'),make('first')];await assert.rejects(ctx.getTargets(),/identity/);
 list=[{...make('first'),webSocketDebuggerUrl:'ws://127.0.0.1:9999/devtools/page/first'}];await assert.rejects(ctx.getTargets(),/endpoint/);
 list=[make('first')];changed=true;await assert.rejects(ctx.getTargets(),/endpoint/);
 const route='app://-/index.html?initialRoute=%2Flocal%2F00000000-0000-0000-0000-000000000000';
 assert(ctx.isMainPageUrl(route));
 for(const bad of [route+'&extra=1',route+'&initialRoute=%2Favatar-overlay',route+'#extra',route.replace('/index.html','/detached-window.html'),'app://-/index.html?initialRoute=%2Favatar-overlay','app://-/index.html?initialRoute=%2Flocal%2Fnot-a-task'])assert.equal(ctx.isMainPageUrl(bad),false,bad);
});

test('a slow or closing new window cannot remove a healthy sibling session',async()=>{
 const waiting=deferred(),existing={contextId:1,coordinator:{active:true}};
 const sessions=new Map([['first',existing]]),removed=[];
 const ctx={sessions,targetFailures:new Map(),Date,mainContext:async()=>1,invalidate:()=>{},makeSession:async()=>({}),install:async()=>{await waiting.promise;throw Object.assign(Error('closed'),{code:'CONNECTION_CLOSED'});},evaluate:async(c,expression)=>expression.startsWith('!!')?true:{installed:true,ready:true},cleanSession:async s=>removed.push(s),isTransientError:e=>e.code==='CONNECTION_CLOSED'};
 vm.runInNewContext(between('async function refreshTarget(', "if(action==='restore')"),ctx);
 const newWindow=ctx.refreshTarget({id:'second'},{},{});
 const oldWindow=await ctx.refreshTarget({id:'first'},{},{});
 assert.equal(oldWindow.ready,true);assert.equal(sessions.get('first'),existing);
 waiting.resolve();const failed=await newWindow;
 assert.equal(failed.targetId,'second');assert.equal(failed.ready,false);assert.equal(failed.reason,'renderer-not-ready');assert.equal(removed.length,1);assert(!removed.includes(existing));
 assert.equal((await ctx.refreshTarget({id:'first'},{},{})).ready,true);
});

test('heartbeat proceeds independently and cannot renew after pause, stop, disposal or context replacement',async()=>{
 let tick,control={paused:false,stop:false},calls=0,readGate=null;
 const s={contextId:7,epoch:2,disposed:false};
 const ctx={clearInterval:()=>{},setInterval:fn=>{tick=fn;return 1;},fs:{readFile:async()=>{if(readGate)await readGate.promise;return JSON.stringify(control);}},controlPath:'control',Date,evaluate:async()=>{calls++;}};
 vm.runInNewContext(between('function startHeartbeat(', 'function cancelExpression('),ctx);ctx.startHeartbeat(s);
 await tick();assert.equal(calls,1);
 control.paused=true;await tick();control={paused:false,stop:true};await tick();assert.equal(calls,1);
 control.stop=false;readGate=deferred();const late=tick();s.epoch++;s.contextId=8;readGate.resolve();await late;assert.equal(calls,1);
 readGate=null;s.disposed=true;await tick();assert.equal(calls,1);
});

test('all-window cleanup continues when a closing target cannot connect',async()=>{
 const closed=[],removed=[];
 const ctx={sessions:new Map([['first',{}],['second',{}]]),targetFailures:new Map([['second',{}]]),cleanSession:async()=>{},getTargets:async()=>[{id:'gone',webSocketDebuggerUrl:'gone'},{id:'live',webSocketDebuggerUrl:'live'}],connect:async url=>{if(url==='gone')throw Error('closed');return{call:async()=>removed.push(url),close:()=>closed.push(url)};},loaderCleanupExpression:()=>'',evaluate:async()=>true,BINDING:'binding'};
 vm.runInNewContext(between('async function removeAll(', 'async function refreshTarget('),ctx);
 await ctx.removeAll();assert.deepEqual(removed,['live']);assert.deepEqual(closed,['live']);assert.equal(ctx.sessions.size,0);assert.equal(ctx.targetFailures.size,0);
});

function sharedRig(){
 let disk='night-stage';const writes=[];const ctx={};vm.runInNewContext(queue,ctx);
 const window=()=>{
  const state={wallpaperId:'night-stage'},errors=[];
  const c=new SelectionCoordinator({initialId:'night-stage',transaction:ctx.selectionTransaction,readSaved:async()=>disk,getState:async()=>state,prepare:async r=>({ok:true,...r}),commit:async r=>{state.wallpaperId=r.id;return{ok:true,...r};},reject:async()=>{},save:async id=>{disk=id;writes.push(id);},onError:e=>errors.push(e.message)});
  return{c,state,errors,click(id,requestId){Object.assign(state,{requestedWallpaperId:id,selectionRequestId:requestId});return c.request({id,requestId});}};
 };
 return{window,writes,transaction:ctx.selectionTransaction,get disk(){return disk;}};
}
test('failed switch in one window preserves another window last committed preference',async()=>{
 const r=sharedRig(),a=r.window(),b=r.window();
 b.click('backstage','b1');await b.c.idle();assert.equal(r.disk,'backstage');
 a.c.commit=async()=>({ok:false});a.click('floating-bocchi','a1');await a.c.idle();
 assert.equal(r.disk,'backstage');assert.equal(a.state.wallpaperId,'night-stage');assert.equal(b.state.wallpaperId,'backstage');
 assert.deepEqual(r.writes,['backstage','floating-bocchi','backstage']);
});
test('new installs cannot read provisional selection; queued closed windows do not write',async()=>{
 const r=sharedRig(),a=r.window(),b=r.window(),entered=deferred(),gate=deferred();
 a.c.commit=async()=>{entered.resolve();await gate.promise;return{ok:false};};
 a.click('backstage','a1');await entered.promise;assert.equal(r.disk,'backstage');
 const newInstall=r.transaction(async()=>r.disk);
 assert.equal(b.click('headphone-evening','b1'),true);assert(b.c.worker);const retired=b.c.retire();
 gate.resolve();assert.equal(await newInstall,'night-stage');await Promise.all([a.c.idle(),retired]);
 assert.deepEqual(r.writes,['backstage','night-stage']);assert.equal(r.disk,'night-stage');
});
test('a rejected shared transaction cannot block a later selection or installation',async()=>{
 const r=sharedRig();await assert.rejects(r.transaction(()=>{throw Error('injected');}),/injected/);
 const a=r.window();a.click('backstage','a1');await a.c.idle();assert.equal(await r.transaction(async()=>r.disk),'backstage');
});
