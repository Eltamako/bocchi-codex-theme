import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMacApp,verifyMacApp,SIGNING_REQUIREMENT} from '../engine/macos-app.mjs';
const app='/Applications/ChatGPT.app',plist={CFBundleIdentifier:'com.openai.codex',CFBundleExecutable:'ChatGPT',CFBundleShortVersionString:'26.1021.31345',CFBundleVersion:'21828'};
const state={app,executable:app+'/Contents/MacOS/ChatGPT',appVersion:plist.CFBundleShortVersionString,packageVersion:'21828',bundleId:plist.CFBundleIdentifier};
test('Mac discovery enforces the OpenAI signer and exact bundle identity',async()=>{
 const calls=[];const run=async(file,args)=>{calls.push([file,args]);return{stdout:JSON.stringify(plist)};};
 assert.deepEqual(await inspectMacApp(app,run,async p=>p),state);
 assert(calls[1][1].includes(SIGNING_REQUIREMENT));
 await assert.rejects(inspectMacApp(app,async()=>({stdout:JSON.stringify({...plist,CFBundleIdentifier:'com.openai.other'})}),async p=>p),/identity/);
 await assert.rejects(inspectMacApp(app,async(file)=>{if(file.endsWith('codesign'))throw Error('invalid signature');return{stdout:JSON.stringify(plist)};},async p=>p),/signature/);
});
test('Live Mac version/build/executable drift is rejected before connecting',async()=>{
 await verifyMacApp(state,async()=>({stdout:JSON.stringify(plist)}));
 for(const diff of [{CFBundleShortVersionString:'26.1022.1'},{CFBundleVersion:'21829'},{CFBundleExecutable:'Other'},{CFBundleIdentifier:'com.openai.other'}]){
  await assert.rejects(verifyMacApp(state,async()=>({stdout:JSON.stringify({...plist,...diff})})),/application changed/);
 }
});

test('live application probe rejects executable traversal even if it resolves to the expected file',async()=>{
 await assert.rejects(verifyMacApp(state,async()=>({stdout:JSON.stringify({...plist,CFBundleExecutable:'../MacOS/ChatGPT'})})),/executable/);
});
