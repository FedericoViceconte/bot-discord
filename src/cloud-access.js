import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const MAX_CLOUD_DATABASE = 8 * 1024 * 1024;

export function validateAccess(value) {
  if (!value || value.version !== 1 || !UUID.test(value.room) || !/^[a-f0-9]{64}$/i.test(value.secret || '')
    || !/^\d{17,20}$/.test(value.clientId || '') || !/^\d{17,20}$/.test(value.guildId || '')) throw new Error('El código de comunidad no es válido.');
  const url = new URL(value.url);
  if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('La comunidad debe usar su proyecto oficial de Supabase.');
  if (typeof value.apiKey !== 'string' || value.apiKey.length < 20 || value.apiKey.length > 2000 || /[\s\r\n]/.test(value.apiKey)
    || value.apiKey.startsWith('sb_secret_')) throw new Error('Usá la clave publicable del proyecto, nunca una clave secreta de Supabase.');
  if (!value.apiKey.startsWith('sb_publishable_')) {
    try {
      const claims = JSON.parse(Buffer.from(value.apiKey.split('.')[1], 'base64url'));
      if (claims.role !== 'anon') throw new Error();
    } catch { throw new Error('La clave del proyecto debe ser publicable o anon.'); }
  }
  return { version: 1, url: url.origin, apiKey: value.apiKey, room: value.room, secret: value.secret.toLowerCase(), clientId: value.clientId, guildId: value.guildId };
}

export function loadCloudAccess(root) {
  const path = join(root, 'data', 'cloud-access.json');
  try {
    if (!existsSync(path)) return null;
    const access = validateAccess(JSON.parse(readFileSync(path, 'utf8')));
    const publicPath = join(root, 'community.json');
    if (existsSync(publicPath)) {
      const expected = JSON.parse(readFileSync(publicPath, 'utf8'));
      for (const field of ['room', 'url', 'clientId', 'guildId']) if (expected[field] !== access[field]) throw new Error();
    }
    return access;
  }
  catch { throw new Error('El acceso local de la comunidad está dañado. Volvé a vincular esta PC desde el exe.'); }
}
export function saveCloudAccess(root, value) {
  const access = validateAccess(value);
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data', 'cloud-access.json'), JSON.stringify(access), { mode: 0o600 });
  return access;
}
export function encodeAccess(value) { return 'WO1.' + Buffer.from(JSON.stringify(validateAccess(value))).toString('base64url'); }
export function decodeAccess(code) {
  try {
    if (typeof code !== 'string' || code.length > 6000 || !code.startsWith('WO1.')) throw new Error();
    return validateAccess(JSON.parse(Buffer.from(code.trim().slice(4), 'base64url')));
  } catch { throw new Error('El código de comunidad está incompleto o no es válido.'); }
}
export function accessHash(secret) { return createHash('sha256').update(secret).digest('hex'); }
function stateKey(access) { return Buffer.from(hkdfSync('sha256', Buffer.from(access.secret, 'hex'), Buffer.from(access.room), Buffer.from('WO cloud state v1'), 32)); }
export function encryptState(access, value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', stateKey(access), iv);
  const plaintext = Buffer.from(JSON.stringify(value));
  if (plaintext.length > 13 * 1024 * 1024) throw new Error('La base supera el límite del modo compartido.');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64');
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext };
}
export function decryptState(access, envelope) {
  try {
    if (envelope?.v !== 1 || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > 19 * 1024 * 1024) throw new Error();
    const iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', stateKey(access), iv); cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]).toString('utf8'));
  } catch { throw new Error('No se pudo validar la copia cifrada de la comunidad.'); }
}
