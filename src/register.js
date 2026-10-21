import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';
import { readSettings, requireDiscord } from './settings.js';

try {
  const settings=readSettings(); requireDiscord(settings);
  const rest=new REST({ version:'10' }).setToken(settings.token);
  await rest.put(Routes.applicationGuildCommands(settings.clientId,settings.guildId),{ body:commands });
  console.log(`✅ ${commands.length} comandos registrados para tu servidor WO.`);
} catch (error) {
  console.error(`No se pudieron registrar comandos: ${error.code || error.status || 'configuración o conexión'}. ${error.name==='Error' && !error.requestBody ? error.message.replace(/Bot\s+\S+/g,'[redacted]') : 'Revisá los IDs, el token y la invitación del bot.'}`);
  process.exitCode=1;
}
