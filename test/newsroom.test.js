import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Collection,PermissionsBitField,PermissionFlagsBits as P,ChannelType} from 'discord.js';
import {Store} from '../src/store.js';
import {Newsroom,textParts} from '../src/newsroom.js';
import {LANGUAGES} from '../src/catalog.js';

function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'wo-news-')),store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  let serial=100,permissions=new PermissionsBitField(P.Administrator),downloads=0;
  const guild={id:'guild',client:{user:{id:'bot'}},roles:{cache:new Collection()},channels:{cache:new Collection()},members:{me:{id:'bot'},fetchMe:async()=>guild.members.me,fetch:async()=>({permissions})}};
  const create=(id,parent)=>{
    const messages=new Collection(),channel={id,parentId:parent,guild,type:ChannelType.GuildText,sent:[],failure:null,permissionsFor:()=>new PermissionsBitField(P.Administrator),permissionOverwrites:{cache:new Collection([['guild',{id:'guild',allow:new PermissionsBitField(0n),deny:new PermissionsBitField(P.ViewChannel)}],['bot',{id:'bot',allow:new PermissionsBitField(P.ViewChannel),deny:new PermissionsBitField(0n)}]])}};
    channel.messages={fetch:async query=>{if(typeof query==='object')return new Collection([...messages].reverse());const m=messages.get(query);if(!m)throw Object.assign(Error('Unknown'),{code:10008});return m;}};
    channel.put=m=>messages.set(m.id,m);
    channel.send=async payload=>{
      if(channel.failure==='before'){channel.failure=null;throw Object.assign(Error('Failed'),{code:50013});}
      const message={id:String(++serial),author:{id:'bot',bot:true},embeds:(payload.embeds || []).map(e=>e.toJSON()),createdTimestamp:Date.now(),payload,async edit(p){this.payload=p;this.embeds=(p.embeds || []).map(e=>e.toJSON());return this;}};
      messages.set(message.id,message);channel.sent.push(payload);
      if(channel.failure==='after'){channel.failure=null;throw TypeError('Unknown network outcome');}
      return message;
    };
    guild.channels.cache.set(id,channel);return channel;
  };
  guild.channels.fetch=async id=>guild.channels.cache.get(id);
  const source=create('source','news-category'),status=create('status','news-category');
  source.topic='wo:news:source';status.topic='wo:news:status';
  const config={newsCategory:'news-category',newsSourceChannel:'source',newsStatusChannel:'status',newsSourceLanguage:'es',newsActivatedAt:0,languageCategories:{}};
  for(const l of LANGUAGES){config.languageCategories[l.code]=`category-${l.code}`;config[`announcement_${l.code}`]=`news-${l.code}`;create(`news-${l.code}`,`category-${l.code}`);}
  store.setConfig('guild',config);
  const translator={calls:[],fail:null,async translate(body,from,to){this.calls.push(to);if(this.fail===to)throw Error('Translator unavailable');return from===to?body:`${to}: ${body}`;}};
  const newsroom=new Newsroom({store,translator,fetcher:async()=>{downloads++;return new Response(Buffer.from('image-data'));}});
  const message=({id='1563000000000000001',body='Novedad para la comunidad',files=[]}={})=>{
    const m={id,guild,guildId:'guild',channel:source,channelId:'source',author:{id:'admin',bot:false},content:body,attachments:new Collection(files.map(f=>[f.id,f])),createdTimestamp:Date.now(),url:`https://discord.com/channels/guild/source/${id}`};source.put(m);return m;
  };
  const deliveries=()=>LANGUAGES.map(l=>guild.channels.cache.get(`news-${l.code}`).sent.length);
  return {store,guild,source,status,translator,newsroom,message,deliveries,setPermissions:p=>{permissions=new PermissionsBitField(p);},get downloads(){return downloads;}};
}

