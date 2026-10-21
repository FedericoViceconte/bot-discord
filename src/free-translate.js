import {createHash} from 'node:crypto';
import {LANGUAGES} from './catalog.js';
import {looksLikeCredential} from './ai.js';

// MyMemory's documented limit is 500 UTF-8 bytes per request, rather than
// 500 JavaScript characters. Keep links, mentions and code out of translation.
export function translationSegments(text,maxBytes=480) {
  const protectedPattern=/(```[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s<>]+|<[@#][!&]?\d+>|<a?:\w+:\d+>)/g;
  const output=[];
  for(const [index,part]of String(text).split(protectedPattern).entries()){
    if(!part)continue;
    if(index%2){output.push({text:part,translate:false});continue;}
    for(const line of part.split(/(\r?\n)/)){
      if(!line)continue;
      if(!line.trim()){output.push({text:line,translate:false});continue;}
      const leading=line.match(/^\s*/)[0],trailing=line.match(/\s*$/)[0];
      if(leading)output.push({text:leading,translate:false});
      let current='';
      for(const token of line.trim().split(/(\s+)/)){
        if(Buffer.byteLength(current+token,'utf8')<=maxBytes){current+=token;continue;}
        if(current){output.push({text:current,translate:true});current='';}
        for(const point of token){
          if(Buffer.byteLength(current+point,'utf8')>maxBytes){output.push({text:current,translate:true});current='';}
          current+=point;
        }
      }
      if(current)output.push({text:current,translate:true});
      if(trailing)output.push({text:trailing,translate:false});
    }
  }
  return output;
}

function decodeEntities(text) {
  return text.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,(all,named,n)=>{
    if(named){const value=Number.parseInt(named.startsWith('x')?named.slice(1):named,named.startsWith('x')?16:10);return value>0 && value<=0x10ffff && !(value>=0xd800 && value<=0xdfff) ? String.fromCodePoint(value):all;}
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[n.toLowerCase()];
  });
}

export class FreeTranslator {
  constructor(store,fetcher=fetch){this.store=store;this.fetch=fetcher;}
  async translate(text,source,target) {
    if(!LANGUAGES.some(l=>l.code===source) || !LANGUAGES.some(l=>l.code===target))throw new Error('Idioma no admitido.');
    if(looksLikeCredential(text))throw new Error('La novedad parece contener una clave o token. Quitalo antes de publicar.');
    if(source===target || !text.trim())return text;
    const result=[];
    for(const part of translationSegments(text)){
      if(!part.translate || !/[\p{L}]/u.test(part.text)){result.push(part.text);continue;}
      const lead=part.text.match(/^\s*/)[0],tail=part.text.match(/\s*$/)[0],input=part.text.trim();
      const key=createHash('sha256').update(`${source}\0${target}\0${input}`).digest('hex');
      let translated=this.store.freeTranslation(key);
      if(translated===undefined){
        this.store.reserveFreeTranslation([...input].length);
        const url=new URL('https://api.mymemory.translated.net/get');
        url.searchParams.set('q',input);url.searchParams.set('langpair',`${source}|${target}`);
        let response,data;
        try{response=await this.fetch(url,{signal:AbortSignal.timeout(25000)});data=await response.json();}
        catch{throw new Error('No se pudo conectar con el traductor gratuito. Probá reintentar más tarde.');}
        if(response.status===429 || data.quotaFinished || Number(data.responseStatus)===429)throw new Error('Se agotó el cupo diario del traductor gratuito. Podés reintentar mañana.');
        if(!response.ok || Number(data.responseStatus)!==200 || typeof data.responseData?.translatedText!=='string' || !data.responseData.translatedText.trim())throw new Error('El traductor gratuito no devolvió una traducción válida.');
        translated=decodeEntities(data.responseData.translatedText);
        if(translated.length>10000)throw new Error('El traductor devolvió una respuesta demasiado larga.');
        this.store.saveFreeTranslation(key,translated);
      }
      result.push(lead+translated+tail);
    }
    return result.join('');
  }
}
