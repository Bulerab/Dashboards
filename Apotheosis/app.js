/* Apotheosis raid & guild page. View only: everything comes from the guild sheet's Apps Script web app.
 * WEBAPP_URL: the "Apotheosis" Apps Script web app address (ends in /exec). */
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwvpLJVlNJLPjKKSBMFvEiWu9RJX9dlb5rTJntWmlxD0WeytyeZIw2J4M7FE4UfHBpJ/exec';
const REFRESH_MINUTES = 10;

const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };

let STATE = null, WHEN = '';
let tab = (location.hash || '#roster').slice(1);
const rosterPick = store('apoRosterPick', {});           // player -> picked toon name
const tileOpen = new Set(store('apoTileOpen', []));
let bbMode = store('apoBossMode', 'overall');           // boss breakdown: ilvl | overall | raw
let ilvlAll = store('apoIlvlAll', false);               // top item level: top 5 or whole raid
let mainsOpen = false;                                  // mains vs secondary mains pop-out

const inPvp = c => !!(c && c.pvp && c.pvp.mostly);      // more than half their gear is PvP gear
const pvpText = c => `In PvP gear (${c.pvp.count} of ${c.pvp.total} pieces)`;
const ROLE = c => c.role === 'TANK' ? 'Tank' : c.role === 'HEALING' ? 'Healer' : 'DPS';
const nameHtml = c => `<span style="color:${classHex(c.cls)};white-space:nowrap">${classIcon(c.cls, 'sm')}${esc(c.name)}</span>`;
const toonsOfP = p => [p.main].concat(p.alts || []);
const picked = p => toonsOfP(p).find(t => t.name === rosterPick[p.player]) || p.main;
const bossList = () => (STATE && STATE.bossOrder && STATE.bossOrder.length ? STATE.bossOrder : BOSS_ORDER);
const bossOfSrc = src => bossList().find(b => String(src || '').startsWith(b)) || null;
/* Missing in action: none of the player's toons (main or secondary mains) in any Warcraft Logs log for 4+ weeks.
   Unknown until their logs have been checked once; they reappear as soon as a new log shows up. */
const MIA_DAYS = 28;
function lastSeenOf(p) {
  const logs = toonsOfP(p).map(t => t.logs).filter(l => l && l.v === 3);
  if (!logs.length) return undefined;
  const seen = logs.map(l => l.lastSeen).filter(Boolean);
  return seen.length ? Math.max(...seen) : null;
}
const isMIA = p => { const s = lastSeenOf(p); return s !== undefined && (s === null || Date.now() - s > MIA_DAYS * 86400000); };
const raidPlayers = () => { const r = (STATE.roster || []).filter(p => !isMIA(p)); const team = r.filter(p => p.raid); return team.length ? team : r; };
const benchPlayers = () => { const r = (STATE.roster || []).filter(p => !isMIA(p)); return r.some(p => p.raid) ? r.filter(p => !p.raid) : []; };
function miaHtml() {
  const list = (STATE.roster || []).filter(isMIA);
  if (!list.length) return '';
  return `<div class="card"><div class="card-head"><h2>Missing in action</h2><span class="hint">no Warcraft Logs log on any of their toons for ${MIA_DAYS / 7}+ weeks &middot; hidden from the raid roster</span></div>
    ${list.map(p => { const s = lastSeenOf(p);
      return `<div class="sum-row">${nameHtml(p.main)}<span class="hint">${esc(p.role || '')}${(p.alts || []).length ? ' &middot; also ' + p.alts.map(a => esc(a.name)).join(', ') : ''}</span>
        <span class="r">${s ? 'last log ' + new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ` <span class="hint">(${Math.floor((Date.now() - s) / 86400000)} days ago)</span>` : '<span class="hint">no logs found</span>'}</span></div>`; }).join('')}</div>`;
}

/* ------------------------------------------------------------------ roles, sections and offspecs */
const SECTIONS = ['Tanks', 'Healers', 'Melee', 'Ranged'];
const RANGED_SPEC = { Balance: 1, Elemental: 1, Shadow: 1, Devastation: 1, Augmentation: 1, Marksmanship: 1, 'Beast Mastery': 1, Arcane: 1, Fire: 1,
  Affliction: 1, Demonology: 1, Destruction: 1 };
const isRanged = (cls, spec) => RANGED_SPEC[spec] || (spec === 'Frost' && cls === 'Mage') || (!spec && /Mage|Warlock|Evoker|Hunter/.test(cls || ''));
const sectionOf = (role, cls, spec) => /tank/i.test(role) ? 'Tanks' : /heal/i.test(role) ? 'Healers' : isRanged(cls, spec) ? 'Ranged' : 'Melee';
const ROLE_SECTION = { Tank: 'Tanks', Healer: 'Healers', Melee: 'Melee', Ranged: 'Ranged' };
/** The section a player sits in: the Raid role column, or their main's spec when it's blank */
const playerSection = p => ROLE_SECTION[p.role] || sectionOf(p.main.role, p.main.cls, p.main.spec);
/** Offspecs written in Notes, only those listed: "Offspec: Shadow DPS; Offspec: Blood tank".
 *  Starting with a secondary main's name puts that toon in: "Offspec: Jacii Retribution DPS". */
function offspecsOf(p) {
  const out = [];
  String(p.notes || '').replace(/offspec:\s*([^;\n]+)/gi, (m, txt) => {
    txt.split(/\s*(?:,|&| and )\s*/).filter(Boolean).forEach(t => {
      const first = t.split(/\s+/)[0];
      const alt = (p.alts || []).find(a => a.name.toLowerCase() === first.toLowerCase());
      const rest = alt ? t.slice(first.length).trim() : t;
      const toon = alt || p.main;
      const role = /tank/i.test(rest) ? 'Tank' : /heal/i.test(rest) ? 'Healer' : 'DPS';
      const spec = rest.replace(/\b(dps|tank|heals?|healer|healing)\b/ig, '').trim();
      out.push({ spec, role, toon, alt: !!alt, section: sectionOf(role, toon.cls, spec) });
    });
  });
  return out;
}
const ROLE_ICON = { Tank: 'inv_shield_04', Healer: 'spell_holy_flashheal', DPS: 'inv_sword_04' };
const roleIcon = r => icon(ROLE_ICON[r] || ROLE_ICON.DPS, 'role-ic');

