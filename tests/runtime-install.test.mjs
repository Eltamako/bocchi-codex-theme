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
 const context={finishCoordinator:async()=>{},mainContext:async()=>7,readSelection:async()=>({id:'night-stage'}),selectionPath:'selection',selectionWarning:null,randomBytes:()=>({toString:()=> 'a'.repeat(32)}),BINDING:'binding',path:{dirname:()=>'.'},statePath:'state',readLanguagePreference:async()=>({}),state:{generation:'loader'},Date,evaluate:async(c,expression)=>{expressions.push(expression);if(expressions.length===1)throw Error('Command timeout: Runtime.evaluate');return vm.runInNewContext(expression,renderer);}};
 vm.runInNewContext(helpers+install,context);
 await assert.rejects(context.install({c:{call:async()=>{}},epoch:0,disposed:false},{source:'',data:{}}),/Command timeout/);
 assert.equal(cancelled,true);assert.equal(expressions.length,2);
});
test('retired session cleanup does not remove a successor API or binding',async()=>{
 const calls=[];let removed=false;
 const renderer={window:{__BOCCHI_INSTALL__:{generation:'successor',cancel:()=>{removed=true;}},__BOCCHI_THEME__:{remove:()=>{removed=true;}}}};
 const context={state:{generation:'loader'},invalidate:()=>{},finishCoordinator:async()=>{},evaluate:async(c,expression)=>vm.runInNewContext(expression,renderer)};
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
