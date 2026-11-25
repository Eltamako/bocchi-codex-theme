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
const homeBaseline=process.env.BOCCHI_HOME_BASELINE?await fs.readFile(process.env.BOCCHI_HOME_BASELINE,'utf8'):null;
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
function currentHomeLayout(mode,{project=false,workRoot=false}={}){
 const composerRoot=workRoot?'data-codex-composer-root data-composer-placement="home"':'';
 return homeLayout(mode,project)
  .replace(/<button aria-pressed="(true|false)">Chat<\/button>/,'<button class="col-start-1" aria-pressed="$1">聊天</button>')
  .replace(/<button aria-pressed="(true|false)">Work<\/button>/,'<button class="col-start-2" aria-pressed="$1">工作</button>')
  .replace(' data-codex-composer="true"','')
  .replace('aria-label="Ask ChatGPT"','aria-label="编辑内容"')
  .replace(' data-pip-anchor-host="codex-main-thread"','')
  .replace('<footer data-thread-scroll-footer="true"><div class="mx-auto max-w-chat" data-pip-obstacle="thread-footer"><div data-codex-composer-root data-composer-placement="thread">',
   '<footer><div id="native-home-column" class="mx-auto w-[min(100%,var(--thread-content-max-width))]"><div '+composerRoot+'>')
  .replace('</style>','#native-home-column{width:min(100%,672px)}</style>');
}
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const freshHome=currentHomeLayout('work');
 if(homeBaseline){
  await setFixture(page,freshHome);
  assert.equal((await install(page,{},homeBaseline)).reason,'unknown-mode');
  await setFixture(page,freshHome);
  await page.locator('[data-composer-markdown]').evaluate(el=>el.setAttribute('data-codex-composer','true'));
  assert.equal((await install(page,{},homeBaseline)).reason,'unknown-column-owner');
 }
 await setFixture(page,freshHome);
 const home=await install(page,{initialWallpaperId:'winter-night'});
 assert(home.ready&&home.starryVisible&&home.homeGreetingAligned&&home.homeModeAligned);
 assert.deepEqual([home.mode,home.modeSource,home.reader],['work','home-toggle',false]);
 assert.equal(await page.locator('#native-home-column[data-bocchi-column]').count(),1);
 assert.equal(await page.locator('#unrelated-header[data-bocchi-home-mode]').count(),0);
 results.push({test:'26.1120 Work home loads on a shared editor with a native toggle and a home width wrapper',passed:true});
 const modeSwitch=()=>page.evaluate(()=>{
  const chat=document.querySelector('.mode-group .col-start-1'),work=document.querySelector('.mode-group .col-start-2');
  chat.setAttribute('aria-pressed',String(chat.getAttribute('aria-pressed')==='false'));
  work.setAttribute('aria-pressed',String(work.getAttribute('aria-pressed')==='false'));
 });
 for(const next of ['chat','work']){
  await modeSwitch();
  await page.waitForFunction(value=>window.__BOCCHI_THEME__?.state.mode===value,next,{timeout:4000});
  assert.equal((await settle(page,'winter-night')).modeSource,'home-toggle');
 }
 await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
 assert.equal(await page.locator('#native-home-column[data-bocchi-column]').count(),0);
 results.push({test:'26.1120 shared home editor follows Chat and Work toggles in place and restores native layout',passed:true});
 await setFixture(page,currentHomeLayout('work',{project:true,workRoot:true}));
 assert.deepEqual([(await install(page)).modeSource,await page.locator('#native-home-column[data-bocchi-column]').count()],['work-home-composer',1]);
 results.push({test:'26.1120 Work project home recognizes its explicit composer without a header toggle',passed:true});
 await setFixture(page,fixture('work').replace(' data-codex-composer="true"','').replace('aria-label="Ask ChatGPT"','aria-label="编辑内容"'));
 const workThread=await install(page);
 assert.deepEqual([workThread.mode,workThread.modeSource,workThread.reader],['work','work-thread-composer',true]);
 results.push({test:'26.1120 Work thread uses its verified local reader and composer shell during editor remount',passed:true});
 await setFixture(page,freshHome);
 await page.locator('.mode-group .col-start-1').evaluate(el=>el.setAttribute('aria-pressed','true'));
 assert.equal((await install(page)).reason,'unknown-mode');
 results.push({test:'26.1120 ambiguous native home mode leaves the page untouched',passed:true});
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
 // The 26.1111 Windows shell gives the top fade its own radii and can
 // blur the native composer surface. Check the theme against both changes.
 const nativeShell=fixture('work')
  .replace('<main data-app-shell-main-surface="default">','<main data-app-shell-main-surface="default" class="MainContentSurface-EnuIYE">')
  .replace('<header data-app-shell-titlebar="true">','<div class="MainContentTopFade-T6W4RS" style="height:12px;background-image:linear-gradient(black,transparent)"></div><header data-app-shell-titlebar="true">')
  .replace('<footer data-thread-scroll-footer="true">','<footer data-thread-scroll-footer="true" data-thread-composer-backdrop>')
  .replace('data-codex-composer-root data-composer-placement="thread"','class="ComposerLayoutRoot-XCKS7O" data-composer-surface-variant="default" data-codex-composer-root data-composer-placement="thread"')
  .replace('</style>',`
    :root{--radius-xl-base:16px;--composer-layout-surface-background:#303030}
    .MainContentSurface-EnuIYE,.MainContentTopFade-T6W4RS{border-start-start-radius:var(--radius-xl-base);border-start-end-radius:var(--radius-xl-base)}
    [data-app-shell-page-sidebar=true] :is(.MainContentSurface-EnuIYE,.MainContentTopFade-T6W4RS){border-start-start-radius:0}
    .MainContentTopFade-T6W4RS{position:absolute;inset:0 0 auto;pointer-events:none;z-index:20}
    .ComposerLayoutRoot-XCKS7O{--composer-layout-surface-fill:var(--composer-layout-surface-background);--composer-layout-surface-backdrop-filter:none;display:flex;flex-direction:column;position:relative}
    [data-thread-composer-backdrop] .ComposerLayoutRoot-XCKS7O[data-composer-surface-variant=default]{--composer-layout-surface-fill:color-mix(in srgb,var(--composer-layout-surface-background) 95%,transparent);--composer-layout-surface-backdrop-filter:blur(12px)}
    .ComposerLayoutRoot-XCKS7O{background-color:var(--composer-layout-surface-fill);backdrop-filter:var(--composer-layout-surface-backdrop-filter)}
  </style>`);
 for(const sidebar of [false,true]){
  await setFixture(page,nativeShell.replace('data-app-shell-active-page="true"',`data-app-shell-active-page="true" data-app-shell-page-sidebar="${sidebar}"`));
  const readNative=()=>page.evaluate(()=>{
   const top=getComputedStyle(document.querySelector('.MainContentTopFade-T6W4RS'));
   const composer=getComputedStyle(document.querySelector('.ComposerLayoutRoot-XCKS7O'));
   const main=getComputedStyle(document.querySelector('main'));
   const wallpaper=document.querySelector('.bocchi-backdrop');
   return {topPaint:top.backgroundImage,composerFill:composer.backgroundColor,filter:composer.backdropFilter,
    corners:[main.borderTopLeftRadius,main.borderTopRightRadius],
    wallpaperCorners:wallpaper?[getComputedStyle(wallpaper).borderTopLeftRadius,getComputedStyle(wallpaper).borderTopRightRadius]:null};
  });
  const before=await readNative();
  assert.deepEqual(before.corners,[sidebar?'0px':'16px','16px']);
  assert.notEqual(before.topPaint,'none');assert.equal(before.filter,'blur(12px)');
  await install(page);
  const themed=await readNative();
  assert.equal(await page.locator('.ComposerLayoutRoot-XCKS7O[data-bocchi-composer]').count(),1);
  assert.equal(themed.topPaint,'none');
  assert.equal(themed.composerFill,'rgb(41, 36, 46)');
  assert.deepEqual(themed.wallpaperCorners,before.corners);
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
  assert.equal(await page.locator('[data-bocchi-native-fade],[data-bocchi-composer]').count(),0);
  assert.deepEqual(await readNative(),before);
 }
 results.push({test:'26.1111 native corners, top fade and composer paint before, during and after theming',passed:true});
 // The 26.1117 page header has a native sticky ::before fill, rather than a separate top fade.
 for(const mode of ['chat','work'])for(const sidebar of [false,true]){
  const stickyShell=fixture(mode)
   .replace('<div data-app-shell-active-page="true">',`<div data-app-shell-active-page="true" data-app-shell-frame data-app-shell-page-sidebar="${sidebar}" data-app-shell-page-surface="true">`)
   .replace('<section data-app-shell-focus-area="main">','<section data-app-shell-focus-area="main"><div id="native-sticky-header" class="shell-yWQKe6" data-sticky>Sticky header</div>')
   .replace('</section></main>','</section><div data-app-shell-focus-area="right-panel" style="position:absolute;top:0;right:0;width:80px;height:32px"><div id="unrelated-sticky" class="shell-yWQKe6" data-sticky>Panel</div></div></main>')
   .replace('</style>',`
    :root{--color-surface:#26313a;--radius-xl-base:16px;--spacing:.25rem}
    [data-app-shell-main-surface=default]{border-start-start-radius:var(--radius-xl-base);border-start-end-radius:var(--radius-xl-base)}
    [data-app-shell-frame][data-app-shell-page-sidebar=true] [data-app-shell-main-surface=default]{border-start-start-radius:0}
    .shell-yWQKe6[data-sticky]{position:sticky;top:calc(var(--spacing) * -4);z-index:30;height:32px}
    .shell-yWQKe6[data-sticky]::before{content:"";pointer-events:none;z-index:-1;inset-inline:0;inset-block:var(--header-background-top-inset,0px) 0;background-color:var(--color-surface);position:absolute}
    [data-app-shell-frame][data-app-shell-page-surface=true] [data-app-shell-main-surface=default] .shell-yWQKe6[data-sticky]::before{border-start-start-radius:var(--radius-xl-base);border-start-end-radius:var(--radius-xl-base)}
    [data-app-shell-frame][data-app-shell-page-sidebar=true] [data-app-shell-main-surface=default] .shell-yWQKe6[data-sticky]::before{border-start-start-radius:0}
   </style>`);
  await setFixture(page,stickyShell);
  const readSticky=()=>page.evaluate(()=>{
   const el=document.querySelector('#native-sticky-header'),header=getComputedStyle(el),paint=getComputedStyle(el,'::before');
   const main=getComputedStyle(document.querySelector('main')),panel=getComputedStyle(document.querySelector('#unrelated-sticky'),'::before');
   const backdrop=document.querySelector('.bocchi-backdrop');
   return {paint:paint.backgroundColor,panel:panel.backgroundColor,main:main.backgroundColor,
    mainCorners:[main.borderTopLeftRadius,main.borderTopRightRadius],
    corners:[paint.borderTopLeftRadius,paint.borderTopRightRadius],position:header.position,top:header.top,pointerEvents:paint.pointerEvents,
    backdropCorners:backdrop?[getComputedStyle(backdrop).borderTopLeftRadius,getComputedStyle(backdrop).borderTopRightRadius]:null};
  });
  const before=await readSticky();assert.equal(before.paint,'rgb(38, 49, 58)');assert.deepEqual(before.corners,[sidebar?'0px':'16px','16px']);
  await install(page);const themed=await readSticky();
  assert.equal(await page.locator('[data-bocchi-native-sticky-header]').count(),1);
  assert.notEqual(themed.paint,before.paint);assert.equal(themed.paint,themed.main);assert.equal(themed.panel,before.panel);
  assert.deepEqual(themed.corners,before.corners);assert.deepEqual(themed.backdropCorners,before.mainCorners);
  for(const key of ['position','top','pointerEvents'])assert.equal(themed[key],before[key]);
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
  assert.equal(await page.locator('[data-bocchi-native-sticky-header]').count(),0);assert.deepEqual(await readSticky(),before);
 }
 results.push({test:'26.1117 sticky header paint and corners in Chat and Work; panel isolation and cleanup',passed:true});
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
  await page.evaluate(mode=>{
   window.fixtureTheme=window.__BOCCHI_THEME__;window.fixturePlate=document.querySelector('.bocchi-backdrop');
   window.fixtureBody=document.querySelector('[data-composer-body]');window.fixtureParent=fixtureBody.parentElement;
   const preview=document.createElement('div');preview.id='fixture-preview';preview.className='chrome-cYKtGk';preview.role='dialog';
   preview.style.cssText='position:fixed;inset:0;z-index:100;background:transparent';preview.innerHTML='<div data-image-preview-toolbar></div>';
   if(mode==='chat'){
    preview.append(fixtureBody.cloneNode(true));fixtureBody.remove();
   }else preview.append(fixtureBody);
   document.body.append(preview);document.documentElement.classList.add('active-ylqTkR','opening-aO53eV');fixtureTheme.refresh();
  },mode);
  await page.waitForTimeout(1200);
  assert.deepEqual(await page.evaluate(()=>({installed:fixtureTheme.state.installed,preview:fixtureTheme.state.imagePreview,same:fixturePlate===document.querySelector('.bocchi-backdrop')})),{installed:true,preview:true,same:true});
  if(mode==='chat'){
   await page.evaluate(()=>{
    document.documentElement.classList.replace('opening-aO53eV','closing-fIQWrc');
    document.querySelector('#fixture-preview').remove();fixtureTheme.refresh();
   });
   assert.deepEqual(await page.evaluate(()=>[fixtureTheme.state.imagePreview,fixturePlate===document.querySelector('.bocchi-backdrop')]),[true,true]);
   results.push({test:'26.1029 Chat replacement composer and closing image transition retain the same wallpaper',passed:true});
  }
  await page.evaluate(()=>{fixtureParent.append(fixtureBody);document.querySelector('#fixture-preview')?.remove();document.documentElement.classList.remove('closing-fIQWrc');document.documentElement.classList.remove('active-ylqTkR','opening-aO53eV');fixtureTheme.refresh();});
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
 // Codex home has a project/computer toolbar above the editor. It belongs to
 // the same width owner, but can sit outside the composer body/root.
 for(const project of [false,true]){
  let html=homeLayout('work',true)
   .replace('<h1>What should we do in this project?</h1>',`<svg id="native-codex-icon" width="44" height="44" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="currentColor"/></svg><h1>${project?'What should we build in this project?':'What should we build?'}</h1>`)
   .replace('<div data-codex-composer-root', '<div id="home-tools"><button>Select project</button><button>This computer</button></div><div data-codex-composer-root')
   .replace('</style>','#home-tools{height:40px;background:#262626;border-radius:16px 16px 0 0;padding:8px}#home-tools button{margin-right:12px}</style>');
  await setFixture(page,html);
  if(project)await page.locator('[data-pip-obstacle]').evaluate(el=>el.removeAttribute('data-pip-obstacle'));
  const bodyBefore=await page.locator('[data-composer-body]').boundingBox();
  const s=await install(page);assert(s.emptySticker);assert.equal(s.homeModeAligned,false);
  const assertCodexHome=async()=>{
   const geometry=await page.evaluate(()=>{
    const bounds=s=>document.querySelector(s).getBoundingClientRect();
    const sticker=bounds('.bocchi-empty-sticker'),tools=bounds('#home-tools'),body=bounds('[data-composer-body]'),icon=document.querySelector('#native-codex-icon');
    return {gap:tools.top-sticker.bottom,centerDelta:sticker.x+sticker.width/2-body.x-body.width/2,iconVisible:getComputedStyle(icon).visibility!=='hidden'&&icon.getBoundingClientRect().height===44};
   });
   assert(geometry.gap>=12,'Box Bocchi must clear the project/computer toolbar');
   assert(Math.abs(geometry.centerDelta)<1);assert(geometry.iconVisible,'Keep the native Codex icon');
  };
  await assertCodexHome();
  assert.equal((await page.locator('[data-composer-body]').boundingBox()).y,bodyBefore.y,'Do not move the composer');
  await page.screenshot({path:path.join(out,`codex-home-${project?'project':'global'}.png`)});
  await page.locator('#home-tools').evaluate(el=>el.style.height='76px');
  await page.evaluate(()=>window.__BOCCHI_THEME__.refresh());await settle(page);await assertCodexHome();
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
  assert.equal(await page.locator('#native-codex-icon').count(),1);
  assert.equal(await page.locator('[data-bocchi-home-raised]').count(),0);
  results.push({test:`Codex ${project?'project':'global'} home mascot clears toolbar; native icon preserved`,passed:true});
 }
 for(const viewport of [{width:1280,height:560},{width:1280,height:800},{width:1920,height:1080},{width:800,height:600}]){
  await page.setViewportSize(viewport);
  const html=homeLayout('work',true)
   .replace('<div data-codex-composer-root','<div id="home-tools"><button>Select project</button><button>This computer</button></div><div data-codex-composer-root')
   .replace('</style>','main{height:100vh}section{height:calc(100% - 56px)}footer{top:auto;bottom:24px}#home-tools{height:40px;padding:8px;background:#262626}</style>');
  await setFixture(page,html);
  const native=await page.locator('[data-composer-body]').boundingBox();
  const s=await install(page);assert(s.emptySticker);
  const geometry=await page.evaluate(()=>{
   const b=s=>document.querySelector(s).getBoundingClientRect();
   return{body:b('[data-composer-body]').toJSON(),greeting:b('.home-greeting').toJSON(),sticker:b('.bocchi-empty-sticker').toJSON(),toolbar:b('#home-tools').toJSON()};
  });
  const lift=native.y-geometry.body.y;
  assert(lift>0&&lift<=96.1,'Lift the low home by a bounded amount');
  assert(Math.abs(geometry.body.height-native.height)<.1,'Keep composer size');
  assert(geometry.toolbar.top-geometry.sticker.bottom>=12);
  assert(geometry.sticker.top-geometry.greeting.bottom>=12);
  assert(geometry.greeting.top>=68,'Small-window header clearance');
  await page.evaluate(()=>window.__BOCCHI_THEME__.refresh());await settle(page);
  assert(Math.abs((await page.locator('[data-composer-body]').boundingBox()).y-geometry.body.y)<.1,'Repeated refresh must not accumulate the lift');
  assert.deepEqual((await page.evaluate(()=>window.__BOCCHI_THEME__.state.artBounds)),s.artBounds,'Keep wallpaper framing');
  // Opening the native project/environment menu must not move its anchor.
  // Decorations still yield to the menu, and return in the same place on close.
  await page.evaluate(()=>{
   const menu=document.createElement('div');menu.id='native-project-menu';menu.role='menu';menu.textContent='Fixture project menu';
   Object.assign(menu.style,{position:'fixed',left:'10px',top:'80px',width:'180px',height:'80px'});
   document.body.append(menu);window.__BOCCHI_THEME__.refresh();
  });await settle(page);
  assert.equal(await page.locator('.bocchi-empty-sticker').count(),0,'Hide the decorative mascot while a native menu is open');
  for(const [selector,before] of [['[data-composer-body]',geometry.body],['.home-greeting',geometry.greeting],['#home-tools',geometry.toolbar]]){
   const now=await page.locator(selector).boundingBox();
   assert(Math.abs(now.y-before.y)<.1&&Math.abs(now.x-before.x)<.1,selector+' moved when the native menu opened');
  }
  assert.deepEqual((await page.evaluate(()=>window.__BOCCHI_THEME__.state.artBounds)),s.artBounds,'Menu must not move wallpaper characters');
  await page.evaluate(()=>{document.querySelector('#native-project-menu').remove();window.__BOCCHI_THEME__.refresh();});await settle(page);
  assert.equal(await page.locator('.bocchi-empty-sticker').count(),1);
  for(const [selector,before] of [['[data-composer-body]',geometry.body],['.home-greeting',geometry.greeting],['#home-tools',geometry.toolbar],['.bocchi-empty-sticker',geometry.sticker]]){
   const now=await page.locator(selector).boundingBox();
   assert(Math.abs(now.y-before.y)<.1&&Math.abs(now.x-before.x)<.1,selector+' moved after the native menu closed');
  }
  await page.screenshot({path:path.join(out,`home-lift-${viewport.width}x${viewport.height}.png`)});
  // Native navigation can keep the same composer column and add a reader.
  await page.evaluate(()=>{
   document.querySelector('.home-hero').remove();
   const reader=document.createElement('div');reader.className='reader mx-auto max-w-chat';
   reader.setAttribute('data-thread-user-message-navigation-content','true');reader.setAttribute('data-mcp-app-portal-target','true');
   reader.innerHTML='<p data-markdown-text-style="assistant-message">Fixture response</p>';
   document.querySelector('.thread-scroll-container').prepend(reader);window.__BOCCHI_THEME__.refresh();
  });await settle(page);
  assert.equal((await page.locator('[data-composer-body]').boundingBox()).y,native.y,'Conversation restores the native footer position');
  assert.equal(await page.locator('.bocchi-empty-sticker').count(),0);
  const clip=await page.evaluate(()=>({boundary:window.__BOCCHI_THEME__.state.readerClip.boundary,footer:document.querySelector('[data-thread-scroll-footer]').getBoundingClientRect().top}));
  assert(Math.abs(clip.boundary-clip.footer)<1,'Conversation clipping follows the restored footer');
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
  assert.equal(await page.locator('[data-pip-obstacle]').evaluate(el=>el.style.translate),'');
  results.push({test:`low home group lifted at ${viewport.width}x${viewport.height}; native menu stable; navigation and cleanup restore composer`,passed:true});
 }
 await page.setViewportSize({width:1440,height:900});
 for(const mode of ['chat','work']){
  let html=fixture(mode).replace('<footer data-thread-scroll-footer="true">','<footer data-thread-scroll-footer="true"><div id="footer-paint" class="background-uNUrfY surface-nr8PSS pointer-events-none absolute z-0 bottom-0 bg-surface"></div>')
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
  const html=fixture(mode).replace('<footer data-thread-scroll-footer="true">','<div id="transcript-paint-spacer"><div id="sibling-fade" class="background-uNUrfY fade-AcMqqj pointer-events-none absolute z-0"></div><div id="sibling-surface" class="background-uNUrfY surface-nr8PSS pointer-events-none absolute z-0"></div><div id="unrelated-sibling" class="pointer-events-none absolute inset-x-0 z-0"></div></div><footer data-thread-scroll-footer="true">')
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
 // Native 26.1117 paints the header fade with a utility class and can use a
 // single tall footer gradient. Neither is part of the wallpaper raster.
 for(const mode of ['chat','work']){
  const topClass='pointer-events-none absolute inset-x-0 top-0 z-20 bg-[image:var(--app-shell-content-fade,linear-gradient(to_bottom,currentColor,transparent))] text-surface browser:hidden';
  const footerClass='background-uNUrfY combined-vZM0uN pointer-events-none absolute z-0 inset-x-0 bottom-0';
  const html=fixture(mode)
   .replace('<main data-app-shell-main-surface="default">','<main data-app-shell-main-surface="default"><div id="native-top-line" aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-toolbar -z-10 -mt-px border-t border-default"></div>')
   .replace('<section data-app-shell-focus-area="main">','<section id="native-content-frame" data-app-shell-focus-area="main" class="@container/app-shell-main-content border-t-[0.5px] border-strong"><div id="native-content-fade" aria-hidden="true" class="'+topClass+'"></div>')
   .replace('<footer data-thread-scroll-footer="true">','<div id="native-combined-footer" aria-hidden="true" class="'+footerClass+'"></div><div id="unrelated-gradient"></div><footer data-thread-scroll-footer="true">')
   .replace('</section></main>','</section><div id="edge-unrelated-panel" data-app-shell-focus-area="right-panel"><div id="panel-top-fade" aria-hidden="true" class="'+topClass+'"></div><div class="thread-scroll-container"><div id="panel-combined-footer" aria-hidden="true" class="'+footerClass+'"></div></div></div></main>')
   .replace('</style>',`
    #native-top-line{position:absolute;left:0;right:0;top:55px;z-index:-10;border-top:1px solid #171717;pointer-events:none}
    #native-content-frame{border-top:.5px solid #171717}
    #native-content-fade,#panel-top-fade{position:absolute;inset:0 0 auto;height:28px;z-index:20;background-image:linear-gradient(to bottom,#181818,transparent);pointer-events:none}
    #native-combined-footer,#panel-combined-footer{position:absolute;left:0;right:14px;bottom:0;height:196px;background-image:linear-gradient(to top,#181818 78%,transparent);pointer-events:none;z-index:0}
    #edge-unrelated-panel{position:absolute;top:80px;right:0;width:80px;height:32px}
    #panel-combined-footer{height:24px}
    #unrelated-gradient{position:absolute;left:30px;right:30px;top:100px;height:30px;background-image:linear-gradient(to top,#181818,transparent)}
   </style>`);
  const readEdge=()=>page.evaluate(()=>{
   const paint=id=>getComputedStyle(document.getElementById(id)),r=document.querySelector('#native-combined-footer').getBoundingClientRect();
   return {top:paint('native-content-fade').backgroundImage,bottom:paint('native-combined-footer').backgroundImage,line:paint('native-top-line').borderTopColor,frame:paint('native-content-frame').borderTopColor,
    unrelated:[paint('panel-top-fade').backgroundImage,paint('panel-combined-footer').backgroundImage,paint('unrelated-gradient').backgroundImage],
    combinedRect:[r.x,r.y,r.width,r.height],composer:getComputedStyle(document.querySelector('[data-composer-body]')).backgroundColor};
  });
  await setFixture(page,html);const native=await readEdge();assert.notEqual(native.top,'none');assert.notEqual(native.bottom,'none');
  let oldState=null,oldPaint=null;
  if(baseline){
   oldState=await install(page,{initialWallpaperId:'winter-night'},baseline);oldPaint=await readEdge();
   assert.notEqual(oldPaint.top,'none','Old renderer should reproduce the top paint');assert.notEqual(oldPaint.bottom,'none','Old renderer should reproduce the tall bottom paint');
   await page.screenshot({path:path.join(out,'edge-seams-before-'+mode+'.png')});
   await page.evaluate(()=>window.__BOCCHI_THEME__.remove());await setFixture(page,html);
  }
  const themed=await install(page,{initialWallpaperId:'winter-night'}),after=await readEdge();
  assert.deepEqual(themed.edgePaint,{revision:'20261122-seams-2',topFades:1,topDividers:2,combinedFooters:1,footerShells:0,footerPseudoClear:false});
  assert.equal(after.top,'none');assert.equal(after.bottom,'none');assert.equal(after.line,'rgba(0, 0, 0, 0)');assert.equal(after.frame,'rgba(0, 0, 0, 0)');
  assert.deepEqual(after.unrelated,native.unrelated);assert.equal(after.composer,'rgb(41, 36, 46)');
  if(oldState){
   assert.deepEqual(themed.artBounds,oldState.artBounds);assert.deepEqual(themed.backgroundRegion,oldState.backgroundRegion);
   assert.deepEqual(after.combinedRect,oldPaint.combinedRect);
  }
  await page.screenshot({path:path.join(out,'edge-seams-after-'+mode+'.png')});
  await page.evaluate(()=>{document.querySelector('[data-composer-body]').style.height='220px';document.querySelector('#native-combined-footer').style.height='300px';window.__BOCCHI_THEME__.refresh();});
  const grown=await settle(page,'winter-night');assert.equal(grown.edgePaint.combinedFooters,1);assert.equal((await readEdge()).bottom,'none');
  assert(grown.readerClip.boundary<=await page.locator('footer').evaluate(e=>e.getBoundingClientRect().top)+1);
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
  const restored=await readEdge();
  for(const key of ['top','bottom','line','frame','unrelated'])assert.deepEqual(restored[key],native[key]);
  assert.equal(await page.locator('[data-bocchi-native-fade],[data-bocchi-native-top-divider]').count(),0);
  results.push({test:mode+' 26.1117 native top divider/fade and tall combined footer seam; geometry, unrelated panes and restore',passed:true});
 }
 // The actual docked Work/Chat footer uses anchored ::before/::after;
 // do not remove the host or the pseudo boxes themselves.
 for(const mode of ['chat','work']){
  const shellClass='footer-A8ZvKV shiftWithTranscript-HwFV6s pointer-events-none absolute inset-x-0 z-20 bottom-0';
  const html=fixture(mode)
   .replace('<footer data-thread-scroll-footer="true">','<div id="native-docked-shell" class="'+shellClass+'"><footer data-thread-scroll-footer="true">')
   .replace('data-pip-obstacle="thread-footer"','data-pip-obstacle="thread-footer" data-thread-composer-backdrop="true"')
   .replace('</footer></div></section>','</footer></div></div></section>')
   .replace('</section></main>','</section><div id="other-panel" data-app-shell-focus-area="right-panel"><div id="other-docked-shell" class="'+shellClass+'"></div></div></main>')
   .replace('</style>',`
     #native-docked-shell{position:absolute;left:0;right:0;bottom:0;height:148px;pointer-events:none;z-index:20}
     #native-docked-shell>footer{position:relative;bottom:auto;height:132px;z-index:10;pointer-events:auto}
     #native-docked-shell:has([data-thread-composer-backdrop] [data-composer-body])::before,
     #native-docked-shell:has([data-thread-composer-backdrop] [data-composer-body])::after,
     #other-docked-shell::before,#other-docked-shell::after{content:"";position:absolute;left:0;right:14px;pointer-events:none}
     #native-docked-shell::before,#other-docked-shell::before{top:40px;bottom:16px;background:linear-gradient(to bottom,transparent,#181818 calc(100% - 24px))}
     #native-docked-shell::after,#other-docked-shell::after{top:calc(100% - 16px);bottom:0;background:oklab(.209035 .00001 .000004)}
     #other-panel{position:absolute;top:200px;right:0;width:80px;height:50px}
     #other-docked-shell{position:absolute;inset:0}
   </style>`);
  const readPseudo=()=>page.evaluate(()=>{
   const el=document.getElementById('native-docked-shell'),r=el.getBoundingClientRect();
   const item=(node,pseudo)=>{const s=getComputedStyle(node,pseudo);return {paint:[s.backgroundImage,s.backgroundColor],geometry:[s.top,s.bottom,s.left,s.right,s.position,s.pointerEvents,s.content]};};
   return {before:item(el,'::before'),after:item(el,'::after'),
    unrelated:[item(document.getElementById('other-docked-shell'),'::before'),item(document.getElementById('other-docked-shell'),'::after')],rect:[r.x,r.y,r.width,r.height],
    composer:getComputedStyle(document.querySelector('[data-composer-body]')).backgroundColor};
  });
  await setFixture(page,html);const native=await readPseudo();
  assert.notEqual(native.before.paint[0],'none');assert.notEqual(native.after.paint[1],'rgba(0, 0, 0, 0)');
  let oldState=null,oldPaint=null;
  if(baseline){
   oldState=await install(page,{initialWallpaperId:'winter-night'},baseline);oldPaint=await readPseudo();
   assert.notEqual(oldPaint.before.paint[0],'none');assert.notEqual(oldPaint.after.paint[1],'rgba(0, 0, 0, 0)');
   await page.screenshot({path:path.join(out,'docked-footer-before-'+mode+'.png')});
   await page.evaluate(()=>window.__BOCCHI_THEME__.remove());await setFixture(page,html);
  }
  const themed=await install(page,{initialWallpaperId:'winter-night'}),after=await readPseudo();
  assert.equal(themed.edgePaint.footerShells,1);assert.equal(themed.edgePaint.footerPseudoClear,true);
  assert.deepEqual(after.before.paint,['none','rgba(0, 0, 0, 0)']);assert.deepEqual(after.after.paint,['none','rgba(0, 0, 0, 0)']);
  for(const key of ['before','after'])assert.deepEqual(after[key].geometry,native[key].geometry);
  assert.deepEqual(after.unrelated,native.unrelated);assert.equal(after.composer,'rgb(41, 36, 46)');
  if(oldState){assert.deepEqual(themed.artBounds,oldState.artBounds);assert.deepEqual(themed.backgroundRegion,oldState.backgroundRegion);assert.deepEqual(after.rect,oldPaint.rect);}
  await page.screenshot({path:path.join(out,'docked-footer-after-'+mode+'.png')});
  await page.evaluate(()=>{document.querySelector('[data-composer-body]').style.height='220px';document.querySelector('#native-docked-shell').style.height='268px';window.__BOCCHI_THEME__.refresh();});
  const grown=await settle(page,'winter-night');assert.equal(grown.edgePaint.footerPseudoClear,true);
  assert(grown.readerClip.boundary<=await page.locator('footer').evaluate(e=>e.getBoundingClientRect().top)+1);
  await page.evaluate(()=>window.__BOCCHI_THEME__.remove());
  const restored=await readPseudo();assert.deepEqual(restored.before.paint,native.before.paint);assert.deepEqual(restored.after.paint,native.after.paint);
  assert.equal(await page.locator('[data-bocchi-native-footer-pseudo]').count(),0);
  results.push({test:mode+' actual 26.1117 docked footer pseudo paint, anchored geometry, composer growth and native restore',passed:true});
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