/* ------------------------------------------------------------------ Roster tab */
function summaryHtml(toons) {
  const ok = toons.filter(t => !t.error);
  const sorted = ok.slice().sort((a, b) => (b.ilvl || 0) - (a.ilvl || 0)), top = ilvlAll ? sorted : sorted.slice(0, 5);
  const issues = ok.map(t => {
    const bits = [];
    if ((t.missingEnchants || []).length) bits.push('Enchant: ' + t.missingEnchants.map(slotName).join(', '));
    if (t.gems && t.gems.empty) bits.push(t.gems.empty + ' empty socket' + (t.gems.empty > 1 ? 's' : ''));
    if (t.gems && !t.gems.diamond) bits.push('No Eversong Diamond');
    return bits.length ? { t, bits } : null;
  }).filter(Boolean);
  const roles = { Tank: 0, Healer: 0, DPS: 0 };
  ok.forEach(t => roles[ROLE(t)]++);
  const avg = ok.length ? ok.reduce((a, t) => a + (t.ilvl || 0), 0) / ok.length : 0;
  return `<div class="card"><div class="card-head"><h2>${ilvlAll ? 'Item level' : 'Top 5 item level'}</h2><span class="hint">raid team avg ${f2(avg)}</span></div>
      ${top.map((t, i) => `<div class="sum-row"><span class="rk">${i + 1}</span>${nameHtml(t)}<span class="hint">${esc(t.spec)}</span><b class="r">${f2(t.ilvl)}</b></div>`).join('') || '<p class="empty">No data yet.</p>'}
      ${sorted.length > 5 ? `<button type="button" class="toggle-btn" style="margin-top:8px" data-ilvlall="1">${ilvlAll ? 'Show top 5' : 'Show all ' + sorted.length}</button>` : ''}
      <div class="sum-roles"><span>Tanks <b>${roles.Tank}</b></span><span>Healers <b>${roles.Healer}</b></span><span>DPS <b>${roles.DPS}</b></span><span>Total <b>${ok.length}</b></span></div></div>
    <div class="card"><div class="card-head"><h2>Missing enchants &amp; gems</h2><span class="hint">${issues.length} of ${ok.length} players</span></div>
      ${issues.length ? `<div class="issue-list">${issues.map(x => `<div class="sum-row">${nameHtml(x.t)}<span class="r issue">${esc(x.bits.join(' · '))}</span></div>`).join('')}</div>` : '<p class="empty" style="color:var(--ok)">Everyone is enchanted and gemmed.</p>'}</div>`;
}

function bossBreakdown(toons) {
  const ok = toons.filter(t => t.logs && !t.logs.error);
  const diff = (ok[0] && ok[0].logs.difficulty) || 'Heroic';
  $('boss-hint').innerHTML = `best ${esc(diff)} kill per player; damage for DPS and tanks, healing for healers`;
  const bosses = bossList().filter(b => ok.some(t => t.logs.bosses.some(x => x.boss === b)));
  if (!bosses.length) return `<p class="empty">${toons.some(t => t.logs) ? 'No kills logged at this difficulty yet.' : 'Warcraft Logs parses appear after the first refresh with the Warcraft Logs keys.'}</p>`;
  const key = bbMode === 'ilvl' ? 'pctB' : bbMode === 'raw' ? 'amount' : 'pct';
  const top3 = (b, metric) => ok.filter(t => t.logs.metric === metric).map(t => ({ t, x: t.logs.bosses.find(x => x.boss === b) }))
    .filter(r => r.x && r.x[key] != null).sort((a, c) => c.x[key] - a.x[key] || c.x.amount - a.x.amount).slice(0, 3);
  const cell = list => list.length ? list.map(r => `<span class="bb">${nameHtml(r.t)} ${bbMode === 'raw' ? `<b>${abbr(r.x.amount)}</b> <span class="hint">${r.x.pct != null ? Math.floor(r.x.pct) + '%' : ''}</span>`
    : `${pctHtml(r.x[key])} <span class="hint">${abbr(r.x.amount)}</span>`}</span>`).join('') : '<span class="hint">-</span>';
  const chip = (k, label, tip) => `<button type="button" class="chip${bbMode === k ? ' on' : ''}" data-bbmode="${k}" data-tip="${tip}">${label}</button>`;
  const chips = `<div class="filters" style="margin-bottom:10px">${chip('ilvl', 'ilvl %', 'Parse compared with players at the same item level')}${chip('overall', 'Overall %', 'Parse compared with everyone playing the spec')}${chip('raw', 'Raw throughput', 'Highest damage or healing per second')}</div>`;
  const word = bbMode === 'raw' ? 'throughput' : 'parses';
  return chips + `<table class="logs-table boss-bd"><thead><tr><th>Boss</th><th>Top 3 damage ${word}</th><th>Top 3 healing ${word}</th></tr></thead><tbody>${bosses.map(b =>
    `<tr><td><b>${esc(b)}</b></td><td>${cell(top3(b, 'dps'))}</td><td>${cell(top3(b, 'hps'))}</td></tr>`).join('')}</tbody></table>`;
}

function bisNeedByBoss(c) {
  const by = {};
  ((c.bis && c.bis.need) || []).forEach(n => { const b = bossOfSrc(n.source) || n.source || 'Other'; (by[b] = by[b] || []).push(n); });
  return by;
}

