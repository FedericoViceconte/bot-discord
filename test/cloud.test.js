import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { REST } from 'discord.js';
import { Store } from '../src/store.js';
import { CloudRPC, CloudSession, snapshotStore, restoreCloudState } from '../src/cloud.js';
import { validateAccess, encryptState, decryptState, accessHash, encodeAccess, decodeAccess, saveCloudAccess, loadCloudAccess } from '../src/cloud-access.js';
import { discordGuard } from '../src/host-runtime.js';

const credentials = { token: 'fake_token_for_tests', clientId: '121212121212121212', guildId: '343434343434343434' };
function access() { return validateAccess({ version: 1, url: 'https://abcdefghijklmnopqrst.supabase.co', apiKey: 'sb_publishable_test_public_key_only', room: randomUUID(), secret: 'a'.repeat(64), ...credentials }); }

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "wo cloud ' test "));
  const db = new PGlite();
  const config = access(); const stores = [], sessions = [];
  t.after(async () => {
    for (const session of sessions) await session.shutdown();
    for (const store of stores) store.close();
    await db.close(); rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  await db.exec('create role anon; create role authenticated;');
  await db.exec(readFileSync(new URL('../cloud/supabase.sql', import.meta.url), 'utf8'));
  await db.query('insert into wo_private.cloud_rooms(id,client_id,guild_id,access_hash) values ($1,$2,$3,$4)', [config.room, config.clientId, config.guildId, accessHash(config.secret)]);
  const source = new Store(join(root, 'original')); stores.push(source); source.cloudDirectory = join(root, 'original');
  source.setConfig(credentials.guildId, { archiveRetired: true, privateCategory: 'admins-do-not-touch' });
  source.setLanguage(credentials.guildId, 'member', 'es');
  let rejectSaves = false;
  const call = async (action, p = {}, identity = config) => (await db.query('select public.wo_cloud_call($1,$2,$3,$4,$5,$6,$7) as response',
    [identity.room, identity.secret, action, p.p_holder ?? null, p.p_epoch ?? 0, p.p_revision ?? null, p.p_state ?? null])).rows[0].response;
  const rpc = new CloudRPC(config, { fetcher: async (_url, request) => {
    const p = JSON.parse(request.body);
    if (rejectSaves && p.p_action === 'save') return new Response('{"message":"simulated outage"}', { status: 503 });
    try {
      const result = await call(p.p_action, p);
      return Response.json(result);
    } catch (error) { return Response.json({ message: error.message }, { status: 403 }); }
  } });
  await rpc.call('seed', { p_state: encryptState(config, snapshotStore(source, credentials)) });
  const session = async (options = {}) => {
    const result = new CloudSession(config, { rpc, ...options }); sessions.push(result);
    const acquired = await result.acquire(); return { session: result, acquired };
  };
  const bind = (active, acquired, folder) => {
    const settings = restoreCloudState(join(root, folder), config, acquired.state);
    const raw = new Store(settings.dataDir); stores.push(raw);
    return { store: active.bind(raw, settings), raw, settings };
  };
  return { root, db, config, source, rpc, call, session, bind, rejectSaves: () => { rejectSaves = true; } };
}

test('PostgreSQL decide un solo anfitrión y rechaza renovaciones y escrituras del anterior', async t => {
  const f = await fixture(t), first = await f.session(), second = await f.session();
  assert.equal(first.acquired.active, true); assert.equal(second.acquired.active, false);
  await f.db.query("update wo_private.cloud_rooms set lease_until=clock_timestamp()-interval '1 second' where id=$1", [f.config.room]);
  const takeover = await second.session.acquire();
  assert.equal(takeover.active, true); assert.ok(takeover.epoch > first.acquired.epoch);
  await assert.rejects(f.call('renew', first.session.parameters()), /WO_LEASE_LOST/);
  await assert.rejects(f.call('save', { ...first.session.parameters(), p_revision: first.session.revision, p_state: first.acquired.state }), /WO_LEASE_LOST/);
  await assert.rejects(f.call('release', first.session.parameters()), /WO_LEASE_LOST/);
});

test('el estado se guarda antes de que Discord reciba una respuesta y el nuevo anfitrión conserva cambios', async t => {
  const f = await fixture(t), first = await f.session();
  const { store } = f.bind(first.session, first.acquired, 'first');
  store.setLanguage(credentials.guildId, 'member', 'pt');
  const rest = new REST({ timeout: 10000, retries: 0, makeRequest: discordGuard(first.session, async () => {
    const row = (await f.db.query('select encrypted_state from wo_private.cloud_rooms where id=$1', [f.config.room])).rows[0];
    const received = restoreCloudState(join(f.root, 'at-discord-boundary'), f.config, row.encrypted_state);
    const actual = new Store(received.dataDir);
    try { assert.equal(actual.getLanguage(credentials.guildId, 'member'), 'pt'); } finally { actual.close(); }
    return Response.json({ acknowledged: true });
  }) }).setToken('fake_token_for_tests');
  assert.deepEqual(await rest.get('/users/@me'), { acknowledged: true });
  await first.session.shutdown();
  const next = await f.session();
  const destination = f.bind(next.session, next.acquired, 'second');
  assert.equal(destination.store.getLanguage(credentials.guildId, 'member'), 'pt');
  assert.equal(destination.store.getConfig(credentials.guildId).archiveRetired, true);
});

test('caída de la base bloquea Discord y congela nuevas mutaciones locales', async t => {
  const f = await fixture(t), first = await f.session();
  const { store } = f.bind(first.session, first.acquired, 'first');
  store.setLanguage(credentials.guildId, 'member', 'fr'); f.rejectSaves();
  let sent = false;
  const guarded = discordGuard(first.session, async () => { sent = true; return Response.json({}); });
  await assert.rejects(guarded('https://discord.com/api/test', {}));
  assert.equal(sent, false); assert.equal(first.session.active, false);
  assert.throws(() => store.setLanguage(credentials.guildId, 'member', 'de'), /control/);
});

test('cambios concurrentes durante un guardado se confirman en orden sin perder la versión nueva', async t => {
  const f = await fixture(t), first = await f.session();
  const { store } = f.bind(first.session, first.acquired, 'first');
  store.setLanguage(credentials.guildId, 'one', 'de');
  const earlier = first.session.flush();
  store.setLanguage(credentials.guildId, 'two', 'fr');
  await Promise.all([earlier, first.session.flush()]);
  assert.equal(first.session.savedSequence, first.session.sequence);
  const row = (await f.db.query('select encrypted_state from wo_private.cloud_rooms where id=$1', [f.config.room])).rows[0];
  const restored = restoreCloudState(join(f.root, 'concurrent'), f.config, row.encrypted_state);
  const received = new Store(restored.dataDir);
  try {
    assert.equal(received.getLanguage(credentials.guildId, 'one'), 'de');
    assert.equal(received.getLanguage(credentials.guildId, 'two'), 'fr');
  } finally { received.close(); }
});

test('al despertar una PC con el permiso vencido no manda solicitudes ni usa sus datos antiguos', async t => {
  const f = await fixture(t); let clock = 0;
  const first = await f.session({ now: () => clock });
  const { store } = f.bind(first.session, first.acquired, 'first');
  clock = 33001;
  let sent = false;
  await assert.rejects(discordGuard(first.session, async () => { sent = true; })('https://discord.com/api/test', {}), /control/);
  assert.equal(sent, false); assert.throws(() => store.getConfig(credentials.guildId), /control/);
});

test('la revisión evita sobrescribir una copia nueva y el código incorrecto no accede al servicio', async t => {
  const f = await fixture(t), first = await f.session();
  await assert.rejects(f.call('peek', {}, { ...f.config, secret: 'b'.repeat(64) }), /WO_ACCESS_DENIED/);
  await assert.rejects(f.call('save', { ...first.session.parameters(), p_revision: 0, p_state: first.acquired.state }), /WO_REVISION_CONFLICT/);
  await assert.rejects(f.call('seed', { p_state: first.acquired.state }), /WO_ALREADY_INITIALIZED/);
  await f.db.exec('set role anon');
  await assert.rejects(f.db.query('select * from wo_private.cloud_rooms'), /permission denied/);
  assert.equal((await f.call('peek')).initialized, true);
  await f.db.exec('reset role');
});

test('vinculación inicial valida destino y cifrado, sin incluir el token en el código', t => {
  const config = access(), code = encodeAccess(config);
  assert.deepEqual(decodeAccess(code), config); assert.ok(!code.includes(credentials.token));
  assert.equal(Object.hasOwn(decodeAccess(code), 'token'), false);
  const encrypted = encryptState(config, { token: credentials.token, body: 'Español 🌎' });
  assert.ok(!JSON.stringify(encrypted).includes(credentials.token));
  assert.equal(decryptState(config, encrypted).body, 'Español 🌎');
  assert.throws(() => decryptState({ ...config, secret: 'b'.repeat(64) }, encrypted), /cifrada/);
  assert.throws(() => validateAccess({ ...config, url: 'https://example.com' }), /oficial/);
  assert.throws(() => validateAccess({ ...config, apiKey: 'sb_secret_not-for-clients-1234567890' }), /publicable/);
  const root = mkdtempSync(join(tmpdir(), 'wo cloud link '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  saveCloudAccess(root, config); assert.deepEqual(loadCloudAccess(root), config);
  assert.equal(existsSync(join(root, 'data/cloud-access.json')), true);
});
