import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {WallpaperCatalog,validateEnvironment} from '../engine/wallpaper-store.mjs';
const root=path.resolve(import.meta.dirname,'..');
const valid={image:'wallpapers/backstage/environment.png',nativeSize:{width:1448,height:1086},mainRect:[0,242,1448,1448*941/1672],edges:'top'};
test('environment registration accepts the actual native reference, rejects wrong paths and geometry',()=>{
 validateEnvironment(valid,'backstage');
 for(const bad of [{image:'../outside.png'},{image:'https://example.invalid/image.png'},{mainRect:[0,0,1448,5]},{nativeSize:{width:0,height:1086}},{edges:'top-bottom'}])assert.throws(()=>validateEnvironment({...valid,...bad},'backstage'));
 assert.throws(()=>validateEnvironment(valid,'color-portraits'));
});
test('environment corruption and missing asset retain the previous complete catalog',async()=>{
 const output=path.join(root,'.test-output');await fs.mkdir(output,{recursive:true});const temp=await fs.mkdtemp(path.join(output,'environment-'));
 await fs.cp(path.join(root,'theme'),temp,{recursive:true});const loader=new WallpaperCatalog(temp),original=await loader.load();
 assert.equal(original.catalog.length,6);assert.equal(original.catalog.filter(x=>x.environment).length,5);
 const file=path.join(temp,valid.image),saved=await fs.readFile(file);await fs.writeFile(file,'damaged');
 const damaged=await loader.load();assert.equal(damaged.catalog,original.catalog);assert.match(damaged.warning,/reload failed/);
 await fs.unlink(file);const missing=await loader.load();assert.equal(missing.catalog,original.catalog);assert.match(missing.warning,/reload failed/);
 await fs.writeFile(file,saved);const repaired=await loader.load();assert.equal(repaired.warning,null);assert.notEqual(repaired.catalog,original.catalog);
});
