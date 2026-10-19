import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {normalizeLanguage,readLanguagePreference} from '../engine/language.mjs';
const root=path.resolve(import.meta.dirname,'..');
test('shared catalog has matching translated keys and placeholders',async()=>{
 const m=JSON.parse(await fs.readFile(path.join(root,'theme/messages.json'),'utf8'));
 assert.deepEqual(Object.keys(m.en).sort(),Object.keys(m['zh-CN']).sort());
 for(const k of Object.keys(m.en)){assert(m.en[k].length>0&&m['zh-CN'][k].length>0);assert.deepEqual(m.en[k].match(/\{\d+\}/g),m['zh-CN'][k].match(/\{\d+\}/g),k);}
});
test('language preference is local, bounded and falls back without rewriting',async()=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'bocchi-language-'));const f=path.join(d,'language.json');
 try{
  assert.deepEqual(await readLanguagePreference(d),{language:'auto',systemLanguage:'en'});
  for(const language of ['auto','zh-CN','en']){await fs.writeFile(f,JSON.stringify({schema:'bocchi-language/1',language,systemLanguage:'zh-TW'}));assert.deepEqual(await readLanguagePreference(d),{language,systemLanguage:'zh-CN'});}
  for(const value of ['broken',JSON.stringify({schema:'wrong',language:'en'}),'x'.repeat(5000)]){await fs.writeFile(f,value);assert.deepEqual(await readLanguagePreference(d),{language:'auto',systemLanguage:'en'});assert.equal(await fs.readFile(f,'utf8'),value);}
  assert.equal(normalizeLanguage('en-GB'),'en');assert.equal(normalizeLanguage('zh-HK'),'zh-CN');assert.equal(normalizeLanguage('fr-FR'),'en');
 }finally{await fs.unlink(f).catch(()=>{});await fs.rmdir(d);}
});
test('English and Chinese entries share scripts and forward options',async()=>{
 for(const pair of [['Install.cmd','01-安装.cmd'],['Start.cmd','02-启动主题.cmd'],['Pause.cmd','03-暂停主题.cmd'],['Resume.cmd','04-恢复主题.cmd'],['Restore.cmd','05-恢复原界面.cmd'],['Language.cmd','06-语言设置.cmd']]){
  const [a,b]=await Promise.all(pair.map(n=>fs.readFile(path.join(root,n),'utf8')));assert.equal(a,b);assert(a.includes('%*'));assert(a.includes('chcp 65001'));
 }
});
