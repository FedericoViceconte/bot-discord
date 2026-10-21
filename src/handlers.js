import { ChannelType, MessageFlags, PermissionFlagsBits as P, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { language, fromLocale, LANGUAGES, TICKET_TYPES, STATUSES } from './catalog.js';
import { embed, panel, welcomeChoice, languageMenu, ticketMenu, ticketModal, suggestionModal, ticketMessage, suggestionMessage, announcementMessage, dismissButton } from './ui.js';
import { requireAdmin, requireStaff, validateMemberRole, privateOverwrites, textChannel, assertCanPost, BOT_PERMISSIONS } from './permissions.js';
import { install, publishPanel } from './setup.js';
import { welcomeAfterLanguage } from './welcome.js';
import {closeTicket,reopenTicket} from './tickets.js';

export function handlers({ store, locks, ai, news, log }) {
  const lang = i => language(store.getLanguage(i.guildId,i.user.id) || fromLocale(i.locale).code);
  const defer = i => i.deferReply({ flags:MessageFlags.Ephemeral });
  const readyConfig = i => {
    const config = store.getConfig(i.guildId);
    if (!config.installed) throw new Error(lang(i).needSetup);
    return config;
  };

  async function chooseLanguage(i) {
    await defer(i);
    const selected = LANGUAGES.find(l => l.code === i.values[0]);
    if (!selected) throw new Error('Idioma inválido.');
    const promptOwner=i.channel?.topic?.match(/^wo:onboarding:(\d+)$/)?.[1];
    if(promptOwner && promptOwner!==i.user.id)throw new Error('Este selector pertenece al nuevo miembro. Usá /idioma para cambiar el tuyo.');
    await locks.run(`member:${i.guildId}:${i.user.id}`,async () => {
      const config = readyConfig(i);
      const member = await i.guild.members.fetch(i.user.id);
      await i.guild.members.fetchMe();
      await i.guild.roles.fetch();
      const roles = Object.values(config.languageRoles);
      const target = i.guild.roles.cache.get(config.languageRoles[selected.code]);
      if (!target?.editable || target.permissions.bitfield !== 0n || target.id === config.memberRole || target.id === config.staffRole) throw new Error('El rol de idioma debe ser editable y no tener permisos globales. Avisá al equipo.');
      const existing = roles.filter(id => id !== target.id && member.roles.cache.has(id));
      for (const id of existing) if (!i.guild.roles.cache.get(id)?.editable) throw new Error('El bot no puede quitar tu rol de idioma anterior. Revisá la jerarquía de roles.');
      // Only change managed language roles: never replace the member's complete role set.
      if (existing.length) await member.roles.remove(existing,'Cambio de idioma WO');
      try { await member.roles.add(target,'Idioma elegido por el usuario'); }
      catch (error) {
        if (existing.length) await member.roles.add(existing,'Restaurar idioma anterior').catch(() => {});
        throw error;
      }
      store.setLanguage(i.guildId,i.user.id,selected.code);
      await i.editReply(welcomeChoice(i.guildId,config,selected));
      if(store.arrival(i.guildId,i.user.id))await welcomeAfterLanguage(member,selected.code,store,log);
      // Delete only temporary channels marked for this exact member, after confirming success.
      await i.guild.channels.fetch();
      const temporary = i.guild.channels.cache.filter(c => c.topic === `wo:onboarding:${i.user.id}`);
      for (const channel of temporary.values()) setTimeout(() => channel.delete('Idioma elegido; bienvenida temporal finalizada').catch(error => log(i.guild,'No se pudo limpiar una bienvenida temporal.',error)),10000).unref();
    });
  }

  async function newTicket(i,type,code) {
    await defer(i);
    if (!TICKET_TYPES.some(t=>t.key===type) || !LANGUAGES.some(l=>l.code===code)) throw new Error('Formulario inválido.');
    const l = language(code);
    await locks.run(`ticket-owner:${i.guildId}:${i.user.id}`,async () => {
      const config = readyConfig(i);
      const parent = await i.guild.channels.fetch(config.ticketCategory);
      if (parent?.type !== ChannelType.GuildCategory || !await i.guild.roles.fetch(config.staffRole)) throw new Error('Falta la categoría privada o el rol de soporte. Ejecutá /instalar.');
      const old = store.openTicket(i.guildId,i.user.id);
      if (old) {
        if(old.state==='closing')throw new Error('Tu ticket se está cerrando. Esperá unos segundos antes de abrir otro.');
        const channel = await i.guild.channels.fetch(old.channel).catch(error => { if (error.code === 10003) return null; throw error; });
        if (channel) return i.editReply({ content:`${l.saved}: <#${old.channel}>` });
        store.ticketState(old.id,'closed');
      }
      store.cooldown(`ticket:${i.guildId}:${i.user.id}`,60000);
      const subject = i.fields.getTextInputValue('subject').trim();
      const detail = i.fields.getTextInputValue('detail').trim();
      if (subject.length < 4 || detail.length < 10) throw new Error('Completá asunto y descripción. / Complete the subject and description.');
      await i.guild.channels.fetch();
      const topic = `wo:ticket:${i.user.id}`;
      // Recover a channel if Discord created it but the previous process stopped before saving it.
      let channel = i.guild.channels.cache.find(c=>c.topic===topic);
      if (!channel) channel = await i.guild.channels.create({
        name:`${type}-${i.user.id}`,type:ChannelType.GuildText,parent:parent.id,topic,
        permissionOverwrites:privateOverwrites(i.guild,i.client.user.id,config.staffRole,i.user.id),reason:'Ticket privado WO',
      });
      const id = store.createTicket({ guild:i.guildId,owner:i.user.id,type,lang:code,subject,detail,channel:channel.id });
      const ticket = store.ticket(id,i.guildId);
      await channel.send({ content:`<@${i.user.id}> <@&${config.staffRole}>`,...ticketMessage(ticket),allowedMentions:{ users:[i.user.id],roles:[config.staffRole] } });
      await i.editReply({ content:`${l.saved}: <#${channel.id}>` });
      await log(i.guild,`🛟 Ticket #${id} abierto por <@${i.user.id}> · <#${channel.id}> · ${type}.`);
    });
  }

  async function ticketAction(i,action,id) {
    const config = readyConfig(i);
    if(action==='reopen')requireAdmin(i);
    const ticket = store.ticket(Number(id),i.guildId);
    if (!ticket || ticket.channel !== i.channelId) throw new Error('Ticket inexistente o canal incorrecto.');
    if (action === 'close' || action === 'confirm') {
      if (ticket.owner !== i.user.id) requireStaff(i,config);
    } else if(action!=='reopen')requireStaff(i,config);
    if (action === 'close') {
      if (ticket.state !== 'open') throw new Error('El ticket ya está cerrado. / Already closed.');
      const l=language(ticket.lang);
      return i.reply({flags:MessageFlags.Ephemeral,content:l.confirmClose,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket:confirm:${id}`).setLabel(l.confirmButton).setStyle(ButtonStyle.Danger))]});
    }
    await defer(i);
    await locks.run(`ticket-owner:${i.guildId}:${ticket.owner}`,async () => {
      const current = store.ticket(ticket.id,i.guildId);
      if (action === 'claim') {
        if (current.state !== 'open') throw new Error('El ticket está cerrado.');
        if (current.claimed && current.claimed !== i.user.id) throw new Error('Otro integrante ya tomó este ticket. / Already claimed.');
        store.claimTicket(ticket.id,i.user.id);
        await i.message.edit(ticketMessage(store.ticket(ticket.id,i.guildId)));
        return i.editReply({content:`🙋 ${language(ticket.lang).claimed}`});
      }
      if (action === 'confirm') {
        if (current.state !== 'open') throw new Error('El ticket ya está cerrado. / Already closed.');
        await i.editReply({content:language(ticket.lang).closing,components:[]});
        await closeTicket(i.guild,current,store,`Cierre confirmado del ticket #${id} por ${i.user.id}`);
        // The interaction's channel is gone. A failed follow-up must not turn
        // a successful deletion into an error or leave an endless defer state.
        await i.editReply({content:language(ticket.lang).closed,components:[]}).catch(()=>{});
        return log(i.guild,`🔒 Ticket #${id} cerrado por <@${i.user.id}>; canal eliminado.`);
      }
      if (action === 'reopen') {
        const channel=await reopenTicket(i.guild,current,store);
        await i.editReply({content:`🔓 ${language(ticket.lang).reopened} <#${channel.id}>`});
        return log(i.guild,`🔓 Ticket #${id} reabierto por <@${i.user.id}>.`);
      }
      throw new Error('Acción inválida.');
    });
  }

  async function submitSuggestion(i,code) {
    await defer(i);
    await locks.run(`suggest-user:${i.guildId}:${i.user.id}`,async () => {
      const config = readyConfig(i);
      const channel = await textChannel(i.guild,config[`suggestion_${code}`] || config.suggestionChannel);
      assertCanPost(channel,i.guild.members.me);
      store.cooldown(`suggestion:${i.guildId}:${i.user.id}`,60000);
      const body = i.fields.getTextInputValue('body').trim();
      if (body.length < 15) throw new Error('Escribí una propuesta de al menos 15 caracteres.');
      const id = store.createSuggestion(i.guildId,i.user.id,body,code);
      const suggestion = store.suggestion(id,i.guildId);
      // Preserve the row on an uncertain network failure to avoid losing the suggestion.
      const message = await channel.send(suggestionMessage(suggestion,{ yes:0,no:0 }));
      store.publishSuggestion(id,channel.id,message.id);
      await i.editReply({ content:`💡 #${id} · ${message.url}` });
    });
  }

  async function vote(i,id,value) {
    await i.deferUpdate();
    await locks.run(`suggestion:${i.guildId}:${id}`,async () => {
      const suggestion = store.suggestion(Number(id),i.guildId);
      if (!suggestion || suggestion.message !== i.message.id || suggestion.channel !== i.channelId || ![1,-1].includes(value)) throw new Error('Sugerencia inválida.');
      if (['patched','rejected'].includes(suggestion.state)) throw new Error('La votación ya está cerrada. / Voting closed.');
      const votes = store.vote(suggestion.id,i.user.id,value);
      await i.editReply(suggestionMessage(suggestion,votes));
    });
  }

  async function configure(i) {
    requireAdmin(i);
    await defer(i);
    await locks.run(`setup:${i.guildId}`,async () => {
      const config = store.getConfig(i.guildId);
      const me = await i.guild.members.fetchMe();
      const patch = {};
      const support = i.options.getRole('rol_soporte');
      if (support) {
        if (support.id===i.guildId || support.managed || support.id===config.memberRole || Object.values(config.languageRoles || {}).includes(support.id)) throw new Error('El rol de soporte debe ser exclusivo del equipo.');
        if (config.installed && support.id!==config.staffRole) throw new Error('Configurá el rol de soporte antes de /instalar. La instalación ya está hecha: asigná el rol WO · Soporte al equipo. No se cambia automáticamente para evitar dejar accesos anteriores en tickets privados.');
        patch.staffRole=support.id;
      }
      const member = i.options.getRole('rol_nuevos');
      if (member) { validateMemberRole(member,me,{ ...config,...patch }); patch.memberRole=member.id; }
      const fields = { bienvenida:'welcomeChannel',sugerencias:'suggestionChannel',anuncios:'announcementChannel',logs:'logChannel' };
      for (const [option,key] of Object.entries(fields)) {
        const channel = i.options.getChannel(option);
        if (!channel) continue;
        assertCanPost(channel,me);
        if (key==='logChannel') {
          if (channel.permissionsFor(i.guild.roles.everyone)?.has(P.ViewChannel) || channel.permissionOverwrites.cache.some(o=>o.allow.has(P.ViewChannel) && ![i.client.user.id,patch.staffRole || config.staffRole].includes(o.id))) throw new Error('El canal de logs debe ser privado y visible solo para soporte, bot y administradores.');
        }
        patch[key]=channel.id;
        const localKey={welcomeChannel:'welcome',suggestionChannel:'suggestion',announcementChannel:'announcement'}[key];
        if(localKey && config.communityVersion>=2){
          const code=Object.entries(config.languageCategories || {}).find(([,id])=>id===i.channel?.parentId)?.[0] || lang(i).code;
          patch[`${localKey}_${code}`]=channel.id;
        }
      }
      if (!Object.keys(patch).length) return i.editReply({ content:`Configuración actual:\nRol de ingreso: ${config.memberRole ? `<@&${config.memberRole}>` : 'sin configurar'}\nSoporte: ${config.staffRole ? `<@&${config.staffRole}>` : 'sin configurar'}\nInstalado: ${Boolean(config.installed)}` });
      store.setConfig(i.guildId,patch);
      await i.editReply({ content:'✅ Configuración guardada. El rol de ingreso se asignará a los próximos miembros que entren.' });
      await log(i.guild,`⚙️ Configuración actualizada por <@${i.user.id}>.`);
    });
  }

  async function diagnostics(i) {
    requireAdmin(i); await defer(i);
    const config = store.getConfig(i.guildId);
    const me = await i.guild.members.fetchMe();
    await i.guild.roles.fetch(); await i.guild.channels.fetch();
    const missing = BOT_PERMISSIONS.filter(p=>!me.permissions.has(p));
    const lines = [`${missing.length ? '❌' : '✅'} Permisos del bot: ${missing.length ? `${missing.length} faltantes` : 'correctos'}`,`${config.installed ? '✅' : '❌'} Instalación`,`${ai.enabled ? '✅' : 'ℹ️'} IA: ${ai.enabled ? 'activada (clave/modelo no verificados)' : 'desactivada'}`];
    try { validateMemberRole(i.guild.roles.cache.get(config.memberRole),me,config); lines.push('✅ Rol de ingreso y jerarquía'); } catch (e) { lines.push(`❌ ${e.message}`); }
    for (const l of LANGUAGES) {
      const role = i.guild.roles.cache.get(config.languageRoles?.[l.code]);
      const category = i.guild.channels.cache.get(config.languageCategories?.[l.code]);
      const safe = role?.editable && role.permissions.bitfield===0n && category?.permissionOverwrites.cache.get(i.guildId)?.deny.has(P.ViewChannel) && category?.permissionOverwrites.cache.get(role.id)?.allow.has(P.ViewChannel);
      lines.push(`${safe ? '✅' : '❌'} ${l.label}: rol y categoría`);
      for (const key of [`chat_${l.code}`,`voice_${l.code}`]) {
        const channel = i.guild.channels.cache.get(config[key]);
        if (!channel || channel.parentId!==category?.id || !channel.permissionsLocked) lines.push(`⚠️ ${key}: falta o no está sincronizado con su categoría`);
      }
    }
    for (const key of ['entryChannel','ticketCategory','newsCategory','newsSourceChannel','newsStatusChannel',...LANGUAGES.flatMap(l=>['welcome','hub','language','ticketPanel','suggestion','announcement','chat','voice'].map(kind=>`${kind}_${l.code}`))]) if (!i.guild.channels.cache.has(config[key])) lines.push(`❌ Falta ${key}`);
    lines.push('ℹ️ Revisá SERVER MEMBERS INTENT en Developer Portal. El bot no puede consultar ese ajuste.');
    await i.editReply({ embeds:[embed('🔧 Diagnóstico WO Guardian',lines.join('\n'))] });
  }

  async function slash(i) {
    const name = i.commandName;
    if (name==='configurar') return configure(i);
    if (name==='diagnostico') return diagnostics(i);
    if(name==='novedades-idioma'){
      requireAdmin(i);readyConfig(i);const selected=LANGUAGES.find(l=>l.code===i.options.getString('idioma',true));
      if(!selected)throw new Error('Idioma inválido.');
      store.setConfig(i.guildId,{newsSourceLanguage:selected.code});
      return i.reply({content:`✅ Los próximos mensajes de novedades se interpretarán en ${selected.label}.`,flags:MessageFlags.Ephemeral});
    }
    if(name==='novedades-reintentar'){
      requireAdmin(i);readyConfig(i);await defer(i);
      if(!news)throw new Error('No está disponible el módulo de novedades.');
      const job=await news.retry(i.guild,i.options.getInteger('id',true));
      return i.editReply({content:job.status==='sent' ? `✅ Novedad #${job.id} enviada a todos los idiomas.`:`⚠️ Novedad #${job.id}: ${job.error || 'Revisá el canal de estado.'}`});
    }
    if(name==='ticket-reabrir'){
      requireAdmin(i);const config=readyConfig(i);await defer(i);
      const id=i.options.getInteger('id',true),ticket=store.ticket(id,i.guildId);
      if(!ticket)throw new Error('No existe ese ticket en este servidor.');
      return locks.run(`ticket-owner:${i.guildId}:${ticket.owner}`,async()=>{
        const channel=await reopenTicket(i.guild,store.ticket(id,i.guildId),store);
        await i.editReply({content:`🔓 Ticket #${id} reabierto: <#${channel.id}>`});
        await log(i.guild,`🔓 Ticket #${id} reabierto por el administrador <@${i.user.id}>.`);
      });
    }
    if (name==='instalar') {
      requireAdmin(i); await defer(i);
      return locks.run(`setup:${i.guildId}`,async () => {
        const { config } = await install(i.guild,store);
        await i.editReply({ content:`✅ WO Guardian instalado.\nIngreso: <@&${config.memberRole}>\nSoporte: <@&${config.staffRole}> (asignáselo a tu equipo)\nEntrada única: <#${config.entryChannel}>\n\nCada idioma tiene su comunidad y selector para cambiarlo. Podés elegir otro rol de ingreso con /configurar rol_nuevos. Verificá todo con /diagnostico.` });
      });
    }
    if (name==='idioma') { readyConfig(i); return i.reply({ ...panel('idiomas',lang(i)),flags:MessageFlags.Ephemeral }); }
    if (name==='sugerir') { readyConfig(i); return i.showModal(suggestionModal(lang(i))); }
    if (name==='ayuda') return i.reply({ flags:MessageFlags.Ephemeral,...panel('central',lang(i)) });
    if (name==='panel') {
      requireAdmin(i); await defer(i);
      return locks.run(`setup:${i.guildId}`,async () => {
        const config = readyConfig(i);
        const kind = i.options.getString('tipo',true);
        const code=lang(i).code;
        const defaults = { central:config[`hub_${code}`] || config.entryChannel,idiomas:config[`language_${code}`] || config.entryChannel,tickets:config[`ticketPanel_${code}`] || config.ticketPanelChannel,sugerencias:config[`suggestion_${code}`] || config.suggestionChannel };
        const channel = await textChannel(i.guild,i.options.getChannel('canal')?.id || defaults[kind]);
        const message = await publishPanel(i.guild,store,kind,channel);
        return i.editReply({ content:`✅ ${message.url}` });
      });
    }
    if (name==='sugerencia') {
      const config = readyConfig(i); requireStaff(i,config); await defer(i);
      const id = i.options.getInteger('id',true);
      return locks.run(`suggestion:${i.guildId}:${id}`,async () => {
        const suggestion = store.suggestion(id,i.guildId);
        const state = i.options.getString('estado',true);
        if (!suggestion || !STATUSES[state]) throw new Error('Sugerencia o estado inválidos.');
        const channel = await textChannel(i.guild,suggestion.channel);
        const message = await channel.messages.fetch(suggestion.message);
        const note = i.options.getString('nota');
        await message.edit(suggestionMessage({ ...suggestion,state,note },store.countVotes(id)));
        store.setSuggestionState(id,state,note);
        await i.editReply({ content:`✅ #${id} → ${STATUSES[state].title}` });
        return log(i.guild,`💡 Sugerencia #${id} → ${state} por <@${i.user.id}>.`);
      });
    }
    if (name==='anunciar') {
      requireAdmin(i); const config=readyConfig(i); await defer(i);
      const body = i.options.getString('texto',true);
      const code=Object.entries(config.languageCategories || {}).find(([,id])=>id===i.channel?.parentId)?.[0] || lang(i).code;
      const channel = await textChannel(i.guild,config[`announcement_${code}`] || config.announcementChannel);
      assertCanPost(channel,i.guild.members.me);
      const id = store.createAnnouncement(i.guildId,body);
      const message = await channel.send(announcementMessage(id,body,code,ai.enabled));
      store.publishAnnouncement(id,channel.id,message.id);
      return i.editReply({ content:`📡 ${message.url}${ai.enabled ? '' : '\nℹ️ La traducción automática está desactivada.'}` });
    }
  }

  return async i => {
    if (!i.isChatInputCommand() && !i.isButton() && !i.isStringSelectMenu() && !i.isModalSubmit()) return;
    if (!i.inGuild()) return i.reply({ content:'Usá el bot dentro del servidor. / Use the bot in the server.',flags:MessageFlags.Ephemeral });
    if (i.isChatInputCommand()) {
      if(!['configurar','diagnostico','novedades-idioma','novedades-reintentar','ticket-reabrir','instalar','idioma','sugerir','ayuda','panel','sugerencia','anunciar'].includes(i.commandName))throw new Error('Este comando ya no está disponible. Usá /ayuda.');
      return slash(i);
    }
    const [scope,action,value,code] = i.customId.split(':');
    if (scope==='language' && i.isStringSelectMenu()) return chooseLanguage(i);
    if (scope==='dismiss' && i.isButton()) return i.update({ content:'✓',embeds:[],components:[] });
    if (scope==='hub' && i.isStringSelectMenu()) {
      readyConfig(i);
      const l=LANGUAGES.find(l=>l.code===action) || lang(i);
      const choice = i.values[0];
      if (choice==='language') return i.reply({flags:MessageFlags.Ephemeral,...panel('idiomas',l)});
      if (choice==='tickets') return i.reply({ ...panel('tickets',l),flags:MessageFlags.Ephemeral });
      if (choice==='suggestion') return i.showModal(suggestionModal(l));
    }
    if (scope==='ticket') {
      if (action==='new' && i.isStringSelectMenu()) { readyConfig(i); if (!TICKET_TYPES.some(t=>t.key===i.values[0])) throw new Error('Categoría inválida.'); return i.showModal(ticketModal(i.values[0],LANGUAGES.find(l=>l.code===value) || lang(i))); }
      if (action==='submit' && i.isModalSubmit()) return newTicket(i,value,code);
      if (i.isButton()) return ticketAction(i,action,value);
    }
    if (scope==='suggest') {
      if (action==='new' && i.isButton()) { readyConfig(i); return i.showModal(suggestionModal(LANGUAGES.find(l=>l.code===value) || lang(i))); }
      if (action==='submit' && i.isModalSubmit()) return submitSuggestion(i,value);
    }
    if (scope==='vote' && i.isButton()) return vote(i,action,Number(value));
    if (scope==='translate' && i.isStringSelectMenu()) {
      await defer(i);
      const selected=LANGUAGES.find(l=>l.code===i.values[0]);
      const announcement=store.announcement(Number(action),i.guildId);
      if (!selected || !announcement || announcement.message!==i.message.id || announcement.channel!==i.channelId) throw new Error('Anuncio inválido.');
      const translated=await locks.run(`translation:${i.guildId}:${action}:${selected.code}`,()=>ai.translate(i.guildId,i.user.id,Number(action),selected.code));
      return i.editReply({ embeds:[embed(`🌐 ${selected.label}`,translated).setFooter({ text:selected.machine })],components:[dismissButton(selected)] });
    }
    throw new Error('Este control ya no es válido. Volvé a abrir el panel. / Reopen the panel.');
  };
}
