import { PermissionFlagsBits as P, ChannelType } from 'discord.js';

// Discord only lets a bot configure channel permission bits it holds itself.
export const BOT_PERMISSIONS = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.AttachFiles, P.ManageChannels, P.ManageRoles, P.UseApplicationCommands, P.AddReactions, P.Connect, P.Speak];
// ManageRoles stays inherited from the bot's guild role. Discord forbids
// non-admin bots from explicitly granting it in a new channel overwrite.
export const BOT_CHANNEL_PERMISSIONS = BOT_PERMISSIONS.filter(permission=>permission!==P.ManageRoles);
export const SAFE_MEMBER_PERMISSIONS = P.ViewChannel | P.SendMessages | P.ReadMessageHistory | P.AddReactions | P.EmbedLinks | P.AttachFiles | P.UseApplicationCommands | P.Connect | P.Speak | P.Stream | P.UseVAD | P.UseExternalEmojis | P.UseExternalStickers | P.ChangeNickname;

export function validateMemberRole(role, me, config = {}) {
  if (!role || role.id === role.guild.id || role.managed || !role.editable || me.roles.highest.comparePositionTo(role) <= 0) {
    throw new Error('Elegí un rol común que esté debajo del rol del bot. No puede ser @everyone ni un rol de integración.');
  }
  if (role.id === config.staffRole || Object.values(config.languageRoles || {}).includes(role.id)) throw new Error('El rol de nuevos usuarios debe ser distinto al de soporte y a los de idioma.');
  if ((role.permissions.bitfield & ~SAFE_MEMBER_PERMISSIONS) !== 0n) throw new Error('El rol de nuevos usuarios tiene permisos elevados. Elegí un rol de miembro sin permisos de administración/moderación.');
}

export function staff(interaction, config) {
  return interaction.memberPermissions?.has(P.Administrator) || Boolean(config.staffRole && interaction.member?.roles?.cache?.has(config.staffRole));
}
export function requireAdmin(interaction) {
  if (!interaction.memberPermissions?.has(P.Administrator)) throw new Error('Solo administradores del servidor.');
}
export function requireStaff(interaction, config) { if (!staff(interaction,config)) throw new Error('Solo el equipo de soporte. / Staff only.'); }

export function privateOverwrites(guild, botId, staffId, ownerId) {
  const access = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.UseApplicationCommands];
  return [
    { id: guild.id, deny: [P.ViewChannel] },
    { id: botId, allow: [...access, P.ManageChannels] },
    { id: staffId, allow: access },
    ...(ownerId ? [{ id: ownerId, allow: access }] : []),
  ];
}

export async function textChannel(guild, id) {
  const channel = id ? await guild.channels.fetch(id) : null;
  if (!channel || channel.type !== ChannelType.GuildText) throw new Error('Falta un canal de texto configurado. Ejecutá /instalar o /configurar.');
  return channel;
}

export function assertCanPost(channel, me) {
  const needed = [P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory];
  if (!channel.permissionsFor(me)?.has(needed)) throw new Error(`Faltan permisos para publicar en #${channel.name}.`);
}
