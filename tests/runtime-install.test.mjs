import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../engine/runtime.mjs',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function cancelExpression'),source.indexOf('function invalidate'));
const install=source.slice(source.indexOf('async function install('),source.indexOf('async function cleanSession('));
const clean=source.slice(source.indexOf('async function cleanSession('),source.indexOf('async function removeAll('));
test('host install timeout cancels the registered generation before returning failure',async()=>{
 const expressions=[];let cancelled=false;
 const renderer={window:{__BOCCHI_INSTALL__:{generation:'a'.repeat(32),cancel:()=>{cancelled=true;}}}};
 const context={selectionTransaction:task=>task(),finishCoordinator:async()=>{},mainContext:async()=>7,readSelection:async()=>({id:'night-stage'}),selectionPath:'selection',selectionWarning:null,randomBytes:()=>({toString:()=> 'a'.repeat(32)}),BINDING:'binding',path:{dirname:()=>'.'},statePath:'state',readLanguagePreference:async()=>({}),state:{generation:'loader'},Date,evaluate:async(c,expression)=>{expressions.push(expression);if(expressions.length===1)throw Error('Command timeout: Runtime.evaluate');return vm.runInNewContext(expression,renderer);}};
 vm.runInNewContext(helpers+install,context);
 context.assertControlActive=async()=>{};
 await assert.rejects(context.install({c:{call:async()=>{}},epoch:0,disposed:false},{source:'',data:{}}),/Command timeout/);
 assert.equal(cancelled,true);assert.equal(expressions.length,2);
});
test('retired session cleanup does not remove a successor API or binding',async()=>{
 const calls=[];let removed=false;
 const renderer={window:{__BOCCHI_INSTALL__:{generation:'successor',cancel:()=>{removed=true;}},__BOCCHI_THEME__:{remove:()=>{removed=true;}}}};
 const context={clearInterval,state:{generation:'loader'},invalidate:()=>{},finishCoordinator:async()=>{},evaluate:async(c,expression)=>vm.runInNewContext(expression,renderer)};
 vm.runInNewContext(helpers+clean,context);
 await context.cleanSession({installGeneration:'old',c:{call:async method=>calls.push(method),close:()=>{}},off:()=>{}});
 assert.equal(removed,false);assert.deepEqual(calls,[]);
});
test('closed CDP connection rejects cancellation immediately instead of adding another command timeout',async()=>{
 let socket;let timers=0;
 class FakeSocket extends EventTarget{
  static OPEN=1;
  constructor(){super();socket=this;this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
  send(){throw Error('A closed transport must never send');}
 }
 const code=source.slice(source.indexOf('function cdpFailure'),source.indexOf('async function evaluate('));
 const context={WebSocket:FakeSocket,transientError:(code,message)=>Object.assign(Error(message),{code}),setTimeout:(fn,ms)=>{timers++;return setTimeout(fn,ms);},clearTimeout};
 vm.runInNewContext(code,context);const connection=await context.connect('ws://isolated');socket.close();
 await assert.rejects(connection.call('Runtime.evaluate'),/Connection closed/);assert.equal(timers,1);
 assert.equal(context.cdpFailure({message:'Cannot find context with specified id'}).message,'Main context changed');
 assert.equal(context.cdpFailure({message:'secret C:/private/path'}).message,'CDP command rejected');
});

test('pause received while installation is awaiting a renderer cancels the late generation',async()=>{
 let controls=0,cancelled=false;
 const renderer={window:{__BOCCHI_INSTALL__:{generation:'a'.repeat(32),cancel:()=>{cancelled=true;}}}};
 const context={selectionTransaction:task=>task(),assertControlActive:async()=>{if(++controls===3)throw Object.assign(Error('Paused'),{code:'LOADER_PAUSED'});},finishCoordinator:async()=>{},mainContext:async()=>7,readSelection:async()=>({id:'night-stage'}),selectionPath:'selection',selectionWarning:null,randomBytes:()=>({toString:()=> 'a'.repeat(32)}),BINDING:'binding',path:{dirname:()=>'.'},statePath:'state',readLanguagePreference:async()=>({}),state:{generation:'loader'},Date,evaluate:async(c,expression)=>expression.startsWith('(()=>')?vm.runInNewContext(expression,renderer):{installed:true,ready:true}};
 vm.runInNewContext(helpers+install,context);
 await assert.rejects(context.install({c:{call:async()=>{}},epoch:0,disposed:false},{source:'',data:{}}),e=>e.code==='LOADER_PAUSED');
 assert(cancelled);assert.equal(controls,3);
});

test('single-run teardown releases its heartbeat and transport without removing a successor',async()=>{
 const timers=new Set([1]),closed=[];
 const session={heartbeatTimer:1,c:{close:()=>closed.push('socket')},off:()=>closed.push('listener')};
 const tail=source.slice(source.lastIndexOf('for(const s of sessions.values()){s.disposed=true;'),source.lastIndexOf('}else throw'));
 const context={sessions:new Map([['only',session]]),clearInterval:id=>timers.delete(id),invalidate:()=>{},finishCoordinator:async()=>{}};
 await vm.runInNewContext('(async()=>{'+tail+'})()',context);
 assert.equal(timers.size,0);assert(session.disposed);assert.deepEqual(closed,['listener','socket']);
});
