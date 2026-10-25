import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyMacApp,inspectMacApp,validateMacApp} from '../engine/macos-app.mjs';
import {verifyMacOwner,processIdentity} from '../engine/macos-identity.mjs';
const root=path.resolve(import.meta.dirname,'..'),local=path.join(root,'.local'),execFile=promisify(callback);
const read=async name=>JSON.parse(await fs.readFile(path.join(local,name),'utf8'));
const results=[];
const record=(test,details={})=>{results.push({test,passed:true,...details});console.log('PASS '+test);};
const command=async action=>execFile(process.execPath,[path.join(root,'macos/launcher.mjs'),action],{timeout:35000});
const original=await read('runtime-state.json');
validateMacApp(original,await inspectMacApp(original.app));
await verifyMacApp(original);await verifyMacOwner(original);record('signed app version and real process/socket ownership');
const processes=(await execFile('/bin/ps',['-axo','pid=,comm='])).stdout.split('\n').map(line=>line.trim().match(/^(\d+)\s+(.+)$/)).filter(Boolean).filter(row=>row[2]===original.executable&&Number(row[1])!==original.ownerPid);
const ordinary=await Promise.all(processes.map(row=>processIdentity(Number(row[1]))));
await assert.rejects(verifyMacApp({...original,packageVersion:'21829'}));record('wrong build rejected by live application probe');
await assert.rejects(verifyMacOwner({...original,ownerCreated:'incorrect creation time'}));record('changed creation time rejected by live process probe');
await command('start');const repeated=await read('runtime-state.json');assert.equal(repeated.ownerPid,original.ownerPid);assert.equal(repeated.generation,original.generation);record('repeated Start reuses the verified managed window');
let status=await read('status.json');assert.equal(status.state,'running');assert(status.renderers[0].installed&&status.renderers[0].ready);const selected=status.wallpaperId;const geometry=status.renderers[0];
const runtimeHash=createHash('sha256').update(await fs.readFile(path.join(root,'engine/runtime.mjs'))).digest('hex').toUpperCase();
assert.equal(status.runtimeHash,runtimeHash);record('running loader matches current installed source hash');
record('native renderer ready',{mode:geometry.mode,inputKind:geometry.inputKind,reader:geometry.reader,activePages:geometry.activePages,contentWidth:geometry.contentWidth,columnLeft:geometry.columnLeft,columnWidth:geometry.columnWidth,starryVisible:geometry.starryVisible,wallpaperId:selected});
await command('pause');status=await read('status.json');assert.equal(status.state,'paused');assert.deepEqual(status.cleanup,[{ownedNodes:0,themeStyles:0,themePresent:false}]);record('Pause removes all theme nodes and stylesheet');
await command('resume');status=await read('status.json');assert.equal(status.state,'running');assert.equal(status.wallpaperId,selected);record('Resume restores the selected wallpaper');
await command('stop');status=await read('status.json');assert.equal(status.state,'stopped');assert.deepEqual(status.cleanup,[{ownedNodes:0,themeStyles:0,themePresent:false}]);
const daemon=status.daemonPid;
for(let i=0;i<40;i++){const p=await processIdentity(daemon).catch(()=>null);if(!p?.created||p.executable!==original.daemonExecutable)break;await new Promise(r=>setTimeout(r,100));}
const p=await processIdentity(daemon).catch(()=>null);assert(!p?.created||p.executable!==original.daemonExecutable);await verifyMacOwner(original);record('Stop exits only the loader and preserves the managed app');
await command('resume');status=await read('status.json');assert.equal(status.state,'running');assert.equal(status.wallpaperId,selected);let final=await read('runtime-state.json');assert.equal(final.ownerPid,original.ownerPid);assert.notEqual(final.daemonPid,daemon);record('Resume restarts the loader on the same managed window');
const exitProbes=process.argv.includes('--exit-probes');
if(exitProbes){
 for(const signal of ['SIGTERM','SIGKILL']){
  await verifyMacApp(final);await verifyMacOwner(final);
  const loader=await processIdentity(final.daemonPid);
  assert.equal(loader.created,final.daemonCreated);assert.equal(loader.executable,final.daemonExecutable);
  assert(loader.command.includes(path.join(root,'engine/runtime.mjs'))&&loader.command.includes(path.join(local,'runtime-state.json')));
  process.kill(final.daemonPid,signal);
  const until=Date.now()+20000;
  while(Date.now()<until){const alive=await processIdentity(final.daemonPid).catch(()=>null);if(!alive?.created||alive.created!==loader.created)break;await new Promise(r=>setTimeout(r,100));}
  const alive=await processIdentity(final.daemonPid).catch(()=>null);assert(!alive?.created||alive.created!==loader.created);
  if(signal==='SIGTERM'){const stopped=await read('status.json');assert.equal(stopped.state,'stopped');assert.equal(stopped.reason,'loader-stopped');}
  else await new Promise(r=>setTimeout(r,13000)); // Allow the last heartbeat lease to expire.
  await verifyMacOwner(final);
  await command('resume');status=await read('status.json');assert.equal(status.state,'running');assert.equal(status.wallpaperId,selected);
  const resumed=await read('runtime-state.json');assert.equal(resumed.ownerPid,original.ownerPid);assert.notEqual(resumed.daemonPid,final.daemonPid);final=resumed;
  record(signal+' exits only the verified loader; managed app survives and Resume restores selection');
 }
}
for(const identity of ordinary){const current=await processIdentity(identity.pid);assert.equal(current.created,identity.created);assert.equal(current.executable,identity.executable);}
record('ordinary client processes remain alive with the same identity',{ordinaryClients:ordinary.length});
const report={schema:'bocchi-mac-live-validation/1',validatedAt:new Date().toISOString(),appVersion:original.appVersion,build:original.packageVersion,runtimeHash,exitProbes,scope:'Actual local signed app, process/socket verification and native renderer theme lifecycle. No automated native UI input or screenshot capture.',results,limitations:['Native screenshot/visual review requires the user; the computer-use tool prohibits controlling Codex.','No outgoing chat request or authenticated Chat conversation was generated by these tests.','All six wallpaper changes and Work request/submitting shells are additionally covered by headless fixtures.','SIGKILL visual lease cleanup still requires human confirmation; the exit probe waits 13 seconds without reading user content.']};
await fs.writeFile(path.join(root,'macos/live-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:results.length,finalState:status.state,wallpaperId:status.wallpaperId},null,2));
