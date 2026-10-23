import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/store.js';

function run(root, script) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', script)], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
}

test('Windows: iniciar, detectar duplicado, detener y recuperar PID obsoleto en ruta con espacios', { skip: process.platform !== 'win32', timeout: 65000 }, t => {
  const root = mkdtempSync(join(tmpdir(), 'wo windows hosting '));
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  for (const name of ['bot-process.ps1', 'start-background.ps1', 'stop-background.ps1', 'doctor.js']) copyFileSync(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
  for (const name of ['settings.js', 'host-lock.js']) copyFileSync(new URL(`../src/${name}`, import.meta.url), join(root, 'src', name));
  writeFileSync(join(root, '.env'), `DISCORD_TOKEN=fake_token_for_tests\nDISCORD_CLIENT_ID=555555555555555555\nDISCORD_GUILD_ID=666666666666666666\n`);
  for (const name of ['discord.js', '@napi-rs/canvas']) {
    mkdirSync(join(root, 'node_modules', name), { recursive: true });
    writeFileSync(join(root, 'node_modules', name, 'package.json'), '{}');
  }
  // No network or Discord credentials are used by this fixture.
  writeFileSync(join(root, 'src/index.js'), `import {acquireHostLock} from './host-lock.js';
await acquireHostLock({clientId:'windows-fixture-${process.pid}',guildId:'test'});
console.log('Test conectado.');setInterval(()=>{},1000);`);
  t.after(() => {
    run(root, 'stop-background.ps1');
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });
  const started = run(root, 'start-background.ps1');
  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.match(started.stdout, /CONECTADO/);
  const metadataPath = join(root, 'data/runtime-process.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^\uFEFF/, ''));
  const duplicate = run(root, 'start-background.ps1');
  assert.equal(duplicate.status, 0, duplicate.stdout + duplicate.stderr);
  assert.match(duplicate.stdout, /ya se esta ejecutando/);
  assert.equal(JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^\uFEFF/, '')).pid, metadata.pid);
  // A valid PID with a mismatched start time must never be terminated.
  writeFileSync(metadataPath, JSON.stringify({ ...metadata, startedAt: '2000-01-01T00:00:00Z' }));
  const stale = run(root, 'stop-background.ps1');
  assert.equal(stale.status, 0, stale.stdout + stale.stderr);
  assert.doesNotThrow(() => process.kill(metadata.pid, 0));
  writeFileSync(metadataPath, JSON.stringify(metadata));
  const stopped = run(root, 'stop-background.ps1');
  assert.equal(stopped.status, 0, stopped.stdout + stopped.stderr);
  assert.throws(() => process.kill(metadata.pid, 0));
  assert.equal(existsSync(metadataPath), false);
});

test('CLI: contraseña por stdin y relevo en carpetas nuevas sin instalar Discord ni acceder a la red', async t => {
  const roots = [];
  let store;
  t.after(() => {
    store?.close();
    for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  for (let n = 0; n < 2; n++) {
    const root = mkdtempSync(join(tmpdir(), 'wo cli hosting ')); roots.push(root);
    mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    copyFileSync(new URL('../scripts/handoff.js', import.meta.url), join(root, 'scripts/handoff.js'));
    for (const name of ['settings.js', 'host-lock.js', 'handoff.js']) copyFileSync(new URL(`../src/${name}`, import.meta.url), join(root, 'src', name));
  }
  const [from, to] = roots;
  writeFileSync(join(from, '.env'), 'DISCORD_TOKEN=fake_token_for_tests\nDISCORD_CLIENT_ID=777777777777777777\nDISCORD_GUILD_ID=888888888888888888\n');
  store = new Store(join(from, 'data'));
  store.setConfig('888888888888888888', { archiveRetired: true });
  store.setLanguage('888888888888888888', 'member', 'pt');
  const input = { password: 'contraseña-prueba-🌎-123' };
  const exported = spawnSync(process.execPath, ['scripts/handoff.js', 'export'], { cwd: from, input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(exported.status, 0, exported.stdout + exported.stderr);
  const file = exported.stdout.match(/Relevo creado: (.+)/)?.[1].trim();
  assert.ok(file && existsSync(file));
  const imported = spawnSync(process.execPath, ['scripts/handoff.js', 'import'], { cwd: to, input: JSON.stringify({ ...input, file }), encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(imported.status, 0, imported.stdout + imported.stderr);
  assert.match(imported.stdout, /Relevo recibido/);
  assert.ok(!exported.stdout.includes('fake_token_for_tests'));
  assert.ok(!imported.stdout.includes(input.password));
  const received = new Store(join(to, 'data'));
  try { assert.equal(received.getLanguage('888888888888888888', 'member'), 'pt'); }
  finally { received.close(); }
});
