import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'wo-guardian-'));
  let store=new Store(dir);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return { get store(){return store;},restart(){store.close();store=new Store(dir);return store;} };
}
test('configuración, idioma y votos sobreviven al reinicio sin cruzar servidores',t=>{
  const f=fixture(t); const s=f.store;
  s.setConfig('g',{memberRole:'r'});s.setConfig('g',{staffRole:'s'});s.setLanguage('g','u','pt');
  const id=s.createSuggestion('g','u','Una idea para WO','pt');
  assert.deepEqual({...s.vote(id,'v',1)},{yes:1,no:0});
  assert.deepEqual({...s.vote(id,'v',-1)},{yes:0,no:1});
  assert.deepEqual({...s.vote(id,'v',-1)},{yes:0,no:0});
  s.vote(id,'v',1);s.vote(id,'w',1);
  const reopened=f.restart();
  assert.equal(reopened.getLanguage('g','u'),'pt');assert.equal(reopened.getLanguage('other','u'),undefined);
  assert.deepEqual(reopened.getConfig('g'),{memberRole:'r',staffRole:'s'});
  assert.deepEqual({...reopened.countVotes(id)},{yes:2,no:0});
  assert.equal(reopened.suggestion(id,'other'),undefined);
});
test('solo un ticket abierto por usuario, con reabrir y aislamiento de servidor',t=>{
  const {store:s}=fixture(t);
  const args={guild:'g',owner:'u',type:'bug',lang:'es',subject:'error',detail:'detalle',channel:'c'};
  const id=s.createTicket(args);
  assert.throws(()=>s.createTicket({...args,channel:'d'}));
  s.ticketState(id,'closed');const next=s.createTicket({...args,channel:'d'});
  assert.equal(s.openTicket('g','u').id,next);assert.throws(()=>s.ticketState(id,'open'));
  assert.equal(s.ticket(id,'other'),undefined);
});

test('un cierre pendiente sobrevive al reinicio, reserva al autor y conserva la consulta al borrar',t=>{
  const f=fixture(t),args={guild:'g',owner:'u',type:'bug',lang:'es',subject:'Original',detail:'Consulta original',channel:'c'};
  const id=f.store.createTicket(args);f.store.ticketState(id,'closing');
  const s=f.restart();assert.equal(s.ticketsToDelete('g')[0].id,id);assert.equal(s.ticketsToDelete('other').length,0);
  assert.throws(()=>s.createTicket({...args,channel:'duplicate'}));
  s.finishTicketClose(id);assert.equal(s.openTicket('g','u'),undefined);assert.equal(s.ticket(id,'g').channel,null);
  assert.equal(s.ticket(id,'g').detail,'Consulta original');
  s.reopenTicket(id,'new-channel');assert.equal(s.ticket(id,'g').state,'open');assert.equal(s.ticket(id,'g').channel,'new-channel');
});
test('límite de IA y cooldown son persistentes y una reserva rechazada no consume cuota',t=>{
  const f=fixture(t); const now=Date.UTC(2026,9,21,12);
  f.store.reserveAI('g','u',2,1000,now);
  assert.throws(()=>f.store.reserveAI('g','u',2,1000,now+1),/Esperá/);
  const s=f.restart();
  s.reserveAI('g','v',2,1000,now+1);
  assert.throws(()=>s.reserveAI('g','w',2,1000,now+2),/límite diario/);
  s.reserveAI('g','w',2,1000,now+86400000);
  s.reserveAI('other','u',2,1000,now);
});
test('anuncios y traducciones quedan asociados a su servidor',t=>{
  const {store:s}=fixture(t);const id=s.createAnnouncement('g','Hello');
  s.saveTranslation(id,'es','Hola');assert.equal(s.translation(id,'es'),'Hola');assert.equal(s.announcement(id,'other'),undefined);
});

test('las novedades, traducciones y envíos completados sobreviven al reinicio',t=>{
  const f=fixture(t),args={source:'message',guild:'g',channel:'private-source',author:'admin',body:'Nuevo evento',files:[{id:'file',name:'image.png'}],language:'es'};
  const {job}=f.store.addNews(args);f.store.newsState(job.id,'working');f.store.saveNewsText(job.id,'en','New event');
  f.store.beginNewsPost(job.id,'en',0,'news-en');f.store.saveNewsPost(job.id,'en',0,'published-message');
  f.store.saveFreeTranslation('hash','New event');f.store.reserveFreeTranslation(5000);
  const s=f.restart();assert.equal(s.news(job.id,'g').body,'Nuevo evento');assert.equal(s.pendingNews('g').length,1);
  assert.equal(s.news(job.id,'other'),undefined);assert.equal(s.addNews(args).created,false);
  assert.equal(s.newsText(job.id,'en'),'New event');assert.equal(s.newsPost(job.id,'en',0).message,'published-message');
  assert.equal(s.freeTranslation('hash'),'New event');assert.throws(()=>s.reserveFreeTranslation(1),/cupo diario/);
});

test('la bienvenida se recuerda tras reiniciar y se habilita otra vez solo si vuelve a ingresar',t=>{
  const f=fixture(t);f.store.beginArrival('g','u',1000);f.store.arrivalPrompt('g','u','channel','prompt');f.store.greetArrival('g','u');
  const s=f.restart();assert.equal(s.arrival('g','u').greeted,1);
  s.beginArrival('g','u',1000);assert.equal(s.arrival('g','u').greeted,1);
  s.beginArrival('g','u',2000);assert.equal(s.arrival('g','u').greeted,0);assert.equal(s.arrival('g','u').prompt,null);
  assert.equal(s.arrival('other','u'),undefined);
});
