/* Shared WoW helpers (icons, class colors, Warcraft Logs colors, Mythic+ team views and group toolkit), copied from Kona's dashboard. Nothing personal here. */
const BOSS_ORDER = ['Nymrissa Wavecaller', "Kith'ix", "Nek'zali the Soulcoiler", 'Entombed Sentinels', 'Vashnik the Malignant',
  'The Lost Explorers', 'Sszorak', 'The Twin Fangs', 'The Coiled Altar', "Ula'tek"];
const INSTANCE_ORDER = ['Tidebound Grotto', "The Unbinding of Kith'ix", 'The Venomous Abyss'];
const CLASS_ACCENT = { 'demon hunter': 'var(--dh)', 'death knight': 'var(--dk)', 'druid': 'var(--druid)', 'mage': '#3fc7eb',
  'warrior': '#c69b6d', 'paladin': '#f48cba', 'hunter': '#aad372', 'rogue': '#fff468', 'priest': '#ffffff', 'shaman': '#0070dd',
  'warlock': '#8788ee', 'monk': '#00ff98', 'evoker': '#33937f' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const accentFor = cls => CLASS_ACCENT[String(cls).toLowerCase()] || '#555';
// Each page only has some of the sections; a missing one gets a detached stand-in so the shared code can run unchanged
const $ = id => document.getElementById(id) || document.createElement('div');
const ICON_BASE = 'https://render.worldofwarcraft.com/us/icons/56/';
const icon = (name, cls) => `<img class="${cls || 'ic'}" src="${ICON_BASE}${name}.jpg" alt="" loading="lazy" onerror="this.style.display='none'">`;
const classIconName = cls => 'classicon_' + String(cls || '').toLowerCase().replace(/[^a-z]/g, '');
const classIcon = (cls, size) => cls ? `<img class="cls-ic${size ? ' ' + size : ''}" src="${ICON_BASE}${classIconName(cls)}.jpg" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
const classBg = cls => cls ? `--clsicon:url('${ICON_BASE}${classIconName(cls)}.jpg');` : '';
const fav = (domain, letter) => `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt="${letter}" onerror="this.replaceWith(document.createTextNode('${letter}'))">`;
function profileLinks(name, realmSlug, region) {
  const r = String(realmSlug || 'eldrethalas').toLowerCase(), g = String(region || 'us').toLowerCase();
  const n = encodeURIComponent(name), nl = encodeURIComponent(String(name).toLowerCase());
  return `<span class="links">
    <a class="rio" href="https://raider.io/characters/${g}/${r}/${n}" target="_blank" rel="noopener" data-tip="Raider.io profile">${fav('raider.io', 'R')}</a>
    <a class="wcl" href="https://www.warcraftlogs.com/character/${g}/${r}/${nl}" target="_blank" rel="noopener" data-tip="Warcraft Logs">${fav('warcraftlogs.com', 'W')}</a>
    <a class="arm" href="https://worldofwarcraft.blizzard.com/en-us/character/${g}/${r}/${nl}" target="_blank" rel="noopener" data-tip="Blizzard Armory">${fav('worldofwarcraft.blizzard.com', 'A')}</a></span>`;
}
const pctColor = p => p == null ? '#666' : p >= 100 ? '#e5cc80' : p >= 99 ? '#e268a8' : p >= 95 ? '#ff8000' : p >= 75 ? '#a335ee' : p >= 50 ? '#0070ff' : p >= 25 ? '#1eff00' : '#888';
const pctHtml = p => p == null ? '<span class="pct" style="color:#666">-</span>' : `<span class="pct" style="color:${pctColor(p)}">${Math.floor(p)}</span>`;
const abbr = n => !n ? '-' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n) + '';
const f1 = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 ? n.toFixed(1) : '-'; };
const f2 = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 ? n.toFixed(2) : '-'; };
/* Spec initials as small tags (hover a row for full names) */
/* Secondary stat priority per spec (Murlok.io Mythic+, Patch 12.1; Death Knight from the hub's Stat Priorities tab) */
const SPEC_STATS = { Vengeance: ['Haste', 'Crit', 'Mastery', 'Vers'], Havoc: ['Crit', 'Mastery', 'Haste', 'Vers'], Guardian: ['Haste', 'Crit', 'Mastery', 'Vers'],
  Feral: ['Mastery', 'Haste', 'Crit', 'Vers'], Blood: ['Haste', 'Crit', 'Mastery', 'Vers'], Frost: ['Crit', 'Mastery', 'Haste', 'Vers'], Unholy: ['Crit', 'Mastery', 'Haste', 'Vers'],
  // Friends' and guests' specs (Murlok.io Mythic+, 2026-11-25). Names shared by two classes carry the class.
  Mistweaver: ['Haste', 'Mastery', 'Crit', 'Vers'], 'Protection Paladin': ['Crit', 'Haste', 'Mastery', 'Vers'], 'Frost Mage': ['Mastery', 'Crit', 'Haste', 'Vers'],
  'Restoration Shaman': ['Crit', 'Haste', 'Vers', 'Mastery'], 'Holy Priest': ['Haste', 'Crit', 'Mastery', 'Vers'], Fire: ['Haste', 'Mastery', 'Vers', 'Crit'] };
const statsFor = (cls, spec) => { const sp = String(spec || '').replace(/ PvP$/, ''); return SPEC_STATS[sp + ' ' + (cls || '')] || SPEC_STATS[sp] || []; };

const SPEC_ICON = { Blood: 'spell_deathknight_bloodpresence', Frost: 'spell_deathknight_frostpresence', Unholy: 'spell_deathknight_unholypresence',
  Havoc: 'ability_demonhunter_specdps', Vengeance: 'ability_demonhunter_spectank', Feral: 'ability_druid_catform', Guardian: 'ability_racial_bearform',
  Balance: 'spell_nature_starfall', Restoration: 'spell_nature_healingtouch' };
const specLetters = specs => specs.map(sp => { const n = String(sp).replace(/ PvP$/, ''); return SPEC_ICON[n]
  ? `<img class="spec-ic" src="${ICON_BASE}${SPEC_ICON[n]}.jpg" alt="${esc(n.slice(0, 1))}" title="${esc(sp)}" loading="lazy">`
  : `<span class="spl-t" title="${esc(sp)}">${esc(n.slice(0, 1))}</span>`; }).join('');
const slotName = s => String(s).replace(/^(Finger|Trinket) \d$/, '$1');
const bossOf = source => BOSS_ORDER.find(b => String(source).startsWith(b)) || null;
const GOAL = 3600, PER_DUNGEON = 450;
const CLASS_HEX = { 'demon hunter': '#c27be0', 'death knight': '#ff5c75', 'druid': '#ff9d4d', 'mage': '#3fc7eb', 'warrior': '#c69b6d',
  'paladin': '#f48cba', 'hunter': '#aad372', 'rogue': '#fff468', 'priest': '#ffffff', 'shaman': '#3d9bff', 'warlock': '#8788ee', 'monk': '#00ff98', 'evoker': '#33c3a0' };
const classHex = cls => CLASS_HEX[String(cls || '').toLowerCase()] || '#ddd';
let openTeam = (() => { try { return localStorage.getItem('apoOpenTeam') || ''; } catch (e) { return ''; } })();
const teamPick = (() => { try { return JSON.parse(localStorage.getItem('apoTeamPick') || '{}'); } catch (e) { return {}; } })();
const toonsOf = m => [m].concat(m.alts || (m.alt ? [m.alt] : []));
const shownMember = (team, m) => toonsOf(m).find(o => o.name === teamPick[team + '|' + m.name]) || m;
const resilientLevel = p => {           // highest level timed in every dungeon of the season
  const runs = (p.runs || []);
  if (runs.length < 8 || runs.some(r => !r.timed)) return runs.filter(r => r.timed).length >= 8 ? Math.min(...runs.filter(r => r.timed).map(r => r.level)) : 0;
  return Math.min(...runs.map(r => r.level));
};
const lvClass = sc => sc >= PER_DUNGEON ? 'good' : sc >= PER_DUNGEON - 30 ? 'mid' : 'low';

/* Key level that typically scores 450+, learned from everyone's timed runs */
function levelForGoal(players) {
  const by = {};
  players.forEach(p => (p.runs || []).filter(r => r.timed).forEach(r => (by[r.level] = by[r.level] || []).push(r.score)));
  const levels = Object.keys(by).map(Number).sort((a, b) => a - b);
  const med = l => { const a = by[l].slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const hit = levels.find(l => med(l) >= PER_DUNGEON);
  return { level: hit || (levels.length ? levels[levels.length - 1] + 1 : 0), table: levels.map(l => [l, med(l)]) };
}

/* What each class / spec brings to a Mythic+ group (Midnight). Healer specs get the stronger dispel. */
const KIT = {
  'Warrior':      { buff: ['Battle Shout'], util: ['Rallying Cry'] },
  'Priest':       { buff: ['Power Word: Fortitude'], dispel: ['Disease'], purge: true, util: ['Mass Dispel', 'Power Infusion', 'Leap of Faith'],
                    spec: { Discipline: { dispel: ['Magic', 'Disease'] }, Holy: { dispel: ['Magic', 'Disease'] } } },
  'Mage':         { buff: ['Arcane Intellect'], lust: true, dispel: ['Curse'], purge: true, util: ['Spellsteal'] },
  'Druid':        { buff: ['Mark of the Wild'], brez: true, dispel: ['Curse', 'Poison'], soothe: true, util: ['Stampeding Roar', 'Innervate'],
                    spec: { Restoration: { dispel: ['Magic', 'Curse', 'Poison'] } } },
  'Shaman':       { buff: ['Skyfury'], lust: true, dispel: ['Curse'], purge: true, util: ['Wind Rush / Totems'],
                    spec: { Restoration: { dispel: ['Magic', 'Curse'] } } },
  'Monk':         { buff: ['Mystic Touch'], dispel: ['Poison', 'Disease'], util: ['Ring of Peace', 'Leg Sweep'],
                    spec: { Mistweaver: { dispel: ['Magic', 'Poison', 'Disease'] }, Brewmaster: { soothe: true } } },
  'Demon Hunter': { buff: ['Chaos Brand'], purge: true, util: ['Darkness', 'Sigil of Misery'] },
  'Rogue':        { soothe: true, util: ['Shroud of Concealment', 'Atrophic Poison'] },
  'Hunter':       { buff: ["Hunter's Mark"], soothe: true, purge: true, util: ['Primal Rage (exotic pet)', 'Binding Shot'] },
  'Death Knight': { brez: true, util: ['Anti-Magic Zone', 'Death Grip'] },
  'Paladin':      { brez: true, dispel: ['Poison', 'Disease'], util: ['Blessing of Protection', 'Blessing of Freedom', 'Devotion Aura'],
                    spec: { Holy: { dispel: ['Magic', 'Poison', 'Disease'] } } },
  'Warlock':      { brez: true, dispel: ['Magic'], util: ['Demonic Gateway', 'Healthstones'] },
  'Evoker':       { buff: ['Blessing of the Bronze'], lust: true, dispel: ['Poison'], util: ['Rescue', 'Time Spiral'],
                    spec: { Preservation: { dispel: ['Magic', 'Poison'] } } },
};
const TK_ICONS = { 'Bloodlust': 'spell_nature_bloodlust', 'Battle rez': 'spell_nature_reincarnation', 'Arcane Intellect': 'spell_holy_magicalsentry',
  'Power Word: Fortitude': 'spell_holy_wordfortitude', 'Battle Shout': 'ability_warrior_battleshout', 'Mark of the Wild': 'spell_nature_regeneration',
  'Skyfury': 'achievement_raidprimalist_windelemental', 'Blessing of the Bronze': 'ability_evoker_blessingofthebronze', 'Mystic Touch': 'ability_monk_sparring',
  'Chaos Brand': 'ability_demonhunter_empowerwards', "Hunter's Mark": 'ability_hunter_markedfordeath', 'Magic dispel': 'spell_holy_dispelmagic',
  'Curse dispel': 'spell_nature_removecurse', 'Poison dispel': 'spell_nature_nullifypoison', 'Disease dispel': 'spell_nature_nullifydisease',
  'Purge (enemy magic)': 'spell_nature_purge', 'Soothe (enrage)': 'ability_hunter_beastsoothe' };
const ALL_BUFFS = ['Arcane Intellect', 'Power Word: Fortitude', 'Battle Shout', 'Mark of the Wild', 'Skyfury', 'Blessing of the Bronze', 'Mystic Touch', 'Chaos Brand', "Hunter's Mark"];
function kitOf(m) {
  const k = KIT[m.cls] || {}, sp = (k.spec || {})[m.spec] || {};
  return { buff: k.buff || [], lust: !!k.lust, brez: !!k.brez, purge: !!(sp.purge ?? k.purge), soothe: !!(sp.soothe ?? k.soothe),
    dispel: sp.dispel || k.dispel || [], util: k.util || [] };
}
function toolkitHtml(ms) {
  const kits = ms.filter(m => !m.error).map(m => ({ m, k: kitOf(m) }));
  const who = f => kits.filter(x => f(x.k)).map(x => x.m);
  const names = list => list.map(m => `<span style="color:${classHex(m.cls)};white-space:nowrap">${classIcon(m.cls, 'sm')}${esc(m.name)}</span>`).join(' ');
  const item = (label, list, tipMissing) => `<div class="tk-item ${list.length ? 'have' : 'miss'}"><span class="tk-mark">${list.length ? '&#10003;' : '&#10005;'}</span><span class="tk-l">${TK_ICONS[label] ? icon(TK_ICONS[label]) + ' ' : ''}${label}</span><span class="tk-w">${list.length ? names(list) : `<span class="hint">${tipMissing || 'missing'}</span>`}</span></div>`;
  const lust = who(k => k.lust);
  const hunters = kits.filter(x => x.m.cls === 'Hunter').map(x => x.m);
  const core = item('Bloodlust', lust, hunters.length ? 'only via a Hunter exotic pet' : 'nobody brings it') + item('Battle rez', who(k => k.brez));
  const buffs = ALL_BUFFS.map(b => item(b, who(k => k.buff.includes(b)))).join('');
  const disp = ['Magic', 'Curse', 'Poison', 'Disease'].map(d => item(d + ' dispel', who(k => k.dispel.includes(d)))).join('');
  const off = item('Purge (enemy magic)', who(k => k.purge)) + item('Soothe (enrage)', who(k => k.soothe));
  const utils = kits.map(x => `<div class="tk-util">${classIcon(x.m.cls, 'sm')}<span style="color:${classHex(x.m.cls)}">${esc(x.m.name)}</span> <span class="hint">${esc(x.k.util.join(', '))}</span></div>`).join('');
  return `<div class="toolkit"><div class="tk-col"><div class="tk-h">Must-haves</div>${core}<div class="tk-h">Offensive dispels</div>${off}</div>
    <div class="tk-col"><div class="tk-h">Group buffs</div>${buffs}</div>
    <div class="tk-col"><div class="tk-h">Dispels &amp; cleanses</div>${disp}<div class="tk-h">Other utility</div>${utils}</div></div>`;
}

/* What each Season 2 dungeon asks of a group (conquestcapped.com Mythic+ comps guide). check: utility the toolkit can verify */
const DUNGEON_NOTES = {
  'Den of Nalorakk':      { notes: 'Interrupts; a Rogue (Shroud) or another way through the skip.', checks: ['skip'] },
  'Temple of Sethraliss': { notes: 'Poison dispels, crowd control and quick target swaps.', checks: ['Poison'] },
  'Ruby Life Pools':      { notes: 'Interrupts for the Primalist Cinderweavers.', checks: [] },
  'Voidscar Arena':       { notes: 'Mobility and crowd control for the arena room raptor.', checks: [] },
  'Altar of Fangs':       { notes: 'Poison dispels (Paralyzing Shots, Envenom); Soothe for Ravenous Claws; interrupt Piercing Hiss; crowd control the Evolve cast.', checks: ['Poison', 'soothe'] },
  "Kings' Rest":          { notes: 'Lots of interrupts; a ranged DPS to tag the animated guardian.', checks: ['ranged'] },
  'The Blinding Vale':    { notes: 'Healing and soaking on the first boss; focus the Sporeblight Belchers.', checks: [] },
  'Murder Row':           { notes: 'Interrupts and area stops for the fel casters; plan a kick order.', checks: [] },
};
const RANGED = { Mage: 1, Warlock: 1, Hunter: 1, Evoker: 1, Priest: 1 };
const RANGED_SPECS = { Balance: 1, Elemental: 1, Shadow: 1 };
const mmss = ms => { if (!ms) return '-'; const t = Math.round(Math.abs(ms) / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const openDungeon = new Set((() => { try { return JSON.parse(localStorage.getItem('apoOpenDungeon') || '[]'); } catch (e) { return []; } })());
function dungeonDetails(teamName, d, ok) {
  const info = DUNGEON_NOTES[d] || { notes: '', checks: [] };
  const kits = ok.map(m => ({ m, k: kitOf(m) }));
  const has = f => kits.filter(x => f(x)).map(x => x.m.name);
  const check = (label, list, missing) => `<span class="dchk ${list.length ? 'ok' : 'no'}">${list.length ? '&#10003;' : '&#10005;'} ${label}: ${list.length ? esc(list.join(', ')) : missing}</span>`;
  const checks = info.checks.map(c => c === 'Poison' ? check('Poison dispel', has(x => x.k.dispel.includes('Poison')), 'missing')
    : c === 'soothe' ? check('Soothe', has(x => x.k.soothe), 'missing')
    : c === 'skip' ? check('Skip', has(x => x.m.cls === 'Rogue'), 'no Rogue: use potions or another skip')
    : c === 'ranged' ? check('Ranged', has(x => RANGED[x.m.cls] || RANGED_SPECS[x.m.spec]), 'none in group') : '').join('');
  const runs = ok.map(m => ({ m, r: (m.runs || []).find(x => x.dungeon === d) })).filter(x => x.r);
  const par = (runs.find(x => x.r.par) || {}).r;
  const times = runs.filter(x => x.r.clear).sort((a, b) => b.r.level - a.r.level || a.r.clear - b.r.clear).map(x => {
    const left = (x.r.par || 0) - x.r.clear;
    return `<span class="dtime"><span style="color:${classHex(x.m.cls)}">${esc(x.m.name)}</span> +${x.r.level} ${mmss(x.r.clear)} <span style="color:${left >= 0 ? 'var(--ok)' : 'var(--bad)'}">${mmss(left)} ${left >= 0 ? 'left' : 'over'}</span></span>`;
  }).join('');
  return `<div class="ddet"><div><b>Needs:</b> ${esc(info.notes || 'No notes yet.')}</div>${checks ? `<div class="dchecks">${checks}</div>` : ''}
    <div class="dtimes"><b>Timer ${par ? mmss(par.par) : '-'}</b>${times ? ' &middot; best clears: ' + times : ''}</div></div>`;
}

function teamTile(t) {
  const ms = t.members.map(m => shownMember(t.name, m)).filter(m => !m.error);
  const avg = ms.length ? Math.round(ms.reduce((a, m) => a + (m.score || 0), 0) / ms.length) : 0;
  const res = ms.length ? Math.min(...ms.map(resilientLevel)) : 0;
  const done = ms.filter(m => m.score >= GOAL).length;
  return `<button type="button" class="team-tile${openTeam === t.name ? ' on' : ''}" data-team="${esc(t.name)}">
    <div class="tn">${esc(t.name)}</div><div class="td">${esc(t.day || '')}${t.day ? 's' : ''} &middot; ${t.members.length} players</div>
    <div class="tstats"><span>Avg rating<b>${avg || '-'}</b></span><span>Team resilient<b>${res ? '+' + res : '-'}</b></span><span>At 3,600<b>${done} / ${ms.length}</b></span></div>
    <div class="tmembers">${ms.map(m => `<span style="color:${classHex(m.cls)};display:inline-flex;align-items:center">${classIcon(m.cls, 'sm')}${esc(m.name)}</span>`).join('')}</div>
  </button>`;
}

function teamPanel(t) {
  if (t.error) return `<p class="empty">Could not load teams: ${esc(t.error)}</p>`;
  const ms = t.members.map(m => shownMember(t.name, m));
  const ok = ms.filter(m => !m.error);
  const goal = levelForGoal(ok);
  const dungeons = [...new Set(ok.flatMap(m => (m.runs || []).map(r => r.dungeon)))];
  const runOf = (m, d) => (m.runs || []).find(r => r.dungeon === d);
  const rows = dungeons.map(d => {
    const lv = ok.map(m => { const r = runOf(m, d); return r && r.timed ? r.level : 0; });
    return { d, short: (ok.map(m => runOf(m, d)).find(Boolean) || {}).short || '', min: Math.min(...lv), below: ok.filter(m => { const r = runOf(m, d); return !r || r.score < PER_DUNGEON; }).length };
  }).sort((a, b) => a.min - b.min || b.below - a.below);
  const resTeam = ok.length ? Math.min(...ok.map(resilientLevel)) : 0;
  const head = `<tr><th>Dungeon</th>${ok.map(m => `<th style="color:${classHex(m.cls)}">${classIcon(m.cls, 'sm')}${esc(m.name)}</th>`).join('')}<th>Whole team timed</th><th>Next team key</th></tr>`;
  const focusSet = new Set(rows.slice(0, 3).map(r => r.d));   // the team's three weakest dungeons
  const body = rows.map(r => {
    const focus = focusSet.has(r.d);
    const dkey = t.name + '|' + r.d, dOpen = openDungeon.has(dkey);
    return `<tr class="${focus ? 'focus' : ''}"><td>${esc(r.d)}${focus ? '<span class="tag-focus">FOCUS</span>' : ''}<button type="button" class="dbtn" data-dungeon="${esc(dkey)}">${dOpen ? 'Collapse &#9652;' : 'Details &#9662;'}</button></td>` +
      ok.map(m => { const x = runOf(m, r.d); return `<td class="cell">${x ? `<span class="lv ${lvClass(x.score)}${x.timed ? '' : ' untimed'}" data-tip="${esc(m.name)}: +${x.level} ${x.timed ? 'timed' + (x.upgrades > 1 ? ' (+' + x.upgrades + ')' : '') : 'not timed'}, ${x.score.toFixed(1)} points">+${x.level}</span><span class="sc">${x.score.toFixed(0)}</span>` : '<span class="empty">-</span>'}</td>`; }).join('') +
      `<td><b${r.min === resTeam ? ' class="res-limit" data-tip="This dungeon sets the team resilient level"' : ''}>${r.min ? '+' + r.min : '-'}</b></td><td><b style="color:${focus ? '#ff9d6e' : 'var(--ok)'}">+${Math.max(r.min + 1, 2)}</b></td></tr>` +
      (dOpen ? `<tr class="drow"><td colspan="${ok.length + 3}">${dungeonDetails(t.name, r.d, ok)}</td></tr>` : '');
  }).join('');
  const near = goal.table.filter(([l]) => l >= goal.level - 2 && l <= goal.level + 1).map(([l, sc]) => `+${l} &asymp; ${Math.round(sc)}`).join(', ');
  const goalLine = `<p class="hint" style="margin:0 0 10px">3,600 needs about ${PER_DUNGEON} points in each dungeon. From the team's own timed runs: ${near || 'no timed runs yet'},
    so timing roughly <b>+${goal.level - 1} to +${goal.level}</b> in every dungeon gets there.
    Team resilient level: <b>${resTeam ? '+' + resTeam : 'not yet'}</b> (the lowest level every player has timed in every dungeon).
    <b style="color:#ff9d6e">FOCUS</b> marks the team's three weakest dungeons: push these first to raise the resilient level.</p>`;
  const cards = t.members.map(base => {
    const m = shownMember(t.name, base);
    const toons = toonsOf(base);
    const swap = toons.length > 1 ? `<div class="picker"><span class="pl">${esc(base.player || base.name)}'s toons</span><div class="row">${toons.map(o =>
      `<button type="button" class="pick${o === m ? ' on' : ''}" data-teampick="${esc(t.name + '|' + base.name + '|' + o.name)}" style="${o === m ? '' : 'color:' + classHex(o.cls)}" title="${esc(o.name)}">${esc(o.name)}</button>`).join('')}</div></div>` : '';
    if (m.error) return `<div class="member"><div class="mh"><span class="mn">${esc(m.name)}</span></div><p class="empty">Not found on Raider.io (${esc(m.error)})</p>${swap}</div>`;
    const res = resilientLevel(m), gap = Math.max(0, GOAL - m.score);
    const ench = (m.missingEnchants || []).length
      ? `<span class="pill bad">Missing enchant: ${esc(m.missingEnchants.map(slotName).join(', '))}</span>` : `<span class="pill ok">Enchants OK</span>`;
    const dia = m.diamond ? `<span class="pill ok">Eversong Diamond</span>` : `<span class="pill bad">No Eversong Diamond</span>`;
    const weakest = (m.runs || []).slice().sort((a, b) => a.score - b.score).slice(0, 2).map(r => `${r.short} +${r.level}`).join(', ');
    return `<div class="member" style="--accent:${accentFor(m.cls)};${classBg(m.cls)}">
      <div class="mh"><div>${classIcon(m.cls, 'sm')}<span class="mn" style="color:${classHex(m.cls)}">${esc(m.name)}</span> ${profileLinks(m.name, m.realm, m.region)}</div><span class="mr" style="color:${esc(m.color || '#fff')}">${f1(m.score)}</span></div>
      <div class="ms">${esc(m.spec)} ${esc(m.cls)} &middot; ${esc(m.realmName || m.realm)}</div>
      <div class="row2"><span>ilvl <b>${f2(m.ilvl)}</b></span><span class="res-badge${res && res === resTeam ? ' low' : ''}" data-tip="Highest level timed in every dungeon">Resil ${res ? '+' + res : '-'}</span><span>${gap ? `To 3,600 <b>${Math.ceil(gap)}</b>` : '<b style="color:var(--ok)">3,600 reached</b>'}</span></div>
      <div class="meter" style="margin-top:6px"><div style="width:${Math.min(100, m.score / GOAL * 100).toFixed(1)}%"></div></div>
      ${weakest ? `<div class="row2"><span>Lowest: <b>${esc(weakest)}</b></span></div>` : ''}
      <div class="chips">${ench}${dia}</div>${swap}</div>`;
  }).join('');
  const nextRes = resTeam + 1;
  const needFor = rows.filter(r => r.min < nextRes);
  const resStrip = `<div class="res-strip">
      <div class="res-big"><span class="k">Team resilient</span><span class="v">${resTeam ? '+' + resTeam : '-'}</span><span class="hint">every player has timed every dungeon at this level</span></div>
      <div class="res-next"><span class="k">To reach resilient +${nextRes}</span>${needFor.length ? needFor.map(r => {
        const who = ok.filter(m => { const x = runOf(m, r.d); return !x || !x.timed || x.level < nextRes; }).map(m => m.name);
        return `<span class="res-need" data-tip="Still needs a timed +${nextRes}: ${esc(who.join(', '))}">${esc(r.short || r.d)} <b>+${nextRes}</b> <span class="hint">(${who.length})</span></span>`; }).join('') : '<span class="hint">Already there</span>'}</div>
    </div>`;
  return `<div class="card"><div class="card-head"><h2>${esc(t.name)} <span class="hint">${esc(t.day || '')}</span></h2><span class="hint">Green 450+, yellow within 30, red lower; dashed = not timed</span></div>
    ${resStrip}${goalLine}<div class="table-wrap"><table class="matrix"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="members">${cards}</div>
    <div class="sec"><div class="sec-title"><span>Group toolkit</span><span class="hint">updates with the toons picked above</span></div>${toolkitHtml(ms)}</div></div>`;
}


/* ------------------------------------------------------------------ render */
