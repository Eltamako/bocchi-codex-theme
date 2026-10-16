import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {inflateSync} from 'node:zlib';

export const WALLPAPER_IDS=Object.freeze(['night-stage','color-portraits','backstage','floating-bocchi']);
export const DEFAULT_ID=WALLPAPER_IDS[0];
export const BINDING='__BOCCHI_SELECT_WALLPAPER__';
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
   const m=JSON.parse(await fs.readFile(manifestFile,'utf8'));if(m.schema!=='bocchi-wallpapers/1'||m.defaultId!==DEFAULT_ID||!Array.isArray(m.wallpapers)||m.wallpapers.length!==4)throw Error('Invalid wallpaper manifest');
   const tracked=['wallpapers.json'];const out=[];
   for(let i=0;i<4;i++){
    const item=m.wallpapers[i];if(!item||item.id!==WALLPAPER_IDS[i]||typeof item.name!=='string'||!item.name.trim()||item.name.length>120||!item.layout||typeof item.layout!=='object'||Array.isArray(item.layout))throw Error('Invalid wallpaper ID, order, name or layout');
    for(const key of ['image','background']){if(item[key]!==`wallpapers/${item.id}/${key==='image'?'main':'background'}.png`)throw Error('Unexpected wallpaper asset path');tracked.push(item[key]);}
   }
   this.tracked=tracked;
   for(const item of m.wallpapers){const row={id:item.id,name:item.name,layout:item.layout};for(const key of ['image','background']){const file=await safeFile(this.root,item[key]);if((await fs.stat(file)).size>LIMIT)throw Error('Oversized PNG');row[key]='data:image/png;base64,'+validatePng(await fs.readFile(file)).toString('base64');}out.push(row);}
   this.cached=out;this.loads++;this.warning=null;
  }catch(e){this.warning='Wallpaper catalog reload failed: '+e.message;}
  this.lastSignature=(await Promise.all(this.tracked.map(async name=>`${name}:${await signature(path.join(this.root,name))}`))).join('|');
  if(!this.cached)throw Error(this.warning);return{catalog:this.cached,warning:this.warning};
 }
}
export async function atomicSelection(file,id,io=fs){
 if(!WALLPAPER_IDS.includes(id))throw Error('Invalid wallpaper selection');const tmp=file+'.tmp-'+process.pid+'-'+randomBytes(8).toString('hex');let handle;
 try{handle=await io.open(tmp,'wx',0o600);await handle.writeFile(JSON.stringify({schema:'bocchi-wallpaper-selection/1',wallpaperId:id,updatedAt:new Date().toISOString()},null,2),'utf8');await handle.sync();await handle.close();handle=null;await io.rename(tmp,file);}finally{if(handle)await handle.close().catch(()=>{});await io.unlink(tmp).catch(()=>{});}
}
export async function readSelection(file){
 try{const stat=await fs.stat(file);if(stat.size>4096)throw Error('Preference too large');const value=JSON.parse(await fs.readFile(file,'utf8'));if(value.schema!=='bocchi-wallpaper-selection/1'||!WALLPAPER_IDS.includes(value.wallpaperId))throw Error('Invalid preference');return{id:value.wallpaperId,warning:null};}catch(e){return{id:DEFAULT_ID,warning:`Wallpaper preference ${e.code==='ENOENT'?'missing':'invalid'}; using ${DEFAULT_ID}: ${e.message}`};}
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
    this.onError(e);if(this.active&&this.latest===r&&!committed)try{await this.reject(r,e.message);}catch{}
   }finally{
    if(saved&&!committed){try{await this.save(previous);}catch(e){this.active=false;this.onError(Error('Preference rollback failed: '+e.message));}}
    if(this.latest===r)this.latest=null;
   }
  }
 }
 async idle(){while(this.worker)await this.worker;}
 async retire(){this.active=false;this.latest=null;await this.idle();}
}
