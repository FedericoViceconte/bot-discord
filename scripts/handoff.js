import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { readSettings, requireDiscord } from '../src/settings.js';
import { acquireHostLock } from '../src/host-lock.js';
import { exportHandoff, importHandoff, openHandoff } from '../src/handoff.js';

let release;
try {
  const input = [];
  for await (const chunk of process.stdin) {
    input.push(chunk);
    if (Buffer.concat(input).length > 16384) throw new Error('Entrada demasiado larga.');
  }
  const { password, file } = JSON.parse(Buffer.concat(input).toString('utf8'));
  const root = process.cwd();
  const operation = process.argv[2];
  if (!['export', 'import'].includes(operation)) throw new Error('Operacion de relevo invalida.');
  let settings;
  if (operation === 'export') settings = readSettings(parseEnv(readFileSync('.env', 'utf8')));
  else {
    if (statSync(file).size > 240 * 1024 * 1024) throw new Error('El archivo de relevo es demasiado grande.');
    const payload = openHandoff(readFileSync(file, 'utf8'), password);
    settings = readSettings(parseEnv(payload.env));
  }
  requireDiscord(settings);
  release = await acquireHostLock(settings);
  if (operation === 'export') {
    const result = await exportHandoff(root, password);
    console.log(`Relevo creado: ${result.output}`);
    console.log('Envia ese archivo a tu amigo y la contrasena por separado. El bot queda DETENIDO en esta PC.');
    console.log('Tu amigo: 1-INSTALAR.cmd, 8-RECIBIR-RELEVO.cmd y 5-INICIAR.cmd.');
  } else {
    const result = await importHandoff(resolve(root), resolve(file), password);
    console.log(`Relevo recibido, creado el ${result.createdAt}.`);
    if (result.backupDirectory) console.log(`Copia anterior conservada en ${result.backupDirectory}`);
    console.log('Cuando el otro anfitrion confirme que detuvo su bot, abri 5-INICIAR.cmd.');
  }
} catch (error) {
  // Only emit our operational messages. System errors may contain private paths.
  console.error(error.code || error.name === 'SyntaxError'
    ? 'No se pudo completar el relevo. Revisa el archivo, Node.js y los permisos de la carpeta.'
    : error.message);
  process.exitCode = 1;
} finally { await release?.(); }