/* Raidbots opens with the character loaded from the Armory: /simbot/quick or /simbot/droptimizer ?region=&realm=&name= */
const rbUrl = (mode, c) => `https://www.raidbots.com/simbot/${mode}?region=us&realm=${encodeURIComponent(c.realm || 'eldrethalas')}&name=${encodeURIComponent(c.name)}`;
// Guild Droptimizer setup (Settings tab): Season 2 Raids, Heroic, Hero 6/6, Patchwerk, 1 boss. Loading it keeps the character
// already in Raidbots when "Character" is unticked on Raidbots' confirm screen.
const RB_SETUP_DEFAULT = 'https://www.raidbots.com/simbot/share/9i2ZaaSji3BsvnnmDjKo1o';
const rbSetup = () => (STATE && STATE.guild && STATE.guild.raidbotsSetup) || RB_SETUP_DEFAULT;
const rbBonus = () => (STATE && STATE.guild && STATE.guild.raidbotsBonus) || '';
const rbLinks = c => `<div class="rb-links"><span class="rb-step">1</span><a class="rb-btn" href="${rbUrl('droptimizer', c)}" target="raidbots" rel="noopener" data-tip="Opens Raidbots Droptimizer with ${esc(c.name)} loaded">${fav('raidbots.com', 'RB')} Droptimizer: ${esc(c.name)}</a>
  <span class="rb-step">2</span><a class="rb-btn" href="${esc(rbSetup())}" target="raidbots" rel="noopener" data-tip="Applies the guild setup: Season 2 Raids, Heroic, Hero 6/6, Patchwerk, 1 boss.&lt;br&gt;On Raidbots' screen, &lt;b&gt;untick Character&lt;/b&gt;, then Load Setup.">Raid setup</a>
  <a class="rb-btn" href="${rbUrl('quick', c)}" target="raidbots" rel="noopener" data-tip="Raidbots Quick Sim of ${esc(c.name)}'s current gear">Quick Sim</a></div>`;

function offBadges(p) {
  const offs = offspecsOf(p);
  return offs.length ? `<div class="offspecs"><span class="ol">Offspecs</span>${offs.map(o => `<span class="ob" data-tip="${esc((o.alt ? o.toon.name + ': ' : '') + (o.spec ? o.spec + ' ' : '') + o.role)}">${roleIcon(o.role)}${o.alt ? esc(o.toon.name) + ' ' : ''}${esc(o.spec || o.role)}</span>`).join('')}</div>` : '';
}

function playerTile(p, key) {
  const c = picked(p), id = key + '|' + p.player, open = tileOpen.has(id);
  const toons = toonsOfP(p);
  const pick = toons.length > 1 ? `<div class="picker" style="margin-top:8px"><span class="pl">${esc(p.player)}'s toons</span><div class="row">${toons.map(o =>
    `<button type="button" class="pick${o === c ? ' on' : ''}" data-rpick="${esc(p.player + '|' + o.name)}" style="${o === c ? '' : 'color:' + classHex(o.cls)}">${esc(o.name)}</button>`).join('')}</div></div>` : '';
  if (c.error && !c.cls) return `<div class="char"><div class="char-name">${esc(c.name)}</div><p class="empty">${esc(c.error)}</p>${pick}</div>`;
  const L = c.logs && !c.logs.error ? c.logs : null;
  const bis = inPvp(c) ? `<div class="ench-summary" style="margin:6px 0"><span class="pill warn">${esc(pvpText(c))}</span></div>` : c.bis ? `<div class="bis"><div class="bis-label"><span>${esc(c.spec)} BiS</span><span>${c.bis.have} / ${c.bis.total}</span></div><div class="meter"><div style="width:${Math.round(c.bis.have / c.bis.total * 100)}%"></div></div></div>`
    : `<p class="empty" style="margin:6px 0">No BiS list for ${esc(c.spec || 'this spec')} yet.</p>`;
  const pills = [(c.missingEnchants || []).length ? `<span class="pill bad">Missing enchant: ${esc(c.missingEnchants.map(slotName).join(', '))}</span>` : '<span class="pill ok">Enchants OK</span>',
    c.gems ? (c.gems.empty ? `<span class="pill bad">${c.gems.empty} empty socket${c.gems.empty > 1 ? 's' : ''}</span>` : '<span class="pill ok">Gems OK</span>') : '',
    c.gems ? (c.gems.diamond ? '<span class="pill ok">Eversong Diamond</span>' : '<span class="pill bad">No Eversong Diamond</span>') : ''].join('');
  const logsTable = L ? `<table class="logs-table"><thead><tr><th>Boss</th><th data-tip="Compared with players at the same item level">ilvl %</th><th data-tip="Compared with everyone playing the spec">Overall %</th><th>Best ${L.metric === 'hps' ? 'HPS' : 'DPS'}</th><th>Kills</th></tr></thead><tbody>${
      bossList().map(b => L.bosses.find(x => x.boss === b)).filter(Boolean).map(x => `<tr><td>${esc(x.boss)}</td><td>${pctHtml(x.pctB)}</td><td>${pctHtml(x.pct)}</td><td>${abbr(x.amount)}</td><td>${x.kills}</td></tr>`).join('') || '<tr><td colspan="5" class="none">No kills logged</td></tr>'}</tbody></table>`
    : `<p class="empty">${c.logs && c.logs.error ? esc(c.logs.error) : 'No Warcraft Logs data yet.'}</p>`;
  const by = bisNeedByBoss(c);
  const need = Object.keys(by).sort((a, b) => (bossList().indexOf(a) + 1 || 99) - (bossList().indexOf(b) + 1 || 99)).map(b =>
    `<div class="target"><span class="boss">${esc(b)}</span><div class="need-grid one-line" style="grid-template-columns:72px minmax(0,1fr)">${by[b].map(n => `<span class="slot">${esc(slotName(n.slot))}</span><span>${esc(n.item)}</span>`).join('')}</div></div>`).join('');
  return `<div class="char pvpc lite${open ? ' open' : ''}" style="--accent:${accentFor(c.cls)};${classBg(c.cls)}">
    <div class="pvp-sum">
      <div class="char-head"><div><div class="name-row">${classIcon(c.cls)}<span class="char-name">${esc(c.name)}</span>${profileLinks(c.name, c.realm)}</div>
        <div class="char-meta meta-row">${esc([c.spec, c.cls].filter(Boolean).join(' '))}${p.player !== c.name ? ' &middot; ' + esc(p.player) : ''}<button type="button" class="toggle-btn" data-apotoggle="${esc(id)}">${open ? 'Collapse' : 'Expand'} <span class="chev">&#9662;</span></button></div></div>
        <div class="headline-row"><div class="headline"><div class="lbl">ilvl</div><div class="big">${f2(c.ilvl)}</div></div><div class="headline"><div class="lbl">M+</div><div class="big">${f1(c.score)}</div></div></div></div>
      ${bis}
      <div class="minis" style="grid-template-columns:repeat(3,1fr)">
        <div class="mini"><div class="k">${L && L.metric === 'hps' ? 'Heal parse' : 'Raid parse'}</div><div class="v">${L ? pctHtml(L.avg) : '-'}</div></div>
        <div class="mini"><div class="k">Bosses logged</div><div class="v">${L ? L.bosses.length : '-'}</div></div>
        <div class="mini"><div class="k">BiS needed</div><div class="v">${inPvp(c) ? 'PvP' : c.bis ? c.bis.need.length : '-'}</div></div>
      </div>
      <div class="ench-summary" style="margin-top:8px">${pills}</div>${offBadges(p)}${rbLinks(c)}${pick}
    </div>
    <div class="pvp-more"><div class="pvp-more-grid" style="grid-template-columns:1fr 1fr">
      <div><div class="sec"><div class="sec-title"><span>Warcraft Logs &middot; ${esc((L && L.difficulty) || '')} raid</span><span class="hint">overall %</span></div>${logsTable}</div></div>
      <div><div class="sec"><div class="sec-title"><span>BiS still needed</span><span class="hint">by source</span></div>${inPvp(c) ? `<p class="empty">${esc(pvpText(c))}: left out of BiS and bonus roll priority until they switch to PvE gear.</p>` : need || (c.bis ? '<p class="empty" style="color:var(--ok)">Full BiS.</p>' : '<p class="empty">No BiS list yet.</p>')}</div></div>
    </div></div>
  </div>`;
}

