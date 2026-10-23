import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decryptState, encryptState, MAX_CLOUD_DATABASE } from './cloud-access.js';
import { requireDiscord } from './settings.js';

export class CloudRPC {
  constructor(access, { fetcher = fetch } = {}) { this.access = access; this.fetch = fetcher; }
  async call(action, parameters = {}) {
    let response;
    try {
      response = await this.fetch(`${this.access.url}/rest/v1/rpc/wo_cloud_call`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
        headers: { apikey: this.access.apiKey, 'Content-Type': 'application/json',
          ...(this.access.apiKey.startsWith('eyJ') ? { Authorization: `Bearer ${this.access.apiKey}` } : {}) },
        body: JSON.stringify({ p_room: this.access.room, p_access: this.access.secret, p_action: action, ...parameters }),
      });
    } catch { throw new Error('La comunidad no responde. El bot espera sin usar una copia antigua. Revisá Internet o el estado de Supabase.'); }
    const text = await response.text();
    if (text.length > 20 * 1024 * 1024) throw new Error('La respuesta compartida supera el tamaño permitido.');
    if (!response.ok) {
      const code = text.match(/WO_[A-Z_]+/)?.[0];
      const messages = {
        WO_ACCESS_DENIED: 'El acceso de esta PC no está autorizado.',
        WO_LEASE_LOST: 'Otra PC tiene el control o venció la conexión. Esta copia deja de responder.',
        WO_REVISION_CONFLICT: 'La versión compartida cambió. Esta copia no sobrescribe los datos.',
        WO_NOT_INITIALIZED: 'Falta activar la comunidad desde la PC que tiene los datos actuales.',
        WO_ALREADY_INITIALIZED: 'La comunidad ya tiene datos. No se sobrescribió la copia compartida.',
      };
      throw new Error(messages[code] || 'No se pudo validar el servicio compartido. Revisá la configuración de la comunidad.');
    }
    try { return JSON.parse(text); } catch { throw new Error('El servicio compartido devolvió una respuesta inválida.'); }
  }
}

