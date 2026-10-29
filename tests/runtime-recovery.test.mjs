import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import http from 'node:http';
const source=await fs.readFile(new URL('../engine/runtime.mjs',import.meta.url),'utf8');
const start=source.indexOf("let lastHash=''"),end=source.indexOf('for(const s of sessions.values()){s.disposed=true;',start);
const policy=source.slice(source.indexOf('function transientError('),source.indexOf('async function getTargets('));
async function run(options={}){
 const writes=[],sleeps=[];let probes=0,clock=0;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const context={running:true,action:'watch',requestId:null,controlPath:'control',statePath:'state',path:{dirname:()=>'.'},fs:{readFile:async()=>JSON.stringify({paused:false,stop:writes.some(s=>s.state==='running'),requestId:'q',...options.control?.({clock,probes,writes})})},payload:async()=>({hash:'h'}),readLanguagePreference:async()=>({}),getTargets:async()=>{probes++;if(options.error)throw options.error;if(options.forever||options.failAfterRecovery&&probes>4)return [];return probes<=3?[]:[{id:'one'}];},sessions:new Map(),removeAll:async()=>{},makeSession:async()=>({}),install:async()=>({installed:true,ready:true}),status:async s=>writes.push(s),setTimeout:(fn,ms)=>{sleeps.push(ms);clock+=ms;queueMicrotask(fn);},Date:Clock,state:{appVersion:'test'}};
 vm.runInNewContext(policy,context);
 vm.runInNewContext(source.slice(source.indexOf('async function readLauncherState('),source.indexOf('const state=await readLauncherState')),context);
 context.targetFailures=new Map();context.refreshTarget=async()=>({installed:true,ready:true});
 await vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})()',context);
 return {writes,sleeps,probes,clock};
}
test('runtime reaches recovered fourth page probe after three transient absences',async()=>{
 const r=await run();assert.equal(r.probes,4);assert(r.writes.some(s=>s.state==='running'));assert.equal(r.writes.at(-1).state,'stopped');assert.deepEqual(r.writes.filter(s=>s.state==='retrying').map(s=>s.retryInMs),[1500,3000,6000]);
});
test('runtime identity errors fail closed with a terminal, sanitized status',async()=>{
 const r=await run({error:Error('Unexpected endpoint secret /private/path')});assert.equal(r.probes,1);assert.equal(r.writes.at(-1).state,'blocked');assert.equal(r.writes.at(-1).reason,'loader-validation-failed');assert(!JSON.stringify(r.writes).includes('private'));
});
test('actual fetch and AbortSignal timeout is classified as retryable; invalid JSON is not',async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/invalid'){res.end('{bad');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const context={fetch,AbortSignal};vm.runInNewContext(policy,context);
 try{
  const begin=Date.now();let failure;
  try{await context.json('http://127.0.0.1:'+server.address().port+'/timeout');}catch(e){failure=e;}
  assert(Date.now()-begin>=2700,JSON.stringify({name:failure?.name,code:failure?.code,cause:failure?.cause?.code,message:failure?.message}));assert.equal(failure.code,'ENDPOINT_TIMEOUT');assert(context.isTransientError(failure));
  const retried=await run({error:failure,control:({probes})=>({stop:probes>=2})});assert.equal(retried.probes,2);assert.equal(retried.writes[0].state,'retrying');
  await assert.rejects(context.json('http://127.0.0.1:'+server.address().port+'/invalid'),e=>!context.isTransientError(e));
  assert(!context.isTransientError({name:'TimeoutError',message:'untrusted'}));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('continuous transient failures stop at the recovery deadline instead of polling forever',async()=>{
 const r=await run({forever:true,control:()=>({stop:false})});assert.equal(r.clock,60000);assert.equal(r.writes.at(-1).state,'stopped');assert.equal(r.writes.at(-1).reason,'recovery-window-expired');assert(r.probes<10);assert(r.sleeps.every(ms=>ms<=250));
});
test('a successful recovery resets the next continuous failure window',async()=>{
 const r=await run({failAfterRecovery:true,control:()=>({stop:false})});const success=r.writes.findIndex(s=>s.state==='running');assert(success>=0);const next=r.writes.slice(success+1).find(s=>s.state==='retrying');assert.equal(Date.parse(next.retryDeadline)-Date.parse(next.at),60000);assert.equal(r.clock,Date.parse(next.retryDeadline));
});
test('Stop and Pause are observed within a 250ms backoff polling slice',async()=>{
 const stopped=await run({forever:true,control:({clock})=>({stop:clock>=500})});assert.equal(stopped.clock,500);assert.equal(stopped.probes,1);assert.equal(stopped.writes.at(-1).state,'stopped');
 const paused=await run({forever:true,control:({clock,writes})=>({paused:clock>=500,stop:writes.some(s=>s.state==='paused')})});const first=paused.writes.find(s=>s.state==='paused');assert.equal(Date.parse(first.at),500);assert.equal(paused.probes,1);
});
