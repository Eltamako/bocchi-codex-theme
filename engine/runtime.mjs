import fs from 'node:fs/promises';
import path from 'node:path';
import {readLanguagePreference} from './language.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {WallpaperCatalog,SelectionCoordinator,atomicSelection,readSelection,authorizedSelectionEvent,BINDING,validatePng} from './wallpaper-store.mjs';
const args=process.argv.slice(2),action=args[0],statePath=args[1];
const root=path.resolve(import.meta.dirname,'..');
async function readLauncherState(file){
 // Windows replaces the initial identity and subsequent control files.
 // The replacement gap can report missing or delete-pending (EPERM) on Windows.
 // Retry for at most one second; malformed state and other I/O errors still fail immediately.
 for(let attempt=0;;attempt++){
  try{return JSON.parse(await fs.readFile(file,'utf8'));}
  catch(error){if(!['ENOENT','EPERM'].includes(error?.code)||attempt>=40)throw error;await new Promise(resolve=>setTimeout(resolve,25));}
 }
}
const state=await readLauncherState(statePath);
if(state.schema!=='bocchi-runtime/1'||path.resolve(statePath).toLowerCase()!==path.join(root,'.local','runtime-state.json').toLowerCase())throw Error('Invalid runtime state ownership');
const installation=JSON.parse(await fs.readFile(path.join(root,'installation.json'),'utf8'));
if(installation.schema!=='bocchi-local-install/1'||typeof installation.stateRoot!=='string'||!path.isAbsolute(installation.stateRoot)||path.resolve(installation.stateRoot).toLowerCase()!==path.join(root,'.local').toLowerCase()||(await fs.lstat(path.join(root,'.local'))).isSymbolicLink())throw Error('Invalid installation ownership');
const controlPath=path.join(path.dirname(statePath),'control.json');
const statusPath=path.join(path.dirname(statePath),'status.json');
const selectionPath=path.join(path.dirname(statePath),'wallpaper-selection.json');
const catalogReader=new WallpaperCatalog(path.join(root,'theme'));
let running=true,requestId=null,assetCache=null,selectionWarning=null,lastSwitchError=null;
const runtimeHash=createHash('sha256').update(await fs.readFile(new URL(import.meta.url))).digest('hex').toUpperCase();
const wallpaperStoreHash=createHash('sha256').update(await fs.readFile(new URL('./wallpaper-store.mjs',import.meta.url))).digest('hex').toUpperCase();
process.on('SIGTERM',()=>{running=false;for(const s of sessions.values())invalidate(s);});
function wsUrl(value,kind,id){const u=new URL(value);if(u.protocol!=='ws:'||u.hostname!=='127.0.0.1'||Number(u.port)!==state.port||u.username||u.password||u.search||u.hash||u.pathname!=='/devtools/'+kind+'/'+id)throw Error('Unexpected endpoint');return value;}
function transientError(code,message){return Object.assign(Error(message),{code});}
function isTransientError(error){return new Set(['ENDPOINT_TIMEOUT','ENDPOINT_UNAVAILABLE','CONNECTION_CLOSED','CONNECTION_FAILED','CONNECTION_TIMEOUT','COMMAND_TIMEOUT','CONTEXT_CHANGED','RENDERER_NOT_READY','CONTEXT_NOT_READY','LOADER_PAUSED']).has(error?.code);}
async function json(url){
 const signal=AbortSignal.timeout(3000);
 try{
  const r=await fetch(url,{redirect:'error',signal});
  if(!r.ok)throw transientError('ENDPOINT_UNAVAILABLE','Endpoint unavailable');
  const raw=await r.text();if(raw.length>256000)throw Error('Endpoint response too large');return JSON.parse(raw);
 }catch(error){
  if(signal.aborted&&signal.reason?.name==='TimeoutError')throw transientError('ENDPOINT_TIMEOUT','Endpoint timeout');
  if(error?.name==='TypeError'&&['ECONNREFUSED','ECONNRESET','EPIPE','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(error.cause?.code))throw transientError('ENDPOINT_UNAVAILABLE','Endpoint unavailable');
  throw error;
 }
}
function isMainPageUrl(value){
 if(value==='app://-/index.html')return true;
 if(typeof value!=='string'||value.length>512)return false;
 try{const u=new URL(value),keys=[...u.searchParams.keys()];return u.protocol==='app:'&&u.hostname==='-'&&u.pathname==='/index.html'&&!u.username&&!u.password&&!u.port&&!u.hash&&keys.length===1&&keys[0]==='initialRoute'&&/^\/local\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u.searchParams.get('initialRoute'));}catch{return false;}
}
async function getTargets(){const version=await json('http://127.0.0.1:'+state.port+'/json/version');wsUrl(version.webSocketDebuggerUrl,'browser',state.browserId);const list=await json('http://127.0.0.1:'+state.port+'/json/list');wsUrl((await json('http://127.0.0.1:'+state.port+'/json/version')).webSocketDebuggerUrl,'browser',state.browserId);if(!Array.isArray(list))throw Error('Invalid target list');const ids=new Set();return list.filter(x=>x?.type==='page'&&isMainPageUrl(x.url)).map(x=>{if(typeof x.id!=='string'||!/^[A-Za-z0-9._-]{1,200}$/.test(x.id)||ids.has(x.id))throw Error('Invalid target identity');ids.add(x.id);return{...x,webSocketDebuggerUrl:wsUrl(x.webSocketDebuggerUrl,'page',x.id)};});}
function cdpFailure(error){
 const transient=['Cannot find context with specified id','Cannot find default execution context','Execution context was destroyed.','Inspected target navigated or closed'];
 return transient.includes(error?.message)?transientError('CONTEXT_CHANGED','Main context changed'):Error('CDP command rejected');
}
async function connect(url){
 const ws=new WebSocket(url);let seq=0;const pending=new Map(),listeners=new Set();
 const rejectPending=message=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(transientError(message==='Connection failed'?'CONNECTION_FAILED':'CONNECTION_CLOSED',message));}pending.clear();};
 ws.addEventListener('close',()=>{rejectPending('Connection closed');for(const fn of listeners)fn({method:'connectionClosed'});});
 ws.addEventListener('error',()=>rejectPending('Connection failed'));
 ws.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(cdpFailure(m.error)):p.resolve(m.result);}else if(m.method)for(const fn of listeners)fn(m);});
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>{ws.close();reject(transientError('CONNECTION_TIMEOUT','Connection timeout'));},4000);ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);ws.close();reject(transientError('CONNECTION_FAILED','Connection failed'));},{once:true});});
 return{on(fn){listeners.add(fn);return()=>listeners.delete(fn);},call(method,params={}){return new Promise((resolve,reject)=>{if(ws.readyState!==WebSocket.OPEN){reject(transientError('CONNECTION_CLOSED','Connection closed'));return;}const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(transientError('COMMAND_TIMEOUT','Command timeout: '+method));},10000);pending.set(id,{resolve,reject,timer});try{ws.send(JSON.stringify({id,method,params}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});},close(){rejectPending('Closed');ws.close();}};
}
async function evaluate(c,expression,contextId){const r=await c.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,...(contextId===undefined?{}:{contextId})});if(r.exceptionDetails)throw Error('Renderer rejected payload');return r.result?.value;}
async function atomicJson(file,value){const tmp=file+'.tmp-'+process.pid;try{await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,file);}finally{await fs.unlink(tmp).catch(()=>{});}}
async function status(value){return atomicJson(statusPath,{...value,generation:state.generation,browserId:state.browserId,daemonPid:process.pid,requestId,runtimeHash,wallpaperStoreHash,selectionWarning,lastSwitchError});}
async function payload(){
 const dir=path.join(root,'theme'),names=['adapter.json','theme.css','renderer.js','messages.json','sticker.png','band-sticker.png'];
 const metadata=await Promise.all(names.map(async name=>{const s=await fs.stat(path.join(dir,name),{bigint:true});return name+':'+[s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');}));
 const loaded=await catalogReader.load();const signature=metadata.join('|');
 if(assetCache?.signature===signature&&assetCache.catalog===loaded.catalog)return{...assetCache,warning:loaded.warning};
 const adapter=JSON.parse(await fs.readFile(path.join(dir,'adapter.json'),'utf8'));if(adapter.appVersion!==state.appVersion||adapter.packageVersion!==state.packageVersion)throw Error('Adapter version mismatch');
 const [css,source,sticker,bandSticker]=await Promise.all([fs.readFile(path.join(dir,'theme.css'),'utf8'),fs.readFile(path.join(dir,'renderer.js'),'utf8'),fs.readFile(path.join(dir,'sticker.png')),fs.readFile(path.join(dir,'band-sticker.png'))]);
 if(css.length>128000||source.length>128000)throw Error('Unexpected theme asset');validatePng(sticker);validatePng(bandSticker);
 const messages=JSON.parse(await fs.readFile(path.join(dir,'messages.json'),'utf8'));
 const data={messages,adapter,appVersion:state.appVersion,css,wallpaperCatalog:loaded.catalog,sticker:'data:image/png;base64,'+sticker.toString('base64'),bandSticker:'data:image/png;base64,'+bandSticker.toString('base64')};
 const hash=createHash('sha256').update(source+JSON.stringify(data)).digest('hex');assetCache={signature,catalog:loaded.catalog,data,source,hash};return{...assetCache,warning:loaded.warning};
}
const sessions=new Map();
// Persist/commit/rollback is one transaction across documents. New installs must
// read through the same queue so they cannot inherit an uncommitted selection.
let selectionTail=Promise.resolve();
function selectionTransaction(task){const pending=selectionTail.then(task);selectionTail=pending.catch(()=>{});return pending;}
const targetFailures=new Map();
function startHeartbeat(s){
 clearInterval(s.heartbeatTimer);
 s.heartbeatTimer=setInterval(async()=>{
  if(s.disposed||s.contextId===null||s.heartbeatPending)return;
  s.heartbeatPending=true;
  const epoch=s.epoch,contextId=s.contextId;
  try{const control=JSON.parse(await fs.readFile(controlPath,'utf8'));if(!control.paused&&!control.stop&&!s.disposed&&s.epoch===epoch&&s.contextId===contextId)await evaluate(s.c,'window.__BOCCHI_THEME__?.heartbeat('+(Date.now()+12000)+')',contextId);}catch{}finally{s.heartbeatPending=false;}
 },3000);
}
function cancelExpression(generation){return `(()=>{const i=window.__BOCCHI_INSTALL__;if(i&&i.generation===${JSON.stringify(generation)}){i.cancel('loader-cancelled');return true;}return false;})()`;}
function loaderCleanupExpression(){return `(()=>{const i=window.__BOCCHI_INSTALL__;if(i&&i.loaderGeneration===${JSON.stringify(state.generation)}){i.cancel('loader-stopped');return true;}return false;})()`;}
function invalidate(s){s.epoch++;s.contextId=null;s.token=null;if(s.coordinator){s.coordinator.active=false;s.coordinator.latest=null;}}
async function finishCoordinator(s){if(s.coordinator){await s.coordinator.retire();s.coordinator=null;}}
async function mainContext(s){
 const tree=await s.c.call('Page.getFrameTree');s.frameId=tree.frameTree.frame.id;
 if(!isMainPageUrl(tree.frameTree.frame.url))throw Error('Main frame URL mismatch');
 const candidates=[...s.contexts.values()].filter(x=>x.auxData?.isDefault===true&&x.auxData.frameId===s.frameId);
 if(candidates.length===0)throw transientError('CONTEXT_NOT_READY','Main execution context not ready');if(candidates.length!==1)throw Error('Exactly one default main execution context required');
 const id=candidates[0].id;if(!await evaluate(s.c,'window===window.top && location.href==='+JSON.stringify(tree.frameTree.frame.url),id))throw Error('Unverified main execution context');return id;
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
async function assertControlActive(){const control=await readLauncherState(controlPath);if(control.paused||control.stop||!running)throw transientError('LOADER_PAUSED','Loader paused during installation');}
async function install(s,p){
 await finishCoordinator(s);const contextId=await mainContext(s),epoch=s.epoch;
 const selection=await selectionTransaction(()=>readSelection(selectionPath));selectionWarning=selection.warning;const token=randomBytes(16).toString('hex');
 await assertControlActive();
 await s.c.call('Runtime.removeBinding',{name:BINDING}).catch(()=>{});await s.c.call('Runtime.addBinding',{name:BINDING,executionContextId:contextId});
 if(s.epoch!==epoch||s.disposed)throw transientError('CONTEXT_CHANGED','Main context changed before installation');
 s.installGeneration=token;
 const expression=p.source+'\ninstallBocchiTheme('+JSON.stringify({...p.data,...await readLanguagePreference(path.dirname(statePath)),initialWallpaperId:selection.id,selectionBridge:{binding:BINDING,token},installGeneration:token,loaderGeneration:state.generation,leaseUntil:Date.now()+12000})+')';
 let result;try{await assertControlActive();result=await evaluate(s.c,expression,contextId);await assertControlActive();if(s.epoch!==epoch||s.disposed)throw transientError('CONTEXT_CHANGED','Main context changed during installation');}
 catch(error){await evaluate(s.c,cancelExpression(token),contextId).catch(()=>{});throw error;}
 s.contextId=contextId;s.token=token;
 const evalCurrent=expression=>{if(s.disposed||s.epoch!==epoch||s.contextId!==contextId)throw Error('Stale wallpaper session');return evaluate(s.c,expression,contextId);};
 s.coordinator=new SelectionCoordinator({initialId:selection.id,
  getState:()=>evalCurrent('window.__BOCCHI_THEME__?.state'),
  prepare:r=>evalCurrent(`window.__BOCCHI_THEME__?.prepareWallpaper(${JSON.stringify(r.id)},${JSON.stringify(r.requestId)})`),
  commit:r=>evalCurrent(`window.__BOCCHI_THEME__?.commitWallpaper(${JSON.stringify(r.id)},${JSON.stringify(r.requestId)})`),
  reject:(r,message)=>evalCurrent(`window.__BOCCHI_THEME__?.rejectWallpaper(${JSON.stringify(r.requestId)},${JSON.stringify(message)})`),
  save:id=>atomicSelection(selectionPath,id),
  transaction:selectionTransaction,
  readSaved:async()=>(await readSelection(selectionPath)).id,
  validate:async()=>{const list=await getTargets();return !s.disposed&&s.epoch===epoch&&list.some(t=>t.id===s.targetId);},
  onError:()=>{lastSwitchError='wallpaper-selection-failed';}
 });startHeartbeat(s);return result;
}
async function cleanSession(s){
 s.disposed=true;clearInterval(s.heartbeatTimer);invalidate(s);await finishCoordinator(s);
 try{if(s.earlyId)await s.c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:s.earlyId});if(await evaluate(s.c,cancelExpression(s.installGeneration)))await s.c.call('Runtime.removeBinding',{name:BINDING});}
 catch{const target=(await getTargets()).find(t=>t.id===s.targetId);if(target){const fresh=await connect(target.webSocketDebuggerUrl);try{if(s.earlyId)await fresh.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:s.earlyId});if(await evaluate(fresh,cancelExpression(s.installGeneration)))await fresh.call('Runtime.removeBinding',{name:BINDING});}finally{fresh.close();}}}
 finally{s.off();s.c.close();}
}
async function removeAll(){await Promise.all([...sessions.values()].map(s=>cleanSession(s).catch(()=>{})));sessions.clear();targetFailures.clear();const list=await getTargets();await Promise.all(list.map(async target=>{let c;try{c=await connect(target.webSocketDebuggerUrl);if(await evaluate(c,loaderCleanupExpression()))await c.call('Runtime.removeBinding',{name:BINDING});}catch{/* A closing window must not prevent cleanup of its siblings. */}finally{c?.close();}}));}
async function refreshTarget(target,p,locale){
 const prior=targetFailures.get(target.id);
 if(prior&&(prior.terminal||Date.now()<prior.retryAt))return{targetId:target.id,installed:false,ready:false,reason:prior.reason};
 let s=sessions.get(target.id);
 try{
  let result;
  if(!s){s=await makeSession(target);sessions.set(target.id,s);result=await install(s,p);}
  else{
   const contextId=await mainContext(s);
   if(s.contextId!==contextId){invalidate(s);result=await install(s,p);}
   else{
    if(s.coordinator&&!s.coordinator.active)throw Error('Wallpaper selection persistence blocked');
    const present=await evaluate(s.c,'!!window.__BOCCHI_THEME__',contextId);
    result=present?await evaluate(s.c,'(window.__BOCCHI_THEME__.setLanguage('+JSON.stringify(locale.language)+','+JSON.stringify(locale.systemLanguage)+'),window.__BOCCHI_THEME__.heartbeat('+(Date.now()+12000)+'),window.__BOCCHI_THEME__.refresh(),window.__BOCCHI_THEME__?.state ?? {installed:false,reason:"inactive-page"})',contextId):await install(s,p);
   }
  }
  targetFailures.delete(target.id);return{...result,targetId:target.id};
 }catch(error){
  if(s){await cleanSession(s).catch(()=>{});sessions.delete(target.id);}
  const count=(prior?.count??0)+1,reason=isTransientError(error)?'renderer-not-ready':'renderer-validation-failed';
  targetFailures.set(target.id,{count,reason,terminal:!isTransientError(error),retryAt:Date.now()+Math.min(15000,1500*2**Math.min(count-1,4))});
  return{targetId:target.id,installed:false,ready:false,reason};
 }
}
if(action==='restore'){
 await removeAll();const c=await connect(wsUrl('ws://127.0.0.1:'+state.port+'/devtools/browser/'+state.browserId,'browser',state.browserId));try{await c.call('Browser.close');}catch(e){if(!/Closed|timeout/i.test(e.message))throw e;}finally{c.close();}console.log('Managed window close requested; original appearance retained');
}else if(action==='watch'||action==='once'){
 let lastHash='',failureCount=0,lastPaused=null,retryDeadline=null,retryAt=0;
 const recoveryWindowMs=60000,controlPollMs=250;
 while(running){
  try{
   const control=await readLauncherState(controlPath),nextRequestId=typeof control.requestId==='string'?control.requestId:null;
   if(nextRequestId!==requestId)targetFailures.clear();requestId=nextRequestId;
   if(control.stop){try{await removeAll();}catch{}await status({state:'stopped',at:new Date().toISOString()});break;}
   if(control.paused){if(lastPaused!==true)await removeAll();lastPaused=true;await status({state:'paused',at:new Date().toISOString()});}
   else{
    lastPaused=false;
    if(retryDeadline!==null&&Date.now()>=retryDeadline){await status({state:'stopped',reason:'recovery-window-expired',failureCount,at:new Date().toISOString()});break;}
    if(Date.now()<retryAt){await new Promise(r=>setTimeout(r,Math.min(controlPollMs,retryAt-Date.now())));continue;}
    const p=await payload(),locale=await readLanguagePreference(path.dirname(statePath)),list=await getTargets();if(list.length===0)throw transientError('RENDERER_NOT_READY','Main renderer not ready');
    for(const[id,s]of sessions)if(!list.some(t=>t.id===id)||lastHash!==p.hash){try{await cleanSession(s);}catch{}sessions.delete(id);}
    for(const id of targetFailures.keys())if(!list.some(t=>t.id===id)||lastHash!==p.hash)targetFailures.delete(id);
    const result=await Promise.all(list.map(target=>refreshTarget(target,p,locale)));
    lastHash=p.hash;await status({state:result.length&&result.every(x=>x?.installed===true&&x?.ready===true)?'running':'suspended',at:new Date().toISOString(),appVersion:state.appVersion,themeHash:p.hash,catalogWarning:p.warning,wallpaperId:result[0]?.wallpaperId??null,renderers:result});
   }
   failureCount=0;retryDeadline=null;retryAt=0;
  }catch(e){
   failureCount++;
   const transient=isTransientError(e);
   if(transient)retryDeadline??=Date.now()+recoveryWindowMs;
   try{await removeAll();}catch{}
   const expired=transient&&Date.now()>=retryDeadline;
   const retry=transient&&!expired&&action==='watch'&&running;
   const retryInMs=retry?Math.min(15000,1500*2**Math.min(failureCount-1,4),retryDeadline-Date.now()):null;
   retryAt=retry?Date.now()+retryInMs:0;
   await status({state:retry?'retrying':expired?'stopped':'blocked',reason:expired?'recovery-window-expired':transient?'theme-connection-unavailable':'loader-validation-failed',failureCount,retryInMs,retryDeadline:retry?new Date(retryDeadline).toISOString():null,at:new Date().toISOString()});
   if(!retry)break;
  }
  if(action==='once')break;await new Promise(r=>setTimeout(r,failureCount?controlPollMs:1500));
 }
 if(action==='watch'){try{await removeAll();}catch{}}
 if(!running)await status({state:'stopped',reason:'loader-stopped',at:new Date().toISOString()});
 for(const s of sessions.values()){s.disposed=true;clearInterval(s.heartbeatTimer);invalidate(s);await finishCoordinator(s);s.off();s.c.close();}
}else throw Error('Unknown runtime action');
