import { createServer } from 'node:net';
import { createHash } from 'node:crypto';

// The OS releases this local lock even if Node or Windows terminates abruptly.
// A shared bot still needs a manual handoff between different computers.
export async function acquireHostLock(settings) {
  const name = createHash('sha256').update(`${settings.clientId}:${settings.guildId}`).digest('hex').slice(0, 24);
  const address = process.platform === 'win32'
    ? { path: `\\\\.\\pipe\\wo-guardian-${name}` }
    : { host: '127.0.0.1', port: 20000 + parseInt(name.slice(0, 8), 16) % 30000, exclusive: true };
  const server = createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', error => reject(new Error(error.code === 'EADDRINUSE'
      ? 'Este bot ya está abierto en esta PC (o su puerto local está ocupado). Usá 6-DETENER.cmd antes de cambiar de anfitrión.'
      : `No se pudo reservar el inicio del bot (${error.code}).`)));
    server.listen(address, resolve);
  });
  server.unref();
  return () => new Promise(resolve => server.close(resolve));
}
