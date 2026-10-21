import { SlashCommandBuilder, PermissionFlagsBits as P, ChannelType } from 'discord.js';
import { STATUSES } from './catalog.js';

const admin = (name, description) => new SlashCommandBuilder().setName(name).setDescription(description).setDefaultMemberPermissions(P.Administrator).setDMPermission(false);
const publicCommand = (name, description) => new SlashCommandBuilder().setName(name).setDescription(description).setDMPermission(false);
export const commands = [
  admin('instalar','Crear la estructura WO, roles de idioma y paneles; se puede repetir sin duplicar.'),
  admin('configurar','Configurar rol de nuevos miembros, soporte y canales.')
    .addRoleOption(o => o.setName('rol_nuevos').setDescription('Rol sin privilegios para asignar al entrar.'))
    .addRoleOption(o => o.setName('rol_soporte').setDescription('Equipo que podrá ver TODOS los tickets.'))
    .addChannelOption(o => o.setName('bienvenida').setDescription('Canal para tarjetas de bienvenida.').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o => o.setName('sugerencias').setDescription('Canal donde publicar las propuestas.').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o => o.setName('anuncios').setDescription('Canal donde publicar anuncios.').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o => o.setName('logs').setDescription('Canal PRIVADO del equipo para registros.').addChannelTypes(ChannelType.GuildText)),
  admin('panel','Publicar o actualizar un panel interactivo en un canal.')
    .addStringOption(o => o.setName('tipo').setDescription('Panel a publicar.').setRequired(true).addChoices(...['central','idiomas','tickets','sugerencias'].map(value => ({name:value,value}))))
    .addChannelOption(o => o.setName('canal').setDescription('Canal de destino.').addChannelTypes(ChannelType.GuildText)),
  admin('diagnostico','Revisar permisos, roles y configuración del bot.'),
  admin('novedades-reintentar','Reintentar una novedad sin duplicar los idiomas ya enviados.')
    .addIntegerOption(o=>o.setName('id').setDescription('Número de novedad del canal de estado.').setMinValue(1).setRequired(true)),
  admin('novedades-idioma','Elegir el idioma en el que escribís las novedades privadas.')
    .addStringOption(o=>o.setName('idioma').setDescription('Idioma de tus próximos mensajes de novedades.').setRequired(true).addChoices({name:'Español',value:'es'},{name:'English',value:'en'},{name:'Português',value:'pt'},{name:'Français',value:'fr'},{name:'Deutsch',value:'de'})),
  admin('ticket-reabrir','Reabrir un ticket cerrado en un canal privado nuevo (solo administradores).')
    .addIntegerOption(o=>o.setName('id').setDescription('Número del ticket cerrado.').setMinValue(1).setRequired(true)),
  publicCommand('idioma','Elegí o cambiá tu idioma / Choose your language.'),
  publicCommand('sugerir','Compartir una mejora para WO / Suggest an improvement.'),
  publicCommand('ayuda','Ver las funciones y comandos de WO Guardian.'),
  // Public default so a custom support role can use it; handler enforces actual staff membership.
  publicCommand('sugerencia','Cambiar el estado de una sugerencia (solo equipo de soporte).')
    .addIntegerOption(o => o.setName('id').setDescription('Número de sugerencia.').setMinValue(1).setRequired(true))
    .addStringOption(o => o.setName('estado').setDescription('Nuevo estado.').setRequired(true).addChoices(...Object.entries(STATUSES).map(([value,s])=>({ name:s.title,value }))))
    .addStringOption(o => o.setName('nota').setDescription('Explicación del equipo (opcional).').setMaxLength(500)),
  admin('anunciar','Publicar un anuncio en la comunidad del idioma actual.')
    .addStringOption(o => o.setName('texto').setDescription('Contenido del anuncio para tu comunidad.').setMinLength(5).setMaxLength(3000).setRequired(true)),
].map(c => c.toJSON());
