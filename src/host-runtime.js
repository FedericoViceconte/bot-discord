import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadCloudAccess } from './cloud-access.js';
import { CloudSession, restoreCloudState } from './cloud.js';
import { acquireHostLock } from './host-lock.js';
import { readSettings, requireDiscord } from './settings.js';

export async function hostRuntime(runBot, root = process.cwd()) {
  const data = join(root, 'data'); mkdirSync(data, { recursive: true });
  const access = loadCloudAccess(root);
  if (!access && existsSync(join(root, 'community.json'))) throw new Error('Vinculá esta PC una sola vez desde Agente-Canino.exe. No se inició una copia local antigua.');
  const settings = readSettings();
  if (!access) requireDiscord(settings);
  const release = await acquireHostLock(access || settings);
  let stopping = false, wake;
  const stopped = new Promise(resolve => { wake = resolve; });
  const stop = () => { stopping = true; wake(); };
  const status = (state, description) => writeFileSync(join(data, 'host-status.json'), JSON.stringify({ pid: process.pid, state, description, at: Date.now(), stopProtocol: 1 }));
  const control = setInterval(() => {
    try {
      const path = join(data, 'stop-request.json');
      if (existsSync(path) && JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')).pid === process.pid) { rmSync(path, { force: true }); stop(); }
    } catch { /* A partially written request is read on the next tick. */ }
  }, 500);
  const signalHandlers = ['SIGINT', 'SIGTERM'].map(signal => { process.once(signal, stop); return signal; });
  const pause = async milliseconds => {
    let timer;
    try { await Promise.race([new Promise(resolve => { timer = setTimeout(resolve, milliseconds); }), stopped]); }
    finally { clearTimeout(timer); }
  };
  try {
    if (!access) { await runBot(settings, { stopped, status }); return; }
    let reported = '';
    while (!stopping) {
      let session;
      try {
        let lost;
        const lostLease = new Promise(resolve => { lost = resolve; });
        session = new CloudSession(access, { onLost: lost });
        const result = await session.acquire();
        if (stopping) { await session.shutdown(); break; }
        if (!result.active) {
          status('waiting', 'Otra PC está alojando el bot. Esta copia toma el relevo automáticamente cuando quede libre.');
          if (reported !== 'waiting') console.log('EN ESPERA: otra PC aloja el bot. El relevo es automático.');
          reported = 'waiting';
          await pause(7000 + Math.floor(Math.random() * 2000)); continue;
        }
        const current = restoreCloudState(root, access, result.state);
        status('connecting', 'Conectando con los datos compartidos actualizados.');
        reported = 'connecting';
        await runBot({ ...settings, ...current, aiEnabled: false }, { session, stopped: Promise.race([stopped, lostLease]), status });
      } catch (error) {
        const message = error.name === 'Error' ? error.message : 'No se pudo conectar con la comunidad compartida.';
        status('waiting', message);
        if (reported !== message) console.error(`[Comunidad] ${message}`);
        reported = message;
      } finally { await session?.shutdown(); }
      if (!stopping) await pause(7000 + Math.floor(Math.random() * 2000));
    }
  } finally {
    clearInterval(control); for (const signal of signalHandlers) process.removeListener(signal, stop);
    status('stopped', 'El bot está detenido en esta PC.'); await release();
  }
}

export function discordGuard(session, fetcher = fetch) {
  return async (url, options) => {
    await session.beforeDiscord(options.signal);
    const signal = options.signal ? AbortSignal.any([options.signal, session.abort.signal]) : session.abort.signal;
    if (signal.aborted) throw new Error('Se canceló una solicitud de la PC anterior.');
    return fetcher(url, { ...options, signal });
  };
}
