import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI,outputText,providerError } from '../src/ai.js';

test('traducción desactivada rechaza consultas sin llamadas externas',async()=>{
  const ai=new AI({aiEnabled:false},{},()=>{throw new Error('unexpected request');});
  await assert.rejects(ai.request('g','u','translate','hello'),/desactivada/);
});
test('petición de IA no guarda respuestas ni envía historial de Discord',async()=>{
  let payload,requests=0,reservations=0;
  const ai=new AI({aiEnabled:true,apiKey:'fake',model:'configured-model',aiDailyLimit:5,aiCooldownMs:1000},{reserveAI(){reservations++;}},async(url,options)=>{
    requests++;assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);
    return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'Hola'}]}]})};
  });
  assert.equal(await ai.request('g','u','Traducí al español','¿Cómo elijo idioma?'),'Hola');
  assert.equal(requests,1);assert.equal(reservations,1);assert.equal(payload.store,false);assert.equal(payload.input,'¿Cómo elijo idioma?');
  assert.equal(payload.model,'configured-model');assert.equal(payload.tools,undefined);assert.equal(payload.max_output_tokens,1200);
});
test('traducción cacheada evita consultas y cargos repetidos',async()=>{
  const ai=new AI({}, {announcement:()=>({body:'Hello'}),translation:()=> 'Hola'},()=>{throw new Error('unexpected request');});
  assert.equal(await ai.translate('g','u',1,'es'),'Hola');
});
test('errores del proveedor no exponen claves ni cuerpos de respuesta',async()=>{
  const ai=new AI({aiEnabled:true,apiKey:'secret',model:'m'},{reserveAI(){}},async()=>({ok:false,status:401,text:async()=> 'secret'}));
  await assert.rejects(ai.request('g','u','instructions','input'),error=>/HTTP 401/.test(error.message)&&!error.message.includes('secret'));
  assert.equal(outputText({output:[{type:'reasoning',content:[{type:'output_text',text:'hidden'}]},{type:'message',content:[{type:'output_text',text:'visible'}]}]}),'visible');
});

test('claves y tokens detectados no se envían a la IA',async()=>{
  const ai=new AI({aiEnabled:true,apiKey:'test',model:'m'}, {},()=>{throw new Error('unexpected request');});
  await assert.rejects(ai.request('g','u','translate','sk-proj-'+ 'a'.repeat(40)),/clave o token/);
  await assert.rejects(ai.request('g','u','translate','a'.repeat(24)+'.'+'b'.repeat(6)+'.'+'c'.repeat(30)),/clave o token/);
});

test('distingue saldo agotado de límites temporales sin mostrar el mensaje bruto del proveedor',async()=>{
  const error=await providerError({status:429,json:async()=>({error:{type:'insufficient_quota',code:'credit_balance_exhausted',message:'private provider detail'}})},'IA');
  assert.match(error.message,/saldo de API/);assert.ok(!error.message.includes('private provider detail'));
  const rate=await providerError({status:429,json:async()=>({error:{code:'rate_limit_exceeded'}})},'Voz');
  assert.match(rate.message,/límite de uso/);assert.ok(!rate.message.includes('saldo'));
});
