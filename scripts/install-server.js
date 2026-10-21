import { Client,Events,GatewayIntentBits,PermissionFlagsBits as P } from 'discord.js';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSettings,requireDiscord } from '../src/settings.js';
import { Store } from '../src/store.js';
import { install } from '../src/setup.js';
import { commands } from '../src/commands.js';

const settings=readSettings();
let client,store;
const deadline=setTimeout(()=>{console.error('La instalación excedió el tiempo previsto. Los recursos guardados se reutilizan al repetir.');client?.destroy();store?.close();process.exit(1);},300000);
try {
  requireDiscord(settings);
  store=new Store(settings.dataDir);
  client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers],allowedMentions:{parse:[],repliedUser:false}});
  client.on(Events.Error,error=>console.error(`[Discord] ${error.code || error.name}`));
  client.on(Events.ChannelCreate,channel=>{if(channel.guild?.id===settings.guildId)console.log(`Canal disponible: ${channel.name}`);});
  client.on(Events.GuildRoleCreate,role=>{if(role.guild.id===settings.guildId)console.log(`Rol disponible: ${role.name}`);});
  const ready=once(client,Events.ClientReady);
  await client.login(settings.token);
  await ready;
  if(client.user.id!==settings.clientId)throw new Error('El bot autenticado no coincide con el ID de aplicación.');
  const guild=await client.guilds.fetch(settings.guildId);
  console.log(`Conectado a ${guild.name}. SERVER MEMBERS INTENT aceptado.`);
  await guild.commands.set(commands);
  console.log(`${commands.length} comandos registrados.`);
  const before={channels:guild.channels.cache.size,roles:guild.roles.cache.size};
  const {config}=await install(guild,store);
  await guild.channels.fetch();await guild.roles.fetch();
  const issues=[];
  for(const [code,id]of Object.entries(config.languageCategories)){
    const category=guild.channels.cache.get(id);
    if(!category?.permissionOverwrites.cache.get(guild.id)?.deny.has(P.ViewChannel))issues.push(`La categoría ${code} debe ocultarse a @everyone.`);
    if(!category?.permissionOverwrites.cache.get(config.languageRoles[code])?.allow.has(P.ViewChannel))issues.push(`Falta acceso al rol de idioma ${code}.`);
    for(const key of [`chat_${code}`,`voice_${code}`]){
      const channel=guild.channels.cache.get(config[key]);
      if(!channel || channel.parentId!==id || !channel.permissionsLocked)issues.push(`${key} no está sincronizado con su categoría.`);
    }
  }
  for(const key of ['ticketCategory','onboardingCategory','staffCategory','logChannel']){
    const channel=guild.channels.cache.get(config[key]);
    if(!channel && ['logChannel','onboardingCategory'].includes(key))continue;
    if(!channel?.permissionOverwrites.cache.get(guild.id)?.deny.has(P.ViewChannel))issues.push(`${key} debe ser privado.`);
  }
  for(const [key,messageId]of Object.entries(config.panels || {})){
    const channelId=key.split(':')[1];
    const channel=guild.channels.cache.get(channelId);
    const message=await channel.messages.fetch(messageId);
    if(message.author.id!==client.user.id || !message.components.length)issues.push(`Panel inválido: ${key}`);
  }
  const report={installedAt:new Date().toISOString(),guildId:guild.id,guildName:guild.name,botId:client.user.id,commands:(await guild.commands.fetch()).map(c=>c.name),rolesCreated:guild.roles.cache.size-before.roles,channelsCreated:guild.channels.cache.size-before.channels,configuration:config,issues};
  writeFileSync(join(settings.dataDir,'install-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({installed:true,guild:guild.name,rolesCreated:report.rolesCreated,channelsCreated:report.channelsCreated,commands:report.commands,entryChannel:config.entryChannel,memberRole:config.memberRole,staffRole:config.staffRole,issues},null,2));
  if(issues.length)process.exitCode=1;
}catch(error){
  if(error.code)console.error(JSON.stringify({code:error.code,status:error.status,method:error.method,path:error.url?.replace('https://discord.com/api/v10',''),channelName:error.requestBody?.json?.name,overwrites:error.requestBody?.json?.permission_overwrites}));
  console.error(`Instalación incompleta: ${error.code || error.name}. ${error.name==='Error' ? error.message : 'Revisá los permisos del bot y los registros locales.'}`);
  process.exitCode=1;
}finally{clearTimeout(deadline);client?.destroy();store?.close();}
