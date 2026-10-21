import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { BRAND, COLOR, LANGUAGES, TICKET_TYPES, STATUSES, language } from './catalog.js';

export const embed = (title, description) => new EmbedBuilder().setColor(COLOR).setTitle(title).setDescription(description).setFooter({ text: BRAND });
const row = (...items) => new ActionRowBuilder().addComponents(...items);
export function languageMenu(id = 'language',l) {
  return row(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(`🌐 ${l?.languageLabel || 'Language'}`).addOptions(LANGUAGES.map(item => ({ label: item.label, value: item.code, emoji: item.emoji }))));
}
export function onboardingPrompt() {
  return {embeds:[embed('🪂 WO DEFINITIVE EDITION','🌐 Elegí tu idioma / Choose your language.')],components:[languageMenu()]};
}
export function welcomeChoice(guildId,config,l) {
  const hub=config[`hub_${l.code}`] || config.hubChannel;
  const chat=config[`chat_${l.code}`];
  return {embeds:[embed(l.welcomeTitle,`${l.chosen}\n\n${l.welcomeNext}`)],components:[row(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(l.hubButton).setURL(`https://discord.com/channels/${guildId}/${hub}`),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(l.chatButton).setURL(`https://discord.com/channels/${guildId}/${chat}`),
  )]};
}
export function ticketMenu(l) {
  return row(new StringSelectMenuBuilder().setCustomId(`ticket:new:${l.code}`).setPlaceholder(l.ticket).addOptions(TICKET_TYPES.map(t => ({ label: l[t.key], value: t.key, emoji: t.emoji }))));
}
export function panel(kind, l = language('es')) {
  if(kind==='entrada')return onboardingPrompt();
  if (kind === 'idiomas') return {
    embeds:[embed(l.promptTitle,l.promptBody)],components:[languageMenu('language',l)],
  };
  if (kind === 'tickets') return {
    embeds:[embed(l.ticketTitle,l.ticketBody)],components:[ticketMenu(l)],
  };
  if (kind === 'sugerencias') return {
    embeds:[embed(l.suggestionTitle,l.suggestionBody)],
    components:[row(new ButtonBuilder().setCustomId(`suggest:new:${l.code}`).setLabel(l.suggestAction).setEmoji('💡').setStyle(ButtonStyle.Primary))],
  };
  return {
    embeds:[embed(l.hubTitle,l.hubBody)],
    components: [row(new StringSelectMenuBuilder().setCustomId(`hub:${l.code}`).setPlaceholder(l.menuPrompt).addOptions([
      { label:l.languageLabel,value:'language',emoji:'🌐' },{label:l.supportLabel,value:'tickets',emoji:'🛟'},
      { label:l.suggestLabel,value:'suggestion',emoji:'💡' },
    ]))],
  };
}
export function ticketModal(type, l) {
  return new ModalBuilder().setCustomId(`ticket:submit:${type}:${l.code}`).setTitle(l.form).addComponents(
    row(new TextInputBuilder().setCustomId('subject').setLabel(l.subject).setStyle(TextInputStyle.Short).setMinLength(4).setMaxLength(100).setRequired(true)),
    row(new TextInputBuilder().setCustomId('detail').setLabel(l.detail.slice(0,45)).setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1800).setRequired(true)),
  );
}
export function suggestionModal(l) {
  return new ModalBuilder().setCustomId(`suggest:submit:${l.code}`).setTitle(l.suggestion).addComponents(row(new TextInputBuilder().setCustomId('body').setLabel(l.idea).setStyle(TextInputStyle.Paragraph).setMinLength(15).setMaxLength(1800).setRequired(true)));
}
export function ticketControls(ticket) {
  const l = language(ticket.lang);
  if (ticket.state !== 'open') return null;
  return row(new ButtonBuilder().setCustomId(`ticket:claim:${ticket.id}`).setStyle(ButtonStyle.Primary).setLabel(l.claim).setEmoji('🙋'), new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setStyle(ButtonStyle.Danger).setLabel(l.close).setEmoji('🔒'));
}
export function ticketMessage(ticket) {
  const l = language(ticket.lang);
  return { embeds: [embed(`🛟 #${ticket.id} · ${l[ticket.type]}`, `**${ticket.subject}**\n${ticket.detail}\n\n👤 <@${ticket.owner}>\n${ticket.claimed ? `🙋 <@${ticket.claimed}>` : `⏳ ${l.waiting}`}\n\n${ticket.state === 'open' ? l.noSecrets : l.closed}`)], components: ticket.state==='open' ? [ticketControls(ticket)] : [] };
}
export function suggestionMessage(suggestion, votes) {
  const status = STATUSES[suggestion.state];
  const l=language(suggestion.lang);
  return {
    embeds: [embed(`${status.emoji} ${l.states[suggestion.state]} #${suggestion.id}`, suggestion.body).setColor(status.color).addFields(
      { name:l.authorLabel,value:`<@${suggestion.author}>`,inline:true },
      { name:l.votesLabel,value:`👍 ${votes.yes} · 👎 ${votes.no}`,inline:true },
      ...(suggestion.note ? [{name:l.staffLabel,value:suggestion.note}] : []),
    )],
    components: [row(new ButtonBuilder().setCustomId(`vote:${suggestion.id}:1`).setLabel(String(votes.yes)).setEmoji('👍').setStyle(ButtonStyle.Success).setDisabled(['patched','rejected'].includes(suggestion.state)), new ButtonBuilder().setCustomId(`vote:${suggestion.id}:-1`).setLabel(String(votes.no)).setEmoji('👎').setStyle(ButtonStyle.Secondary).setDisabled(['patched','rejected'].includes(suggestion.state)))],
  };
}
export function announcementMessage(id, body,code='es',translationEnabled=true) {
  const l=language(code);
  return {embeds:[embed(l.announcementTitle,body)],components:translationEnabled ? [languageMenu(`translate:${id}`,l)] : []};
}
export function dismissButton(l) { return row(new ButtonBuilder().setCustomId('dismiss').setLabel(l.dismiss).setStyle(ButtonStyle.Secondary)); }
