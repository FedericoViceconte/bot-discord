import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeAccess, encodeAccess, loadCloudAccess, saveCloudAccess } from '../src/cloud-access.js';
import { CloudRPC } from '../src/cloud.js';
import { acquireHostLock } from '../src/host-lock.js';

let release;
try {
  const root = process.cwd();
  if (process.argv[2] === 'link') {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; if (size > 10000) throw new Error('El código es demasiado largo.'); chunks.push(chunk); }
    const { code } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const access = decodeAccess(code.trim());
    const publicPath = join(root, 'community.json');
    if (existsSync(publicPath)) {
      const expected = JSON.parse(readFileSync(publicPath, 'utf8'));
      if (expected.room !== access.room || expected.url !== access.url || expected.clientId !== access.clientId || expected.guildId !== access.guildId) throw new Error('El código corresponde a otra comunidad. Descargá su carpeta correcta.');
    }
    release = await acquireHostLock(access);
    const result = await new CloudRPC(access).call('peek');
    if (!result.initialized || result.clientId !== access.clientId || result.guildId !== access.guildId) throw new Error('La comunidad todavía no está activada o no coincide con el código.');
    saveCloudAccess(root, access);
    console.log('Esta PC quedó vinculada. A partir de ahora solo tenés que abrir el exe.');
  } else if (process.argv[2] === 'invite') {
    const access = loadCloudAccess(root);
    if (!access) throw new Error('Esta PC no está vinculada a la comunidad.');
    writeFileSync(join(root, 'data', 'cloud-invite.txt'), encodeAccess(access), { mode: 0o600 });
    console.log('Código de vinculación preparado de forma privada en esta PC.');
  } else throw new Error('Acción de comunidad inválida.');
} catch (error) {
  console.error(error.code || error.name === 'SyntaxError' ? 'No se pudo vincular la comunidad. Revisá el código y los permisos.' : error.message);
  process.exitCode = 1;
} finally { await release?.(); }
