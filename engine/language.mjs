import fs from 'node:fs/promises';
import path from 'node:path';
export function normalizeLanguage(value){return typeof value==='string'&&/^zh(?:-|$)/i.test(value)?'zh-CN':'en';}
export async function readLanguagePreference(stateRoot){
  const fallback={language:'auto',systemLanguage:'en'};
  try{
    const file=path.join(stateRoot,'language.json');if((await fs.stat(file)).size>4096)return fallback;
    const value=JSON.parse(await fs.readFile(file,'utf8'));
    if(value.schema!=='bocchi-language/1'||!['auto','zh-CN','en'].includes(value.language))return fallback;
    return {language:value.language,systemLanguage:normalizeLanguage(value.systemLanguage)};
  }catch{return fallback;}
}
