// Headless fixtures reproduce inspected markers; they do not stand in for native Windows acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {WallpaperCatalog} from '../engine/wallpaper-store.mjs';
if(!process.env.BOCCHI_PLAYWRIGHT_MODULE)throw Error('Set BOCCHI_PLAYWRIGHT_MODULE to the installed playwright index.mjs');
const {chromium}=await import(pathToFileURL(process.env.BOCCHI_PLAYWRIGHT_MODULE));
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'.test-output/renderer-windows-280');
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
function homeLayout(mode,project=false){
 const heading=project?'What should we do in this project?':'What should we do?';
 const toggle=project?'':`<header data-app-shell-titlebar><div class="@container/home-mode-toggle mode-host"><div role="group" class="mode-group"><button aria-pressed="${mode==='chat'}">Chat</button><button aria-pressed="${mode==='work'}">Work</button></div><button id="unrelated-header">Other</button></div></header>`;
 return fixture(mode).replace('<main data-app-shell-main-surface="default">',toggle+'<main data-app-shell-main-surface="default">')
  .replace(/<div class="reader mx-auto max-w-chat"[^>]*>[\s\S]*?<\/div>/,'<div class="home-hero"><div class="mx-auto min-w-0 px-panel w-[min(100%,var(--thread-content-max-width))] home-greeting"><h1>'+heading+'</h1></div></div>')
  .replace('</style>',`.mode-host{position:absolute;top:56px;left:240px;right:0;height:48px;display:flex;align-items:center;justify-content:center}.mode-group{display:flex;width:224px;justify-content:center}.mode-group button{width:112px;height:36px}#unrelated-header{position:absolute;right:8px}.home-hero{position:absolute;top:240px;left:0;right:0;display:flex;justify-content:center}.home-greeting{width:min(100%,672px);text-align:center;padding:0 20px}footer{top:400px;bottom:auto} [data-pip-obstacle]{padding:0 16px}</style>`);
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
 // 26.1023 retains the dynamic Chat ID, shared transcript width owner,
 // dedicated request boundary and image-preview portal. Exercise their
 // relationships, not merely the presence of the attribute names.
 for(const mode of ['chat','work']){
  await setFixture(page,fixture(mode));await install(page);
  if(mode==='work')for(const entry of payload.wallpaperCatalog){
   if(!await page.locator('.bocchi-picker-menu').isVisible())await page.locator('.bocchi-picker-trigger').click();
   await page.locator(`[data-wallpaper-choice="${entry.id}"]`).click();
   await settle(page,entry.id);
   results.push({test:'Work wallpaper '+entry.id,passed:true});
  }
  if(mode==='work'){
   if(!await page.locator('.bocchi-picker-menu').isVisible())await page.locator('.bocchi-picker-trigger').click();
   await page.locator('[data-wallpaper-choice="night-stage"]').click();await settle(page);
  }
  if(mode==='chat'){
   await page.evaluate(()=>{
    const reader=document.querySelector('[data-chatgpt-conversation-selection-target]');
    const shell=document.createElement('div');shell.className='mx-auto max-w-chat';
    shell.setAttribute('data-thread-user-message-navigation-content','true');shell.setAttribute('data-mcp-app-portal-target','true');
    reader.before(shell);shell.append(reader);reader.classList.remove('mx-auto','max-w-chat');
    window.__BOCCHI_THEME__.refresh();
   });
   const s=await settle(page);assert.equal(s.mode,'chat');assert.equal(s.reader,true);
   results.push({test:'26.1023 Chat dynamic reader inside shared transcript column',passed:true});
  }
  await page.evaluate(()=>{
   window.fixtureTheme=window.__BOCCHI_THEME__;window.fixturePlate=document.querySelector('.bocchi-backdrop');
   window.fixtureBody=document.querySelector('[data-composer-body]');window.fixtureParent=fixtureBody.parentElement;
   const preview=document.createElement('div');preview.id='fixture-preview';preview.className='_chrome_vhnt9_2';preview.role='dialog';
   preview.style.cssText='position:fixed;inset:0;z-index:100;background:transparent';preview.innerHTML='<div data-image-preview-toolbar></div>';
   preview.append(fixtureBody);document.body.append(preview);document.documentElement.classList.add('_active_vhnt9_2','_opening_vhnt9_2');fixtureTheme.refresh();
  });
  await page.waitForTimeout(1200);
  assert.deepEqual(await page.evaluate(()=>({installed:fixtureTheme.state.installed,preview:fixtureTheme.state.imagePreview,same:fixturePlate===document.querySelector('.bocchi-backdrop')})),{installed:true,preview:true,same:true});
  await page.evaluate(()=>{fixtureParent.append(fixtureBody);document.querySelector('#fixture-preview').remove();document.documentElement.classList.remove('_active_vhnt9_2','_opening_vhnt9_2');fixtureTheme.refresh();});
  await settle(page);assert.equal(await page.evaluate(()=>fixtureTheme.state.imagePreview),false);
  results.push({test:'26.1023 '+mode+' image-preview portal preserves scene and restores composer',passed:true});
  await page.evaluate(()=>{const body=document.querySelector('[data-composer-body]');body.style.height='220px';window.__BOCCHI_THEME__.refresh();});
  const tall=await settle(page);assert(tall.readerClip&&Number.isFinite(tall.readerClip.boundary));
  const footerTop=await page.locator('[data-pip-obstacle="thread-footer"]').evaluate(el=>el.getBoundingClientRect().top);
  assert(tall.readerClip.boundary<=footerTop+1);
  results.push({test:mode+' expanded composer keeps reader above footer',passed:true});
  for(const width of [1280,1920,800,1440]){await page.setViewportSize({width,height:900});await settle(page);}
  results.push({test:mode+' scene settles through wide and narrow resizes',passed:true});
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
  await setFixture(page,fixture(mode));
  await page.locator('.reader').evaluate(el=>el.remove());
  const home=await install(page);assert.equal(home.reader,false);assert.equal(home.mode,mode);
  results.push({test:mode+' home without reader',passed:true});
 }
 await setFixture(page,fixture('work','request-card'));
 await page.locator('[data-codex-composer-root]').evaluate(el=>{el.removeAttribute('data-codex-composer-root');el.removeAttribute('data-composer-placement');el.setAttribute('data-codex-composer-request','true');el.setAttribute('data-codex-character-input-boundary','true');});
 assert.equal((await install(page)).inputKind,'request-card');
 results.push({test:'26.1023 dedicated Work request boundary',passed:true});
 // Native 26.1023 regressions: portalled home controls, paint-only footer
 // surfaces and the nested DIL viewport. No real chat contents in fixtures.
 for(const mode of ['chat','work'])for(const project of [false,true]){
  await setFixture(page,homeLayout(mode,project));
  const oldHeader=await page.locator('#unrelated-header').count()?await page.locator('#unrelated-header').boundingBox():null;
  const s=await install(page);assert(s.homeGreetingAligned);assert.equal(s.homeModeAligned,!project);assert(s.emptySticker);
  const geometry=await page.evaluate(()=>{
   const center=e=>{const r=e.getBoundingClientRect();return r.x+r.width/2};
   const body=document.querySelector('[data-composer-body]'),greeting=document.querySelector('.home-greeting');
   const group=document.querySelector('.mode-group'),sticker=document.querySelector('.bocchi-empty-sticker');
   return {body:center(body),greeting:center(greeting),mode:group&&center(group),sticker:center(sticker),gap:body.getBoundingClientRect().top-sticker.getBoundingClientRect().bottom};
  });
  for(const key of ['greeting','sticker',...(!project?['mode']:[])])assert(Math.abs(geometry[key]-geometry.body)<1,key+' must align to composer');
  assert(geometry.gap>=12);if(oldHeader)assert.deepEqual(await page.locator('#unrelated-header').boundingBox(),oldHeader);
  const expectedFraming=s.artBounds;
  await page.evaluate(()=>window.__BOCCHI_THEME__.setLanguage('en'));await settle(page);
  assert.deepEqual((await page.evaluate(()=>window.__BOCCHI_THEME__.state.artBounds)),expectedFraming);
  await page.screenshot({path:path.join(out,`home-${mode}-${project?'project':'global'}.png`)});
  for(const width of [800,1280,1920]){
   await page.setViewportSize({width,height:900});await settle(page);
   const aligned=await page.evaluate(()=>{const center=e=>{const r=e.getBoundingClientRect();return r.x+r.width/2};const x=center(document.querySelector('[data-composer-body]'));return [...document.querySelectorAll('.home-greeting,.mode-group,.bocchi-empty-sticker')].every(e=>Math.abs(center(e)-x)<1)});
   assert(aligned,`Home alignment failed at ${width}px`);
  }
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
  await page.setViewportSize({width:1440,height:900});
  assert.equal(await page.locator('[data-bocchi-home-mode],[data-bocchi-home-raised]').count(),0);
  results.push({test:`${mode} ${project?'project':'global'} home greeting, mode group, mascot alignment and cleanup`,passed:true});
 }
 for(const mode of ['chat','work']){
  let html=fixture(mode).replace('<footer data-thread-scroll-footer="true">','<footer data-thread-scroll-footer="true"><div id="footer-paint" class="_background_18hic_2 _surface_18hic_2 pointer-events-none absolute z-0 bottom-0 bg-surface"></div>')
   .replace('</style>','#footer-paint{position:absolute;bottom:-32px;left:0;right:0;height:132px;background:rgb(24,24,24);pointer-events:none;z-index:0}.max-w-chat{position:relative}.table-viewport{overflow:auto;padding-inline-start:152px;scroll-padding-inline-start:152px}.table-viewport table{min-width:900px}#unrelated-paint{position:absolute;top:70px;height:80px;width:100%;background:#181818}</style>')
   .replace('<p>阅读区与输入框布局验证。这里不包含用户聊天内容。</p>','<p>Reading column</p><div data-d-component="table"><div class="table-viewport" data-d-table-viewport="true"><table><tbody><tr><td>Wide table</td><td>Second column</td></tr></tbody></table></div></div><div id="unrelated-paint"></div>');
  await setFixture(page,html);await install(page);
  const check=await page.evaluate(()=>{
   const frame=document.querySelector('[data-d-component="table"]'),viewport=frame.firstElementChild,table=viewport.firstElementChild;
   const r=e=>e.getBoundingClientRect();viewport.scrollLeft=0;
   const leftDelta=r(table).left-r(frame).left;viewport.scrollLeft=120;
   return {paint:getComputedStyle(document.querySelector('#footer-paint')).backgroundColor,unrelated:getComputedStyle(document.querySelector('#unrelated-paint')).backgroundColor,body:getComputedStyle(document.querySelector('[data-composer-body]')).backgroundColor,padding:getComputedStyle(viewport).paddingLeft,leftDelta,scrollable:viewport.scrollWidth>viewport.clientWidth,scroll:viewport.scrollLeft};
  });
  assert.equal(check.paint,'rgba(0, 0, 0, 0)');assert.equal(check.unrelated,'rgb(24, 24, 24)');assert.equal(check.body,'rgb(41, 36, 46)');
  assert.equal(check.padding,'0px');assert(Math.abs(check.leftDelta)<1);assert(check.scrollable&&check.scroll>0);
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
  assert.equal(await page.locator('#footer-paint').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(24, 24, 24)');
  assert.equal(await page.locator('.table-viewport').evaluate(e=>getComputedStyle(e).paddingLeft),'152px');
  results.push({test:mode+' new footer paint and nested table viewport; scroll and native restoration',passed:true});
 }
 // Native footer backgrounds also live outside the composer host, inside a
 // sibling transcript spacer. Their fade must not leave a dark horizontal edge.
 for(const mode of ['chat','work']){
  const html=fixture(mode).replace('<footer data-thread-scroll-footer="true">','<div id="transcript-paint-spacer"><div id="sibling-fade" class="_background_18hic_2 _fade_18hic_2 pointer-events-none absolute z-0"></div><div id="sibling-surface" class="_background_18hic_2 _surface_18hic_2 pointer-events-none absolute z-0"></div><div id="unrelated-sibling" class="pointer-events-none absolute inset-x-0 z-0"></div></div><footer data-thread-scroll-footer="true">')
   .replace('</style>','#transcript-paint-spacer{position:absolute;left:0;right:0;bottom:32px;height:112px}#sibling-fade,#sibling-surface,#unrelated-sibling{position:absolute;left:0;right:0;pointer-events:none;z-index:0}#sibling-fade,#unrelated-sibling{top:-32px;height:32px;background:linear-gradient(to top,rgb(24,24,24),transparent)}#sibling-surface{top:0;bottom:-32px;background:rgb(24,24,24)}</style>');
  await setFixture(page,html.replace('<div id="transcript-paint-spacer">','<div class="transcript-paint-branch"><div id="transcript-paint-spacer">').replace('</div></div><footer data-thread-scroll-footer','</div></div></div><footer data-thread-scroll-footer'));await install(page);
  const before=await page.locator('[data-composer-body]').boundingBox();
  for(const height of [112,220]){
   await page.evaluate(height=>{document.querySelector('[data-composer-body]').style.height=height+'px';document.querySelector('#transcript-paint-spacer').style.height=(height+2)+'px';window.__BOCCHI_THEME__.refresh();},height);
   const s=await settle(page);
   assert.equal(await page.locator('#sibling-fade').evaluate(e=>getComputedStyle(e).backgroundImage),'none');
   assert.equal(await page.locator('#sibling-surface').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
   assert.notEqual(await page.locator('#unrelated-sibling').evaluate(e=>getComputedStyle(e).backgroundImage),'none');
   assert.equal(await page.locator('[data-composer-body]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(41, 36, 46)');
   assert(s.readerClip.boundary<=await page.locator('footer').evaluate(e=>e.getBoundingClientRect().top)+1);
   const r=await page.locator('[data-composer-body]').boundingBox();assert.equal(r.x,before.x);assert.equal(r.width,before.width);
  }
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
  assert.notEqual(await page.locator('#sibling-fade').evaluate(e=>getComputedStyle(e).backgroundImage),'none');
  assert.equal(await page.locator('#sibling-surface').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(24, 24, 24)');
  assert.equal(await page.locator('#sibling-fade').getAttribute('style'),'');
  assert.equal(await page.locator('#sibling-fade').getAttribute('data-bocchi-native-fade'),null);
  results.push({test:mode+' sibling transcript footer paint cleared, unrelated gradient preserved and pause restores native paint',passed:true});
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
