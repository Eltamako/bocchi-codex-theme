async function installBocchiTheme({adapter, css, wallpaperCatalog, initialWallpaperId, selectionBridge, sticker, bandSticker, appVersion, leaseUntil}) {
  // This adapter is deliberately tied to the inspected desktop build.
  if (!adapter || adapter.schema !== 'bocchi-codex-adapter/1' || adapter.themeVersion !== '2.3.0' || appVersion !== adapter.appVersion)
    return {installed:false, reason:'version-mismatch'};
  if (!Number.isFinite(leaseUntil) || leaseUntil <= Date.now()) return {installed:false, reason:'expired-loader-lease'};
  if (typeof css !== 'string' || /@import\b|url\s*\(/i.test(css)) return {installed:false, reason:'nonlocal-stylesheet'};

  let stopped = false, timer = null, leaseTimer = null, observer = null, resize = null;
  let expiresAt = leaseUntil, sheet = null, backdrop = null, stage = null, side = null, inputDetails = null, api = null;
  let wallpaperUrl = null, stickerUrl = null, bandStickerUrl = null;
  const blobs = new Set(), nodes = new Set(), attrs = new Map(), props = new Map(), observed = new Set();
  let wantedAttrs = new Map(), wantedProps = new Map();
  let lastVerifiedContext=null, composerMissingSince=null;
  const root = document.documentElement;
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
    const entry=props.get(el).get(key); entry.last=value; entry.lastPriority=priority; rememberWanted(wantedProps,el,key);
    if(el.style.getPropertyValue(key)!==value || el.style.getPropertyPriority(key)!==priority) el.style.setProperty(key,value,priority);
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
  function discard(el) { if(!el)return; for(const child of [...nodes])if(child===el||el.contains(child)){child.remove();nodes.delete(child);} }
  function place(el,r) { const text=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`; if(el.style.cssText!==text)el.style.cssText=text; }
  function remove(reason='removed') {
    if(stopped)return {removed:true,reason:state.reason}; stopped=true;
    cleanupPicker();clearTimeout(timer); clearInterval(leaseTimer); observer?.disconnect(); resize?.disconnect();
    window.removeEventListener('resize',schedule); document.removeEventListener('scroll',schedule,true);
    window.visualViewport?.removeEventListener('resize',schedule);
    window.visualViewport?.removeEventListener('scroll',schedule);
    for(const [el,entries]of attrs)for(const [key,entry]of entries)restoreAttribute(el,key,entry);
    for(const [el,entries]of props)for(const [key,entry]of entries)restoreProperty(el,key,entry);
    for(const el of nodes)el.remove(); sheet?.remove();
    for(const url of blobs)URL.revokeObjectURL(url);
    attrs.clear();props.clear();nodes.clear();blobs.clear();observed.clear();wantedAttrs.clear();wantedProps.clear();
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
    try {await probe.decode();if(!probe.naturalWidth||!probe.naturalHeight)throw new Error('empty-image');return{url,width:probe.naturalWidth,height:probe.naturalHeight};}
    catch(error){URL.revokeObjectURL(url);blobs.delete(url);throw error;} finally {probe.removeAttribute('src');}
  }
  // The picker is an interactive sibling, never inside the inert decoration tree.
  const fixedIds=['night-stage','color-portraits','backstage','floating-bocchi'];
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
    if(!Array.isArray(wallpaperCatalog)||wallpaperCatalog.length!==4||!selectionBridge||selectionBridge.binding!=='__BOCCHI_SELECT_WALLPAPER__'||!/^\w{32}$/.test(selectionBridge.token))throw Error('invalid-wallpaper-catalog');
    wallpaperCatalog.forEach((entry,index)=>{
      if(entry.id!==fixedIds[index]||typeof entry.name!=='string'||entry.name.length>80||!entry.layout)throw Error('invalid-wallpaper-catalog');
      const l=entry.layout;
      for(const key of ['widthFraction','heightFraction','anchorY','featherLeft','featherTop','featherBottom','ambientOpacity'])if(!Number.isFinite(l[key])||l[key]<0||l[key]>1)throw Error('invalid-wallpaper-layout');
      if(l.widthFraction<.5||l.heightFraction<.5||l.featherLeft>.4||l.featherTop>.15||l.featherBottom>.15)throw Error('unsafe-wallpaper-layout');
      catalog.set(entry.id,entry);
    });
    if(!catalog.has(initialWallpaperId))initialWallpaperId='night-stage';
  }
  async function loadWallpaper(id){
    if(stopped||!catalog.has(id))throw Error('invalid-wallpaper-id');
    if(!assetCache.has(id))assetCache.set(id,(async()=>{
      const entry=catalog.get(id),main=await decodeAsset(entry.image);let ambient;
      if(stopped){URL.revokeObjectURL(main.url);blobs.delete(main.url);throw Error('theme-removed');}
      try{ambient=await decodeAsset(entry.background);}catch(error){URL.revokeObjectURL(main.url);blobs.delete(main.url);throw error;}
      if(stopped){URL.revokeObjectURL(main.url);URL.revokeObjectURL(ambient.url);throw Error('theme-removed');}
      const value={...entry,main,ambient};readyAssets.set(id,value);state.decodedWallpapers=readyAssets.size;return value;
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
    clearTimeout(requestTimer);state.selectionPending=false;state.lastSelectionError=String(text||'壁纸切换未完成，已保留原壁纸。').slice(0,160);message(/[\u4e00-\u9fff]/.test(state.lastSelectionError)?state.lastSelectionError:'壁纸切换未完成，已保留原壁纸。');updateChoices();return{ok:true};
  }
  function commitWallpaper(id,requestId){
    if(!validRequest(id,requestId)||!readyAssets.has(id))return{ok:false,id,requestId,reason:'stale-or-unprepared-request'};
    clearTimeout(requestTimer);currentAssets=readyAssets.get(id);wallpaperUrl=currentAssets.main.url;
    Object.assign(state,{wallpaperId:id,imageWidth:currentAssets.main.width,imageHeight:currentAssets.main.height,selectionPending:false,lastSelectionError:null});
    if(backdrop)showWallpaperLayer(currentAssets,true);updateChoices();refresh();
    if(!state.installed)return{ok:false,id,requestId,reason:state.reason};
    message('已切换：'+currentAssets.name);return{ok:true,id,requestId};
  }
  function chooseWallpaper(id){
    if(stopped||!catalog.has(id))return;
    const requestId=instanceId+'-'+(++requestSerial);Object.assign(state,{selectionRequestId:requestId,requestedWallpaperId:id,selectionPending:true});updateChoices();
    clearTimeout(requestTimer);requestTimer=setTimeout(()=>rejectWallpaper(requestId,'切换未完成，已保留原壁纸。'),12000);
    try{const binding=window[selectionBridge.binding];if(typeof binding!=='function')throw Error('bridge-unavailable');binding(JSON.stringify({token:selectionBridge.token,id,requestId}));}
    catch{rejectWallpaper(requestId,'壁纸加载器暂未连接，已保留原壁纸。');}
  }
  function createWallpaperLayer(asset){
    const layer=owned('div','bocchi-wallpaper-layer');layer.dataset.wallpaperId=asset.id;
    const ambient=owned('div','bocchi-ambience');ambient.style.backgroundImage='url('+JSON.stringify(asset.ambient.url)+')';ambient.style.opacity=String(asset.layout.ambientOpacity);
    const art=owned('img','bocchi-art');art.src=asset.main.url;art.alt='';
    if(asset.layout.ambientSource==='registered-floor-extension'){
      const scene=owned('div','bocchi-registered-scene');
      ambient.classList.add('bocchi-floor-extension');ambient.style.opacity='1';
      scene.append(ambient,art);layer.append(scene);
    }else layer.append(ambient,art);
    backdrop.insertBefore(layer,backdrop.querySelector('.bocchi-reading-veil'));return layer;
  }
  function layoutWallpaperLayer(layer,region){
    const asset=readyAssets.get(layer.dataset.wallpaperId),l=asset.layout;
    const protection=l.protectedRegion?.[0];
    const protectedWidth=!l.legacyCurrent&&region.width>=900&&Number.isFinite(protection)&&Number.isFinite(region.readingRight)?Math.max(280,(region.width-region.readingRight-12)/(1-protection)):Infinity;
    const width=Math.min(region.width*l.widthFraction,region.height*l.heightFraction*asset.main.width/asset.main.height,protectedWidth),height=width*asset.main.height/asset.main.width;
    const left=region.width-width,top=(region.height-height)*l.anchorY;
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
    }else{
      ambient.style.backgroundSize=(l.legacyCurrent?213:100/l.ambientCrop)+'% '+ambientHeight+'px';
      ambient.style.backgroundPosition='left '+(floor-ambientHeight*ambientAnchor)+'px';
    }
    for(const [key,value]of Object.entries(values))layer.style.setProperty(key,value);
    return{left,top,width,height};
  }
  function showWallpaperLayer(asset,animate){
    clearTimeout(transitionTimer);cancelAnimationFrame(frame);
    for(const layer of [...backdrop.querySelectorAll('.bocchi-wallpaper-layer')])if(layer!==currentLayer)discard(layer);
    const previous=currentLayer;currentLayer=createWallpaperLayer(asset);if(state.backgroundRegion)layoutWallpaperLayer(currentLayer,state.backgroundRegion);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(previous&&animate&&!reduced){
      currentLayer.style.opacity='0';void currentLayer.offsetWidth;
      frame=requestAnimationFrame(()=>{if(!stopped&&currentLayer){currentLayer.style.opacity='1';previous.style.opacity='0';}});
      transitionTimer=setTimeout(()=>discard(previous),210);
    }else{currentLayer.style.opacity='1';discard(previous);}
  }
  function updateChoices(){
    for(const item of picker?.querySelectorAll('[data-wallpaper-choice]')||[]){const id=item.dataset.wallpaperChoice;item.setAttribute('aria-checked',String(id===state.wallpaperId));item.dataset.pending=String(!!state.selectionPending&&id===state.requestedWallpaperId);item.querySelector('.bocchi-choice-state').textContent=id===state.wallpaperId?'使用中':state.selectionPending&&id===state.requestedWallpaperId?'加载中…':'';}
  }
  function closePicker(restoreFocus=true){if(!picker||picker.hidden)return;picker.hidden=true;signButton.setAttribute('aria-expanded','false');state.pickerOpen=false;if(restoreFocus&&!control.hidden)signButton.focus({preventScroll:true});}
  async function openPicker(){
    if(!control||control.hidden)return;
    picker.hidden=false;signButton.setAttribute('aria-expanded','true');state.pickerOpen=true;positionPicker();
    const items=[...picker.querySelectorAll('[data-wallpaper-choice]')];(items.find(x=>x.dataset.wallpaperChoice===state.wallpaperId)||items[0]).focus({preventScroll:true});
    await Promise.allSettled(items.map(async item=>{try{const asset=await loadWallpaper(item.dataset.wallpaperChoice);if(!stopped)item.querySelector('img').src=asset.main.url;}catch{if(!stopped)item.querySelector('.bocchi-choice-state').textContent='图片暂不可用';}}));
  }
  function positionPicker(){
    if(!picker||picker.hidden||!lastContext)return;const area=lastContext.area,b=box(signButton),single=area.width<740;
    picker.dataset.single=String(single);const w=Math.min(single?212:336,area.width-24);
    picker.style.width=w+'px';picker.style.maxHeight=Math.max(100,area.bottom-b.bottom-24)+'px';picker.style.left=Math.max(area.left+12,Math.min(b.right-w,area.right-w-12))+'px';picker.style.top=(b.bottom+12)+'px';
  }
  function buildPicker(){
    if(control)return;
    control=interactive('div','bocchi-picker-root');signButton=interactive('button','bocchi-sign bocchi-picker-trigger');signButton.type='button';signButton.setAttribute('aria-label','STARRY · 选择壁纸');signButton.setAttribute('aria-haspopup','menu');signButton.setAttribute('aria-expanded','false');
    signButton.append(interactive('b','','✦ STARRY'),interactive('small','','SHIMOKITAZAWA · BACKSTAGE'));
    picker=interactive('div','bocchi-picker-menu');picker.id='bocchi-wallpaper-menu';picker.setAttribute('role','menu');picker.setAttribute('aria-label','选择壁纸');picker.hidden=true;signButton.setAttribute('aria-controls',picker.id);
    for(const entry of catalog.values()){
      const button=interactive('button','bocchi-wallpaper-choice');button.type='button';button.dataset.wallpaperChoice=entry.id;button.setAttribute('role','menuitemradio');button.tabIndex=-1;
      const thumb=interactive('img','bocchi-choice-thumb');thumb.alt='';if(readyAssets.has(entry.id))thumb.src=readyAssets.get(entry.id).main.url;
      button.append(thumb,interactive('span','bocchi-choice-name',entry.name),interactive('span','bocchi-choice-state'));picker.append(button);listen(button,'click',()=>chooseWallpaper(entry.id));
    }
    notice=interactive('div','bocchi-picker-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;control.append(signButton,picker,notice);document.body.append(control);
    listen(signButton,'click',()=>picker.hidden?openPicker():closePicker());
    listen(signButton,'keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openPicker();}});
    listen(picker,'keydown',event=>{
      const items=[...picker.querySelectorAll('[data-wallpaper-choice]')],index=items.indexOf(document.activeElement),step=picker.dataset.single==='true'?1:2;
      let target=null;if(event.key==='ArrowRight')target=(index+1)%4;if(event.key==='ArrowLeft')target=(index+3)%4;if(event.key==='ArrowDown')target=(index+step)%4;if(event.key==='ArrowUp')target=(index+4-step)%4;if(event.key==='Home')target=0;if(event.key==='End')target=3;
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
    const {area,main}=ctx,small=area.width<900||ctx.panels.length>0,w=small?104:164,h=small?36:56;
    const candidates=[rect(area.right-w-16,area.top+16,w,h)];
    // On dense narrow pages use a free native titlebar gap, never cover body text or document controls.
    candidates.push(rect(area.right-w-110,ctx.mainRect.top+8,w,Math.min(h,36)));
    const obstacles=occupied(ctx.page,rect(area.left,ctx.mainRect.top,area.width,ctx.mainRect.height));
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

  // Select ONE native width owner per branch. Generic mx-auto layout shells are excluded.
  function columnFor(start,main,composer=false) {
    if(composer) {const footer=start.closest('[data-pip-obstacle="thread-footer"]');if(footer&&main.contains(footer))return footer;}
    for(let el=start;el&&el!==main;el=el.parentElement) {
      if(typeof el.className!=='string')continue;const c=el.className;
      if(c.includes('mx-auto')&&(c.includes('max-w-')||c.includes('--thread-body-max-width'))&&box(el).width>220)return el;
    }
    return null;
  }
  function inspect() {
    const pages=[...document.querySelectorAll(adapter.activePage)];
    if(pages.length!==1||root.dataset.theme!=='dark'||root.dir==='rtl')throw new Error('unknown-active-page-or-layout');
    const page=pages[0],surfaces=[...page.querySelectorAll(adapter.surface)].filter(visible);
    if(surfaces.length!==1)throw new Error('required-surface-missing');
    const main=surfaces[0],editors=[...main.querySelectorAll(adapter.composer)].filter(visible);
    const requests=[...main.querySelectorAll(adapter.requestCard)].filter(visible);
    let editor=null,body=null,reader=null,scroll=null,mode=null,inputKind='composer';
    if(requests.length){
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
      reader=[...main.querySelectorAll(adapter.chatReader)].find(visible)||[...main.querySelectorAll('[data-thread-user-message-navigation-content]')].find(visible)||null;
      scroll=editor.closest('.thread-scroll-container');
    }
    const composerColumn=columnFor(body,main,true),readerColumn=reader?columnFor(reader,main):null;
    if(!composerColumn||(reader&&!readerColumn))throw new Error('unknown-column-owner');
    const homeModes=!reader?[...main.querySelectorAll('[class*="@container/home-mode-toggle"]')].filter(visible):[];
    const homeMode=homeModes.length===1?homeModes[0]:null;
    const greetings=homeMode?[...main.querySelectorAll('[class*="thread-content-max-width"]')].filter(el=>
      visible(el)&&typeof el.className==='string'&&el.className.includes('mx-auto')&&
      el.className.includes('w-[min(100%,var(--thread-content-max-width))]')&&
      el.querySelector('h1,[data-feature="game-source"].heading-xl')&&!el.contains(editor)):[];
    const homeGreeting=greetings.length===1?greetings[0]:null;
    const columns=new Set([composerColumn,readerColumn,homeGreeting].filter(Boolean));
    for(const first of [...columns])for(const second of [...columns])if(first!==second&&first.contains(second))columns.delete(second);
    const mainRect=box(main),focus=[...main.querySelectorAll('[data-app-shell-focus-area="main"]')].find(visible);
    let area=intersection(mainRect,box(focus||scroll||main));
    const panels=[...page.querySelectorAll('[data-app-shell-focus-area="right-panel"]')].filter(el=>visible(el)&&box(el).width>180&&box(el).height>150);
    for(const panel of panels){const p=box(panel);if(p.left>area.left&&p.left<area.right)area=rect(area.left,area.top,p.left-area.left,area.height);}
    const headers=[...page.querySelectorAll('[data-app-shell-titlebar]')].filter(visible);
    for(const header of headers){const h=box(header);if(h.bottom>area.top&&h.bottom<area.bottom&&overlap(h,area))area=rect(area.left,h.bottom,area.width,area.bottom-h.bottom);}
    if(area.width<280||area.height<200)throw new Error('main-region-too-small');
    return {page,main,editor,body,mode,inputKind,reader,columns,composerColumn,readerColumn,homeMode,homeGreeting,mainRect,area,panels,scroll,focus};
  }
  function occupied(container,limit) {
    const result=[],clipCache=new Map();
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
      if(!visible(el)||el.closest('[data-bocchi-owned]'))continue;const r=box(el);pushVisible(el,r);
    }
    const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);let node,count=0;
    while((node=walker.nextNode())&&count++<4500) {
      if(!node.textContent.trim()||!node.parentElement||node.parentElement.closest('[data-bocchi-owned],style,script')||!visible(node.parentElement))continue;
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
    if(backdrop?.parentElement!==main){
      discard(backdrop);backdrop=owned('div','bocchi-backdrop');
      currentLayer=null;backdrop.append(owned('div','bocchi-reading-veil'));main.prepend(backdrop);showWallpaperLayer(currentAssets,false);
    }
    const region={...rect(area.left,mainRect.top,area.width,mainRect.height),readingRight:left+width};
    place(backdrop,region);
    for(const layer of backdrop.querySelectorAll('.bocchi-wallpaper-layer'))layoutWallpaperLayer(layer,region);
    const bounds=layoutWallpaperLayer(currentLayer,region),{left:artLeft,top:artTop,width:artWidth,height:artHeight}=bounds;
    backdrop.style.setProperty('--bocchi-read-solid',Math.max(0,left+width-48)+'px');
    backdrop.style.setProperty('--bocchi-read-clear',Math.min(region.width,left+width+96)+'px');
    backdrop.dataset.panel=String(!!panels.length);backdrop.dataset.wallpaperId=state.wallpaperId;
    const current=state.wallpaperId==='night-stage';backdrop.style.setProperty('--bocchi-veil-alpha',String(current?(mode==='work'?.42:.28):(mode==='work'?.72:.58)));
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
    Object.assign(state,{backgroundPlane:true,artBounds:{left:artLeft,top:artTop,width:artWidth,height:artHeight},backgroundRegion:{width:region.width,height:region.height,readingRight:region.readingRight},readerVeil:Number(backdrop.style.getPropertyValue('--bocchi-veil-alpha'))});
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
    const obstacles=occupied(main,area),reserved=state.starryVisible?[state.starryBounds]:[];
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
  function refresh() {
    if(stopped)return state;
    try {
      if(Date.now()>expiresAt)throw new Error('expired-loader-lease');
      const ctx=inspect(),{page,main,area,mainRect,columns,mode,reader,panels}=ctx;
      wantedAttrs=new Map();wantedProps=new Map();
      const hasPanel=panels.length>0,compact=area.width<1050;
      let left,width;
      if(hasPanel||area.width<=850){left=Math.min(44,Math.max(16,(area.width-240)/2));width=area.width-2*left;}
      else if(compact){left=56;width=Math.min(560,area.width-left-24);}
      else{left=Math.min(180,Math.max(76,area.width*.09));width=Math.min(740,Math.max(580,area.width*.555));}
      left=Math.round(left*10)/10;width=Math.round(Math.min(width,area.width-left-24));
      mark(root,'data-bocchi-active');mark(root,'data-bocchi-mode',mode);mark(root,'data-bocchi-panel',String(hasPanel));mark(root,'data-bocchi-compact',String(compact));
      mark(main,'data-bocchi-surface');if(reader)mark(reader,'data-bocchi-reader');
      property(root,'--bocchi-wallpaper','url('+JSON.stringify(wallpaperUrl)+')');
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
      // A stale previous page must lose its marks before any new decorations are shown.
      // Fade only the scrolling text, not the wallpaper. The whole emblem has 12px text clearance.
      if(reader&&ctx.inputKind!=='request-card'){
        const r=box(reader),clear=Math.max(0,box(ctx.body).top-30-r.top);
        if(clear<r.height)property(reader,'mask-image','linear-gradient(to bottom,#000 0px,#000 '+Math.max(0,clear-20)+'px,transparent '+clear+'px)');
      }
      reconcile();updatePicker(ctx,left,width);updateDecor(ctx,left,width);reconcile();
      const targets=new Set([root,main,ctx.focus||ctx.scroll||main,ctx.composerColumn,ctx.homeGreeting,ctx.homeMode].filter(Boolean));
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
      const transient=error?.message==='required-markers-missing'&&prior?.mode==='work'&&prior.inputKind==='composer'&&
        Date.now()<expiresAt&&root.dataset.theme==='dark'&&root.dir!=='rtl'&&pages.length===1&&pages[0]===prior.page&&
        surfaces.length===1&&surfaces[0]===prior.main&&visible(prior.reader)&&prior.main.contains(prior.reader)&&
        prior.reader.matches(adapter.workReader)&&
        ![...prior.main.querySelectorAll(adapter.composer)].some(visible)&&
        ![...prior.main.querySelectorAll(adapter.requestCard)].some(visible);
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
    inspect();if(Date.now()>expiresAt)throw new Error('expired-loader-lease');
    window.__BOCCHI_THEME__?.remove();
    sheet=document.createElement('style');sheet.id='bocchi-theme-style-v2';sheet.textContent=css;document.head.append(sheet);
    api={state,refresh,prepareWallpaper,commitWallpaper,rejectWallpaper,heartbeat(until){if(Number.isFinite(until)&&until>Date.now())expiresAt=until;},remove};
    window.__BOCCHI_THEME__=api;
    observer=new MutationObserver(records=>{
      if(records.some(record=>!record.target?.closest?.('[data-bocchi-owned]')&&
        (record.type!=='childList'||[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType!==1||!node.hasAttribute('data-bocchi-owned')))))schedule();
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-app-shell-active-page','aria-label','data-composer-input-variant','data-codex-composer','data-state','hidden','aria-hidden','contenteditable','inert','data-codex-composer-request-navigation','data-codex-composer-root','data-composer-placement','data-pip-anchor-host']});
    observer.observe(root,{attributes:true,attributeFilter:['data-theme','dir']});
    resize=new ResizeObserver(schedule);window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);
    window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
    leaseTimer=setInterval(()=>{if(Date.now()>expiresAt)remove('expired-loader-lease');},1000);
    refresh();return state;
  } catch(error) {remove(error?.message||'asset-or-install-failure');return state;}
}
