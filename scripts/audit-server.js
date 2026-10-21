import { Client,Events,GatewayIntentBits,PermissionFlagsBits as P,ChannelType } from 'discord.js';
import { once } from 'node:events';
import { writeFileSync,readFileSync,existsSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { readSettings,requireDiscord } from '../src/settings.js';
import { Store } from '../src/store.js';
import { validateMemberRole } from '../src/permissions.js';
import { language } from '../src/catalog.js';

const settings=readSettings();requireDiscord(settings);
const store=new Store(settings.dataDir);
const client=new Client({intents:[GatewayIntentBits.Guilds],allowedMentions:{parse:[]}});
const timer=setTimeout(()=>{client.destroy();store.close();process.exit(1);},60000);
try{
  const ready=once(client,Events.ClientReady);await client.login(settings.token);await ready;
  const guild=await client.guilds.fetch(settings.guildId);
  await guild.roles.fetch();await guild.channels.fetch();await guild.members.fetchMe();
  const config=store.getConfig(guild.id),checks=[];
  const ordinary=guild.roles.cache.get(config.memberRole);
  const rooms=guild.channels.cache.filter(c=>c.type!==ChannelType.GuildCategory);
  const entry=guild.channels.cache.get(config.entryChannel);
  for(const role of [guild.roles.everyone,ordinary]){
    const visible=rooms.filter(c=>c.permissionsFor(role)?.has(P.ViewChannel)).map(c=>c.id);
    checks.push({check:`${role.name}: únicamente el selector al ingresar`,ok:visible.length===1 && visible[0]===entry?.id,visible});
  }
  checks.push({check:'La entrada contiene un único canal',ok:guild.channels.cache.filter(c=>c.parentId===config.commonCategory).size===1});
  for(const [code,roleId]of Object.entries(config.languageRoles)){
    const role=guild.roles.cache.get(roleId),visible=rooms.filter(c=>c.permissionsFor(role)?.has(P.ViewChannel));
    checks.push({check:`${code}: solo ocho canales de su idioma y sin lobby`,ok:visible.size===8 && visible.every(c=>c.parentId===config.languageCategories[code]),visible:visible.map(c=>c.name)});
  }
  const baselineArg=process.argv.indexOf('--baseline');
  if(baselineArg>=0 && !process.argv[baselineArg+1])throw Error('Falta la ruta de la copia de permisos');
  const snapshotPath=baselineArg>=0 ? resolve(process.argv[baselineArg+1]) : join(settings.dataDir,'before-entry-v3.json');
  if(existsSync(snapshotPath)){
    const before=JSON.parse(readFileSync(snapshotPath,'utf8'));
    const protectedRooms=before.channels.filter(c=>c.id===before.config.staffCategory || c.parent_id===before.config.staffCategory || /^(voz )?privado$/i.test(c.name));
    const permissions=list=>list.map(o=>({id:o.id,type:o.type,allow:String(o.allow?.bitfield ?? o.allow),deny:String(o.deny?.bitfield ?? o.deny)})).sort((a,b)=>a.id.localeCompare(b.id));
    for(const original of protectedRooms){
      const now=guild.channels.cache.get(original.id);
      checks.push({check:`Privado intacto: ${original.name}`,ok:Boolean(now && now.name===original.name && (now.parentId || null)===(original.parent_id || null) && JSON.stringify(permissions([...now.permissionOverwrites.cache.values()]))===JSON.stringify(permissions(original.permission_overwrites)))});
    }
    checks.push({check:'WO EQUIPO conserva exactamente sus canales',ok:guild.channels.cache.filter(c=>c.parentId===before.config.staffCategory).map(c=>c.id).sort().join(',')===before.channels.filter(c=>c.parent_id===before.config.staffCategory).map(c=>c.id).sort().join(',')});
  }
  validateMemberRole(guild.roles.cache.get(config.memberRole),guild.members.me,config);
  checks.push({check:'Rol de ingreso seguro y debajo del bot',ok:true});
  for(const key of ['newsCategory','newsSourceChannel','newsStatusChannel']){
    const channel=guild.channels.cache.get(config[key]);
    checks.push({check:`${key}: privado para miembros, idiomas y soporte`,ok:Boolean(channel && [guild.roles.everyone,guild.roles.cache.get(config.memberRole),guild.roles.cache.get(config.staffRole),...Object.values(config.languageRoles).map(id=>guild.roles.cache.get(id))].every(role=>!channel.permissionsFor(role).has(P.ViewChannel)))});
    checks.push({check:`${key}: bot puede publicar y adjuntar`,ok:Boolean(channel?.permissionsFor(guild.members.me).has([P.ViewChannel,P.SendMessages,P.AttachFiles,P.ReadMessageHistory]))});
  }
  for(const [code,id]of Object.entries(config.languageCategories)){
    const category=guild.channels.cache.get(id),own=guild.roles.cache.get(config.languageRoles[code]);
    checks.push({check:`${code}: acceso al propio idioma`,ok:category.permissionsFor(own).has([P.ViewChannel,P.SendMessages])});
    for(const [other,roleId]of Object.entries(config.languageRoles))if(other!==code){
      checks.push({check:`${other} no ve categoría ${code}`,ok:!category.permissionsFor(guild.roles.cache.get(roleId)).has(P.ViewChannel)});
    }
    for(const key of ['welcome','hub','language','ticketPanel','suggestion','announcement']){
      const channel=guild.channels.cache.get(config[`${key}_${code}`]);
      checks.push({check:`${key}_${code}: visible solo en su comunidad`,ok:Boolean(channel?.parentId===id && channel.permissionsFor(own)?.has(P.ViewChannel) && Object.entries(config.languageRoles).filter(([other])=>other!==code).every(([,roleId])=>!channel.permissionsFor(guild.roles.cache.get(roleId)).has(P.ViewChannel)))});
      checks.push({check:`${key}_${code}: publicaciones controladas`,ok:Boolean(channel && !channel.permissionsFor(own).has(P.SendMessages) && channel.permissionsFor(guild.members.me).has(P.SendMessages))});
    }
  }
  for(const key of ['ticketCategory','onboardingCategory','staffCategory','logChannel']){
    const channel=guild.channels.cache.get(config[key]);
    if(!channel && ['logChannel','onboardingCategory'].includes(key))continue;
    checks.push({check:`${key}: privado para miembros comunes`,ok:!channel.permissionsFor(guild.roles.cache.get(config.memberRole)).has(P.ViewChannel)});
    checks.push({check:`${key}: visible para soporte`,ok:channel.permissionsFor(guild.roles.cache.get(config.staffRole)).has(P.ViewChannel)});
    checks.push({check:`${key}: bot puede operar`,ok:channel.permissionsFor(guild.members.me).has([P.ViewChannel,P.SendMessages,P.ManageChannels,P.ManageRoles])});
  }
  for(const [key,messageId]of Object.entries(config.panels)){
    const channel=guild.channels.cache.get(key.split(':')[1]),message=await channel.messages.fetch(messageId);
    checks.push({check:`Panel ${key.split(':')[0]} publicado`,ok:message.author.id===client.user.id && message.components.length>0});
    const code=Object.entries(config.languageCategories).find(([,id])=>id===channel.parentId)?.[0];
    if(code){
      const l=language(code),kind=key.split(':')[0];
      const expected={central:l.hubTitle,idiomas:l.promptTitle,tickets:l.ticketTitle,sugerencias:l.suggestionTitle};
      checks.push({check:`Panel ${kind} en ${code}`,ok:message.embeds[0]?.title===expected[kind]});
    }else if(['central','idiomas'].includes(key.split(':')[0]))checks.push({check:'Selector de entrada sin texto largo multilingüe',ok:message.embeds[0]?.description?.length<80});
  }
  const report={at:new Date().toISOString(),guild:guild.name,checks,passed:checks.filter(c=>c.ok).length,failed:checks.filter(c=>!c.ok)};
  writeFileSync(join(settings.dataDir,'audit-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({guild:guild.name,passed:report.passed,total:checks.length,failed:report.failed,entry:`https://discord.com/channels/${guild.id}/${config.entryChannel}`,aiEnabled:Boolean(settings.aiEnabled && settings.apiKey && settings.model)},null,2));
  if(report.failed.length)process.exitCode=1;
}catch(error){console.error(`Auditoría fallida: ${error.code || error.name}`);process.exitCode=1;}
finally{clearTimeout(timer);client.destroy();store.close();}
