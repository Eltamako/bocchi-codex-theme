import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
const execFile=promisify(callback);
export const SIGNING_REQUIREMENT='=anchor apple generic and identifier "com.openai.codex" and certificate leaf[subject.OU] = "2DC432GLL2"';
export async function inspectMacApp(candidate,run=execFile,realpath=fs.realpath){
 const app=await realpath(candidate);
 const plist=JSON.parse((await run('/usr/bin/plutil',['-convert','json','-o','-',path.join(app,'Contents/Info.plist')])).stdout);
 if(plist.CFBundleIdentifier!=='com.openai.codex')throw Error('Unsupported OpenAI application identity');
 const name=plist.CFBundleExecutable;
 if(typeof name!=='string'||!name||path.basename(name)!==name)throw Error('Invalid application executable');
 await run('/usr/bin/codesign',['--verify','--deep','--strict','-R',SIGNING_REQUIREMENT,app]);
 return {app,executable:await realpath(path.join(app,'Contents/MacOS',name)),appVersion:plist.CFBundleShortVersionString,packageVersion:String(plist.CFBundleVersion),bundleId:plist.CFBundleIdentifier};
}
export function validateMacApp(expected,actual){
 if(expected.app!==actual.app||expected.executable!==actual.executable||expected.appVersion!==actual.appVersion||expected.packageVersion!==actual.packageVersion||expected.bundleId!==actual.bundleId)
  throw Error('Managed Mac application changed; restart after adapting this version');
}
// Runtime probes the version on disk before each connection. Signature verification
// belongs to launch/resume; the running process is independently verified every time.
export async function verifyMacApp(state,run=execFile){
 if(typeof state.app!=='string'||!path.isAbsolute(state.app)||state.bundleId!=='com.openai.codex')throw Error('Invalid Mac application state');
 const p=JSON.parse((await run('/usr/bin/plutil',['-convert','json','-o','-',path.join(state.app,'Contents/Info.plist')])).stdout);
 if(typeof p.CFBundleExecutable!=='string'||!p.CFBundleExecutable||path.basename(p.CFBundleExecutable)!==p.CFBundleExecutable)throw Error('Invalid application executable');
 const executable=path.join(state.app,'Contents/MacOS',p.CFBundleExecutable);
 validateMacApp(state,{app:state.app,executable,appVersion:p.CFBundleShortVersionString,packageVersion:String(p.CFBundleVersion),bundleId:p.CFBundleIdentifier});
}
