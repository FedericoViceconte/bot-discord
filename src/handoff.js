import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { DatabaseSync, backup } from 'node:sqlite';
import { readSettings, requireDiscord } from './settings.js';

const FORMAT = 'WO-HOST-1';
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_FILE_BYTES = 240 * 1024 * 1024;

function settingsFromFile(root) {
  return readSettings(parseEnv(readFileSync(join(root, '.env'), 'utf8')));
}

function transferEnv(settings) {
  requireDiscord(settings);
  if (!/^[\w.-]+$/.test(settings.token)) throw new Error('El token tiene espacios o caracteres inválidos. Revisá .env.');
  // Do not transfer unrelated API keys, absolute Windows paths or optional AI settings.
  return `DISCORD_TOKEN=${settings.token}\nDISCORD_CLIENT_ID=${settings.clientId}\nDISCORD_GUILD_ID=${settings.guildId}\nDATA_DIR=./data\nAI_ENABLED=false\n`;
}

export function sealHandoff(payload, password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('Elegí una contraseña de entre 12 y 1024 caracteres para el relevo.');
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', scryptSync(password, salt, 32), iv);
  const plaintext = Buffer.from(JSON.stringify(payload));
  if (plaintext.length > (MAX_FILE_BYTES - 4096) * 0.75) throw new Error('La base es demasiado grande para este asistente de relevo.');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({ format: FORMAT, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}

export function openHandoff(content, password) {
  try {
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error();
    const envelope = JSON.parse(content);
    if (envelope.format !== FORMAT) throw new Error();
    const salt = Buffer.from(envelope.salt, 'base64'), iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || typeof password !== 'string' || password.length > 1024) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', scryptSync(password, salt, 32), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  } catch { throw new Error('No se pudo abrir el relevo. La contraseña es incorrecta o el archivo está dañado.'); }
}

async function snapshot(source, target) {
  const db = new DatabaseSync(source, { readOnly: true });
  try { await backup(db, target); } finally { db.close(); }
}

function verifyDatabase(path, guildId) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('La copia de la base está dañada.');
    const rows = db.prepare('SELECT guild FROM settings').all();
    if (!rows.some(row => row.guild === guildId) || rows.some(row => row.guild !== guildId)) throw new Error('La base no corresponde al servidor del relevo.');
  } finally { db.close(); }
}

