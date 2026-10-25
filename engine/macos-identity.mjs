import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const execFile=promisify(callback);
export async function processIdentity(pid,run=execFile){
 if(!Number.isSafeInteger(pid)||pid<2)throw Error('Invalid process ID');
 const read=async field=>(await run('/bin/ps',['-ww','-p',String(pid),'-o',field+'='],{env:{...process.env,LC_ALL:'C'}})).stdout.trim();
 return {pid,executable:await read('comm'),created:await read('lstart'),command:await read('command')};
}
export function validateIdentity(state,identity,sockets,inherited=[]){
 if(identity.pid!==state.ownerPid||identity.executable!==state.executable||identity.created!==state.ownerCreated||!identity.created)throw Error('Managed Mac process identity changed');
 const arg='--user-data-dir='+state.profile;
 for(const flag of ['--user-data-dir=','--remote-debugging-port=','--remote-debugging-address=']){
  if(identity.command.split(' '+flag).length!==2)throw Error('Ambiguous managed Mac launch arguments');
 }
 const hasArg=value=>identity.command.endsWith(' '+value)||identity.command.includes(' '+value+' ');
 if(!hasArg(arg)||!hasArg('--remote-debugging-port='+state.port)||!hasArg('--remote-debugging-address=127.0.0.1'))throw Error('Managed Mac launch arguments changed');
 const records=sockets.split('\n').filter(Boolean),pids=records.filter(x=>x.startsWith('p'));
 const expected=new Set([state.ownerPid,...inherited]);
 if(pids.length!==expected.size||pids.some(x=>!expected.has(Number(x.slice(1)))))throw Error('Unexpected debugging port owner');
 const names=records.filter(x=>x.startsWith('n'));
 if(!names.length||names.some(x=>x!=='n127.0.0.1:'+state.port))throw Error('Debugging must listen only on IPv4 loopback');
}
export function validateInheritedSocket(table,ownerPid,helperPid){
 const rows=table.trim().split('\n').slice(1).map(line=>line.trim().split(/\s+/));
 // macOS DEVICE identifies the kernel socket. Independent SO_REUSEPORT
 // listeners must never be accepted as an inherited descriptor.
 if(rows.length!==2||rows.some(r=>r[4]!=='IPv4'||!/^0x[0-9a-f]+$/i.test(r[5]))||
    new Set(rows.map(r=>Number(r[1]))).size!==2||!rows.some(r=>Number(r[1])===ownerPid)||!rows.some(r=>Number(r[1])===helperPid)||rows[0][5]!==rows[1][5])
  throw Error('Unverified inherited debugging socket');
}
export async function verifyMacOwner(state,run=execFile){
 if(state.platform!=='darwin'||!Number.isSafeInteger(state.port)||state.port<1024||state.port>65535)throw Error('Invalid Mac state');
 const identity=await processIdentity(state.ownerPid,run);
 const {stdout}=await run('/usr/sbin/lsof',['-nP','-a','-iTCP:'+state.port,'-sTCP:LISTEN','-Fpn']);
 const pids=stdout.split('\n').filter(x=>/^p\d+$/.test(x)).map(x=>Number(x.slice(1)));
 const inherited=pids.filter(pid=>pid!==state.ownerPid);
 if(inherited.length){
  // This inspected build launches exactly one signed CUA helper with an
  // inherited listener. Every other shared/foreign listener remains blocked.
  if(inherited.length!==1||pids.length!==2||!pids.includes(state.ownerPid))throw Error('Unexpected debugging port owner');
  const pid=inherited[0],helper=await processIdentity(pid,run);
  const helperApp=path.join(path.dirname(state.profile),'codex-home/computer-use/Codex Computer Use.app');
  const expected=path.join(helperApp,'Contents/MacOS/SkyComputerUseService');
  const parent=Number((await run('/bin/ps',['-ww','-p',String(pid),'-o','ppid='],{env:{...process.env,LC_ALL:'C'}})).stdout.trim());
  if(parent!==state.ownerPid||helper.executable!==expected||!helper.created)throw Error('Unverified debugging helper process');
  await run('/usr/bin/codesign',['--verify','--deep','--strict','-R','=anchor apple generic and identifier "com.openai.sky.CUAService" and certificate leaf[subject.OU] = "2DC432GLL2"',helperApp]);
  const table=(await run('/usr/sbin/lsof',['-nP','-a','-iTCP:'+state.port,'-sTCP:LISTEN'])).stdout;
  validateInheritedSocket(table,state.ownerPid,pid);
  const after=await processIdentity(pid,run);
  if(after.created!==helper.created||after.executable!==helper.executable)throw Error('Debugging helper process changed');
  const parentAfter=Number((await run('/bin/ps',['-ww','-p',String(pid),'-o','ppid='],{env:{...process.env,LC_ALL:'C'}})).stdout.trim());
  if(parentAfter!==state.ownerPid)throw Error('Debugging helper parent changed');
 }
 validateIdentity(state,identity,stdout,inherited);
}
