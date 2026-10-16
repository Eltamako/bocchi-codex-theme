import fs from 'node:fs/promises';
import path from 'node:path';
import {WallpaperCatalog,validatePng} from '../engine/wallpaper-store.mjs';
const root=path.resolve(import.meta.dirname,'..');
await new WallpaperCatalog(path.join(root,'theme')).load();
for(const name of ['sticker.png','band-sticker.png'])validatePng(await fs.readFile(path.join(root,'theme',name)));
console.log('All four wallpapers and both stickers passed PNG validation.');
