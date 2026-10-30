// All communication with the Clash of Clans API happens here (server-side only).
const config = require('../config/env');

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// '#GV98LGCC9' -> '%23GV98LGCC9'
const encodeTag = (tag) => encodeURIComponent(config.normalizeTag(tag));

async function request(path) {
  if (!config.token) throw new ApiError(500, 'COC_API_TOKEN is not configured');
  let res;
  try {
    res = await fetch(`${config.apiBase}${path}`, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    throw new ApiError(504, 'Could not reach the Clash of Clans API (timeout or network error)');
  }
  if (res.ok) return res.json();

  // Friendly messages; the raw upstream body is logged, never sent to the browser.
  const body = await res.text().catch(() => '');
  console.error(`[coc] ${res.status} on ${path}: ${body.slice(0, 300)}`);
  const map = {
    400: 'Bad request to the Clash API',
    403: 'API access denied: token invalid or its allowed IP does not match (see README troubleshooting)',
    404: 'Player not found: check PLAYER_TAG',
    429: 'Clash API rate limit reached, try again shortly',
    503: 'Clash of Clans is under maintenance',
  };
  throw new ApiError(res.status === 403 || res.status === 404 || res.status === 429 || res.status === 503 ? res.status : 502, map[res.status] || `Clash API error (${res.status})`);
}

const num = (v) => (Number.isFinite(v) ? v : null);
const items = (arr) => (Array.isArray(arr) ? arr.filter((i) => i && typeof i.name === 'string' && Number.isFinite(i.level)).map((i) => ({
  name: i.name, level: i.level, maxLevel: num(i.maxLevel), village: i.village || 'home', superTroopIsActive: i.superTroopIsActive === true,
})) : []);

// Validate + reduce the raw payload to the fields we use. Missing fields become null (never invented).
function normalizePlayer(raw) {
  if (!raw || typeof raw.tag !== 'string' || typeof raw.name !== 'string') throw new ApiError(502, 'Unexpected response from the Clash API');
  return {
    tag: raw.tag, name: raw.name,
    townHallLevel: num(raw.townHallLevel), townHallWeaponLevel: num(raw.townHallWeaponLevel),
    expLevel: num(raw.expLevel), trophies: num(raw.trophies), bestTrophies: num(raw.bestTrophies),
    builderHallLevel: num(raw.builderHallLevel), builderBaseTrophies: num(raw.builderBaseTrophies ?? raw.versusTrophies),
    bestBuilderBaseTrophies: num(raw.bestBuilderBaseTrophies),
    warStars: num(raw.warStars), attackWins: num(raw.attackWins), defenseWins: num(raw.defenseWins),
    donations: num(raw.donations), donationsReceived: num(raw.donationsReceived),
    clanCapitalContributions: num(raw.clanCapitalContributions),
    role: raw.role || null,
    league: raw.league ? { name: raw.league.name, icon: raw.league.iconUrls?.small || null } : null,
    clan: raw.clan ? { tag: raw.clan.tag, name: raw.clan.name, level: num(raw.clan.clanLevel), badge: raw.clan.badgeUrls?.small || null } : null,
    legend: raw.legendStatistics ? {
      legendTrophies: num(raw.legendStatistics.legendTrophies),
      best: raw.legendStatistics.bestSeason || null,
      previous: raw.legendStatistics.previousSeason || null,
      current: raw.legendStatistics.currentSeason || null,
    } : null,
    heroes: items(raw.heroes),
    heroEquipment: items(raw.heroEquipment),
    troops: items(raw.troops),   // also contains siege machines, pets and super troops
    spells: items(raw.spells),
  };
}

async function fetchPlayer(tag) {
  return normalizePlayer(await request(`/players/${encodeTag(tag)}`));
}

module.exports = { fetchPlayer, ApiError, encodeTag };
