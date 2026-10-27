// Headless fixtures reproduce inspected markers; they do not stand in for native Windows acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {WallpaperCatalog} from '../engine/wallpaper-store.mjs';
if(!process.env.BOCCHI_PLAYWRIGHT_MODULE)throw Error('Set BOCCHI_PLAYWRIGHT_MODULE to the installed playwright index.mjs');
const {chromium}=await import(pathToFileURL(process.env.BOCCHI_PLAYWRIGHT_MODULE));
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'.test-output/renderer-windows-270');
await fs.mkdir(out,{recursive:true});
const adapter=JSON.parse(await fs.readFile(path.join(root,'theme/adapter.json'),'utf8'));
const source=await fs.readFile(path.join(root,'theme/renderer.js'),'utf8');
const baseline=process.env.BOCCHI_BASELINE_RENDERER?await fs.readFile(process.env.BOCCHI_BASELINE_RENDERER,'utf8'):null;
const payload={adapter,appVersion:adapter.appVersion,css:await fs.readFile(path.join(root,'theme/theme.css'),'utf8'),messages:JSON.parse(await fs.readFile(path.join(root,'theme/messages.json'),'utf8')),wallpaperCatalog:(await new WallpaperCatalog(path.join(root,'theme')).load()).catalog,initialWallpaperId:'night-stage',selectionBridge:{binding:'__BOCCHI_SELECT_WALLPAPER__',token:'a'.repeat(32)},installGeneration:'b'.repeat(32),loaderGeneration:'fixture',sticker:'data:image/png;base64,'+(await fs.readFile(path.join(root,'theme/sticker.png'))).toString('base64'),bandSticker:'data:image/png;base64,'+(await fs.readFile(path.join(root,'theme/band-sticker.png'))).toString('base64')};
const browser=await chromium.launch({headless:true,...(process.env.BOCCHI_CHROME_EXECUTABLE?{executablePath:process.env.BOCCHI_CHROME_EXECUTABLE}:{})});
const results=[];
const sha=data=>createHash('sha256').update(data).digest('hex');
async function setFixture(page,html){
 await page.evaluate(()=>window.__BOCCHI_INSTALL__?.cancel('fixture-reset'));
 await page.setContent(html);
}
async function settle(page,id='night-stage'){
 const width=page.viewportSize().width;
 await page.waitForFunction(({id,width})=>{
  const s=window.__BOCCHI_THEME__?.state;
  const layers=[...document.querySelectorAll('.bocchi-wallpaper-layer')];
  const layer=layers.find(el=>el.dataset.wallpaperId===id);
  const art=layer?.querySelector('.bocchi-art');
  return innerWidth===width&&s?.installed&&s.ready&&s.frameCallbackObserved&&s.wallpaperId===id&&
   s.imageLoaded&&!s.selectionPending&&!s.scenePending&&!s.rasterPending&&!s.rasterDeferred&&!s.lastRasterError&&
   layer?.__readyBackground===true&&Number(getComputedStyle(layer).opacity)>.999&&
   layers.every(el=>el===layer||Number(getComputedStyle(el).opacity)<.001)&&
   art?.complete&&art.naturalWidth>0&&Math.abs(document.querySelector('main').getBoundingClientRect().width-s.contentWidth)<1;
 },{id,width},{timeout:30000});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 return page.evaluate(()=>({...window.__BOCCHI_THEME__.state}));
}
async function screenshotWallpaper(page,entry){
 const s=await settle(page,entry.id);
 const imageData=await page.evaluate(async id=>{
  const img=document.querySelector(`.bocchi-wallpaper-layer[data-wallpaper-id="${id}"] .bocchi-art`);
  const blob=await (await fetch(img.src)).blob();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
 },entry.id);
 const imageHash=sha(Buffer.from(imageData.split(',')[1],'base64'));
 assert.equal(imageHash,sha(Buffer.from(entry.image.split(',')[1],'base64')),'Screenshot contains the wrong decoded artwork');
 const file=entry.id+'.png',pixels=await page.screenshot({path:path.join(out,file)});
 return {file,imageHash,screenshotSha256:sha(pixels),wallpaperId:s.wallpaperId,scenePending:s.scenePending,rasterPending:s.rasterPending};
}
function fixture(mode='chat',kind='composer'){
 const reader=mode==='chat'?'data-chatgpt-conversation-selection-target="fixture-conversation-id" data-thread-find-target="conversation"':'data-thread-user-message-navigation-content="true" data-mcp-app-portal-target="true"';
 const input=kind==='request-card'?'<div data-codex-composer-request-navigation="true">Native request card</div>':kind==='submitting'?'<div data-composer-surface-variant="default" role="presentation" inert><div data-composer-body><div data-composer-input><div role="textbox" aria-busy="true" aria-readonly="true" data-composer-input-layout="multiline" data-composer-input-variant="default">Submitting</div></div></div></div>':`<div data-composer-body><div data-composer-markdown contenteditable="true" ${mode==='work'?'data-codex-composer="true"':''} aria-label="Ask ChatGPT" role="textbox">Fixture composer</div></div>`;
 return `<!doctype html><html lang="zh-CN" data-theme="light"><head><style>
 *{box-sizing:border-box}body{margin:0;font:16px system-ui;color:#ddd}html[data-theme=light] body{color:#333;background:#eee}html[data-theme=dark] body{background:#17171e;color:#eee}aside{position:absolute;width:240px;inset:0 auto 0 0;background:#222}main{position:relative;margin-left:240px;width:calc(100% - 240px);height:900px}header{height:56px}section{height:844px;position:relative}.thread-scroll-container{height:100%;position:relative}.mx-auto{margin-left:auto;margin-right:auto}.max-w-chat{max-width:720px;width:90%}.reader{height:520px;padding:24px}footer{position:absolute;bottom:32px;left:0;right:0}[data-composer-body]{padding:20px;border:1px solid #888;border-radius:24px;min-height:100px}[contenteditable]{min-height:50px}.sidebar-title{padding:22px}h1{margin:0 0 16px}
 </style></head><body><div data-app-shell-active-page="true"><aside data-app-shell-left-panel-appearance><div class="sidebar-title">Fixture sidebar</div></aside><main data-app-shell-main-surface="default"><header data-app-shell-titlebar="true"><span>Windows titlebar fixture</span></header><section data-app-shell-focus-area="main"><div class="thread-scroll-container" data-pip-anchor-host="codex-main-thread"><div class="reader mx-auto max-w-chat" ${reader}><h1>孤独摇滚 · ${mode} 测试夹具</h1><p>阅读区与输入框布局验证。这里不包含用户聊天内容。</p></div><footer data-thread-scroll-footer="true"><div class="mx-auto max-w-chat" data-pip-obstacle="thread-footer"><div data-codex-composer-root data-composer-placement="thread">${input}</div></div></footer></div></section></main></div></body></html>`;
}
async function install(page,overrides={},renderer=source){
 await page.addScriptTag({content:renderer});
 const result=await page.evaluate(async data=>{
  window.__BOCCHI_SELECT_WALLPAPER__=async raw=>{const r=JSON.parse(raw),a=window.__BOCCHI_THEME__;if((await a.prepareWallpaper(r.id,r.requestId)).ok)a.commitWallpaper(r.id,r.requestId);};
  return installBocchiTheme({...data,leaseUntil:Date.now()+120000});
 },{...payload,...overrides});
 if(result.installed)return settle(page,overrides.initialWallpaperId||payload.initialWallpaperId);
 assert.equal(await page.locator('[data-bocchi-owned]').count(),0,'Rejected installation leaked owned nodes');
 return result;
}
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await setFixture(page,fixture());
 const initial=await install(page);assert.equal(initial.installed,true,initial.reason);assert.equal(initial.reader,true);assert.equal(initial.mode,'chat');assert.equal(initial.starryVisible,true);
 results.push({test:'conversation ID reader, native light palette acquisition and STARRY',passed:true});
 for(const entry of payload.wallpaperCatalog){
  if(!await page.locator('.bocchi-picker-menu').isVisible())await page.locator('.bocchi-picker-trigger').click();
  await page.locator(`[data-wallpaper-choice="${entry.id}"]`).click();
  const screenshot=await screenshotWallpaper(page,entry);
  results.push({test:'wallpaper '+entry.id,passed:true,screenshot});
 }
 for(const width of [1226,800]){await page.setViewportSize({width,height:900});const s=await settle(page,payload.wallpaperCatalog.at(-1).id);assert(s.columnWidth<=s.contentWidth);results.push({test:'resize '+width,passed:true});}
 const removed=await page.evaluate(()=>{window.__BOCCHI_THEME__.remove();return{nodes:document.querySelectorAll('[data-bocchi-owned]').length,style:!!document.querySelector('#bocchi-theme-style-v2'),theme:document.documentElement.dataset.theme,attrs:document.querySelectorAll('[data-bocchi-active],[data-bocchi-reader],[data-bocchi-column]').length};});
 assert.deepEqual(removed,{nodes:0,style:false,theme:'light',attrs:0});results.push({test:'owned nodes/styles/attributes and native palette restore',passed:true});
 await page.setViewportSize({width:1440,height:900});
 for(const kind of ['composer','request-card','submitting']){await setFixture(page,fixture('work',kind));const s=await install(page);assert(s.installed,s.reason);assert.equal(s.reader,true);assert.equal(s.inputKind,kind);results.push({test:'Work '+kind,passed:true});await page.evaluate(()=>window.__BOCCHI_THEME__.remove());}
 await setFixture(page,fixture());const rejected=await install(page,{appVersion:'26.1021.99999'});assert.equal(rejected.reason,'version-mismatch');assert.equal(await page.locator('[data-bocchi-owned]').count(),0);results.push({test:'unsupported version rejected before mutation',passed:true});
 await setFixture(page,fixture());await page.locator('.reader').evaluate(el=>el.after(el.cloneNode(true)));const ambiguous=await install(page);assert.equal(ambiguous.reason,'ambiguous-conversation-reader');assert.equal(await page.locator('[data-bocchi-owned]').count(),0);results.push({test:'ambiguous reader rejected and cleaned',passed:true});
 await setFixture(page,fixture());await install(page);await page.evaluate(()=>window.__BOCCHI_THEME__.heartbeat(Date.now()+300));await page.waitForFunction(()=>!window.__BOCCHI_THEME__);assert.equal(await page.locator('[data-bocchi-owned]').count(),0);results.push({test:'expired loader lease cleans renderer',passed:true});
 const windows=JSON.parse(await fs.readFile(path.join(root,'theme/adapter.json'),'utf8'));
 for(const mode of ['chat','work']){
  await setFixture(page,fixture(mode).replace('fixture-conversation-id','true'));
  const result=await install(page,{adapter:windows,appVersion:windows.appVersion});
  assert.equal(result.installed,true,result.reason);assert.equal(result.reader,true);assert.equal(result.mode,mode);
  results.push({test:'Windows legacy '+mode+' reader path unchanged',passed:true});
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
 }
 if(baseline){
  const chat=fixture('chat').replace('fixture-conversation-id','true');
  const cases=[['Chat reader',chat],['Work reader',fixture('work')],['Chat fallback reader',chat.replace('data-chatgpt-conversation-selection-target="true" data-thread-find-target="conversation"','data-thread-user-message-navigation-content="true"')],['Chat without reader',chat.replace('data-chatgpt-conversation-selection-target="true" data-thread-find-target="conversation"','')],['Chat duplicate legacy readers',chat.replace('<footer','<div class="reader mx-auto max-w-chat" data-chatgpt-conversation-selection-target="true">Second reader</div><footer')]];
  for(const [name,html] of cases){
   const observations=[];
   for(const renderer of [baseline,source]){
    await page.setViewportSize({width:1440,height:900});await page.setContent(html);
    const initial=await install(page,{adapter:windows,appVersion:windows.appVersion},renderer);
    const states=[];
    if(!initial.installed)states.push({installed:false,reason:initial.reason});
    else for(const width of [1440,800]){
     await page.setViewportSize({width,height:900});
     await page.evaluate(()=>window.__BOCCHI_THEME__?.refresh());
     const s=await settle(page);
     states.push(Object.fromEntries(['installed','ready','mode','reader','inputKind','wallpaperId','starryVisible','contentWidth','columnLeft','columnWidth'].map(k=>[k,s[k]])));
    }
    const cleanup=await page.evaluate(()=>{window.__BOCCHI_THEME__?.remove();return{nodes:document.querySelectorAll('[data-bocchi-owned]').length,styles:document.querySelectorAll('#bocchi-theme-style-v2').length,theme:document.documentElement.dataset.theme};});
    assert.deepEqual(cleanup,{nodes:0,styles:0,theme:'light'});
    observations.push({states,cleanup});
   }
   assert.deepEqual(observations[1],observations[0],name+' differs from upstream Windows behavior');
   results.push({test:'Windows upstream/current equivalence: '+name+' at 1440/800px and cleanup',passed:true});
  }
 }
}catch(error){results.push({test:'fixture execution',passed:false,error:error.stack});throw error;}
finally{
 const report={scope:'Headless Chromium fixtures using inspected markers; not native Windows acceptance',themeVersion:adapter.themeVersion,appVersion:adapter.appVersion,build:adapter.packageVersion,rendererSha256:sha(source),baselineSha256:baseline?sha(baseline):null,results};
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,report:path.join(out,'results.json')}));
 await browser.close();
}