function mainsPopout() {
  const ps = STATE.roster || [];
  const mains = ps.map(p => `<div class="sum-row">${nameHtml(p.main)}<span class="hint">${esc(p.main.spec || '')}</span><span class="r hint">${esc(p.role || '')}${p.raid ? '' : ' &middot; not on raid team'}</span></div>`).join('');
  const secs = ps.flatMap(p => (p.alts || []).map(a => `<div class="sum-row">${nameHtml(a)}<span class="hint">${esc(a.spec || '')} ${esc(a.cls || '')}</span><span class="r">secondary main of ${nameHtml(p.main)}</span></div>`)).join('');
  return `<div class="pop-bg" data-mains="close"></div><div class="pop"><div class="card-head"><h2>Mains &amp; secondary mains</h2><button type="button" class="toggle-btn" data-mains="close">Close</button></div>
    <div class="pop-grid"><div><div class="sec-title"><span>Mains</span><span class="hint">${ps.length}</span></div>${mains}</div>
    <div><div class="sec-title"><span>Secondary mains</span><span class="hint">${(secs.match(/sum-row/g) || []).length}</span></div>${secs || '<p class="empty">None listed.</p>'}</div></div></div>`;
}

/* ------------------------------------------------------------------ Priority tab */
function priorityHtml() {
  const by = {}, other = {};
  const pvpSkipped = [];
  raidPlayers().forEach(p => {
    const c = picked(p);
    if (inPvp(c)) { pvpSkipped.push(c); return; }
    ((c.bis && c.bis.need) || []).forEach(n => {
      const b = bossOfSrc(n.source);
      const bucket = b ? by : other, k = b || n.source || 'Unknown source';
      ((bucket[k] = bucket[k] || {})[c.name] = bucket[k][c.name] || { c, items: [] }).items.push(n);
    });
  });
  const block = (obj, sortByOrder) => Object.keys(obj).map(k => ({ k, who: Object.values(obj[k]) }))
    .sort((a, b) => b.who.length - a.who.length || (sortByOrder ? bossList().indexOf(a.k) - bossList().indexOf(b.k) : a.k.localeCompare(b.k)))
    .map((r, i) => `<div class="prio-row"><span class="rk">${i + 1}</span><span class="pb">${esc(r.k)}</span><span class="pc"><b>${r.who.length}</b> player${r.who.length === 1 ? '' : 's'}</span>
      <span class="pw">${r.who.map(w => `<span data-tip="${esc(w.items.map(n => slotName(n.slot) + ': ' + n.item).join('<br>'))}">${nameHtml(w.c)}${w.items.length > 1 ? ' <span class="hint">x' + w.items.length + '</span>' : ''}</span>`).join(' ')}</span></div>`).join('');
  const hasBis = raidPlayers().some(p => picked(p).bis);
  $('prio-bosses').innerHTML = block(by, true) || `<p class="empty">${hasBis ? 'Nobody needs raid drops.' : 'Fills in once BiS lists are added to the sheet.'}</p>`;
  $('prio-other').innerHTML = block(other, false) || '<p class="empty">Nothing else needed.</p>';
  if (pvpSkipped.length) $('prio-bosses').innerHTML += `<p class="hint" style="margin:10px 0 0">Not counted, in PvP gear: ${pvpSkipped.map(c => `${nameHtml(c)} <span class="hint">(${c.pvp.count}/${c.pvp.total})</span>`).join(' &middot; ')}</p>`;
}

/* ------------------------------------------------------------------ Sims Priority tab */
const SIM_KINDS = { drops: 'Heroic drops (6/6)', bonus: 'Bonus rolls & vault' };
let simKind = store('apoSimKind', 'drops');
let simMsg = '';
let officerKey = (() => { try { return localStorage.getItem('apoOfficerKey') || ''; } catch (e) { return ''; } })();
const simsOf = c => (STATE.sims || []).filter(x => x.name.toLowerCase() === String(c.name).toLowerCase() && (!x.realm || x.realm === String(c.realm).toLowerCase()));
const simOf = (c, kind) => simsOf(c).find(x => x.kind === kind);
const pctTxt = v => (v > 0 ? '+' : '') + v.toFixed(2) + '%';
const pctCls = v => v >= 1 ? 'up2' : v > 0 ? 'up' : 'down';

