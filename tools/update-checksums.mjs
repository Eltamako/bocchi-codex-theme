import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const rootFiles=['README.md','README.en.md','Install.cmd','Start.cmd','Pause.cmd','Resume.cmd','Restore.cmd','Language.cmd','06-语言设置.cmd','Language.ps1','LICENSE','THIRD_PARTY_NOTICES.md','ASSETS.md','CHANGELOG.md','release.json','.gitignore','.gitattributes','安装.ps1','管理主题.ps1','入口.ps1','01-安装.cmd','02-启动主题.cmd','03-暂停主题.cmd','04-恢复主题.cmd','05-恢复原界面.cmd'];
const files=[...rootFiles];
async function visit(relative){
  for(const item of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
    const name=relative+'/'+item.name;
    if(item.isSymbolicLink())throw Error('Linked source entry: '+name);
    if(item.isDirectory())await visit(name);
    else if(item.isFile()&&name!=='engine/node.exe'){
      if(!/\.(md|txt|json|mjs|ps1|css|js|png|svg)$/.test(name))throw Error('Review unexpected source file: '+name);
      files.push(name);
    }
  }
}
for(const dir of ['engine','theme','docs','tools','tests'])await visit(dir);
const lines=[];
for(const file of files.sort())lines.push(createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')+'  '+file);
await fs.writeFile(path.join(root,'CHECKSUMS.sha256'),lines.join('\n')+'\n');
console.log('Recorded '+lines.length+' distribution files; local state and Node binary excluded.');
