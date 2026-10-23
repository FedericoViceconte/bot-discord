import { existsSync, accessSync, constants, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseEnv } from 'node:util';
import { readSettings, requireDiscord } from '../src/settings.js';
import { loadCloudAccess } from '../src/cloud-access.js';

const [major, minor] = process.versions.node.split('.').map(Number);
let failed = false;
function check(ok, message) { console.log(`${ok ? 'OK' : 'ERROR'}: ${message}`); if (!ok) failed = true; }
check(major > 24 || (major === 24 && minor >= 17), `Node.js ${process.versions.node}; se necesita 24.17 o superior.`);
check(existsSync('node_modules/discord.js/package.json') && existsSync('node_modules/@napi-rs/canvas/package.json'), 'Dependencias. Si faltan, abri 1-INSTALAR.cmd.');
const shared = existsSync('community.json') || existsSync('data/cloud-access.json');
if (shared) {
  try {
    const access = loadCloudAccess(process.cwd());
    check(Boolean(access), 'Vinculacion de esta PC. Si falta, abri el exe y elegi Vincular esta PC.');
    if (access) console.log('OK: Comunidad compartida configurada. Los datos se obtienen en linea antes de conectar Discord.');
  } catch { check(false, 'El acceso de la comunidad esta danado. Volve a vincular esta PC desde el exe.'); }
} else check(existsSync('.env'), 'Archivo .env. Para continuar el bot del equipo, usa 8-RECIBIR-RELEVO.cmd.');
if (!failed && !shared) {
  try {
    const env = parseEnv(readFileSync('.env', 'utf8'));
    const settings = readSettings(env);
    requireDiscord(settings);
    console.log('OK: Token e identificadores configurados (no se muestran).');
    const data = resolve(settings.dataDir);
    if (existsSync(data)) accessSync(data, constants.R_OK | constants.W_OK);
    const database = join(data, 'guardian.sqlite');
    if (existsSync(database)) {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(database, { readOnly: true });
      try {
        check(db.prepare('PRAGMA quick_check').get().quick_check === 'ok', 'Base de datos legible e integra.');
        const configured = db.prepare('SELECT body FROM settings WHERE guild=?').get(settings.guildId);
        if (!configured) console.log('AVISO: No hay configuracion guardada de este servidor. Si es el bot del equipo, recibe primero su relevo.');
      } finally { db.close(); }
    } else console.log('AVISO: Esta copia no tiene la base del servidor. Para continuar el bot del equipo, recibe el relevo antes de iniciarlo.');
    console.log('Este diagnostico es local: no comprueba el token en Discord ni si otra PC esta ejecutando el bot.');
  } catch (error) {
    // Never print arbitrary exceptions that could contain a credential or env content.
    const missing = error.message?.match(/^Completá (DISCORD_[A-Z_]+)/)?.[1];
    check(false, missing ? `Falta ${missing}. Recibi un relevo o completa 2-CONFIGURAR.cmd.` : 'No se pudo validar la configuracion o la base. Revisa .env y los permisos de la carpeta.');
  }
}
process.exitCode = failed ? 1 : 0;
