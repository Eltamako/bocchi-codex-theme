import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {processIdentity,verifyMacOwner} from '../engine/macos-identity.mjs';
import {inspectMacApp,verifyMacApp} from '../engine/macos-app.mjs';
import {WallpaperCatalog} from '../engine/wallpaper-store.mjs';
const root=await fs.realpath(path.resolve(import.meta.dirname,'..'));
const local=path.join(root,'.local'),statePath=path.join(local,'runtime-state.json'),controlPath=path.join(local,'control.json');
const action=process.argv[2]||'start';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function read(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function write(file,value){const tmp=file+'.tmp-'+randomUUID();try{await fs.writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600});await fs.rename(tmp,file);}finally{await fs.unlink(tmp).catch(()=>{});}}
async function discover(){
 const candidates=process.env.BOCCHI_APP?[process.env.BOCCHI_APP]:['/Applications/ChatGPT.app','/Applications/Codex.app',path.join(os.homedir(),'Applications/ChatGPT.app'),path.join(os.homedir(),'Applications/Codex.app')];
 for(const candidate of candidates){
  try{await fs.access(path.join(candidate,'Contents/Info.plist'));}catch{continue;}
  return inspectMacApp(candidate);
 }
 throw Error('未找到 ChatGPT.app / Codex.app。请从官网下载并放到“应用程序”；自定义路径可设置 BOCCHI_APP。');
}
async function ownLocal(){
 await fs.mkdir(local,{recursive:true,mode:0o700});
 if((await fs.lstat(local)).isSymbolicLink()||await fs.realpath(local)!==local)throw Error('状态目录不能是符号链接');
 const file=path.join(root,'installation.json');
 try{const i=await read(file);if(i.schema!=='bocchi-local-install/1'||i.stateRoot!==local||i.platform!=='darwin')throw Error('此目录含其他安装记录，请重新解压到独立目录');}
 catch(error){if(error.code!=='ENOENT')throw error;await write(file,{schema:'bocchi-local-install/1',platform:'darwin',stateRoot:local});}
}
async function freePort(){
 const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
async function getState(){const s=await read(statePath);if(s.schema!=='bocchi-runtime/1'||s.platform!=='darwin'||s.profile!==path.join(local,'managed-profile'))throw Error('Invalid managed session');await verifyMacApp(s);await verifyMacOwner(s);return s;}
async function endpoint(port){const r=await fetch('http://127.0.0.1:'+port+'/json/version',{redirect:'error',signal:AbortSignal.timeout(1500)});if(!r.ok)throw Error('调试接口尚未就绪');const value=await r.json(),u=new URL(value.webSocketDebuggerUrl);if(u.hostname!=='127.0.0.1'||u.protocol!=='ws:'||Number(u.port)!==port||!/^\/devtools\/browser\/[^/]+$/.test(u.pathname)||u.search||u.hash||u.username||u.password)throw Error('Unexpected debugging endpoint');return u.pathname.split('/').at(-1);}
async function runtimeAlive(s){
 try{const p=await processIdentity(s.daemonPid);return p.created===s.daemonCreated&&p.executable===s.daemonExecutable&&p.command.includes(path.join(root,'engine/runtime.mjs'))&&p.command.includes(statePath);}catch{return false;}
}
async function startRuntime(s){
 const prior=await read(path.join(local,'status.json')).catch(()=>null);
 if(prior?.generation===s.generation&&['stopped','blocked'].includes(prior.state)){
  const until=Date.now()+3000;while(await runtimeAlive(s)&&Date.now()<until)await pause(100);
  if(await runtimeAlive(s))throw Error('旧加载器正在退出，请稍后重试。');
 }
 if(await runtimeAlive(s))return s;
 const log=await fs.open(path.join(local,'runtime.log'),'a',0o600);
 try{
  const child=spawn(process.execPath,[path.join(root,'engine/runtime.mjs'),'watch',statePath],{detached:true,stdio:['ignore',log.fd,log.fd]});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  const identity=await processIdentity(child.pid);s={...s,daemonPid:child.pid,daemonCreated:identity.created,daemonExecutable:identity.executable};await write(statePath,s);return s;
 }finally{await log.close();}
}
async function control(s,paused,stop=false){
 await verifyMacApp(s);await verifyMacOwner(s);const requestId=randomUUID();await write(controlPath,{paused,stop,requestId});
 return requestId;
}
async function waitStatus(s,requestId,desired){
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){
  const status=await read(path.join(local,'status.json')).catch(()=>null);
  if(status?.generation===s.generation&&status.requestId===requestId){
   if(status.state===desired){console.log(desired==='running'?'主题已加载，点右上角 STARRY 切换壁纸。':desired==='paused'?'主题已暂停，窗口保持打开。':'主题已停止，窗口保持打开。');return;}
   if(['blocked','stopped'].includes(status.state)&&desired!=='stopped')throw Error('加载器停止：'+status.reason+'。查看 .local/runtime.log');
  }
  await pause(250);
 }
 const status=await read(path.join(local,'status.json')).catch(()=>null);
 const reason=status?.generation===s.generation?status.renderers?.[0]?.reason:null;
 console.log(reason==='unknown-active-page-or-layout'?'专用窗口已启动，当前页面没有原生 Chat/Work 布局标记。请在客户端打开原生聊天或任务页面；加载器会继续检查。':'专用窗口已启动，尚未确认页面适配成功。可查看“07-状态.command”。');
}
async function main(){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('此适配包需要 Apple Silicon Mac 和原生 arm64 Node.js 24+');
 if(Number(process.versions.node.split('.')[0])<24)throw Error('需要 Node.js 24 或更高版本');
 if(action==='inspect'){const app=await discover();console.log(JSON.stringify({platform:process.platform,arch:process.arch,...app,adapter:await read(path.join(root,'macos/adapter.json')),validation:await read(path.join(root,'macos/static-validation.json'))},null,2));return;}
 if(action==='status'){console.log(JSON.stringify(await read(path.join(local,'status.json')).catch(()=>({state:'not-started'})),null,2));return;}
 await ownLocal();
 const lock=path.join(local,'macos-operation.lock');let handle;
 try{handle=await fs.open(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('另一个主题操作正在进行。若上次异常退出，请确认没有启动脚本运行后删除 .local/macos-operation.lock。');throw error;}
 try{
  await handle.writeFile(String(process.pid));
  if(action==='install'||action==='start'){
   const app=await discover(),adapter=await read(path.join(root,'macos/adapter.json'));
   if(app.appVersion!==adapter.appVersion||app.packageVersion!==adapter.packageVersion)throw Error(`检测到 ${app.appVersion} (${app.packageVersion})，本实验包针对 ${adapter.appVersion} (${adapter.packageVersion})。版本不匹配，未注入主题。`);
   await new WallpaperCatalog(path.join(root,'theme')).load();
   console.log(`检测到 ${app.appVersion} (${app.packageVersion}) · Apple Silicon · OpenAI 签名已验证。页面兼容性由加载器实时检查。`);
   if(action==='install'){console.log('检查通过。双击“02-启动主题.command”即可。');return;}
   let s;
   try{s=await getState();}catch(error){
    const previous=await read(statePath).catch(()=>null);
    if(previous){try{process.kill(previous.ownerPid,0);throw Error('旧会话进程仍存在但身份/调试端口不匹配。请先手动关闭主题窗口，再重试。');}catch(e){if(e.code!=='ESRCH')throw e;}}
   }
   if(s&&(s.appVersion!==app.appVersion||s.packageVersion!==app.packageVersion||s.executable!==app.executable))throw Error('应用已更新，请先手动退出主题窗口再重新启动');
   if(!s){
    const profile=path.join(local,'managed-profile');await fs.mkdir(profile,{recursive:true,mode:0o700});if(await fs.realpath(profile)!==profile)throw Error('配置目录不能是符号链接');
    const codexHome=path.join(local,'codex-home');await fs.mkdir(codexHome,{recursive:true,mode:0o700});if(await fs.realpath(codexHome)!==codexHome)throw Error('Codex 配置目录不能是符号链接');
    const port=await freePort(),log=await fs.open(path.join(local,'client.log'),'a',0o600);
    let child;try{child=spawn(app.executable,['--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+profile],{env:{...process.env,CODEX_ELECTRON_USER_DATA_PATH:profile,CODEX_HOME:codexHome},detached:true,stdio:['ignore',log.fd,log.fd]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();}finally{await log.close();}
    const owner=await processIdentity(child.pid);
    s={schema:'bocchi-runtime/1',platform:'darwin',...app,profile,port,ownerPid:child.pid,ownerCreated:owner.created,generation:randomUUID()};
    // Save ownership before waiting so a retry never creates a second unknown window.
    await write(statePath,s);
    let browserId;const deadline=Date.now()+20000;while(Date.now()<deadline){try{await verifyMacOwner(s);browserId=await endpoint(port);break;}catch{await pause(300);}}
    if(!browserId)throw Error('应用未开放预期的本机调试接口；未注入。请手动退出主题窗口，查看 .local/client.log。');
    s.browserId=browserId;await write(statePath,s);
   }
   s.browserId=await endpoint(s.port);await write(statePath,s);
   const id=await control(s,false);s=await startRuntime(s);await waitStatus(s,id,'running');
  }else if(action==='pause'||action==='resume'||action==='stop'){
   let s=await getState();if(action==='resume'){await inspectMacApp(s.app);const adapter=await read(path.join(root,'macos/adapter.json'));if(adapter.appVersion!==s.appVersion||adapter.packageVersion!==s.packageVersion)throw Error('Adapter version mismatch');s.browserId=await endpoint(s.port);await write(statePath,s);}
   const id=await control(s,action==='pause',action==='stop');
   if(action==='resume')s=await startRuntime(s);
   if(!await runtimeAlive(s)){console.log('加载器已退出；主题租约会在 12 秒内清除外观。');return;}
   await waitStatus(s,id,action==='pause'?'paused':action==='stop'?'stopped':'running');
  }else throw Error('Unknown action: '+action);
 }finally{await handle.close();await fs.unlink(lock);}
}
try{await main();}catch(error){console.error('\n'+error.message);process.exitCode=1;}
