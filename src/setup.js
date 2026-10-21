import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { LANGUAGES,language } from './catalog.js';
import { BOT_PERMISSIONS, BOT_CHANNEL_PERMISSIONS, privateOverwrites, assertCanPost, validateMemberRole } from './permissions.js';
import { panel } from './ui.js';
import {installNewsroom} from './news-setup.js';

// These rooms belong to the admins. Installation must never edit them or
// recreate deleted channels inside their category.
export function protectedChannelIds(guild,config) {
  const ids=new Set(guild.channels.cache.filter(c=>c.id===config.staffCategory || /equipo|desarrollo|privado/i.test(c.name) && c.id!==config.ticketCategory).map(c=>c.id));
  for(const c of guild.channels.cache.values())if(ids.has(c.parentId))ids.add(c.id);
  return ids;
}

export async function publishPanel(guild, store, kind, channel,code) {
  assertCanPost(channel,guild.members.me);
  const config = store.getConfig(guild.id);
  const selected=code || Object.entries(config.languageCategories || {}).find(([,id])=>id===channel.parentId)?.[0];
  const payload=!selected && ['central','idiomas'].includes(kind) ? panel('entrada') : panel(kind,language(selected));
  const key = `${kind}:${channel.id}`;
  const previous = config.panels?.[key];
  if (previous) {
    const message = await channel.messages.fetch(previous).catch(error => {
      if (error.code === 10008) return null;
      throw error;
    });
    if (message?.author.id === guild.client.user.id) { await message.edit(payload); return message; }
  }
  const message = await channel.send(payload);
  const latest = store.getConfig(guild.id);
  store.setConfig(guild.id,{ panels: { ...latest.panels, [key]:message.id } });
  return message;
}

