import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {WallpaperCatalog,SelectionCoordinator,atomicSelection,readSelection,authorizedSelectionEvent,BINDING,validatePng} from './wallpaper-store.mjs';
const args=process.argv.slice(2),action=args[0],statePath=args[1];
const root=path.resolve(import.meta.dirname,'..');
const state=JSON.parse(await fs.readFile(statePath,'utf8'));
const controlPath=path.join(path.dirname(statePath),'control.json');
const statusPath=path.join(path.dirname(statePath),'status.json');
const selectionPath=path.join(path.dirname(statePath),'wallpaper-selection.json');
const catalogReader=new WallpaperCatalog(path.join(root,'theme'));
let running=true,requestId=null,assetCache=null,selectionWarning=null,lastSwitchError=null;
const runtimeHash=createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex').toUpperCase();
const wallpaperStoreHash=createHash('sha256').update(await fs.readFile(new URL('./wallpaper-store.mjs',import.meta.url))).digest('hex').toUpperCase();
process.on('SIGTERM',()=>{running=false;for(const s of sessions.values())invalidate(s);});
function wsUrl(value,kind,id){const u=new URL(value);if(u.protocol!=='ws:'||u.hostname!=='127.0.0.1'||Number(u.port)!==state.port||u.username||u.password||u.search||u.hash||u.pathname!=='/devtools/'+kind+'/'+id)throw Error('Unexpected endpoint');return value;}
async function json(url){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(3000)});if(!r.ok)throw Error('Endpoint unavailable');const raw=await r.text();if(raw.length>256000)throw Error('Endpoint response too large');return JSON.parse(raw);}
async function getTargets(){const version=await json('http://127.0.0.1:'+state.port+'/json/version');wsUrl(version.webSocketDebuggerUrl,'browser',state.browserId);const list=await json('http://127.0.0.1:'+state.port+'/json/list');return list.filter(x=>x.type==='page'&&x.url==='app://-/index.html').map(x=>({...x,webSocketDebuggerUrl:wsUrl(x.webSocketDebuggerUrl,'page',x.id)}));}
async function connect(url){
 const ws=new WebSocket(url);let seq=0;const pending=new Map(),listeners=new Set();
 const rejectPending=message=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(message));}pending.clear();};
 ws.addEventListener('close',()=>{rejectPending('Connection closed');for(const fn of listeners)fn({method:'connectionClosed'});});
 ws.addEventListener('error',()=>rejectPending('Connection failed'));
 ws.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method)for(const fn of listeners)fn(m);});
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>{ws.close();reject(Error('Connection timeout'));},4000);ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);ws.close();reject(Error('Connection failed'));},{once:true});});
 return{on(fn){listeners.add(fn);return()=>listeners.delete(fn);},call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Command timeout: '+method));},10000);pending.set(id,{resolve,reject,timer});try{ws.send(JSON.stringify({id,method,params}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});},close(){rejectPending('Closed');ws.close();}};
}
async function evaluate(c,expression,contextId){const r=await c.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,...(contextId===undefined?{}:{contextId})});if(r.exceptionDetails)throw Error('Renderer rejected payload');return r.result?.value;}
async function atomicJson(file,value){const tmp=file+'.tmp-'+process.pid;try{await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,file);}finally{await fs.unlink(tmp).catch(()=>{});}}
async function status(value){return atomicJson(statusPath,{...value,generation:state.generation,browserId:state.browserId,daemonPid:process.pid,requestId,runtimeHash,wallpaperStoreHash,selectionWarning,lastSwitchError});}
async function payload(){
 const dir=path.join(root,'theme'),names=['adapter.json','theme.css','renderer.js','sticker.png','band-sticker.png'];
 const metadata=await Promise.all(names.map(async name=>{const s=await fs.stat(path.join(dir,name),{bigint:true});return name+':'+[s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');}));
 const loaded=await catalogReader.load();const signature=metadata.join('|');
 if(assetCache?.signature===signature&&assetCache.catalog===loaded.catalog)return{...assetCache,warning:loaded.warning};
 const adapter=JSON.parse(await fs.readFile(path.join(dir,'adapter.json'),'utf8'));if(adapter.appVersion!==state.appVersion||adapter.packageVersion!==state.packageVersion)throw Error('Adapter version mismatch');
 const [css,source,sticker,bandSticker]=await Promise.all([fs.readFile(path.join(dir,'theme.css'),'utf8'),fs.readFile(path.join(dir,'renderer.js'),'utf8'),fs.readFile(path.join(dir,'sticker.png')),fs.readFile(path.join(dir,'band-sticker.png'))]);
 if(css.length>128000||source.length>128000)throw Error('Unexpected theme asset');validatePng(sticker);validatePng(bandSticker);
 const data={adapter,appVersion:state.appVersion,css,wallpaperCatalog:loaded.catalog,sticker:'data:image/png;base64,'+sticker.toString('base64'),bandSticker:'data:image/png;base64,'+bandSticker.toString('base64')};
 const hash=createHash('sha256').update(source+JSON.stringify(data)).digest('hex');assetCache={signature,catalog:loaded.catalog,data,source,hash};return{...assetCache,warning:loaded.warning};
}
const sessions=new Map();
function invalidate(s){s.epoch++;s.contextId=null;s.token=null;if(s.coordinator){s.coordinator.active=false;s.coordinator.latest=null;}}
async function finishCoordinator(s){if(s.coordinator){await s.coordinator.retire();s.coordinator=null;}}
async function mainContext(s){
 const tree=await s.c.call('Page.getFrameTree');s.frameId=tree.frameTree.frame.id;
 if(tree.frameTree.frame.url!=='app://-/index.html')throw Error('Main frame URL mismatch');
 const candidates=[...s.contexts.values()].filter(x=>x.auxData?.isDefault===true&&x.auxData.frameId===s.frameId);
 if(candidates.length!==1)throw Error('Exactly one default main execution context required');
 const id=candidates[0].id;if(!await evaluate(s.c,'window===window.top && location.href==="app://-/index.html"',id))throw Error('Unverified main execution context');return id;
}
async function makeSession(target){
 const c=await connect(target.webSocketDebuggerUrl),s={c,targetId:target.id,contexts:new Map(),epoch:0,contextId:null,token:null,coordinator:null,disposed:false};
 s.off=c.on(m=>{
  if(m.method==='Runtime.executionContextCreated'){const ctx=m.params.context;s.contexts.set(ctx.id,ctx);}
  if(m.method==='Runtime.executionContextDestroyed'){s.contexts.delete(m.params.executionContextId);if(m.params.executionContextId===s.contextId)invalidate(s);}
  if(m.method==='Runtime.executionContextsCleared'||m.method==='connectionClosed'){s.contexts.clear();invalidate(s);}
  if(m.method==='Page.frameNavigated'&&!m.params.frame.parentId){invalidate(s);}
  if(m.method==='Runtime.bindingCalled'){const r=authorizedSelectionEvent(s,m);if(r)s.coordinator?.request(r);}
 });
 try{await c.call('Page.enable');await c.call('Runtime.enable');return s;}catch(e){s.off();c.close();throw e;}
}
async function install(s,p){
 await finishCoordinator(s);const contextId=await mainContext(s),epoch=s.epoch;
 const selection=await readSelection(selectionPath);selectionWarning=selection.warning;const token=randomBytes(16).toString('hex');
 await s.c.call('Runtime.removeBinding',{name:BINDING}).catch(()=>{});await s.c.call('Runtime.addBinding',{name:BINDING,executionContextId:contextId});
 if(s.epoch!==epoch||s.disposed)throw Error('Main context changed before installation');
 const expression=p.source+'\ninstallBocchiTheme('+JSON.stringify({...p.data,initialWallpaperId:selection.id,selectionBridge:{binding:BINDING,token},leaseUntil:Date.now()+12000})+')';
 const result=await evaluate(s.c,expression,contextId);if(s.epoch!==epoch||s.disposed)throw Error('Main context changed during installation');
 s.contextId=contextId;s.token=token;
 const evalCurrent=expression=>{if(s.disposed||s.epoch!==epoch||s.contextId!==contextId)throw Error('Stale wallpaper session');return evaluate(s.c,expression,contextId);};
 s.coordinator=new SelectionCoordinator({initialId:selection.id,
  getState:()=>evalCurrent('window.__BOCCHI_THEME__?.state'),
  prepare:r=>evalCurrent(`window.__BOCCHI_THEME__?.prepareWallpaper(${JSON.stringify(r.id)},${JSON.stringify(r.requestId)})`),
  commit:r=>evalCurrent(`window.__BOCCHI_THEME__?.commitWallpaper(${JSON.stringify(r.id)},${JSON.stringify(r.requestId)})`),
  reject:(r,message)=>evalCurrent(`window.__BOCCHI_THEME__?.rejectWallpaper(${JSON.stringify(r.requestId)},${JSON.stringify(message)})`),
  save:id=>atomicSelection(selectionPath,id),
  validate:async()=>{const list=await getTargets();return !s.disposed&&s.epoch===epoch&&list.length===1&&list[0].id===s.targetId;},
  onError:e=>{lastSwitchError=e.message;}
 });return result;
}
async function cleanSession(s){
 s.disposed=true;invalidate(s);await finishCoordinator(s);
 try{if(s.earlyId)await s.c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:s.earlyId});await s.c.call('Runtime.removeBinding',{name:BINDING});await evaluate(s.c,'window.__BOCCHI_THEME__?.remove()');}
 catch{const list=await getTargets();if(list.length===1&&list[0].id===s.targetId){const fresh=await connect(list[0].webSocketDebuggerUrl);try{if(s.earlyId)await fresh.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:s.earlyId});await fresh.call('Runtime.removeBinding',{name:BINDING});await evaluate(fresh,'window.__BOCCHI_THEME__?.remove()');}finally{fresh.close();}}}
 finally{s.off();s.c.close();}
}
async function removeAll(){for(const s of sessions.values()){try{await cleanSession(s);}catch{}}sessions.clear();const list=await getTargets();if(list.length>1)throw Error('Exactly one verified main renderer required');for(const target of list){const c=await connect(target.webSocketDebuggerUrl);try{await c.call('Runtime.removeBinding',{name:BINDING});await evaluate(c,'window.__BOCCHI_THEME__?.remove()');}finally{c.close();}}}
if(action==='restore'){
 await removeAll();const c=await connect(wsUrl('ws://127.0.0.1:'+state.port+'/devtools/browser/'+state.browserId,'browser',state.browserId));try{await c.call('Browser.close');}catch(e){if(!/Closed|timeout/i.test(e.message))throw e;}finally{c.close();}console.log('Managed window close requested; original appearance retained');
}else if(action==='watch'||action==='once'){
 let lastHash='',failureCount=0,lastPaused=null;
 while(running){
  try{
   const control=JSON.parse(await fs.readFile(controlPath,'utf8'));requestId=typeof control.requestId==='string'?control.requestId:null;
   if(control.stop){try{await removeAll();}catch{}await status({state:'stopped',at:new Date().toISOString()});break;}
   if(control.paused){if(lastPaused!==true)await removeAll();lastPaused=true;await status({state:'paused',at:new Date().toISOString()});}
   else{
    lastPaused=false;const p=await payload(),list=await getTargets();if(list.length!==1)throw Error('Exactly one verified main renderer required');
    for(const[id,s]of sessions)if(!list.some(t=>t.id===id)||lastHash!==p.hash){try{await cleanSession(s);}catch{}sessions.delete(id);}
    const result=[];
    for(const target of list){let s=sessions.get(target.id);if(!s){s=await makeSession(target);sessions.set(target.id,s);result.push(await install(s,p));}else{const contextId=await mainContext(s);if(s.contextId!==contextId){invalidate(s);result.push(await install(s,p));}else{if(s.coordinator&&!s.coordinator.active)throw Error('Wallpaper selection persistence blocked: '+lastSwitchError);const present=await evaluate(s.c,'!!window.__BOCCHI_THEME__',contextId);result.push(present?await evaluate(s.c,'(window.__BOCCHI_THEME__.heartbeat('+(Date.now()+12000)+'),window.__BOCCHI_THEME__.refresh(),window.__BOCCHI_THEME__?.state ?? {installed:false,reason:"inactive-page"})',contextId):await install(s,p));}}}
    lastHash=p.hash;await status({state:result.length&&result.every(x=>x?.installed===true)?'running':'suspended',at:new Date().toISOString(),appVersion:state.appVersion,themeHash:p.hash,catalogWarning:p.warning,wallpaperId:result[0]?.wallpaperId??null,renderers:result});
   }
   failureCount=0;
  }catch(e){failureCount++;try{await removeAll();}catch{}await status({state:'waiting-or-blocked',reason:e.message,at:new Date().toISOString()});if(failureCount>=3)break;}
  if(action==='once')break;await new Promise(r=>setTimeout(r,1500));
 }
 if(action==='watch'){try{await removeAll();}catch{}}
 for(const s of sessions.values()){s.disposed=true;invalidate(s);await finishCoordinator(s);s.off();s.c.close();}
}else throw Error('Unknown runtime action');