test('publica como bot cinco textos y copia los archivos una vez, sin duplicar eventos',async t=>{
  const f=fixture(t),original=f.message({files:[{id:'file',name:'trailer.mp4',size:10,url:'https://cdn.discordapp.com/attachments/a/b/trailer.mp4'}]});
  await f.newsroom.accept(original);assert.deepEqual(f.deliveries(),[1,1,1,1,1]);assert.equal(f.downloads,1);
  for(const l of LANGUAGES){
    const payload=f.guild.channels.cache.get(`news-${l.code}`).sent[0];
    assert.equal(payload.files[0].name,'trailer.mp4');assert.equal(payload.files[0].attachment.toString(),'image-data');
    assert.deepEqual(payload.allowedMentions,{parse:[]});assert.equal(payload.enforceNonce,true);
    assert.equal(payload.embeds[0].toJSON().author,undefined);
  }
  assert.equal(f.store.news(1,'guild').status,'sent');
  await f.newsroom.accept(original);assert.deepEqual(f.deliveries(),[1,1,1,1,1]);
  assert.equal(await f.newsroom.accept({...original,author:{id:'bot',bot:true}}),false);
});
test('un fallo de traducción no publica en ningún idioma y reintentar reutiliza el trabajo preparado',async t=>{
  const f=fixture(t);f.translator.fail='fr';await f.newsroom.accept(f.message());
  assert.deepEqual(f.deliveries(),[0,0,0,0,0]);assert.equal(f.store.news(1,'guild').status,'error');
  f.translator.fail=null;await f.newsroom.retry(f.guild,1);
  assert.deepEqual(f.deliveries(),[1,1,1,1,1]);assert.equal(f.translator.calls.filter(c=>c==='en').length,1);
});
test('un fallo de Discord reintenta solo los destinos pendientes y recupera un envío ambiguo',async t=>{
  const f=fixture(t);f.guild.channels.cache.get('news-fr').failure='after';await f.newsroom.accept(f.message());
  assert.deepEqual(f.deliveries(),[1,1,1,1,0]);assert.equal(f.store.news(1,'guild').status,'error');
  await f.newsroom.retry(f.guild,1);assert.deepEqual(f.deliveries(),[1,1,1,1,1]);
  assert.equal(f.store.news(1,'guild').status,'sent');assert.equal(f.translator.calls.length,5);
});
test('solo se leen publicaciones de administradores en el canal configurado',async t=>{
  const f=fixture(t);f.setPermissions(0n);
  assert.equal(await f.newsroom.accept(f.message()),false);
  f.setPermissions(P.Administrator);
  assert.equal(await f.newsroom.accept({...f.message(),channelId:'private-admin-room'}),false);
  assert.equal(f.translator.calls.length,0);assert.deepEqual(f.deliveries(),[0,0,0,0,0]);
  await assert.rejects(f.newsroom.accept(f.message({files:[{id:'f',name:'secret',size:1,url:'http://localhost/private'}]})),/subido directamente/);
  assert.deepEqual(f.deliveries(),[0,0,0,0,0]);
});
test('un destino que apunta al privado de admins o un área de envío pública bloquea la publicación',async t=>{
  const f=fixture(t);f.guild.channels.cache.get('news-en').parentId='admin-private';
  await f.newsroom.accept(f.message());assert.deepEqual(f.deliveries(),[0,0,0,0,0]);assert.equal(f.translator.calls.length,0);
  f.source.permissionOverwrites.cache.get('guild').deny=new PermissionsBitField(0n);
  await assert.rejects(f.newsroom.accept(f.message({id:'1563000000000000002'})),/privado/);
});
test('texto largo se divide sin perder caracteres ni cortar pares Unicode',()=>{
  const source='Hola 😀 '.repeat(1000),parts=textParts(source);assert.equal(parts.join(''),source);
  assert.ok(parts.every(p=>p.length<=3800 && !/[\uD800-\uDBFF]$/.test(p)));
});
