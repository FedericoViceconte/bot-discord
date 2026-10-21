import { PermissionsBitField } from 'discord.js';
import { BOT_PERMISSIONS } from '../src/permissions.js';
const id=process.env.DISCORD_CLIENT_ID?.trim();
if (!/^\d{17,20}$/.test(id || '')) { console.error('Completá DISCORD_CLIENT_ID en .env.');process.exitCode=1; }
else {
  const url=new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id',id);
  url.searchParams.set('scope','bot applications.commands');
  url.searchParams.set('integration_type','0');
  url.searchParams.set('permissions',new PermissionsBitField(BOT_PERMISSIONS).bitfield.toString());
  if (process.env.DISCORD_GUILD_ID) url.searchParams.set('guild_id',process.env.DISCORD_GUILD_ID);
  console.log(`Abrí este enlace con una cuenta que administre tu servidor:\n${url}`);
}
