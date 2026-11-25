/* ------------------------------------------------------------------ settings
 * WEBAPP_URL: the hub's Apps Script web app URL (ends in /exec).
 *   Reading needs no key. Changing anything needs the edit key, entered once per browser with the lock button;
 *   it is saved only in that browser, never in this file.
 */
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwqXMIlBNvm2qwm2Z4OZ8MWIKvVvo3W4iAeCnAdRGR8VCrZ-nQfUS1Pb1sId9cUxZYR/exec';
const REFRESH_MINUTES = 5;
const ACCOUNTS = { 'WoW#1': ['Diablõ', 'Kona', 'Cõrpses'], 'AODKONA': ['Bõnes', 'Hõrns'] };
const PLAN_CHARS = ['Cõrpses', 'Diablõ', 'Kona'];
const ALTS = ['Tõxic', 'Kõna', 'Demõns', 'Evõker', 'Cõdes', 'Drõids', 'Thõr', 'Fõrged', 'Iõnized', 'Põts', 'Shõps', 'Auctiõns'];
const TODO_CATEGORIES = ['Setup', 'Gear', 'Enchants', 'Raid', 'Mythic+', 'PvP', 'Crafting', 'Crafters', 'Leveling', 'Gold', 'Daily', 'Weekly', 'Other'];
const BOSS_ORDER = ['Nymrissa Wavecaller', "Kith'ix", "Nek'zali the Soulcoiler", 'Entombed Sentinels', 'Vashnik the Malignant',
  'The Lost Explorers', 'Sszorak', 'The Twin Fangs', 'The Coiled Altar', "Ula'tek"];
const INSTANCE_ORDER = ['Tidebound Grotto', "The Unbinding of Kith'ix", 'The Venomous Abyss'];
const PVE_ORDER = ['Cõrpses', 'Kona', 'Diablõ'];      // Death Knight, Druid, Demon Hunter
const MPLUS_ORDER = ['Kona', 'Cõrpses', 'Diablõ'];    // Druid, Death Knight, Demon Hunter
/* PvP vendor price by slot (Conquest; Honor gear uses the same table). Head/Chest/Legs 875 and
   Shoulder/Hands 700 are confirmed for Midnight; the rest follow the long-standing slot table. */
const SLOT_COST = { Head: 875, Chest: 875, Legs: 875, Shoulder: 700, Hands: 700, Waist: 700, Feet: 700,
  Neck: 525, Back: 525, Wrist: 525, 'Finger 1': 525, 'Finger 2': 525, 'Trinket 1': 700, 'Trinket 2': 700, 'Off hand': 525 };
const CHAR_COLOR = { 'Diablõ': '#c27be0', 'Cõrpses': '#ff5c75', 'Kona': '#ff9d4d', 'Bõnes': '#ff5c75', 'Hõrns': '#ff9d4d' };

/* Minimal snapshot, shown only if the live data can't be loaded. */
const SNAPSHOT = {
  generated: '2026-11-24 16:30 CT',
  dashboard: [['Account dashboard'], ['Reset week starting Tue Nov 24'], [], ['At a glance'],
    ['Open to-dos', '11'], ['BiS items still needed (all specs)', '78'], ['Enchants to apply or change', '29'],
    ['Top kill target', "Kith'ix (The Unbinding of Kith'ix) (9 items)"], ['Crafted items to order', '14'], ["This week's bonus rolls planned", '0']],
  characters: [
    { name: 'Diablõ', account: 'WoW#1', cls: 'Demon Hunter', pvp: false, ilvl: '324.9', rating: 'M+ 2919.8', bis: ['Vengeance: 8 of 16 BiS items', 'Havoc: 9 of 16 BiS items'], main: ['Vengeance'], issues: '2 missing, 5 different from the Vengeance setup', pulled: '2026-11-24 15:40 CT', specOptions: ['Havoc', 'Vengeance'], specSelected: 'Vengeance' },
    { name: 'Cõrpses', account: 'WoW#1', cls: 'Death Knight', pvp: false, ilvl: '333.9', rating: 'M+ 3142', bis: ['Blood: 9 of 15 BiS items', 'Frost: 9 of 16 BiS items', 'Unholy: 12 of 15 BiS items'], main: ['Blood'], issues: '6 missing, 2 different from the Blood setup', pulled: '2026-11-24 15:40 CT', specOptions: ['Blood', 'Frost', 'Unholy'], specSelected: 'Blood' },
    { name: 'Kona', account: 'WoW#1', cls: 'Druid', pvp: false, ilvl: '334.4', rating: 'M+ 3670.1', bis: ['Guardian: 11 of 15 BiS items', 'Feral: 12 of 15 BiS items'], main: ['Guardian'], issues: '2 missing, 2 different from the Guardian setup', pulled: '2026-11-24 15:40 CT', specOptions: ['Feral', 'Guardian'], specSelected: 'Guardian' },
    { name: 'Bõnes', account: 'AODKONA', cls: 'Death Knight', pvp: true, ilvl: '184.9', rating: '', bis: ['Unholy PvP: 0 of 15 BiS items'], main: ['Unholy'], issues: '11 missing, 0 different from the Unholy setup', pulled: '2026-11-24 15:40 CT', specOptions: ['Unholy'], specSelected: 'Unholy' },
    { name: 'Hõrns', account: 'AODKONA', cls: 'Druid', pvp: true, ilvl: '221.8', rating: '', bis: ['Feral PvP: 3 of 15 BiS items', 'Balance PvP: 2 of 15 BiS items'], main: ['Feral', 'Balance'], issues: '11 missing, 0 different from the Feral setup', pulled: '2026-11-24 15:40 CT', specOptions: ['Feral', 'Balance'], specSelected: 'Feral' },
  ],
  todo: [], weekly: { characters: [], rows: [] }, crafters: [], bonus: [], needs: [],
};

/* ------------------------------------------------------------------ helpers */
const CLASS_ACCENT = { 'demon hunter': 'var(--dh)', 'death knight': 'var(--dk)', 'druid': 'var(--druid)', 'mage': '#3fc7eb',
  'warrior': '#c69b6d', 'paladin': '#f48cba', 'hunter': '#aad372', 'rogue': '#fff468', 'priest': '#ffffff', 'shaman': '#0070dd',
  'warlock': '#8788ee', 'monk': '#00ff98', 'evoker': '#33937f' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const accentFor = cls => CLASS_ACCENT[String(cls).toLowerCase()] || '#555';
// Each page only has some of the sections; a missing one gets a detached stand-in so the shared code can run unchanged
const $ = id => document.getElementById(id) || document.createElement('div');
const accountOf = name => Object.keys(ACCOUNTS).find(a => ACCOUNTS[a].includes(name)) || '';
const colored = name => `<span class="c" style="color:${CHAR_COLOR[name] || '#ddd'}">${esc(name)}</span>`;
/* Where an item comes from: a raid boss, a dungeon boss (Mythic+), or something else (crafted, tier, catalyst, vendor, trash) */
function srcInfo(source) {
  const src = String(source || '');
  const boss = bossOf(src);
  if (boss) return { type: 'raid', boss, place: (src.match(/\(([^)]+)\)\s*$/) || [])[1] || '' };
  const m = src.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m && !/^(Crafted|Trash|Catalyst|Tier)/i.test(src) && !/Venomous Abyss|Kith'ix|Tidebound/i.test(m[2])) {
    return { type: 'dungeon', boss: m[1].trim(), place: m[2].replace(/,?\s*Mythic\+/i, '').trim() };
  }
  if (/^Tier/i.test(src)) return { type: 'tier' };
  if (/^Catalyst/i.test(src)) return { type: 'catalyst' };
  return { type: 'other' };
}
/* Icons are loaded from Blizzard's icon server and each site's own favicon (via Google's favicon service) */
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
const logSpec = (() => { try { return JSON.parse(localStorage.getItem('wowLogSpec') || '{}'); } catch (e) { return {}; } })();
function logsBlock(c) {
  const L = c.logs;
  if (!L) return `<div class="sec"><div class="sec-title"><span>Warcraft Logs &middot; best DPS %</span></div><p class="empty">Shows once Warcraft Logs keys are added to the script.</p></div>`;
  if (L.error) return `<div class="sec"><div class="sec-title"><span>Warcraft Logs</span></div><p class="empty">${esc(L.error)}</p></div>`;
  const specs = L.specs || [];
  const sel = specs.includes(logSpec[c.name]) ? logSpec[c.name] : '';
  const view = sel ? (L.bySpec || {})[sel] || {} : L;
  const chip = (label, key, data) => `<button type="button" class="chip logchip${sel === key ? ' on' : ''}" data-logspec="${esc(c.name + '|' + key)}">${key ? specLetters([key]) + ' ' : ''}${esc(label)}${data ? ` <span class="lc" data-tip="Raid: ilvl % / overall %&lt;br&gt;Mythic+: key level % / overall %">R${pctHtml(data.raidAvg)}/${pctHtml(data.raidAvgAll)} M+${pctHtml(data.dungeonAvg)}/${pctHtml(data.dungeonAvgAll)}</span>` : ''}</button>`;
  const chips = specs.length ? `<div class="filters" style="margin-bottom:8px">${chip('Best of any spec', '', L)}${specs.map(sp => chip(sp, sp, (L.bySpec || {})[sp])).join('')}</div>` : '';
  const showSpec = !sel;
  // Mythic+ amounts arrive as (key level x 2) x 10,000,000 + DPS; split them back apart
  const mp = r => r.amount >= 1e7 ? { dps: r.amount % 1e7, key: Math.floor(r.amount / 1e7) / 2 } : { dps: r.amount, key: null };
  const table = (rows, label, isRaid) => `<table class="logs-table"><thead><tr><th>${label}</th>${showSpec ? '<th class="cb">Spec</th>' : ''}<th>${isRaid ? 'Diff' : 'Key'}</th>
      <th data-tip="${isRaid ? 'Compared with players at your item level' : 'Compared with players at the same key level'}">${isRaid ? 'ilvl %' : 'Key %'}</th><th data-tip="Compared with every player of the spec">All %</th><th data-tip="Highest DPS">Top DPS</th><th>${isRaid ? 'Kills' : 'Runs'}</th></tr></thead><tbody>` +
    (rows.length ? rows.map(r => { const m = isRaid ? { dps: r.amount, key: null } : mp(r);
      return `<tr><td${r.kills ? '' : ' class="none"'}>${esc(r.name)}</td>${showSpec ? `<td class="cb">${r.kills && r.spec ? specLetters([r.spec]) : ''}</td>` : ''}<td class="hint">${isRaid ? esc(r.diff || '') : (r.kills && m.key ? '+' + m.key : '')}</td><td>${r.kills ? pctHtml(r.pct) : '<span class="none">-</span>'}</td><td>${r.kills && r.pctAll != null ? pctHtml(r.pctAll) : '<span class="none">-</span>'}</td><td>${r.kills ? abbr(m.dps) : '-'}</td><td>${r.kills || 0}</td></tr>`; }).join('')
      : `<tr><td colspan="7" class="none">No logs yet</td></tr>`) + `</tbody></table>`;
  const raid = (view.raid || []).slice().sort((a, b) => (BOSS_ORDER.indexOf(bossOf(a.name) || a.name) + 1 || 99) - (BOSS_ORDER.indexOf(bossOf(b.name) || b.name) + 1 || 99));
  return `<div class="sec"><div class="sec-title"><span>Warcraft Logs &middot; best DPS %${sel ? ' &middot; ' + esc(sel) : ''}</span>${L.updated ? `<span class="hint">updated ${esc(L.updated)}</span>` : ''}</div>${chips}
    <div class="logs-grid"><div>${table(raid, 'Raid boss', true)}</div><div>${table(view.dungeons || [], 'Dungeon', false)}</div></div></div>`;
}
const f1 = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 ? n.toFixed(1) : '-'; };
const f2 = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 ? n.toFixed(2) : '-'; };
/* Spec initials as small tags (hover a row for full names) */
/* Secondary stat priority per spec (Murlok.io Mythic+, Patch 12.1; Death Knight from the hub's Stat Priorities tab) */
const SPEC_STATS = { Vengeance: ['Haste', 'Crit', 'Mastery', 'Vers'], Havoc: ['Crit', 'Mastery', 'Haste', 'Vers'], Guardian: ['Haste', 'Crit', 'Mastery', 'Vers'],
  Feral: ['Mastery', 'Haste', 'Crit', 'Vers'], Blood: ['Haste', 'Crit', 'Mastery', 'Vers'], Frost: ['Crit', 'Mastery', 'Haste', 'Vers'], Unholy: ['Crit', 'Mastery', 'Haste', 'Vers'] };
