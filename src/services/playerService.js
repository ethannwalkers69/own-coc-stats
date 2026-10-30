// Live fetch (with memory + DB cache fallback), snapshot storage and history queries.
const crypto = require('crypto');
const pool = require('../config/database');
const config = require('../config/env');
const { fetchPlayer } = require('./clashApi');
const { categorizeTroops } = require('../utils/gameData');

const LIVE_TTL_MS = 60 * 1000;
let mem = { at: 0, data: null };

// Returns { player, source: 'live'|'memory'|'stale-db', fetchedAt }
async function getPlayer() {
  if (mem.data && Date.now() - mem.at < LIVE_TTL_MS) return { player: mem.data, source: 'memory', fetchedAt: new Date(mem.at).toISOString() };
  try {
    const player = await fetchPlayer(config.playerTag);
    mem = { at: Date.now(), data: player };
    pool.query(`INSERT INTO api_cache (cache_key, payload, fetched_at) VALUES ('player', $1, now())
                ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()`, [player])
      .catch((e) => console.error('[cache] write failed:', e.message));
    return { player, source: 'live', fetchedAt: new Date().toISOString() };
  } catch (err) {
    // API down? Serve the last stored response, clearly marked as stale.
    try {
      const { rows } = await pool.query(`SELECT payload, fetched_at FROM api_cache WHERE cache_key = 'player'`);
      if (rows[0]) return { player: rows[0].payload, source: 'stale-db', fetchedAt: rows[0].fetched_at, warning: err.message };
    } catch (_) { /* fall through */ }
    throw err;
  }
}

const hashPlayer = (p) => crypto.createHash('sha256').update(JSON.stringify([
  p.townHallLevel, p.expLevel, p.trophies, p.bestTrophies, p.builderBaseTrophies, p.warStars, p.attackWins, p.defenseWins,
  p.donations, p.donationsReceived, p.clan?.tag, p.heroes, p.troops, p.spells,
])).digest('hex');

async function upsertPlayer(client, p) {
  const { rows } = await client.query(
    `INSERT INTO players (tag, name) VALUES ($1, $2)
     ON CONFLICT (tag) DO UPDATE SET name = EXCLUDED.name, updated_at = now() RETURNING id`, [p.tag, p.name]);
  return rows[0].id;
}
const getPlayerId = async () => (await pool.query('SELECT id FROM players WHERE tag = $1', [config.playerTag])).rows[0]?.id;

let syncing = false;
let lastManual = 0;

// Stores a snapshot if anything changed (or the last one is >24h old).
async function syncSnapshot(trigger = 'schedule') {
  if (syncing) return { status: 'busy' };
  syncing = true;
  const log = (await pool.query(`INSERT INTO sync_logs (trigger, status) VALUES ($1, 'running') RETURNING id`, [trigger])).rows[0].id;
  const finish = (status, message, snapshotId = null) =>
    pool.query('UPDATE sync_logs SET finished_at = now(), status = $2, message = $3, snapshot_id = $4 WHERE id = $1', [log, status, message, snapshotId]);
  try {
    const player = await fetchPlayer(config.playerTag);
    mem = { at: Date.now(), data: player };
    const hash = hashPlayer(player);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const playerId = await upsertPlayer(client, player);
      const last = (await client.query('SELECT data_hash, captured_at FROM player_snapshots WHERE player_id = $1 ORDER BY captured_at DESC LIMIT 1', [playerId])).rows[0];
      if (last && last.data_hash === hash && Date.now() - new Date(last.captured_at) < 24 * 3600 * 1000) {
        await client.query('COMMIT');
        await finish('unchanged', 'No changes since last snapshot');
        return { status: 'unchanged' };
      }
      const snap = (await client.query(
        `INSERT INTO player_snapshots (player_id, data_hash, town_hall_level, town_hall_weapon, exp_level, trophies, best_trophies,
           builder_hall_level, builder_base_trophies, war_stars, attack_wins, defense_wins, donations, donations_received, clan_tag, clan_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [playerId, hash, player.townHallLevel, player.townHallWeaponLevel, player.expLevel, player.trophies, player.bestTrophies,
         player.builderHallLevel, player.builderBaseTrophies, player.warStars, player.attackWins, player.defenseWins,
         player.donations, player.donationsReceived, player.clan?.tag ?? null, player.clan?.name ?? null])).rows[0].id;

      const cat = categorizeTroops(player.troops);
      const groups = [
        ['hero_progress', 'hero', player.heroes],
        ['troop_progress', 'troop', [...cat.elixir, ...cat.dark, ...cat.superTroops, ...cat.builder, ...cat.other]],
        ['spell_progress', 'spell', player.spells],
        ['siege_machine_progress', 'siege', cat.siege],
        ['pet_progress', 'pet', cat.pets],
      ];
      for (const [table, type, list] of groups) {
        for (const i of list) {
          // table names above are constants, never user input
          await client.query(`INSERT INTO ${table} (snapshot_id, name, village, level, max_level) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
            [snap, i.name, i.village, i.level, i.maxLevel]);
          if (i.maxLevel != null && player.townHallLevel != null) {
            await client.query(`INSERT INTO game_data (item_type, name, village, town_hall_level, max_level) VALUES ($1,$2,$3,$4,$5)
              ON CONFLICT (item_type, name, village, town_hall_level) DO UPDATE SET max_level = EXCLUDED.max_level, updated_at = now()`,
              [type, i.name, i.village, player.townHallLevel, i.maxLevel]);
          }
        }
      }
      await client.query('COMMIT');
      await finish('stored', 'Snapshot stored', snap);
      return { status: 'stored', snapshotId: snap };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  } catch (e) {
    console.error('[sync] failed:', e.message);
    await finish('error', e.message).catch(() => {});
    return { status: 'error', message: e.message };
  } finally { syncing = false; }
}

