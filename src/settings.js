import { resolve } from 'node:path';

export function readSettings(env = process.env) {
  const integer = (key, fallback, min, max) => {
    const value = Number(env[key] || fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key}: número inválido.`);
    return value;
  };
  return {
    token: env.DISCORD_TOKEN?.trim(), clientId: env.DISCORD_CLIENT_ID?.trim(), guildId: env.DISCORD_GUILD_ID?.trim(),
    dataDir: resolve(env.DATA_DIR || './data'),
    aiEnabled: env.AI_ENABLED === 'true', apiKey: env.OPENAI_API_KEY?.trim(), model: env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
    aiDailyLimit: integer('AI_DAILY_REQUEST_LIMIT', 50, 1, 10000),
    aiCooldownMs: integer('AI_USER_COOLDOWN_SECONDS', 30, 5, 3600) * 1000,
  };
}

export function requireDiscord(settings) {
  for (const [label, value] of Object.entries({ DISCORD_TOKEN: settings.token, DISCORD_CLIENT_ID: settings.clientId, DISCORD_GUILD_ID: settings.guildId })) {
    if (!value) throw new Error(`Completá ${label} en .env. Consultá README.md.`);
  }
  for (const value of [settings.clientId, settings.guildId]) if (!/^\d{17,20}$/.test(value)) throw new Error('Los IDs de Discord deben tener entre 17 y 20 dígitos.');
}