const SPEC_ICON = { Blood: 'spell_deathknight_bloodpresence', Frost: 'spell_deathknight_frostpresence', Unholy: 'spell_deathknight_unholypresence',
  Havoc: 'ability_demonhunter_specdps', Vengeance: 'ability_demonhunter_spectank', Feral: 'ability_druid_catform', Guardian: 'ability_racial_bearform',
  Balance: 'spell_nature_starfall', Restoration: 'spell_nature_healingtouch' };
const specLetters = specs => specs.map(sp => { const n = String(sp).replace(/ PvP$/, ''); return SPEC_ICON[n]
  ? `<img class="spec-ic" src="${ICON_BASE}${SPEC_ICON[n]}.jpg" alt="${esc(n.slice(0, 1))}" title="${esc(sp)}" loading="lazy">`
  : `<span class="spl-t" title="${esc(sp)}">${esc(n.slice(0, 1))}</span>`; }).join('');
const slotName = s => String(s).replace(/^(Finger|Trinket) \d$/, '$1');
const bossOf = source => BOSS_ORDER.find(b => String(source).startsWith(b)) || null;

function fromGrid(grid) {
  const cell = (r, c) => String((grid[r] || [])[c] ?? '').trim();
  const data = { reset: '', glance: [] };
  for (let r = 0; r < Math.min(grid.length, 5); r++) if (/^Reset week/i.test(cell(r, 0))) data.reset = cell(r, 0);
  const g = grid.findIndex(row => String((row || [])[0] ?? '').trim() === 'At a glance');
  if (g >= 0) for (let r = g + 1; r < grid.length && cell(r, 0); r++) data.glance.push([cell(r, 0), cell(r, 1)]);
  return data;
}
function parseBis(s) {
  const m = String(s).match(/^(.*?):\s*(\d+)\s+of\s+(\d+)/i);
  return m ? { spec: m[1], have: +m[2], total: +m[3] } : null;
}

let toastTimer;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg; t.className = bad ? 'bad' : ''; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.style.display = 'none'), bad ? 6000 : 2200);
}

/* ------------------------------------------------------------------ edit key */
const KEY_NAME = 'wowDashboardEditKey';
function getKey() { try { return localStorage.getItem(KEY_NAME) || ''; } catch (e) { return ''; } }
function setKey(k) { try { k ? localStorage.setItem(KEY_NAME, k) : localStorage.removeItem(KEY_NAME); } catch (e) { /* storage blocked */ } memKey = k; }
let memKey = getKey();
const canEdit = () => !!(WEBAPP_URL && memKey);
const DIS = () => (canEdit() ? '' : ' disabled');
function paintLock() {
  const b = $('lock');
  b.className = 'lock' + (canEdit() ? ' on' : '');
  b.innerHTML = canEdit() ? '&#128275; Editing (click to lock)' : '&#128274; View only';
}
$('lock').addEventListener('click', () => {
  if (canEdit()) { setKey(''); paintLock(); renderAll(); return; }
  const k = prompt('Enter your edit key (the one set in the hub under WoW > Set web page edit key):');
  if (k && k.trim()) { setKey(k.trim()); paintLock(); renderAll(); toast('Editing on in this browser.'); }
});

/* ------------------------------------------------------------------ writes */
let reloadTimer;
async function send(payload) {
  if (!canEdit()) { toast('Locked: click the lock button and enter your edit key.', true); return false; }
  try {
    // No Content-Type header: sent as text/plain so the browser skips the CORS preflight.
    const res = await fetch(WEBAPP_URL, { method: 'POST', body: JSON.stringify({ ...payload, key: memKey }) });
    const out = await res.json();
    if (!out.ok) {
      if (/edit key/i.test(out.error)) { setKey(''); paintLock(); renderAll(); }
      throw new Error(out.error);
    }
    toast('Saved to the sheet');
    clearTimeout(reloadTimer); reloadTimer = setTimeout(() => load(true), 3000);
    return true;
  } catch (e) {
    toast('Not saved: ' + e.message, true);
    clearTimeout(reloadTimer); reloadTimer = setTimeout(() => load(true), 500);
    return false;
  }
}

/* ------------------------------------------------------------------ tooltip */
const tip = $('tip');
document.addEventListener('mousemove', e => {
  const t = e.target.closest('[data-tip]');
  if (!t) { tip.style.display = 'none'; return; }
  tip.innerHTML = t.getAttribute('data-tip');
  tip.style.display = 'block';
  tip.style.left = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8) + 'px';
  tip.style.top = (e.clientY + 14) + 'px';
});

/* ------------------------------------------------------------------ card pieces */
let STATE = null, LIVE = false, WHEN = '';
let todoFilter = 'Open';
const isMainSpec = (c, spec) => (c.main || []).some(m => String(spec).startsWith(m));

function bisBlock(c) {
  return (c.bis || []).map(parseBis).filter(Boolean).map(b => {
    const pct = b.total ? Math.round(b.have / b.total * 100) : 0;
    return `<div class="bis" data-tip="<b>${esc(b.spec)}</b><br>${b.have} of ${b.total} BiS items (${pct}%)">
      <div class="bis-label"><span>${esc(b.spec)} BiS${isMainSpec(c, b.spec) ? '<span class="star" title="Main spec">&#9733;</span>' : ''}</span><span>${b.have} / ${b.total}</span></div>
      <div class="meter"><div style="width:${pct}%"></div></div></div>`;
  }).join('');
}

/* Gear upgrade tracks and their colors (Veteran green, Champion blue, Hero purple, Myth orange) */
const TRACKS = [['Myth', '#ff8000'], ['Hero', '#a335ee'], ['Champion', '#0070dd'], ['Veteran', '#1eff00'], ['Adventurer', '#cccccc'], ['Explorer', '#9d9d9d']];
const trackOf = txt => { const t = TRACKS.find(([n]) => new RegExp(n === 'Champion' ? 'Champ' : n, 'i').test(String(txt || ''))); return t || null; };
function vaultBlock(c) {
  if (!c.vault) return '';
  const names = { mplus: 'Mythic+', raid: 'Raid', world: 'World' };
  const order = ['raid', 'mplus', 'world'];
  const rows = c.vault.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const unlocked = c.vault.reduce((n, v) => n + (v.thresholds || []).filter(t => v.done >= t).length, 0);
  const bonus = unlocked >= 3;
  const bonusChip = `<span class="bonus-chip${bonus ? ' on' : ''}" data-tip="${bonus ? unlocked + ' vault rewards to choose from: worth spending a bonus roll' : 'Ticks itself at 3 or more vault rewards (' + unlocked + ' now)'}"><span class="bx">${bonus ? '&#10003;' : ''}</span>Bonus Roll</span>`;
  return `<div class="sec"><div class="sec-title"><span>Vault rewards</span>${bonusChip}</div>` + rows.map(v => {
    const tiles = (v.thresholds || []).map((t, i) => {
      const on = v.done >= t;
      const raw = String(v.slots[i] || '');
      let reward;
      if (!on) reward = `${t} ${v.kind === 'mplus' ? (t > 1 ? 'runs' : 'run') : v.kind === 'raid' ? 'bosses' : 'activities'}`;
      // Raid vault rewards one track above the kill: LFR > Champion, Normal > Hero, Heroic and Mythic > Myth
      const raidTrack = { 'Raid Finder': 'Champion', LFR: 'Champion', Normal: 'Hero', Heroic: 'Myth', Mythic: 'Myth' };
      let tr = null;
      if (on && v.kind === 'raid') { const m = raw.match(/Unlocked:\s*(Raid Finder|LFR|Normal|Heroic|Mythic)/); tr = m ? trackOf(raidTrack[m[1]]) : null; }
      else if (on) tr = trackOf(raw);
      if (on) reward = tr ? tr[0] : (v.kind === 'mplus' ? (raw.match(/^\+\d+/) || ['Unlocked'])[0] : 'Unlocked');
      const style = tr ? ` style="border-color:${tr[1]};background:${tr[1]}26;color:#fff"` : '';
      return `<div class="tile${on ? ' on' : ''}"${style} data-tip="${esc(names[v.kind])} slot ${i + 1}: ${on ? 'unlocked' + (raw ? ' (' + esc(raw) + ')' : '') : 'needs ' + t}"><b${tr ? ` style="color:${tr[1]}"` : ''}>${on ? '&#10003; ' : ''}Slot ${i + 1}</b>${reward}</div>`;
    }).join('');
    const counter = `<div class="count"><span class="n">${v.done}</span></div>`;
    return `<div class="vault-row"><span>${names[v.kind]}<span class="auto" style="display:block">auto</span></span><div class="tiles">${tiles}</div>${counter}</div>`;
  }).join('') + `</div>`;
}

