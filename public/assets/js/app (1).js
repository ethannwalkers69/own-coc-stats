/* Clash Stats frontend: vanilla JS. All data comes from /api/* (the token never reaches the browser). */
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
const dt = (d) => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

const PAGES = [
  ['overview', 'Overview', 'layout-dashboard'], ['heroes', 'Heroes', 'crown'], ['troops', 'Troops', 'swords'],
  ['spells', 'Spells', 'flask-conical'], ['siege', 'Siege Machines', 'castle'], ['pets', 'Pets', 'paw-print'],
  ['buildings', 'Buildings', 'building-2'], ['defenses', 'Defenses', 'shield'],
  ['history', 'Progress History', 'history'], ['settings', 'Settings', 'settings'],
];
const state = { api: null, meta: null, hist: null, images: {}, ui: {}, manual: {} };

/* ---------- helpers ---------- */
const icons = () => window.lucide && lucide.createIcons();
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `fade-in px-4 py-3 rounded-xl text-sm shadow-lg border ${type === 'error' ? 'bg-red-950 border-red-500/40 text-red-200' : 'bg-ink-800 border-gold-400/30 text-zinc-100'}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 5000);
}
async function api(path, opts) {
  const res = await fetch('/api' + path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(body.error || `Request failed (${res.status})`); e.body = body; throw e; }
  return body;
}
const skeleton = () => `<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${'<div class="skeleton h-28"></div>'.repeat(6)}</div>`;
const empty = (title, text) => `<div class="card p-10 text-center fade-in"><div class="text-lg font-semibold text-zinc-200">${esc(title)}</div><p class="text-sm text-zinc-500 mt-2 max-w-md mx-auto">${text}</p></div>`;
const pct = (cur, max) => (max ? Math.min(100, Math.round((cur / max) * 100)) : null);
const bar = (cur, max) => { const p = pct(cur, max); return p == null ? '' : `<div class="bar ${cur >= max ? 'max' : ''}"><span style="width:${p}%"></span></div>`; };

/* ---------- navigation ---------- */
function buildNav() {
  $('#nav').innerHTML = PAGES.map(([id, label, ic]) => `<a href="#/${id}" data-page="${id}" class="nav-link"><i data-lucide="${ic}" class="w-4 h-4"></i>${label}</a>`).join('');
}
const openMenu = (open) => { $('#sidebar').classList.toggle('-translate-x-full', !open); $('#backdrop').classList.toggle('hidden', !open); };
document.addEventListener('click', (e) => {
  if (e.target.closest('#menuBtn')) openMenu(true);
  else if (e.target.id === 'backdrop' || e.target.closest('.nav-link')) openMenu(false);
  if (e.target.closest('.refreshBtn')) loadAll(true);
});

/* ---------- item cards ---------- */
// Image sources, tried in order: your own override in /data/images.json, then ClashKing's public asset CDN
// (https://assets.clashk.ing, community-maintained; not Supercell's). If none loads, an icon tile is shown.
const CDN = 'https://assets.clashk.ing';
const clean = (s) => s.toLowerCase().replace(/ /g, '_').replace(/[.?’]/g, ''); // ClashKing's naming rule
function imgCandidates(name, kind, level) {
  const c = clean(name), out = [];
  if (state.images[name]) out.push(state.images[name]);
  if (kind === 'spell') out.push(`${CDN}/spells/${c}.webp`);
  else if (kind === 'building') out.push(`${CDN}/buildings/home-village/${c}/level_${level || 1}.webp`);
  else if (kind === 'hero') out.push(`${CDN}/troops/${c}/icon.webp`, `${CDN}/heroes/${c}/icon.webp`);
  else if (kind === 'pet') out.push(`${CDN}/troops/${c}/icon.webp`, `${CDN}/pets/${c}/icon.webp`);
  else if (kind === 'troop') out.push(`${CDN}/troops/${c}/icon.webp`);
  return out;
}
function tile(name, fallbackIcon, kind, level) {
  const list = imgCandidates(name, kind, level);
  return `<div class="tile" data-ic="${esc(fallbackIcon)}">${list.length
    ? `<img class="asset" src="${esc(list[0])}" data-next="${esc(list.slice(1).join('|'))}" alt="" loading="lazy">`
    : `<i data-lucide="${fallbackIcon}" class="w-6 h-6"></i>`}</div>`;
}
// Broken image? try the next candidate, finally fall back to the icon.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!img.classList || !img.classList.contains('asset')) return;
  const next = (img.dataset.next || '').split('|').filter(Boolean);
  if (next.length) { img.dataset.next = next.slice(1).join('|'); img.src = next[0]; return; }
  const box = img.parentElement, ic = box.dataset.ic;
  box.innerHTML = `<i data-lucide="${ic}" class="w-6 h-6"></i>`; icons();
}, true);
function itemCard(i, ic, kind) {
  const max = i.maxLevel;
  const isMax = max != null && i.level >= max;
  return `<div class="card card-hover p-4 fade-in"><div class="flex items-center gap-3">${tile(i.name, ic, kind)}
    <div class="min-w-0 flex-1"><div class="font-semibold truncate">${esc(i.name)}${i.superTroopIsActive ? ' <span class="text-[10px] text-orange-400 ml-1">ACTIVE</span>' : ''}</div>
    <div class="text-sm text-zinc-400">Level ${i.level}${max != null ? ` / ${max}` : ''} ${isMax ? '<span class="text-green-400 font-semibold ml-1">MAX</span>' : ''}</div></div></div>
    <div class="mt-3">${bar(i.level, max)}</div></div>`;
}

/* ---------- generic collection page (heroes, troops, spells...) ---------- */
function collectionPage(key, title, groups, ic, note) {
  const ui = (state.ui[key] ||= { q: '', sort: 'level-desc', filter: 'all', cat: 'all' });
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  $('#view').innerHTML = `<h1 class="text-2xl font-bold mb-1">${title}</h1>
    <p class="text-xs text-zinc-500 mb-4">${note || ''}</p>
    ${total === 0 ? empty(`No ${title.toLowerCase()} found`, 'The API returned nothing for this category on your account.') : `
    <div class="flex flex-wrap gap-2 mb-3">
      <input id="q" class="input flex-1 min-w-[160px]" placeholder="Search by name…" value="${esc(ui.q)}">
      <select id="sort" class="input"><option value="level-desc">Level: high → low</option><option value="level-asc">Level: low → high</option><option value="az">A → Z</option></select>
      <select id="filter" class="input"><option value="all">All</option><option value="max">Maxed</option><option value="notmax">Not maxed</option></select></div>
    ${groups.length > 1 ? `<div id="chips" class="flex flex-wrap gap-2 mb-4"><span class="chip" data-cat="all">All</span>${groups.map((g) => `<span class="chip" data-cat="${g.key}">${esc(g.label)} (${g.items.length})</span>`).join('')}</div>` : ''}
    <div id="grid"></div>`}`;
  if (!total) return icons();
  $('#sort').value = ui.sort; $('#filter').value = ui.filter;
  const draw = () => {
    document.querySelectorAll('#chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === ui.cat));
    const q = ui.q.trim().toLowerCase();
    const html = groups.filter((g) => ui.cat === 'all' || g.key === ui.cat).map((g) => {
      let items = g.items.filter((i) => i.name.toLowerCase().includes(q)
        && (ui.filter === 'all' || (ui.filter === 'max' ? i.maxLevel != null && i.level >= i.maxLevel : !(i.maxLevel != null && i.level >= i.maxLevel))));
      items = [...items].sort((a, b) => ui.sort === 'az' ? a.name.localeCompare(b.name) : ui.sort === 'level-asc' ? a.level - b.level : b.level - a.level);
      return items.length ? `<h2 class="text-sm uppercase tracking-wider text-gold-400 mt-5 mb-2">${esc(g.label)}</h2><div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${items.map((i) => itemCard(i, ic, g.kind || PAGE_KIND[key])).join('')}</div>` : '';
    }).join('');
    $('#grid').innerHTML = html || empty('No matches', 'Try a different search or filter.');
    icons();
  };
  $('#q').oninput = (e) => { ui.q = e.target.value; draw(); };
  $('#sort').onchange = (e) => { ui.sort = e.target.value; draw(); };
  $('#filter').onchange = (e) => { ui.filter = e.target.value; draw(); };
  const chips = $('#chips'); if (chips) chips.onclick = (e) => { const c = e.target.closest('.chip'); if (c) { ui.cat = c.dataset.cat; draw(); } };
  draw();
}

/* ---------- pages ---------- */
const PAGE_KIND = { heroes: 'hero', troops: 'troop', spells: 'spell', siege: 'troop', pets: 'pet' };
const NOTE_MAX = 'Levels and maximums come from the official API. "Max" is the cap for your current Town Hall.';
const homeOnly = (arr) => arr.filter((i) => i.village !== 'builderBase');
const pages = {
  overview() {
    const { player: p, troopCategories: tc, spellCategories: sc } = state.api;
    const stat = (label, v, ic) => `<div class="card p-4 fade-in"><div class="flex items-center gap-2 text-xs text-zinc-500"><i data-lucide="${ic}" class="w-4 h-4 text-gold-400"></i>${label}</div><div class="text-2xl font-bold mt-1">${fmt(v)}</div></div>`;
    const groups = progressGroups();
    const legend = p.legend ? `<h2 class="text-sm uppercase tracking-wider text-gold-400 mt-8 mb-3">Legend League</h2><div class="grid gap-3 sm:grid-cols-4">
      ${stat('Legend trophies', p.legend.legendTrophies, 'trophy')}
      ${['current', 'previous', 'best'].filter((k) => p.legend[k]).map((k) => stat(`${k[0].toUpperCase() + k.slice(1)} season${p.legend[k].rank ? ' (rank ' + fmt(p.legend[k].rank) + ')' : ''}`, p.legend[k].trophies, 'medal')).join('')}</div>` : '';
    $('#view').innerHTML = `
      <div class="card p-5 sm:p-6 flex flex-col sm:flex-row gap-5 items-center fade-in" style="background:radial-gradient(circle at top left,rgba(245,184,61,.12),transparent 50%),#101016">
        <div class="w-28 h-28 rounded-2xl bg-gradient-to-br from-gold-400 to-orange-700 flex flex-col items-center justify-center text-black shrink-0">
          <div class="text-[11px] font-bold tracking-widest">TOWN HALL</div><div class="text-5xl font-black leading-none">${esc(p.townHallLevel ?? '?')}</div></div>
        <div class="text-center sm:text-left min-w-0 flex-1">
          <h1 class="text-3xl font-extrabold truncate">${esc(p.name)}</h1>
          <div class="text-sm text-zinc-400 mt-1">${esc(p.tag)} · XP level ${fmt(p.expLevel)}${p.role ? ' · ' + esc(p.role) : ''}</div>
          <div class="flex flex-wrap gap-3 mt-3 justify-center sm:justify-start items-center text-sm">
            ${p.clan ? `<span class="inline-flex items-center gap-2 bg-white/5 rounded-full pl-1 pr-3 py-1">${p.clan.badge ? `<img src="${esc(p.clan.badge)}" class="w-6 h-6" alt="">` : ''}${esc(p.clan.name)} <span class="text-zinc-500">${esc(p.clan.tag)}</span></span>` : '<span class="text-zinc-500">No clan</span>'}
            ${p.league ? `<span class="inline-flex items-center gap-2 bg-white/5 rounded-full pl-1 pr-3 py-1">${p.league.icon ? `<img src="${esc(p.league.icon)}" class="w-6 h-6" alt="">` : ''}${esc(p.league.name)}</span>` : ''}</div></div></div>
      <div class="grid gap-3 grid-cols-2 lg:grid-cols-4 mt-4">
        ${stat('Trophies', p.trophies, 'trophy')}${stat('Best trophies', p.bestTrophies, 'medal')}${stat('Builder Base trophies', p.builderBaseTrophies, 'hammer')}${stat('War stars', p.warStars, 'star')}
        ${stat('Attack wins', p.attackWins, 'swords')}${stat('Defense wins', p.defenseWins, 'shield')}${stat('Donations', p.donations, 'heart-handshake')}${stat('Donations received', p.donationsReceived, 'gift')}</div>
      ${legend}
      <h2 class="text-sm uppercase tracking-wider text-gold-400 mt-8 mb-1">Progression overview</h2>
      <p class="text-xs text-zinc-500 mb-3">Percentage = sum of levels ÷ sum of max levels (for your current Town Hall), only where the API gives a maximum.</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${groups.map((g) => `<a href="#/${g.page}" class="card card-hover p-4 block fade-in">
        <div class="flex justify-between text-sm"><span class="font-semibold">${g.label}</span><span class="text-gold-400">${g.pct == null ? 'n/a' : g.pct + '%'}</span></div>
        <div class="mt-2">${g.pct == null ? '' : `<div class="bar ${g.pct === 100 ? 'max' : ''}"><span style="width:${g.pct}%"></span></div>`}</div>
        <div class="text-xs text-zinc-500 mt-2">${g.note}</div></a>`).join('')}</div>`;
  },
  heroes() {
    const { player: p } = state.api;
    const equip = p.heroEquipment || [];
    collectionPage('heroes', 'Heroes', [
      { key: 'home', label: 'Home Village', items: p.heroes.filter((h) => h.village !== 'builderBase') },
      { key: 'bb', label: 'Builder Base', items: p.heroes.filter((h) => h.village === 'builderBase') },
      ...(equip.length ? [{ key: 'eq', label: 'Hero Equipment', items: equip, kind: 'none' }] : []),
    ], 'crown', `${NOTE_MAX} Only unlocked heroes appear. Upgrade timers are not provided by the official API.`);
  },
  troops() {
    const c = state.api.troopCategories;
    collectionPage('troops', 'Troops', [
      { key: 'elixir', label: 'Elixir Troops', items: c.elixir }, { key: 'dark', label: 'Dark Elixir Troops', items: c.dark },
      { key: 'super', label: 'Super Troops', items: c.superTroops }, { key: 'builder', label: 'Builder Base Troops', items: c.builder },
      { key: 'other', label: 'Other (uncategorised)', items: c.other },
    ].filter((g) => g.items.length), 'swords', NOTE_MAX + ' Super Troops show the level of the base troop; ACTIVE marks boosted ones.');
  },
  spells() {
    const c = state.api.spellCategories;
    collectionPage('spells', 'Spells', [
      { key: 'elixir', label: 'Elixir Spells', items: c.elixir }, { key: 'dark', label: 'Dark Elixir Spells', items: c.dark },
      { key: 'other', label: 'Other (uncategorised)', items: c.other },
    ].filter((g) => g.items.length), 'flask-conical', NOTE_MAX);
  },
  siege() { collectionPage('siege', 'Siege Machines', [{ key: 's', label: 'Siege Machines', items: state.api.troopCategories.siege }], 'castle', NOTE_MAX); },
  pets() { collectionPage('pets', 'Pets', [{ key: 'p', label: 'Pets', items: state.api.troopCategories.pets }], 'paw-print', NOTE_MAX); },
  buildings() { manualPage('buildings', 'Buildings', 'building-2'); },
  defenses() { manualPage('defenses', 'Defenses', 'shield'); },
  history: historyPage,
  settings: settingsPage,
};

function progressGroups() {
  const { player: p, troopCategories: tc, spellCategories: sc } = state.api;
  const sum = (arr) => { const a = arr.filter((i) => i.maxLevel); return { n: arr.length, max: a.reduce((s, i) => s + i.maxLevel, 0), cur: a.reduce((s, i) => s + i.level, 0), maxed: a.filter((i) => i.level >= i.maxLevel).length }; };
  const mk = (page, label, arr) => { const s = sum(arr); return { page, label, pct: s.max ? Math.round((s.cur / s.max) * 100) : null, note: s.n ? `${s.maxed}/${s.n} maxed` : 'No data' }; };
  const manual = (page, label) => { const rows = (state.manual[page] || []).filter((r) => r.level != null && r.max_level); const cur = rows.reduce((s, r) => s + r.level, 0), max = rows.reduce((s, r) => s + r.max_level, 0);
    return { page, label, pct: max ? Math.round((cur / max) * 100) : null, note: rows.length ? `From ${rows.length} manual entries` : 'Not in API: enter manually' }; };
  return [mk('heroes', 'Heroes', p.heroes), mk('troops', 'Troops', [...tc.elixir, ...tc.dark, ...tc.superTroops, ...tc.builder, ...tc.other]),
    mk('spells', 'Spells', p.spells), mk('siege', 'Siege Machines', tc.siege), mk('pets', 'Pets', tc.pets), manual('buildings', 'Buildings'), manual('defenses', 'Defenses')];
}

/* ---------- buildings / defenses (manual tracker) ---------- */
async function manualPage(kind, title, ic) {
  if (!state.meta) return $('#view').innerHTML = empty('Database unavailable', 'Settings could not be loaded; check DATABASE_URL.');
  const sections = kind === 'defenses' ? { Defenses: state.meta.defenses } : state.meta.buildings;
  $('#view').innerHTML = `<h1 class="text-2xl font-bold mb-1">${title}</h1>
    <div class="card p-4 mb-4 text-sm text-zinc-400 border-orange-500/30"><b class="text-orange-400">Not available from the official API.</b>
    Supercell's player endpoint does not include building or defense levels, so nothing here is pulled from your account. Values below are <b>entered by you</b> and saved to your database. Progress is calculated only when you enter a max level.</div>${skeleton()}`;
  try { state.manual[kind] = (await api('/manual/' + kind)).rows; } catch (e) { return toast(e.message, 'error'); }
  const byName = Object.fromEntries(state.manual[kind].map((r) => [r.name, r]));
  const row = (n) => { const r = byName[n] || {}; const p = pct(r.level, r.max_level);
    return `<div class="card p-3 fade-in" data-name="${esc(n)}"><div class="flex items-center gap-3">${tile(n, ic, 'building', r.level)}<div class="font-semibold flex-1 min-w-0 truncate">${esc(n)}</div></div>
      <div class="grid grid-cols-3 gap-2 mt-3 text-xs text-zinc-500">
        <label>Level<input type="number" min="0" max="100" class="input w-full mt-1" data-f="level" value="${r.level ?? ''}"></label>
        <label>Max<input type="number" min="0" max="100" class="input w-full mt-1" data-f="maxLevel" value="${r.max_level ?? ''}"></label>
        <label>Qty<input type="number" min="0" max="500" class="input w-full mt-1" data-f="quantity" value="${r.quantity ?? ''}"></label></div>
      <div class="mt-3">${p != null ? bar(r.level, r.max_level) : ''}</div></div>`; };
  $('#view').innerHTML = $('#view').innerHTML.replace(skeleton(), '') + Object.entries(sections).map(([sec, names]) =>
    `<h2 class="text-sm uppercase tracking-wider text-gold-400 mt-5 mb-2">${esc(sec)}</h2><div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${names.map(row).join('')}</div>`).join('');
  $('#view').onchange = async (e) => {
    const card = e.target.closest('[data-name]'); if (!card || !e.target.dataset.f) return;
    const val = (f) => card.querySelector(`[data-f="${f}"]`).value;
    try {
      await api(`/manual/${kind}/${encodeURIComponent(card.dataset.name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: val('level'), maxLevel: val('maxLevel'), quantity: val('quantity') }) });
      toast('Saved ' + card.dataset.name);
    } catch (err) { toast(err.message, 'error'); }
  };
  icons();
}

/* ---------- history ---------- */
let charts = [];
async function historyPage() {
  $('#view').innerHTML = `<h1 class="text-2xl font-bold mb-1">Progress History</h1>${skeleton()}`;
  try { state.hist = await api('/history'); } catch (e) { $('#view').innerHTML = empty('Could not load history', esc(e.message)); return; }
  const { snapshots: s, changes } = state.hist;
  const head = `<h1 class="text-2xl font-bold mb-1">Progress History</h1>
    <div class="card p-3 mb-4 text-sm text-zinc-400"><b class="text-gold-400">Stored snapshots</b>: not live data. Taken every ${state.meta.snapshotHours}h (when something changed) or via "Sync now" in Settings.</div>`;
  if (s.length < 2) { $('#view').innerHTML = head + empty(s.length ? 'Only one snapshot so far' : 'No snapshots yet', 'Charts appear once at least two snapshots are stored. Use Settings → Sync now, or wait for the next scheduled snapshot.'); return; }
  const chart = (id, title) => `<div class="card p-4"><div class="text-sm font-semibold mb-2">${title}</div><div class="h-56"><canvas id="${id}"></canvas></div></div>`;
  $('#view').innerHTML = head + `<div class="grid gap-4 lg:grid-cols-2">${chart('c1', 'Trophies')}${chart('c2', 'Builder Base trophies')}${chart('c3', 'Experience level / Town Hall')}${chart('c4', 'War stars & attack wins')}</div>
    <h2 class="text-sm uppercase tracking-wider text-gold-400 mt-8 mb-2">Upgrade log (level changes between snapshots)</h2>
    ${changes.length ? `<div class="card divide-y divide-white/5">${changes.map((c) => `<div class="flex justify-between gap-3 px-4 py-2.5 text-sm"><span><span class="text-zinc-500 text-xs uppercase mr-2">${esc(c.type)}</span>${esc(c.name)}</span><span><span class="text-zinc-500">${c.prev_level} →</span> <b class="${c.level > c.prev_level ? 'text-green-400' : 'text-red-400'}">${c.level}</b> <span class="text-xs text-zinc-600 ml-2">${dt(c.captured_at)}</span></span></div>`).join('')}</div>` : empty('No level changes recorded yet', 'Upgrades show up here after snapshots capture a difference.')}
    <h2 class="text-sm uppercase tracking-wider text-gold-400 mt-8 mb-2">Snapshots</h2>
    <div class="card overflow-x-auto"><table class="w-full text-sm"><thead class="text-zinc-500 text-xs"><tr><th class="text-left p-3">Captured</th><th class="p-3">TH</th><th class="p-3">XP</th><th class="p-3">Trophies</th><th class="p-3">War ★</th></tr></thead><tbody>
    ${[...s].reverse().slice(0, 50).map((r) => `<tr class="border-t border-white/5 text-center"><td class="text-left p-3">${dt(r.captured_at)}</td><td>${fmt(r.town_hall_level)}</td><td>${fmt(r.exp_level)}</td><td>${fmt(r.trophies)}</td><td>${fmt(r.war_stars)}</td></tr>`).join('')}</tbody></table></div>`;
  charts.forEach((c) => c.destroy()); charts = [];
  const labels = s.map((r) => new Date(r.captured_at).toLocaleDateString([], { month: 'short', day: 'numeric' }));
  const line = (id, sets) => charts.push(new Chart($('#' + id), { type: 'line', data: { labels, datasets: sets.map(([label, key, color]) => ({ label, data: s.map((r) => r[key]), borderColor: color, backgroundColor: color + '33', tension: .3, pointRadius: 2 })) },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#a1a1aa' } } }, scales: { x: { ticks: { color: '#71717a' }, grid: { color: '#ffffff0d' } }, y: { ticks: { color: '#71717a' }, grid: { color: '#ffffff0d' } } } } }));
  line('c1', [['Trophies', 'trophies', '#f5b83d'], ['Best', 'best_trophies', '#f97316']]);
  line('c2', [['Builder Base', 'builder_base_trophies', '#38bdf8']]);
  line('c3', [['XP level', 'exp_level', '#a78bfa'], ['Town Hall', 'town_hall_level', '#f5b83d']]);
  line('c4', [['War stars', 'war_stars', '#facc15'], ['Attack wins', 'attack_wins', '#4ade80']]);
}

/* ---------- settings ---------- */
async function settingsPage() {
  try { state.meta = await api('/meta'); } catch (e) { toast(e.message, 'error'); }
  const m = state.meta;
  $('#view').innerHTML = `<h1 class="text-2xl font-bold mb-4">Settings</h1>
    <div class="card p-5 space-y-3 text-sm">
      <div class="flex justify-between"><span class="text-zinc-500">Player tag</span><b>${esc(m.playerTag)}</b></div>
      <div class="flex justify-between"><span class="text-zinc-500">API mode</span><b>${esc(m.apiMode)}</b></div>
      <div class="flex justify-between"><span class="text-zinc-500">Snapshot interval</span><b>${m.snapshotHours}h</b></div>
      <p class="text-xs text-zinc-500">To change the tag, edit the PLAYER_TAG environment variable on Render and redeploy. The API token is never shown here.</p>
      <button id="syncBtn" class="btn"><i data-lucide="database" class="w-4 h-4"></i>Sync now (store snapshot)</button></div>
    <h2 class="text-sm uppercase tracking-wider text-gold-400 mt-8 mb-2">Recent sync log</h2>
    ${m.logs.length ? `<div class="card divide-y divide-white/5">${m.logs.map((l) => `<div class="px-4 py-2.5 text-sm flex justify-between gap-3"><span>${esc(l.trigger)} · <b class="${l.status === 'error' ? 'text-red-400' : l.status === 'stored' ? 'text-green-400' : 'text-zinc-300'}">${esc(l.status)}</b> <span class="text-zinc-500">${esc(l.message || '')}</span></span><span class="text-xs text-zinc-600 shrink-0">${dt(l.started_at)}</span></div>`).join('')}</div>` : empty('No syncs yet', 'The first snapshot is taken shortly after the server starts.')}`;
  $('#syncBtn').onclick = async (e) => {
    e.target.disabled = true;
    try { const r = await api('/sync', { method: 'POST' }); toast(r.status === 'stored' ? 'Snapshot stored' : r.status === 'unchanged' ? 'No changes since last snapshot' : r.status); settingsPage(); }
    catch (err) { toast(err.body?.retryInSeconds ? `Cooldown: try again in ${err.body.retryInSeconds}s` : err.message, 'error'); e.target.disabled = false; }
  };
  icons();
}

/* ---------- router + boot ---------- */
function showBanner() {
  const a = state.api; if (!a) return ($('#banner').innerHTML = '');
  const label = a.source === 'live' ? ['Live from Clash API', 'text-green-400'] : a.source === 'memory' ? ['Live (cached < 1 min)', 'text-green-400'] : ['STALE: last stored API response (API unreachable)', 'text-orange-400'];
  $('#banner').innerHTML = `<div class="text-xs mb-4 flex flex-wrap gap-x-3 text-zinc-500"><span class="${label[1]} font-semibold">● ${label[0]}</span><span>Fetched ${dt(a.fetchedAt)}</span>${a.warning ? `<span class="text-orange-400">${esc(a.warning)}</span>` : ''}</div>`;
}
async function route() {
  const id = (location.hash.replace('#/', '') || 'overview');
  const page = PAGES.find((p) => p[0] === id) ? id : 'overview';
  document.querySelectorAll('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  $('#view').onchange = null; window.scrollTo(0, 0);
  const needsApi = !['history', 'settings', 'buildings', 'defenses'].includes(page);
  if (needsApi && !state.api) {
    if (state.error) { $('#view').innerHTML = empty('Could not load your player data', esc(state.error) + '<br><br><button class="btn refreshBtn">Try again</button>'); return; }
    $('#view').innerHTML = skeleton(); return;
  }
  await pages[page]();
  icons();
}
async function loadAll(force) {
  if (force) toast('Refreshing…');
  try {
    state.error = null;
    state.api = await api('/player');
    state.meta ||= await api('/meta');
    state.manual.buildings = (await api('/manual/buildings').catch(() => ({ rows: [] }))).rows;
    state.manual.defenses = (await api('/manual/defenses').catch(() => ({ rows: [] }))).rows;
  } catch (e) { state.error = e.message; toast(e.message, 'error'); }
  showBanner(); route();
}
async function init() {
  buildNav(); icons();
  fetch('/data/images.json').then((r) => r.json()).then((j) => (state.images = j)).catch(() => {});
  window.addEventListener('hashchange', route);
  $('#view').innerHTML = skeleton();
  try { state.meta = await api('/meta'); } catch (e) { /* DB may be unavailable; player data can still load */ }
  await loadAll();
}
window.addEventListener('DOMContentLoaded', init);