export async function install(guild, store) {
  await guild.members.fetchMe();
  await guild.roles.fetch();
  await guild.channels.fetch();
  if (!guild.members.me.permissions.has(BOT_PERMISSIONS)) throw new Error('Faltan permisos del bot. Volvé a autorizarlo con el enlace generado por npm run invite para incluir los permisos de texto, voz, comandos y gestión de canales/roles.');
  let config = store.getConfig(guild.id);
  const protectedIds=protectedChannelIds(guild,config);
  const save = patch => { config = store.setConfig(guild.id,patch); };
  const role = async (key, name, color) => {
    let existing = config[key] && guild.roles.cache.get(config[key]);
    if (!existing) {
      existing = await guild.roles.create({ name, color, permissions: [], reason:'Instalación WO Guardian' });
      save({ [key]:existing.id });
    }
    return existing;
  };
  await role('memberRole','WO · Miembro',0x8c96aa);
  await role('staffRole','WO · Soporte',0xf13b82);
  for (const l of LANGUAGES) {
    let existing = config.languageRoles?.[l.code] && guild.roles.cache.get(config.languageRoles[l.code]);
    if (!existing) {
      existing = await guild.roles.create({ name:`${l.emoji} ${l.label}`, color:0x777bff, permissions:[], reason:'Canales por idioma WO' });
      save({ languageRoles: { ...config.languageRoles, [l.code]:existing.id } });
    }
    if (existing.permissions.bitfield !== 0n || !existing.editable) throw new Error(`El rol ${existing.name} debe ser editable por el bot y no tener permisos globales.`);
  }
  validateMemberRole(guild.roles.cache.get(config.memberRole),guild.members.me,config);
  const channel = async (key, options) => {
    let existing = config[key] && guild.channels.cache.get(config[key]);
    if(existing && protectedIds.has(existing.id))throw new Error(`El canal ${existing.name} está protegido para los administradores.`);
    if (!existing) {
      existing = await guild.channels.create({ ...options, reason:'Instalación WO Guardian' });
      save({ [key]:existing.id });
    }
    if(existing.name!==options.name)await existing.setName(options.name,'Actualizar espacios de la comunidad WO');
    return existing;
  };
  const publicPermissions = [
    { id:guild.id, allow:[P.ViewChannel,P.ReadMessageHistory,P.UseApplicationCommands], deny:[P.SendMessages,P.AddReactions] },
    { id:guild.client.user.id, allow:BOT_CHANNEL_PERMISSIONS },
    { id:config.staffRole, allow:[P.ViewChannel,P.ReadMessageHistory,P.SendMessages] },
    ...Object.values(config.languageRoles).map(id=>({id,deny:[P.ViewChannel]})),
  ];
  const common = await channel('commonCategory',{ name:'🌐 WO', type:ChannelType.GuildCategory, permissionOverwrites:publicPermissions });
  await common.permissionOverwrites.set(publicPermissions,'Una única entrada antes de elegir idioma');
  const languages = await channel('languageChannel',{ name:'🌐・idioma-language',type:ChannelType.GuildText,parent:common.id,permissionOverwrites:publicPermissions });
  if(languages.parentId!==common.id)await languages.setParent(common.id,{lockPermissions:false});
  await languages.permissionOverwrites.set(publicPermissions,'Selector visible únicamente antes de elegir idioma');
  save({entryChannel:languages.id});
  const priv = privateOverwrites(guild,guild.client.user.id,config.staffRole);
  await channel('ticketCategory',{ name:'🛟 WO · SOPORTE PRIVADO',type:ChannelType.GuildCategory,permissionOverwrites:priv });
  if(!config.staffCategory){
    const staff=await channel('staffCategory',{name:'🔒 WO · EQUIPO',type:ChannelType.GuildCategory,permissionOverwrites:priv});
    await channel('logChannel',{name:'guardian-logs',type:ChannelType.GuildText,parent:staff.id,permissionOverwrites:priv});
  }else if(!guild.channels.cache.has(config.logChannel))save({logChannel:null});
  // Preserve the old bot messages in a separate archive, outside the admins'
  // private space. They no longer form a second public lobby.
  // Once explicitly retired by the owner, never recreate the archive.
  const legacyKeys=['welcomeChannel','hubChannel','ticketPanelChannel','suggestionChannel','announcementChannel'];
  const needsArchive=!config.archiveRetired && (legacyKeys.some(key=>guild.channels.cache.has(config[key])) || guild.channels.cache.some(c=>/^wo:onboarding:/.test(c.topic || '')));
  if(needsArchive){
  const archive=await channel('archiveCategory',{name:'🗄️ WO · ARCHIVO',type:ChannelType.GuildCategory,permissionOverwrites:priv});
  save({onboardingCategory:archive.id});
  const archived=new Set();
  for(const key of legacyKeys){
    const legacy=guild.channels.cache.get(config[key]);
    if(legacy && !protectedIds.has(legacy.id) && [common.id,archive.id].includes(legacy.parentId)){
      if(legacy.parentId!==archive.id)await legacy.setParent(archive.id,{lockPermissions:false});
      await legacy.permissionOverwrites.set(priv,'Historial de paneles anteriores');archived.add(legacy.id);
    }
  }
  for(const room of guild.channels.cache.values())if(!protectedIds.has(room.id) && /^wo:onboarding:/.test(room.topic || '')){
    await room.setParent(archive.id,{lockPermissions:false});await room.permissionOverwrites.set(priv,'Entrada unificada');
    await room.setTopic(room.topic.replace('wo:onboarding:','wo:archived-onboarding:'));
  }
  save({panels:Object.fromEntries(Object.entries(config.panels || {}).filter(([key])=>!archived.has(key.split(':')[1])))});
  }
  for (const l of LANGUAGES) {
    const languagePermissions=[
      {id:guild.id,deny:[P.ViewChannel]},
      {id:config.languageRoles[l.code],allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.UseApplicationCommands,P.Connect,P.Speak]},
      {id:config.staffRole,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.UseApplicationCommands,P.Connect,P.Speak]},
      {id:guild.client.user.id,allow:BOT_CHANNEL_PERMISSIONS},
    ];
    let category = config.languageCategories?.[l.code] && guild.channels.cache.get(config.languageCategories[l.code]);
    if (!category) {
      category = await guild.channels.create({ name:`${l.emoji} ${l.label.toUpperCase()}`,type:ChannelType.GuildCategory,permissionOverwrites:languagePermissions });
      save({ languageCategories:{ ...config.languageCategories,[l.code]:category.id } });
    }else if((config.communityVersion || 0)<2){
      await category.permissionOverwrites.set(languagePermissions,'Acceso a la comunidad en su idioma');
    }
    const readOnly=[
      {id:guild.id,deny:[P.ViewChannel]},
      {id:config.languageRoles[l.code],allow:[P.ViewChannel,P.ReadMessageHistory,P.UseApplicationCommands],deny:[P.SendMessages,P.AddReactions]},
      {id:config.staffRole,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.UseApplicationCommands]},
      {id:guild.client.user.id,allow:BOT_CHANNEL_PERMISSIONS},
    ];
    const targets={};
    for(const [key,name]of Object.entries({welcome:l.channels.welcome,hub:l.channels.hub,language:l.channels.language,ticketPanel:l.channels.tickets,suggestion:l.channels.suggestions,announcement:l.channels.announcements})){
      targets[key]=await channel(`${key}_${l.code}`,{name,type:ChannelType.GuildText,parent:category.id,permissionOverwrites:readOnly});
    }
    const chat=await channel(`chat_${l.code}`,{name:l.channels.chat,type:ChannelType.GuildText,parent:category.id});
    const voice=await channel(`voice_${l.code}`,{name:l.channels.voice,type:ChannelType.GuildVoice,parent:category.id});
    for(const shared of [chat,voice])if(!shared.permissionsLocked)await shared.lockPermissions();
    for(const [kind,target]of [['central',targets.hub],['idiomas',targets.language],['tickets',targets.ticketPanel],['sugerencias',targets.suggestion]])await publishPanel(guild,store,kind,target,l.code);
  }
  await publishPanel(guild,store,'idiomas',languages);
  await installNewsroom(guild,store);
  save({ installed:true,communityVersion:3 });
  return { config, welcome:guild.channels.cache.get(config.welcome_es) };
}