export async function exportHandoff(root, password) {
  const settings = settingsFromFile(root);
  const env = transferEnv(settings);
  // DATA_DIR in the local .env may be absolute or differ from the portable destination.
  const localData = resolve(root, parseEnv(readFileSync(join(root, '.env'), 'utf8')).DATA_DIR || './data');
  const localDatabase = join(localData, 'guardian.sqlite');
  if (!existsSync(localDatabase)) throw new Error('Falta la base del anfitrión actual. No se puede preparar un relevo desde una descarga vacía.');
  const temp = mkdtempSync(join(localData, 'handoff-'));
  try {
    const copy = join(temp, 'guardian.sqlite');
    await snapshot(localDatabase, copy);
    if (statSync(copy).size > MAX_BYTES) throw new Error('La base supera el límite de 128 MiB del asistente de relevo.');
    verifyDatabase(copy, settings.guildId);
    const payload = { version: 1, id: randomUUID(), createdAt: new Date().toISOString(), clientId: settings.clientId, guildId: settings.guildId, env, database: readFileSync(copy).toString('base64') };
    const sealed = sealHandoff(payload, password);
    const outputDirectory = join(root, 'relevos');
    mkdirSync(outputDirectory, { recursive: true });
    const output = join(outputDirectory, `WO-relevo-${payload.createdAt.replace(/[:.]/g, '-')}.wohost`);
    writeFileSync(output, sealed, { flag: 'wx', mode: 0o600 });
    // Opening the launcher after a handoff must not silently resume this older copy.
    const controlDirectory = join(root, 'data');
    mkdirSync(controlDirectory, { recursive: true });
    writeFileSync(join(controlDirectory, 'host-handoff.json'), JSON.stringify({ id: payload.id, createdAt: payload.createdAt }), { mode: 0o600 });
    return { output, clientId: settings.clientId, guildId: settings.guildId };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

export async function importHandoff(root, file, password) {
  if (statSync(file).size > MAX_FILE_BYTES) throw new Error('El archivo de relevo es demasiado grande.');
  const payload = openHandoff(readFileSync(file, 'utf8'), password);
  if (payload.version !== 1 || typeof payload.id !== 'string' || typeof payload.env !== 'string' || typeof payload.database !== 'string') throw new Error('El archivo no es un relevo válido.');
  const settings = readSettings(parseEnv(payload.env));
  const portableEnv = transferEnv(settings);
  if (settings.clientId !== payload.clientId || settings.guildId !== payload.guildId) throw new Error('Los datos del servidor no coinciden dentro del relevo.');
  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    const local = settingsFromFile(root);
    if ((local.clientId && local.clientId !== settings.clientId) || (local.guildId && local.guildId !== settings.guildId)) throw new Error('Esta carpeta está configurada para otro bot o servidor. Usá una carpeta separada.');
    const localEnv = parseEnv(readFileSync(envPath, 'utf8'));
    if (resolve(root, localEnv.DATA_DIR || './data') !== join(root, 'data')) throw new Error('Esta carpeta usa un DATA_DIR personalizado. Recibí el relevo en una descarga nueva para no reemplazar una base diferente.');
  }
  const data = join(root, 'data');
  mkdirSync(data, { recursive: true });
  const temp = mkdtempSync(join(data, 'handoff-'));
  try {
    const copy = join(temp, 'guardian.sqlite');
    const bytes = Buffer.from(payload.database, 'base64');
    if (bytes.length > MAX_BYTES || bytes.subarray(0, 16).toString() !== 'SQLite format 3\0') throw new Error('La base incluida no es una base SQLite válida.');
    writeFileSync(copy, bytes, { mode: 0o600 });
    verifyDatabase(copy, settings.guildId);
    const current = join(data, 'guardian.sqlite');
    let backupDirectory;
    if (existsSync(current) || existsSync(envPath)) {
      backupDirectory = join(data, 'respaldos-relevo', `${Date.now()}-${randomUUID().slice(0, 8)}`);
      mkdirSync(backupDirectory, { recursive: true });
      if (existsSync(current)) await snapshot(current, join(backupDirectory, 'guardian.sqlite'));
      if (existsSync(envPath)) writeFileSync(join(backupDirectory, '.env'), readFileSync(envPath), { mode: 0o600 });
    }
    // The caller must hold the host lock and have stopped the managed process.
    // Keep a consistent snapshot for rollback before replacing either file.
    try {
      for (const suffix of ['-wal', '-shm', '']) rmSync(current + suffix, { force: true });
      renameSync(copy, current);
      writeFileSync(envPath, portableEnv, { mode: 0o600 });
    } catch (error) {
      for (const suffix of ['-wal', '-shm', '']) rmSync(current + suffix, { force: true });
      const oldDatabase = backupDirectory && join(backupDirectory, 'guardian.sqlite');
      if (oldDatabase && existsSync(oldDatabase)) writeFileSync(current, readFileSync(oldDatabase), { mode: 0o600 });
      const oldEnv = backupDirectory && join(backupDirectory, '.env');
      if (oldEnv && existsSync(oldEnv)) writeFileSync(envPath, readFileSync(oldEnv), { mode: 0o600 });
      else rmSync(envPath, { force: true });
      throw error;
    }
    rmSync(join(data, 'host-handoff.json'), { force: true });
    return { clientId: settings.clientId, guildId: settings.guildId, createdAt: payload.createdAt, backupDirectory };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