function simList(sim, n) {
  if (!sim) return '<p class="empty">No report imported yet.</p>';
  const up = sim.rows.filter(r => r.pct > 0);
  const rows = (up.length ? up : sim.rows).slice(0, n || 6);
  const SLOT_NAME = { head: 'Head', neck: 'Neck', shoulder: 'Shoulder', shoulders: 'Shoulder', back: 'Back', chest: 'Chest', wrist: 'Wrist', wrists: 'Wrist', hands: 'Hands',
    waist: 'Waist', legs: 'Legs', feet: 'Feet', finger1: 'Ring', finger2: 'Ring', trinket1: 'Trinket', trinket2: 'Trinket', main_hand: 'Main hand', off_hand: 'Off hand' };
  return `${up.length ? '' : '<p class="hint" style="margin:0 0 4px">No upgrades: closest items below</p>'}<div class="sim-rows">${rows.map(r =>
    `<div class="sim-row"><span class="slot">${esc(SLOT_NAME[r.slot] || r.slot)}</span><span class="sn"><span class="si" data-tip="${esc(r.item)}${r.ilvl ? ' (' + r.ilvl + ')' : ''}">${esc(r.item)}</span><span class="hint sb">${esc(r.boss)}${r.ilvl ? ' &middot; ' + r.ilvl : ''}</span></span>
     <b class="sp ${pctCls(r.pct)}" data-tip="${r.dps > 0 ? '+' : ''}${Math.round(r.dps).toLocaleString()} DPS">${pctTxt(r.pct)}</b></div>`).join('')}</div>
    <div class="hint" style="margin-top:4px">Imported ${esc(sim.date)} &middot; <a href="${esc(sim.url)}" target="_blank" rel="noopener">report</a>${officerKey ? ` &middot; <a href="#sims" data-simdel="${esc(sim.name + '|' + sim.realm + '|' + sim.kind)}">remove</a>` : ''}</div>`;
}

function simsHtml() {
  const team = raidPlayers().map(picked);
  // Chart: for each boss, the sum of every raider's best upgrade % from that boss (who gains most if it dies)
  $('sim-kind-chips').innerHTML = Object.keys(SIM_KINDS).map(k => `<button type="button" class="chip${simKind === k ? ' on' : ''}" data-simkind="${k}">${SIM_KINDS[k]}</button>`).join('');
  const byBoss = {};
  team.forEach(c => { const sim = simOf(c, simKind); if (!sim) return;
    const bestPer = {};
    sim.rows.filter(r => r.pct > 0 && r.boss).forEach(r => { if (!bestPer[r.boss] || r.pct > bestPer[r.boss].pct) bestPer[r.boss] = r; });
    Object.keys(bestPer).forEach(b => { (byBoss[b] = byBoss[b] || []).push({ c, r: bestPer[b] }); });
  });
  const bars = Object.keys(byBoss).map(b => ({ b, who: byBoss[b].sort((x, y) => y.r.pct - x.r.pct), total: byBoss[b].reduce((a, x) => a + x.r.pct, 0) })).sort((a, b) => b.total - a.total);
  const max = bars.length ? bars[0].total : 1;
  const simmed = team.filter(c => simOf(c, simKind)).length;
  $('sim-chart-hint').textContent = `${simmed} of ${team.length} raiders simmed · each bar = total % DPS the raid gains from that boss's best upgrades`;
  $('sim-chart').innerHTML = bars.length ? `<div class="bars">${bars.map(x => `<div class="bar-row"><span class="bl">${esc(x.b)}</span>
      <div class="bt"><div class="bf" style="width:${(x.total / max * 100).toFixed(1)}%"></div><span class="bv">+${x.total.toFixed(2)}%</span></div>
      <span class="bw">${x.who.map(w => `<span data-tip="${esc(w.r.item)}: ${pctTxt(w.r.pct)}">${nameHtml(w.c)} <span class="hint">${pctTxt(w.r.pct)}</span></span>`).join(' ')}</span></div>`).join('')}</div>`
    : `<p class="empty">${simmed ? 'No upgrades in the imported reports.' : 'Import Droptimizer reports below to fill this chart.'}</p>`;
  // Import form (officers)
  $('sim-import').innerHTML = `<div class="card-head"><h2>Run &amp; import</h2><span class="hint">${officerKey ? 'officer mode' : 'officers: click the lock button to import'}</span></div>
    <ol class="steps"><li>On a raider's card, click <b>1 Droptimizer</b> (loads them in Raidbots), then <b>2 Heroic drops</b> or <b>2 Bonus/vault</b> to apply the guild setup &mdash; untick <i>Character</i> on Raidbots' screen and Load Setup.</li>
      <li>Run the Droptimizer, copy the report address when it finishes.</li>
      <li>${officerKey ? 'Paste it here:' : 'An officer pastes it here (needs the officer key).'}</li></ol>
    ${officerKey ? `<form class="sim-form" id="sim-form"><input type="url" id="sim-url" placeholder="https://www.raidbots.com/simbot/report/..." required>
      <select id="sim-kindsel">${Object.keys(SIM_KINDS).map(k => `<option value="${k}"${k === simKind ? ' selected' : ''}>${SIM_KINDS[k]}</option>`).join('')}</select>
      <button type="submit" class="toggle-btn" id="sim-go">Import report</button><span class="hint" id="sim-msg">${esc(simMsg)}</span></form>` : ''}`;
  // Raider cards
  $('sim-cards').innerHTML = `<div class="sim-grid">${raidPlayers().map(p => { const c = picked(p);
    return `<div class="char sim-card" style="--accent:${accentFor(c.cls)}"><div class="name-row">${classIcon(c.cls)}<span class="char-name">${esc(c.name)}</span>${profileLinks(c.name, c.realm)}<span class="hint" style="margin-left:auto">${esc(c.spec || '')}</span></div>
      <div class="rb-links"><span class="rb-step">1</span><a class="rb-btn" href="${rbUrl('droptimizer', c)}" target="raidbots" rel="noopener">${fav('raidbots.com', 'RB')} Droptimizer</a>
        <span class="rb-step">2</span><a class="rb-btn" href="${esc(rbSetup())}" target="raidbots" rel="noopener" data-tip="Season 2 Raids, Heroic, Hero 6/6, Patchwerk, 1 boss. Untick Character, then Load Setup.">Heroic drops</a>
        ${rbBonus() ? `<a class="rb-btn" href="${esc(rbBonus())}" target="raidbots" rel="noopener" data-tip="Bonus rolls &amp; vault setup. Untick Character, then Load Setup.">Bonus/vault</a>` : '<span class="hint" data-tip="Add the Bonus rolls &amp; vault Share Setup link in the sheet\'s Settings tab">Bonus/vault: add link</span>'}</div>
      ${inPvp(c) ? `<p class="hint">${esc(pvpText(c))}</p>` : ''}
      <div class="sim-cols"><div><div class="sec-title"><span>${SIM_KINDS.drops}</span></div>${simList(simOf(c, 'drops'))}</div>
        <div><div class="sec-title"><span>${SIM_KINDS.bonus}</span></div>${simList(simOf(c, 'bonus'))}</div></div></div>`; }).join('')}</div>`;
}