function weeklyChecks(c) {
  const wk = STATE.weekly || { characters: [], rows: [] };
  const col = wk.characters.indexOf(c.name);
  if (col < 0) return '';
  const rows = wk.rows.filter(r => r.cells[col] !== null && r.cells[col] !== undefined);
  if (!rows.length) return '';
  return `<div class="sec"><div class="sec-title"><span>This week</span></div><div class="checks">` + rows.map(r =>
    `<label class="check${r.cells[col] ? ' done' : ''}"><input type="checkbox" data-wk="${r.row},${col + 2}"${r.cells[col] ? ' checked' : ''}${DIS()}><span>${esc(r.task)}</span></label>`
  ).join('') + `</div></div>`;
}

/* Has this character killed this boss since the weekly reset? Returns the kill record (with difficulties) or null */
const killOf = (name, boss) => { const c = ((STATE && STATE.characters) || []).find(x => x.name === name); return c && (c.raidKills || []).find(k => k.boss === boss) || null; };
const diffBadges = k => k ? ['LFR', 'NORMAL', 'HEROIC', 'MYTHIC'].filter(d => k.diffs.includes(d)).map(d => `<span class="dbadge" style="color:${DIFF[d][1]};border-color:${DIFF[d][1]}">${DIFF[d][0]}</span>`).join('') : '';
const killBox = (name, boss) => { const k = killOf(name, boss);
  return `<span class="kbox${k ? ' on' : ''}" data-tip="${esc(name)} ${k ? 'killed ' + esc(boss) + ' this week (' + esc(k.diffs.map(d => d.charAt(0) + d.slice(1).toLowerCase()).join(', ')) + ')' : 'has not killed ' + esc(boss) + ' this week'}">${k ? '&#10003;' : ''}</span>`; };
const DIFF = { LFR: ['LFR', '#9d9d9d'], NORMAL: ['N', '#1eff00'], HEROIC: ['H', '#a335ee'], MYTHIC: ['M', '#ff8000'] };
function killsBlock(c) {
  if (!c.vault) return '';
  const kills = c.raidKills || [];
  const byBoss = {};
  kills.forEach(k => { byBoss[k.boss] = k; });
  const bosses = BOSS_ORDER.concat(kills.map(k => k.boss).filter(b => !BOSS_ORDER.includes(b)));
  const done = bosses.filter(b => byBoss[b]).length;
  return `<div class="sec"><div class="sec-title"><span>Raid this week</span><span class="hint">${done} of ${bosses.length} bosses &middot; resets Tuesday</span></div><div class="kills">` +
    bosses.map(b => { const k = byBoss[b];
      const badges = k ? ['LFR', 'NORMAL', 'HEROIC', 'MYTHIC'].filter(d => k.diffs.includes(d)).map(d => `<span class="dbadge" style="color:${DIFF[d][1]};border-color:${DIFF[d][1]}">${DIFF[d][0]}</span>`).join('') : '';
      return `<div class="kill${k ? ' on' : ''}" data-tip="${esc(b)}${k ? ': killed on ' + esc(k.diffs.map(d => d.charAt(0) + d.slice(1).toLowerCase()).join(', ')) : ': not killed this week'}"><span class="kn">${esc(b)}</span>${badges}</div>`;
    }).join('') + `</div></div>`;
}

function targetsBlock(c) {
  const gear = (STATE.needs || []).filter(n => n.character === c.name && n.kind === 'Gear' && bossOf(n.source));
  const title = `<div class="sec-title"><span>Raid targets</span><span class="hint">&#9733; main spec</span></div>`;
  if (!gear.length) return `<div class="sec">${title}<p class="empty">${(STATE.needs || []).length ? 'No raid drops needed.' : 'Loads with live data.'}</p></div>`;
  const byBoss = {};
  gear.forEach(n => {
    const b = bossOf(n.source);
    byBoss[b] = byBoss[b] || {};
    byBoss[b][n.needed] = byBoss[b][n.needed] || { item: n.needed, slot: n.slot, specs: new Set() };
    byBoss[b][n.needed].specs.add(n.spec);
  });
  const main = i => [...i.specs].some(s => isMainSpec(c, s));
  return `<div class="sec">${title}<div class="targets">` +
    BOSS_ORDER.filter(b => byBoss[b]).map(b => `<div class="target"><span class="boss">${esc(b)}</span><div class="items">` +
      Object.values(byBoss[b]).sort((x, y) => main(y) - main(x)).map(i =>
        `<div><span class="${main(i) ? 'main-item' : ''}">${main(i) ? '&#9733; ' : ''}${esc(i.item)}</span> <span class="slot">(${esc(slotName(i.slot))})</span><span class="specs-tag">${esc([...i.specs].join(', '))}</span></div>`
      ).join('') + `</div></div>`).join('') + `</div></div>`;
}

function enchantBlock(c) {
  const all = [...(c.enchants || []), ...(c.gems || [])];
  const bad = all.filter(e => e.status === 'Missing');
  const warn = all.filter(e => e.status === 'Different');
  const okN = all.filter(e => e.status === 'OK').length;
  const pick = (c.specOptions || []).length > 1
    ? `<select class="spec-sel" data-spec="${esc(c.name)}"${DIS()} title="Check against this spec">${c.specOptions.map(o => `<option${o === c.specSelected ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : `<span class="hint">${esc(c.specSelected || '')}</span>`;
  const head = `<div class="sec-title"><span>Enchants &amp; gems</span>${pick}</div>`;
  if (!all.length) return `<div class="sec">${head}<p class="empty">${esc(c.issues || '')}</p></div>`;
  const pills = `<div class="ench-summary">${bad.length ? `<span class="pill bad">${bad.length} missing</span>` : ''}${warn.length ? `<span class="pill warn">${warn.length} different</span>` : ''}${okN ? `<span class="pill ok">${okN} correct</span>` : ''}</div>`;
  const clean = s => String(s).replace(/^Enchant \w+ - /, '').replace(/\s*\(tick when[^)]*\)/i, '').replace(/ \((\w+ ?)+most used\)$/, '');
  const list = [...bad, ...warn].map(e => {
    const kind = e.status === 'Missing' ? 'bad' : 'warn';
    const has = e.status === 'Different' && e.equipped && !/^(TRUE|FALSE)$/.test(e.equipped) ? `<div class="has">has ${esc(clean(e.equipped))}</div>` : '';
    return `<div class="ench ${kind}"><span class="ico">${kind === 'bad' ? '&#10005;' : '!'}</span><span class="s">${esc(clean(e.slot))}</span><div><span class="want">${esc(clean(e.expected))}</span>${has}</div></div>`;
  }).join('');
  return `<div class="sec">${head}${pills}${list ? `<div class="ench-list">${list}</div>` : ''}</div>`;
}

