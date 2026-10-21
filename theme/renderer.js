async function installBocchiTheme({adapter, css, wallpaperCatalog, initialWallpaperId, selectionBridge, sticker, bandSticker, appVersion, leaseUntil, previewTopMode = "A+++", messages, language = "auto", systemLanguage = "en"}) {
  // This adapter is deliberately tied to the inspected desktop build.
  if (!adapter || adapter.schema !== 'bocchi-codex-adapter/1' || adapter.themeVersion !== '2.6.1' || appVersion !== adapter.appVersion)
    return {installed:false, reason:'version-mismatch'};
  if (!Number.isFinite(leaseUntil) || leaseUntil <= Date.now()) return {installed:false, reason:'expired-loader-lease'};
  if (typeof css !== 'string' || /@import\b|url\s*\(/i.test(css)) return {installed:false, reason:'nonlocal-stylesheet'};

  let stopped = false, timer = null, leaseTimer = null, observer = null, resize = null;
  let expiresAt = leaseUntil, sheet = null, backdrop = null, stage = null, side = null, inputDetails = null, api = null;
  let wallpaperUrl = null, stickerUrl = null, bandStickerUrl = null;
  const blobs = new Set(), nodes = new Set(), attrs = new Map(), props = new Map(), observed = new Set();
  let wantedAttrs = new Map(), wantedProps = new Map();
  let lastVerifiedContext=null, composerMissingSince=null;
  const environmentAnchors=new Map();
  let environmentAnchorKind='content';
  const root = document.documentElement;
  // This client ships both native palettes under [data-theme]. Borrow dark
  // presentation for this renderer only; never write the persisted app setting.
  let appearanceObserver=null,requestedAppearance=null;
  function rememberAppearance(){if(['light','dark'].includes(root.dataset.theme))requestedAppearance=root.dataset.theme;}
  function applyDarkAppearance(){
    if(root.dataset.theme==='dark')return;
    if(root.dataset.theme!=='light')throw new Error('unknown-appearance');
    rememberAppearance();appearanceObserver?.disconnect();root.dataset.theme='dark';
    appearanceObserver?.observe(root,{attributes:true,attributeFilter:['data-theme']});
    if(root.dataset.theme!=='dark')throw new Error('automatic-dark-appearance-failed');
  }
  function acquireAppearance(){
    rememberAppearance();
    appearanceObserver=new MutationObserver(()=>{
      if(stopped)return;
      rememberAppearance();
      try{if(!retainedImagePreview(true))inspect(true);applyDarkAppearance();}catch(error){remove(error?.message||'appearance-unavailable');}
    });
    appearanceObserver.observe(root,{attributes:true,attributeFilter:['data-theme']});
    applyDarkAppearance();
  }
  function releaseAppearance(){
    if(!appearanceObserver)return;
    if(appearanceObserver.takeRecords().length)rememberAppearance();
    appearanceObserver.disconnect();appearanceObserver=null;
    if(root.dataset.theme==='dark'&&requestedAppearance)root.dataset.theme=requestedAppearance;
    requestedAppearance=null;
  }
  if(messages?.schema!=='bocchi-messages/1'||!messages.en||!messages['zh-CN'])return {installed:false,reason:'missing-language-catalog'};
  let languagePreference=['auto','zh-CN','en'].includes(language)?language:'auto',uiLanguage=null;
  function resolveLanguage(){
    if(languagePreference!=='auto')return languagePreference;
    const value=(root.lang||systemLanguage||'en').toLowerCase();return /^zh(?:-|$)/.test(value)?'zh-CN':'en';
  }
  function t(key,...values){const text=messages[uiLanguage||resolveLanguage()]?.[key]??messages.en[key]??key;return text.replace(/\{(\d+)\}/g,(_,i)=>String(values[Number(i)]??''));}
  const wallpaperName=id=>t('wallpaper.'+id);
  function setLanguage(preference=languagePreference,fallback=systemLanguage){
    languagePreference=['auto','zh-CN','en'].includes(preference)?preference:'auto';systemLanguage=fallback;
    const next=resolveLanguage();if(next===uiLanguage)return;uiLanguage=next;state.language=next;
    if(control){signButton.setAttribute('aria-label','STARRY · '+t('picker.label'));picker.setAttribute('aria-label',t('picker.label'));updateChoices();if(notice)notice.hidden=true;}
  }
  // R16: bounded raster work, atomically committed. No user-facing API changes.
  const rasterJobs=new Set(),rasterRecords=new WeakMap(),rasterURLs=new Set();
  let fastFrame=null,clipFrame=null;
  // R18: resize animations only update lightweight layout. Pixel jobs start
  // after geometry settles; a complete prior scene remains right anchored.
  const deferredRasters=new Set(),deferredByOwner=new WeakMap();
  let rasterSlice=performance.now();
  function cancelDeferredRaster(owner,name){
    const jobs=deferredByOwner.get(owner),pending=jobs?.get(name);
    if(pending){clearTimeout(pending.timer);deferredRasters.delete(pending);jobs.delete(name);}
    state.rasterDeferred=deferredRasters.size;
  }
  function scheduleRaster(owner,name,key,paint,hasFrame){
    let jobs=deferredByOwner.get(owner);if(!jobs){jobs=new Map();deferredByOwner.set(owner,jobs);}
    if(jobs.get(name)?.key===key)return;
    cancelDeferredRaster(owner,name);
    const active=rasterRecords.get(owner)?.get(name);
    if(active?.key===key&&!active.cancelled)return;
    if(active)active.cancelled=true;
    if(!hasFrame){rasterJob(owner,name,key,paint);return;}
    const pending={key,owner,name,timer:null};jobs.set(name,pending);deferredRasters.add(pending);state.rasterDeferred=deferredRasters.size;
    pending.timer=setTimeout(()=>{
      if(jobs.get(name)!==pending)return;
      cancelDeferredRaster(owner,name);
      if(!stopped&&owner.isConnected)rasterJob(owner,name,key,paint);
    },90);
  }
  function rasterAlive(job){return !stopped&&!job.cancelled&&job.owner.isConnected&&(!job.scope||job.scope());}
  async function rasterYield(job){
    if(!rasterAlive(job))throw Error('raster-cancelled');
    if(job.slice===-Infinity||performance.now()-rasterSlice>=2){
      if(globalThis.scheduler?.yield)await globalThis.scheduler.yield();else await new Promise(r=>setTimeout(r,0));
      job.slice=rasterSlice=performance.now();if(!rasterAlive(job))throw Error('raster-cancelled');
    }
  }
  async function rasterURL(canvas,job){
    await rasterYield(job);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!rasterAlive(job))throw Error('raster-cancelled');
    if(!blob)throw Error('raster-encode-failed');
    const url=URL.createObjectURL(blob);blobs.add(url);rasterURLs.add(url);job.urls.add(url);return url;
  }
  function releaseRasterURL(url){URL.revokeObjectURL(url);blobs.delete(url);rasterURLs.delete(url);}
  function retainRasterURLs(owner,job){
    const used=new Set();
    for(const el of owner.querySelectorAll('.bocchi-ambience,.bocchi-art')){
      const text=el.style.backgroundImage+' '+el.style.maskImage;
      for(const match of text.matchAll(/blob:[^"')\s]+/g))if(rasterURLs.has(match[0]))used.add(match[0]);
    }
    for(const url of owner.__rasterURLs||[])if(!used.has(url))releaseRasterURL(url);
    owner.__rasterURLs=used;for(const url of used)job.urls.delete(url);
  }
  function rasterJob(owner,name,key,paint){
    let records=rasterRecords.get(owner);if(!records){records=new Map();rasterRecords.set(owner,records);}
    const previous=records.get(name);if(previous?.key===key&&!previous.cancelled)return;
    if(previous)previous.cancelled=true;
    const job={owner,name,key,cancelled:false,slice:performance.now(),urls:new Set()};records.set(name,job);rasterJobs.add(job);
    state.rasterPending=rasterJobs.size;
    job.promise=(async()=>{
      try{
        // Begin after layout/observer work has yielded back to the browser.
        job.slice=-Infinity;await rasterYield(job);
        const commit=await paint(job);
        if(job.frameCommit)await new Promise(resolve=>requestAnimationFrame(resolve));
        if(rasterAlive(job)&&records.get(name)===job){commit();job.done=true;}
      }catch(error){
        if(rasterAlive(job)&&error.message!=='raster-cancelled'){state.lastRasterError=String(error.message);records.delete(name);if(name==='background'&&owner===currentLayer)state.scenePending=false;}
      }finally{
        for(const url of job.urls)releaseRasterURL(url);
        rasterJobs.delete(job);state.rasterPending=rasterJobs.size;
      }
    })();
  }
  async function settleRasterJobs(){
    while(!stopped&&(rasterJobs.size||deferredRasters.size)){
      if(rasterJobs.size)await Promise.allSettled([...rasterJobs].map(j=>j.promise));
      else await new Promise(resolve=>setTimeout(resolve,16));
    }
  }
  function applyDitherFrame(owner,entry,key){
    const old=owner.__ditherEntry;
    for(const canvas of owner.querySelectorAll('.bocchi-output-dither')){
      nodes.delete(canvas);if(old)old.template.append(canvas);else canvas.remove();
    }
    for(const canvas of [...entry.template.children]){
      canvas.setAttribute('data-bocchi-owned','2');canvas.setAttribute('aria-hidden','true');canvas.inert=true;nodes.add(canvas);owner.append(canvas);
    }
    owner.__ditherEntry=entry;owner.__ditherKey=key;owner.__ditherState=entry.state;Object.assign(state.environmentCap,entry.state);
    clearTimeout(owner.__ditherCacheTimer);
    const promote=()=>{
      if(stopped||!owner.isConnected||owner.__ditherRequestedKey!==key||owner.__ditherEntry!==entry)return;
      owner.__ditherCache.delete(key);owner.__ditherCache.set(key,entry);
      while(owner.__ditherCache.size>2)owner.__ditherCache.delete(owner.__ditherCache.keys().next().value);
    };
    const wait=Math.max(0,80-(performance.now()-owner.__ditherChangedAt));
    if(wait)owner.__ditherCacheTimer=setTimeout(promote,wait);else promote();
  }
  function updateOutputDither(){
    const owner=backdrop,layer=currentLayer?.__layoutProbe||currentLayer,g=layer?.__revealGeometry;if(!owner||!g)return;
    const begin=layer.style.getPropertyValue('--scene-reveal-start'),end=layer.style.getPropertyValue('--scene-reveal-end');
    const solid=owner.style.getPropertyValue('--bocchi-read-solid'),clear=owner.style.getPropertyValue('--bocchi-read-clear');
    const key=JSON.stringify([g.regionWidth,g.regionHeight,begin,end,solid,clear,owner.dataset.readerDither,devicePixelRatio]);
    owner.__ditherCache??=new Map();
    if(owner.__ditherState)Object.assign(state.environmentCap,owner.__ditherState);
    if(owner.__ditherRequestedKey!==key){owner.__ditherRequestedKey=key;owner.__ditherChangedAt=performance.now();}
    if(owner.__ditherKey===key){cancelDeferredRaster(owner,'dither');const job=rasterRecords.get(owner)?.get('dither');if(job&&job.key!==key)job.cancelled=true;return;}
    const cached=owner.__ditherCache.get(key);
    if(cached){cancelDeferredRaster(owner,'dither');const records=rasterRecords.get(owner),job=records?.get('dither');if(job)job.cancelled=true;records?.delete('dither');applyDitherFrame(owner,cached,key);return;}
    scheduleRaster(owner,'dither',key,async job=>{
      job.scope=()=>owner===backdrop&&owner.__ditherRequestedKey===key;
      const draft=document.createElement('div');draft.style.cssText=owner.style.cssText;draft.dataset.readerDither=owner.dataset.readerDither;
      const snapshot={__revealGeometry:{...g},style:{getPropertyValue:name=>name==='--scene-reveal-start'?begin:end}};
      await paintOutputDither(draft,snapshot,job);
      return()=>applyDitherFrame(owner,{template:draft,state:draft.__ditherState},key);
    },!!owner.__ditherEntry);
  }

  const readerFadeNodes=new Set();
  const readerFadeProperties=['mask-image','mask-mode','mask-repeat','mask-size','mask-position','mask-origin','mask-clip','mask-composite'];
  function releaseReaderFade(el){
    const entries=props.get(el);
    for(const key of readerFadeProperties){const entry=entries?.get(key);if(entry){restoreProperty(el,key,entry);entries.delete(key);}wantedProps.get(el)?.delete(key);}
    if(entries&&!entries.size)props.delete(el);readerFadeNodes.delete(el);
  }
  function updateReaderFade(reader,boundary,area){
    const next=new Set(),length=Math.min(36,Math.max(0,(boundary-area.top)*.12)),start=boundary-length;
    // Fade only message fragments crossing the edge. The 40,000px transcript,
    // scroll viewport and composer never receive a mask or a backing image.
    const limit=Math.max(1024,area.height*1.5);
    const visit=el=>{
      if(el.matches('[data-bocchi-owned],[data-pip-obstacle="thread-footer"]'))return;
      const r=box(el);
      if(r.width&&r.height&&(r.bottom<=start||r.top>=boundary))return;
      if(r.width&&r.height&&(r.height<=limit||!el.children.length)){
        const own=readerFadeNodes.has(el),native=own?'none':getComputedStyle(el).maskImage;
        if(native==='none'){next.add(el);return;}
      }
      for(const child of el.children)visit(child);
    };
    if(length>0)for(const child of reader.children)visit(child);
    for(const el of [...readerFadeNodes])if(!next.has(el))releaseReaderFade(el);
    let maxHeight=0;
    for(const el of next){
      const r=box(el),pad=64,stops=['#000 0px'];
      for(let i=0;i<=12;i++){const t=i/12,alpha=1-r14Smooth(t),y=start-area.top+pad+length*t;stops.push('rgba(0,0,0,'+alpha.toFixed(6)+') '+y.toFixed(3)+'px');}
      stops.push('transparent 100%');
      property(el,'mask-image','linear-gradient(to bottom,'+stops.join(',')+')');
      property(el,'mask-mode','alpha');property(el,'mask-repeat','no-repeat');
      // A very tall unbroken paragraph still uses only a viewport-sized CSS
      // gradient, positioned in its own coordinates; never a 35,000px texture.
      property(el,'mask-size','calc(100% + 128px) '+(area.height+128).toFixed(3)+'px');
      property(el,'mask-position','-64px '+(area.top-r.top-pad).toFixed(3)+'px');
      property(el,'mask-origin','border-box');property(el,'mask-clip','no-clip');property(el,'mask-composite','add');
      readerFadeNodes.add(el);maxHeight=Math.max(maxHeight,r.height);
    }
    return{length,start,end:boundary,fragments:next.size,maxFragmentHeight:maxHeight,maskHeight:area.height+128,scope:'message-fragments'};
  }
  function updateReaderClip(ctx){
    const reader=ctx?.reader,obstacle=ctx?.body?.closest('[data-pip-obstacle="thread-footer"]');
    if(!reader||!reader.isConnected||!obstacle||reader.contains(obstacle)||!ctx.main.contains(obstacle)){
      for(const el of [...readerFadeNodes])releaseReaderFade(el);state.readerClip=null;return;
    }
    const footer=obstacle.closest('[data-thread-scroll-footer]')||obstacle;
    const r=box(reader),f=box(footer),boundary=Math.max(ctx.area.top,Math.min(ctx.area.bottom,f.top));
    const bottom=Math.max(0,Math.min(r.height,r.bottom-boundary));
    property(reader,'clip-path','inset(-100000px -10000px '+bottom.toFixed(3)+'px -10000px)');
    const fade=updateReaderFade(reader,boundary,ctx.area);
    state.readerClip={bottom,boundary,contentBottom:r.bottom,footerTop:f.top,fade};
  }

  function scheduleClip(){
    if(stopped||clipFrame!==null)return;
    clipFrame=requestAnimationFrame(()=>{clipFrame=null;const ctx=lastVerifiedContext;if(ctx?.page?.matches(adapter.activePage)&&ctx.main.isConnected&&!retainedImagePreview())updateReaderClip(ctx);});
  }
  function onThemeScroll(event){
    const ctx=lastVerifiedContext;
    if(!ctx||event.target===window.visualViewport||event.target===document||ctx.main.contains(event.target)){scheduleClip();schedule();}
  }
  function scheduleFast(){
    if(stopped||fastFrame!==null)return;clearTimeout(timer);timer=null;
    fastFrame=requestAnimationFrame(()=>{fastFrame=null;if(!stopped)refresh();});
  }

  const state = {installed:false, reason:'initializing', version:adapter.themeVersion, appVersion,
    validation:adapter.status||'pending-live-validation', imageLoaded:false, stickerLoaded:false};
  const visible = el => !!el && el.isConnected && el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  const box = el => el.getBoundingClientRect();
  const overlap = (a,b,gap=0) => a.left < b.right+gap && a.right > b.left-gap && a.top < b.bottom+gap && a.bottom > b.top-gap;
  const rect = (left,top,width,height) => ({left,top,width,height,right:left+width,bottom:top+height});
  const intersection = (a,b) => rect(Math.max(a.left,b.left),Math.max(a.top,b.top),
    Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)));
  function rememberWanted(map, el, key) { if (!map.has(el)) map.set(el,new Set()); map.get(el).add(key); }
  function mark(el,key,value='true') {
    if (!attrs.has(el)) attrs.set(el,new Map());
    if (!attrs.get(el).has(key)) attrs.get(el).set(key,{before:el.getAttribute(key),last:null});
    const entry=attrs.get(el).get(key); entry.last=value; rememberWanted(wantedAttrs,el,key);
    if(el.getAttribute(key)!==value) el.setAttribute(key,value);
  }
  function property(el,key,value,priority='') {
    if(!props.has(el)) props.set(el,new Map());
    if(!props.get(el).has(key)) props.get(el).set(key,{before:el.style.getPropertyValue(key),priority:el.style.getPropertyPriority(key),last:null,lastPriority:''});
    const entry=props.get(el).get(key); rememberWanted(wantedProps,el,key);
    if(el.style.getPropertyValue(key)!==value || el.style.getPropertyPriority(key)!==priority) el.style.setProperty(key,value,priority);
    // Browsers serialize gradients, colors and numbers. Remember that exact form
    // so a later pause/navigation can restore only the value this theme owns.
    entry.last=el.style.getPropertyValue(key); entry.lastPriority=el.style.getPropertyPriority(key);
  }
  function restoreAttribute(el,key,entry) {
    if(el.getAttribute(key)===entry.last) { if(entry.before===null) el.removeAttribute(key); else el.setAttribute(key,entry.before); }
  }
  function restoreProperty(el,key,entry) {
    if(el.style.getPropertyValue(key)===entry.last && el.style.getPropertyPriority(key)===entry.lastPriority) {
      if(entry.before) el.style.setProperty(key,entry.before,entry.priority); else el.style.removeProperty(key);
    }
  }
  function reconcile() {
    for(const [el,entries] of attrs) { for(const [key,value] of entries) if(!wantedAttrs.get(el)?.has(key)) {restoreAttribute(el,key,value);entries.delete(key);} if(!entries.size)attrs.delete(el); }
    for(const [el,entries] of props) { for(const [key,value] of entries) if(!wantedProps.get(el)?.has(key)) {restoreProperty(el,key,value);entries.delete(key);} if(!entries.size)props.delete(el); }
  }
  function owned(tag,cls,text) {
    const el=document.createElement(tag); el.className=cls; el.setAttribute('data-bocchi-owned','2');
    el.setAttribute('aria-hidden','true'); el.inert=true; if(text)el.textContent=text;
    nodes.add(el); return el;
  }
  function discard(el) { if(!el)return; for(const layer of [...sceneLayers])if(layer===el||el.contains(layer))clearSceneLayer(layer); for(const node of [el,...el.querySelectorAll(".bocchi-wallpaper-layer")])for(const url of node.__rasterURLs||[])releaseRasterURL(url); for(const child of [...nodes])if(child===el||el.contains(child)){child.remove();nodes.delete(child);} }
  function place(el,r) { for(const [key,value]of Object.entries({left:r.left,top:r.top,width:r.width,height:r.height})){const text=value+"px";if(el.style[key]!==text)el.style[key]=text;} }
  function remove(reason='removed') {
    if(stopped)return {removed:true,reason:state.reason}; stopped=true;
    cancelAnimationFrame(fastFrame);cancelAnimationFrame(clipFrame);
    for(const pending of [...deferredRasters])cancelDeferredRaster(pending.owner,pending.name);
    clearTimeout(backdrop?.__ditherCacheTimer);backdrop?.__ditherCache?.clear();if(backdrop)backdrop.__ditherEntry=null;
    for(const job of rasterJobs)job.cancelled=true;
    for(const layer of [...sceneLayers])clearSceneLayer(layer);
    for(const asset of readyAssets.values())for(const key of ["main","ambient","environmentAsset"])asset[key]?.bitmap?.close();
    cleanupPicker();clearTimeout(timer); clearInterval(leaseTimer); observer?.disconnect(); resize?.disconnect();
    releaseAppearance();
    window.removeEventListener('resize',scheduleFast); document.removeEventListener('scroll',onThemeScroll,true);
    window.visualViewport?.removeEventListener('resize',scheduleFast);
    window.visualViewport?.removeEventListener('scroll',onThemeScroll);
    for(const [el,entries]of attrs)for(const [key,entry]of entries)restoreAttribute(el,key,entry);
    for(const [el,entries]of props)for(const [key,entry]of entries)restoreProperty(el,key,entry);
    for(const el of nodes)el.remove(); sheet?.remove();
    for(const asset of readyAssets.values())for(const key of ["main","ambient","environmentAsset"])asset[key]?.bitmap?.close();
    for(const url of blobs)URL.revokeObjectURL(url);
    readerFadeNodes.clear();attrs.clear();props.clear();nodes.clear();blobs.clear();observed.clear();wantedAttrs.clear();wantedProps.clear();
    sheet=backdrop=stage=side=inputDetails=observer=resize=null;wallpaperUrl=stickerUrl=bandStickerUrl=null;css=wallpaperCatalog=sticker=bandSticker=null;
    if(window.__BOCCHI_THEME__===api)delete window.__BOCCHI_THEME__;
    Object.assign(state,{installed:false,reason,decorations:false,sidebarSticker:false,emptySticker:false,composerTransition:false});
    lastVerifiedContext=null;composerMissingSince=null;
    return {removed:true,reason};
  }
  async function decodeAsset(data) {
    if(typeof data!=='string'||!/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=\r\n]+$/.test(data))throw new Error('invalid-local-image');
    const comma=data.indexOf(','),mime=data.slice(5,data.indexOf(';')),decoded=atob(data.slice(comma+1));
    const bytes=new Uint8Array(decoded.length);for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
    const url=URL.createObjectURL(new Blob([bytes],{type:mime}));blobs.add(url);
    const probe=new Image();probe.src=url;
    try {await probe.decode();if(!probe.naturalWidth||!probe.naturalHeight)throw new Error('empty-image');const cw=256,ch=Math.max(1,Math.round(cw*probe.naturalHeight/probe.naturalWidth)),sample=document.createElement('canvas');sample.width=cw;sample.height=ch;const sc=sample.getContext('2d',{willReadFrequently:true});sc.filter='blur(1px)';sc.drawImage(probe,0,0,cw,ch);const rgba=sc.getImageData(0,0,cw,ch).data,luma=new Float32Array(cw*ch);for(let i=0;i<luma.length;i++){const r=rgba[i*4]/255,g=rgba[i*4+1]/255,b=rgba[i*4+2]/255;luma[i]=Math.min(1,(.2126*r+.7152*g+.0722*b+Math.max(r,g,b)*.16)/.6);}return{url,width:probe.naturalWidth,height:probe.naturalHeight,sample:{w:cw,h:ch,luma},bitmap:await createImageBitmap(probe)};}
    catch(error){URL.revokeObjectURL(url);blobs.delete(url);throw error;} finally {probe.removeAttribute('src');}
  }
  // The picker is an interactive sibling, never inside the inert decoration tree.
  const fixedIds=['night-stage','color-portraits','backstage','floating-bocchi','winter-night','headphone-evening'];
  const catalog=new Map(),assetCache=new Map(),readyAssets=new Map(),listeners=[];
  let currentAssets=null,currentLayer=null,control=null,signButton=null,picker=null,notice=null,lastContext=null;
  let requestSerial=0,noticeTimer=null,transitionTimer=null,requestTimer=null,focusTimer=null,frame=null;
  const instanceId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  function listen(target,type,handler,options){target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));}
  function interactive(tag,cls,text){const el=document.createElement(tag);el.className=cls;el.dataset.bocchiOwned='control';if(text)el.textContent=text;nodes.add(el);return el;}
  function cleanupPicker(){
    clearTimeout(noticeTimer);clearTimeout(transitionTimer);clearTimeout(requestTimer);clearTimeout(focusTimer);cancelAnimationFrame(frame);
    for(const release of listeners)release();listeners.length=0;assetCache.clear();readyAssets.clear();catalog.clear();
    currentAssets=currentLayer=control=signButton=picker=notice=lastContext=null;
  }
  function validateCatalog(){
    if(!Array.isArray(wallpaperCatalog)||wallpaperCatalog.length!==fixedIds.length||!selectionBridge||selectionBridge.binding!=='__BOCCHI_SELECT_WALLPAPER__'||!/^\w{32}$/.test(selectionBridge.token))throw Error('invalid-wallpaper-catalog');
    wallpaperCatalog.forEach((entry,index)=>{
      if(entry.id!==fixedIds[index]||typeof entry.name!=='string'||entry.name.length>80||!entry.layout)throw Error('invalid-wallpaper-catalog');
      const l=entry.layout;
      for(const key of ['widthFraction','heightFraction','anchorY','featherLeft','featherTop','featherBottom','ambientOpacity'])if(!Number.isFinite(l[key])||l[key]<0||l[key]>1)throw Error('invalid-wallpaper-layout');
      if(l.widthFraction<.5||l.heightFraction<.5||l.featherLeft>.4||l.featherTop>.15||l.featherBottom>.15)throw Error('unsafe-wallpaper-layout');
      if(l.framing){
        const f=l.framing;
        if(!['winter-night','headphone-evening'].includes(entry.id)||f.mode!=='r1-relative')throw Error('invalid-relative-framing');
        for(const key of ['scale','referenceProtectedLeft','referenceWidthFraction','referenceHeightFraction','referenceAnchorY','rightShiftFraction'])if(!Number.isFinite(f[key])||f[key]<0||f[key]>1)throw Error('invalid-relative-framing');
        if(f.adjustment){const a=f.adjustment;if(!Number.isFinite(a.scale)||a.scale<.9||a.scale>1.15||!Number.isFinite(a.x)||Math.abs(a.x)>64||!Number.isFinite(a.y)||Math.abs(a.y)>64)throw Error('invalid-framing-adjustment');}
        if(f.downShift!==undefined&&(!Number.isFinite(f.downShift)||f.downShift<0||f.downShift>64))throw Error('invalid-vertical-framing');
        if(f.scale<.5||f.referenceProtectedLeft>=.95||f.referenceWidthFraction<.5||f.referenceHeightFraction<.5||f.rightShiftFraction>.1)throw Error('unsafe-relative-framing');
        if(!Number.isFinite(f.referenceReadingGap)||f.referenceReadingGap<0||f.referenceReadingGap>96||!Number.isFinite(f.rightShiftMin)||!Number.isFinite(f.rightShiftMax)||f.rightShiftMin<0||f.rightShiftMax<f.rightShiftMin||f.rightShiftMax>96)throw Error('invalid-relative-framing');
        const r=f.faceRegion;
        if(!Array.isArray(r)||r.length!==4||r.some(v=>!Number.isFinite(v)||v<0||v>1)||r[0]>=r[2]||r[1]>=r[3])throw Error('invalid-face-region');
      }
      if(entry.environment){
        const e=entry.environment,n=e.nativeSize,r=e.mainRect;
        if(!['night-stage','backstage','floating-bocchi','winter-night','headphone-evening'].includes(entry.id)||!n||!Number.isInteger(n.width)||!Number.isInteger(n.height)||n.width<=0||n.height<=0||n.width>16384||n.height>16384||!Array.isArray(r)||r.length!==4||r.some(v=>!Number.isFinite(v))||r[0]<-n.width*.5||r[1]<0||r[2]<=0||r[2]>n.width*2||r[3]<=0||r[0]+r[2]>n.width*1.5||r[1]+r[3]>n.height*1.15||r[1]+r[3]*.15>n.height||Math.abs(r[2]/r[3]-1672/941)>.002||!['top','top-bottom'].includes(e.edges)||(e.edges==='top-bottom'&&entry.id!=='headphone-evening'))throw Error('invalid-environment-registration');
      }
      catalog.set(entry.id,entry);
    });
    if(!catalog.has(initialWallpaperId))initialWallpaperId='night-stage';
  }
  async function loadWallpaper(id){
    if(stopped||!catalog.has(id))throw Error('invalid-wallpaper-id');
    if(!assetCache.has(id))assetCache.set(id,(async()=>{
      const entry=catalog.get(id),decoded=[];
      try{
        const decode=async data=>{const asset=await decodeAsset(data);decoded.push(asset);if(stopped)throw Error('theme-removed');return asset;};
        const main=await decode(entry.image),ambient=await decode(entry.background),environmentAsset=entry.environment?await decode(entry.environment.image):null;
        if(environmentAsset&&(environmentAsset.width!==entry.environment.nativeSize.width||environmentAsset.height!==entry.environment.nativeSize.height))throw Error('environment-size-mismatch');
        let continuation=null;
        if(id==='headphone-evening'){continuation={url:headphoneContinuation()};decoded.push(continuation);const probe=new Image();probe.src=continuation.url;try{await probe.decode();if(stopped)throw Error('theme-removed');}finally{probe.removeAttribute('src');}}
        const value={...entry,main,ambient,environmentAsset,continuation};value.tone=id==="floating-bocchi"?{rgb:[23,23,30],css:"rgb(23, 23, 30)",source:"R17.3-classic-2.3-palette"}:["backstage","headphone-evening","color-portraits"].includes(id)?{rgb:[24,24,24],css:"rgb(24, 24, 24)",source:"R16-neutral-charcoal"}:r15SampleTone(value);readyAssets.set(id,value);state.decodedWallpapers=readyAssets.size;return value;
      }catch(error){for(const asset of decoded){URL.revokeObjectURL(asset.url);blobs.delete(asset.url);}throw error;}
    })().catch(error=>{assetCache.delete(id);throw error;}));
    return assetCache.get(id);
  }
  function validRequest(id,requestId){return !stopped&&Date.now()<expiresAt&&state.selectionPending===true&&catalog.has(id)&&state.selectionRequestId===requestId&&state.requestedWallpaperId===id;}
  async function prepareWallpaper(id,requestId){
    if(!validRequest(id,requestId))return{ok:false,id,requestId,reason:'stale-request'};
    try{await loadWallpaper(id);return{ok:validRequest(id,requestId),id,requestId};}
    catch(error){return{ok:false,id,requestId,reason:error.message};}
  }
  function message(text){if(!notice)return;notice.textContent=text;notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{if(notice)notice.hidden=true;},4500);}
  function rejectWallpaper(requestId,text){
    if(stopped||state.selectionRequestId!==requestId)return{ok:false,reason:'stale-request'};
    clearTimeout(requestTimer);state.selectionPending=false;state.lastSelectionError=String(text||'wallpaper-selection-failed').slice(0,160);message(t('picker.failed'));updateChoices();return{ok:true};
  }
  function commitWallpaper(id,requestId){
    if(!validRequest(id,requestId)||!readyAssets.has(id))return{ok:false,id,requestId,reason:'stale-or-unprepared-request'};
    clearTimeout(requestTimer);currentAssets=readyAssets.get(id);wallpaperUrl=currentAssets.main.url;
    Object.assign(state,{wallpaperId:id,imageWidth:currentAssets.main.width,imageHeight:currentAssets.main.height,selectionPending:false,lastSelectionError:null});
    if(backdrop)showWallpaperLayer(currentAssets,true);updateChoices();refresh();
    if(!state.installed)return{ok:false,id,requestId,reason:state.reason};
    message(t('picker.changed',wallpaperName(state.wallpaperId)));return{ok:true,id,requestId};
  }
  function chooseWallpaper(id){
    if(stopped||!catalog.has(id))return;
    const requestId=instanceId+'-'+(++requestSerial);Object.assign(state,{selectionRequestId:requestId,requestedWallpaperId:id,selectionPending:true});updateChoices();
    clearTimeout(requestTimer);requestTimer=setTimeout(()=>rejectWallpaper(requestId,'wallpaper-selection-timeout'),12000);
    try{const binding=window[selectionBridge.binding];if(typeof binding!=='function')throw Error('bridge-unavailable');binding(JSON.stringify({token:selectionBridge.token,id,requestId}));}
    catch{rejectWallpaper(requestId,'wallpaper-bridge-unavailable');}
  }
  function createWallpaperLayer(asset){
    const layer=owned('div','bocchi-wallpaper-layer');layer.dataset.wallpaperId=asset.id;
    const ambient=owned('div','bocchi-ambience');ambient.style.backgroundImage='url('+JSON.stringify(asset.ambient.url)+')';ambient.style.opacity=String(asset.layout.ambientOpacity);
    if(asset.layout.ambientSource==='single-pass-scene')layer.classList.add('bocchi-single-pass-scene');
    const art=owned('img','bocchi-art');art.src=asset.main.url;art.alt='';
    if(asset.layout.ambientSource==='registered-floor-extension'){
      const scene=owned('div','bocchi-registered-scene');
      ambient.classList.add('bocchi-floor-extension');ambient.style.opacity='1';
      scene.append(ambient,art);layer.append(scene);
    }else layer.append(ambient,art);
    if(asset.environmentAsset){
      const group=owned('div','bocchi-environment-scene');
      if(asset.id==='headphone-evening'){
        const environment=owned('img','bocchi-environment bocchi-headphone-environment');environment.src=asset.environmentAsset.url;environment.alt='';environment.dataset.edges='top-bottom';
        const lines=owned('img','bocchi-headphone-lines');lines.src=asset.continuation.url;lines.alt='';
        const painted=owned('canvas','bocchi-r14-background');group.append(painted,art);layer.dataset.previewTopMode=previewTopMode;
      }else{
        const painted=owned('canvas','bocchi-r14-background bocchi-r14-upper-background');group.append(painted);layer.dataset.previewTopMode=previewTopMode;
        if(asset.layout.ambientSource==='registered-floor-extension')group.append(layer.querySelector('.bocchi-registered-scene'));
        else group.append(art);
      }
      layer.append(group);layer.dataset.environment='true';
    }
    backdrop.insertBefore(layer,backdrop.querySelector('.bocchi-reading-veil'));return layer;
  }
  function layoutWallpaperLayer(layer,region){
    const asset=readyAssets.get(layer.dataset.wallpaperId),l=asset.layout;
    const protection=l.protectedRegion?.[0];
    const readingGap=Math.max(12,Math.min(96,Number.isFinite(l.readingGap)?l.readingGap:12));
    const protectedWidth=!l.legacyCurrent&&region.width>=900&&Number.isFinite(protection)&&Number.isFinite(region.readingRight)?Math.max(280,(region.width-region.readingRight-readingGap)/(1-protection)):Infinity;
    // In a narrow split pane crop the quiet left margin, not the quartet itself.
    const compactPortrait=region.panel&&region.width<900&&Number.isFinite(protection);
    const canvasWidth=compactPortrait?region.width*.94/Math.max(.3,1-protection):region.width*l.widthFraction;
    let width=Math.min(canvasWidth,region.height*l.heightFraction*asset.main.width/asset.main.height,protectedWidth),height=width*asset.main.height/asset.main.width;
    let left=region.width-width,top=(region.height-height)*l.anchorY,framing=null;
    if(l.framing){
      const f=l.framing,ratio=asset.main.width/asset.main.height;
      // Reproduce R1 geometry independently of the current silhouette metadata.
      // A larger scarf or an outstretched hand must not shrink the whole portrait.
      const oldProtected=region.width>=900&&Number.isFinite(region.readingRight)?Math.max(280,(region.width-region.readingRight-f.referenceReadingGap)/(1-f.referenceProtectedLeft)):Infinity;
      const oldCanvas=region.panel&&region.width<900?region.width*.94/Math.max(.3,1-f.referenceProtectedLeft):region.width*f.referenceWidthFraction;
      const referenceWidth=Math.min(oldCanvas,region.height*f.referenceHeightFraction*ratio,oldProtected);
      const requestedWidth=referenceWidth*f.scale,r=f.faceRegion,margin=12;
      const faceFit=Math.min((region.width-2*margin)/(r[2]-r[0]),(region.height-2*margin)*ratio/(r[3]-r[1]));
      width=Math.min(requestedWidth,faceFit);height=width/ratio;
      const requestedShift=Math.max(f.rightShiftMin,Math.min(f.rightShiftMax,region.width*f.rightShiftFraction));
      // Preserve scale first: pan inside the valid four-face interval before
      // reducing size. Only a face group larger than the pane triggers a shrink.
      left=Math.max(margin-width*r[0],Math.min(region.width-width+requestedShift,region.width-margin-width*r[2]));
      top=Math.max(margin-height*r[1],Math.min((region.height-height)*f.referenceAnchorY+(f.downShift||0),region.height-margin-height*r[3]));
      const a=f.adjustment||{scale:1,x:0,y:0},baseWidth=width,baseLeft=left,baseTop=top,cx=(r[0]+r[2])/2,cy=(r[1]+r[3])/2;
      const centerX=left+width*cx,centerY=top+height*cy,adjustmentMargin=f.adjustment?4:margin;
      // Keep the current face centre as the no-pan fallback. A rightward nudge
      // must never turn into an unintended leftward nudge in a narrow pane.
      const centeredFit=Math.min((centerX-adjustmentMargin)/(cx-r[0]),(region.width-adjustmentMargin-centerX)/(r[2]-cx),(centerY-adjustmentMargin)*ratio/(cy-r[1]),(region.height-adjustmentMargin-centerY)*ratio/(r[3]-cy));
      width=Math.min(baseWidth*a.scale,faceFit,centeredFit);height=width/ratio;
      left=Math.max(adjustmentMargin-width*r[0],Math.min(centerX+a.x-width*cx,region.width-adjustmentMargin-width*r[2]));
      top=Math.max(adjustmentMargin-height*r[1],Math.min(centerY+a.y-height*cy,region.height-adjustmentMargin-height*r[3]));
      const adjustment={requested:a,applied:{scale:width/baseWidth,x:left+width*cx-centerX,y:top+height*cy-centerY},facePadding:adjustmentMargin,panLimited:Math.abs(left+width*cx-centerX-a.x)>.01,scaleLimited:width<baseWidth*a.scale-.01,baseline:{left:baseLeft,top:baseTop,width:baseWidth,height:baseWidth/ratio}};
      framing={adjustment,mode:f.mode,referenceWidth,requestedWidth,scaleToR1:width/referenceWidth,requestedShift,effectiveShift:left-(region.width-width),requestedDownShift:f.downShift||0,effectiveDownShift:top-(region.height-height)*f.referenceAnchorY,reducedForFaces:width<requestedWidth-.01,faceBounds:{left:left+width*r[0],top:top+height*r[1],right:left+width*r[2],bottom:top+height*r[3]}};
    }
    // Keep the artwork, registered environment and floor on the same layout origin.
    if(asset.id==='floating-bocchi'){
      const shift=Math.min(12,Math.max(0,region.height-4-top-height*l.protectedRegion[3]));
      top+=shift;framing={mode:'fixed-vertical-nudge',requestedDownShift:12,effectiveDownShift:shift};
    }
    const values={'--bocchi-art-left':left+'px','--bocchi-art-top':top+'px','--bocchi-art-width':width+'px','--bocchi-art-height':height+'px','--bocchi-feather-left':(l.featherLeft*100)+'%','--bocchi-feather-top':(l.featherTop*100)+'%','--bocchi-feather-bottom':((1-l.featherBottom)*100)+'%'};
    const floor=top+height*l.floorAnchor;
    const ambientAnchor=l.ambientFloorAnchor||l.floorAnchor;
    const ambientHeight=Math.max(region.height,floor/ambientAnchor,(region.height-floor)/(1-ambientAnchor));
    const ambient=layer.querySelector('.bocchi-ambience');
    if(l.ambientSource==='registered-floor-extension'){
      const scene=layer.querySelector('.bocchi-registered-scene');
      // Main and extended floor share the same origin and uniform scale.
      // Only generated floor pixels below the original people's feet are exposed.
      const extensionHeight=width*asset.ambient.height/asset.ambient.width;
      scene.style.left=left+'px';scene.style.top=top+'px';
      scene.style.width=width+'px';scene.style.height=extensionHeight+'px';
      scene.style.setProperty('--bocchi-scene-top-feather',(height*l.featherTop)+'px');
      scene.style.setProperty('--bocchi-scene-floor-start',(height*.91)+'px');
      scene.style.setProperty('--bocchi-scene-floor-clear',(height*.93)+'px');
      scene.style.setProperty('--bocchi-main-bottom-feather',(height*.94)+'px');
      scene.style.setProperty('--bocchi-main-bottom',height+'px');
      // Keep the floor registration; gently fade its highlights below the feet.
      const dimStart=height*.92,dimEnd=Math.max(dimStart+1,region.height-top),dimRange=dimEnd-dimStart;
      scene.style.setProperty('--bocchi-floor-dim-start',dimStart+'px');
      scene.style.setProperty('--bocchi-floor-dim-mid',(dimStart+dimRange*.38)+'px');
      scene.style.setProperty('--bocchi-floor-dim-low',(dimStart+dimRange*.73)+'px');
      scene.style.setProperty('--bocchi-floor-dim-end',dimEnd+'px');
      ambient.style.backgroundSize=width+'px '+extensionHeight+'px';
      ambient.style.backgroundPosition='0 0';
    }else if(l.ambientSource==='single-pass-scene'){
      // Use only the quiet left environment from the unchanged original. The
      // crop is wider than the viewport, so none of the quartet is duplicated.
      const aw=Math.max(region.width/l.ambientCrop,region.height*asset.ambient.width/asset.ambient.height);
      const ah=aw*asset.ambient.height/asset.ambient.width;
      ambient.style.backgroundSize=aw+'px '+ah+'px';
      ambient.style.backgroundPosition='left '+((region.height-ah)*.55)+'px';
    }else{
      ambient.style.backgroundSize=(l.legacyCurrent?213:100/l.ambientCrop)+'% '+ambientHeight+'px';
      ambient.style.backgroundPosition='left '+(floor-ambientHeight*ambientAnchor)+'px';
    }
    layer.__revealGeometry={left,top,height,width,nativeScale:width/asset.main.width,regionWidth:region.width,regionHeight:region.height};
    const lines=layer.querySelector('.bocchi-headphone-lines');
    if(lines){Object.assign(lines.style,{left:left+'px',top:(top-300*width/1672)+'px',width:width+'px',height:width+'px'});updateHeadphoneMask(layer,asset,width,height);}
    if(asset.environmentAsset){
      const e=asset.environment,[x,y,w,h]=e.mainRect,s=width/w;
      // One transform for the plate. Framing above remains exactly as installed.
      layer.__environmentGeometry={top,height,width,nativeScale:width/asset.main.width,yScale:y*s,left:left-x*s,planeTop:top-y*s,planeWidth:asset.environmentAsset.width*s,planeHeight:asset.environmentAsset.height*s};
      for(const env of layer.querySelectorAll('.bocchi-environment')){
        env.style.left=(left-x*s)+'px';env.style.top=(top-y*s)+'px';
        env.style.width=(asset.environmentAsset.width*s)+'px';env.style.height=(asset.environmentAsset.height*s)+'px';
        env.style.setProperty('--environment-plane-top',(top-y*s)+'px');
        env.style.setProperty('--environment-left-clear',((x+w*l.featherLeft)*s)+'px');
        // The headphone master contains reference figures: only its empty tail
        // below them is exposed, never a second set of shoulders or hair.
        env.style.setProperty('--environment-lower-open',((y+h+54)*s)+'px');
        env.style.setProperty('--environment-lower-clear',((y+h+126)*s)+'px');
        env.style.setProperty('--environment-bottom-start',((y+h+154)*s)+'px');
        env.style.setProperty('--environment-bottom-end',(asset.environmentAsset.height*s)+'px');
      }
    }
    for(const [key,value]of Object.entries(values))layer.style.setProperty(key,value);
    return{left,top,width,height,framing};
  }
  function showWallpaperLayer(asset,animate){
    clearTimeout(transitionTimer);cancelAnimationFrame(frame);
    const previous=currentLayer?.__readyBackground?currentLayer:currentLayer?.__previous;
    if(currentLayer){const job=rasterRecords.get(currentLayer)?.get('background');if(job)job.cancelled=true;}
    for(const layer of [...backdrop.querySelectorAll('.bocchi-wallpaper-layer')])if(layer!==previous)discard(layer);
    currentLayer=createWallpaperLayer(asset);currentLayer.__previous=previous;currentLayer.__animate=animate;
    currentLayer.style.opacity='0';
  }
  function revealReadyLayer(layer){
    layer.__readyBackground=true;if(layer!==currentLayer)return;
    const previous=layer.__previous;layer.__previous=null;
    if(previous?.isConnected&&layer.__animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      frame=requestAnimationFrame(()=>{if(!stopped&&layer===currentLayer){layer.style.opacity='1';previous.style.opacity='0';}});
      transitionTimer=setTimeout(()=>discard(previous),210);
    }else{layer.style.transition='none';layer.style.opacity='1';discard(previous);}
  }
  function updateChoices(){
    for(const item of picker?.querySelectorAll('[data-wallpaper-choice]')||[]){const id=item.dataset.wallpaperChoice;item.setAttribute('aria-checked',String(id===state.wallpaperId));item.dataset.pending=String(!!state.selectionPending&&id===state.requestedWallpaperId);item.querySelector('.bocchi-choice-name').textContent=wallpaperName(id);item.querySelector('.bocchi-choice-state').textContent=id===state.wallpaperId?t('picker.active'):state.selectionPending&&id===state.requestedWallpaperId?t('picker.loading'):item.dataset.unavailable?t('picker.unavailable'):'';}
  }
  function closePicker(restoreFocus=true){if(!picker||picker.hidden)return;picker.hidden=true;signButton.setAttribute('aria-expanded','false');state.pickerOpen=false;if(restoreFocus&&!control.hidden)signButton.focus({preventScroll:true});}
  async function openPicker(){
    if(!control||control.hidden)return;
    picker.hidden=false;signButton.setAttribute('aria-expanded','true');state.pickerOpen=true;positionPicker();
    const items=[...picker.querySelectorAll('[data-wallpaper-choice]')];(items.find(x=>x.dataset.wallpaperChoice===state.wallpaperId)||items[0]).focus({preventScroll:true});
    await Promise.allSettled(items.map(async item=>{try{const asset=await loadWallpaper(item.dataset.wallpaperChoice);if(!stopped)item.querySelector('img').src=asset.main.url;}catch{if(!stopped){item.dataset.unavailable='true';item.querySelector('.bocchi-choice-state').textContent=t('picker.unavailable');}}}));
  }
  function positionPicker(){
    if(!picker||picker.hidden||!lastContext)return;const area=lastContext.area,b=box(signButton),single=area.width<740;
    picker.dataset.single=String(single);const w=Math.min(single?182:288,area.width-24);
    picker.style.width=w+'px';picker.style.maxHeight=Math.max(100,area.bottom-b.bottom-24)+'px';picker.style.left=Math.max(area.left+12,Math.min(b.right-w,area.right-w-12))+'px';picker.style.top=(b.bottom+12)+'px';
  }
  function buildPicker(){
    if(control)return;
    control=interactive('div','bocchi-picker-root');signButton=interactive('button','bocchi-sign bocchi-picker-trigger');signButton.type='button';signButton.setAttribute('aria-label','STARRY · '+t('picker.label'));signButton.setAttribute('aria-haspopup','menu');signButton.setAttribute('aria-expanded','false');
    signButton.append(interactive('b','','✦ STARRY'),interactive('small','','SHIMOKITAZAWA · BACKSTAGE'));
    picker=interactive('div','bocchi-picker-menu');picker.id='bocchi-wallpaper-menu';picker.setAttribute('role','menu');picker.setAttribute('aria-label',t('picker.label'));picker.hidden=true;signButton.setAttribute('aria-controls',picker.id);
    for(const entry of catalog.values()){
      const button=interactive('button','bocchi-wallpaper-choice');button.type='button';button.dataset.wallpaperChoice=entry.id;button.setAttribute('role','menuitemradio');button.tabIndex=-1;
      const thumb=interactive('img','bocchi-choice-thumb');thumb.alt='';if(readyAssets.has(entry.id))thumb.src=readyAssets.get(entry.id).main.url;
      button.append(thumb,interactive('span','bocchi-choice-name',wallpaperName(entry.id)),interactive('span','bocchi-choice-state'));picker.append(button);listen(button,'click',()=>chooseWallpaper(entry.id));
    }
    notice=interactive('div','bocchi-picker-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;control.append(signButton,picker,notice);document.body.append(control);
    listen(signButton,'click',()=>picker.hidden?openPicker():closePicker());
    listen(signButton,'keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openPicker();}});
    listen(picker,'keydown',event=>{
      const items=[...picker.querySelectorAll('[data-wallpaper-choice]')],index=items.indexOf(document.activeElement),step=picker.dataset.single==='true'?1:2;
      const count=items.length;
      let target=null;if(event.key==='ArrowRight')target=(index+1)%count;if(event.key==='ArrowLeft')target=(index+count-1)%count;if(event.key==='ArrowDown')target=(index+step)%count;if(event.key==='ArrowUp')target=(index+count-step)%count;if(event.key==='Home')target=0;if(event.key==='End')target=count-1;
      if(target!==null){event.preventDefault();items[target].focus();}if(event.key==='Tab'){closePicker();}
    });
    listen(document,'keydown',event=>{if(event.key==='Escape'&&!picker.hidden){event.preventDefault();event.stopImmediatePropagation();closePicker();clearTimeout(focusTimer);focusTimer=setTimeout(()=>{if(!stopped&&picker?.hidden&&!control?.hidden&&signButton?.isConnected)signButton.focus({preventScroll:true});},30);}},true);
    listen(document,'pointerdown',event=>{if(!picker.hidden&&!control.contains(event.target))closePicker();},true);
    updateChoices();
  }
  function updatePicker(ctx,left,width){
    buildPicker();lastContext=ctx;
    const blocked=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[role="menu"],[data-radix-popper-content-wrapper]')].some(el=>!el.closest('[data-bocchi-owned]')&&visible(el));
    control.hidden=blocked;if(blocked){closePicker(false);state.starryVisible=false;return;}
    const {area,main}=ctx,small=area.width<900||ctx.panels.length>0,w=small?104:136,h=36;
    // One compact titlebar anchor in both modes, with space reserved for the
    // native new-tab control. The content-row fallback also clears temporary chat.
    const candidates=[rect(area.right-w-64,ctx.mainRect.top+8,w,h),rect(area.right-w-16,area.top+8,w,h)];
    const obstacles=occupied(ctx.page,rect(area.left,ctx.mainRect.top,area.width,Math.min(ctx.mainRect.height,area.top+56-ctx.mainRect.top)));
    let spot=candidates.find(r=>r.left>=area.left+12&&!obstacles.some(o=>overlap(r,o,12)));
    let micro=false;
    if(!spot&&area.width<600){
      for(let x=area.right-84;x>=area.left+12;x-=4){const r=rect(x,ctx.mainRect.top+10,72,28);if(!obstacles.some(o=>overlap(r,o,12))){spot=r;micro=true;break;}}
    }
    if(!spot){control.hidden=true;closePicker(false);state.starryVisible=false;state.starryUnavailableReason='no-safe-control-space';return;}
    signButton.dataset.micro=String(micro);delete state.starryUnavailableReason;
    signButton.dataset.small=String(small||spot.height<50);place(signButton,spot);control.hidden=false;notice.style.right=Math.max(12,innerWidth-area.right+16)+'px';notice.style.top=(spot.bottom+12)+'px';
    state.starryVisible=true;state.starryBounds=spot;positionPicker();
  }


  // Fixed spatial noise at physical-pixel resolution. Never animated and never
  // applied to text or controls. Both endpoints of the foreground mask are exact.
  function revealAmount(t){return t<=0?0:t>=1?1:t<.2?3.125*t*t:t>.8?1-3.125*(1-t)*(1-t):1.25*(t-.1);}
  function noiseAt(x,y){let n=Math.imul(x+1,1597334677)^Math.imul(y+1,3812015801);n=Math.imul(n^(n>>>16),2246822519);n=Math.imul(n^(n>>>13),3266489917);return ((n^(n>>>16))>>>0)/4294967296;}
  function sampleFeature(asset,x,y){
    const s=asset?.sample;if(!s)return .2;
    const xx=Math.max(0,Math.min(s.w-1,x*(s.w-1))),yy=Math.max(0,Math.min(s.h-1,y*(s.h-1))),ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy,jx=Math.min(ix+1,s.w-1),jy=Math.min(iy+1,s.h-1);
    return(s.luma[iy*s.w+ix]*(1-fx)+s.luma[iy*s.w+jx]*fx)*(1-fy)+(s.luma[jy*s.w+ix]*(1-fx)+s.luma[jy*s.w+jx]*fx)*fy;
  }
  // R17: the visible scene is immutable until a complete layout is ready.
  const sceneLayers=new Set(),scenePages=new WeakMap();
  let scenePageSerial=0,sceneSerial=0;
  function retainSceneFrame(frame){frame.refs++;}
  function releaseSceneFrame(frame){
    if(!frame||--frame.refs>0)return;
    for(const url of frame.urls)releaseRasterURL(url);
    frame.urls.clear();frame.template=null;
  }
  function clearSceneLayer(layer){
    if(!sceneLayers.delete(layer))return;
    clearTimeout(layer.__sceneCacheTimer);cancelDeferredRaster(layer,'background');
    for(const frame of layer.__sceneCache.values())releaseSceneFrame(frame);
    layer.__sceneCache.clear();releaseSceneFrame(layer.__sceneFrame);layer.__sceneFrame=null;
    layer.__layoutProbe=null;
    const job=rasterRecords.get(layer)?.get('background');if(job)job.cancelled=true;
  }
  function layoutSceneCandidate(layer,region,ctx){
    if(!sceneLayers.has(layer)){
      sceneLayers.add(layer);layer.__sceneCache=new Map();
      layer.__layoutProbe=layer.cloneNode(true);
    }
    if(!scenePages.has(ctx.page))scenePages.set(ctx.page,++scenePageSerial);
    layer.__scenePage=ctx.page;layer.__sceneMain=ctx.main;
    const draft=layer.__layoutProbe;
    Object.assign(draft.style,{left:'auto',right:'0px',top:'0px',bottom:'auto',width:region.width+'px',height:region.height+'px'});
    draft.__sceneIdentity={page:scenePages.get(ctx.page),mode:ctx.mode,panel:region.panel,tone:currentAssets.tone.rgb};
    draft.__sceneBounds=layoutWallpaperLayer(draft,region);
    return draft.__sceneBounds;
  }
  function cacheStableScene(layer,frame,key=frame.key){
    clearTimeout(layer.__sceneCacheTimer);
    const promote=()=>{
      if(stopped||!layer.isConnected||layer!==currentLayer||layer.__sceneFrame!==frame||layer.__sceneRequestedKey!==key)return;
      if(!layer.__sceneCache.has(key))retainSceneFrame(frame);
      for(const [oldKey,old]of layer.__sceneCache)if(oldKey!==key&&old===frame){layer.__sceneCache.delete(oldKey);releaseSceneFrame(old);}
      layer.__sceneCache.delete(key);layer.__sceneCache.set(key,frame);
      while(layer.__sceneCache.size>2){const [key,old]=layer.__sceneCache.entries().next().value;layer.__sceneCache.delete(key);releaseSceneFrame(old);}
      state.sceneCacheEntries=layer.__sceneCache.size;
    };
    const remaining=Math.max(0,80-(performance.now()-layer.__sceneChangedAt));
    if(remaining)layer.__sceneCacheTimer=setTimeout(promote,remaining);else promote();
  }
  function presentSceneFrame(layer,frame,cacheHit=false,key=frame.key){
    const copy=frame.template,opacity=layer.style.opacity,transition=layer.style.transition,old=layer.__sceneFrame;
    // All foreground positions, canvas pixels, registered floor geometry and
    // seam masks cross the same synchronous commit boundary.
    for(const child of [...nodes])if(child!==layer&&layer.contains(child))nodes.delete(child);
    // Keep complete immutable DOM/canvas groups in the two-entry cache. Moving
    // them preserves decoded images and GPU surfaces; no warm pixel copy.
    if(old)old.template.replaceChildren(...layer.childNodes);
    layer.replaceChildren(...copy.childNodes);layer.style.cssText=copy.style.cssText;
    layer.style.opacity=opacity;layer.style.transition=transition;
    for(const child of layer.querySelectorAll('[data-bocchi-owned]'))nodes.add(child);
    retainSceneFrame(frame);releaseSceneFrame(layer.__sceneFrame);layer.__sceneFrame=frame;
    layer.__revealGeometry={...frame.geometry};layer.__environmentGeometry=frame.environment?{...frame.environment}:null;
    layer.__r14=frame.r14;layer.__r14UpperKey=frame.upperKey;layer.__sceneCommittedKey=key;
    layer.dataset.sceneGeneration=String(frame.generation);
    state.scenePresentation={generation:frame.generation,key,cacheHit,geometry:{...frame.geometry}};
    state.sceneCacheHits=(state.sceneCacheHits||0)+(cacheHit?1:0);
    state.scenePending=false;state.lastRasterError=null;
    cacheStableScene(layer,frame,key);revealReadyLayer(layer);
  }
  async function decodeSceneFrame(draft,job){
    const urls=new Set(job.urls);
    for(const img of draft.querySelectorAll('img'))if(img.src)urls.add(img.src);
    await Promise.all([...urls].map(async url=>{const img=new Image();img.src=url;try{await img.decode();}finally{img.removeAttribute('src');}}));
    if(!rasterAlive(job))throw Error('raster-cancelled');
  }
  function updateRevealMask(layer,draft,g,begin,end){
    if(layer!==currentLayer)return;
    draft.style.maskImage='none';
    const header=parseFloat(backdrop.style.getPropertyValue('--bocchi-header-inset'))||0;
    const key=JSON.stringify([layer.dataset.wallpaperId,draft.__sceneIdentity,g,draft.__environmentGeometry,header,end,devicePixelRatio,previewTopMode]);
    // Chat/Work opacity is CSS-only. Reuse pixels across modes only when every
    // input to background shading and geometry is identical; keep the complete
    // page/mode identity for scheduling and cache validation.
    const pixelKey=JSON.stringify([layer.dataset.wallpaperId,g,draft.__environmentGeometry,header,end,devicePixelRatio,previewTopMode,draft.__sceneIdentity.tone]);
    if(layer.__sceneRequestedKey!==key){layer.__sceneRequestedKey=key;layer.__sceneChangedAt=performance.now();}
    if(layer.__sceneFrame?.pixelKey===pixelKey){
      cancelDeferredRaster(layer,'background');
      const job=rasterRecords.get(layer)?.get('background');if(job&&job.key!==key)job.cancelled=true;
      layer.__sceneCommittedKey=key;state.scenePresentation.key=key;
      state.scenePending=false;cacheStableScene(layer,layer.__sceneFrame,key);return;
    }
    const cached=layer.__sceneCache.get(key)||[...layer.__sceneCache.values()].find(frame=>frame.pixelKey===pixelKey);
    if(cached){
      cancelDeferredRaster(layer,'background');
      const records=rasterRecords.get(layer),job=records?.get('background');if(job)job.cancelled=true;records?.delete('background');
      presentSceneFrame(layer,cached,true,key);return;
    }
    state.scenePending=true;
    scheduleRaster(layer,'background',key,async job=>{
      job.frameCommit=true;
      const page=layer.__scenePage,main=layer.__sceneMain;
      job.scope=()=>layer===currentLayer&&layer.__sceneRequestedKey===key&&layer.__scenePage===page&&layer.__sceneMain===main&&page.matches(adapter.activePage)&&main.isConnected;
      const prepared=draft.cloneNode(true),geometry={...g},environment=draft.__environmentGeometry?{...draft.__environmentGeometry}:null;
      prepared.__environmentGeometry=environment;
      if(layer.dataset.wallpaperId==='headphone-evening'){
        await updateHeadphoneMask(prepared,readyAssets.get('headphone-evening'),geometry.width,geometry.height,job);
        await renderR14Background(prepared,geometry,header,job);
      }else await renderR14UpperBackground(prepared,geometry,header,end,job);
      await decodeSceneFrame(prepared,job);
      const frame={key,pixelKey,generation:++sceneSerial,template:prepared,geometry,environment,r14:prepared.__r14,upperKey:prepared.__r14UpperKey,urls:new Set(job.urls),refs:0};
      return()=>{
        presentSceneFrame(layer,frame);
        for(const url of frame.urls)job.urls.delete(url);
      };
    },!!layer.__sceneFrame);
  }


  // R15: sample the existing upper environment once per decoded wallpaper.
  // Stable, moderately dark colours exclude transparent reserves and lamps.
  function r15SampleTone(asset){
    const source=asset.environmentAsset||asset.main;
    const reserve=asset.environment?asset.environment.mainRect[1]:source.height*.075;
    const cropTop=Math.max(0,reserve*.04),cropHeight=Math.max(1,reserve*.62-cropTop);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=40;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(source.bitmap,source.width*.16,cropTop,source.width*.80,cropHeight,0,0,128,40);
    const p=ctx.getImageData(0,0,128,40).data,values=[];
    for(let i=0;i<p.length;i+=4){
      const rgb=[p[i],p[i+1],p[i+2]],y=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
      if(p[i+3]<250||y<5||y>125||Math.max(...rgb)>175)continue;
      values.push({rgb,y});
    }
    values.sort((a,b)=>a.y-b.y);
    const chosen=values.slice(Math.floor(values.length*.15),Math.max(1,Math.ceil(values.length*.55)));
    if(!chosen.length)return{rgb:[23,23,30],css:'rgb(23,23,30)',sampleCount:0,source:'fallback'};
    const mean=[0,1,2].map(c=>chosen.reduce((n,v)=>n+v.rgb[c],0)/chosen.length);
    const y=.2126*mean[0]+.7152*mean[1]+.0722*mean[2],target=.2126*23+.7152*23+.0722*30;
    // Keep the old base luminance. Only hue follows the source; the approved
    // A+++ exposure curve still sets highlight and structure contrast.
    const rgb=mean.map(v=>Math.round(Math.max(4,Math.min(48,(v*.75+y*.25)*target/y))));
    return{rgb,css:'rgb('+rgb.join(',')+')',sampleCount:chosen.length,source:asset.environment?'upper-environment':'original-upper-texture',sampleMean:mean.map(v=>Math.round(v))};
  }
  function r15ToneChannel(value,gain,base,yy,header,end){
    if(yy>=end)return value;
    // Change background RGB toward its own dark colour, not toward black.
    // Only the first few rows converge fully to the same header colour.
    const edge=r14Smooth((yy-header)/Math.max(1,Math.min(48,(end-header)*.35)));
    return Math.round(Math.max(0,Math.min(255,base+(value-base)*gain*edge)));
  }
  function r15ReadingPaint(rgb,alpha,solid,clear){
    const stops=['rgba('+rgb.join(',')+','+alpha+') 0px'];
    for(let i=0;i<=32;i++){
      const t=i/32,a=alpha*(1-r14Smooth(t)),x=solid+(clear-solid)*t;
      stops.push('rgba('+rgb.join(',')+','+a.toFixed(6)+') '+x.toFixed(3)+'px');
    }
    return 'linear-gradient(90deg,'+stops.join(',')+')';
  }

  function r14Smooth(t){t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);}
  function r14TopGain(yy,header,end,feature){
    const n=({'A':0,'A+':1,'A++':2,'A+++':3})[previewTopMode];
    if(n===undefined||yy>=end)return 1;
    const t=r14Smooth((yy-header)/Math.max(1,end-header));
    return (.32+.68*t+(1-t)*feature*.12)*Math.pow(.75+.25*t,n);
  }
  async function r14ShadeBitmap(bitmap,mapY,header,end,tone,job){
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),p=pixels.data;
    for(let y=0;y<canvas.height;y++){
      if((y&7)===0)await rasterYield(job);
      const yy=mapY(y+.5);if(yy>=end)continue;
      for(let x=0;x<canvas.width;x++){
        const i=(y*canvas.width+x)*4,gain=r14TopGain(yy,header,end,Math.max(p[i],p[i+1],p[i+2])/255);
        for(let c=0;c<3;c++)p[i+c]=r15ToneChannel(p[i+c],gain,tone.rgb[c],yy,header,end);
      }
    }
    ctx.putImageData(pixels,0,0);return await rasterURL(canvas,job);
  }
  async function renderR14UpperBackground(layer,g,header,protectedEnd,job){
    const asset=readyAssets.get(layer.dataset.wallpaperId),e=layer.__environmentGeometry;
    const dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
    const key=[g.left,g.top,g.width,g.regionWidth,g.regionHeight,header,protectedEnd,dpr,previewTopMode].join(':');
    if(layer.__r14UpperKey===key)return;
    const ambient=layer.querySelector('.bocchi-ambience');
    // Quiet ambient colour is treated at its existing background coordinates.
    // Its lower pixels and geometry are preserved, including all floor planes.
    if(asset.layout.ambientSource!=='registered-floor-extension'){
      const size=ambient.style.backgroundSize.split(/\s+/),position=ambient.style.backgroundPosition.split(/\s+/);
      const h=parseFloat(size[1]),y=parseFloat(position[position.length-1])||0;
      const exposureEnd=e?g.top:protectedEnd;
      ambient.style.backgroundImage='url("'+(await r14ShadeBitmap(asset.ambient.bitmap,sy=>y+sy/asset.ambient.height*h,header,exposureEnd,asset.tone,job))+'")';
    }
    if(!e){
      // Four-colour portrait has no generated environment. Shade its existing
      // stage plane only. Keep the original artwork URL and local seam mask so
      // hair and splash contours keep Chromium's original image sampling.
      layer.__r14={topMode:previewTopMode,globalTopMask:false,protectedEnd,mainTransformUnchanged:true,environment:'original stage and splash texture'};
      layer.__r14UpperKey=key;return;
    }
    const canvas=layer.querySelector('.bocchi-r14-upper-background'),source=asset.environmentAsset.bitmap;
    const [rx,ry,rw]=asset.environment.mainRect,s=g.width/rw;
    const join=({'night-stage':20,'backstage':24,'floating-bocchi':20,'winter-night':20})[asset.id]*g.nativeScale;
    const overlapEnd=g.top+join+4,top=Math.min(e.planeTop,header-24);
    const w=Math.ceil(g.regionWidth*dpr),h=Math.max(1,Math.ceil(overlapEnd*dpr));
    canvas.width=w;canvas.height=h;canvas.style.width=g.regionWidth+'px';canvas.style.height=h/dpr+'px';
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    // Preserve the native collar next to the main image so window frames and
    // coloured strokes meet at the same registered coordinates. Only the empty
    // upper reserve can extend to the title bar; no figure pixels are sampled.
    const collar=Math.min(60,ry),sourceSplit=ry-collar,destSplit=g.top-collar*s;
    if(sourceSplit>0&&destSplit>top)ctx.drawImage(source,0,0,source.width,sourceSplit,e.left,top,e.planeWidth,destSplit-top);
    const sourceEnd=ry+(join+4)/s;
    ctx.drawImage(source,0,sourceSplit,source.width,sourceEnd-sourceSplit,e.left,destSplit,e.planeWidth,(sourceEnd-sourceSplit)*s);
    ctx.setTransform(1,0,0,1,0,0);
    const pixels=ctx.getImageData(0,0,w,h),p=pixels.data;
    for(let y=0;y<h;y++){
      if((y&7)===0)await rasterYield(job);
      const yy=(y+.5)/dpr,blend=1-r14Smooth((yy-g.top-join)/4);
      for(let x=0;x<w;x++){
        const xx=(x+.5)/dpr,i=(y*w+x)*4,left=Math.max(0,Math.min(1,(xx-g.left)/(g.width*asset.layout.featherLeft)));
        const gain=r14TopGain(yy,header,g.top,Math.max(p[i],p[i+1],p[i+2])/255);
        for(let c=0;c<3;c++)p[i+c]=r15ToneChannel(p[i+c],gain,asset.tone.rgb[c],yy,header,g.top);
        p[i+3]=Math.round(p[i+3]*left*blend);
      }
    }
    ctx.putImageData(pixels,0,0);
    layer.__r14={topMode:previewTopMode,globalTopMask:false,mainTransformUnchanged:true,environmentTop:top,registeredCollar:collar,overlapEnd,protectedEnd,sampledSourceEnd:sourceEnd,referenceFigureExcluded:overlapEnd<protectedEnd};
    layer.__r14UpperKey=key;
  }

  async function renderR14Background(layer,g,header,job){
    const asset=readyAssets.get(layer.dataset.wallpaperId),e=layer.__environmentGeometry,canvas=layer.querySelector('.bocchi-r14-background');
    if(!canvas||!asset.environmentAsset.bitmap||!e)return;
    const dpr=Math.min(3,window.devicePixelRatio||1),key=[g.left,g.top,g.width,g.regionWidth,g.regionHeight,header,dpr,previewTopMode].join(':');
    if(canvas.dataset.geometry===key)return;
    const w=Math.ceil(g.regionWidth*dpr),h=Math.ceil(g.regionHeight*dpr);canvas.width=w;canvas.height=h;
    canvas.style.width=g.regionWidth+'px';canvas.style.height=g.regionHeight+'px';
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),source=asset.environmentAsset.bitmap,[rx,ry,rw,rh]=asset.environment.mainRect,s=g.width/rw;
    const sourceBottom=ry+rh,mainBottom=g.top+g.height;
    const top=Math.min(e.planeTop,header-24),bottom=Math.max(e.planeTop+e.planeHeight,g.regionHeight+96);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    // Reflow only the figure-free reserves above/below the registered image.
    // The central reference rectangle retains the exact existing transform.
    ctx.globalAlpha=.54;
    ctx.drawImage(source,0,0,source.width,ry,e.left,top,e.planeWidth,g.top-top);
    ctx.drawImage(source,0,ry,source.width,rh,e.left,g.top,e.planeWidth,g.height);
    ctx.drawImage(source,0,sourceBottom,source.width,source.height-sourceBottom,e.left,mainBottom,e.planeWidth,bottom-mainBottom);
    ctx.globalAlpha=1;
    ctx.save();const ns=g.width/1672;ctx.translate(g.left,g.top);ctx.scale(ns,ns);
    // Same measured exits as R13. Extend along their slopes rather than fading
    // a finite SVG before it reaches the upper edge of a smaller window.
    const y0=Math.min(-240,(header-32-g.top)/ns),y1=40;
    const bars=[{x:1243,w:30,slope:-.278,c:['#df729f','#ff8bbb','#e56a99']},{x:1299,w:33,slope:-.278,c:['#eab341','#ffdf74','#ffcc53']},{x:1345,w:55,slope:-.25,c:['#1369ba','#1e92ed','#0965b8']},{x:1573,w:51,slope:-.32,c:['#cc2e50','#ff5c75','#e63e5b']}];
    for(const b of bars){const x0=b.x+b.slope*y0,x1=b.x+b.slope*y1,gradient=ctx.createLinearGradient(x0,0,x0+b.w,0);gradient.addColorStop(0,b.c[0]);gradient.addColorStop(.45,b.c[1]);gradient.addColorStop(1,b.c[2]);ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x0+b.w,y0);ctx.lineTo(x1+b.w,y1);ctx.lineTo(x1,y1);ctx.closePath();ctx.fill();}
    ctx.lineCap='round';
    for(const [x,slope,width,color]of [[1038,-.94,4.6,'#226cc9'],[1438,-.625,3,'#df69a1'],[1544,-.54,4.8,'#287ecb'],[1660,-.20,3,'#e8757c']]){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x+slope*y0,y0);ctx.lineTo(x,0);ctx.lineTo(x+slope*40,40);ctx.stroke();}
    ctx.globalAlpha=.30;
    for(const [p,col,width]of [['M1730 755 C1632 980 1120 1020 1110 1100 S1430 1210 1680 1182','#3e77c5',2.2],['M1735 850 C1600 1060 1210 1060 1170 1148 S1450 1260 1680 1242','#b55088',1.7],['M1740 950 Q1570 1150 1440 1140','#b59148',1.5]]){ctx.strokeStyle=col;ctx.lineWidth=width;ctx.stroke(new Path2D(p));}
    ctx.restore();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
    const pixels=ctx.getImageData(0,0,w,h),p=pixels.data,smooth=t=>{t=Math.min(1,Math.max(0,t));return t*t*t*(t*(t*6-15)+10);};
    for(let y=0;y<h;y++){
      if((y&7)===0)await rasterYield(job);
      const yy=(y+.5)/dpr,t=smooth((yy-header)/Math.max(1,g.top-header));
      // Light is changed in the background colours, never in the scene alpha.
      // Therefore texture and coloured structures remain visible at the top.
      const bottomT=smooth((yy-Math.max(mainBottom,g.regionHeight-160))/Math.max(1,g.regionHeight+96-Math.max(mainBottom,g.regionHeight-160)));
      for(let x=0;x<w;x++){
        const xx=(x+.5)/dpr,i=4*(y*w+x),left=smooth((xx-e.left)/(g.width*asset.layout.featherLeft));
        const darknessSteps=({'A':0,'A+':1,'A++':2,'A+++':3})[previewTopMode];if(darknessSteps!==undefined&&yy<g.top){const feature=Math.max(p[i],p[i+1],p[i+2])/255,baseExposure=.32+.68*t+(1-t)*feature*.12,exposure=baseExposure*Math.pow(.75+.25*t,darknessSteps);for(let c=0;c<3;c++)p[i+c]=r15ToneChannel(p[i+c],exposure,asset.tone.rgb[c],yy,header,g.top);}if(darknessSteps>=2&&yy>mainBottom){const tailExposure=1-.55*smooth((yy-mainBottom)/Math.max(1,(g.regionHeight-mainBottom)*.8));for(let c=0;c<3;c++)p[i+c]=Math.round(p[i+c]*tailExposure);}
        p[i+3]=Math.round(p[i+3]*left*(1-.7*bottomT));
      }
    }
    ctx.putImageData(pixels,0,0);canvas.dataset.geometry=key;
    layer.__r14={topMode:previewTopMode,backgroundBottom:bottom,viewportBottom:g.regionHeight,mainBottom,mainTransformUnchanged:true,globalTopMask:false,bottomColourGainAtEdge:.45,bottomResidualAtEdge:1-.7*smooth((g.regionHeight-Math.max(mainBottom,g.regionHeight-160))/Math.max(1,g.regionHeight+96-Math.max(mainBottom,g.regionHeight-160)))};
  }

  async function updateHeadphoneMask(layer,asset,width,height,job){
    const art=layer.querySelector('.bocchi-art'),dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1)),key=[width,height,dpr].join(':');if(art.dataset.maskGeometry===key)return;
    const canvas=document.createElement('canvas'),w=Math.ceil(width*dpr),h=Math.ceil(height*dpr);canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(w,h),d=pixels.data;
    for(let y=0;y<h;y++){
      if((y&7)===0)await rasterYield(job);
      for(let x=0;x<w;x++){
      const nx=(x+.5)/w,ny=(y+.5)/h*941,tail=Math.max(0,Math.min(1,(941-ny)/90)),feature=sampleFeature(asset.main,nx,ny/941);
      // Only the final 90 source pixels blend. Source spray contours remain
      // readable; no ellipse removes the torso above this strip.
      const upper=revealAmount(ny/40),lower=tail>=1?1:Math.pow(tail*tail*(3-2*tail),1.35-.65*feature),left=Math.min(1,nx/asset.layout.featherLeft),value=255*upper*lower*left,i=4*(y*w+x),whole=Math.floor(value);
      d[i]=d[i+1]=d[i+2]=255;d[i+3]=whole+(noiseAt(x,y)<value-whole?1:0);
    }
    }
    ctx.putImageData(pixels,0,0);art.style.maskImage='url("'+(await rasterURL(canvas,job))+'")';art.dataset.maskGeometry=key;
  }
  function headphoneContinuation(){
    // Main-image native coordinates. Measured exits at y=0 and y=32 establish
    // each width and direction; all geometry shares the mainRect transform.
    const bars=[{x:1243,w:30,slope:-.278,c:['#df729f','#ff8bbb','#e56a99']},{x:1299,w:33,slope:-.278,c:['#eab341','#ffdf74','#ffcc53']},{x:1345,w:55,slope:-.25,c:['#1369ba','#1e92ed','#0965b8']},{x:1573,w:51,slope:-.32,c:['#cc2e50','#ff5c75','#e63e5b']}];
    const paths=bars.map((b,i)=>{const y0=-240,y1=40,l0=b.x+b.slope*y0,l1=b.x+b.slope*y1;return '<linearGradient id="bar'+i+'"><stop stop-color="'+b.c[0]+'"/><stop offset=".45" stop-color="'+b.c[1]+'"/><stop offset="1" stop-color="'+b.c[2]+'"/></linearGradient><path d="M'+l0+' '+y0+'h'+b.w+'L'+(l1+b.w)+' '+y1+'h-'+b.w+'Z" fill="url(#bar'+i+')"/>';}).join('');
    const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -300 1672 1672"><defs><linearGradient id="upper" x1="0" y1="-240" x2="0" y2="-20" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0"/><stop offset=".38" stop-color="white" stop-opacity=".18"/><stop offset="1" stop-color="white"/></linearGradient><mask id="fade" maskUnits="userSpaceOnUse" x="0" y="-300" width="1672" height="400"><rect x="0" y="-300" width="1672" height="400" fill="url(#upper)"/></mask></defs><g mask="url(#fade)">'+paths+'<g fill="none" stroke-linecap="round"><path d="M1265 -220 Q1140 -106 1038 0 Q1018 18 997 40" stroke="#226cc9" stroke-width="4.6"/><path d="M1588 -240 L1438 0 L1414 40" stroke="#df69a1" stroke-width="3"/><path d="M1674 -240 L1544 0 L1523 40" stroke="#287ecb" stroke-width="4.8"/><path d="M1706 -240 L1660 0 L1652 40" stroke="#e8757c" stroke-width="3"/></g></g><g fill="none" stroke-linecap="round" opacity=".30"><path d="M1730 755 C1632 980 1120 1020 1110 1100 S1430 1210 1680 1182" stroke="#3e77c5" stroke-width="2.2"/><path d="M1735 850 C1600 1060 1210 1060 1170 1148 S1450 1260 1680 1242" stroke="#b55088" stroke-width="1.7"/><path d="M1740 950 Q1570 1150 1440 1140" stroke="#b59148" stroke-width="1.5"/></g></svg>';
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));blobs.add(url);return url;
  }

  async function paintOutputDither(backdrop,layer,job){
    const g=layer?.__revealGeometry;if(!backdrop||!g)return;
    const begin=parseFloat(layer.style.getPropertyValue('--scene-reveal-start')),end=parseFloat(layer.style.getPropertyValue('--scene-reveal-end'));
    if(!Number.isFinite(begin)||!Number.isFinite(end))return;
    if(!CSS.supports('mix-blend-mode','plus-lighter'))return;
    let canvas=backdrop.querySelector('.bocchi-output-dither-subtract'),plus=backdrop.querySelector('.bocchi-output-dither-add');
    if(!canvas){canvas=document.createElement('canvas');plus=document.createElement('canvas');canvas.className='bocchi-output-dither bocchi-output-dither-subtract';plus.className='bocchi-output-dither bocchi-output-dither-add';backdrop.append(canvas,plus);}
    const horizontal=backdrop.dataset.readerDither==='true',solid=parseFloat(backdrop.style.getPropertyValue('--bocchi-read-solid')),clear=parseFloat(backdrop.style.getPropertyValue('--bocchi-read-clear'));
    const dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1)),height=horizontal?g.regionHeight:Math.min(g.regionHeight,Math.ceil(end));
    backdrop.__ditherState={outputDither:true,physicalPixelRatio:dpr,ditherEnd:end,horizontalDither:horizontal,horizontalStart:solid,horizontalEnd:clear};
    const key=[g.regionWidth,height,begin,end,dpr,horizontal?solid:-1,horizontal?clear:-1].map(v=>v.toFixed(3)).join(':');if(canvas.dataset.geometry===key)return;
    const w=Math.ceil(g.regionWidth*dpr),h=Math.ceil(height*dpr);
    for(const c of [canvas,plus]){c.width=w;c.height=h;c.style.width=g.regionWidth+'px';c.style.height=height+'px';}
    const ctx=canvas.getContext('2d'),add=plus.getContext('2d'),pixels=ctx.createImageData(w,h),positive=add.createImageData(w,h),d=pixels.data,p=positive.data;
    for(let y=0;y<h;y++){
      if((y&7)===0)await rasterYield(job);
      const yy=(y+.5)/dpr,weight=Math.max(0,Math.min(1,(yy-begin+40)/40,(end-yy)/36));
      const from=weight>0?0:horizontal?Math.max(0,Math.floor(solid*dpr)):w,to=weight>0?w:horizontal?Math.min(w,Math.ceil(clear*dpr)):w;
      for(let x=from;x<to;x++){const xx=(x+.5)/dpr,horizontalWeight=horizontal?Math.max(0,Math.min(1,(xx-solid)/16,(clear-xx)/16)):0,alpha=Math.round(255*Math.max(weight,horizontalWeight));const i=4*(y*w+x),n=Math.floor(noiseAt(x+7919,y+104729)*3),q=Math.floor(noiseAt(x+15485863,y+32452843)*3);d[i]=d[i+1]=d[i+2]=n;p[i]=p[i+1]=p[i+2]=q;d[i+3]=p[i+3]=alpha;}
    }
    ctx.putImageData(pixels,0,0);add.putImageData(positive,0,0);canvas.dataset.geometry=plus.dataset.geometry=key;

  }

  function updateEnvironmentCap(ctx){
    if(!backdrop||!currentAssets)return;
    const {area,mainRect}=ctx,key=[ctx.mode,area.left,area.top,area.width,area.height,mainRect.top].map(v=>typeof v==='number'?Math.round(v):v).join(':');
    let bottom=environmentAnchors.get(key),source='cached';
    if(state.starryVisible&&state.starryBounds){
      bottom=state.starryBounds.bottom;environmentAnchors.set(key,bottom);
      environmentAnchorKind=state.starryBounds.top<area.top?'titlebar':'content';source='visible-sign';
      if(environmentAnchors.size>24)environmentAnchors.delete(environmentAnchors.keys().next().value);
    }
    if(!Number.isFinite(bottom)){bottom=(environmentAnchorKind==='titlebar'?mainRect.top:area.top)+44;source='layout-fallback';}
    const start=bottom-box(backdrop).top+12;
    const top=currentLayer?.__layoutProbe?.__environmentGeometry?.top??start+64;
    const length=Math.max(64,Math.min(88,top-start));
    backdrop.style.setProperty('--environment-cap-start',start+'px');
    backdrop.style.setProperty('--environment-cap-end',(start+length)+'px');
    state.environmentCap={signBottom:bottom,start,length,source};
    const joins={'night-stage':20,'color-portraits':36,'backstage':24,'floating-bocchi':20,'winter-night':20,'headphone-evening':40};
    const safe={'night-stage':52,'color-portraits':126,'backstage':112,'floating-bocchi':60,'winter-night':80,'headphone-evening':46};
    for(const visibleLayer of backdrop.querySelectorAll('.bocchi-wallpaper-layer')){
      if(visibleLayer!==currentLayer)continue;
      const layer=visibleLayer.__layoutProbe,g=layer?.__revealGeometry;if(!g)continue;
      const id=layer.dataset.wallpaperId,join=joins[id]*g.nativeScale;
      layer.style.setProperty('--environment-join',join+'px');
      const end=g.top+safe[id]*g.nativeScale,begin=Math.max(0,Math.min(parseFloat(backdrop.style.getPropertyValue('--bocchi-header-inset'))||0,end-80));
      layer.style.setProperty('--scene-reveal-start',begin+'px');layer.style.setProperty('--scene-reveal-end',end+'px');
      updateRevealMask(visibleLayer,layer,g,begin,end);
      for(const env of layer.querySelectorAll('.bocchi-environment')){
        const ys=layer.__environmentGeometry.yScale;
        env.style.setProperty('--environment-overlap-start',(ys+join)+'px');env.style.setProperty('--environment-overlap-end',(ys+join+4)+'px');
      }
      if(visibleLayer===currentLayer)Object.assign(state.environmentCap,{join,revealStart:begin,revealEnd:end,uniformSceneFade:false,transition:'background-colour-exposure',protectedFrom: end});
    }    updateOutputDither();
  }

  // Select ONE native width owner per branch. Generic mx-auto layout shells are excluded.
  function columnFor(start,main,composer=false) {
    if(composer) {const footer=start.closest('[data-pip-obstacle="thread-footer"]');if(footer&&main.contains(footer))return footer;}
    for(let el=start;el&&el!==main;el=el.parentElement) {
      if(typeof el.className!=='string')continue;const c=el.className;
      if(c.includes('mx-auto')&&(c.includes('max-w-')||c.includes('--thread-body-max-width'))&&box(el).width>220)return el;
    }
    return null;
  }
  function inspect(allowLight=false) {
    const pages=[...document.querySelectorAll(adapter.activePage)];
    if(pages.length!==1||!(root.dataset.theme==='dark'||allowLight&&root.dataset.theme==='light')||root.dir==='rtl')throw new Error('unknown-active-page-or-layout');
    const page=pages[0],surfaces=[...page.querySelectorAll(adapter.surface)].filter(visible);
    if(surfaces.length!==1)throw new Error('required-surface-missing');
    const main=surfaces[0];
    // Side-panel chats are a separate app surface even though they share <main>.
    const inMain=el=>visible(el)&&!el.closest('[data-app-shell-focus-area="right-panel"],[data-app-shell-focus-area="bottom-panel"],[role="dialog"],[role="alertdialog"]');
    const editors=[...main.querySelectorAll(adapter.composer)].filter(inMain);
    const requests=[...main.querySelectorAll(adapter.requestCard)].filter(inMain);
    const submitting=adapter.workSubmittingInput?[...main.querySelectorAll(adapter.workSubmittingInput)].filter(inMain):[];
    let editor=null,body=null,reader=null,scroll=null,mode=null,inputKind='composer';
    if(submitting.length){
      // Attachment submission replaces the editable div with a native busy,
      // read-only textbox. This is a validated input state, not a timed gap.
      if(submitting.length!==1||editors.length||requests.length)throw new Error('ambiguous-submitting-composer');
      const input=submitting[0],inputBody=input.closest(adapter.composerBody);
      const surface=inputBody?.closest('[data-composer-surface-variant="default"][role="presentation"][inert]');
      const host=surface?.closest(adapter.workComposerRoot),footer=host?.closest('[data-pip-obstacle="thread-footer"]');
      const footerHost=footer?.closest('[data-thread-scroll-footer="true"]');
      const threadScroll=footerHost?.closest(adapter.workThreadScroll);
      const readers=threadScroll?[...threadScroll.querySelectorAll(adapter.workReader)].filter(inMain):[];
      if(!inputBody||!surface||!host||!footer||!footerHost||!threadScroll||!main.contains(threadScroll)||
        !host.contains(inputBody)||!surface.contains(input)||readers.length!==1||readers[0].contains(input)||
        input.closest('[role="dialog"],[role="alertdialog"]'))throw new Error('unsupported-submitting-shell');
      body=inputBody;reader=readers[0];scroll=threadScroll;mode='work';inputKind='submitting';
    }else if(requests.length){
      // A supported native Work request card replaces the editor. Never infer this from labels or old page state.
      if(requests.length!==1)throw new Error('ambiguous-request-card');
      const card=requests[0],host=card.closest(adapter.workComposerRoot),footer=host?.closest('[data-pip-obstacle="thread-footer"]');
      const footerHost=footer?.closest('[data-thread-scroll-footer="true"]');
      const threadScroll=footerHost?.closest(adapter.workThreadScroll);
      const readers=threadScroll?[...threadScroll.querySelectorAll(adapter.workReader)].filter(visible):[];
      if(!host||!footer||!footerHost||!threadScroll||!main.contains(threadScroll)||!host.contains(card)||
        !footer.contains(host)||readers.length!==1||readers[0].contains(card)||editors.filter(el=>!card.contains(el)).length>1||
        editors.some(el=>!host.contains(el)||(!card.contains(el)&&!el.matches(adapter.localWorkComposer)))||
        card.closest('[data-app-shell-focus-area="right-panel"],[role="dialog"],[role="alertdialog"]'))throw new Error('unsupported-request-card-shell');
      body=card;reader=readers[0];scroll=threadScroll;mode='work';inputKind='request-card';
    }else{
      if(editors.length!==1)throw new Error('required-markers-missing');
      editor=editors[0];body=editor.closest(adapter.composerBody);
      if(!body||!main.contains(editor))throw new Error('composer-outside-main');
      mode=editor.matches(adapter.localWorkComposer)?'work':adapter.chatLabels.includes(editor.getAttribute('aria-label'))?'chat':null;
      if(!mode)throw new Error('unknown-mode');
      reader=[...main.querySelectorAll(adapter.chatReader)].find(inMain)||[...main.querySelectorAll('[data-thread-user-message-navigation-content]')].find(inMain)||null;
      scroll=editor.closest('.thread-scroll-container');
    }
    const composerColumn=columnFor(body,main,true),readerColumn=reader?columnFor(reader,main):null;
    if(!composerColumn||(reader&&!readerColumn))throw new Error('unknown-column-owner');
    const homeModes=!reader?[...main.querySelectorAll('[class*="@container/home-mode-toggle"]')].filter(inMain):[];
    const homeMode=homeModes.length===1?homeModes[0]:null;
    const greetings=homeMode?[...main.querySelectorAll('[class*="thread-content-max-width"]')].filter(el=>
      visible(el)&&typeof el.className==='string'&&el.className.includes('mx-auto')&&
      el.className.includes('w-[min(100%,var(--thread-content-max-width))]')&&
      el.querySelector('h1,[data-feature="game-source"].heading-xl')&&!el.contains(editor)):[];
    const homeGreeting=greetings.length===1?greetings[0]:null;
    const columns=new Set([composerColumn,readerColumn,homeGreeting].filter(Boolean));
    for(const first of [...columns])for(const second of [...columns])if(first!==second&&first.contains(second))columns.delete(second);
    // 26.1016 also marks titlebar/tab-row controls as main focus areas.
    // Select the content owner of this composer, never the first matching strip.
    const mainRect=box(main),focus=[...main.querySelectorAll('[data-app-shell-focus-area="main"]')].find(el=>
      visible(el)&&el.contains(body)&&!el.closest('[data-app-shell-titlebar]'));
    let area=intersection(mainRect,box(focus||scroll||main));
    const panels=[...page.querySelectorAll('[data-app-shell-focus-area="right-panel"]')].filter(el=>visible(el)&&box(el).width>180&&box(el).height>150);
    for(const panel of panels){const p=box(panel);if(p.left>area.left&&p.left<area.right)area=rect(area.left,area.top,p.left-area.left,area.height);}
    const headers=[...page.querySelectorAll('[data-app-shell-titlebar]')].filter(visible);
    for(const header of headers){const h=box(header);if(h.bottom>area.top&&h.bottom<area.bottom&&overlap(h,area))area=rect(area.left,h.bottom,area.width,area.bottom-h.bottom);}
    if(area.width<280||area.height<200)throw new Error('main-region-too-small');
    return {page,main,editor,body,mode,inputKind,reader,columns,composerColumn,readerColumn,homeMode,homeGreeting,mainRect,area,panels,scroll,focus};
  }
  function occupied(container,limit) {
    const result=[],clipCache=new Map(),parentVisibility=new Map(),parentBounds=new Map();
    function clippedBounds(el){
      if(!el||el===document.body)return limit;
      if(clipCache.has(el))return clipCache.get(el);
      let r=clippedBounds(el.parentElement),s=getComputedStyle(el),b=box(el);
      const clipX=/hidden|clip|auto|scroll/.test(s.overflowX),clipY=/hidden|clip|auto|scroll/.test(s.overflowY);
      if(clipX||clipY){const l=clipX?Math.max(r.left,b.left):r.left,t=clipY?Math.max(r.top,b.top):r.top,rr=clipX?Math.min(r.right,b.right):r.right,bb=clipY?Math.min(r.bottom,b.bottom):r.bottom;r=rect(l,t,Math.max(0,rr-l),Math.max(0,bb-t));}
      clipCache.set(el,r);return r;
    }
    function pushVisible(el,r,isText=false){const clipped=intersection(r,clippedBounds(isText?el:el.parentElement));if(clipped.width>1&&clipped.height>1&&overlap(clipped,limit))result.push(clipped);}
    for(const el of container.querySelectorAll('button,a,[role="button"],input,textarea,[contenteditable="true"],[data-composer-body]')) {
      if(el.closest('[data-bocchi-owned]'))continue;const r=box(el);if(!overlap(r,limit)||!visible(el))continue;pushVisible(el,r);
    }
    const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);let node,count=0;
    while((node=walker.nextNode())&&count++<4500) {
      if(!node.textContent.trim()||!node.parentElement||node.parentElement.closest('[data-bocchi-owned],style,script'))continue;
      let parent=parentBounds.get(node.parentElement);if(!parent){parent=box(node.parentElement);parentBounds.set(node.parentElement,parent);}
      if(parent.width>0&&parent.height>0&&!overlap(parent,limit))continue;
      if(!parentVisibility.has(node.parentElement))parentVisibility.set(node.parentElement,visible(node.parentElement));
      if(!parentVisibility.get(node.parentElement))continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const r of range.getClientRects())if(r.width>1&&r.height>1)pushVisible(node.parentElement,r,true);
    }
    return result;
  }
  function freeSpot(container,limit,size,xs,bottomFirst=false) {
    if(limit.width<size||limit.height<size)return null;const obstacles=occupied(container,limit);
    const start=bottomFirst?limit.bottom-size:limit.top,end=bottomFirst?limit.top:limit.bottom-size,step=bottomFirst?-8:8;
    for(let y=start;bottomFirst?y>=end:y<=end;y+=step)for(const x of xs){const r=rect(x,y,size,size);if(r.left>=limit.left&&r.right<=limit.right&&!obstacles.some(o=>overlap(r,o,12)))return r;}
    return null;
  }

  function updateBackdrop(ctx,left,width) {
    const {main,mainRect,area,panels,mode,body}=ctx;
    if(!backdrop){
      backdrop=owned('div','bocchi-backdrop');
      currentLayer=null;backdrop.append(owned('div','bocchi-reading-veil'));main.prepend(backdrop);showWallpaperLayer(currentAssets,false);
    }else if(backdrop.parentElement!==main)main.prepend(backdrop);
    const region={...rect(area.left,mainRect.top,area.width,mainRect.height),readingRight:left+width,panel:!!panels.length};
    place(backdrop,region);
    // The native 26.1016 surface owns the shape. Clip only the fixed wallpaper
    // plate; rounding the whole content would also clip menus and composers.
    // A panel seam is an interior edge, so it must not acquire an outer corner.
    const nativeShape=getComputedStyle(main),touchesLeft=Math.abs(region.left-mainRect.left)<=Math.max(1.1,parseFloat(nativeShape.borderLeftWidth)+.1),
      touchesRight=Math.abs(region.right-mainRect.right)<=Math.max(1.1,parseFloat(nativeShape.borderRightWidth)+.1);
    backdrop.style.borderTopLeftRadius=touchesLeft?nativeShape.borderTopLeftRadius:'0px';
    backdrop.style.borderBottomLeftRadius=touchesLeft?nativeShape.borderBottomLeftRadius:'0px';
    backdrop.style.borderTopRightRadius=touchesRight?nativeShape.borderTopRightRadius:'0px';
    backdrop.style.borderBottomRightRadius=touchesRight?nativeShape.borderBottomRightRadius:'0px';
    // Windows places the page header outside main. Its theme fill must follow
    // the same outer corners, or that independent square layer covers the cutout.
    // Round only its background; do not clip controls or change native layout.
    for(const header of ctx.page.querySelectorAll('[data-app-shell-titlebar]')){
      if(!visible(header))continue;
      const h=box(header),atTop=Math.abs(h.top-mainRect.top)<=1.1;
      if(atTop&&Math.abs(h.left-mainRect.left)<=1.1)property(header,'border-top-left-radius',nativeShape.borderTopLeftRadius);
      if(atTop&&Math.abs(h.right-mainRect.right)<=1.1)property(header,'border-top-right-radius',nativeShape.borderTopRightRadius);
    }
    // The backdrop extends beneath the titlebar. Begin the soft transition at
    // its actual lower edge, rather than fading only the first image pixels.
    backdrop.style.setProperty('--bocchi-header-inset',Math.max(0,area.top-mainRect.top)+'px');
    const bounds=layoutSceneCandidate(currentLayer,region,ctx);
    const {left:artLeft,top:artTop,width:artWidth,height:artHeight}=bounds;
    backdrop.style.setProperty('--bocchi-read-solid',Math.max(0,left+width-48)+'px');
    backdrop.style.setProperty('--bocchi-read-clear',Math.min(region.width,left+width+96)+'px');
    backdrop.dataset.panel=String(!!panels.length);backdrop.dataset.wallpaperId=state.wallpaperId;backdrop.dataset.environment=String(!!currentAssets.environmentAsset);
    const current=state.wallpaperId==='night-stage',hasReader=!!ctx.reader;
    const alpha=current?(mode==='work'?(hasReader?.72:.42):(hasReader?.40:.28)):(mode==='work'?(hasReader?.90:.72):(hasReader?.68:.58));
    backdrop.style.setProperty('--bocchi-veil-alpha',String(alpha));
    backdrop.style.setProperty('--bocchi-reading-paint',r15ReadingPaint(currentAssets.tone.rgb,alpha,Math.max(0,left+width-48),Math.min(region.width,left+width+96)));
    backdrop.dataset.readerDither=String(hasReader);
    state.palette=currentAssets.tone;state.visualRevision='R17.4';state.performanceRevision='R18';
    property(main,'isolation','isolate');
    // Recolor only observed background fades. Native text/scroll masks remain intact.
    for(const el of main.querySelectorAll('[class*="_MainContentTopFade_"]'))if(visible(el))mark(el,'data-bocchi-native-fade','top');
    const footer=body.closest('[data-pip-obstacle="thread-footer"]');
    if(footer){
      const host=footer.parentElement;
      for(const el of [host,...host.children]){
        if(el===body||el.closest('[data-bocchi-owned]')||!visible(el))continue;
        const s=getComputedStyle(el),r=box(el);
        if((s.backgroundImage.includes('linear-gradient')||el.hasAttribute('data-bocchi-native-fade'))&&r.height<=64&&r.width>=width*.8){
          mark(el,'data-bocchi-native-fade',ctx.reader?'bottom':'bottom-home');
          if(ctx.reader){property(el,'left',(box(body).left-box(host).left)+'px');property(el,'right','auto');property(el,'width',box(body).width+'px');}
        }
      }
      for(let el=footer;el&&el!==main;el=el.parentElement){
        const s=getComputedStyle(el);
        if(['rgb(24, 24, 24)','rgb(23, 23, 30)'].includes(s.backgroundColor)||el.hasAttribute('data-bocchi-native-fill'))mark(el,'data-bocchi-native-fill');
      }
      // Current desktop footer paints its two empty backdrop divs as nested siblings.
      // Restrict this to observed paint-only nodes next to the composer, never arbitrary gradients.
      for(const el of main.querySelectorAll('div.pointer-events-none.absolute.inset-x-0.z-0')){
        if(!visible(el)||el.childElementCount||el.textContent.trim()||el.closest('[data-bocchi-owned]'))continue;
        const s=getComputedStyle(el),r=box(el),b=box(body);
        if(r.width<width*.8||r.top<b.top-160||r.bottom< b.top-48||r.bottom>area.bottom+2)continue;
        if((s.backgroundImage.includes('linear-gradient')||el.hasAttribute('data-bocchi-native-fade'))&&r.height<=64){
          mark(el,'data-bocchi-native-fade',ctx.reader?'bottom':'bottom-home');
          if(ctx.reader){property(el,'left',(b.left-box(el.offsetParent||el.parentElement).left)+'px');property(el,'right','auto');property(el,'width',b.width+'px');}
        }
        if(s.backgroundColor==='rgb(24, 24, 24)'||el.hasAttribute('data-bocchi-native-fill'))mark(el,'data-bocchi-native-fill');
      }
    }
    Object.assign(state,{framing:bounds.framing,backgroundPlane:true,artBounds:{left:artLeft,top:artTop,width:artWidth,height:artHeight},backgroundRegion:{width:region.width,height:region.height,readingRight:region.readingRight},readerVeil:Number(backdrop.style.getPropertyValue('--bocchi-veil-alpha'))});
  }

  function buildStage(main) {
    if(stage?.parentElement===main)return;discard(stage);stage=owned('div','bocchi-stage-decor');
    const band=owned('img','bocchi-band-sticker');band.src=bandStickerUrl;band.alt='';
    stage.append(band);main.append(stage);
  }
  function updateDecor(ctx,left,width) {
    if(ctx.inputKind==='request-card'){
      // The card owns its interactions and visual surface; only backdrop and reading columns persist.
      discard(stage);stage=null;discard(side);side=null;discard(inputDetails);inputDetails=null;
      for(const sidebar of document.querySelectorAll('[data-app-shell-left-panel-appearance]')){
        const owner=sidebar.closest('[data-app-shell-active-page]');if(visible(sidebar)&&(!owner||owner===ctx.page))mark(sidebar,'data-bocchi-sidebar');
      }
      Object.assign(state,{decorations:false,sidebarSticker:false,emptySticker:false,emptyPage:false,scrapbook:{setlist:false,ticket:false,bandSticker:false,bandStickerBounds:null,sticker:false,gap:12}});
      return;
    }
    const {main,page,area,panels,editor,body,reader,homeGreeting,homeMode}=ctx;
    const blocked=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[role="menu"],[data-radix-popper-content-wrapper]')].some(el=>!el.closest('[data-bocchi-owned]')&&visible(el));
    const hasMessages=!!main.querySelector('[data-local-conversation-user-anchor],[data-user-message-bubble="true"],[data-message-author-role],[data-message-id],[data-markdown-text-style="assistant-message"]');
    const isHome=!!homeGreeting&&!reader&&!hasMessages;
    // Actual free space decides visibility; a width breakpoint alone must not remove the strip.
    const canDecorate=!blocked&&!panels.length;
    // The greeting moves upward; composer position and size remain native. Draft typing does not move the mascot.
    let homeSpot=null;
    if(isHome&&!blocked&&!panels.length&&area.width>=520){
      const b=box(body),g=box(homeGreeting),prior=parseFloat(homeGreeting.style.getPropertyValue('--bocchi-home-rise'))||0;
      const nativeBottom=g.bottom-prior;
      const modeControls=homeMode?[...homeMode.querySelectorAll('button,[role="button"]')].filter(visible):[];
      const topLimit=Math.max(area.top+12,...modeControls.map(el=>box(el).bottom+12));
      for(const size of [96,72]){
        const r=rect(b.left+b.width/2-size/2,b.top-size-16,size,size),targetBottom=r.top-16;
        if(targetBottom-g.height<topLimit||r.left<area.left+12||r.right>area.right-12)continue;
        const delta=targetBottom-nativeBottom;
        property(homeGreeting,'--bocchi-home-rise',delta+'px');mark(homeGreeting,'data-bocchi-home-raised');
        homeSpot=r;break;
      }
    }
    buildStage(main);place(stage,area);
    const band=stage.querySelector('.bocchi-band-sticker');
    const obstacles=canDecorate?occupied(main,area):[],reserved=state.starryVisible?[state.starryBounds]:[];
    for(const el of main.querySelectorAll('[data-pip-obstacle="thread-footer"],[data-composer-body],[data-home-greeting],[data-bocchi-home-mode],[data-thread-user-message-navigation]'))if(visible(el)&&!el.closest('[data-bocchi-owned]'))obstacles.push(box(el));
    if(reader){for(const el of main.querySelectorAll('nav'))if(visible(el))obstacles.push(box(el));obstacles.push(rect(area.left+left,area.top,width,area.height));}
    const relative=r=>rect(r.left-area.left,r.top-area.top,r.width,r.height);
    function fits(r){return r.left>=area.left+12&&r.top>=area.top+12&&r.right<=area.right-12&&r.bottom<=area.bottom-12&&![...obstacles,...reserved].some(o=>overlap(r,o,11.8));}
    function put(el,candidates){el.hidden=true;if(!canDecorate)return null;for(const r of candidates){if(!fits(r))continue;el.hidden=false;place(el,relative(r));reserved.push(r);return r;}return null;}
    if(homeSpot&&!fits(homeSpot))homeSpot=null;
    if(homeSpot)reserved.push(homeSpot);
    const bandCandidates=[],ratio=state.bandStickerHeight/state.bandStickerWidth;
    // Keep the lower-left anchor, then shrink around the conversation navigator.
    // At 64px wide the full four-person strip can still overlap its bottom edge.
    for(const w of [76,64,56,48,40,32]){
      if(reader&&left<12+w+12)continue;
      const h=w*ratio;bandCandidates.push(rect(area.left+12,area.bottom-h-24,w,h));
    }
    const bandSpot=put(band,bandCandidates);
    let empty=stage.querySelector('.bocchi-empty-sticker');
    if(homeSpot){if(!empty){empty=owned('img','bocchi-empty-sticker');empty.src=stickerUrl;empty.alt='';stage.append(empty);}place(empty,relative(homeSpot));}
    else if(empty)discard(empty);
    // The homepage owns the box Bocchi. Never insert a second copy in the sidebar.
    discard(side);side=null;
    for(const sidebar of document.querySelectorAll('[data-app-shell-left-panel-appearance]')){
      const owner=sidebar.closest('[data-app-shell-active-page]');if(visible(sidebar)&&(!owner||owner===page))mark(sidebar,'data-bocchi-sidebar');
    }
    const inputRoot=body.closest('[class*="_ComposerLayoutRoot_"]')||body;
    let detailHost=inputRoot.parentElement;
    while(detailHost&&getComputedStyle(detailHost).display==='contents')detailHost=detailHost.parentElement;
    if(!detailHost)throw new Error('composer-decoration-host-missing');
    if(inputDetails?.parentElement!==detailHost){
      discard(inputDetails);inputDetails=owned('div','bocchi-input-details');
      const emblem=owned('div','bocchi-composer-emblem');emblem.innerHTML="<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 66 54\" fill=\"none\"><path d=\"M39 33C34 16 20 8 5 11C22 4 36 13 41 29\" fill=\"#F3A5C5\" stroke=\"#513848\" stroke-width=\"1.5\" stroke-linejoin=\"round\"/><path d=\"M18 37L31 25L44 39L31 51Z\" fill=\"#86B8D2\" stroke=\"#DFE9EC\" stroke-width=\"1.6\" stroke-linejoin=\"round\"/><path d=\"M40 28L59 25L62 44L43 47Z\" fill=\"#E4C778\" stroke=\"#F0E4BB\" stroke-width=\"1.6\" stroke-linejoin=\"round\"/><path d=\"M21 37L31 28L34 31\" stroke=\"#C4E4F2\" stroke-width=\"1.3\" stroke-linecap=\"round\"/><path d=\"M44 31L56 29\" stroke=\"#FFF0BE\" stroke-width=\"1.3\" stroke-linecap=\"round\"/></svg>";inputDetails.append(emblem);detailHost.append(inputDetails);
    }
    if(getComputedStyle(detailHost).position==='static'||props.get(detailHost)?.has('position'))property(detailHost,'position','relative');
    const ir=box(inputRoot),hr=box(detailHost);place(inputDetails,rect(ir.left-hr.left,ir.top-hr.top,ir.width,ir.height));
    if(getComputedStyle(inputRoot).position==='static'||props.get(inputRoot)?.has('position'))property(inputRoot,'position','relative');
    property(inputRoot,'isolation','isolate');
    const nativeLayers=[body,...inputRoot.children].filter(el=>el!==inputDetails&&!el.hasAttribute('data-bocchi-owned'));
    inputDetails.style.zIndex=String(Math.max(0,...nativeLayers.map(el=>parseInt(getComputedStyle(el).zIndex,10)||0))+1);
    mark(inputRoot,'data-bocchi-composer');
    Object.assign(state,{decorations:!!bandSpot,sidebarSticker:false,emptySticker:!!homeSpot,emptyPage:isHome,
      scrapbook:{setlist:false,ticket:false,bandSticker:!!bandSpot,bandStickerBounds:bandSpot,sticker:!!homeSpot,gap:12}});
  }
  function retainedImagePreview(allowLight=false) {
    const prior=lastVerifiedContext;
    if(!prior||!prior.main.isConnected||
      (prior.reader&&(!prior.reader.isConnected||!prior.main.contains(prior.reader)))||root.dir==='rtl'||
      !(root.dataset.theme==='dark'||allowLight&&root.dataset.theme==='light'))return false;
    const pages=[...document.querySelectorAll(adapter.activePage)];
    if(pages.length!==1||pages[0]!==prior.page)return false;
    const surfaces=[...prior.page.querySelectorAll(adapter.surface)];
    if(surfaces.length!==1||surfaces[0]!==prior.main)return false;
    const viewers=[...document.querySelectorAll('[role="dialog"]')].filter(el=>visible(el)&&
      (el.querySelector('[data-testid="image-preview-dismiss-area"]')||
       el.matches('._chrome_vhnt9_2')&&el.querySelector('[data-image-preview-toolbar]')));
    // The native editable preview portals this SAME composer out of main.
    // Its original page and reader stay mounted. Verify node identity and the
    // inspected viewer markers, rather than treating it as missing input.
    const sameComposer=prior.body.isConnected&&(prior.main.contains(prior.body)||viewers.some(el=>el.contains(prior.body)));
    // Chat unmounts its conversation composer and creates an image-edit composer,
    // unlike Work's same-node portal. Retain only the verified conversation and
    // reader under the inspected native editable viewer, not an arbitrary dialog.
    const chatReplacement=prior.mode==='chat'&&!prior.body.isConnected&&prior.reader?.matches(adapter.chatReader)&&
      (viewers.some(el=>el.matches('._chrome_vhnt9_2')&&el.querySelector('[data-image-preview-toolbar]')&&
        [...el.querySelectorAll(adapter.composerBody)].some(body=>visible(body)&&body.querySelector(adapter.composer)))||
       state.imagePreview&&root.classList.contains('_active_vhnt9_2')&&root.classList.contains('_closing_vhnt9_2'));
    if(!sameComposer&&!chatReplacement)return false;
    // Verified 26.1016 image lightbox marker and its opening/closing View
    // Transition class. These are not a generic dialog/failed-inspection grace.
    // Keep the complete scene while native preview snapshots temporarily lock
    // the composer; never replace it with a partial frame or reinstall assets.
    return root.classList.contains('_active_vhnt9_2')||viewers.length>0;
  }
  function refresh() {
    if(stopped)return state;
    setLanguage();
    try {
      if(Date.now()>expiresAt)throw new Error('expired-loader-lease');
      if(retainedImagePreview()){
        if(control){closePicker(false);control.hidden=true;}
        Object.assign(state,{reason:'active',imagePreview:true,starryVisible:false});return state;
      }
      state.imagePreview=false;
      if(appearanceObserver&&root.dataset.theme==='light'){inspect(true);applyDarkAppearance();}
      const ctx=inspect(),{page,main,area,mainRect,columns,mode,reader,panels}=ctx;
      wantedAttrs=new Map();wantedProps=new Map();
      const hasPanel=panels.length>0,compact=area.width<1050;
      let left,width;
      if(hasPanel||area.width<=850){left=Math.min(44,Math.max(16,(area.width-240)/2));width=area.width-2*left;}
      else if(compact){left=56;width=Math.min(560,area.width-left-24);}
      else{left=Math.min(180,Math.max(76,area.width*.09));width=Math.min(740,Math.max(580,area.width*.555));}
      left=Math.round(left*10)/10;width=Math.round(Math.min(width,area.width-left-24));
      mark(root,'data-bocchi-active');mark(root,'data-bocchi-mode',mode);mark(root,'data-bocchi-panel',String(hasPanel));mark(root,'data-bocchi-compact',String(compact));
      mark(main,'data-bocchi-surface');mark(ctx.body,'data-bocchi-input-body');if(reader)mark(reader,'data-bocchi-reader');
      property(root,'--bocchi-wallpaper','url('+JSON.stringify(wallpaperUrl)+')');
      property(root,'--bocchi-scene-base',currentAssets.tone.css);
      property(root,'--bocchi-column-width',width+'px');property(root,'--bocchi-content-width',area.width+'px');
      updateBackdrop(ctx,left,width);
      for(const column of columns){mark(column,'data-bocchi-column','left');const r=box(column),margin=parseFloat(getComputedStyle(column).marginLeft)||0;
        property(column,'--bocchi-column-offset',(Math.round((area.left+left-(r.left-margin))*100)/100)+'px');}
      if(ctx.homeMode){
        // Preserve native mode-control width and typography; translate only its full-width host.
        mark(ctx.homeMode,'data-bocchi-home-mode');
        const r=box(ctx.homeMode),shift=parseFloat(getComputedStyle(ctx.homeMode).translate)||0;
        const nativeCenter=r.left+r.width/2-shift,targetCenter=area.left+left+width/2;
        property(ctx.homeMode,'--bocchi-home-shift',(Math.round((targetCenter-nativeCenter)*100)/100)+'px');
      }
      updateReaderClip(ctx);
      reconcile();updatePicker(ctx,left,width);updateEnvironmentCap(ctx);updateDecor(ctx,left,width);reconcile();
      const targets=new Set([root,main,ctx.focus||ctx.scroll||main,ctx.composerColumn,ctx.body,ctx.reader,ctx.homeGreeting,ctx.homeMode,...page.querySelectorAll('[data-app-shell-focus-area="right-panel"]')].filter(Boolean));
      for(const el of observed)if(!targets.has(el)){resize?.unobserve(el);observed.delete(el);}
      for(const el of targets)if(!observed.has(el)){resize?.observe(el);observed.add(el);}
      lastVerifiedContext=ctx;composerMissingSince=null;
      Object.assign(state,{installed:true,reason:'active',mode,inputKind:ctx.inputKind,width:Math.round(mainRect.width),height:Math.round(mainRect.height),
        composerTransition:false,
        contentWidth:Math.round(area.width),readingWidth:Math.round(area.width),columnLeft:left,columnWidth:width,hasPanel,reader:!!reader,
        activePages:1,homeGreetingAligned:!!ctx.homeGreeting,homeModeAligned:!!ctx.homeMode,columnCount:columns.size,
        columns:[...columns].map(el=>{const r=box(el);return{left:Math.round(r.left-area.left),width:Math.round(r.width)};})});
    } catch(error) {
      // Work replaces its editor briefly on a follow-up send. Keep only the already
      // verified same-page layout during that bounded gap; never bridge navigation,
      // ambiguous editors, an unsupported request card, a new surface or an expired lease.
      const prior=lastVerifiedContext,pages=[...document.querySelectorAll(adapter.activePage)];
      const surfaces=pages.length===1?[...pages[0].querySelectorAll(adapter.surface)].filter(visible):[];
      const transient=error?.message==='required-markers-missing'&&prior?.mode==='work'&&['composer','submitting'].includes(prior.inputKind)&&
        Date.now()<expiresAt&&root.dataset.theme==='dark'&&root.dir!=='rtl'&&pages.length===1&&pages[0]===prior.page&&
        surfaces.length===1&&surfaces[0]===prior.main&&visible(prior.reader)&&prior.main.contains(prior.reader)&&
        prior.reader.matches(adapter.workReader)&&
        ![...prior.main.querySelectorAll(adapter.composer)].some(el=>visible(el)&&!el.closest('[data-app-shell-focus-area="right-panel"]'))&&
        ![...prior.main.querySelectorAll(adapter.requestCard)].some(el=>visible(el)&&!el.closest('[data-app-shell-focus-area="right-panel"]'));
      if(transient){
        composerMissingSince??=Date.now();
        if(Date.now()-composerMissingSince<1000){
          Object.assign(state,{reason:'work-composer-transition',composerTransition:true});schedule();return state;
        }
      }
      remove(error?.message||'adapter-failure');
    }
    return state;
  }
  function schedule(){if(stopped||timer)return;timer=setTimeout(()=>{timer=null;refresh();},100);}
  try {
    validateCatalog();currentAssets=await loadWallpaper(initialWallpaperId);
    const wallpaper=currentAssets.main,small=await decodeAsset(sticker),band=await decodeAsset(bandSticker);
    wallpaperUrl=wallpaper.url;stickerUrl=small.url;bandStickerUrl=band.url;sticker=bandSticker=null;state.wallpaperId=initialWallpaperId;state.selectionPending=false;
    Object.assign(state,{imageLoaded:true,stickerLoaded:true,imageWidth:wallpaper.width,imageHeight:wallpaper.height,stickerWidth:small.width,stickerHeight:small.height,bandStickerLoaded:true,bandStickerWidth:band.width,bandStickerHeight:band.height});
    // Reject unsupported pages before replacing an existing, valid installation.
    inspect(true);if(Date.now()>expiresAt)throw new Error('expired-loader-lease');
    window.__BOCCHI_THEME__?.remove();
    acquireAppearance();inspect();
    // Migrate only the obsolete three-stop pixel mask written by this theme.
    // Older builds compared an unnormalized value and could leave it behind.
    for(const reader of document.querySelectorAll('[data-thread-user-message-navigation-content],[data-chatgpt-conversation-selection-target]')){
      const value=reader.style.getPropertyValue('mask-image');
      const match=value.match(/^linear-gradient\(rgb\(0, 0, 0\) 0px, rgb\(0, 0, 0\) ([\d.]+)px, (?:transparent|rgba\(0, 0, 0, 0\)) ([\d.]+)px\)$/);
      if(match&&((Number(match[2])-Number(match[1])>=19.8&&Number(match[2])-Number(match[1])<=20.2)||Number(match[2])<=20))reader.style.removeProperty('mask-image');
    }
    sheet=document.createElement('style');sheet.id='bocchi-theme-style-v2';sheet.textContent=css;document.head.append(sheet);
    api={state,refresh,setLanguage,prepareWallpaper,commitWallpaper,rejectWallpaper,heartbeat(until){if(Number.isFinite(until)&&until>Date.now())expiresAt=until;},remove};
    window.__BOCCHI_THEME__=api;
    observer=new MutationObserver(records=>{
      if(records.some(record=>!record.target?.closest?.('[data-bocchi-owned]')&&
        (record.type!=='childList'||[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType!==1||!node.hasAttribute('data-bocchi-owned'))))){
        // A verified new page must receive its already-decoded background before
        // the next paint. Message streaming still uses the ordinary debounce.
        const pages=[...document.querySelectorAll(adapter.activePage)];
        const mains=pages.length===1?[...pages[0].querySelectorAll(adapter.surface)].filter(visible):[];
        if(pages.length===1&&mains.length===1&&lastVerifiedContext&&
          (pages[0]!==lastVerifiedContext.page||mains[0]!==lastVerifiedContext.main)){
          try{inspect();}catch{schedule();return;}
          clearTimeout(timer);timer=null;refresh();
        }else{
          const structural=records.some(record=>record.type==='attributes'?
            !['data-state','aria-busy'].includes(record.attributeName):
            [...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&
              (node.matches('[data-app-shell-focus-area]')||node.contains(lastVerifiedContext?.body)||
               node.querySelector('[data-app-shell-focus-area="right-panel"]'))));
          if(structural){scheduleClip();scheduleFast();return;}
          scheduleClip();schedule();
        }
      }
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-app-shell-active-page','aria-label','aria-busy','aria-readonly','data-composer-input-layout','data-composer-input-variant','data-composer-surface-variant','data-codex-composer','data-state','hidden','aria-hidden','contenteditable','inert','data-codex-composer-request-navigation','data-codex-composer-root','data-composer-placement','data-pip-anchor-host']});
    observer.observe(root,{attributes:true,attributeFilter:['data-theme','dir','lang','class']});
    resize=new ResizeObserver(entries=>{
      scheduleClip();
      // Streamed reply height only moves the footer clip; it does not resize
      // the wallpaper. Structural size changes still run on the next frame.
      if(entries.some(entry=>entry.target!==lastVerifiedContext?.reader))scheduleFast();else schedule();
    });window.addEventListener('resize',scheduleFast);document.addEventListener('scroll',onThemeScroll,true);
    window.visualViewport?.addEventListener('resize',scheduleFast);window.visualViewport?.addEventListener('scroll',onThemeScroll);
    leaseTimer=setInterval(()=>{if(Date.now()>expiresAt)remove('expired-loader-lease');},1000);
    refresh();await settleRasterJobs();return state;
  } catch(error) {remove(error?.message||'asset-or-install-failure');return state;}
}
