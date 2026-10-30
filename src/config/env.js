// Loads and validates environment variables once.
require('dotenv').config();

const normalizeTag = (t) => '#' + String(t || '').trim().toUpperCase().replace(/^#/, '').replace(/O/g, '0');
// CoC tags only use these characters.
const TAG_RE = /^#[0289PYLQGRJCUV]{3,15}$/;

const config = {
  port: Number(process.env.PORT) || 3000,
  token: process.env.COC_API_TOKEN,
  databaseUrl: process.env.DATABASE_URL,
  playerTag: normalizeTag(process.env.PLAYER_TAG),
  apiBase: (process.env.COC_API_BASE || 'https://cocproxy.royaleapi.dev/v1').replace(/\/$/, ''),
  snapshotHours: Number(process.env.SNAPSHOT_INTERVAL_HOURS) || 6,
  normalizeTag,
  TAG_RE,
};

const missing = ['COC_API_TOKEN', 'DATABASE_URL', 'PLAYER_TAG'].filter((k) => !process.env[k]);
if (missing.length) console.error(`[config] Missing env vars: ${missing.join(', ')}`);
if (process.env.PLAYER_TAG && !TAG_RE.test(config.playerTag)) {
  console.error(`[config] PLAYER_TAG "${process.env.PLAYER_TAG}" is not a valid tag`);
}
module.exports = config;
