import test from 'node:test';
import assert from 'node:assert/strict';
import {validateIdentity,verifyMacOwner,validateInheritedSocket} from '../engine/macos-identity.mjs';
const state={platform:'darwin',ownerPid:120,executable:'/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',ownerCreated:'Thu Oct 22 12:00:00 2026',profile:'/Users/test/Theme with spaces/.local/managed-profile',port:34567};
const identity={pid:120,executable:state.executable,created:state.ownerCreated,command:state.executable+' --remote-debugging-address=127.0.0.1 --remote-debugging-port=34567 --user-data-dir='+state.profile};
const sockets='p120\nf25\nn127.0.0.1:34567\n';
test('Mac ownership accepts exact executable, creation time, profile and IPv4 loopback listener',()=>{validateIdentity(state,identity,sockets);});
test('Mac PID reuse, other executable, profile and debugging port are rejected',()=>{
 for(const change of [{pid:121},{created:'other'},{executable:'/Applications/Other.app/Other'},{command:identity.command.replace(state.profile,'/other')},{command:identity.command.replace('34567','34568')},{command:identity.command+'-other'}])assert.throws(()=>validateIdentity(state,{...identity,...change},sockets));
});
test('Mac public, IPv6, shared and foreign listeners are rejected',()=>{
 for(const record of ['p120\nn*:34567','p120\nn[::1]:34567','p121\nn127.0.0.1:34567','p120\nn127.0.0.1:34567\np121\nn127.0.0.1:34567','p120'])assert.throws(()=>validateIdentity(state,identity,record));
});
test('Mac owner probe uses separate ps fields and rejects listeners before runtime injection',async()=>{
 const calls=[];
 const run=async(file,args)=>{calls.push([file,args]);if(file.endsWith('lsof'))return {stdout:sockets.replace('127.0.0.1','0.0.0.0')};return {stdout:({'comm=':identity.executable,'lstart=':identity.created,'command=':identity.command})[args.at(-1)]};};
 await assert.rejects(verifyMacOwner(state,run),/loopback/);assert.equal(calls.length,4);
 await assert.rejects(verifyMacOwner({...state,platform:'win32'},run),/Invalid Mac state/);
});
const table='COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nChatGPT 120 test 75u IPv4 0xabc123 0t0 TCP 127.0.0.1:34567 (LISTEN)\nSkyComput 121 test 75u IPv4 0xabc123 0t0 TCP 127.0.0.1:34567 (LISTEN)\n';
test('Only the same kernel socket can be inherited; independent and third listeners fail',()=>{
 validateInheritedSocket(table,120,121);
 for(const bad of [table.replace(/0xabc123(?= 0t0 TCP[^\n]+\n$)/,'0x999'),table.replace('SkyComput 121','SkyComput 122'),table+'Other 122 test 75u IPv4 0xabc123 0t0 TCP 127.0.0.1:34567 (LISTEN)\n'])assert.throws(()=>validateInheritedSocket(bad,120,121));
});
test('Inherited listener requires the signed exact helper path and direct parent',async()=>{
 const expected='/Users/test/Theme with spaces/.local/codex-home/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService';
 let parent='120',executable=expected,signature=true;
 const run=async(file,args)=>{
  if(file.endsWith('lsof'))return{stdout:args.includes('-Fpn')?sockets+'p121\nf75\nn127.0.0.1:34567\n':table};
  if(file.endsWith('codesign')){if(!signature)throw Error('bad signature');return{stdout:''};}
  if(args.at(-1)==='ppid=')return{stdout:parent};
  const helper=args.includes('121');return{stdout:({'comm=':helper?executable:identity.executable,'lstart=':identity.created,'command=':identity.command})[args.at(-1)]};
 };
 await verifyMacOwner(state,run);
 parent='999';await assert.rejects(verifyMacOwner(state,run),/helper/);parent='120';
 executable='/other/SkyComputerUseService';await assert.rejects(verifyMacOwner(state,run),/helper/);executable=expected;
 signature=false;await assert.rejects(verifyMacOwner(state,run),/signature/);
});

test('duplicate launch flags cannot disguise another profile or debugging configuration',()=>{
 for(const extra of [' --user-data-dir=/other',' --remote-debugging-port=12345',' --remote-debugging-address=0.0.0.0'])assert.throws(()=>validateIdentity(state,{...identity,command:identity.command+extra},sockets),/Ambiguous/);
});