function gearBlock(c) {
  const gear = c.gear || [];
  const pick = (c.specOptions || []).length > 1
    ? `<select class="spec-sel" data-spec="${esc(c.name)}"${DIS()} title="Show BiS for this spec">${c.specOptions.map(o => `<option${o === c.specSelected ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : `<span class="hint">${esc(c.specSelected || '')}</span>`;
  const head = `<div class="sec-title"><span>Gear &amp; BiS</span>${pick}</div>`;
  if (!gear.length) return `<div class="sec">${head}<p class="empty">Loads with the updated script.</p></div>`;
  const twoHand = !gear.some(g => g.slot === 'Off hand' && g.bis);
  let conquest = 0, honor = 0;
  const rows = gear.filter(g => g.item || g.bis).map(g => {
    const base = g.slot === 'Main hand' ? (twoHand ? 1750 : 875) : SLOT_COST[g.slot];
    const have = g.status === 'Have';
    let cost = '', cls = '', tipTxt = '';
    if (/Conquest/i.test(g.source)) { cost = base ? base.toLocaleString() + ' Conq' : 'Conquest'; cls = 'conq'; if (!have && base) conquest += base; }
    else if (/Tier/i.test(g.source)) { cost = base ? base.toLocaleString() + ' Conq' : 'Conquest'; cls = 'conq'; tipTxt = 'Buy the Conquest piece, then convert it at the Catalyst'; if (!have && base) conquest += base; }
    else if (/Competitor/i.test(g.bis)) { cost = 'Crafted'; cls = 'craft'; tipTxt = 'Crafted PvP item: recipe sold for 7,500 Honor, plus a Heraldry for PvP item level'; }
    else if (/Honor/i.test(g.source)) { cost = base ? base.toLocaleString() + ' Honor' : 'Honor'; cls = 'hon'; if (!have && base) honor += base; }
    else { cost = esc(g.source || ''); }
    if (have) { cls = 'done'; cost = '&#10003; have'; }
    return `<tr class="${have ? 'have' : ''}"><td class="slot">${esc(slotName(g.slot))}</td><td>${esc(g.item || '-')}</td><td class="il">${esc(g.ilvl || '')}</td>
      <td><span class="bisname">${esc(g.bis || '-')}</span>${g.source ? ` <span class="src2">${esc(g.source)}</span>` : ''}</td>
      <td class="cost ${cls}"${tipTxt ? ` data-tip="${esc(tipTxt)}"` : ''}>${cost}</td></tr>`;
  }).join('');
  const foot = (conquest || honor) ? `<tfoot><tr><td colspan="4">Still to buy for BiS</td><td class="cost">${conquest ? `<span class="cost conq">${conquest.toLocaleString()} Conq</span>` : ''}${conquest && honor ? '<br>' : ''}${honor ? `<span class="cost hon">${honor.toLocaleString()} Honor</span>` : ''}</td></tr></tfoot>` : '';
  return `<div class="sec">${head}<table class="gear"><thead><tr><th>Slot</th><th>Equipped</th><th style="text-align:right">ilvl</th><th>BiS</th><th style="text-align:right">Cost</th></tr></thead><tbody>${rows}</tbody>${foot}</table></div>`;
}

const openCard = (() => { try { return JSON.parse(localStorage.getItem('wowOpenCard') || '{}'); } catch (e) { return {}; } })();
const isOpen = c => openCard[c.pvp ? 'pvp' : 'pve'] === c.name;

function pvpTotals(c) {
  const gear = (c.gear || []).filter(g => g.bis);
  const twoHand = !gear.some(g => g.slot === 'Off hand');
  let conquest = 0, need = 0, crafted = 0;
  gear.forEach(g => {
    if (g.status === 'Have') return;
    need++;
    const base = g.slot === 'Main hand' ? (twoHand ? 1750 : 875) : SLOT_COST[g.slot] || 0;
    if (/Conquest|Tier/i.test(g.source)) conquest += base;
    else if (/Competitor/i.test(g.bis)) crafted++;
  });
  return { conquest, need, crafted, total: gear.length };
}

function pvpCard(c) {
  const open = isOpen(c);
  const sh = (c.brackets || []).find(b => /shuffle/i.test(b.bracket));
  const val = sh && sh.rating ? sh.rating : '';
  const t = pvpTotals(c);
  const wk = STATE.weekly || { characters: [], rows: [] };
  const col = wk.characters.indexOf(c.name);
  const wrows = col < 0 ? [] : wk.rows.filter(r => r.cells[col] !== null && r.cells[col] !== undefined);
  const wdone = wrows.filter(r => r.cells[col]).length;
  const rating = canEdit()
    ? `<input type="number" class="rating-input" min="0" data-pvp="${esc(c.name)}|shuffle" value="${esc(val)}" placeholder="-" title="Current Solo Shuffle rating">`
    : `<div class="big">${esc(val || '-')}</div>`;
  return `<div class="char pvpc${open ? ' open' : ''}" style="--accent:${accentFor(c.cls)};${classBg(c.cls)}" data-pvpcard="${esc(c.name)}">
    <div class="pvp-sum">
      <div class="char-head"><div><div class="name-row">${classIcon(c.cls)}<span class="char-name">${esc(c.name)}</span>${profileLinks(c.name)}</div><div class="char-meta meta-row">${esc(c.cls)}<button type="button" class="toggle-btn" data-cardtoggle="${esc(c.name)}">${open ? 'Collapse' : 'Expand'} <span class="chev">&#9662;</span></button></div>
          <div class="spec-tags">${(c.main || []).map(m => `<span class="spec-tag">${esc(m)}</span>`).join('')}</div></div>
        <div class="headline-row"><div class="headline"><div class="lbl">Shuffle</div>${rating}</div>
          <div class="headline"><div class="lbl">ilvl</div><div class="big">${f2(c.ilvl)}</div></div></div></div>
      <div class="sec">${bisBlock(c)}</div>
      <div class="minis">
        <div class="mini"><div class="k">Pieces to get</div><div class="v">${t.total ? t.need + ' / ' + t.total : '-'}</div></div>
        <div class="mini"><div class="k">Conquest to BiS</div><div class="v conq">${t.conquest ? t.conquest.toLocaleString() : (t.total ? '0' : '-')}</div></div>
        <div class="mini"><div class="k">Crafted pieces</div><div class="v craft">${t.total ? t.crafted : '-'}</div></div>
        <div class="mini"><div class="k">This week</div><div class="v${wrows.length && wdone === wrows.length ? ' ok' : ''}">${wrows.length ? wdone + ' / ' + wrows.length : '-'}</div></div>
      </div>
    </div>
    <div class="pvp-more"><div class="pvp-more-grid"><div>${weeklyChecks(c) || '<div class="sec"><p class="empty">No weekly checks.</p></div>'}</div><div>${gearBlock(c)}</div></div>
      <div class="foot">Gear pulled ${esc(c.pulled || '-')}</div></div>
  </div>`;
}

function pveCard(c) {
  const open = isOpen(c);
  const mp = String(c.rating || '').replace(/^M\+\s*/, '');
  const raid = (STATE.needs || []).filter(n => n.character === c.name && n.kind === 'Gear' && bossOf(n.source));
  const items = new Set(raid.map(n => n.needed)).size;
  const bossCount = {};
  raid.forEach(n => { const b = bossOf(n.source); bossCount[b] = (bossCount[b] || new Set()).add(n.needed); });
  const top = Object.entries(bossCount).sort((a, b) => b[1].size - a[1].size || BOSS_ORDER.indexOf(a[0]) - BOSS_ORDER.indexOf(b[0]))[0];
  const ench = [...(c.enchants || []), ...(c.gems || [])];
  const bad = ench.filter(e => e.status === 'Missing').length, warn = ench.filter(e => e.status === 'Different').length;
  const wk = STATE.weekly || { characters: [], rows: [] };
  const col = wk.characters.indexOf(c.name);
  const wrows = col < 0 ? [] : wk.rows.filter(r => r.cells[col] !== null && r.cells[col] !== undefined);
  const wdone = wrows.filter(r => r.cells[col]).length;
  const issues = bad + warn;
  return `<div class="char pvpc${open ? ' open' : ''}" style="--accent:${accentFor(c.cls)};${classBg(c.cls)}" data-pvpcard="${esc(c.name)}">
    <div class="pvp-sum">
      <div class="char-head"><div><div class="name-row">${classIcon(c.cls)}<span class="char-name">${esc(c.name)}</span>${profileLinks(c.name)}</div><div class="char-meta meta-row">${esc(c.cls)}<button type="button" class="toggle-btn" data-cardtoggle="${esc(c.name)}">${open ? 'Collapse' : 'Expand'} <span class="chev">&#9662;</span></button></div></div>
        <div class="headline-row"><div class="headline"><div class="lbl">M+ rating</div><div class="big">${f1(mp)}</div></div>
          <div class="headline"><div class="lbl">ilvl</div><div class="big">${f2(c.ilvl)}</div></div></div></div>
      <div class="sec">${bisBlock(c)}</div>
      ${vaultBlock(c)}
      <div class="minis">
        <div class="mini"><div class="k">Raid items</div><div class="v">${(STATE.needs || []).length ? items : '-'}</div></div>
        <div class="mini" ${top ? `data-tip="${esc(top[0])}: ${top[1].size} item${top[1].size === 1 ? '' : 's'}"` : ''}><div class="k">Top boss</div><div class="v" style="font-size:13px;line-height:21px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${top ? esc(top[0]) + ' (' + top[1].size + ')' : '-'}</div></div>
        <div class="mini"><div class="k">Enchants &amp; gems</div><div class="v${ench.length && !issues ? ' ok' : ''}" style="${bad ? 'color:var(--bad)' : warn ? 'color:var(--warn)' : ''}">${ench.length ? (issues ? `${bad ? bad + ' missing' : ''}${bad && warn ? ', ' : ''}${warn ? warn + ' diff' : ''}` : 'All set') : '-'}</div></div>
        <div class="mini"><div class="k">This week</div><div class="v${wrows.length && wdone === wrows.length ? ' ok' : ''}">${wrows.length ? wdone + ' / ' + wrows.length : '-'}</div></div>
      </div>
      ${c.logs && !c.logs.error ? `<div class="logs-line"><span>Logs</span><span data-tip="Raid by item level">Raid ilvl${pctHtml(c.logs.raidAvg)}</span><span data-tip="Mythic+ by key level">M+ key${pctHtml(c.logs.dungeonAvg)}</span>${c.logs.raidAvgAll != null || c.logs.dungeonAvgAll != null ? `<span data-tip="Compared with every player of the spec">Overall R${pctHtml(c.logs.raidAvgAll)} M+${pctHtml(c.logs.dungeonAvgAll)}</span>` : ''}</div>` : ''}
    </div>
    <div class="pvp-more">${logsBlock(c)}<div class="pvp-more-grid" style="grid-template-columns:1fr 1fr"><div>${killsBlock(c)}${targetsBlock(c)}</div><div>${enchantBlock(c)}${weeklyChecks(c)}</div></div>
      <div class="foot">Gear pulled ${esc(c.pulled || '-')}</div></div>
  </div>`;
}

function miniCard(c) {
  let stat;
  if (c.pvp) {
    const sh = (c.brackets || []).find(b => /shuffle/i.test(b.bracket));
    stat = `<span>Shuffle <b>${esc(sh && sh.rating ? sh.rating : '-')}</b></span>`;
  } else stat = `<span>M+ <b>${f1(String(c.rating || '').replace(/^M\+\s*/, ''))}</b></span>`;
  return `<div class="mini-card" style="--accent:${accentFor(c.cls)};${classBg(c.cls)}">
    <div class="name-row"><span style="display:flex;align-items:center">${classIcon(c.cls, 'sm')}<span class="char-name">${esc(c.name)}</span></span><button type="button" class="toggle-btn" data-cardtoggle="${esc(c.name)}">Expand <span class="chev">&#9662;</span></button></div>
    <div class="char-meta">${esc(c.cls)} ${profileLinks(c.name)}</div>
    <div class="mc-stats">${stat}<span>ilvl <b>${f2(c.ilvl)}</b></span></div></div>`;
}

function sectionHtml(list, key) {
  const open = list.find(c => openCard[key] === c.name && !c.error);
  if (!open) return { cls: '', html: list.map(charCard).join('') };
  return { cls: 'has-open', html: charCard(open) + list.filter(c => c !== open).map(c => c.error ? charCard(c) : miniCard(c)).join('') };
}

function charCard(c) {
  if (c.pvp && !c.error) return pvpCard(c);
  if (!c.error) return pveCard(c);
  if (c.error) return `<div class="char"><div class="char-name">${esc(c.name)}</div><p class="empty">Could not read this sheet: ${esc(c.error)}</p></div>`;
  let headline;
  if (c.pvp) {
    const sh = (c.brackets || []).find(b => /shuffle/i.test(b.bracket));
    const val = sh && sh.rating ? sh.rating : '';
    headline = `<div class="headline-row"><div class="headline"><div class="lbl">Shuffle</div>
        ${canEdit() ? `<input type="number" class="rating-input" min="0" data-pvp="${esc(c.name)}|shuffle" value="${esc(val)}" placeholder="-" title="Current Solo Shuffle rating">` : `<div class="big">${esc(val || '-')}</div>`}</div>
      <div class="headline"><div class="lbl">ilvl</div><div class="big">${f2(c.ilvl)}</div></div></div>`;
  } else {
    const mp = String(c.rating || '').replace(/^M\+\s*/, '');
    headline = `<div class="headline-row"><div class="headline"><div class="lbl">M+ rating</div><div class="big">${f1(mp)}</div></div>
      <div class="headline"><div class="lbl">ilvl</div><div class="big">${f2(c.ilvl)}</div></div></div>`;
  }
  return `<div class="char" style="--accent:${accentFor(c.cls)}">
    <div class="char-head"><div><div class="char-name">${esc(c.name)}</div><div class="char-meta">${esc(c.cls)}</div></div>${headline}</div>
    <div class="sec">${bisBlock(c)}</div>
    ${c.pvp ? '' : vaultBlock(c)}
    ${weeklyChecks(c)}
    ${c.pvp ? gearBlock(c) : targetsBlock(c) + enchantBlock(c)}
    <div class="foot">Gear pulled ${esc(c.pulled || '-')}</div>
  </div>`;
}

function levelBar(t) {
  const lv = Number(t.level) || 0;
  const val = canEdit()
    ? `<input type="number" min="1" max="90" data-level="${t.row}" value="${lv || ''}" placeholder="?" title="Current level">`
    : `<b style="color:var(--text-strong)">${lv || '?'}</b>`;
  return `<div class="lv"><span>Level</span>${val}<span>/ 90</span><div class="meter"><div style="width:${Math.round(lv / 90 * 100)}%"></div></div></div>`;
}

function todoRow(t) {
  const toonAcct = accountOf(t.character);
  const who = toonAcct
    ? `<span class="toon" style="color:${CHAR_COLOR[t.character] || '#ddd'}">${esc(t.character)}</span><span class="acct">${esc(toonAcct)}</span>`
    : ALTS.includes(t.character) ? `<span class="toon">${esc(t.character)}</span>`
    : `<span class="acct">${esc(t.character || 'General')}</span>`;
  return `<div class="todo${t.done ? ' done' : ''}">
    <input type="checkbox" data-todo="${t.row}"${t.done ? ' checked' : ''}${DIS()} aria-label="Done">
    <span class="pri ${esc(t.priority)}">${esc(t.priority || '-')}</span>
    <div class="who">${who}</div>
    <div><span class="task">${esc(t.task)}</span>${t.repeats && t.repeats !== 'None' ? `<span class="rep">&#8635; ${esc(t.repeats)}</span>` : ''}
      ${t.notes ? `<div class="note">${esc(t.notes)}</div>` : ''}${t.category === 'Leveling' ? levelBar(t) : ''}</div>
  </div>`;
}

/* ------------------------------------------------------------------ lite tiles (guests and friends' rosters) */
const liteOpen = new Set((() => { try { return JSON.parse(localStorage.getItem('wowLiteOpen') || '[]'); } catch (e) { return []; } })());

function weeklyRunsBlock(c) {
  const runs = (c.weeklyRuns || []).slice().sort((a, b) => b.level - a.level);
  return `<div class="sec"><div class="sec-title"><span>Mythic+ this week</span><span class="hint">${runs.length} run${runs.length === 1 ? '' : 's'}</span></div>` +
    (runs.length ? `<div class="wruns">${runs.map(r => `<div class="wrun"><span class="lvl">+${r.level}</span><span class="wd">${esc(r.dungeon)}</span><span class="${r.timed ? 'ok' : 'no'}">${r.timed ? '&#10003; timed' : 'over time'}</span></div>`).join('')}</div>`
      : '<p class="empty">No keys run since the Tuesday reset.</p>') + `</div>`;
}

function bestRunsBlock(c) {
  const runs = (c.mplusRuns || []).slice().sort((a, b) => b.score - a.score);
  if (!runs.length) return '';
  return `<div class="sec"><div class="sec-title"><span>Best run per dungeon</span><span class="hint">season</span></div>` +
    runs.map(r => `<div class="run"><div>${esc(r.dungeon)} <span class="spec">${esc(r.spec || '')}</span></div><span class="lvl">+${r.level}</span><span class="score">${Number(r.score).toFixed(1)}</span></div>`).join('') + `</div>`;
}

function liteEnchants(c) {
  const miss = c.missingEnchants || [];
  return `<div class="ench-summary">${miss.length ? `<span class="pill bad">Missing enchant: ${esc(miss.map(slotName).join(', '))}</span>` : (c.missingEnchants ? '<span class="pill ok">Enchants OK</span>' : '')}${c.gemCount != null ? (c.diamond ? '<span class="pill ok">Eversong Diamond</span>' : '<span class="pill bad">No Eversong Diamond</span>') : ''}</div>`;
}

/* BiS sections for guests (from the guest sheet's BiS list) */
function guestBis(g) {
  const gear = (g.gear || []).filter(x => x.bis);
  if (!gear.length) return { bar: `<p class="empty">No BiS list yet: add it on the guest's tab.</p>`, more: '' };
  const have = gear.filter(x => x.have).length, pct = Math.round(have / gear.length * 100);
  const bar = `<div class="bis"><div class="bis-label"><span>${esc(g.spec || '')} BiS</span><span>${have} / ${gear.length}</span></div><div class="meter"><div style="width:${pct}%"></div></div></div>`;
  const need = gear.filter(x => !x.have);
  const byBoss = {};
  need.forEach(x => { const b = bossOf(x.source); if (b) (byBoss[b] = byBoss[b] || []).push(x); });
  const rolls = BOSS_ORDER.filter(b => byBoss[b]);
  const rollBlock = `<div class="sec"><div class="sec-title"><span>Bonus roll targets</span><span class="hint">raid order</span></div>` +
    (rolls.length ? `<div class="targets">${rolls.map(b => { const k = (g.raidKills || []).find(x => x.boss === b);
      return `<div class="target"><span class="boss">${esc(b)}</span>${k ? ' <span class="kdone">&#10003; Killed ' + ['LFR', 'NORMAL', 'HEROIC', 'MYTHIC'].filter(d => (k.diffs || []).includes(d)).map(d => `<span class="dbadge" style="color:${DIFF[d][1]};border-color:${DIFF[d][1]}">${DIFF[d][0]}</span>`).join('') + '</span>' : ''}<div class="need-grid one-line" style="grid-template-columns:72px minmax(0,1fr);margin-top:3px">${byBoss[b].map(x =>
      `<span class="slot">${esc(slotName(x.slot))}</span><span>${esc(x.bis)}</span>`).join('')}</div></div>`; }).join('')}</div>` : `<p class="empty">No raid drops needed.</p>`) + `</div>`;
  const other = need.filter(x => !bossOf(x.source));
  const otherBlock = other.length ? `<div class="sec"><div class="sec-title"><span>Other BiS still needed</span></div><div class="need-grid one-line" style="grid-template-columns:72px minmax(0,1fr) auto">${other.map(x =>
    `<span class="slot">${esc(slotName(x.slot))}</span><span>${esc(x.bis)}</span><span class="specs-tag">${esc(x.source)}</span>`).join('')}</div></div>` : '';
  return { bar, more: rollBlock + otherBlock };
}

/* BiS for a character on a friend's page: a BiS tab (bisList) or one of your own toons (bisSets, one per spec) */
const friendBisSpec = (() => { try { return JSON.parse(localStorage.getItem('wowFriendBis') || '{}'); } catch (e) { return {}; } })();
function friendBis(c) {
  if (c.bisList) return guestBis({ gear: c.bisList, spec: c.spec, raidKills: c.raidKills });
  const sets = c.bisSets || [];
  if (!sets.length) return null;
  const set = sets.find(x => x.spec === friendBisSpec[c.name]) || sets.find(x => x.spec === c.mainSpec) || sets[0];
  // Same blocks as guests: need list -> bonus roll targets and other BiS; the bar uses the sheet's own count
  const g = guestBis({ gear: set.need.map(n => ({ slot: n.slot, bis: n.bis, source: n.source, have: false })), spec: set.spec, raidKills: c.raidKills });
  // Every spec gets its own bar; click one to show that spec's bonus roll targets when expanded
  const bar = sets.map(x => { const pct = x.total ? Math.round(x.have / x.total * 100) : 0;
    return `<div class="bis bis-pick${sets.length > 1 && x === set ? ' on' : ''}"${sets.length > 1 ? ` data-friendbis="${esc(c.name + '|' + x.spec)}" data-tip="Show ${esc(x.spec)} bonus roll targets"` : ''}><div class="bis-label"><span>${specLetters([x.spec])} ${esc(x.spec)} BiS</span><span>${x.have} / ${x.total}</span></div><div class="meter"><div style="width:${pct}%"></div></div></div>`; }).join('');
  return { bar, rows: sets.length, more: (sets.length > 1 ? `<div class="hint" style="margin:4px 0 2px">Targets for ${esc(set.spec)} (click a BiS bar to switch)</div>` : '') + (set.need.length ? g.more : `<p class="empty">Full BiS for ${esc(set.spec)}.</p>`) };
}

/* One collapsible tile with everything known about a character that has no tracker sheet */
function liteCard(c, key, opts) {
  if (c.error && !c.cls) return `<div class="char"><div class="char-name">${esc(c.name)}</div><p class="empty">${esc(c.error)}</p></div>`;
  const id = key + '|' + c.name, open = liteOpen.has(id);
  const kills = (c.raidKills || []).length;
  const runs = (c.weeklyRuns || []).length;
  const L = c.logs && !c.logs.error ? c.logs : null;
  const bis = opts && opts.guest ? guestBis(c) : opts && opts.friend ? friendBis(c) : null;
  return `<div class="char pvpc lite${open ? ' open' : ''}" style="--accent:${accentFor(c.cls)};${classBg(c.cls)}">
    <div class="pvp-sum">
      <div class="char-head"><div><div class="name-row">${classIcon(c.cls)}<span class="char-name">${esc(c.name)}</span>${profileLinks(c.name, c.realm)}</div>
          <div class="char-meta meta-row">${esc([c.spec, c.cls].filter(Boolean).join(' '))}${c.realm && c.realm !== 'eldrethalas' ? ' &middot; ' + esc(c.realm) : ''}<button type="button" class="toggle-btn" data-litetoggle="${esc(id)}">${open ? 'Collapse' : 'Expand'} <span class="chev">&#9662;</span></button></div></div>
        <div class="headline-row"><div class="headline"><div class="lbl">M+ rating</div><div class="big">${f1(c.score)}</div></div>
          <div class="headline"><div class="lbl">ilvl</div><div class="big">${f2(c.ilvl)}</div></div></div></div>
      ${bis ? `<div class="sec bis-stack" style="min-height:${(opts.bisRows || 1) * 34}px">${bis.bar}</div>` : opts && opts.bisRows ? `<div class="sec bis-stack" style="min-height:${opts.bisRows * 34}px"><p class="empty">No BiS list yet.</p></div>` : ''}
      ${vaultBlock(c)}
      <div class="minis">
        <div class="mini"><div class="k">Raid bosses</div><div class="v">${c.raidKills ? kills + ' / 10' : '-'}</div></div>
        <div class="mini"><div class="k">Keys this week</div><div class="v">${runs}</div></div>
        <div class="mini"><div class="k">Logs raid</div><div class="v">${L ? pctHtml(L.raidAvg) : '-'}</div></div>
        <div class="mini"><div class="k">Logs M+</div><div class="v">${L ? pctHtml(L.dungeonAvg) : '-'}</div></div>
      </div>
      <div style="margin-top:8px">${liteEnchants(c)}</div>
    </div>
    <div class="pvp-more">${logsBlock(c)}<div class="pvp-more-grid" style="grid-template-columns:1fr 1fr">
      <div>${killsBlock(c)}${bis ? bis.more : ''}</div><div>${weeklyRunsBlock(c)}${bestRunsBlock(c)}</div></div>
      <div class="foot">Updated ${esc(c.pulled || '-')}</div></div>
  </div>`;
}

function guestCard(g) { return liteCard(g, 'guest', { guest: true }); }

/* ------------------------------------------------------------------ Mythic+ teams */
const GOAL = 3600, PER_DUNGEON = 450;
const CLASS_HEX = { 'demon hunter': '#c27be0', 'death knight': '#ff5c75', 'druid': '#ff9d4d', 'mage': '#3fc7eb', 'warrior': '#c69b6d',
  'paladin': '#f48cba', 'hunter': '#aad372', 'rogue': '#fff468', 'priest': '#ffffff', 'shaman': '#3d9bff', 'warlock': '#8788ee', 'monk': '#00ff98', 'evoker': '#33c3a0' };
const classHex = cls => CLASS_HEX[String(cls || '').toLowerCase()] || '#ddd';
let openTeam = (() => { try { return localStorage.getItem('wowOpenTeam') || ''; } catch (e) { return ''; } })();
const teamPick = (() => { try { return JSON.parse(localStorage.getItem('wowTeamPick') || '{}'); } catch (e) { return {}; } })();
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
const openDungeon = new Set((() => { try { return JSON.parse(localStorage.getItem('wowOpenDungeon') || '[]'); } catch (e) { return []; } })());
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
function renderAll() { if (STATE) render(STATE, LIVE, WHEN); }

function render(state, live, when) {
  STATE = state; LIVE = live; WHEN = when;
  const data = fromGrid(state.dashboard || []);
  $('reset').textContent = data.reset || '';
  $('src').className = 'src ' + (live ? 'live' : 'snap');
  $('src').textContent = live ? 'Live from Google Sheets' : 'Snapshot';
  $('when').textContent = (live ? 'Loaded ' : 'Taken ') + when;

  const isText = v => isNaN(Number(v)) && v.length > 12;
  const chars = state.characters || [];
  const vaultChars = chars.filter(c => c.vault);
  const glance = data.glance.slice();
  if (vaultChars.length) {
    const open = vaultChars.reduce((n, c) => n + c.vault.reduce((m, v) => m + (v.thresholds || []).filter(t => v.done >= t).length, 0), 0);
    glance.push(['Great Vault slots unlocked', open + ' / ' + vaultChars.length * 9]);
  }
  const nums = glance.filter(([, v]) => !isText(v)), texts = glance.filter(([, v]) => isText(v));
  $('glance').style.gridTemplateColumns = window.innerWidth > 900 ? `repeat(${nums.length || 1}, 1fr)` : '';
  $('glance').innerHTML = [...nums, ...texts].map(([k, v]) =>
    `<div class="stat-box${isText(v) ? ' wide full' : ''}"><h3>${esc(k)}</h3><p>${esc(v || '-')}</p></div>`).join('');

  const byOrder = order => (a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99);
  const pve = chars.filter(c => !c.pvp).sort(byOrder(PVE_ORDER)), pvp = chars.filter(c => c.pvp);
  const accts = list => [...new Set(list.map(c => c.account || accountOf(c.name)))].filter(Boolean).join(', ');
  $('pve-acct').textContent = accts(pve);
  $('pvp-acct').textContent = accts(pvp);
  for (const [id, list] of [['pve', pve], ['pvp', pvp]]) {
    const sec = sectionHtml(list, id);
    $(id).className = 'chars' + (id === 'pvp' ? ' pvp-grid' : '') + (sec.cls ? ' ' + sec.cls : '');
    $(id).innerHTML = sec.html;
  }

  const todos = state.todo || [];

  // To-Do
  const counts = { Open: todos.filter(t => !t.done).length, Done: todos.filter(t => t.done).length, All: todos.length };
  $('todo-filters').innerHTML = Object.keys(counts).map(f =>
    `<button type="button" class="chip${f === todoFilter ? ' on' : ''}" data-filter="${f}">${f} (${counts[f]})</button>`).join('');
  const prio = { High: 0, Medium: 1, Low: 2 };
  const sortT = (a, b) => (a.done - b.done) || ((prio[a.priority] ?? 3) - (prio[b.priority] ?? 3)) || (a.row - b.row);
  // Daily and weekly tasks reset on their own, so they stay listed (struck through) when done.
  const own = t => t.category === 'Crafters' || t.category === 'Leveling';
  const groups = [
    ['Overall & account wide', '', t => !own(t) && (!t.repeats || t.repeats === 'None'), true],
    ['Daily', 'Resets every day at 10 AM Central', t => !own(t) && t.repeats === 'Daily', false],
    ['Weekly', 'Resets Tuesdays at 10 AM Central', t => !own(t) && t.repeats === 'Weekly', false],
    ['Crafters: weekly knowledge', 'Resets Tuesdays at 10 AM Central', t => t.category === 'Crafters', false],
    ['Leveling to 90', '', t => t.category === 'Leveling', true],
  ];
  $('todo').innerHTML = groups.map(([title, hint, test, filtered]) => {
    let list = todos.filter(test);
    const left = list.filter(t => !t.done).length;
    if (todoFilter === 'Done') list = list.filter(t => t.done);
    else if (todoFilter === 'Open' && filtered) list = list.filter(t => !t.done);
    list.sort(sortT);
    return `<div class="todo-group"><h3>${esc(title)} <span class="hint">${left} open${hint ? ' &middot; ' + hint : ''}</span></h3>` +
      (list.length ? list.map(todoRow).join('') : `<p class="empty" style="padding:6px 0">Nothing here.</p>`) + `</div>`;
  }).join('');
  $('addform').style.display = canEdit() ? '' : 'none';

  // Bonus rolls: grouped by instance, planned order, who needs what from the needs list
  const bonus = (state.bonus || []).slice().sort((a, b) => BOSS_ORDER.indexOf(a.boss) - BOSS_ORDER.indexOf(b.boss));
  const needsFor = boss => {
    const m = {};
    (state.needs || []).filter(n => n.kind === 'Gear' && String(n.source).startsWith(boss)).forEach(n => {
      const k = n.character + '|' + n.needed;
      m[k] = m[k] || { c: n.character, item: n.needed, slot: n.slot, specs: new Set() };
      m[k].specs.add(n.spec);
    });
    return Object.values(m).sort((a, b) => PLAN_CHARS.indexOf(a.c) - PLAN_CHARS.indexOf(b.c));
  };
  let totalRolls = 0;
  const body = INSTANCE_ORDER.map(inst => {
    const rows = bonus.filter(b => b.instance === inst);
    if (!rows.length) return '';
    return `<tr class="group"><td colspan="5">${esc(inst)}</td></tr>` + rows.map(b => {
      totalRolls += parseInt(b.rolls, 10) || 0;
      const list = needsFor(b.boss);
      const who = list.length ? `<div class="need-grid">${list.map(n => `<span style="display:inline-flex;align-items:center;gap:6px">${killBox(n.c, b.boss)}${colored(n.c)}</span><span class="slot">${esc(slotName(n.slot))}</span><span>${esc(n.item)}</span><span class="specs-tag">${esc([...n.specs].join(', '))}</span>`).join('')}</div>` : '<span class="empty">-</span>';
      const chosen = !!b.plan, sug = b.suggested || '';
      const opts = `<option value="">${!chosen && sug ? 'Suggested: ' + esc(sug) : ''}</option>` + PLAN_CHARS.map(c => `<option${c === b.plan ? ' selected' : ''}>${esc(c)}</option>`).join('');
      return `<tr><td>${esc(b.boss)}</td><td class="num">${list.length}</td><td>${who}</td>
        <td><select class="plan ${chosen ? 'chosen' : (sug ? 'suggested' : '')}" data-plan="${b.row}"${DIS()}>${opts}</select></td>
        <td class="cb"><input type="number" min="0" max="20" step="1" style="width:64px" data-rolls="${b.row}" value="${esc(b.rolls)}"${DIS()}></td></tr>`;
    }).join('');
  }).join('');
  // Dungeon drops (no bonus-roll plan here; listed so every BiS source is in one place)
  const dung = {};
  (state.needs || []).filter(n => n.kind === 'Gear').forEach(n => {
    const si = srcInfo(n.source);
    if (si.type !== 'dungeon') return;
    const d = (dung[si.place] = dung[si.place] || {});
    const b = (d[si.boss] = d[si.boss] || {});
    const k = n.character + '|' + n.needed;
    b[k] = b[k] || { c: n.character, item: n.needed, slot: n.slot, specs: new Set() };
    b[k].specs.add(n.spec);
  });
  const dungBody = Object.keys(dung).sort().map(place => `<tr class="group"><td colspan="5">${esc(place)} &middot; Mythic+ dungeon</td></tr>` +
    Object.entries(dung[place]).map(([boss, m]) => {
      const list = Object.values(m).sort((a, b) => PLAN_CHARS.indexOf(a.c) - PLAN_CHARS.indexOf(b.c));
      return `<tr><td>${esc(boss)}</td><td class="num">${list.length}</td><td><div class="need-grid">${list.map(n => `${colored(n.c)}<span class="slot">${esc(slotName(n.slot))}</span><span>${esc(n.item)}</span><span class="specs-tag">${esc([...n.specs].join(', '))}</span>`).join('')}</div></td><td><span class="hint">Run the dungeon / M+ vault</span></td><td></td></tr>`;
    }).join('')).join('');
  $('bonus').innerHTML = `<thead><tr><th>Source</th><th class="num">Items</th><th>Who needs what</th><th>Plan (who rolls)</th><th class="cb">Rolls this week</th></tr></thead><tbody>` +
    (body || `<tr><td colspan="5" class="empty">Loads with live data.</td></tr>`) + dungBody +
    `<tr><td colspan="4"><b>Total rolls planned</b></td><td class="cb"><b>${totalRolls}</b></td></tr></tbody>`;

  // Per-character view: each toon's BiS from raids and dungeons, grouped by instance and boss, with who is set to roll there
  const bossInst = {};
  (state.bonus || []).forEach(b => { bossInst[b.boss] = b; });
  const gearNeeds = name => {
    const m = {};
    (state.needs || []).filter(n => n.character === name && n.kind === 'Gear').forEach(n => {
      const k = n.slot + '|' + n.needed;
      m[k] = m[k] || { item: n.needed, slot: n.slot, source: n.source, si: srcInfo(n.source), specs: new Set() };
      m[k].specs.add(n.spec);
    });
    return Object.values(m);
  };
  // One line per item: slot, item (cut off with ... if long; hover for the full name and source), optional chip, spec letters
  const itemGrid = (c, list, extra) => `<div class="irows">${list.map(i => {
    const main = [...i.specs].some(sp => isMainSpec(c, sp));
    const x = extra ? extra(i) : {};
    const tip = `${i.item}${i.source ? ' &middot; ' + i.source : ''}&lt;br&gt;${[...i.specs].join(', ')}`;
    return `<div class="irow" data-tip="${esc(x.tip ? tip + '&lt;br&gt;' + x.tip : tip)}">${x.pre || ''}<span class="slot">${esc(slotName(i.slot))}</span><span class="iname ${main ? 'main-item' : ''}">${main ? '&#9733; ' : ''}${esc(x.name || i.item)}</span>${x.chip ? `<span class="ichip">${esc(x.chip)}</span>` : ''}<span class="spl">${specLetters([...i.specs])}</span></div>`;
  }).join('')}</div>`;
  const byMain = c => (x, y) => [...y.specs].some(sp => isMainSpec(c, sp)) - [...x.specs].some(sp => isMainSpec(c, sp));
  const charOf = name => chars.find(x => x.name === name) || { name, cls: '' };

  $('bonus-char').innerHTML = PVE_ORDER.map(name => {
    const c = charOf(name), all = gearNeeds(name);
    const raid = all.filter(i => i.si.type === 'raid'), dng = all.filter(i => i.si.type === 'dungeon');
    // Raids: instance > boss, in boss order
    let lastInst = '';
    const raidHtml = BOSS_ORDER.filter(b => raid.some(i => i.si.boss === b)).map(b => {
      const row = bossInst[b] || {};
      const roller = row.plan || row.suggested || '';
      const tag = !roller ? '' : roller === name
        ? `<span class="roll-tag ${row.plan ? 'chosen' : 'suggested'}">${row.plan ? '&#127922; rolling here' : 'suggested roll'}</span>`
        : `<span class="roll-tag other">${esc(roller)} rolls</span>`;
      const inst = row.instance || '';
      const head = inst && inst !== lastInst ? `<div class="bc-inst">${esc(inst)}</div>` : '';
      lastInst = inst || lastInst;
      const k = killOf(name, b);
      const status = k ? `<span class="kdone">&#10003; Killed ${diffBadges(k)}</span>` : `<span class="ktodo">Not killed</span>`;
      return head + `<div class="bc-boss ${k ? 'killed' : 'notkilled'}"><div class="top"><span class="b">${esc(b)}</span><span style="display:inline-flex;gap:6px;align-items:center">${status}${tag}</span></div>${itemGrid(c, raid.filter(i => i.si.boss === b).sort(byMain(c)))}</div>`;
    }).join('');
    // Dungeons: dungeon > boss
    const places = [...new Set(dng.map(i => i.si.place))].sort();
    const dngHtml = places.map(pl => `<div class="bc-inst">${esc(pl)}</div>` +
      [...new Set(dng.filter(i => i.si.place === pl).map(i => i.si.boss))].map(b =>
        `<div class="bc-boss"><div class="top"><span class="b">${esc(b)}</span></div>${itemGrid(c, dng.filter(i => i.si.place === pl && i.si.boss === b).sort(byMain(c)))}</div>`).join('')).join('');
    const count = raid.length + dng.length;
    return `<div class="bc" style="--accent:${accentFor(c.cls)}"><div class="bc-head"><span class="n" style="color:${CHAR_COLOR[name] || '#fff'}">${esc(name)}</span><span class="hint">${count} drop${count === 1 ? '' : 's'} needed</span></div>
      <div class="bc-cat"><span>Raids</span><span class="hint">${raid.length}</span></div>${raidHtml || '<p class="empty">No raid drops needed.</p>'}
      <div class="bc-cat"><span>Dungeons</span><span class="hint">${dng.length}</span></div>${dngHtml || '<p class="empty">No dungeon drops needed.</p>'}</div>`;
  }).join('');

  // Per-vault view: which Great Vault row can give each toon what they still need
  const VROWS = [['raid', 'Raid', 'raid'], ['mplus', 'Dungeon', 'dungeon'], ['world', 'World', 'world']];
  $('bonus-vault').innerHTML = PVE_ORDER.map(name => {
    const c = charOf(name), all = gearNeeds(name);
    const tier = all.filter(i => i.si.type === 'tier'), cat = all.filter(i => i.si.type === 'catalyst');
    const sections = VROWS.map(([kind, label, type]) => {
      const v = (c.vault || []).find(x => x.kind === kind);
      const tiles = v ? `<div class="vtiles">${v.thresholds.map((t, i) => {
        const on = v.done >= t;
        return `<div class="tile${on ? ' on' : ''}"><b>${on ? '&#10003; ' : ''}Slot ${i + 1}</b>${on ? esc(String(v.slots[i] || '').replace(/^\+\d+:\s*/, '')) : esc(t + (kind === 'raid' ? ' bosses' : kind === 'mplus' ? ' runs' : ' done'))}</div>`;
      }).join('')}</div>` : '';
      const open = v ? v.thresholds.filter(t => v.done >= t).length : 0;
      const direct = all.filter(i => i.si.type === type).sort(byMain(c));
      // Raid vault only offers loot from bosses killed this week
      const raidMark = i => { const k = killOf(name, i.si.boss);
        return { pre: `<span class="vmark ${k ? 'ok' : 'no'}">${k ? '&#10003;' : '&#10005;'}</span>`,
          tip: k ? 'In your vault pool: ' + i.si.boss + ' killed this week' : 'Not in your vault yet: kill ' + i.si.boss + ' this week' }; };
      // Catalyst: any item in that slot, ideally with the spec's top two secondary stats
      const FULL = { Crit: 'Critical Strike', Vers: 'Versatility' };
      const catMark = i => { const sp = [...i.specs][0], st = (SPEC_STATS[String(sp).replace(/ PvP$/, '')] || []).slice(0, 2).map(x => FULL[x] || x);
        return { chip: 'Catalyst', name: st.length ? st.join(' & ') : 'Your best stats',
          tip: `Any ${slotName(i.slot).toLowerCase()} with ${st.join(' and ') || 'your best stats'}, then convert it at the Catalyst into ${i.item}` }; };
      let list = direct.length ? itemGrid(c, direct, kind === 'raid' ? raidMark : null) : '';
      let killLine = '';
      if (kind === 'raid' && direct.length) {
        // Bosses still to kill, grouped by raid in raid / boss order
        const toKill = BOSS_ORDER.filter(b => direct.some(i => i.si.boss === b) && !killOf(name, b));
        const byRaid = {};
        toKill.forEach(b => { const r = (bossInst[b] || {}).instance || 'Other'; (byRaid[r] = byRaid[r] || []).push(b); });
        killLine = `<div class="vneed">${toKill.length
          ? '<span class="vneed-h">Still to kill this week</span>' + INSTANCE_ORDER.concat(['Other']).filter(r => byRaid[r]).map(r => `<div><span class="hint">${esc(r)}:</span> ${byRaid[r].map(b => `<b>${esc(b)}</b>`).join(', ')}</div>`).join('')
          : '<span style="color:var(--ok)">Every boss on this list is killed: all can show up in your vault</span>'}</div>`;
      }
      const pad = kind === 'raid' && direct.length ? '<span class="vmark"></span>' : '';
      if (kind === 'raid' && tier.length) list += itemGrid(c, tier, () => ({ chip: 'Tier token', pre: pad }));
      if (cat.length && kind !== 'world') list += itemGrid(c, cat, i => Object.assign(catMark(i), { pre: pad }));
      list += killLine;
      if (!list) list = `<p class="empty">${kind === 'world' ? 'No BiS here; item level upgrades only.' : 'No BiS items from here.'}</p>`;
      return `<div class="bc-cat"><span>${label}</span></div>${list}`;
    }).join('');
    return `<div class="bc" style="--accent:${accentFor(c.cls)}"><div class="bc-head"><span class="n" style="color:${CHAR_COLOR[name] || '#fff'}">${esc(name)}</span><span class="hint">Great Vault</span></div>${sections}</div>`;
  }).join('');
  paintBonusView();

  const teams = state.teams || [];
  $('teams-wrap').style.display = teams.length ? '' : 'none';
  $('team-tiles').innerHTML = teams.filter(t => !t.error).map(teamTile).join('');
  const ot = teams.find(t => t.name === openTeam);
  $('team-panel').innerHTML = ot ? teamPanel(ot) : (teams.find(t => t.error) ? teamPanel(teams.find(t => t.error)) : '');

  const guests = state.guests || [];
  $('guest-wrap').style.display = guests.length ? '' : 'none';
  $('guests').innerHTML = guests.map(guestCard).join('');

  // Friend roster pages: <div id="friends" data-roster="Blake">
  const fr = document.getElementById('friends');
  if (fr) {
    const roster = (state.friends || []).find(f => f.name === fr.dataset.roster);
    if (!roster) fr.innerHTML = `<p class="empty">No "${esc(fr.dataset.roster)}" tab in the Friends Rosters sheet yet, or the script has not run.</p>`;
    else {
      const order = (fr.dataset.sections || '').split('|').filter(Boolean);
      roster.members.forEach(m => { const sec = m.section || 'Other toons'; if (!order.includes(sec)) order.push(sec); });
      fr.innerHTML = order.map(sec => {
        const ms = roster.members.filter(m => (m.section || 'Other toons') === sec);
        return `<div class="section-title"><h2>${esc(sec)}</h2><span class="hint">${ms.length} character${ms.length === 1 ? '' : 's'}</span></div>` +
          (ms.length ? `<div class="chars lite-grid">${(() => { const rows = Math.max(1, ...ms.map(m => m.bisList ? 1 : (m.bisSets || []).length));
            return ms.map(m => liteCard(m, 'friend-' + roster.name, { friend: true, bisRows: rows })).join(''); })()}</div>`
            : `<p class="empty" style="margin-bottom:18px">None yet: add them on the ${esc(roster.name)} tab of the Friends Rosters sheet with Section "${esc(sec)}".</p>`);
      }).join('');
    }
  }

  // Mythic+ by dungeon
  $('mplus').innerHTML = pve.slice().sort(byOrder(MPLUS_ORDER)).map(c => {
    const runs = (c.mplusRuns || []).slice().sort((a, b) => b.score - a.score);
    const mp = String(c.rating || '').replace(/^M\+\s*/, '');
    return `<div class="mtile" style="--accent:${accentFor(c.cls)};${classBg(c.cls)}"><div class="mtile-head"><span>${classIcon(c.cls, 'sm')}<span class="n">${esc(c.name)}</span></span><span class="sc">${f1(mp)}</span></div>` +
      (runs.length ? runs.map(r => `<div class="run"><div>${esc(r.dungeon)} <span class="spec">${esc(r.spec)}</span></div><span class="lvl">+${r.level}</span><span class="score">${Number(r.score).toFixed(1)}</span></div>`).join('')
        : `<p class="empty">Loads with live data.</p>`) + `</div>`;
  }).join('');
}

let bonusView = (() => { try { return localStorage.getItem('wowBonusView') || 'boss'; } catch (e) { return 'boss'; } })();
function paintBonusView() {
  document.querySelectorAll('[data-bview]').forEach(b => b.classList.toggle('on', b.dataset.bview === bonusView));
  $('bonus-boss').style.display = bonusView === 'boss' ? '' : 'none';
  $('bonus-legend').style.display = bonusView === 'boss' ? '' : 'none';
  $('bonus-char').style.display = bonusView === 'char' ? '' : 'none';
  $('bonus-vault').style.display = bonusView === 'vault' ? '' : 'none';
}

/* ------------------------------------------------------------------ events */
document.addEventListener('click', e => {
  const f = e.target.closest('[data-filter]');
  if (f) { todoFilter = f.dataset.filter; renderAll(); return; }
  const pc = e.target.closest('[data-cardtoggle]');
  if (pc) {
    const n = pc.dataset.cardtoggle;
    const ch = (STATE.characters || []).find(x => x.name === n);
    const key = ch && ch.pvp ? 'pvp' : 'pve';
    openCard[key] = openCard[key] === n ? null : n;
    try { localStorage.setItem('wowOpenCard', JSON.stringify(openCard)); } catch (er) { /* storage blocked */ }
    renderAll();
    return;
  }
  const lt = e.target.closest('[data-litetoggle]');
  if (lt) { const k = lt.dataset.litetoggle; liteOpen.has(k) ? liteOpen.delete(k) : liteOpen.add(k); try { localStorage.setItem('wowLiteOpen', JSON.stringify([...liteOpen])); } catch (er) { /* storage blocked */ } renderAll(); return; }
  const tt = e.target.closest('[data-team]');
  if (tt) { openTeam = openTeam === tt.dataset.team ? '' : tt.dataset.team; try { localStorage.setItem('wowOpenTeam', openTeam); } catch (er) { /* storage blocked */ } renderAll(); return; }
  const db = e.target.closest('[data-dungeon]');
  if (db) { const k = db.dataset.dungeon; openDungeon.has(k) ? openDungeon.delete(k) : openDungeon.add(k); try { localStorage.setItem('wowOpenDungeon', JSON.stringify([...openDungeon])); } catch (er) { /* storage blocked */ } renderAll(); return; }
  const tp = e.target.closest('[data-teampick]');
  if (tp) { const [tm, base, pick] = tp.dataset.teampick.split('|'); teamPick[tm + '|' + base] = pick; try { localStorage.setItem('wowTeamPick', JSON.stringify(teamPick)); } catch (er) { /* storage blocked */ } renderAll(); return; }
  const ls = e.target.closest('[data-logspec]');
  if (ls) { const [n, sp] = ls.dataset.logspec.split('|'); logSpec[n] = sp; try { localStorage.setItem('wowLogSpec', JSON.stringify(logSpec)); } catch (er) { /* storage blocked */ } renderAll(); return; }
  const bv = e.target.closest('[data-bview]');
  const fb = e.target.closest('[data-friendbis]');
  if (fb) { const [n, sp] = fb.dataset.friendbis.split('|'); friendBisSpec[n] = sp; try { localStorage.setItem('wowFriendBis', JSON.stringify(friendBisSpec)); } catch (er) { /* storage blocked */ } renderAll(); return; }
  if (bv) { bonusView = bv.dataset.bview; try { localStorage.setItem('wowBonusView', bonusView); } catch (er) { /* storage blocked */ } paintBonusView(); return; }
  const v = e.target.closest('[data-vault]');
  if (v && !v.disabled) {
    const [name, kind, delta] = v.dataset.vault.split('|');
    const c = STATE.characters.find(x => x.name === name);
    const vv = c && c.vault && c.vault.find(x => x.kind === kind);
    if (!vv) return;
    vv.done = Math.max(0, Math.min(20, vv.done + Number(delta)));
    renderAll();
    send({ action: 'vault', character: name, kind, value: vv.done });
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.todo) {
    const t = STATE.todo.find(x => x.row === +el.dataset.todo);
    if (t) t.done = el.checked;
    send({ action: 'todoDone', row: +el.dataset.todo, value: el.checked });
    renderAll();
  } else if (el.dataset.wk) {
    const [row, col] = el.dataset.wk.split(',').map(Number);
    const r = STATE.weekly.rows.find(x => x.row === row);
    if (r) r.cells[col - 2] = el.checked;
    send({ action: 'checklist', row, col, value: el.checked });
    renderAll();
  } else if (el.dataset.level) {
    const t = STATE.todo.find(x => x.row === +el.dataset.level);
    if (t) t.level = Number(el.value) || '';
    send({ action: 'level', row: +el.dataset.level, value: el.value });
    renderAll();
  } else if (el.dataset.crafter) {
    const c = STATE.crafters.find(x => x.row === +el.dataset.crafter);
    if (c) c.done = el.checked;
    send({ action: 'crafter', row: +el.dataset.crafter, value: el.checked });
    renderAll();
  } else if (el.dataset.plan || el.dataset.rolls) {
    const row = +(el.dataset.plan || el.dataset.rolls);
    const b = STATE.bonus.find(x => x.row === row);
    if (el.dataset.plan) b.plan = el.value; else b.rolls = el.value;
    send({ action: 'bonus', row, plan: b.plan, rolls: b.rolls });
    renderAll();
  } else if (el.dataset.spec) {
    const c = STATE.characters.find(x => x.name === el.dataset.spec);
    if (c) c.specSelected = el.value;
    send({ action: 'spec', character: el.dataset.spec, spec: el.value });
  } else if (el.dataset.pvp) {
    const [name, field] = el.dataset.pvp.split('|');
    send({ action: 'pvp', character: name, field, value: el.value });
  }
});

$('new-who').innerHTML = `<optgroup label="Accounts"><option>General</option><option>WoW#1</option><option>AODKONA</option></optgroup>` +
  Object.entries(ACCOUNTS).map(([a, list]) => `<optgroup label="${esc(a)}">${list.map(n => `<option>${esc(n)}</option>`).join('')}</optgroup>`).join('') +
  `<optgroup label="Alts &amp; crafters">${ALTS.map(n => `<option>${esc(n)}</option>`).join('')}</optgroup>`;
$('new-cat').innerHTML = TODO_CATEGORIES.map(c => `<option${c === 'Other' ? ' selected' : ''}>${esc(c)}</option>`).join('');
$('addform').addEventListener('submit', async e => {
  e.preventDefault();
  const task = $('new-task').value.trim();
  if (!task) return;
  $('new-add').disabled = true;
  const ok = await send({ action: 'todoAdd', task, priority: $('new-pri').value, character: $('new-who').value, category: $('new-cat').value, repeats: $('new-rep').value });
  $('new-add').disabled = false;
  if (ok) $('new-task').value = '';
});

/* ------------------------------------------------------------------ load */
// The last live data is kept in this browser so the page draws instantly, then updates in the background.
const PAGE = document.body.dataset.page || 'all';
const SAVED_KEY = 'wowSaved_' + PAGE;
try { localStorage.removeItem('wowSavedState'); } catch (e) { /* old single-copy key */ }
function showSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    if (!saved || !saved.state || !saved.state.generated) return false;
    render(saved.state, true, saved.when + ' (updating…)');
    return true;
  } catch (e) { return false; }
}
async function load(fresh) {
  if (!WEBAPP_URL) { render(SNAPSHOT, false, SNAPSHOT.generated); return; }
  if (!fresh && document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
  try {
    const res = await fetch(WEBAPP_URL + '?page=' + PAGE + (fresh ? '&fresh=1' : ''), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const state = JSON.parse(await res.text());
    if (!state.generated) throw new Error('the web app is still on the old script version');
    const when = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    if (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName) && !fresh) return;
    render(state, true, when);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify({ when, state })); } catch (er) { /* storage full or blocked */ }
  } catch (e) {
    console.warn('Live load failed, showing snapshot:', e);
    if (!STATE || !LIVE) render(SNAPSHOT, false, SNAPSHOT.generated + ' (live data could not be loaded: ' + e.message + ')');
    else $('when').textContent = 'Saved copy from ' + String(WHEN).replace(' (updating…)', '') + ' (live update failed)';
  }
}

paintLock();
showSaved();
load();
setInterval(() => load(false), REFRESH_MINUTES * 60 * 1000);