async function officerPost(payload) {
  const res = await fetch(WEBAPP_URL, { method: 'POST', body: JSON.stringify(Object.assign({ key: officerKey }, payload)) });
  const out = await res.json();
  if (!out.ok) { if (/officer key/i.test(out.error)) { officerKey = ''; try { localStorage.removeItem('apoOfficerKey'); } catch (e) { /* */ } } throw new Error(out.error); }
  return out.message;
}
function paintLock() { $('lock').innerHTML = officerKey ? '&#128275; Officer mode' : '&#128274; Officer'; $('lock').classList.toggle('on', !!officerKey); }

/* ------------------------------------------------------------------ Guild tab */
const rk = n => n ? '#' + Number(n).toLocaleString() : '-';
/* Progress in WoW difficulty colours (Normal green, Heroic purple, Mythic orange); ranks on a parse-style scale */
const DIFF_COLOR = { N: '#1eff00', H: '#a335ee', M: '#ff8000' };
const progHtml = sum => { const m = String(sum || '').match(/(\d+)\/(\d+)\s*([NHM])/);
  if (!m) return esc(sum || '-');
  const full = +m[1] >= +m[2];
  return `<b style="color:${DIFF_COLOR[m[3]]};${full ? '' : 'opacity:.75'}" data-tip="${{ N: 'Normal', H: 'Heroic', M: 'Mythic' }[m[3]]}: ${m[1]} of ${m[2]} bosses">${esc(sum)}</b>`; };