export function snapshotStore(store, credentials) {
  const directory = store.cloudDirectory;
  mkdirSync(directory, { recursive: true });
  const temporary = mkdtempSync(join(directory, 'snapshot-'));
  try {
    const path = join(temporary, 'state.sqlite');
    store.db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
    const database = readFileSync(path);
    if (database.length > MAX_CLOUD_DATABASE) throw new Error('La base supera los 8 MiB admitidos por el modo compartido.');
    return { version: 1, credentials: { token: credentials.token, clientId: credentials.clientId, guildId: credentials.guildId }, database: database.toString('base64') };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export function restoreCloudState(root, access, envelope) {
  const state = decryptState(access, envelope);
  if (state.version !== 1 || state.credentials?.clientId !== access.clientId || state.credentials?.guildId !== access.guildId) throw new Error('La copia compartida no corresponde a esta comunidad.');
  requireDiscord(state.credentials);
  if (typeof state.database !== 'string' || state.database.length > 12 * 1024 * 1024) throw new Error('La base compartida no tiene un tamaño válido.');
  const database = Buffer.from(state.database, 'base64');
  if (database.length > MAX_CLOUD_DATABASE || database.subarray(0, 16).toString() !== 'SQLite format 3\0') throw new Error('La base compartida no es válida.');
  const directory = join(root, 'data', 'cloud-state');
  mkdirSync(directory, { recursive: true });
  const temporary = mkdtempSync(join(directory, 'receive-'));
  try {
    const path = join(temporary, 'state.sqlite');
    writeFileSync(path, database, { mode: 0o600 });
    const check = new DatabaseSync(path, { readOnly: true });
    try {
      if (check.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('La base compartida está dañada.');
      const rooms = check.prepare('SELECT guild FROM settings').all();
      if (!rooms.some(room => room.guild === access.guildId) || rooms.some(room => room.guild !== access.guildId)) throw new Error('La base contiene otro servidor. No se activó.');
    } finally { check.close(); }
    const current = join(directory, 'guardian.sqlite');
    // The local process lock is held and the previous Store has been closed.
    if (existsSync(current)) writeFileSync(join(directory, 'previous.sqlite'), readFileSync(current), { mode: 0o600 });
    for (const suffix of ['-wal', '-shm', '']) rmSync(current + suffix, { force: true });
    renameSync(path, current);
    return { ...state.credentials, dataDir: directory, aiEnabled: false };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export class CloudSession {
  constructor(access, { rpc = new CloudRPC(access), now = () => performance.now(), onLost = () => {} } = {}) {
    this.access = access; this.rpc = rpc; this.now = now; this.onLost = onLost;
    this.holder = randomUUID(); this.active = false; this.stopped = false;
    this.sequence = 0; this.savedSequence = 0; this.pending = null;
    this.abort = new AbortController();
  }
  grant(result, started) {
    if (result.ttl !== 45) throw new Error('El servicio compartido no tiene un plazo de control válido.');
    // Use monotonic request START time. A delayed response cannot extend our
    // local deadline beyond the lease granted by the database's clock.
    this.deadline = started + 33000;
  }
  async acquire() {
    const started = this.now();
    const result = await this.rpc.call('acquire', { p_holder: this.holder });
    if (!result.active) return result;
    if (result.clientId !== this.access.clientId || result.guildId !== this.access.guildId || !Number.isSafeInteger(result.epoch) || !Number.isSafeInteger(result.revision)) throw new Error('La identidad de la comunidad no coincide.');
    this.epoch = result.epoch; this.revision = result.revision; this.grant(result, started);
    this.active = true; this.assertActive();
    return result;
  }
  assertActive() {
    if (!this.active || this.now() >= this.deadline) {
      this.lose(); throw new Error('Esta PC ya no tiene el control de la comunidad.');
    }
  }
  lose() {
    if (this.stopped) return;
    this.stopped = true; this.active = false;
    this.abort.abort(); clearInterval(this.heartbeat); clearInterval(this.watchdog); clearInterval(this.autosave);
    queueMicrotask(() => this.onLost());
  }
  parameters() { return { p_holder: this.holder, p_epoch: this.epoch }; }
  bind(store, credentials) {
    this.store = store; this.credentials = credentials;
    store.cloudDirectory = credentials.dataDir;
    const proxy = new Proxy(store, { get: (target, name) => {
      const value = target[name];
      if (typeof value !== 'function' || name === 'close') return typeof value === 'function' ? value.bind(target) : value;
      return (...args) => {
        this.assertActive();
        if (this.stopNewWork) throw new Error('Esta PC está deteniendo el bot.');
        const before = target.db.prepare('SELECT total_changes() AS n').get().n;
        try { return value.apply(target, args); }
        finally { if (target.db.prepare('SELECT total_changes() AS n').get().n !== before) this.sequence++; }
      };
    } });
    this.heartbeat = setInterval(() => this.renew().catch(() => this.lose()), 8000);
    this.watchdog = setInterval(() => { try { this.assertActive(); } catch { } }, 1000);
    this.autosave = setInterval(() => { if (this.sequence !== this.savedSequence) this.flush().catch(() => this.lose()); }, 1000);
    return proxy;
  }
  async renew() {
    this.assertActive();
    const started = this.now();
    const result = await this.rpc.call('renew', this.parameters());
    this.assertActive(); this.grant(result, started);
  }
  async flush() {
    this.assertActive();
    const target = this.sequence;
    try {
      while (this.savedSequence < target) {
        if (!this.pending) {
          const sequence = this.sequence;
          const state = encryptState(this.access, snapshotStore(this.store, this.credentials));
          const started = this.now();
          this.pending = this.rpc.call('save', { ...this.parameters(), p_revision: this.revision, p_state: state }).then(result => {
            this.assertActive();
            if (result.revision !== this.revision + 1) throw new Error('La versión compartida no es la esperada.');
            this.revision = result.revision; this.savedSequence = sequence; this.grant(result, started);
          }).finally(() => { this.pending = null; });
        }
        await this.pending;
      }
      this.assertActive();
    } catch (error) { this.lose(); throw error; }
  }
  async beforeDiscord(signal) {
    if (this.stopNewWork) throw new Error('Esta PC está deteniendo el bot.');
    this.assertActive(); await this.flush(); this.assertActive();
    if (signal?.aborted) throw new Error('La solicitud venció antes de obtener el control de la comunidad.');
  }
  async shutdown() {
    if (this.active && !this.stopped) {
      try { await this.flush(); await this.rpc.call('release', this.parameters()); } catch { /* No release if state could not be durably saved. */ }
    }
    this.lose();
  }
}
