// Static REFERENCE lists used only to sort API items into categories and to list
// building names. Levels always come from the API (or your own manual entries).
// Anything not listed lands in an "Other" bucket instead of being guessed.
const ELIXIR_TROOPS = new Set(['Barbarian','Archer','Giant','Goblin','Wall Breaker','Balloon','Wizard','Healer','Dragon','P.E.K.K.A','Baby Dragon','Miner','Electro Dragon','Yeti','Dragon Rider','Electro Titan','Root Rider','Thrower']);
const DARK_TROOPS = new Set(['Minion','Hog Rider','Valkyrie','Golem','Witch','Lava Hound','Bowler','Ice Golem','Headhunter','Apprentice Warden','Druid','Furnace']);
const SUPER_EXTRA = new Set(['Sneaky Goblin','Rocket Balloon','Inferno Dragon','Ice Hound']);
const SIEGE = new Set(['Wall Wrecker','Battle Blimp','Stone Slammer','Siege Barracks','Log Launcher','Flame Flinger','Battle Drill','Troop Launcher']);
const PETS = new Set(['L.A.S.S.I','Electro Owl','Mighty Yak','Unicorn','Frosty','Diggy','Poison Lizard','Phoenix','Spirit Fox','Angry Jelly','Sneezy']);
const ELIXIR_SPELLS = new Set(['Lightning Spell','Healing Spell','Rage Spell','Jump Spell','Freeze Spell','Clone Spell','Invisibility Spell','Recall Spell']);
const DARK_SPELLS = new Set(['Poison Spell','Earthquake Spell','Haste Spell','Skeleton Spell','Bat Spell','Overgrowth Spell']);

// Names only (no levels). Tracked manually because the official API doesn't expose them.
const DEFENSES = ['Cannon','Archer Tower','Mortar','Air Defense','Wizard Tower','Air Sweeper','Hidden Tesla','Bomb Tower','X-Bow','Inferno Tower','Eagle Artillery','Scattershot','Spell Tower','Monolith','Multi-Archer Tower','Ricochet Cannon','Firespitter'];
const BUILDINGS = {
  'Army Buildings': ['Army Camp','Barracks','Dark Barracks','Laboratory','Spell Factory','Dark Spell Factory','Workshop','Blacksmith','Pet House','Hero Hall'],
  'Resource Buildings': ['Gold Mine','Elixir Collector','Dark Elixir Drill','Gold Storage','Elixir Storage','Dark Elixir Storage'],
  'Traps': ['Bomb','Spring Trap','Giant Bomb','Air Bomb','Seeking Air Mine','Skeleton Trap','Tornado Trap'],
  'Core': ['Town Hall','Clan Castle','Walls',"Builder's Hut"],
};

const isSuper = (n) => /^Super /.test(n) || SUPER_EXTRA.has(n);

// Split the API's mixed `troops` array into the sections the UI shows.
function categorizeTroops(troops = []) {
  const out = { elixir: [], dark: [], superTroops: [], siege: [], pets: [], builder: [], other: [] };
  for (const t of troops) {
    if (t.village === 'builderBase') out.builder.push(t);
    else if (SIEGE.has(t.name)) out.siege.push(t);
    else if (PETS.has(t.name)) out.pets.push(t);
    else if (isSuper(t.name)) out.superTroops.push(t);
    else if (ELIXIR_TROOPS.has(t.name)) out.elixir.push(t);
    else if (DARK_TROOPS.has(t.name)) out.dark.push(t);
    else out.other.push(t);
  }
  return out;
}

function categorizeSpells(spells = []) {
  const out = { elixir: [], dark: [], other: [] };
  for (const s of spells) {
    if (ELIXIR_SPELLS.has(s.name)) out.elixir.push(s);
    else if (DARK_SPELLS.has(s.name)) out.dark.push(s);
    else out.other.push(s);
  }
  return out;
}

module.exports = { categorizeTroops, categorizeSpells, DEFENSES, BUILDINGS, isSuper };
