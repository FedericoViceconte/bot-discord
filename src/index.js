import { Client, Events, GatewayIntentBits, MessageFlags, ActivityType } from 'discord.js';
import { requireDiscord } from './settings.js';
import { Store } from './store.js';
import { Locks } from './locks.js';
import { AI } from './ai.js';
import { handlers } from './handlers.js';
import { welcomeMember,welcomeAfterLanguage } from './welcome.js';
import {cleanupTickets} from './tickets.js';
import {FreeTranslator} from './free-translate.js';
import {Newsroom} from './newsroom.js';
import {hostRuntime,discordGuard} from './host-runtime.js';

async function runBot(settings,{session,stopped,status}) {
 let client,store,rawStore,cleaner;
 let accepting=true;
 const guardEvent=work=>(...args)=>{
   if(!accepting)return;
   Promise.resolve().then(()=>{session?.assertActive();return work(...args);}).then(()=>session?.flush()).catch(()=>{
     if(!session || session.active)console.error('[WO] No se pudo completar un evento. Revisá conexión y permisos.');
   });
 };
 try {
  requireDiscord(settings);
  rawStore=new Store(settings.dataDir);
  store=session ? session.bind(rawStore,settings) : rawStore;
  if(session)session.sequence++;
  client=new Client({ intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],allowedMentions:{ parse:[],repliedUser:false },
    ...(session ? {rest:{timeout:10000,retries:0,makeRequest:discordGuard(session)}} : {}) });
  const locks=new Locks();
  const ai=new AI(settings,store);

  const log=async (guild,message,error) => {
    if (error) console.error(`[WO] ${message} [${error.code || error.name || 'Error'}]`);
    const config=store.getConfig(guild.id);
    if (!config.logChannel) return;
    try {
      const channel=await guild.channels.fetch(config.logChannel);
      // Stop logging if someone accidentally makes the staff channel public.
      const { PermissionFlagsBits:P }=await import('discord.js');
      if (!channel?.isTextBased() || channel.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel) || channel.permissionOverwrites.cache.some(o=>o.allow.has(P.ViewChannel) && ![client.user.id,config.staffRole].includes(o.id))) return;
      await channel.send({ content:message.slice(0,1900),allowedMentions:{ parse:[] } });
    } catch { console.error('[WO] No se pudo escribir un registro de soporte.'); }
  };
  const news=new Newsroom({store,translator:new FreeTranslator(store),log});
  const handle=handlers({ store,locks,ai,news,log });
  client.once(Events.ClientReady,guardEvent(async ready => {
    console.log(`✅ ${ready.user.tag} conectado. IA: ${ai.enabled ? 'activada' : 'desactivada'}.`);
    status('active',session ? 'Bot activo con datos compartidos. Las otras PC esperan automáticamente.' : 'Bot activo en esta PC.');
    ready.user.setPresence({ activities:[{ name:'WO Definitive Edition · /ayuda',type:ActivityType.Watching }],status:'online' });
    console.log('En Discord: /configurar (opcional), /instalar y /diagnostico.');
    try {
      const guild=await ready.guilds.fetch(settings.guildId);
      await guild.channels.fetch();
      await cleanupTickets(guild,store,locks,log);
      await news.resume(guild);
      await news.catchup(guild);
      // Retry only persisted closing/legacy closed tickets. This does not scan
      // or modify the admins' private rooms.
      cleaner=setInterval(guardEvent(()=>cleanupTickets(guild,store,locks,log)),60000); cleaner.unref();
      // Remove stale temporary welcomes whose owners already selected a language before a restart.
      for (const channel of guild.channels.cache.values()) {
        const owner=channel.topic?.match(/^wo:onboarding:(\d+)$/)?.[1];
        const selected=owner && store.getLanguage(guild.id,owner);
        if (selected) {
          const member=await guild.members.fetch(owner).catch(()=>null);
          const roleId=store.getConfig(guild.id).languageRoles?.[selected];
          if (member?.roles.cache.has(roleId)){
            if(store.arrival(guild.id,owner))await welcomeAfterLanguage(member,selected,store,log);
            await channel.delete('Limpiar bienvenida completada').catch(()=>{});
          }
        }
      }
    } catch { console.error('[WO] No se pudo comprobar el servidor configurado. Revisá la invitación y el ID.'); }
  }));
  client.on(Events.GuildMemberAdd,guardEvent(member => {
    if (member.guild.id!==settings.guildId) return;
    return locks.run(`member:${member.guild.id}:${member.id}`,()=>welcomeMember(member,store,log)).catch(error=>log(member.guild,'Falló una bienvenida.',error));
  }));
  client.on(Events.MessageCreate,guardEvent(message=>{
    if(message.guildId!==settings.guildId)return;
    return news.accept(message).catch(async error=>{
      await news.inputError(message,error).catch(()=>{});
      await log(message.guild,'No se pudo preparar una novedad.',error);
    });
  }));
  client.on(Events.GuildMemberRemove,guardEvent(async member => {
    if (member.guild.id!==settings.guildId) return;
    for (const channel of member.guild.channels.cache.values()) if (channel.topic===`wo:onboarding:${member.id}`) await channel.delete('Miembro salió del servidor').catch(()=>{});
  }));
  client.on(Events.InteractionCreate,guardEvent(async i => {
    if (i.guildId!==settings.guildId) return;
    try { await handle(i); }
    catch (error) {
      const content=error.name==='Error' ? error.message.slice(0,1800) : 'No se pudo completar. Revisá permisos o probá otra vez. / Please try again.';
      try {
        if (i.deferred || i.replied) {
          // A deferred button update targets a public panel: errors must be private follow-ups.
          if (i.isButton() && i.customId.startsWith('vote:')) await i.followUp({ content,flags:MessageFlags.Ephemeral });
          else await i.editReply({ content,embeds:[],components:[] });
        } else await i.reply({ content,flags:MessageFlags.Ephemeral });
      } catch { console.error('[WO] No se pudo responder a la interacción.'); }
      await log(i.guild,`⚠️ Falló una interacción de <@${i.user.id}>. ${error.code ? `Código ${error.code}.` : 'Revisá configuración/permisos.'}`,error);
    }
  }));
  client.on(Events.Error,error=>console.error(`[Discord] ${error.code || error.name}`));
  await session?.flush();
  await Promise.race([client.login(settings.token),stopped]);
  await stopped;
 } finally {
  accepting=false; clearInterval(cleaner);
  client?.destroy();
  if(session){session.stopNewWork=true;session.abort.abort();await session.shutdown();}
  rawStore?.close();
 }
}

try { await hostRuntime(runBot); }
catch (error) {
  console.error(`No se pudo iniciar WO Guardian: ${error.code || error.message.replace(/Bot\s+\S+/g,'[redacted]')}`);
  process.exitCode=1;
}
