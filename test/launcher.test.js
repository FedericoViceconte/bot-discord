import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/store.js';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';
function powershell(args, cwd, input) {
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { cwd, input, encoding: 'utf8', windowsHide: true, timeout: 45000 });
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'wo exe fixture '));
  for (const name of ['scripts', 'src', 'data']) mkdirSync(join(root, name));
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  for (const name of ['bot-process.ps1', 'node-runtime.ps1', 'launcher-action.ps1', 'prepare-pc.ps1', 'start-background.ps1', 'stop-background.ps1', 'doctor.js', 'handoff.js']) copyFileSync(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
  for (const name of ['settings.js', 'host-lock.js', 'handoff.js']) copyFileSync(new URL(`../src/${name}`, import.meta.url), join(root, 'src', name));
  for (const name of ['discord.js', '@napi-rs/canvas']) {
    mkdirSync(join(root, 'node_modules', name), { recursive: true });
    writeFileSync(join(root, 'node_modules', name, 'package.json'), '{}');
  }
  t.after(() => {
    powershell(['-File', join(root, 'scripts/stop-background.ps1')], root);
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });
  return root;
}

test('EXE: compila, dibuja la ventana y controla el bot sin consola desde una carpeta con espacios', { skip: !isWindows, timeout: 75000 }, t => {
  const root = fixture(t), exe = join(root, 'Agente-Canino.exe');
  const built = powershell(['-File', fileURLToPath(new URL('../scripts/build-launcher.ps1', import.meta.url)), '-OutputPath', exe], root);
  assert.equal(built.status, 0, built.stdout + built.stderr);
  assert.equal(readFileSync(exe).subarray(0, 2).toString(), 'MZ');
  const preview = spawnSync(exe, ['--smoke-test'], { cwd: root, windowsHide: true, timeout: 15000 });
  assert.equal(preview.status, 0, preview.error?.message);
  assert.equal(JSON.parse(readFileSync(join(root, 'data/launcher-smoke.json'))).autoStart, false);
  assert.ok(existsSync(join(root, 'data/launcher-preview.png')));
  writeFileSync(join(root, '.env'), 'DISCORD_TOKEN=fake_token_for_tests\nDISCORD_CLIENT_ID=919191919191919191\nDISCORD_GUILD_ID=929292929292929292\n');
  writeFileSync(join(root, 'src/index.js'), `import {acquireHostLock} from './host-lock.js';await acquireHostLock({clientId:'exe-${process.pid}',guildId:'test'});console.log('Test conectado.');setInterval(()=>{},1000);`);
  const start = spawnSync(exe, ['--test-action', 'start'], { cwd: root, windowsHide: true, timeout: 30000 });
  const result = JSON.parse(readFileSync(join(root, 'data/launcher-test.json'), 'utf8'));
  assert.equal(start.status, 0, result.output);
  assert.match(result.output, /CONECTADO/);
  assert.ok(!result.output.includes('fake_token_for_tests'));
  const metadata = JSON.parse(readFileSync(join(root, 'data/runtime-process.json'), 'utf8').replace(/^\uFEFF/, ''));
  const stop = spawnSync(exe, ['--test-action', 'stop'], { cwd: root, windowsHide: true, timeout: 15000 });
  assert.equal(stop.status, 0);
  assert.throws(() => process.kill(metadata.pid, 0));
});

test('puente gráfico: contraseña UTF-8 por stdin, exportación e importación sin mostrar credenciales', { skip: !isWindows, timeout: 65000 }, async t => {
  const from = fixture(t), to = fixture(t);
  const guild = '939393939393939393';
  writeFileSync(join(from, '.env'), `DISCORD_TOKEN=fake_token_for_tests\nDISCORD_CLIENT_ID=949494949494949494\nDISCORD_GUILD_ID=${guild}\n`);
  const store = new Store(join(from, 'data'));
  store.setConfig(guild, { archiveRetired: true }); store.setLanguage(guild, 'test-user', 'fr'); store.close();
  const password = 'Contraseña-prueba-🌎-123';
  const exported = powershell(['-File', join(from, 'scripts/launcher-action.ps1'), '-Action', 'export'], from, JSON.stringify({ password }));
  assert.equal(exported.status, 0, exported.stdout + exported.stderr);
  const file = exported.stdout.match(/Relevo creado: (.+)/)?.[1].trim();
  assert.ok(file && existsSync(file));
  assert.equal(existsSync(join(from, 'data/host-handoff.json')), true);
  const imported = powershell(['-File', join(to, 'scripts/launcher-action.ps1'), '-Action', 'import'], to, JSON.stringify({ password, file }));
  assert.equal(imported.status, 0, imported.stdout + imported.stderr);
  assert.ok(!exported.stdout.includes(password));
  assert.ok(!imported.stdout.includes('fake_token_for_tests'));
  const received = new Store(join(to, 'data'));
  try { assert.equal(received.getLanguage(guild, 'test-user'), 'fr'); } finally { received.close(); }
});
