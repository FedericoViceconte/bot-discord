import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits as P,PermissionsBitField } from 'discord.js';
import { validateMemberRole,privateOverwrites,staff,BOT_PERMISSIONS,BOT_CHANNEL_PERMISSIONS } from '../src/permissions.js';
import { Locks } from '../src/locks.js';
import { readSettings,requireDiscord } from '../src/settings.js';

test('rol automático nunca puede ser staff, idioma, integración, everyone o privilegiado',()=>{
  const role={id:'member',guild:{id:'g'},managed:false,editable:true,permissions:new PermissionsBitField(0n)};
  const me={roles:{highest:{comparePositionTo:()=>1}}};
  assert.doesNotThrow(()=>validateMemberRole(role,me));
  for (const patch of [{id:'g'},{managed:true},{editable:false},{permissions:new PermissionsBitField(P.Administrator)},{permissions:new PermissionsBitField(P.ManageRoles)},{permissions:new PermissionsBitField(P.BanMembers)}]) assert.throws(()=>validateMemberRole({...role,...patch},me));
  assert.throws(()=>validateMemberRole(role,me,{staffRole:'member'}));
  assert.throws(()=>validateMemberRole(role,me,{languageRoles:{es:'member'}}));
});
test('tickets privados tienen exactamente cuatro excepciones de permisos',()=>{
  const overwrites=privateOverwrites({id:'g'},'bot','staff','owner');
  assert.equal(overwrites.length,4);assert.deepEqual(overwrites[0],{id:'g',deny:[P.ViewChannel]});
  assert.deepEqual(overwrites.slice(1).map(o=>o.id),['bot','staff','owner']);
  assert.equal(staff({memberPermissions:new PermissionsBitField(0n),member:{roles:{cache:new Map()}}},{staffRole:'s'}),false);
});
test('ManageRoles se solicita globalmente pero nunca se concede en una excepción de canal nuevo',()=>{
  assert.ok(BOT_PERMISSIONS.includes(P.ManageRoles));
  assert.ok(!BOT_CHANNEL_PERMISSIONS.includes(P.ManageRoles));
  for(const overwrite of privateOverwrites({id:'g'},'bot','staff','owner'))assert.ok(!(overwrite.allow || []).includes(P.ManageRoles));
});
test('operaciones simultáneas con la misma clave se rechazan y se liberan tras un fallo',async()=>{
  const locks=new Locks();let finish;
  const pending=locks.run('same',()=>new Promise(resolve=>{finish=resolve;}));
  await assert.rejects(locks.run('same',()=>{}),/operación en curso/);
  finish();await pending;
  await assert.rejects(locks.run('same',()=>{throw new Error('failure');}));
  await locks.run('same',()=>{});
});
test('configuración detecta IDs y límites inválidos antes de conectar',()=>{
  assert.throws(()=>readSettings({AI_DAILY_REQUEST_LIMIT:'NaN'}));
  assert.throws(()=>requireDiscord(readSettings({})));
  assert.throws(()=>requireDiscord(readSettings({DISCORD_TOKEN:'fake',DISCORD_CLIENT_ID:'not-id',DISCORD_GUILD_ID:'123'})));
});