const RANK_STEPS = { realm: [1, 3, 10, 25], region: [10, 100, 1000, 5000], world: [25, 250, 2500, 10000] };
const rankColor = (n, scope) => { const t = RANK_STEPS[scope]; return !n ? '#666' : n <= t[0] ? '#e5cc80' : n <= t[1] ? '#ff8000' : n <= t[2] ? '#a335ee' : n <= t[3] ? '#0070ff' : '#1eff00'; };
const rkc = (n, scope) => n ? `<span style="color:${rankColor(n, scope)};font-weight:600">${rk(n)}</span>` : '<span class="hint">-</span>';
function guildHtml() {
  const g = STATE.guild || {}, rio = g.rio, wcl = g.wcl;
  $('guild-rio').innerHTML = !rio ? '<p class="empty">Loads after the first refresh.</p>' : rio.error ? `<p class="empty">${esc(rio.error)}</p>` :
    `<table class="logs-table"><thead><tr><th>Raid</th><th>Progress</th><th>Normal (realm / region / world)</th><th>Heroic</th><th>Mythic</th></tr></thead><tbody>${rio.raids.map(r => {
      const d = k => { const x = r.ranks && r.ranks[k]; return x && x.world ? `${rkc(x.realm, 'realm')} / ${rkc(x.region, 'region')} / ${rkc(x.world, 'world')}` : '<span class="hint">-</span>'; };
      return `<tr><td><b>${esc(r.name)}</b></td><td>${progHtml(r.progress.summary)}</td><td>${d('normal')}</td><td>${d('heroic')}</td><td>${d('mythic')}</td></tr>`; }).join('')}</tbody></table>
     <p class="hint" style="margin:8px 0 0">Ranks are realm / region (NA) / world. Colours: <span style="color:#e5cc80">top</span> &rsaquo; <span style="color:#ff8000">orange</span> &rsaquo; <span style="color:#a335ee">purple</span> &rsaquo; <span style="color:#0070ff">blue</span> &rsaquo; <span style="color:#1eff00">green</span> (realm #1 / top 3 / 10 / 25; region top 10 / 100 / 1,000 / 5,000; world top 25 / 250 / 2,500 / 10,000). <a href="${esc(rio.url || 'https://raider.io/guilds/us/eldrethalas/Apotheosis')}" target="_blank" rel="noopener">Raider.io guild page</a></p>`;
  const ranks = r => r ? `${rkc(r.server, 'realm')} / ${rkc(r.region, 'region')} / ${rkc(r.world, 'world')}` : '<span class="hint">-</span>';
  $('guild-wcl').innerHTML = !wcl ? '<p class="empty">Loads after the first refresh.</p>' : (wcl.zones && wcl.zones.length ?
    `<table class="logs-table"><thead><tr><th>Raid</th><th>Progress (realm / region / world)</th><th>Speed</th></tr></thead><tbody>${wcl.zones.map(z => `<tr><td><b>${esc(z.name)}</b></td><td>${ranks(z.progress)}</td><td>${ranks(z.speed)}</td></tr>`).join('')}</tbody></table>` : '') +
    (wcl.error ? `<p class="empty">${esc(wcl.error)}</p>` : '') +
    `<p class="hint" style="margin:8px 0 0">Warcraft Logs' API gives progress and speed ranks; its Execution rank is only on the website. ${wcl.id ? `<a href="https://www.warcraftlogs.com/guild/id/${wcl.id}" target="_blank" rel="noopener">Warcraft Logs guild page</a>` : ''}</p>`;
  const reps = (wcl && wcl.reports) || [];
  const dur = r => { const m = Math.round((r.end - r.start) / 60000); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
  $('guild-reports').innerHTML = reps.length ? `<table class="logs-table"><thead><tr><th>Date</th><th>Log</th><th>Zone</th><th>Length</th><th>Uploaded by</th></tr></thead><tbody>${reps.map(r =>
    `<tr><td>${new Date(r.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</td><td><a href="https://www.warcraftlogs.com/reports/${esc(r.code)}" target="_blank" rel="noopener">${esc(r.title || r.code)}</a></td><td>${esc(r.zone)}</td><td>${dur(r)}</td><td>${esc(r.owner)}</td></tr>`).join('')}</tbody></table>`
    : `<p class="empty">${wcl && wcl.reportsError ? esc(wcl.reportsError) : 'No recent logs found.'}</p>`;
}

/* ------------------------------------------------------------------ Mythic+ tab */
function mplusHtml() {
  const t = STATE.top10;
  $('top10').innerHTML = t && t.list && t.list.length ? `<table class="logs-table"><tbody>${t.list.map((x, i) =>
    `<tr><td class="rk">${i + 1}</td><td>${nameHtml(x)} ${profileLinks(x.name, x.realm)}</td><td class="hint">${esc(x.spec || '')} ${esc(x.cls || '')}</td><td><b style="color:${esc(x.color || '#fff')}">${f1(x.score)}</b></td></tr>`).join('')}</tbody></table>`
    : `<p class="empty">${t && t.error ? esc(t.error) : 'Loads after the first refresh (once a day).'}</p>`;
  const teams = STATE.teams || [];
  const ranked = teams.map(tm => { const ms = tm.members.filter(m => !m.error); return { tm, avg: ms.length ? ms.reduce((a, m) => a + (m.score || 0), 0) / ms.length : 0, n: tm.members.length }; })
    .sort((a, b) => b.avg - a.avg);
  $('team-rank').innerHTML = ranked.length ? `<table class="logs-table"><thead><tr><th>#</th><th>Team</th><th>Avg main score</th><th>Players</th></tr></thead><tbody>${ranked.map((r, i) =>
    `<tr><td class="rk">${i + 1}</td><td><a href="#mplus" data-team="${esc(r.tm.name)}"><b>${esc(r.tm.name)}</b></a></td><td><b>${r.avg ? r.avg.toFixed(1) : '-'}</b></td><td>${r.n}</td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">Add teams on the sheet\'s M+ Teams tab.</p>';
  $('team-tiles').innerHTML = teams.map(teamTile).join('');
  const ot = teams.find(x => x.name === openTeam);
  $('team-panel').innerHTML = ot ? teamPanel(ot).replace(/<\/div>\s*$/, weekTogether(ot) + '</div>') : '';
}

/* Keys this week where 2 or more of the team were in the same run (3+ highlighted) */
function weekTogether(t) {
  const runs = t.week || [], size = t.members.length;
  const rows = runs.map(r => `<div class="wk-row${r.who.length >= 3 ? ' team' : ''}"><span class="lvl">+${r.level}</span><span class="wd">${esc(r.dungeon)}</span>
      <span class="${r.timed ? 'ok' : 'no'}">${r.timed ? '&#10003; timed' + (r.upgrades > 1 ? ' +' + r.upgrades : '') : 'over time'}</span>
      <span class="wc"><b>${r.who.length} of ${size}</b></span><span class="ww">${r.who.map(w => nameHtml(w)).join(' ')}</span>
      <span class="hint">${new Date(r.at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>${r.url ? `<a class="hint" href="${esc(r.url)}" target="_blank" rel="noopener">run</a>` : ''}</div>`).join('');
  return `<div class="sec"><div class="sec-title"><span>Keys together this week</span><span class="hint">${runs.filter(r => r.who.length >= 3).length} with 3+ of the team &middot; since the Tuesday reset</span></div>${rows || '<p class="empty">No keys with 2 or more of the team since the Tuesday reset.</p>'}</div>`;
}

/* ------------------------------------------------------------------ render */
function render() {
  if (!STATE) return;
  document.querySelectorAll('.tab').forEach(s => { s.style.display = s.id === 'tab-' + tab ? '' : 'none'; });
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  const rio = STATE.guild && STATE.guild.rio;
  const cur = rio && rio.raids ? rio.raids.find(r => /^tier-/.test(r.slug)) || rio.raids[0] : null;
  $('prog-line').innerHTML = cur ? `Progress ${progHtml(cur.progress.summary)} &middot; Raid team ${raidPlayers().length} players` : 'Raid &amp; guild tracker';
  const team = raidPlayers().map(picked);
  $('roster-summary').innerHTML = summaryHtml(team);
  $('boss-breakdown').innerHTML = bossBreakdown(team);
  $('raid-toolkit').innerHTML = toolkitHtml(team);
  $('raid-count').textContent = raidPlayers().length + ' players';
  const rp = raidPlayers();
  $('raid-tiles').innerHTML = rp.length ? SECTIONS.map(sec => {
    const ps = rp.filter(p => playerSection(p) === sec);
    // Offspecs and secondary mains from other players that can fill this section
    const avail = rp.flatMap(p => offspecsOf(p).filter(o => o.section === sec && (o.alt || playerSection(p) !== sec))
      .map(o => `${nameHtml(o.toon)} <span class="hint">(${esc(o.spec || o.role)}${o.alt ? ', ' + esc(p.main.name) + "'s" : ''})</span>`));
    return `<div class="role-sec"><div class="section-title"><h2>${roleIcon(sec === 'Tanks' ? 'Tank' : sec === 'Healers' ? 'Healer' : 'DPS')} ${sec}</h2><span class="hint">${ps.length}</span></div>
      <div class="avail"><b>Raid offspecs available:</b> ${avail.length ? avail.join(' &middot; ') : '<span class="hint">none listed</span>'}</div>
      ${ps.length ? `<div class="chars lite-grid">${ps.map(p => playerTile(p, 'raid')).join('')}</div>` : '<p class="empty">Nobody in this role.</p>'}</div>`;
  }).join('') : '<p class="empty">Add players on the sheet\'s Roster tab.</p>';
  $('mains-pop').innerHTML = mainsOpen ? mainsPopout() : '';
  $('mia').innerHTML = miaHtml();
  const bench = benchPlayers();
  $('bench-wrap').innerHTML = bench.length ? `<div class="section-title"><h2>Others on the roster</h2><span class="hint">${bench.length} players</span></div><div class="chars lite-grid">${bench.map(p => playerTile(p, 'bench')).join('')}</div>` : '';
  priorityHtml();
  simsHtml();
  paintLock();
  guildHtml();
  mplusHtml();
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-lock]')) {
    e.preventDefault();
    if (officerKey) { officerKey = ''; try { localStorage.removeItem('apoOfficerKey'); } catch (er) { /* */ } render(); return; }
    const k = prompt('Officer key (set in the sheet: Apotheosis > Set officer key):');
    if (!k || !k.trim()) return;
    officerKey = k.trim();
    officerPost({ action: 'check' }).then(() => { try { localStorage.setItem('apoOfficerKey', officerKey); } catch (er) { /* */ } render(); })
      .catch(err => { officerKey = ''; alert(err.message); render(); });
    return;
  }
  const sk = e.target.closest('[data-simkind]');
  if (sk) { simKind = sk.dataset.simkind; save('apoSimKind', simKind); render(); return; }
  const sd = e.target.closest('[data-simdel]');
  if (sd) { e.preventDefault(); const [name, realm, kind] = sd.dataset.simdel.split('|');
    if (!confirm('Remove ' + name + "'s " + SIM_KINDS[kind] + ' report?')) return;
    officerPost({ action: 'simDelete', name, realm, kind }).then(() => load()).catch(err => alert(err.message)); return; }
  const bm = e.target.closest('[data-bbmode]');
  if (bm) { bbMode = bm.dataset.bbmode; save('apoBossMode', bbMode); render(); return; }
  if (e.target.closest('[data-ilvlall]')) { ilvlAll = !ilvlAll; save('apoIlvlAll', ilvlAll); render(); return; }
  const mp = e.target.closest('[data-mains]');
  if (mp) { mainsOpen = mp.dataset.mains !== 'close'; render(); return; }
  const tb = e.target.closest('[data-tab]');
  if (tb) { e.preventDefault(); tab = tb.dataset.tab; history.replaceState(null, '', '#' + tab); render(); return; }
  const rp = e.target.closest('[data-rpick]');
  if (rp) { const [pl, name] = rp.dataset.rpick.split('|'); rosterPick[pl] = name; save('apoRosterPick', rosterPick); render(); return; }
  const tg = e.target.closest('[data-apotoggle]');
  if (tg) { const k = tg.dataset.apotoggle; tileOpen.has(k) ? tileOpen.delete(k) : tileOpen.add(k); save('apoTileOpen', [...tileOpen]); render(); return; }
  const tt = e.target.closest('[data-team]');
  if (tt) { e.preventDefault(); openTeam = openTeam === tt.dataset.team ? '' : tt.dataset.team; try { localStorage.setItem('apoOpenTeam', openTeam); } catch (er) { /* blocked */ } render(); return; }
  const tp = e.target.closest('[data-teampick]');
  if (tp) { const [tm, base, pick] = tp.dataset.teampick.split('|'); teamPick[tm + '|' + base] = pick; try { localStorage.setItem('apoTeamPick', JSON.stringify(teamPick)); } catch (er) { /* blocked */ } render(); return; }
  const db = e.target.closest('[data-dungeon]');
  if (db) { const k = db.dataset.dungeon; openDungeon.has(k) ? openDungeon.delete(k) : openDungeon.add(k); try { localStorage.setItem('apoOpenDungeon', JSON.stringify([...openDungeon])); } catch (er) { /* blocked */ } render(); return; }
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'sim-form') return;
  e.preventDefault();
  const url = $('sim-url').value.trim(), kind = $('sim-kindsel').value;
  $('sim-go').disabled = true; $('sim-msg').textContent = 'Reading the report…';
  officerPost({ action: 'simImport', url, kind }).then(msg => { simMsg = 'Imported ' + msg; $('sim-msg').textContent = simMsg; return load(); })
    .catch(err => { simMsg = 'Not imported: ' + err.message; $('sim-msg').textContent = simMsg; })
    .finally(() => { const b = document.getElementById('sim-go'); if (b) b.disabled = false; });
});

/* ------------------------------------------------------------------ load (last copy first, then live) */
function show(state, when, live) {
  STATE = state; WHEN = when;
  $('src').className = 'src ' + (live ? 'live' : 'snap');
  $('src').textContent = live ? 'Live' : 'Saved copy';
  $('when').textContent = (live ? 'Updated ' : 'From ') + when + (state.generated ? ' · data ' + state.generated : '');
  render();
}
async function load() {
  if (!WEBAPP_URL) { $('src').textContent = 'Not connected yet'; $('when').textContent = 'The web app address goes in app.js once the script is deployed.'; return; }
  try {
    const res = await fetch(WEBAPP_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const state = await res.json();
    const when = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    show(state, when, true);
    save('apoSaved', { when, state });
  } catch (e) {
    if (!STATE) $('when').textContent = 'Could not load: ' + e.message;
  }
}
const saved = store('apoSaved', null);
if (saved && saved.state) show(saved.state, saved.when + ' (updating…)', false);
load();
setInterval(load, REFRESH_MINUTES * 60 * 1000);
