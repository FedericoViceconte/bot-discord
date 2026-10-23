import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseEnv } from 'node:util';
import { Store } from '../src/store.js';
import { sealHandoff, openHandoff, exportHandoff, importHandoff } from '../src/handoff.js';
import { acquireHostLock } from '../src/host-lock.js';

const password = 'solo-para-prueba-1234';
const guild = '111111111111111111', client = '222222222222222222';
const env = `DISCORD_TOKEN=fake_token_for_tests\nDISCORD_CLIENT_ID=${client}\nDISCORD_GUILD_ID=${guild}\nDATA_DIR=./data\nOPENAI_API_KEY=not-for-transfer\nAI_ENABLED=true\n`;
function directory(t) {
  const root = mkdtempSync(join(tmpdir(), 'wo hosting test '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function source(t, extra = '') {
  const root = mkdtempSync(join(tmpdir(), 'wo hosting source '));
  writeFileSync(join(root, '.env'), env + extra);
  const data = extra ? join(root, 'custom-data') : join(root, 'data');
  const store = new Store(data);
  let closed = false;
  const close = () => { if (!closed) { store.close(); closed = true; } };
  t.after(() => { close(); rmSync(root, { recursive: true, force: true }); });
  store.setConfig(guild, { languageRoles: { es: 'spanish-role' }, archiveRetired: true, newsSourceChannel: 'private-source' });
  store.setLanguage(guild, 'member', 'es');
  store.createTicket({ guild, owner: 'member', type: 'bug', lang: 'es', subject: 'WAL data', detail: 'consulta', channel: 'ticket-channel' });
  return { root, store, close };
}
function readDatabase(path, fn) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return fn(db); } finally { db.close(); }
}

test('relevo cifra los datos y rechaza contraseña incorrecta o alteraciones', () => {
  const payload = { secret: 'fake-credential', message: 'Español y portugués 🌎' };
  const sealed = sealHandoff(payload, password);
  assert.ok(!sealed.includes(payload.secret));
  assert.deepEqual(openHandoff(sealed, password), payload);
  assert.throws(() => openHandoff(sealed, 'otra-contrasena'), /contraseña/);
  const altered = JSON.parse(sealed);
  const bytes = Buffer.from(altered.ciphertext, 'base64'); bytes[0] ^= 1;
  altered.ciphertext = bytes.toString('base64');
  assert.throws(() => openHandoff(JSON.stringify(altered), password), /dañado/);
  assert.throws(() => sealHandoff(payload, 'corta'), /12/);
});

test('relevo entre dos carpetas conserva configuración y datos WAL sin llevar otras claves', async t => {
  const from = source(t), destination = directory(t);
  const { output } = await exportHandoff(from.root, password);
  assert.equal(existsSync(join(from.root, 'data/host-handoff.json')), true);
  const sealed = readFileSync(output, 'utf8');
  assert.ok(!sealed.includes('fake_token_for_tests'));
  const decoded = openHandoff(sealed, password);
  assert.ok(!decoded.env.includes('OPENAI_API_KEY'));
  assert.ok(!decoded.env.includes('not-for-transfer'));
  assert.equal(parseEnv(decoded.env).AI_ENABLED, 'false');
  const received = await importHandoff(destination, output, password);
  assert.equal(received.guildId, guild);
  const config = parseEnv(readFileSync(join(destination, '.env'), 'utf8'));
  assert.equal(config.DISCORD_CLIENT_ID, client);
  assert.equal(config.DATA_DIR, './data');
  readDatabase(join(destination, 'data/guardian.sqlite'), db => {
    assert.equal(db.prepare('SELECT code FROM languages WHERE user=?').get('member').code, 'es');
    assert.equal(db.prepare('SELECT subject FROM tickets').get().subject, 'WAL data');
    assert.equal(JSON.parse(db.prepare('SELECT body FROM settings WHERE guild=?').get(guild).body).archiveRetired, true);
  });
});

test('cada vuelta lleva los cambios del nuevo anfitrión, no reutiliza la copia anterior', async t => {
  const first = source(t), second = directory(t);
  const outgoing = await exportHandoff(first.root, password);
  await importHandoff(second, outgoing.output, password);
  const store = new Store(join(second, 'data'));
  store.setLanguage(guild, 'member', 'de');
  store.close();
  const returning = await exportHandoff(second, password);
  // The exporting source's open connection is closed before receiving a return.
  first.close();
  const received = await importHandoff(first.root, returning.output, password);
  assert.equal(existsSync(join(first.root, 'data/host-handoff.json')), false);
  assert.ok(received.backupDirectory);
  assert.equal(readDatabase(join(first.root, 'data/guardian.sqlite'), db => db.prepare('SELECT code FROM languages WHERE user=?').get('member').code), 'de');
  assert.equal(readDatabase(join(received.backupDirectory, 'guardian.sqlite'), db => db.prepare('SELECT code FROM languages WHERE user=?').get('member').code), 'es');
});

test('importación rechazada no modifica los datos locales ni el token', async t => {
  const from = source(t), destination = directory(t);
  mkdirSync(join(destination, 'data'));
  writeFileSync(join(destination, '.env'), env);
  const { output } = await exportHandoff(from.root, password);
  await assert.rejects(importHandoff(destination, output, 'contrasena-incorrecta'), /contraseña/);
  assert.equal(readFileSync(join(destination, '.env'), 'utf8'), env);
  assert.equal(existsSync(join(destination, 'data/guardian.sqlite')), false);
  const malformed = openHandoff(readFileSync(output, 'utf8'), password);
  malformed.database = Buffer.from('not-sqlite').toString('base64');
  const invalid = join(destination, 'invalid.wohost');
  writeFileSync(invalid, sealHandoff(malformed, password));
  await assert.rejects(importHandoff(destination, invalid, password), /SQLite/);
  assert.equal(readFileSync(join(destination, '.env'), 'utf8'), env);
});

test('un relevo ajeno no reemplaza otro bot ni un DATA_DIR personalizado', async t => {
  const from = source(t), destination = directory(t);
  const { output } = await exportHandoff(from.root, password);
  writeFileSync(join(destination, '.env'), env.replace(client, '333333333333333333'));
  await assert.rejects(importHandoff(destination, output, password), /otro bot/);
  writeFileSync(join(destination, '.env'), env + 'DATA_DIR=./custom-data\n');
  await assert.rejects(importHandoff(destination, output, password), /DATA_DIR personalizado/);
});

test('exporta DATA_DIR personalizado a una ruta portátil y rechaza carpetas sin base', async t => {
  const from = source(t, 'DATA_DIR=./custom-data\n'), destination = directory(t);
  const { output } = await exportHandoff(from.root, password);
  await importHandoff(destination, output, password);
  assert.ok(existsSync(join(destination, 'data/guardian.sqlite')));
  const empty = directory(t);
  writeFileSync(join(empty, '.env'), env);
  await assert.rejects(exportHandoff(empty, password), /Falta la base/);
});

test('bloqueo local impide dos instancias del mismo bot y se libera al detenerlo', async () => {
  const settings = { clientId: `hosting-test-${process.pid}`, guildId: guild };
  const release = await acquireHostLock(settings);
  try { await assert.rejects(acquireHostLock(settings), /ya está abierto/); }
  finally { await release(); }
  const releaseAgain = await acquireHostLock(settings);
  await releaseAgain();
});
