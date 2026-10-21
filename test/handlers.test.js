import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Collection,ChannelType,PermissionsBitField,PermissionFlagsBits as P,MessageFlags } from 'discord.js';
import { Store } from '../src/store.js';
import { Locks } from '../src/locks.js';
import { handlers } from '../src/handlers.js';
import { install } from '../src/setup.js';
import { welcomeMember } from '../src/welcome.js';
import { commands } from '../src/commands.js';
import { panel } from '../src/ui.js';
import { LANGUAGES } from '../src/catalog.js';
import {closeTicket,cleanupTickets} from '../src/tickets.js';

function fixture(t,services={}) {
  const dir=mkdtempSync(join(tmpdir(),'wo-handler-'));
  const store=new Store(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  let serial=100; const bot={id:'bot'};
  const guild={id:'guild',client:{user:bot},roles:{cache:new Collection()},channels:{cache:new Collection()}};
  const me={permissions:new PermissionsBitField(P.Administrator),roles:{highest:{comparePositionTo:()=>1}}};
  guild.members={me,fetchMe:async()=>me,fetch:async()=>member};
  guild.roles.fetch=async id=>id ? guild.roles.cache.get(id) : guild.roles.cache;
  guild.roles.create=async options=>{
    const role={...options,id:String(++serial),guild,editable:true,managed:false,permissions:new PermissionsBitField(options.permissions)};
    guild.roles.cache.set(role.id,role);return role;
  };
  const createChannel=async options=>{
    const messages=new Collection();
    const channel={...options,parentId:options.parent,permissionsLocked:!options.permissionOverwrites,id:String(++serial),guild,permissionsFor:()=>new PermissionsBitField(P.Administrator),permissionOverwrites:{cache:new Collection((options.permissionOverwrites || []).map(o=>[o.id,{...o,allow:new PermissionsBitField(o.allow),deny:new PermissionsBitField(o.deny)}]))},messages:{fetch:async id=>{
      const m=messages.get(id);if (!m) throw Object.assign(new Error('unknown message'),{code:10008});return m;
    }},sent:[],async send(payload){
      channel.sent.push(payload);const message={id:String(++serial),author:bot,url:'https://discord.com/channels/guild/channel/message',payload,async edit(p){message.payload=p;return message;}};
      messages.set(message.id,message);return message;
    },async setParent(id){channel.parentId=id;},async setTopic(topic){channel.topic=topic;},async setName(name){channel.name=name;},async lockPermissions(){channel.permissionsLocked=true;},async delete(){guild.channels.cache.delete(channel.id);}};
    channel.permissionOverwrites.edit=async(id,changes)=>{channel.lastOverwrite={id,changes};};
    channel.permissionOverwrites.set=async(overwrites)=>{channel.permissionOverwrites.cache=new Collection(overwrites.map(o=>[o.id,{...o,allow:new PermissionsBitField(o.allow),deny:new PermissionsBitField(o.deny)}]));};
    guild.channels.cache.set(channel.id,channel);return channel;
  };
  guild.channels.create=createChannel;
  guild.channels.fetch=async id=>id ? guild.channels.cache.get(id) : guild.channels.cache;
  const changed=[];
  const member={id:'user',guild,displayName:'Player',joinedTimestamp:1700000000000,user:{bot:false,displayAvatarURL:()=>{throw new Error('No avatar in fixture');}},roles:{cache:new Collection(),remove:async ids=>{changed.push({remove:ids});},add:async ids=>{changed.push({add:ids});}}};
  const handle=handlers({store,locks:new Locks(),ai:{enabled:false},log:async()=>{},...services});
  const interaction=(kind,props={})=>({
    guild,guildId:guild.id,client:{user:bot},user:{id:'user'},locale:'es-AR',member,memberPermissions:new PermissionsBitField(0n),
    channelId:null,inGuild:()=>true,isChatInputCommand:()=>kind==='slash',isButton:()=>kind==='button',isStringSelectMenu:()=>kind==='select',isModalSubmit:()=>kind==='modal',
    async deferReply(payload){this.deferred=payload;},async deferUpdate(){this.deferredUpdate=true;},async reply(payload){this.result=payload;},async editReply(payload){this.result=payload;},async showModal(payload){this.modal=payload;},...props,
  });
  return {store,guild,member,changed,handle,interaction,createChannel};
}

test('instalación repetida reutiliza roles, canales y mensajes de paneles',async t=>{
  const f=fixture(t);await install(f.guild,f.store);
  const before={roles:f.guild.roles.cache.size,channels:f.guild.channels.cache.size,panels:Object.keys(f.store.getConfig('guild').panels).length};
  await install(f.guild,f.store);
  assert.deepEqual({roles:f.guild.roles.cache.size,channels:f.guild.channels.cache.size,panels:Object.keys(f.store.getConfig('guild').panels).length},before);
  assert.equal(before.panels,21);assert.equal(f.store.getConfig('guild').installed,true);
});

test('ticket privado: usuario solo puede crear uno y no accede otro miembro',async t=>{
  const f=fixture(t);await install(f.guild,f.store);
  const i=f.interaction('modal',{customId:'ticket:submit:player:es',fields:{getTextInputValue:key=>key==='subject'?'Reporte de jugador':'Ocurrió algo durante una partida.'}});
  await f.handle(i);
  assert.equal(i.deferred.flags,MessageFlags.Ephemeral);
  const ticket=f.store.openTicket('guild','user');assert.ok(ticket);
  const channel=f.guild.channels.cache.get(ticket.channel);
  assert.equal(channel.type,ChannelType.GuildText);
  assert.deepEqual(channel.permissionOverwrites.cache.map(o=>o.id),['guild','bot',f.store.getConfig('guild').staffRole,'user']);
  assert.ok(channel.permissionOverwrites.cache.get('guild').deny.has(P.ViewChannel));
  const same=f.interaction('modal',{customId:'ticket:submit:player:es',fields:i.fields});await f.handle(same);
  assert.equal(f.store.openTicket('guild','user').id,ticket.id);assert.match(same.result.content,new RegExp(ticket.channel));
  const malicious=f.interaction('button',{customId:`ticket:close:${ticket.id}`,channelId:ticket.channel,user:{id:'someone-else'}});
  await assert.rejects(f.handle(malicious),/Solo el equipo/);
});

test('cerrar ticket requiere confirmación y elimina el canal conservando el registro',async t=>{
  const f=fixture(t);await install(f.guild,f.store);
  const config=f.store.getConfig('guild');
  const channel=await f.createChannel({name:'ticket',type:ChannelType.GuildText,parent:config.ticketCategory,topic:'wo:ticket:user'});
  const id=f.store.createTicket({guild:'guild',owner:'user',type:'bug',lang:'es',subject:'Error',detail:'Un problema del juego',channel:channel.id});
  const ask=f.interaction('button',{customId:`ticket:close:${id}`,channelId:channel.id,channel});await f.handle(ask);
  assert.equal(f.store.ticket(id,'guild').state,'open');assert.equal(ask.result.flags,MessageFlags.Ephemeral);
  const confirm=f.interaction('button',{customId:`ticket:confirm:${id}`,channelId:channel.id,channel});await f.handle(confirm);
  assert.equal(f.store.ticket(id,'guild').state,'closed');assert.equal(f.store.ticket(id,'guild').channel,null);
  assert.equal(f.guild.channels.cache.has(channel.id),false);
  assert.equal(f.store.ticket(id,'guild').subject,'Error');
});

test('reabrir requiere Administrador incluso para el autor y para soporte, y crea un canal nuevo',async t=>{
  const f=fixture(t);await install(f.guild,f.store);const config=f.store.getConfig('guild');
  const id=f.store.createTicket({guild:'guild',owner:'user',type:'account',lang:'es',subject:'Ayuda',detail:'Consulta inicial',channel:'deleted-channel'});
  f.store.finishTicketClose(id);
  const options={getInteger:()=>id};
  await assert.rejects(f.handle(f.interaction('slash',{commandName:'ticket-reabrir',options})),/Solo administradores/);
  f.member.roles.cache.set(config.staffRole,{});
  await assert.rejects(f.handle(f.interaction('button',{customId:`ticket:reopen:${id}`,channelId:'deleted-channel'})),/Solo administradores/);
  const admin=f.interaction('slash',{commandName:'ticket-reabrir',options,memberPermissions:new PermissionsBitField(P.Administrator)});
  await f.handle(admin);const reopened=f.store.ticket(id,'guild'),channel=f.guild.channels.cache.get(reopened.channel);
  assert.equal(reopened.state,'open');assert.notEqual(reopened.channel,'deleted-channel');
  assert.equal(channel.parentId,config.ticketCategory);assert.equal(channel.permissionOverwrites.cache.size,4);
  assert.ok(channel.sent[0].embeds[0].toJSON().description.includes('Consulta inicial'));
  const count=f.guild.channels.cache.size;
  await assert.rejects(f.handle(f.interaction('slash',{commandName:'ticket-reabrir',options,memberPermissions:new PermissionsBitField(P.Administrator)})),/cerrado/);
  assert.equal(f.guild.channels.cache.size,count);
});

test('un fallo al borrar deja el cierre pendiente y la limpieza lo reintenta sin habilitar otro ticket',async t=>{
  const f=fixture(t);await install(f.guild,f.store);const config=f.store.getConfig('guild');
  const channel=await f.createChannel({name:'ticket',type:ChannelType.GuildText,parent:config.ticketCategory,topic:'wo:ticket:user'});
  const id=f.store.createTicket({guild:'guild',owner:'user',type:'bug',lang:'es',subject:'Error',detail:'Detalle original',channel:channel.id});
  const originalDelete=channel.delete;channel.delete=async()=>{throw Object.assign(Error('Forbidden'),{code:50013});};
  await assert.rejects(f.handle(f.interaction('button',{customId:`ticket:confirm:${id}`,channelId:channel.id,channel})),/Forbidden/);
  assert.equal(f.store.ticket(id,'guild').state,'closing');assert.equal(f.store.openTicket('guild','user').id,id);
  assert.throws(()=>f.store.createTicket({guild:'guild',owner:'user',type:'bug',lang:'es',subject:'Dup',detail:'Duplicate',channel:'other'}));
  channel.delete=originalDelete;
  await cleanupTickets(f.guild,f.store,new Locks(),async()=>{});
  assert.equal(f.store.ticket(id,'guild').state,'closed');assert.equal(f.guild.channels.cache.has(channel.id),false);
});

test('la eliminación de tickets nunca borra canales privados de los administradores',async t=>{
  const f=fixture(t);await install(f.guild,f.store);const config=f.store.getConfig('guild');
  const channel=await f.createChannel({name:'privado',type:ChannelType.GuildText,parent:config.staffCategory,topic:'wo:ticket:user'});
  const id=f.store.createTicket({guild:'guild',owner:'user',type:'bug',lang:'es',subject:'Error',detail:'Details',channel:channel.id});
  await assert.rejects(closeTicket(f.guild,f.store.ticket(id,'guild'),f.store),/No se modificó/);
  assert.ok(f.guild.channels.cache.has(channel.id));assert.equal(f.store.ticket(id,'guild').state,'open');
});

test('cambiar idioma toca únicamente los roles de idioma y guarda la elección',async t=>{
  const f=fixture(t);await install(f.guild,f.store);const config=f.store.getConfig('guild');
  f.member.roles.cache.set(config.languageRoles.en,{});f.member.roles.cache.set('unrelated-role',{});
  const i=f.interaction('select',{customId:'language',values:['pt']});await f.handle(i);
  assert.deepEqual(f.changed[0],{remove:[config.languageRoles.en]});
  assert.equal(f.changed[1].add.id,config.languageRoles.pt);assert.equal(f.store.getLanguage('guild','user'),'pt');
  assert.ok(f.member.roles.cache.has('unrelated-role'));
  await assert.rejects(f.handle(f.interaction('select',{customId:'language',values:[config.staffRole]})),/Idioma inválido/);
});

test('si falla el nuevo rol, se restaura el idioma anterior',async t=>{
  const f=fixture(t);await install(f.guild,f.store);const config=f.store.getConfig('guild');
  f.member.roles.cache.set(config.languageRoles.en,{});let calls=0;
  f.member.roles.add=async role=>{calls++;if(calls===1)throw new Error('Discord unavailable');f.changed.push({restored:role});};
  await assert.rejects(f.handle(f.interaction('select',{customId:'language',values:['es']})),/unavailable/);
  assert.deepEqual(f.changed.at(-1),{restored:[config.languageRoles.en]});assert.equal(f.store.getLanguage('guild','user'),undefined);
});

test('ingreso pide idioma brevemente y espera la elección antes de publicar la bienvenida',async t=>{
  const f=fixture(t);await install(f.guild,f.store);const config=f.store.getConfig('guild');
  await welcomeMember(f.member,f.store,async()=>{});
  const arrival=f.store.arrival('guild','user');assert.equal(arrival.greeted,0);
  const entry=f.guild.channels.cache.get(arrival.channel);
  assert.equal(entry.id,config.entryChannel);assert.ok(entry.sent[0].embeds[0].toJSON().description.length<80);
  assert.equal(f.guild.channels.cache.get(config.welcome_en).sent.length,0);
  await f.handle(f.interaction('select',{customId:'language',values:['en']}));
  const posted=f.guild.channels.cache.get(config.welcome_en).sent;
  assert.equal(posted.length,1);assert.match(posted[0].embeds[0].toJSON().title,/chaos/);
  assert.ok(!posted[0].embeds[0].toJSON().description.includes('Elegí'));
  assert.equal(f.store.arrival('guild','user').greeted,1);
  await f.handle(f.interaction('select',{customId:'language',values:['pt']}));
  assert.equal(f.guild.channels.cache.get(config.welcome_pt).sent.length,0);
  assert.equal(posted.length,1);
});

test('eventos de ingreso reutilizan el selector compartido sin crear canales',async t=>{
  const f=fixture(t);await install(f.guild,f.store);
  const count=f.guild.channels.cache.size;
  await welcomeMember(f.member,f.store,async()=>{});await welcomeMember(f.member,f.store,async()=>{});
  const arrival=f.store.arrival('guild','user');
  assert.equal(f.guild.channels.cache.get(arrival.channel).sent.length,1);
  assert.equal(f.guild.channels.cache.filter(c=>c.topic==='wo:onboarding:user').size,0);
  assert.equal(f.guild.channels.cache.size,count);
});

test('la migración deja una sola entrada y no modifica la categoría privada ni sus canales',async t=>{
  const f=fixture(t);await install(f.guild,f.store);const config=f.store.getConfig('guild');
  const staff=f.guild.channels.cache.get(config.staffCategory);
  const voice=await f.createChannel({name:'voz privado',type:ChannelType.GuildVoice,parent:staff.id});
  const locked=()=>{throw Error('Attempted to modify protected admin space');};
  for(const room of [staff,voice]){room.setName=locked;room.setParent=locked;room.permissionOverwrites.set=locked;room.lockPermissions=locked;}
  const old=await f.createChannel({name:'old-hub',type:ChannelType.GuildText,parent:config.commonCategory});
  f.store.setConfig('guild',{hubChannel:old.id});
  await install(f.guild,f.store);const updated=f.store.getConfig('guild');
  assert.equal(old.parentId,updated.archiveCategory);
  assert.deepEqual(f.guild.channels.cache.filter(c=>c.parentId===updated.commonCategory).map(c=>c.id),[updated.entryChannel]);
  assert.equal(f.guild.channels.cache.get(updated.entryChannel).permissionOverwrites.cache.get(updated.languageRoles.en).deny.has(P.ViewChannel),true);
  for(const code of ['es','en','pt','fr','de'])assert.equal(f.guild.channels.cache.get(updated[`language_${code}`]).parentId,updated.languageCategories[code]);
});

test('un archivo retirado no vuelve a crearse al reinstalar',async t=>{
  const f=fixture(t);await install(f.guild,f.store);
  f.store.setConfig('guild',{archiveRetired:true,archiveCategory:null,onboardingCategory:null});
  const count=f.guild.channels.cache.size;
  await install(f.guild,f.store);
  assert.equal(f.guild.channels.cache.size,count);
  assert.equal(f.guild.channels.cache.some(c=>/ARCHIVO/.test(c.name)),false);
  assert.equal(f.store.getConfig('guild').archiveCategory,null);
});

test('los paneles de un idioma abren formularios en ese idioma y publican ideas en su canal',async t=>{
  const f=fixture(t);await install(f.guild,f.store);const config=f.store.getConfig('guild');
  const click=f.interaction('button',{customId:'suggest:new:en'});await f.handle(click);
  assert.equal(click.modal.toJSON().custom_id,'suggest:submit:en');
  const submit=f.interaction('modal',{customId:'suggest:submit:en',fields:{getTextInputValue:()=> 'An idea to improve the community.'}});await f.handle(submit);
  const local=f.guild.channels.cache.get(config.suggestion_en).sent;
  assert.equal(local.length,2);assert.match(local.at(-1).embeds[0].toJSON().title,/RECEIVED/);
  assert.equal(f.guild.channels.cache.get(config.suggestion_es).sent.length,1);
});

test('votos de mensajes falsos y comandos administrativos sin permiso se rechazan',async t=>{
  const f=fixture(t);const id=f.store.createSuggestion('guild','author','Mejorar algo','es');f.store.publishSuggestion(id,'channel','real-message');
  const vote=f.interaction('button',{customId:`vote:${id}:1`,channelId:'channel',message:{id:'fake-message'}});
  await assert.rejects(f.handle(vote),/Sugerencia inválida/);assert.equal(f.store.countVotes(id).yes,0);
  await assert.rejects(f.handle(f.interaction('slash',{commandName:'instalar'})),/Solo administradores/);
});

test('el asistente retirado no figura en comandos o menús ni ejecuta consultas desde controles antiguos',async t=>{
  const f=fixture(t,{ai:{enabled:false,ask:()=>{throw Error('Unexpected API request');}}});
  await install(f.guild,f.store);
  assert.equal(commands.some(c=>c.name.startsWith('jarvis')),false);
  for(const l of LANGUAGES)assert.ok(!JSON.stringify(panel('central',l)).toLowerCase().includes('jarvis'));
  await assert.rejects(f.handle(f.interaction('slash',{commandName:'jarvis'})),/ya no está disponible/);
  await assert.rejects(f.handle(f.interaction('modal',{customId:'jarvis:submit'})),/ya no es válido/);
  await assert.rejects(f.handle(f.interaction('select',{customId:'hub:es',values:['jarvis']})),/ya no es válido/);
});

test('solo administradores pueden cambiar el idioma original o reintentar novedades',async t=>{
  const f=fixture(t,{news:{retry:()=>{throw Error('Unexpected publish');}}});await install(f.guild,f.store);
  await assert.rejects(f.handle(f.interaction('slash',{commandName:'novedades-reintentar',options:{getInteger:()=>1}})),/Solo administradores/);
  await assert.rejects(f.handle(f.interaction('slash',{commandName:'novedades-idioma',options:{getString:()=> 'en'}})),/Solo administradores/);
  for(const name of ['novedades-idioma','novedades-reintentar'])assert.equal(commands.find(c=>c.name===name).default_member_permissions,'8');
});
