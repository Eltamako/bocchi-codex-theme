import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('Mac entries point to the verified launcher and retain executable mode',async()=>{
 for(const name of ['01-检查安装.command','02-启动主题.command','03-暂停主题.command','04-恢复主题.command','05-恢复原界面.command','06-检测版本.command','07-状态.command']){
  const file=path.join(root,name),source=await fs.readFile(file,'utf8');
  assert(source.includes('macos/launcher.mjs'));assert(source.includes('node-darwin-arm64'));
  if(process.platform!=='win32')assert((await fs.stat(file)).mode&0o111);
 }
});
test('Windows and Mac adapter tuples remain separate',async()=>{
 const read=async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
 const windows=await read('theme/adapter.json'),mac=await read('macos/adapter.json');
 assert.equal(windows.appVersion,'26.1016.51333');assert.equal(windows.packageVersion,'26.1016.6573.0');
 assert.equal(mac.platform,'darwin');assert.equal(mac.appVersion,'26.1021.31345');assert.equal(mac.packageVersion,'21828');
 assert.notEqual(mac.chatReader,windows.chatReader);
});
