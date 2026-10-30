-- Clash Stats schema (idempotent). Run with `npm run migrate` or paste into Neon SQL Editor.

CREATE TABLE IF NOT EXISTS players (
  id          SERIAL PRIMARY KEY,
  tag         TEXT NOT NULL UNIQUE,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per stored snapshot of the player's top-level stats.
CREATE TABLE IF NOT EXISTS player_snapshots (
  id                    SERIAL PRIMARY KEY,
  player_id             INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  captured_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_hash             TEXT NOT NULL,
  town_hall_level       INT,
  town_hall_weapon      INT,
  exp_level             INT,
  trophies              INT,
  best_trophies         INT,
  builder_hall_level    INT,
  builder_base_trophies INT,
  war_stars             INT,
  attack_wins           INT,
  defense_wins          INT,
  donations             INT,
  donations_received    INT,
  clan_tag              TEXT,
  clan_name             TEXT
);
CREATE INDEX IF NOT EXISTS idx_snapshots_player_time ON player_snapshots (player_id, captured_at DESC);

-- Item progress tables share one shape: level of an item inside one snapshot.
CREATE TABLE IF NOT EXISTS hero_progress (
  id          SERIAL PRIMARY KEY,
  snapshot_id INT NOT NULL REFERENCES player_snapshots(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  village     TEXT NOT NULL DEFAULT 'home',
  level       INT NOT NULL,
  max_level   INT,
  UNIQUE (snapshot_id, name, village)
);
CREATE INDEX IF NOT EXISTS idx_hero_name ON hero_progress (name, village);

CREATE TABLE IF NOT EXISTS troop_progress (
  id          SERIAL PRIMARY KEY,
  snapshot_id INT NOT NULL REFERENCES player_snapshots(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  village     TEXT NOT NULL DEFAULT 'home',
  level       INT NOT NULL,
  max_level   INT,
  UNIQUE (snapshot_id, name, village)
);
CREATE INDEX IF NOT EXISTS idx_troop_name ON troop_progress (name, village);

CREATE TABLE IF NOT EXISTS spell_progress (
  id          SERIAL PRIMARY KEY,
  snapshot_id INT NOT NULL REFERENCES player_snapshots(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  village     TEXT NOT NULL DEFAULT 'home',
  level       INT NOT NULL,
  max_level   INT,
  UNIQUE (snapshot_id, name, village)
);
CREATE INDEX IF NOT EXISTS idx_spell_name ON spell_progress (name, village);

CREATE TABLE IF NOT EXISTS siege_machine_progress (
  id          SERIAL PRIMARY KEY,
  snapshot_id INT NOT NULL REFERENCES player_snapshots(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  village     TEXT NOT NULL DEFAULT 'home',
  level       INT NOT NULL,
  max_level   INT,
  UNIQUE (snapshot_id, name, village)
);
CREATE INDEX IF NOT EXISTS idx_siege_name ON siege_machine_progress (name, village);

CREATE TABLE IF NOT EXISTS pet_progress (
  id          SERIAL PRIMARY KEY,
  snapshot_id INT NOT NULL REFERENCES player_snapshots(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  village     TEXT NOT NULL DEFAULT 'home',
  level       INT NOT NULL,
  max_level   INT,
  UNIQUE (snapshot_id, name, village)
);
CREATE INDEX IF NOT EXISTS idx_pet_name ON pet_progress (name, village);

-- Buildings & defenses: the official API does NOT expose these, so rows are MANUAL entries by the owner.
CREATE TABLE IF NOT EXISTS building_progress (
  id         SERIAL PRIMARY KEY,
  player_id  INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  level      INT,
  max_level  INT,
  quantity   INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, name)
);
CREATE TABLE IF NOT EXISTS defense_progress (
  id         SERIAL PRIMARY KEY,
  player_id  INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  level      INT,
  max_level  INT,
  quantity   INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, name)
);

-- Reference data learned from the API itself: max level of an item at a given Town Hall.
CREATE TABLE IF NOT EXISTS game_data (
  id              SERIAL PRIMARY KEY,
  item_type       TEXT NOT NULL,      -- hero | troop | spell | siege | pet
  name            TEXT NOT NULL,
  village         TEXT NOT NULL DEFAULT 'home',
  town_hall_level INT NOT NULL,
  max_level       INT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_type, name, village, town_hall_level)
);

-- Latest raw API response per cache key (fallback when the API is down).
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key  TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id          SERIAL PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  trigger     TEXT NOT NULL,          -- schedule | manual | startup
  status      TEXT NOT NULL,          -- running | stored | unchanged | error
  message     TEXT,
  snapshot_id INT REFERENCES player_snapshots(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON sync_logs (started_at DESC);