async function manualSync() {
  if (Date.now() - lastManual < 5 * 60 * 1000) return { status: 'cooldown', retryInSeconds: Math.ceil((5 * 60 * 1000 - (Date.now() - lastManual)) / 1000) };
  lastManual = Date.now();
  return syncSnapshot('manual');
}

async function getSnapshots(limit = 200) {
  const id = await getPlayerId();
  if (!id) return [];
  const { rows } = await pool.query(
    `SELECT id, captured_at, town_hall_level, exp_level, trophies, best_trophies, builder_base_trophies, war_stars, attack_wins, defense_wins, donations, donations_received
     FROM player_snapshots WHERE player_id = $1 ORDER BY captured_at DESC LIMIT $2`, [id, limit]);
  return rows.reverse();
}

// Level changes between consecutive snapshots, across all item tables.
const CHANGE_TABLES = { hero: 'hero_progress', troop: 'troop_progress', spell: 'spell_progress', siege: 'siege_machine_progress', pet: 'pet_progress' };
async function getChanges(limit = 100) {
  const id = await getPlayerId();
  if (!id) return [];
  const parts = Object.entries(CHANGE_TABLES).map(([type, table]) => `
    SELECT '${type}' AS type, name, level, prev_level, captured_at FROM (
      SELECT p.name, p.level, s.captured_at,
             LAG(p.level) OVER (PARTITION BY p.name, p.village ORDER BY s.captured_at) AS prev_level
      FROM ${table} p JOIN player_snapshots s ON s.id = p.snapshot_id WHERE s.player_id = $1) t
    WHERE prev_level IS NOT NULL AND level <> prev_level`);
  const { rows } = await pool.query(`${parts.join(' UNION ALL ')} ORDER BY captured_at DESC LIMIT $2`, [id, limit]);
  return rows;
}

async function getSyncLogs(limit = 15) {
  return (await pool.query('SELECT id, started_at, finished_at, trigger, status, message FROM sync_logs ORDER BY started_at DESC LIMIT $1', [limit])).rows;
}

// Manual building/defense tracker (API doesn't provide these).
const MANUAL_TABLES = { buildings: 'building_progress', defenses: 'defense_progress' };
async function getManual(kind) {
  const id = await getPlayerId();
  if (!id) return [];
  return (await pool.query(`SELECT name, level, max_level, quantity, updated_at FROM ${MANUAL_TABLES[kind]} WHERE player_id = $1`, [id])).rows;
}
async function saveManual(kind, name, { level, maxLevel, quantity }) {
  let id = await getPlayerId();
  if (!id) { const { player } = await getPlayer(); const c = await pool.connect(); try { id = await upsertPlayer(c, player); } finally { c.release(); } }
  await pool.query(`INSERT INTO ${MANUAL_TABLES[kind]} (player_id, name, level, max_level, quantity) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (player_id, name) DO UPDATE SET level = EXCLUDED.level, max_level = EXCLUDED.max_level, quantity = EXCLUDED.quantity, updated_at = now()`,
    [id, name, level, maxLevel, quantity]);
}

module.exports = { getPlayer, syncSnapshot, manualSync, getSnapshots, getChanges, getSyncLogs, getManual, saveManual, MANUAL_TABLES };
