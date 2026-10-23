import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSettings, requireDiscord } from '../src/settings.js';
import { validateAccess, accessHash, saveCloudAccess, encodeAccess, encryptState } from '../src/cloud-access.js';
import { CloudRPC, snapshotStore } from '../src/cloud.js';
import { acquireHostLock } from '../src/host-lock.js';
import { Store } from '../src/store.js';

let release, store;
try {
  const root = process.cwd(), data = join(root, 'data'); mkdirSync(data, { recursive: true });
  const settings = readSettings(); requireDiscord(settings);
  const path = join(data, 'cloud-setup.json');
  if (process.argv[2] === 'prepare') {
    const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const access = existsSync(path) ? validateAccess(JSON.parse(readFileSync(path, 'utf8'))) : validateAccess({
      version: 1, url: input.url, apiKey: input.apiKey, room: randomUUID(), secret: randomBytes(32).toString('hex'),
      clientId: settings.clientId, guildId: settings.guildId,
    });
    if (access.url !== input.url || access.apiKey !== input.apiKey || access.clientId !== settings.clientId || access.guildId !== settings.guildId) throw new Error('Ya existe la preparación de otra comunidad. No se reemplazó.');
    writeFileSync(path, JSON.stringify(access), { mode: 0o600 });
    const sql = readFileSync(join(root, 'cloud', 'supabase.sql'), 'utf8') +
      `\ninsert into wo_private.cloud_rooms(id,client_id,guild_id,access_hash) values ('${access.room}','${access.clientId}','${access.guildId}','${accessHash(access.secret)}') on conflict(id) do nothing;\n`;
    writeFileSync(join(data, 'activate-cloud.sql'), sql);
    console.log('Configuración preparada. El SQL está en data/activate-cloud.sql y no contiene el código de acceso ni el token.');
  } else if (process.argv[2] === 'seed') {
    const access = validateAccess(JSON.parse(readFileSync(path, 'utf8')));
    if (access.clientId !== settings.clientId || access.guildId !== settings.guildId) throw new Error('El bot local no corresponde a la comunidad.');
    release = await acquireHostLock(settings);
    store = new Store(settings.dataDir); store.cloudDirectory = settings.dataDir;
    const payload = snapshotStore(store, settings);
    const state = encryptState(access, payload);
    writeFileSync(join(data, 'cloud-initial-backup.json'), JSON.stringify(state), { mode: 0o600 });
    await new CloudRPC(access).call('seed', { p_state: state });
    saveCloudAccess(root, access);
    const { secret, ...publicConfiguration } = access;
    writeFileSync(join(root, 'community.json'), JSON.stringify(publicConfiguration, null, 2) + '\n');
    writeFileSync(join(data, 'cloud-invite.txt'), encodeAccess(access), { mode: 0o600 });
    console.log('Comunidad activada. La copia compartida está cifrada. El código inicial queda privado en esta PC.');
  } else throw new Error('Usá prepare o seed.');
} catch (error) {
  console.error(error.code || error.name === 'SyntaxError' ? 'No se pudo preparar la comunidad. Revisá los archivos y permisos.' : error.message);
  process.exitCode = 1;
} finally { store?.close(); await release?.(); }
