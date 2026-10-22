import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {inflateSync} from 'node:zlib';

export const WALLPAPER_IDS=Object.freeze(['night-stage','color-portraits','backstage','floating-bocchi','winter-night','headphone-evening']);
export const DEFAULT_ID=WALLPAPER_IDS[0];
export const BINDING='__BOCCHI_SELECT_WALLPAPER__';
export const ENVIRONMENT_IDS=Object.freeze(['night-stage','backstage','floating-bocchi','winter-night','headphone-evening']);
export function validateEnvironment(value,id){
 if(value===undefined)return;
 if(!ENVIRONMENT_IDS.includes(id)||!value||typeof value!=='object'||Array.isArray(value)||value.image!==`wallpapers/${id}/environment.png`)throw Error('Unexpected environment asset path');
 const n=value.nativeSize,r=value.mainRect;
 if(!n||!Number.isInteger(n.width)||!Number.isInteger(n.height)||n.width<1||n.height<1||n.width>16384||n.height>16384)throw Error('Invalid environment native size');
 // A registration rectangle may extend horizontally beyond a partial environment
 // plate; it describes the original scene coordinates, not a source crop.
 if(!Array.isArray(r)||r.length!==4||r.some(v=>!Number.isFinite(v))||r[0]<-n.width*.5||r[1]<0||r[2]<=0||r[2]>n.width*2||r[3]<=0||r[0]+r[2]>n.width*1.5||r[1]+r[3]>n.height*1.15||r[1]+r[3]*.15>n.height||Math.abs(r[2]/r[3]-1672/941)>.002)throw Error('Invalid environment registration');
 if(!['top','top-bottom'].includes(value.edges)||value.edges==='top-bottom'&&id!=='headphone-evening')throw Error('Invalid environment extent');
}
export function validateLayout(entry){
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

}
const LIMIT=10*1024*1024;
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(b){let crc=0xffffffff;for(const v of b)crc=crcTable[(crc^v)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
export function validatePng(b){
 if(b.length>LIMIT||b.length<45||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid or oversized PNG');
 let p=8,header=null,ended=false;const data=[];
 while(p<b.length){if(p+12>b.length)throw Error('Truncated PNG');const len=b.readUInt32BE(p),end=p+12+len;if(end>b.length)throw Error('Truncated PNG chunk');const type=b.toString('ascii',p+4,p+8);if(crc32(b.subarray(p+4,p+8+len))!==b.readUInt32BE(p+8+len))throw Error('PNG CRC mismatch');if(!header&&type!=='IHDR')throw Error('PNG IHDR missing');if(type==='IHDR'){if(header||len!==13)throw Error('Invalid PNG IHDR');header=b.subarray(p+8,p+8+len);}if(type==='IDAT')data.push(b.subarray(p+8,p+8+len));if(type==='IEND'){if(len||end!==b.length)throw Error('Invalid PNG IEND');ended=true;}p=end;}
 if(!ended||!data.length)throw Error('Incomplete PNG');const w=header.readUInt32BE(0),h=header.readUInt32BE(4),depth=header[8],color=header[9],channels={0:1,2:3,3:1,4:2,6:4}[color];
 if(!w||!h||w>16384||h>16384||!channels||!({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]}[color].includes(depth))||header[10]||header[11]||header[12]>1)throw Error('Unsupported PNG header');
 const passes=header[12]?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];let expected=0;const rows=[];
 for(const[x,y,dx,dy]of passes){const pw=Math.max(0,Math.ceil((w-x)/dx)),ph=Math.max(0,Math.ceil((h-y)/dy));if(pw&&ph){const row=Math.ceil(pw*channels*depth/8)+1;expected+=row*ph;rows.push([row,ph]);}}
 if(expected>256*1024*1024)throw Error('Decoded PNG too large');const raw=inflateSync(Buffer.concat(data),{maxOutputLength:expected});if(raw.length!==expected)throw Error('PNG raster length mismatch');let offset=0;for(const[row,count]of rows)for(let n=0;n<count;n++,offset+=row)if(raw[offset]>4)throw Error('Invalid PNG filter');return b;
}
async function signature(file){try{const s=await fs.stat(file,{bigint:true});if(!s.isFile())throw Error('Not a file');return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;}catch(e){return 'ERROR:'+e.message;}}
async function safeFile(root,relative){
 if(typeof relative!=='string'||!relative||relative.includes('\\')||path.isAbsolute(relative)||/^[a-z]+:/i.test(relative)||relative.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Wallpaper path must be relative within theme');
 // Reject reparse links at the root and every child. Avoid realpath's traversal of
 // protected Windows Desktop ancestors; the supplied theme root is the boundary.
 let current=root;for(const part of ['',...relative.split('/')]){if(part)current=path.join(current,part);const info=await fs.lstat(current);if(info.isSymbolicLink())throw Error('Wallpaper path escapes theme via link');}
 return current;
}
export class WallpaperCatalog {
 constructor(themeDir){this.root=path.resolve(themeDir);this.cached=null;this.tracked=['wallpapers.json'];this.lastSignature=null;this.warning=null;this.loads=0;}
 async load(){
  const sig=(await Promise.all(this.tracked.map(async name=>`${name}:${await signature(path.join(this.root,name))}`))).join('|');
  if(sig===this.lastSignature){if(this.cached)return{catalog:this.cached,warning:this.warning};throw Error(this.warning);}
  try{
   const manifestFile=await safeFile(this.root,'wallpapers.json'),stat=await fs.stat(manifestFile);if(stat.size>64000)throw Error('Wallpaper manifest too large');
   const m=JSON.parse(await fs.readFile(manifestFile,'utf8'));if(m.schema!=='bocchi-wallpapers/1'||m.defaultId!==DEFAULT_ID||!Array.isArray(m.wallpapers)||m.wallpapers.length!==WALLPAPER_IDS.length)throw Error('Invalid wallpaper manifest');
   const tracked=['wallpapers.json'];const out=[];
   for(let i=0;i<WALLPAPER_IDS.length;i++){
    const item=m.wallpapers[i];if(!item||item.id!==WALLPAPER_IDS[i]||typeof item.name!=='string'||!item.name.trim()||item.name.length>80||!item.layout||typeof item.layout!=='object'||Array.isArray(item.layout))throw Error('Invalid wallpaper ID, order, name or layout');
    for(const key of ['image','background']){if(item[key]!==`wallpapers/${item.id}/${key==='image'?'main':'background'}.png`)throw Error('Unexpected wallpaper asset path');tracked.push(item[key]);}
    validateLayout(item);validateEnvironment(item.environment,item.id);if(item.environment)tracked.push(item.environment.image);
   }
   this.tracked=tracked;
   for(const item of m.wallpapers){
    const row={id:item.id,name:item.name,layout:item.layout};
    for(const key of ['image','background']){const file=await safeFile(this.root,item[key]);if((await fs.stat(file)).size>LIMIT)throw Error('Oversized PNG');row[key]='data:image/png;base64,'+validatePng(await fs.readFile(file)).toString('base64');}
    if(item.environment){
     const file=await safeFile(this.root,item.environment.image);if((await fs.stat(file)).size>LIMIT)throw Error('Oversized environment PNG');
     const b=validatePng(await fs.readFile(file)),n=item.environment.nativeSize;
     if(b.readUInt32BE(16)!==n.width||b.readUInt32BE(20)!==n.height)throw Error('Environment native size mismatch');
     row.environment={...item.environment,image:'data:image/png;base64,'+b.toString('base64')};
    }
    out.push(row);
   }
   this.cached=out;this.loads++;this.warning=null;
  }catch(e){this.warning='Wallpaper catalog reload failed: '+(e.code?'asset-read-failed':e instanceof SyntaxError?'invalid-json':/^[A-Za-z][A-Za-z0-9 ,.-]{0,100}$/.test(e.message)?e.message:'invalid-asset');}
  this.lastSignature=(await Promise.all(this.tracked.map(async name=>`${name}:${await signature(path.join(this.root,name))}`))).join('|');
  if(!this.cached)throw Error(this.warning);return{catalog:this.cached,warning:this.warning};
 }
}
export async function atomicSelection(file,id,io=fs){
 if(!WALLPAPER_IDS.includes(id))throw Error('Invalid wallpaper selection');const tmp=file+'.tmp-'+process.pid+'-'+randomBytes(8).toString('hex');let handle;
 try{handle=await io.open(tmp,'wx',0o600);await handle.writeFile(JSON.stringify({schema:'bocchi-wallpaper-selection/1',wallpaperId:id,updatedAt:new Date().toISOString()},null,2),'utf8');await handle.sync();await handle.close();handle=null;await io.rename(tmp,file);}finally{if(handle)await handle.close().catch(()=>{});await io.unlink(tmp).catch(()=>{});}
}
export async function readSelection(file){
 try{const stat=await fs.stat(file);if(stat.size>4096)throw Error('Preference too large');const value=JSON.parse(await fs.readFile(file,'utf8'));if(value.schema!=='bocchi-wallpaper-selection/1'||!WALLPAPER_IDS.includes(value.wallpaperId))throw Error('Invalid preference');return{id:value.wallpaperId,warning:null};}catch(e){return{id:DEFAULT_ID,warning:`Wallpaper preference ${e.code==='ENOENT'?'missing':'invalid'}; using ${DEFAULT_ID}`};}
}
export function parseSelectionEvent(payload,token){
 if(typeof payload!=='string'||payload.length>1024)return null;try{const p=JSON.parse(payload);if(p.token!==token||!WALLPAPER_IDS.includes(p.id)||typeof p.requestId!=='string'||!p.requestId||p.requestId.length>128)return null;return{id:p.id,requestId:p.requestId};}catch{return null;}
}
export function authorizedSelectionEvent(session,event){
 const params=event?.params,context=session?.contexts?.get(params?.executionContextId);
 if(event?.method!=='Runtime.bindingCalled'||params?.name!==BINDING||session.disposed||session.contextId===null||params.executionContextId!==session.contextId||!session.token||context?.auxData?.isDefault!==true||context.auxData.frameId!==session.frameId)return null;
 return parseSelectionEvent(params.payload,session.token);
}
// One coordinator owns a document. Retire and await idle before creating its successor.
export class SelectionCoordinator {
 constructor({initialId,prepare,commit,reject,getState,save,validate=async()=>true,onError=()=>{}}){Object.assign(this,{displayedId:initialId,prepare,commit,reject,getState,save,validate,onError});this.active=true;this.latest=null;this.worker=null;this.seen=new Set();}
 request(r){if(!this.active||!r||!WALLPAPER_IDS.includes(r.id)||typeof r.requestId!=='string'||this.seen.has(r.requestId))return false;this.seen.add(r.requestId);this.latest=r;if(!this.worker)this.worker=this.drain().finally(()=>{this.worker=null;});return true;}
 async matches(r){if(!this.active||this.latest!==r)return false;const s=await this.getState();return this.active&&this.latest===r&&s?.selectionRequestId===r.requestId&&s?.requestedWallpaperId===r.id;}
 async drain(){
  while(this.active&&this.latest){const r=this.latest,previous=this.displayedId;let saved=false,committed=false;
   try{
    if(!await this.matches(r)||!await this.validate())continue;
    const prepared=await this.prepare(r);if(!prepared?.ok||prepared.id!==r.id||prepared.requestId!==r.requestId)throw Error('Wallpaper preparation failed');
    if(!await this.matches(r)||!await this.validate())continue;
    await this.save(r.id);saved=true;
    if(!await this.matches(r))continue;
    const result=await this.commit(r);if(result?.ok&&result.id===r.id&&result.requestId===r.requestId){committed=true;this.displayedId=r.id;}
    else throw Error('Wallpaper commit failed');
   }catch(e){
    // A lost CDP reply can follow a successful commit: reconcile observable state.
    if(saved&&this.active){try{const s=await this.getState();if(s?.wallpaperId===r.id){committed=true;this.displayedId=r.id;}}catch{}}
    this.onError(e);if(this.active&&this.latest===r&&!committed)try{await this.reject(r,'wallpaper-selection-failed');}catch{}
   }finally{
    if(saved&&!committed){try{await this.save(previous);}catch(e){this.active=false;this.onError(Error('Preference rollback failed: '+e.message));}}
    if(this.latest===r)this.latest=null;
   }
  }
 }
 async idle(){while(this.worker)await this.worker;}
 async retire(){this.active=false;this.latest=null;await this.idle();}
}
