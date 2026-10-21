import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.js';
import {FreeTranslator,translationSegments} from '../src/free-translate.js';

function fixture(t){const dir=mkdtempSync(join(tmpdir(),'wo-translation-')),store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
test('segmentos respetan 500 bytes UTF-8 y conservan enlaces, código, menciones y saltos',()=>{
  const original='  Hola **comunidad** 🪂\n'+ 'á😀'.repeat(350)+'\nhttps://example.com/trailer?q=wo `const x=1` <@123456789012345678>\n```js\nhello()\n```';
  const pieces=translationSegments(original);
  assert.equal(pieces.map(p=>p.text).join(''),original);
  for(const p of pieces)if(p.translate)assert.ok(Buffer.byteLength(p.text,'utf8')<=500);
  assert.ok(pieces.some(p=>!p.translate && p.text.includes('https://example.com/')));
  assert.ok(pieces.some(p=>!p.translate && p.text.startsWith('```')));
});
test('traducción gratuita conserva formato protegido, decodifica entidades y reutiliza la caché',async t=>{
  const store=fixture(t);let calls=0;
  const translator=new FreeTranslator(store,async url=>{
    calls++;assert.equal(url.hostname,'api.mymemory.translated.net');assert.equal(url.searchParams.get('langpair'),'es|en');
    return {ok:true,status:200,json:async()=>({responseStatus:200,quotaFinished:false,responseData:{translatedText:'Hello &amp; welcome'}})};
  });
  const text='Hola y bienvenidos\nhttps://example.com\n`code`';
  assert.equal(await translator.translate(text,'es','en'),'Hello & welcome\nhttps://example.com\n`code`');
  assert.equal(await translator.translate(text,'es','en'),'Hello & welcome\nhttps://example.com\n`code`');assert.equal(calls,1);
  assert.equal(await translator.translate(text,'es','es'),text);assert.equal(calls,1);
});
test('el cupo diario se respeta y no se publican mensajes de error del proveedor como traducciones',async t=>{
  const store=fixture(t);let calls=0;
  const translator=new FreeTranslator(store,async()=>{calls++;return {ok:true,status:200,json:async()=>({responseStatus:429,quotaFinished:true,responseData:{translatedText:'MYMEMORY WARNING'}})};});
  await assert.rejects(translator.translate('Hola comunidad','es','en'),/cupo diario/);
  store.reserveFreeTranslation(4986);
  await assert.rejects(translator.translate('Otro mensaje distinto','es','en'),/cupo diario/);assert.equal(calls,1);
  await assert.rejects(translator.translate('sk-proj-'+ 'a'.repeat(40),'es','en'),/clave o token/);assert.equal(calls,1);
});
