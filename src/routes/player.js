const express = require('express');
const svc = require('../services/playerService');
const config = require('../config/env');
const { categorizeTroops, categorizeSpells, DEFENSES, BUILDINGS } = require('../utils/gameData');

const router = express.Router();
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  const status = e.status && e.status < 600 ? e.status : 500;
  if (status === 500) console.error('[route]', e);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : e.message });
});

// Live player data (cached 60s) + server-side categorisation.
router.get('/player', wrap(async (req, res) => {
  const { player, source, fetchedAt, warning } = await svc.getPlayer();
  res.json({
    source, fetchedAt, warning: warning || null, player,
    troopCategories: categorizeTroops(player.troops),
    spellCategories: categorizeSpells(player.spells),
    heroes: player.heroes,
  });
}));

router.get('/meta', wrap(async (req, res) => {
  res.json({
    playerTag: config.playerTag, snapshotHours: config.snapshotHours,
    apiMode: config.apiBase.includes('royaleapi') ? 'RoyaleAPI proxy' : 'Direct',
    defenses: DEFENSES, buildings: BUILDINGS,
    logs: await svc.getSyncLogs(),
  });
}));

router.get('/history', wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  res.json({ snapshots: await svc.getSnapshots(limit), changes: await svc.getChanges(100) });
}));

router.post('/sync', wrap(async (req, res) => {
  const r = await svc.manualSync();
  res.status(r.status === 'error' ? 502 : r.status === 'cooldown' ? 429 : 200).json(r);
}));

// Manual tracker for buildings/defenses (not exposed by the official API).
router.get('/manual/:kind', wrap(async (req, res) => {
  if (!svc.MANUAL_TABLES[req.params.kind]) return res.status(404).json({ error: 'Unknown category' });
  res.json({ rows: await svc.getManual(req.params.kind) });
}));

const toInt = (v, max = 100) => {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined; // undefined = invalid
};
router.put('/manual/:kind/:name', express.json({ limit: '2kb' }), wrap(async (req, res) => {
  const { kind } = req.params;
  const name = req.params.name;
  if (!svc.MANUAL_TABLES[kind]) return res.status(404).json({ error: 'Unknown category' });
  const allowed = kind === 'defenses' ? DEFENSES : Object.values(BUILDINGS).flat();
  if (!allowed.includes(name)) return res.status(400).json({ error: 'Unknown item name' });
  const level = toInt(req.body.level), maxLevel = toInt(req.body.maxLevel), quantity = toInt(req.body.quantity, 500);
  if ([level, maxLevel, quantity].includes(undefined)) return res.status(400).json({ error: 'Values must be whole numbers' });
  if (level != null && maxLevel != null && level > maxLevel) return res.status(400).json({ error: 'Level cannot exceed max level' });
  await svc.saveManual(kind, name, { level, maxLevel, quantity });
  res.json({ ok: true });
}));

module.exports = router;
