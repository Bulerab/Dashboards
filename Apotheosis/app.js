/* Apotheosis raid & guild page. View only: everything comes from the guild sheet's Apps Script web app.
 * WEBAPP_URL: the "Apotheosis" Apps Script web app address (ends in /exec). */
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwvpLJVlNJLPjKKSBMFvEiWu9RJX9dlb5rTJntWmlxD0WeytyeZIw2J4M7FE4UfHBpJ/exec';
const REFRESH_MINUTES = 10;

const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };

let STATE = null, WHEN = '';
let tab = (location.hash || '#guild').slice(1);
const rosterPick = store('apoRosterPick', {});           // player -> picked toon name
['apoTileOpen', 'apoLootOpen', 'apoDropOpen', 'apoTalOpen', 'apoOpenTeam', 'apoOpenDungeon'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } });
const tileOpen = new Set();   // open tiles are not remembered: everything starts collapsed
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
// Role badges drawn as SVG (in-game style: blue shield, green cross, red sword)
const ROLE_SVG = {
  Tank: { bg: '#2f7fd8', title: 'Tank', d: '<path d="M12 4.3l6.2 2.3v4.8c0 4-2.6 7-6.2 8.6-3.6-1.6-6.2-4.6-6.2-8.6V6.6z" fill="#fff"/><path d="M12 6.7v11c2.4-1.3 4-3.5 4-6.2V8.1z" fill="#2f7fd8" opacity=".45"/>' },
  Healer: { bg: '#2fa84f', title: 'Healer', d: '<path d="M9.7 5h4.6v4.7H19v4.6h-4.7V19H9.7v-4.7H5V9.7h4.7z" fill="#fff"/>' },
  DPS: { bg: '#d8392f', title: 'DPS', d: '<path d="M18.6 4.6l.8.8-.6 2.9-6.7 6.7-2.1-2.1 6.7-6.7z" fill="#fff"/><path d="M7.3 12.6l1.1-1.1 4.1 4.1-1.1 1.1z" fill="#fff"/><path d="M9.6 15l1.1 1.1-3.3 3.3a.8.8 0 0 1-1.1-1.1z" fill="#fff"/>' }
};
const roleIcon = r => { const x = ROLE_SVG[r] || ROLE_SVG.DPS;
  return `<svg class="role-ic" viewBox="0 0 24 24" role="img" aria-label="${x.title}"><title>${x.title}</title><circle cx="12" cy="12" r="11" fill="${x.bg}" stroke="#e5cc80" stroke-width="1.4"/>${x.d}</svg>`; };

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
      <div class="char-head"><div><div class="name-row">${classIcon(c.cls)}<span class="char-name">${esc(c.name)}</span>${profileLinks(c.name, c.realm)}${p.status === 'Initiate' ? '<span class="pill init" data-tip="Initiate: officers approve their trial after 2 weeks of attendance">Initiate</span>' : ''}</div>
        <div class="char-meta meta-row">${esc([c.spec, c.cls].filter(Boolean).join(' '))}${p.player !== c.name ? ' &middot; ' + esc(p.player) : ''}<button type="button" class="toggle-btn" data-apotoggle="${esc(id)}">${open ? 'Collapse' : 'Expand'} <span class="chev">&#9662;</span></button></div></div>
        <div class="headline-row"><div class="headline"><div class="lbl">ilvl</div><div class="big">${f2(c.ilvl)}</div></div><div class="headline"><div class="lbl">M+</div><div class="big">${f1(c.score)}</div></div>${tierHead(c)}</div></div>
      ${bis}
      <div class="minis" style="grid-template-columns:repeat(3,1fr)">
        <div class="mini"><div class="k">${L && L.metric === 'hps' ? 'Heal parse' : 'Raid parse'}</div><div class="v">${L ? pctHtml(L.avg) : '-'}</div></div>
        <div class="mini"><div class="k">Bosses logged</div><div class="v">${L ? L.bosses.length : '-'}</div></div>
        <div class="mini"><div class="k">BiS needed</div><div class="v">${inPvp(c) ? 'PvP' : c.bis ? c.bis.need.length : '-'}</div></div>
      </div>
      <div class="ench-summary" style="margin-top:8px">${pills}</div>${offBadges(p)}${pick}
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
/* Where a BiS item comes from: a raid boss, raid trash, a profession, a Mythic+ dungeon, or tier / unknown */
const TRASH = 'Trash drops';
function srcKind(src) {
  const t = String(src || '');
  const boss = bossOfSrc(t);
  if (boss) return { kind: 'boss', key: boss, raid: (t.match(/\(([^)]+)\)\s*$/) || [])[1] || '' };
  if (/^trash/i.test(t)) return { kind: 'boss', key: TRASH, raid: (t.match(/\(([^)]+)\)/) || [])[1] || '' };
  let m = t.match(/^crafted\s*\(([^)]+)\)/i);
  if (m) return { kind: 'craft', key: m[1] };
  m = t.match(/^(.*?)\s*\(([^,()]+),\s*mythic\+\)/i);   // "Boss (Dungeon, Mythic+)" or "(Dungeon, Mythic+)"
  if (m) return { kind: 'mplus', key: m[2], sub: m[1] };
  if (/tier/i.test(t)) return { kind: 'other', key: 'Tier set' };
  return { kind: 'other', key: t || 'Unknown source' };
}
const bossIdx = b => { const i = bossList().indexOf(b); return i < 0 ? 999 : i; };
// Which raid a boss is in: from the BiS sheet's sources ("Kith'ix (The Unbinding of Kith'ix)"), else Warcraft Logs' zone
let raidMapCache = null, raidMapFor = null;
function raidMap() {
  if (raidMapFor === STATE) return raidMapCache;
  const m = Object.assign({}, STATE.bossRaids || {});
  (STATE.roster || []).forEach(p => toonsOfP(p).forEach(c => ((c.bis && c.bis.need) || []).forEach(n => {
    const b = bossOfSrc(n.source), r = (String(n.source || '').match(/\(([^)]+)\)\s*$/) || [])[1];
    if (b && r && !/mythic\+/i.test(r) && !m[b]) m[b] = r; })));
  Object.keys(m).forEach(k => { const b = bossOfSrc(k); if (b && b !== k && !m[b]) m[b] = m[k]; });   // sheet names -> Warcraft Logs boss names
  raidMapFor = STATE; raidMapCache = m; return m;
}
const raidOf = b => raidMap()[b] || ((STATE.zones || []).find(z => (z.bosses || []).includes(b)) || {}).name || '';
const isRaidBoss = n => !!(n && (bossList().includes(bossOfSrc(n) || n) || raidMap()[n]));
const isTrashName = n => /^trash/i.test(String(n || ''));
// The big raid (most bosses): where Raidbots' unnamed "Trash Drop" items come from
const mainRaid = () => { const m = raidMap(), c = {}; Object.values(m).forEach(r => { c[r] = (c[r] || 0) + 1; });
  return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || ((STATE.zones || [])[0] || {}).name || ''; };
// Raidbots / sheet name -> what it means: a raid boss, raid trash, or a dungeon (bonus roll sims include Mythic+)
const simWhere = n => isTrashName(n) ? 'Trash drop (' + mainRaid() + ')' : isRaidBoss(n) ? (bossOfSrc(n) || n) : n ? '(' + n + ', Mythic+)' : 'Other';
const artOf = n => (STATE.art || {})[n] || '';
const artStyle = n => artOf(n) ? ` style="--art:url('${esc(artOf(n))}')"` : '';
// Raids in order: smaller raids (single-boss) first, then by name
const raidSize = r => { const m = raidMap(); return Object.keys(m).filter(b => m[b] === r).length || ((STATE.zones || []).find(z => z.name === r) || { bosses: [] }).bosses.length || 99; };
const raidOrderIdx = r => { const all = [...new Set(Object.values(raidMap()))].sort((a, b) => raidSize(a) - raidSize(b) || a.localeCompare(b)); const i = all.indexOf(r); return i < 0 ? 9 : i; };
const raidOrder = (a, b) => raidSize(a) - raidSize(b) || a.localeCompare(b);

function priorityHtml() {
  const buckets = { boss: {}, craft: {}, mplus: {}, other: {} };
  const pvpSkipped = [];
  raidPlayers().forEach(p => {
    const c = picked(p);
    if (isHealerP(p, c)) return;            // healers use Manual entry on Sims Priority
    if (inPvp(c)) { pvpSkipped.push(c); return; }
    ((c.bis && c.bis.need) || []).forEach(n => {
      const k = srcKind(n.source), bucket = buckets[k.kind];
      ((bucket[k.key] = bucket[k.key] || {})[c.name] = bucket[k.key][c.name] || { c, items: [] }).items.push(Object.assign({ sub: k.sub }, n));
    });
  });
  const block = (obj, order) => Object.keys(obj).map(k => ({ k, who: Object.values(obj[k]) }))
    .sort((a, b) => b.who.length - a.who.length || (order ? bossIdx(a.k) - bossIdx(b.k) : a.k.localeCompare(b.k)))
    .map((r, i) => `<div class="prio-row"><span class="rk">${i + 1}</span><span class="pb">${esc(r.k)}</span><span class="pc"><b>${r.who.length}</b> player${r.who.length === 1 ? '' : 's'}</span>
      <span class="pw">${r.who.map(w => `<span data-tip="${esc(w.items.map(n => slotName(n.slot) + ': ' + n.item + (n.sub ? ' (' + n.sub + ')' : '')).join('<br>'))}">${nameHtml(w.c)}${w.items.length > 1 ? ' <span class="hint">x' + w.items.length + '</span>' : ''}</span>`).join(' ')}</span></div>`).join('');
  const hasBis = raidPlayers().some(p => picked(p).bis);
  const none = what => `<p class="empty">${hasBis ? what : 'Fills in once BiS lists are added to the sheet.'}</p>`;
  $('prio-bosses').innerHTML = block(buckets.boss, true) || none('Nobody needs raid drops.');
  $('prio-craft').innerHTML = block(buckets.craft) || none('No crafted BiS left to make.');
  $('prio-mplus').innerHTML = block(buckets.mplus) || none('Nothing needed from Mythic+.');
  $('prio-other').innerHTML = block(buckets.other) || none('Nothing else needed.');
  if (pvpSkipped.length) $('prio-bosses').innerHTML += `<p class="hint" style="margin:10px 0 0">Not counted, in PvP gear: ${pvpSkipped.map(c => `${nameHtml(c)} <span class="hint">(${c.pvp.count}/${c.pvp.total})</span>`).join(' &middot; ')}</p>`;
}

/* ------------------------------------------------------------------ Loot Targets tab: BiS + Raidbots + manual entries in one list */
let lootView = store('apoLootView', 'boss');
const GOLD_PCT = 1;
const lootOpen = new Set();
const SRC_TAG = { bis: 'BiS', sim: 'Sim', bonus: 'Bonus', wish: 'Wish' };
const TRACKS = ['Explorer', 'Adventurer', 'Veteran', 'Champion', 'Hero', 'Myth'];
const trackRank = t => TRACKS.indexOf(t);
const crestShort = n => String(n || '').replace(/\s*Mistcrest$/i, '').replace(/\s*Crest$/i, '');
const trackTxt = t => `${t.t} ${t.l}/${t.m}`;
// Crests to bring every equipped item to 6/6, per crest type
function crestTotals(cs) { const o = {}; cs.forEach(c => (c.tracks || []).forEach(t => { if (t.c > 0) o[t.cn] = (o[t.cn] || 0) + t.c; })); return o; }
const crestOrder = (a, b) => trackRank(crestShort(b)) - trackRank(crestShort(a));
function lootWants() {
  const out = [], skipped = [], crest = [];
  raidPlayers().forEach(p => {
    const c = picked(p);
    if (inPvp(c)) { skipped.push(c); return; }
    const by = {};
    const add = (item, slot, where, src, pct, extra) => {
      const k = String(item || '').toLowerCase(); if (!k) return;
      const w = by[k] = by[k] || { c, p, item, slot: '', boss: '', where: '', kind: '', src: {}, pct: 0, bonusPct: 0 };
      if (!w.slot && slot) w.slot = slot;
      if (!w.boss && where) { const sk = srcKind(where); w.kind = sk.kind; w.boss = sk.kind === 'boss' ? sk.key : ''; w.where = sk.sub ? sk.sub + ' (' + sk.key + ')' : sk.key;
        if (w.boss) w.raid = w.boss === TRASH ? (sk.raid || '') : (raidMap()[w.boss] || sk.raid || raidOf(w.boss)); }
      w.src[src] = extra || true;
      if (src === 'sim') w.pct = Math.max(w.pct, pct || 0);
      if (src === 'bonus') w.bonusPct = Math.max(w.bonusPct, pct || 0);
    };
    if (!isHealerP(p, c)) ((c.bis && c.bis.need) || []).forEach(n => add(n.item, slotName(n.slot), n.source, 'bis'));
    [['drops', 'sim'], ['bonus', 'bonus']].forEach(([kind, src]) => { const sim = simOf(c, kind);
      if (sim) sim.rows.filter(r => r.pct > 0).forEach(r => add(r.item, slotLabel(r.slot), simWhere(r.boss), src, r.pct)); });
    wishOf(c).filter(w => !w.have).forEach(w => add(w.item, w.slot, w.boss ? (/^trash/i.test(w.boss) ? 'Trash drop (' + mainRaid() + ')' : w.boss) : 'Other', 'wish', 0, w.note || true));
    // Gold = worth chasing on our Heroic kills: a Heroic sim upgrade of 1%+, or an officer's manual entry.
    // (BiS lists are Mythic gear and bonus rolls are personal loot, so neither makes an item gold.)
    // Already wearing it? Same track as the sim (or better) = upgrade it with crests, not a drop to chase.
    // A lower track (wearing Hero, the sim wants Myth) stays a drop target, noted on the chip.
    const own = {}; (c.tracks || []).forEach(t => { own[t.n.toLowerCase()] = t; });
    Object.values(by).forEach(w => { w.n = Object.keys(w.src).length; w.strong = !!w.src.wish || (!!w.src.sim && w.pct >= GOLD_PCT); w.best = Math.max(w.pct, w.bonusPct);
      const o = own[String(w.item).toLowerCase()];
      if (o && (w.src.sim || w.src.bonus)) {
        const want = w.src.bonus ? 'Myth' : 'Hero';
        if (trackRank(o.t) >= trackRank(want)) {
          if (o.c <= 0) return;                 // already maxed on that track (or better): nothing to get or upgrade
          w.owned = o; crest.push(w); return;  // same track, not maxed: upgrade it with crests
        }
        w.ownedLower = o;
      }
      out.push(w); });
  });
  return { wants: out, skipped, crest };
}
const tagsHtml = w => Object.keys(SRC_TAG).filter(k => w.src[k]).map(k => `<span class="tag ${k}"${k === 'wish' && typeof w.src.wish === 'string' ? ` data-tip="${esc(w.src.wish)}"` : ''}>${SRC_TAG[k]}${
  k === 'sim' && w.pct ? ' +' + w.pct.toFixed(1) + '%' : k === 'bonus' && w.bonusPct ? ' +' + w.bonusPct.toFixed(1) + '%' : ''}</span>`).join('');
const ownTag = w => w.ownedLower ? `<span class="tag own" data-tip="Wearing it at ${esc(trackTxt(w.ownedLower))} (${w.ownedLower.il}); the sim is for the ${w.src.bonus ? 'Myth' : 'Hero'} version">owns ${esc(trackTxt(w.ownedLower))}</span>` : '';
const wantChip = (w, showWho) => `<span class="want${w.strong ? ' strong' : ''}">${showWho ? nameHtml(w.c) + ' ' : ''}<span class="wi" data-tip="${esc((w.slot ? w.slot + ': ' : '') + w.item + (w.where ? '<br>' + w.where : ''))}">${esc(w.item)}</span>${tagsHtml(w)}${ownTag(w)}</span>`;
// Bonus roll suggestions (2 rolls a week): raid bosses ranked by the biggest single sim gain, then by how many items are wanted
function bonusTargets(list) {
  const by = {};
  list.filter(w => w.boss && w.boss !== TRASH).forEach(w => { const x = by[w.boss] = by[w.boss] || { boss: w.boss, best: 0, top: null, n: 0, items: 0 };
    x.items++; x.n += 1; if (w.best > x.best) { x.best = w.best; x.top = w; } });
  return Object.values(by).sort((a, b) => b.best - a.best || b.n - a.n || bossIdx(a.boss) - bossIdx(b.boss)).slice(0, 2)
    .map(x => ({ boss: x.boss, why: x.top ? `${x.top.item} +${x.best.toFixed(1)}%` : `${x.items} wanted item${x.items === 1 ? '' : 's'}` }));
}
const starHtml = (i, t) => `<span class="br-star" data-tip="Bonus roll ${i + 1}: ${esc(t.why)}">&#9733;${i + 1}</span>`;
// Summary tiles: one per raid (its bosses), then crafting, Mythic+, tier & other
const CREST_COLOR = { Myth: '#ff8000', Hero: '#a335ee', Champion: '#0070dd', Veteran: '#1eff00', Adventurer: '#9d9d9d' };
function lootTiles(wants, players, crestUps) {
  const raids = [...new Set(wants.filter(w => w.boss).map(w => w.raid || 'Other'))]
    .sort(raidOrder);
  const bar = (label, n, max, who, sub) => `<div class="lt-row"><span class="lt-l">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="lt-bar"><span style="width:${Math.max(4, n / max * 100)}%"></span></span><b data-tip="${n} item${n === 1 ? '' : 's'} wanted by ${who} raider${who === 1 ? '' : 's'}">${n}</b></div>`;
  const tile = (title, rows, view) => {
    const max = Math.max(1, ...rows.map(r => r.n));
    return `<div class="lt-tile" data-lootview="${view}"><div class="lt-head"><b>${esc(title)}</b><span class="hint">${(t => t + ' item' + (t === 1 ? '' : 's'))(rows.reduce((a, r) => a + r.n, 0))}</span></div>
      ${rows.map(r => bar(r.k, r.n, max, r.who, r.sub)).join('') || '<p class="hint" style="margin:0">Nothing needed</p>'}</div>`;
  };
  const rowsOf = (ws, keyFn, order) => { const g = {}; ws.forEach(w => { const k = keyFn(w); (g[k] = g[k] || []).push(w); });
    return Object.keys(g).map(k => ({ k, n: g[k].length, who: new Set(g[k].map(w => w.c)).size })).sort(order || ((a, b) => b.n - a.n)); };
  // Raids: every boss ranked like By Boss (raiders, then gold items, then total sim gain), with its raid underneath
  const rg = {}; wants.filter(w => w.boss).forEach(w => { const k = w.boss + '|' + (w.raid || 'Other'); (rg[k] = rg[k] || []).push(w); });
  const raidRows = Object.keys(rg).map(k => { const ws = rg[k], [boss, raid] = k.split('|');
    return { k: boss, sub: raid, n: ws.length, who: new Set(ws.map(w => w.c)).size, strong: ws.filter(w => w.strong).length, pct: ws.reduce((a, w) => a + w.pct, 0) }; })
    .sort((a, b) => b.who - a.who || b.strong - a.strong || b.pct - a.pct || bossIdx(a.k) - bossIdx(b.k));
  const tot = crestTotals(players), crestTile = `<div class="lt-tile" data-lootview="player"><div class="lt-head"><b>Crests to max gear</b><span class="hint">raid team, equipped items to 6/6</span></div>
      ${Object.keys(tot).sort(crestOrder).map(k => `<div class="lt-row"><span class="lt-l">${esc(crestShort(k))}</span><span class="lt-bar"><span style="width:${Math.max(4, tot[k] / Math.max(...Object.values(tot)) * 100)}%;background:${CREST_COLOR[crestShort(k)] || '#3987e5'}"></span></span><b>${tot[k].toLocaleString()}</b></div>`).join('') || '<p class="hint" style="margin:0">Fills in after the next refresh</p>'}
      ${crestUps ? `<p class="hint" style="margin:8px 0 0">${crestUps} sim upgrade${crestUps === 1 ? ' is an item' : 's are items'} already owned: upgrade with crests</p>` : ''}</div>`;
  return tile('Raids', raidRows, 'boss') +
    tile('Crafting', rowsOf(wants.filter(w => w.kind === 'craft'), w => w.where), 'other') +
    tile('Other', rowsOf(wants.filter(w => w.kind === 'mplus' || w.kind === 'other' || (!w.kind && !w.boss)), w => w.kind === 'mplus' ? 'M+: ' + w.where.replace(/^.*\((.*)\)$/, '$1') : (w.where || 'Other')), 'other');
}

function lootHtml() {
  const { wants, skipped, crest } = lootWants();
  const players = [...new Set(wants.map(w => w.c))];
  $('loot-hint').textContent = `${players.length} raiders · ${wants.length} wanted items (one per item per raider) · ${wants.filter(w => w.strong).length} gold`;
  $('loot-view').innerHTML = [['boss', 'By Boss'], ['player', 'By Player'], ['other', 'Crafting, Mythic+ & other']].map(([k, l]) => `<button type="button" class="chip${lootView === k ? ' on' : ''}" data-lootview="${k}">${l}</button>`).join('');
  const skippedHtml = skipped.length ? `<p class="hint" style="margin:10px 0 0">Not counted, in PvP gear: ${skipped.map(c => nameHtml(c)).join(' &middot; ')}</p>` : '';
  let body = '';
  const targets = new Map(players.map(c => [c, bonusTargets(wants.filter(w => w.c === c))]));
  // One tile per boss (or dungeon): counts at a glance, click to list who needs what
  const tileOf = (key, title, sub, ws, rank) => {
    const who = [...new Set(ws.map(w => w.c))], strong = ws.filter(w => w.strong).length, pct = ws.reduce((a, w) => a + w.pct, 0);
    const rollers = players.filter(c => targets.get(c).some(t => t.boss === title));
    const open = lootOpen.has(key);
    return `<div class="boss-tile${open ? ' open' : ''}${artOf(title) || artOf(sub) ? ' has-art' : ''}"${artStyle(artOf(title) ? title : sub)}>
      <div class="bt-top" data-loottile="${esc(key)}">${rank ? `<span class="lb-rank">${rank}</span>` : ''}<div class="bt-title"><span class="lb-name">${esc(title)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div><span class="dc-caret">${open ? '&#9652;' : '&#9662;'}</span></div>
      <div class="bt-stats" data-loottile="${esc(key)}"><span><b>${who.length}</b> raider${who.length === 1 ? '' : 's'}</span><span><b>${ws.length}</b> item${ws.length === 1 ? '' : 's'}</span>${strong ? `<span class="strong-lbl">${strong} gold</span>` : ''}${pct ? `<span class="up">+${pct.toFixed(1)}% heroic sim</span>` : ''}${rollers.length ? `<span class="br-count" data-tip="Bonus roll suggestion for ${esc(rollers.map(c => c.name).join(', '))}">&#9733; ${rollers.length}</span>` : ''}</div>
      ${open ? `${rollers.length ? `<div class="lb-roll">&#9733; Bonus roll: ${rollers.map(c => nameHtml(c)).join(' ')}</div>` : ''}<div class="lb-wants">${ws.sort((a, b) => b.strong - a.strong || b.best - a.best || a.c.name.localeCompare(b.c.name)).map(w => wantChip(w, true)).join('')}</div>` : ''}</div>`;
  };
  const rank = list => list.map(b => ({ b, ws: wants.filter(w => w.boss === b.k && (w.raid || 'Other') === b.raid) }))
    .map(x => Object.assign(x, { who: new Set(x.ws.map(w => w.c)).size, strong: x.ws.filter(w => w.strong).length, pct: x.ws.reduce((a, w) => a + w.pct, 0) }))
    .sort((x, y) => y.who - x.who || y.strong - x.strong || y.pct - x.pct || bossIdx(x.b.k) - bossIdx(y.b.k));
  if (lootView === 'boss') {
    const raids = [...new Set(wants.filter(w => w.boss).map(w => w.raid || 'Other'))].sort(raidOrder);
    // Single-boss raids share one card (each tile names its raid); bigger raids get their own card
    const bossesIn = r => [...new Set(wants.filter(w => w.boss && (w.raid || 'Other') === r).map(w => w.boss))];
    const small = raids.filter(r => bossesIn(r).length === 1 && r !== 'Other');
    const smallCard = small.length ? (() => { const list = rank(small.map(r => ({ k: bossesIn(r)[0], raid: r })));
      return `<div class="card loot-raid"><div class="card-head"><h2>${small.map(esc).join(' &middot; ')}</h2><span class="hint">single-boss raids &middot; click a boss for who needs what</span></div>
        <div class="boss-grid">${list.map((x, i) => tileOf('b|' + x.b.raid + '|' + x.b.k, x.b.k, x.b.raid, x.ws, i + 1)).join('')}</div></div>`; })() : '';
    body = smallCard + raids.filter(r => !small.includes(r)).map(raid => {
      const list = rank([...new Set(wants.filter(w => w.boss && (w.raid || 'Other') === raid).map(w => w.boss))].map(k => ({ k, raid })));
      const raiders = new Set(wants.filter(w => w.boss && (w.raid || 'Other') === raid).map(w => w.c)).size;
      return `<div class="card loot-raid"><div class="card-head"><h2>${esc(raid)}</h2><span class="hint">${raiders} raider${raiders === 1 ? '' : 's'} want${raiders === 1 ? 's' : ''} something &middot; ranked by raiders, then gold items, then Heroic sim gain &middot; click a boss for who needs what</span></div>
        <div class="boss-grid">${list.map((x, i) => tileOf('b|' + raid + '|' + x.b.k, x.b.k === TRASH ? 'Trash drops' : x.b.k, x.b.k === TRASH ? raid : '', x.ws, i + 1)).join('')}</div></div>`;
    }).join('') || '<div class="card"><p class="empty">Nothing wanted from the raid yet.</p></div>';
    body += skippedHtml ? `<div class="card">${skippedHtml}</div>` : '';
  } else if (lootView === 'player') {
    // One tile per raider: totals and bonus roll picks; click for everything they need, grouped by boss
    const pOf = c => (STATE.roster || []).find(p => toonsOfP(p).includes(c));
    body = `<div class="card"><div class="card-head"><h2>By Player</h2><span class="hint">&#9733; = recommended bonus rolls (2 a week): biggest single sim gain, else most wanted items &middot; click a raider for everything they need</span></div>
      <div class="boss-grid">${players.sort((a, b) => a.name.localeCompare(b.name)).map(c => {
      const ws = wants.filter(w => w.c === c), ts = targets.get(c), key = 'p|' + c.name + '|' + c.realm, open = lootOpen.has(key), p = pOf(c);
      const cnt = { Raid: ws.filter(w => w.boss).length, Craft: ws.filter(w => w.kind === 'craft').length, 'M+': ws.filter(w => w.kind === 'mplus').length,
        Other: ws.filter(w => !w.boss && w.kind !== 'craft' && w.kind !== 'mplus').length };
      const gold = ws.filter(w => w.strong).length;
      const ct = crestTotals([c]), cups = crest.filter(w => w.c === c), notMax = (c.tracks || []).filter(t => t.c > 0).sort((a, b) => trackRank(b.t) - trackRank(a.t) || b.c - a.c);
      // Front of the tile: crests needed to bring their gear to 6/6 (details when opened)
      // Only raiders with pieces to upgrade get the blue line (easy to scan for); the space stays so tiles line up
      const crestLine = `<div class="pt-crests${Object.keys(ct).length ? '' : ' pt-none'}" data-loottile="${esc(key)}"><div class="pt-ch">Upgrade with crests</div><div class="pt-row">${Object.keys(ct).length
        ? Object.keys(ct).sort(crestOrder).map(k => `<b style="color:${CREST_COLOR[crestShort(k)] || '#ddd'}">${ct[k]} ${esc(crestShort(k))}</b>`).join(' &middot; ')
        : `<span class="hint">${c.tracks ? 'none, all gear maxed' : 'after the next refresh'}</span>`}</div></div>`;
      const crestHtml = (cups.length ? `<div class="lp-group"><div class="lp-boss">Upgrade with crests: items you own that the sims say are worth it (biggest gain first)</div>${cups.slice().sort((a, b) => b.best - a.best).map(w => `<span class="want crest-up"><span class="wi">${esc(w.item)}</span>${tagsHtml(w)}<span class="tag own">${esc(trackTxt(w.owned))} &rarr; ${w.owned.m}/${w.owned.m}: ${w.owned.c} ${esc(crestShort(w.owned.cn))}</span></span>`).join('')}</div>` : '') +
        (notMax.length ? `<div class="lp-group"><div class="lp-boss">Gear not at max upgrade</div><table class="logs-table crest-table"><tbody>${notMax.map(t => `<tr><td class="hint">${esc(t.s)}</td><td>${esc(t.n)}</td><td style="color:${CREST_COLOR[t.t] || '#ddd'}">${esc(trackTxt(t))}</td><td class="hint">${t.il} &rarr; ${t.mx}</td><td><b>${t.c}</b> ${esc(crestShort(t.cn))}</td></tr>`).join('')}</tbody></table></div>` : '');
      const groups = {}; ws.forEach(w => { const g = w.boss || (w.kind === 'craft' ? 'Crafted: ' + w.where : w.kind === 'mplus' ? 'M+: ' + w.where.replace(/^.*\((.*)\)$/, '$1') : w.where) || 'Other'; (groups[g] = groups[g] || []).push(w); });
      const gOrder = g => g === TRASH ? 900 : bossList().includes(g) ? raidOrderIdx(raidOf(g)) * 100 + bossIdx(g) : /^Crafted/.test(g) ? 950 : /^M\+/.test(g) ? 960 : 990;
      const art = ts[0] ? ts[0].boss : '';
      return `<div class="boss-tile player-tile${open ? ' open' : ''}${artOf(art) ? ' has-art' : ''}"${artStyle(art)} style="--accent:${accentFor(c.cls)}">
        <div class="bt-top" data-loottile="${esc(key)}">${classIcon(c.cls)}<div class="bt-title"><span class="lb-name" style="color:${classHex(c.cls)}">${esc(c.name)}</span><small>${p ? roleIcon(bucketOf(p) === 'Tanks' ? 'Tank' : bucketOf(p) === 'Healers' ? 'Healer' : 'DPS') + ' ' : ''}${esc(c.spec || '')}</small></div>${gold ? `<span class="strong-lbl pt-gold">${gold} gold</span>` : ''}<span class="dc-caret">${open ? '&#9652;' : '&#9662;'}</span></div>
        <div class="bt-stats pt-row" data-loottile="${esc(key)}"><span><b>${ws.length}</b> wanted</span>${Object.keys(cnt).filter(k => cnt[k]).map(k => `<span>${k} <b>${cnt[k]}</b></span>`).join('')}</div>
        ${crestLine}<div class="pt-rolls" data-loottile="${esc(key)}">${[0, 1].map(i => ts[i] ? `<div class="pt-row" data-tip="${esc(ts[i].boss + ': ' + ts[i].why)}">${starHtml(i, ts[i])} <b>${esc(ts[i].boss)}</b> <span class="hint">${esc(ts[i].why)}</span></div>`
          : `<div class="pt-row hint">${i === 0 ? 'No raid boss to bonus roll yet' : '&nbsp;'}</div>`).join('')}</div>
        ${open ? `<div class="pt-groups">${crestHtml ? `<div class="pt-crestbox">${crestHtml}</div>` : ''}${Object.keys(groups).sort((a, b) => gOrder(a) - gOrder(b) || a.localeCompare(b)).map(g => `<div class="lp-group"><div class="lp-boss">${esc(g)}${ts.findIndex(t => t.boss === g) >= 0 ? ' ' + starHtml(ts.findIndex(t => t.boss === g), ts.find(t => t.boss === g)) : ''}</div>${groups[g].map(w => wantChip(w, false)).join('')}</div>`).join('')}</div>` : ''}</div>`;
    }).join('') || '<p class="empty">Nothing wanted yet.</p>'}</div></div>${skippedHtml ? `<div class="card">${skippedHtml}</div>` : ''}`;
  } else {
    const dung = {}; wants.filter(w => w.kind === 'mplus').forEach(w => { const d = w.where.replace(/^.*\((.*)\)$/, '$1'); (dung[d] = dung[d] || []).push(w); });
    const dList = Object.keys(dung).sort((a, b) => new Set(dung[b].map(w => w.c)).size - new Set(dung[a].map(w => w.c)).size || dung[b].length - dung[a].length);
    const listCard = (title, ws, groupOf) => { const groups = {}; ws.forEach(w => { const g = groupOf(w); (groups[g] = groups[g] || []).push(w); });
      return `<div class="card"><div class="card-head"><h2>${title}</h2><span class="hint">${ws.length} item${ws.length === 1 ? '' : 's'}</span></div>
        ${Object.keys(groups).sort().map(g => `<div class="loot-boss"><div class="lb-head"><span class="lb-name">${esc(g)}</span><span class="lb-stats"><span><b>${new Set(groups[g].map(w => w.c)).size}</b> raider${new Set(groups[g].map(w => w.c)).size === 1 ? '' : 's'}</span></span></div>
          <div class="lb-wants">${groups[g].map(w => wantChip(w, true)).join('')}</div></div>`).join('') || '<p class="empty">Nothing here.</p>'}</div>`; };
    body = `<div class="card"><div class="card-head"><h2>Mythic+ dungeons</h2><span class="hint">from BiS lists and the Bonus rolls &amp; vault sim &middot; click a dungeon for who needs what</span></div>
        <div class="boss-grid">${dList.map(d => tileOf('d|' + d, d, 'Mythic+', dung[d], 0)).join('') || '<p class="empty">Nothing needed from Mythic+.</p>'}</div></div>` +
      listCard('Crafting', wants.filter(w => w.kind === 'craft'), w => w.where || 'Other') +
      listCard('Tier &amp; other', wants.filter(w => w.kind === 'other' || (!w.kind && !w.boss)), w => w.where || 'Other');
  }
  $('loot-tiles').innerHTML = lootTiles(wants, raidPlayers().map(picked).filter(c => !inPvp(c)), crest.length);
  $('loot-body').innerHTML = body;
}

/* ------------------------------------------------------------------ Sims Priority tab */
const SIM_KINDS = { drops: 'Heroic drops (6/6)', bonus: 'Bonus rolls & vault' };
const SIM_TABS = Object.assign({}, SIM_KINDS, { manual: 'Manual entry' });   // Raidbots kinds + hand-picked items
let simKind = store('apoSimKind', 'drops');
let simMsg = '';
let simView = store('apoSimView', 'player');
let wishMsg = '';
let setupMsg = '';   // Drops section: by player or by boss
let officerKey = (() => { try { return localStorage.getItem('apoOfficerKey') || ''; } catch (e) { return ''; } })();
const simsOf = c => (STATE.sims || []).filter(x => x.name.toLowerCase() === String(c.name).toLowerCase() && (!x.realm || x.realm === String(c.realm).toLowerCase()));
const simOf = (c, kind) => simsOf(c).find(x => x.kind === kind);
const SLOT_LABEL = { head: 'Head', neck: 'Neck', shoulder: 'Shoulder', shoulders: 'Shoulder', back: 'Back', chest: 'Chest', wrist: 'Wrist', wrists: 'Wrist', hands: 'Hands',
  waist: 'Waist', legs: 'Legs', feet: 'Feet', finger1: 'Ring', finger2: 'Ring', trinket1: 'Trinket', trinket2: 'Trinket', main_hand: 'Main hand', off_hand: 'Off hand' };
const slotLabel = sl => SLOT_LABEL[sl] || sl;
const STALE_DAYS = 14;
const ageDays = d => { const t = Date.parse(String(d).replace(' ', 'T')); return isNaN(t) ? null : (Date.now() - t) / 86400000; };
const dateHtml = sim => { if (!sim) return '<span class="stale">never</span>'; const a = ageDays(sim.date);
  return `<span class="${a != null && a > STALE_DAYS ? 'stale' : 'fresh'}" data-tip="${a != null ? Math.floor(a) + ' days ago' : ''}${a > STALE_DAYS ? ': older than 2 weeks, run it again' : ''}">${esc(String(sim.date).slice(0, 10))}</span>`; };
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
    <div class="hint" style="margin-top:4px">Imported ${dateHtml(sim)} &middot; <a href="${esc(sim.url)}" target="_blank" rel="noopener">report</a>${officerKey ? ` &middot; <a href="#sims" data-simdel="${esc(sim.name + '|' + sim.realm + '|' + sim.kind)}">remove</a>` : ''}</div>`;
}

/* Who can be simmed on Raidbots: not healers (they use the manual wishlist), not in PvP gear, and in the spec they're
   marked as: a main by the Raid role column, a secondary main by an offspec note naming them, otherwise the player's role. */
const isHealerP = (p, c) => p.role === 'Healer' || (c && c.role === 'HEALING');
function expectedSection(p, c) {
  if (c !== p.main) { const o = offspecsOf(p).find(x => x.alt && x.toon.name === c.name); if (o) return o.section; }
  return playerSection(p);
}
function simStatus(p) {
  const c = picked(p);
  if (c.error && !c.cls) return { c, ok: false, why: 'Not found on Raider.io' };
  if (inPvp(c)) return { c, ok: false, why: pvpText(c) };
  const want = expectedSection(p, c), now = sectionOf(c.role, c.cls, c.spec);
  if (want !== now) return { c, ok: false, why: `${c.spec || '?'} spec, marked as ${want.replace(/s$/, '')}` };
  return { c, ok: true };
}
const simPlayers = () => raidPlayers().filter(p => !isHealerP(p, picked(p)));
const healerPlayers = () => raidPlayers().filter(p => isHealerP(p, picked(p)));
const wishOf = c => (STATE.wishlist || []).filter(w => w.name.toLowerCase() === String(c.name).toLowerCase() && (!w.realm || w.realm === String(c.realm).toLowerCase()));

function simsHtml() {
  const stat = simPlayers().map(simStatus), ready = stat.filter(x => x.ok), notReady = stat.filter(x => !x.ok);
  const team = ready.map(x => x.c);
  const kinds = Object.keys(SIM_KINDS), setupOf = k => k === 'drops' ? rbSetup() : rbBonus();
  const allWish = (STATE.wishlist || []);
  const rbIcons = `<span class="st-ic">${roleIcon('Tank')}${roleIcon('DPS')}</span>`;
  $('sim-kind-chips').innerHTML = kinds.map(k => `<button type="button" class="sim-tab${simKind === k ? ' on' : ''}" data-simkind="${k}"><span>${SIM_KINDS[k]} ${rbIcons} <span class="st-src">(Raidbots)</span></span>
    <span class="hint">${team.filter(c => simOf(c, k) && ageDays(simOf(c, k).date) <= STALE_DAYS).length}/${team.length} current</span></button>`).join('') +
    `<button type="button" class="sim-tab${simKind === 'manual' ? ' on' : ''}" data-simkind="manual"><span>Manual entry <span class="st-ic">${roleIcon('Healer')}</span> <span class="st-src">(healers &amp; odd cases)</span></span><span class="hint">${allWish.filter(w => !w.have).length} wanted &middot; ${allWish.filter(w => w.have).length} got</span></button>`;
  if (simKind === 'manual') { manualHtml(); return; }
  $('sim-chart-title').textContent = 'Raidbots upgrade value by boss';
  $('drops-hint').textContent = "every raider's Heroic and Bonus sim upgrades plus manual entries (picked toons); click a card for the items; By Boss follows the tab above";
  $('sim-run').style.display = 'none';   // the run panel lives on the Upload Sims tab (officers)
  // Chart: for each boss, the sum of every raider's best upgrade % from that boss (who gains most if it dies)
  const byBoss = {};
  team.forEach(c => { const sim = simOf(c, simKind); if (!sim) return;
    const bestPer = {};
    sim.rows.filter(r => r.pct > 0 && r.boss).forEach(r => { const b = isTrashName(r.boss) ? TRASH : r.boss; if (!bestPer[b] || r.pct > bestPer[b].pct) bestPer[b] = r; });
    Object.keys(bestPer).forEach(b => { (byBoss[b] = byBoss[b] || []).push({ c, r: bestPer[b] }); });
  });
  const bars = Object.keys(byBoss).map(b => ({ b, who: byBoss[b].sort((x, y) => y.r.pct - x.r.pct), total: byBoss[b].reduce((a, x) => a + x.r.pct, 0) })).sort((a, b) => b.total - a.total);
  const simmed = team.filter(c => simOf(c, simKind)).length;
  $('sim-chart-hint').textContent = `${SIM_KINDS[simKind]} · ${simmed} of ${team.length} raiders · each bar = total % DPS the raid gains from that boss's best upgrades`;
  const barList = list => { const max = list.length ? list[0].total : 1;
    return `<div class="bars">${list.map(x => `<div class="bar-row"><span class="bl">${esc(x.b)}</span>
      <div class="bt"><div class="bf" style="width:${(x.total / max * 100).toFixed(1)}%"></div><span class="bv">+${x.total.toFixed(2)}%</span></div>
      <span class="bw">${x.who.map(w => `<span data-tip="${esc(w.r.item)}: ${pctTxt(w.r.pct)}">${nameHtml(w.c)} <span class="hint">${pctTxt(w.r.pct)}</span></span>`).join(' ')}</span></div>`).join('')}</div>`; };
  const raidBars = bars.filter(x => x.b === TRASH || isRaidBoss(x.b)), dungBars = bars.filter(x => !(x.b === TRASH || isRaidBoss(x.b)));
  $('sim-chart').innerHTML = bars.length ? (raidBars.length ? `<div class="sec-title"><span>Raid bosses</span></div>${barList(raidBars)}` : '') +
      (dungBars.length ? `<div class="sec-title" style="margin-top:14px"><span>Dungeons (Mythic+)</span><span class="hint">from the bonus roll &amp; vault sim</span></div>${barList(dungBars)}` : '')
    : `<p class="empty">${simmed ? 'No upgrades in the imported reports.' : 'Import Droptimizer reports to fill this chart.'}</p>`;
  // Drops: by player or by boss (for the selected kind); healers' open wishlist items count under their boss
  $('sim-view-chips').innerHTML = DROP_VIEWS.map(([k, l]) => `<button type="button" class="chip${simView === k ? ' on' : ''}" data-simview="${k}">${l}</button>`).join('');
  if (simView === 'boss') {
    const order = b => bossList().indexOf(b) + 1 || 99;
    const names = bars.map(x => x.b);
    $('sim-cards').innerHTML = names.length ? `<div class="sim-grid">${names.sort((a, b) => order(a) - order(b)).map(b => {
      const x = bars.find(y => y.b === b);
      const rows = [];
      team.forEach(c => { const sim = simOf(c, simKind); if (!sim) return; sim.rows.filter(r => r.pct > 0 && r.boss === b).forEach(r => rows.push({ c, r })); });
      rows.sort((a, c2) => c2.r.pct - a.r.pct);
      return `<div class="char sim-card"><div class="name-row"><span class="char-name">${esc(b)}</span><span class="hint" style="margin-left:auto">${x ? `${x.who.length} simmed &middot; best total <b class="sp up2">+${x.total.toFixed(2)}%</b>` : ''}</span></div>
        <div class="sim-rows">${rows.map(({ c, r }) => `<div class="sim-row boss-row"><span>${nameHtml(c)}</span><span class="sn"><span class="si" data-tip="${esc(r.item)}${r.ilvl ? ' (' + r.ilvl + ')' : ''}">${esc(r.item)}</span><span class="hint sb">${esc(slotLabel(r.slot))}${r.ilvl ? ' &middot; ' + r.ilvl : ''}</span></span>
          <b class="sp ${pctCls(r.pct)}" data-tip="${r.dps > 0 ? '+' : ''}${Math.round(r.dps).toLocaleString()} DPS">${pctTxt(r.pct)}</b></div>`).join('')}</div></div>`; }).join('')}</div>`
      : `<p class="empty">No upgrades imported for ${esc(SIM_KINDS[simKind])} yet.</p>`;
    return;
  }
  $('sim-cards').innerHTML = dropCardsHtml();
}

/* Drops cards (all three Sims Priority tabs): every raider, their Heroic and Bonus sim upgrades plus manual entries,
   collapsed to one line per boss; click to show the items. By Player or By Role (Tanks / Healers / DPS). */
const dropOpen = new Set();
const ROLE_BUCKETS = [['Tanks', 'Tank'], ['Healers', 'Healer'], ['DPS', 'DPS']];
const bucketOf = p => { const s2 = playerSection(p); return s2 === 'Tanks' || s2 === 'Healers' ? s2 : 'DPS'; };
function dropItems(c) {
  const out = [];
  [['drops', 'sim'], ['bonus', 'bonus']].forEach(([kind, src]) => { const sim = simOf(c, kind);
    if (sim) sim.rows.filter(r => r.pct > 0).forEach(r => out.push({ src, item: r.item, slot: slotLabel(r.slot), boss: bossOfSrc(r.boss) || r.boss || 'Other', pct: r.pct, dps: r.dps, ilvl: r.ilvl })); });
  wishOf(c).forEach(w => out.push({ src: 'wish', item: w.item, slot: w.slot || '', boss: w.boss || 'Other', have: w.have, note: w.note, added: w.added, w }));
  return out;
}
function dropCard(p, st) {
  const c = st.c, items = dropItems(c), key = c.name + '-' + c.realm, open = dropOpen.has(key);
  const by = {}; items.forEach(x => { (by[x.boss] = by[x.boss] || []).push(x); });
  const best = list => Math.max(0, ...list.map(x => x.pct || 0));
  const bosses = Object.keys(by).sort((a, b) => best(by[b]) - best(by[a]) || by[b].filter(x => x.src === 'wish' && !x.have).length - by[a].filter(x => x.src === 'wish' && !x.have).length || bossIdx(a) - bossIdx(b));
  const tag = (src, list) => { const xs = list.filter(x => x.src === src && !x.have); if (!xs.length) return '';
    return `<span class="tag ${src === 'wish' ? 'wish' : src}">${src === 'sim' ? 'Heroic' : src === 'bonus' ? 'Bonus' : 'Wish'}${src === 'wish' ? (xs.length > 1 ? ' ×' + xs.length : '') : ' +' + best(xs).toFixed(1) + '%'}</span>`; };
  const itemRow = x => `<div class="sim-row${x.have ? ' wish-row got' : ''}"><span class="slot">${esc(x.slot || '')}</span><span class="sn"><span class="si" data-tip="${esc(x.item)}${x.ilvl ? ' (' + x.ilvl + ')' : ''}">${esc(x.item)}</span>
      <span class="hint sb">${x.src === 'wish' ? 'manual entry' + (x.note ? ' &middot; ' + esc(x.note) : '') + (x.added ? ' &middot; added ' + esc(x.added) : '') : (x.src === 'sim' ? 'Heroic drops sim' : 'Bonus / vault sim') + (x.ilvl ? ' &middot; ' + x.ilvl : '')}</span></span>
    <span>${x.src === 'wish' ? (x.have ? '<span class="pill ok">&#10003; got it</span>' : '<span class="pill wish">wanted</span>') + (officerKey ? ` <a class="hint" href="#sims" data-wishdel="${esc(c.name + '|' + c.realm + '|' + x.item + '|' + x.w.kind)}">remove</a>` : '')
      : `<b class="sp ${pctCls(x.pct)}" data-tip="${x.dps > 0 ? '+' : ''}${Math.round(x.dps || 0).toLocaleString()} DPS">${pctTxt(x.pct)}</b>`}</span></div>`;
  const healer = isHealerP(p, c);
  const dates = healer ? '' : `<div class="dc-dates hint">Heroic ${dateHtml(simOf(c, 'drops'))} &middot; Bonus ${dateHtml(simOf(c, 'bonus'))}</div>`;
  return `<div class="char sim-card drop-card${st.ok || healer ? '' : ' dim'}${open ? ' open' : ''}" style="--accent:${accentFor(c.cls)}">
    <div class="name-row" data-droptoggle="${esc(key)}">${classIcon(c.cls)}<span class="char-name">${esc(c.name)}</span>${profileLinks(c.name, c.realm)}
      <span class="hint" style="margin-left:auto">${roleIcon(bucketOf(p) === 'Tanks' ? 'Tank' : bucketOf(p) === 'Healers' ? 'Healer' : 'DPS')} ${esc(c.spec || '')}</span><span class="dc-caret">${open ? '&#9652;' : '&#9662;'}</span></div>
    ${!st.ok && !healer ? `<p style="margin:6px 0 0"><span class="pill warn">${esc(st.why)}</span></p>` : ''}${dates}
    ${bosses.length ? `<div class="dc-bosses">${bosses.map(b => `<div class="dc-boss"><div class="dc-bh" data-droptoggle="${esc(key)}"><b>${esc(b)}</b><span class="hint">${by[b].length} item${by[b].length === 1 ? '' : 's'}</span><span class="dc-tags">${tag('sim', by[b])}${tag('bonus', by[b])}${tag('wish', by[b])}</span></div>
      ${open ? `<div class="sim-rows">${by[b].sort((x, y) => (y.pct || 0) - (x.pct || 0)).map(itemRow).join('')}</div>` : ''}</div>`).join('')}</div>`
      : `<p class="empty" style="margin:8px 0 0">${healer ? 'No manual entries yet.' : 'No reports imported or manual entries yet.'}</p>`}</div>`;
}
function dropCardsHtml() {
  const all = raidPlayers().map(p => ({ p, st: simStatus(p) }));
  const byName = (a, b) => a.st.c.name.localeCompare(b.st.c.name);
  if (simView === 'role') return ROLE_BUCKETS.map(([sec, r]) => { const ps = all.filter(x => bucketOf(x.p) === sec).sort(byName);
    return ps.length ? `<div class="role-sec"><div class="section-title"><h2>${roleIcon(r)} ${sec}</h2><span class="hint">${ps.length}</span></div><div class="sim-grid">${ps.map(x => dropCard(x.p, x.st)).join('')}</div></div>` : ''; }).join('');
  return `<div class="sim-grid">${all.sort(byName).map(x => dropCard(x.p, x.st)).join('')}</div>`;
}
const DROP_VIEWS = [['player', 'By Player'], ['role', 'By Role'], ['boss', 'By Boss']];

/* Manual entry tab: hand-picked items (healers, or anyone), crossed off once they equip the item */
function manualHtml() {
  const rp = raidPlayers(), all = rp.map(picked);
  const healers = healerPlayers().map(picked), others = all.filter(c => !healers.includes(c));
  const wantedBy = c => wishOf(c).filter(w => !w.have);
  $('sim-run').style.display = 'none';   // the add form lives on the Upload Sims tab (officers)
  $('sim-chart-title').textContent = 'Wanted items by boss';
  $('drops-hint').textContent = "every raider's sims and manual entries (picked toons); click a card for the items; By Boss shows manual entries";
  // Chart: wanted items per boss
  const wanted = all.flatMap(c => wantedBy(c).map(w => ({ c, w })));
  const byBoss = {};
  wanted.forEach(x => { const b = x.w.boss || 'Other / not set'; (byBoss[b] = byBoss[b] || []).push(x); });
  const bars = Object.keys(byBoss).map(b => ({ b, who: byBoss[b] })).sort((a, b) => b.who.length - a.who.length);
  const max = bars.length ? bars[0].who.length : 1;
  $('sim-chart-hint').textContent = `${wanted.length} item${wanted.length === 1 ? '' : 's'} still wanted · each bar = wanted items from that boss`;
  $('sim-chart').innerHTML = bars.length ? `<div class="bars">${bars.map(x => `<div class="bar-row"><span class="bl">${esc(x.b)}</span>
      <div class="bt"><div class="bf wishbar" style="width:${(x.who.length / max * 100).toFixed(1)}%"></div><span class="bv">${x.who.length} item${x.who.length === 1 ? '' : 's'}</span></div>
      <span class="bw">${x.who.map(y => `<span data-tip="${esc(y.w.item)}">${nameHtml(y.c)}</span>`).join(' ')}</span></div>`).join('')}</div>`
    : '<p class="empty">No manual entries still wanted.</p>';
  $('sim-view-chips').innerHTML = DROP_VIEWS.map(([k, l]) => `<button type="button" class="chip${simView === k ? ' on' : ''}" data-simview="${k}">${l}</button>`).join('');
  const row = (c, w, showName) => `<div class="sim-row wish-row${w.have ? ' got' : ''}">${showName ? `<span>${nameHtml(c)}</span>` : `<span class="slot">${esc(w.slot || '')}</span>`}
    <span class="sn"><span class="si">${esc(w.item)}</span><span class="hint sb">${showName ? esc(w.slot || '') : esc(w.boss || 'source not set')}${w.note ? ' &middot; ' + esc(w.note) : ''} &middot; added ${esc(w.added || '')}</span></span>
    <span>${w.have ? '<span class="pill ok">&#10003; got it</span>' : '<span class="pill wish">wanted</span>'}${officerKey ? ` <a class="hint" href="#sims" data-wishdel="${esc(c.name + '|' + c.realm + '|' + w.item + '|' + w.kind)}">remove</a>` : ''}</span></div>`;
  if (simView === 'boss') {
    const order = b => bossList().indexOf(b) + 1 || 99;
    $('sim-cards').innerHTML = bars.length ? `<div class="sim-grid">${bars.slice().sort((a, b) => order(a.b) - order(b.b)).map(x =>
      `<div class="char sim-card"><div class="name-row"><span class="char-name">${esc(x.b)}</span><span class="hint" style="margin-left:auto">${x.who.length} wanted</span></div>
        <div class="sim-rows">${x.who.map(y => row(y.c, y.w, true)).join('')}</div></div>`).join('')}</div>` : '<p class="empty">No manual entries still wanted.</p>';
    return;
  }
  $('sim-cards').innerHTML = dropCardsHtml();
}

async function officerPost(payload) {
  const res = await fetch(WEBAPP_URL, { method: 'POST', body: JSON.stringify(Object.assign({ key: officerKey }, payload)) });
  const out = await res.json();
  if (!out.ok) { if (/officer key/i.test(out.error)) { officerKey = ''; try { localStorage.removeItem('apoOfficerKey'); } catch (e) { /* */ } } throw new Error(out.error); }
  return out.data !== undefined ? out.data : out.message;
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

/* ------------------------------------------------------------------ Talents Check tab */
let talBoss = store('apoTalBoss', '');
const talOpen = new Set();
const SEC_ORDER = { Tanks: 0, Healers: 1, Melee: 2, Ranged: 3 };
const talKey = c => (c.name + '-' + c.realm).toLowerCase();
// Match % = share of the top players' core talents (taken by 70%+ of them) the raider has; flexible picks never count
const TAL_OK = 90, TAL_NEAR = 75;
const talCls = s => !s ? '' : !s.hero ? 'hero' : s.pct == null ? '' : s.pct >= TAL_OK ? 'ok' : s.pct >= TAL_NEAR ? 'near' : 'off';
const talTip = (s, sp, b) => { if (!s) return 'No data'; const x = sp.bosses[b] || {};
  return [`Has ${s.pct}% of the core talents (taken by 70%+ of the top ${s.n} US players)`, `Same build as ${s.match} of them (3 or fewer talents different)`,
    !s.hero ? `Hero tree: top players use ${x.heroName || 'another tree'}` : '', s.miss.length ? 'Missing: ' + s.miss.join(', ') : '', s.extra.length ? 'Rarely taken: ' + s.extra.join(', ') : ''].filter(Boolean).join('<br>'); };
const nList = (a, n) => a.length <= n ? a.map(esc).join(', ') : a.slice(0, n).map(esc).join(', ') + ` <span class="hint">+${a.length - n} more</span>`;
function talentsHtml() {
  const T = STATE.talents || { specs: [], checks: {} }, info = T.info;
  const kill = info && info.fromKill, prof = info && info.fromProfile;
  $('tal-info').innerHTML = info && info.fetched ? `updated ${new Date(info.fetched).toLocaleDateString([], { month: 'short', day: 'numeric' })} &middot; ` +
    'top 15 US players per boss &middot; ' + (kill && !prof ? 'talents from each top kill' : kill ? `talents from ${kill} top kills, ${prof} current builds` : 'top players\' current builds') + ' &middot; refreshes Wednesdays' : '';
  if (!T.specs.length) {
    $('tal-boss').innerHTML = '';
    $('tal-body').innerHTML = `<div class="card"><p class="empty">No top builds yet. In the sheet: <b>Apotheosis &gt; Refresh talent builds</b> (takes a few minutes; after that it runs every Wednesday).</p></div>`;
    return;
  }
  const bosses = bossList().filter(b => T.specs.some(s => s.bosses[b]));
  if (talBoss && !bosses.includes(talBoss)) talBoss = '';
  $('tal-boss').innerHTML = [['', 'All bosses']].concat(bosses.map(b => [b, b])).map(([k, l]) => `<button type="button" class="chip${talBoss === k ? ' on' : ''}" data-talboss="${esc(k)}">${esc(l)}</button>`).join('');
  // Raid team's picked toons, grouped by the spec they are in now
  const team = raidPlayers().map(p => ({ p, c: picked(p) }));
  const groups = T.specs.map(sp => ({ sp, who: team.filter(x => x.c.tal && x.c.tal.spec === sp.spec && x.c.cls === sp.cls) })).filter(g => g.who.length)
    .sort((a, b) => SEC_ORDER[sectionOf(a.who[0].c.role, a.sp.cls, a.sp.spec)] - SEC_ORDER[sectionOf(b.who[0].c.role, b.sp.cls, b.sp.spec)] || a.sp.cls.localeCompare(b.sp.cls));
  const covered = new Set(groups.flatMap(g => g.who.map(x => x.p.player)));
  const left = team.filter(x => !covered.has(x.p.player));
  const statusOf = (c, b) => ((T.checks[talKey(c)] || {})[b]) || null;
  const diffs = s => s ? s.miss.length + s.extra.length + (s.hero ? 0 : 1) : null;
  const tipOf = (s, sp, b) => { if (!s) return 'No data'; const x = sp.bosses[b] || {};
    return [!s.hero ? `Hero tree: top players use ${x.heroName || 'another tree'}` : '', s.miss.length ? 'Missing: ' + s.miss.join(', ') : '', s.extra.length ? 'Extra: ' + s.extra.join(', ') : ''].filter(Boolean).join('<br>') || 'Matches'; };
  const copyBtn = (code, label) => code ? `<button type="button" class="rb-btn tal-copy" data-copy="${esc(code)}">${label}</button>` : '';
  let body;
  if (!talBoss) {
    // One table: every compared raider (grouped by role, then class/spec) x every boss
    const rows = groups.flatMap(({ sp, who }) => who.map(({ c }) => ({ sp, c })));
    const cell = (s, sp, b) => {
      if (!s) return `<td class="tal-cell">-</td>`;
      const tip = esc(talTip(s, sp, b));
      const cls = talCls(s), txt = !s.hero ? 'H' : s.pct == null ? '-' : (s.pct >= TAL_OK ? '&#10003; ' : '') + s.pct + '%';
      return `<td class="tal-cell ${cls}" data-tip="${tip}">${txt}</td>`;
    };
    body = `<div class="card"><div class="table-wrap"><table class="logs-table tal-table"><thead><tr><th>Raider</th><th>Spec</th><th>Hero tree</th>${bosses.map(b =>
      `<th data-talboss="${esc(b)}" class="tal-bh" data-tip="Open ${esc(b)}: top build to copy">${esc(b.replace(/^The\s+/i, '').split(/[ ,]/)[0])}</th>`).join('')}</tr></thead><tbody>${rows.map(({ sp, c }) => {
        const heroes = [...new Set(bosses.map(b => sp.bosses[b] && sp.bosses[b].heroName).filter(Boolean))];
        const heroOk = !heroes.length || heroes.includes(c.tal.heroName);
        return `<tr><td>${nameHtml(c)}</td><td class="hint">${esc(sp.spec)}</td><td class="${heroOk ? 'hint' : 'tal-herobad'}"${heroOk ? '' : ` data-tip="Top players use ${esc(heroes.join(' / '))}"`}>${esc(c.tal.heroName || '?')}</td>${bosses.map(b => cell(statusOf(c, b), sp, b)).join('')}</tr>`; }).join('')}</tbody></table></div>
      <p class="hint" style="margin:8px 0 0">% = share of the core talents (taken by 70%+ of the top 15 US players) the raider has; situational talents some top players take never count.
        <span class="tal-cell ok">&#10003; 90%+</span> &middot; <span class="tal-cell near">75-89%</span> &middot; <span class="tal-cell off">under 75%</span> &middot; <span class="tal-cell hero">H</span> different hero tree &middot; hover a cell for details.<br><b>To copy a build:</b> click a boss column (or a boss button above), find your spec, and click <b>Copy build</b>.</p></div>`;
  } else {
    const b = talBoss;
    // One tile per spec: Copy build + who it's from + each raider's core %; click to open everything
    body = `<div class="card"><div class="card-head"><h2>${esc(b)}</h2><span class="hint">top 15 US players per spec &middot; click a spec for missing / rarely taken talents</span></div><div class="boss-grid">${groups.filter(g => g.sp.bosses[b]).map(({ sp, who }) => {
      const x = sp.bosses[b], r = x.ref, key = 't|' + b + '|' + sp.spec + '|' + sp.cls, open = talOpen.has(key);
      const fromHtml = r ? `from <a href="${esc(r.rio)}" target="_blank" rel="noopener">${esc(r.name)}</a> <span class="hint">(${Number(r.amount).toLocaleString()} ${sp.metric.toUpperCase()}${r.log ? `, <a href="${esc(r.log)}" target="_blank" rel="noopener">log</a>` : ''})</span>` : '<span class="hint">no copyable build for this boss</span>';
      const sumRow = who.map(({ c }) => { const s = statusOf(c, b); return `<span class="tal-sum ${talCls(s)}" data-tip="${esc(talTip(s, sp, b))}">${esc(c.name)} <b>${!s ? '-' : !s.hero ? 'H' : s.pct == null ? '-' : s.pct + '%'}</b></span>`; }).join('');
      const rows = who.map(({ c }) => { const s = statusOf(c, b), n = diffs(s);
        const mt = s ? `<span class="tal-mt ${talCls(s)}" data-tip="${esc(talTip(s, sp, b))}">${s.pct == null ? '-' : s.pct + '% core'}<small>same as ${s.match}/${s.n}</small></span>` : '';
        const what = !s ? '<span class="hint">no data</span>' : n === 0 ? '<span class="pill tal-ok">&#10003; Matches the usual build</span>' :
          [!s.hero ? `<span class="pill tal-hero">Hero tree: ${esc(c.tal.heroName || '?')}, top use ${esc(x.heroName || '?')}</span>` : '',
           s.miss.length ? `<div><b class="tal-miss">Missing:</b> ${s.miss.map(esc).join(', ')}</div>` : '', s.extra.length ? `<div><b class="tal-extra">Rarely taken:</b> ${s.extra.map(esc).join(', ')}</div>` : ''].join('');
        return `<div class="tal-row"><span class="tn">${nameHtml(c)}</span>${mt}<span class="tw">${what}</span></div>`; }).join('');
      return `<div class="boss-tile tal-tile${open ? ' open' : ''}" style="--accent:${accentFor(sp.cls)}">
        <div class="bt-top" data-taltile="${esc(key)}">${classIcon(sp.cls, 'sm')}<div class="bt-title"><span class="lb-name" style="color:${classHex(sp.cls)}">${esc(sp.spec)} ${esc(sp.cls)}</span><small>hero tree ${esc(x.heroName || '?')} (${x.heroPct}% of top ${x.n})</small></div><span class="dc-caret">${open ? '&#9652;' : '&#9662;'}</span></div>
        <div class="pt-row tal-copyrow">${r ? copyBtn(r.code, 'Copy build') : '<span class="hint">Copy build: not available</span>'}</div>
        <div class="pt-row tal-from" data-taltile="${esc(key)}">${fromHtml}</div>
        <div class="pt-row tal-sums" data-taltile="${esc(key)}">${sumRow}</div>
        ${open ? `<div class="pt-groups">
          ${r && r.same != null && r.same < 90 ? `<p class="hint" style="margin:0 0 6px">The copy is ${esc(r.name)}'s current build: ${r.same}% the same as what they took on this kill.</p>` : ''}
          ${x.add.length || x.drop.length ? `<p class="tal-swap">On this boss the top players ${x.add.length ? `<b class="tal-extra">add</b> ${x.add.map(esc).join(', ')}` : ''}${x.add.length && x.drop.length ? ' and ' : ''}${x.drop.length ? `<b class="tal-miss">drop</b> ${x.drop.map(esc).join(', ')}` : ''}</p>` : ''}
          ${rows}</div>` : ''}</div>`;
    }).join('')}</div></div>`;
  }
  const leftHtml = left.length ? `<div class="card"><div class="card-head"><h2>Not compared</h2></div>${left.map(({ c }) =>
    `<div class="tal-row"><span class="tn">${nameHtml(c)}</span><span class="tw hint">${!c.tal ? 'no talents on Raider.io' : `no top builds for ${esc(c.tal.spec)} ${esc(c.cls)} yet (next talent refresh)`}</span></div>`).join('')}</div>` : '';
  $('tal-body').innerHTML = (body || '<div class="card"><p class="empty">Nobody on the raid team is in a spec with top builds for this boss.</p></div>') + leftHtml;
}


/* ------------------------------------------------------------------ Alts (Roster tab): shown to everyone or officers only (Approvals > Show / Hide alts) */
function altsHtml() {
  const show = !!(STATE.guild && STATE.guild.showAlts);
  if (!show && !officerKey) return '';
  const ps = (STATE.roster || []).filter(p => (p.extras || []).length).sort((a, b) => a.player.localeCompare(b.player));
  if (!ps.length) return '';
  return `<div class="section-title"><h2>Alts</h2><span class="hint">${ps.reduce((n, p) => n + p.extras.length, 0)} alts${show ? '' : ' &middot; hidden from raiders (officers only)'}</span></div>
    <div class="card alts-card">${ps.map(p => `<div class="alt-row"><span class="alt-p">${nameHtml(p.main)}</span><span class="alt-list">${p.extras.map(c =>
      `<span class="alt-chip">${nameHtml(c)} <span class="hint">${esc(c.spec || '')}${c.ilvl ? ' &middot; ' + f1(c.ilvl) : ''}${c.score ? ' &middot; M+ ' + Math.round(c.score) : ''}</span></span>`).join('')}</span></div>`).join('')}</div>`;
}

/* ------------------------------------------------------------------ Tier set (roster tiles) */
const tierHead = c => c.tier ? `<div class="headline" data-tip="${esc(c.tier.name)}: ${c.tier.n} of ${c.tier.max} pieces equipped"><div class="lbl">Tier</div><div class="big" style="color:${c.tier.n >= 4 ? '#7ee787' : c.tier.n >= 2 ? '#e3b341' : '#ff7b72'}">${c.tier.n}/${c.tier.max}</div></div>` : '';

/* ------------------------------------------------------------------ Officer tabs: hidden until the officer key is entered.
   Their data (requests, attendance, performance) only comes from the script with the key, never in the public page data. */
const OFF_TABS = ['approvals', 'upload', 'attendance', 'performance'];
let OFF = null, offErr = '', offLoading = false;
async function loadOfficer() {
  if (!officerKey || offLoading) return;
  offLoading = true;
  try { OFF = await officerPost({ action: 'officerData' }); offErr = ''; } catch (e) { offErr = e.message; }
  offLoading = false; render();
}
const offNeed = () => `<div class="card"><p class="empty">${offErr ? 'Could not load: ' + esc(offErr) : 'Loading officer data…'}</p></div>`;

/* Run panel (Upload Sims tab, officers): apply the guild setup, open every ready raider in Raidbots, see who is due */
let uploadKind = store('apoUploadKind', 'drops');
const readyToons = () => simPlayers().map(simStatus).filter(x => x.ok).map(x => x.c);
function runPanel(kind) {
  const stat = simPlayers().map(simStatus), team = stat.filter(x => x.ok).map(x => x.c), notReady = stat.filter(x => !x.ok);
  const setupOf = k => k === 'drops' ? rbSetup() : rbBonus();
  // Run panel: apply the setup once, then open every ready raider in their own Raidbots tab
  const setup = setupOf(kind);
  const statusRow = c => { const sim = simOf(c, kind), up = sim ? sim.rows.filter(r => r.pct > 0) : [];
    return `<tr><td>${nameHtml(c)}</td><td class="hint">${esc(c.spec || '')}</td><td><a href="${rbUrl('droptimizer', c)}" target="_blank" rel="noopener">Droptimizer</a></td>
      <td>${dateHtml(sim)}${sim ? ` <a class="hint" href="${esc(sim.url)}" target="_blank" rel="noopener">report</a>` : ''}</td>
      <td>${up.length ? `${esc(up[0].item)} <b class="sp ${pctCls(up[0].pct)}">${pctTxt(up[0].pct)}</b>` : '<span class="hint">-</span>'}</td><td>${sim ? up.length : '-'}</td></tr>`; };
  $('upload-run').innerHTML = `<div class="card-head"><h2>Run: ${SIM_KINDS[kind]}</h2><span class="hint">Raidbots keeps the last setup you loaded for every character you open after it</span></div>
    <div class="run-steps">
      <div class="run-step"><span class="rb-step big">1</span>${setup ? `<a class="rb-btn big" href="${esc(setup)}" target="raidbots" rel="noopener">${fav('raidbots.com', 'RB')} Apply ${esc(SIM_KINDS[kind])} setup</a>`
        : `<span class="hint">No setup link yet: ${officerKey ? 'add one with <b>Change the setup link</b> below' : 'an officer adds one (or the sheet\'s Settings tab)'}.</span>`}<span class="hint">On Raidbots, <b>untick Character</b>, then Load Setup. Once per session.</span></div>
      <div class="run-step"><span class="rb-step big">2</span><button type="button" class="rb-btn big" data-openall="${kind}">Open all ${team.length} ready raiders</button>
        <button type="button" class="rb-btn" data-openall="${kind}" data-stale="1">Open only missing / older than 2 weeks</button><span class="hint" id="openall-msg"></span>
        <span class="hint popup-note">First time: allow pop-ups for this site (icon at the right of the address bar), or only one tab opens.</span></div>
      <div class="run-step"><span class="rb-step big">3</span><span class="hint">Click <b>Run Droptimizer</b> in each tab. When they finish, paste the report links below.</span></div>
    </div>
    ${officerKey ? `<details class="setup-edit"${setupMsg ? ' open' : ''}><summary>Change the ${esc(SIM_KINDS[kind])} setup link</summary>
      <p class="hint" style="margin:6px 0">On Raidbots, set the Droptimizer up the way the guild should run it (sources, difficulty, upgrade level, fight style), click <b>Share Setup</b>, and paste that link here.
        It replaces the link on the sheet's Settings tab${setup ? ` (now <a href="${esc(setup)}" target="_blank" rel="noopener">${esc(setup.replace(/.*share\//, ''))}</a>)` : ''}.</p>
      <form class="sim-form" id="setup-form" data-kind="${kind}"><input id="setup-url" placeholder="https://www.raidbots.com/simbot/share/..." required><button type="submit" class="toggle-btn" id="setup-go">Save setup</button></form>
      <div class="hint" id="setup-msg" style="margin-top:6px">${esc(setupMsg)}</div></details>` : ''}
    <table class="logs-table sim-status"><thead><tr><th>Raider</th><th>Spec</th><th>Raidbots</th><th>Last imported</th><th>Best upgrade</th><th>Upgrades</th></tr></thead><tbody>${team.map(statusRow).join('') || '<tr><td colspan="6" class="none">Nobody ready to sim.</td></tr>'}</tbody></table>
    ${notReady.length ? `<div class="sec-title" style="margin-top:14px"><span>Not in correct gear or spec</span><span class="hint">left out of Open all &middot; spec and gear update when they log in and the page refreshes</span></div>
      <table class="logs-table sim-status"><tbody>${notReady.map(x => `<tr class="notready"><td>${nameHtml(x.c)}</td><td><span class="pill warn">${esc(x.why)}</span></td>
        <td>${x.c.cls ? `<a class="hint" href="${rbUrl('droptimizer', x.c)}" target="_blank" rel="noopener">Droptimizer anyway</a>` : ''}</td><td>${dateHtml(simOf(x.c, kind))}</td></tr>`).join('')}</tbody></table>` : ''}`;
}

/* Manual entry form (Upload Sims tab, officers): items picked by hand for healers or anything Raidbots can't sim */
function manualForm() {
  const rp = raidPlayers(), all = rp.map(picked);
  const healers = healerPlayers().map(picked), others = all.filter(c => !healers.includes(c));
  return `<div class="card-head"><h2>Manual entry</h2><span class="hint">items picked by hand: healers (no Raidbots sims), or anyone else</span></div>
    ${officerKey ? `<form class="sim-form wish-form" id="wish-form">
      <select id="wish-who" required><option value="">Raider…</option><optgroup label="Healers">${healers.map(c => `<option value="${esc(c.name + '|' + c.realm)}">${esc(c.name)} (${esc(c.spec || '')})</option>`).join('')}</optgroup>
        <optgroup label="Everyone else (anything Raidbots can't sim)">${others.map(c => `<option value="${esc(c.name + '|' + c.realm)}">${esc(c.name)} (${esc(c.spec || '')})</option>`).join('')}</optgroup></select>
      <select id="wish-bis"><option value="">Pick from their missing BiS…</option></select>
      <input id="wish-item" placeholder="or type an item name">
      <select id="wish-boss"><option value="">Boss / source…</option>${bossList().map(b => `<option>${esc(b)}</option>`).join('')}<option>Trash drops</option><option>Other</option></select>
      <input id="wish-note" placeholder="note (optional)" style="flex:0 1 160px">
      <button type="submit" class="toggle-btn" id="wish-go">Add</button></form><div class="hint" id="wish-msg" style="margin-top:6px">${esc(wishMsg)}</div>`
      : '<p class="hint">Officers add items here (click the lock button). Each item is crossed off automatically once the raider is wearing it.</p>'}`;
}

function uploadHtml() {
  $('upload-kinds').innerHTML = Object.keys(SIM_KINDS).map(k => `<button type="button" class="sim-tab${uploadKind === k ? ' on' : ''}" data-uploadkind="${k}"><span>${SIM_KINDS[k]} <span class="st-src">(Raidbots)</span></span>
    <span class="hint">${readyToons().filter(c => simOf(c, k) && ageDays(simOf(c, k).date) <= STALE_DAYS).length}/${readyToons().length} current</span></button>`).join('') +
    `<button type="button" class="sim-tab${uploadKind === 'manual' ? ' on' : ''}" data-uploadkind="manual"><span>Manual entry <span class="st-ic">${roleIcon('Healer')}</span></span><span class="hint">${(STATE.wishlist || []).filter(w => !w.have).length} wanted</span></button>`;
  if (uploadKind === 'manual') $('upload-run').innerHTML = manualForm(); else runPanel(uploadKind);
  // Import (officers): the kind is worked out from the report's settings
  $('sim-import').innerHTML = `<div class="card-head"><h2>Import reports</h2><span class="hint">${officerKey ? 'officer mode' : 'officers: click the lock button to import'}</span></div>
    ${officerKey ? `<form class="sim-form" id="sim-form"><textarea id="sim-url" rows="3" placeholder="Paste one or more Raidbots report links (one per line)" required></textarea>
      <select id="sim-kindsel"><option value="auto" selected>Auto-detect (matches the guild setups)</option>${Object.keys(SIM_KINDS).map(k => `<option value="${k}">Import as ${SIM_KINDS[k]}</option>`).join('')}</select>
      <button type="submit" class="toggle-btn" id="sim-go">Import</button></form><div class="hint" id="sim-msg" style="margin-top:6px;white-space:pre-line">${esc(simMsg)}</div>`
      : '<p class="hint">Reports are imported by an officer: paste the finished report links and the page works out the raider and which setup was run.</p>'}`;
}

/* ------------------------------------------------------------------ Great Vault (public) */
const VTRACKS = [['Myth', '#ff8000'], ['Hero', '#a335ee'], ['Champion', '#0070dd'], ['Veteran', '#1eff00'], ['Adventurer', '#cccccc'], ['Explorer', '#9d9d9d']];
const vTrackOf = txt => VTRACKS.find(([n]) => new RegExp(n === 'Champion' ? 'Champ' : n, 'i').test(String(txt || ''))) || null;
const vUnlocked = c => (c.vault || []).reduce((n, v) => n + (v.thresholds || []).filter(t => v.done >= t).length, 0);
function vaultBlock(c) {
  if (!c.vault) return '<p class="empty">No Great Vault data yet (next refresh).</p>';
  const names = { mplus: 'Mythic+', raid: 'Raid', world: 'World' }, order = ['raid', 'mplus', 'world'];
  const rows = c.vault.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return rows.map(v => {
    const tiles = (v.thresholds || []).map((t, i) => {
      const on = v.done >= t, raw = String(v.slots[i] || '');
      const raidTrack = { 'Raid Finder': 'Champion', LFR: 'Champion', Normal: 'Hero', Heroic: 'Myth', Mythic: 'Myth' };
      let tr = null, reward;
      if (on && v.kind === 'raid') { const m = raw.match(/Unlocked:\s*(Raid Finder|LFR|Normal|Heroic|Mythic)/); tr = m ? vTrackOf(raidTrack[m[1]]) : null; }
      else if (on) tr = vTrackOf(raw);
      reward = on ? (tr ? tr[0] : v.kind === 'mplus' ? (raw.match(/^\+\d+/) || ['Unlocked'])[0] : 'Unlocked') : `${t} ${v.kind === 'mplus' ? (t > 1 ? 'runs' : 'run') : v.kind === 'raid' ? 'bosses' : 'activities'}`;
      const style = tr ? ` style="border-color:${tr[1]};background:${tr[1]}26;color:#fff"` : '';
      return `<div class="tile${on ? ' on' : ''}"${style} data-tip="${esc(names[v.kind])} slot ${i + 1}: ${on ? 'unlocked' + (raw ? ' (' + esc(raw) + ')' : '') : 'needs ' + t}"><b${tr ? ` style="color:${tr[1]}"` : ''}>${on ? '&#10003; ' : ''}Slot ${i + 1}</b>${reward}</div>`;
    }).join('');
    return `<div class="vault-row"><span>${names[v.kind]}</span><div class="tiles">${tiles}</div><div class="count"><span class="n">${v.done}</span></div></div>`;
  }).join('');
}
// A player's activity across all their characters: this week and season, and whether they only raid
function playerActivity(p) {
  const cs = [p.main].concat(p.alts || [], p.extras || []).filter(c => c.act);
  const sum = f => cs.reduce((a, c) => a + (c.act[f] || 0), 0);
  const weeks = {}; cs.forEach(c => (c.act.hist || []).forEach(h => { const w = weeks[h.week] = weeks[h.week] || { week: h.week, r: 0, m: 0, w: 0 }; w.r = Math.max(w.r, h.r); w.m += h.m; w.w += h.w; }));
  const hist = Object.values(weeks).sort((a, b) => a.week - b.week).slice(-8);
  const keysWeek = cs.reduce((a, c) => a + ((c.vault || []).find(v => v.kind === 'mplus') || { done: 0 }).done, 0);
  const delvesWeek = cs.reduce((a, c) => a + ((c.vault || []).find(v => v.kind === 'world') || { done: 0 }).done, 0);
  const raidWeek = Math.max(0, ...cs.map(c => ((c.vault || []).find(v => v.kind === 'raid') || { done: 0 }).done));
  const best = Math.max(0, ...cs.map(c => c.act.score || 0));
  const seasonDungeons = Math.max(0, ...cs.map(c => c.act.seasonDungeons || 0));
  const delves = cs.some(c => c.act.delves != null) ? sum('delves') : null, dungeons = cs.some(c => c.act.dungeons != null) ? sum('dungeons') : null;
  const outside = hist.filter(h => h.m > 0 || h.w > 0).length;
  // Raid only: almost no Mythic+ this season and nothing outside raid in the weeks tracked (needs some data first)
  const raidOnly = cs.length > 0 && seasonDungeons <= 2 && outside === 0 && keysWeek === 0 && delvesWeek === 0;
  return { cs, raidKills: sum('raidKills'), best, seasonDungeons, keysWeek, delvesWeek, raidWeek, delves, dungeons, hist, outside, raidOnly,
    since: Math.min(...cs.map(c => c.act.since || Infinity)) };
}
function vaultHtml() {
  const ps = raidPlayers();
  const rows = ps.map(p => ({ p, a: playerActivity(p), c: p.main }));
  $('vault-hint').textContent = `${ps.length} raiders · ${rows.filter(r => r.a.raidOnly).length} only raiding`;
  const spark = hist => `<span class="vh-spark">${hist.map(h => `<span class="vh-w" data-tip="Week of ${new Date(h.week).toLocaleDateString([], { month: 'short', day: 'numeric' })}: ${h.r} raid bosses, ${h.m} keys, ${h.w} delves">
    <i style="height:${Math.min(100, h.r / 8 * 100)}%;background:#a335ee"></i><i style="height:${Math.min(100, h.m / 8 * 100)}%;background:#3987e5"></i><i style="height:${Math.min(100, h.w / 8 * 100)}%;background:#3fb950"></i></span>`).join('')}</span>`;
  const sinceTxt = a => a.since && a.since !== Infinity ? new Date(a.since).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
  $('vault-summary').innerHTML = `<div class="table-wrap"><table class="logs-table vault-table"><thead><tr><th>Raider</th><th data-tip="Vault rewards unlocked on their main">Vault</th>
    <th>This week</th><th data-tip="Raid boss kills in this season's raids, all difficulties, all their characters">Raid kills (season)</th><th data-tip="Best Mythic+ score this season and dungeons with a timed or completed run">Mythic+ (season)</th>
    <th data-tip="Dungeon clears and delves on all their characters since the page started tracking">Dungeons / delves</th><th data-tip="Last 8 weeks: purple raid bosses, blue keys, green delves">Weeks</th><th></th></tr></thead><tbody>${
    rows.sort((a, b) => b.a.raidOnly - a.a.raidOnly || a.p.player.localeCompare(b.p.player)).map(({ p, a, c }) => `<tr${a.raidOnly ? ' class="raid-only"' : ''}>
      <td>${nameHtml(c)}</td><td><b>${vUnlocked(c)}</b>/9</td>
      <td class="hint"><b style="color:#d2a8ff">${a.raidWeek}</b> bosses &middot; <b style="color:#79c0ff">${a.keysWeek}</b> keys &middot; <b style="color:#7ee787">${a.delvesWeek}</b> delves</td>
      <td>${a.cs.length ? a.raidKills : '-'}</td><td>${a.cs.length ? `<b>${Math.round(a.best)}</b> <span class="hint">&middot; ${a.seasonDungeons} dungeons</span>` : '-'}</td>
      <td class="hint">${a.dungeons == null ? '-' : `${a.dungeons} dungeons &middot; ${a.delves} delves <span data-tip="Counting since ${esc(sinceTxt(a))}">since ${esc(sinceTxt(a))}</span>`}</td>
      <td>${a.hist.length ? spark(a.hist) : '<span class="hint">-</span>'}</td>
      <td>${a.raidOnly ? '<span class="pill warn" data-tip="Almost no Mythic+ this season and no keys or delves in the weeks tracked">Raid only</span>' : a.cs.length ? '<span class="pill ok">Active</span>' : '<span class="hint">no data yet</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  $('vault-tiles').innerHTML = `<div class="boss-grid vault-grid">${ps.slice().sort((a, b) => a.player.localeCompare(b.player)).map(p => {
    const key = 'v|' + p.player, open = tileOpen.has(key), others = (p.alts || []).concat(p.extras || []).filter(c => c.vault);
    return `<div class="boss-tile player-tile${open ? ' open' : ''}" style="--accent:${accentFor(p.main.cls)}">
      <div class="bt-top" data-apotoggle="${esc(key)}">${classIcon(p.main.cls)}<div class="bt-title"><span class="lb-name" style="color:${classHex(p.main.cls)}">${esc(p.main.name)}</span><small>${esc(p.main.spec || '')} &middot; ${vUnlocked(p.main)}/9 unlocked</small></div>${others.length ? `<span class="hint">${others.length} more</span>` : ''}<span class="dc-caret">${open ? '&#9652;' : '&#9662;'}</span></div>
      <div class="vault-box">${vaultBlock(p.main)}</div>
      ${open && others.length ? others.map(c => `<div class="vault-alt"><div class="vault-alt-n">${nameHtml(c)} <span class="hint">${esc(c.spec || '')} &middot; ${vUnlocked(c)}/9</span></div>${vaultBlock(c)}</div>`).join('') : ''}</div>`;
  }).join('')}</div>`;
}

/* ------------------------------------------------------------------ Requests (public) and Approvals (officers) */
const CLASS_SPECS = { 'Death Knight': ['Blood', 'Frost', 'Unholy'], 'Demon Hunter': ['Havoc', 'Vengeance', 'Devourer'], Druid: ['Balance', 'Feral', 'Guardian', 'Restoration'],
  Evoker: ['Augmentation', 'Devastation', 'Preservation'], Hunter: ['Beast Mastery', 'Marksmanship', 'Survival'], Mage: ['Arcane', 'Fire', 'Frost'], Monk: ['Brewmaster', 'Mistweaver', 'Windwalker'],
  Paladin: ['Holy', 'Protection', 'Retribution'], Priest: ['Discipline', 'Holy', 'Shadow'], Rogue: ['Assassination', 'Outlaw', 'Subtlety'], Shaman: ['Elemental', 'Enhancement', 'Restoration'],
  Warlock: ['Affliction', 'Demonology', 'Destruction'], Warrior: ['Arms', 'Fury', 'Protection'] };
const ALL_SPECS = ['Blood', 'Frost', 'Unholy', 'Havoc', 'Vengeance', 'Devourer', 'Balance', 'Feral', 'Guardian', 'Restoration', 'Devastation', 'Preservation', 'Augmentation', 'Beast Mastery', 'Marksmanship', 'Survival',
  'Arcane', 'Fire', 'Brewmaster', 'Mistweaver', 'Windwalker', 'Holy', 'Protection', 'Retribution', 'Discipline', 'Shadow', 'Assassination', 'Outlaw', 'Subtlety', 'Elemental', 'Enhancement', 'Affliction', 'Demonology', 'Destruction', 'Arms', 'Fury'];
let reqMsg = { secondary: '', alt: '', main: '', initiate: '' };
function realmOptions() {
  const list = (STATE.realms && STATE.realms.length ? STATE.realms : []).slice();
  const g = (STATE.guild && STATE.guild.realm) || 'eldrethalas';
  if (!list.some(r => r.slug === g)) list.unshift({ name: "Eldre'Thalas", slug: g });
  return list.map(r => `<option value="${esc(r.slug)}"${r.slug === g ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
}
function requestsHtml() {
  const players = (STATE.roster || []).map(p => p.player).sort((a, b) => a.localeCompare(b));
  const pend = STATE.pendingRequests || 0;
  $('req-hint').textContent = pend ? pend + ' waiting for an officer' : '';
  const form = (type, title, help) => `<div class="card"><div class="card-head"><h2>${title}</h2></div><p class="hint" style="margin:0 0 10px">${help}</p>
    <form class="req-form" data-reqform="${type}">
      ${type === 'initiate' ? '' : `<label>${type === 'main' ? 'Your current main' : 'Your main'}<select name="player" required><option value="">Pick your main…</option>${players.map(n => `<option>${esc(n)}</option>`).join('')}</select></label>`}
      <label>${type === 'alt' ? 'Alt' : type === 'main' ? 'New main' : type === 'initiate' ? 'Character' : 'Secondary main'} name<input name="name" required maxlength="12" placeholder="Character name"></label>
      <label>Server<select name="realm">${realmOptions()}</select></label>
      <label>Class<select name="cls" data-reqcls="${type}" required><option value="">Pick a class…</option>${Object.keys(CLASS_SPECS).map(c => `<option>${c}</option>`).join('')}</select></label>
      <label>Spec${type === 'alt' ? '' : ' <span class="hint">(raid spec)</span>'}<select name="spec" required disabled><option value="">Pick the class first</option></select></label>
      <label class="wide">Note <span class="hint">(optional)</span><input name="note" maxlength="200" placeholder="Anything officers should know"></label>
      <button type="submit" class="toggle-btn">Send request</button><span class="hint req-msg">${esc(reqMsg[type])}</span>
    </form></div>`;
  $('req-forms').innerHTML = `<datalist id="spec-list">${ALL_SPECS.map(x => `<option value="${x}">`).join('')}</datalist>` +
    form('secondary', 'Request a secondary main', 'A character you would bring to raid. Once approved it shows on the roster as your offspec, like Clamshell and Jacii.') +
    form('alt', 'Request an alt', 'A character that is not for raid: tracked for Great Vault and activity.') +
    form('main', 'Request a new main', 'Swapping mains? Once approved this character replaces your current main on the roster (your secondary mains and alts stay).') +
    form('initiate', 'Join the raid (initiate)', 'New to the team? Once an officer approves, you are on the roster as an <b>Initiate</b>. After you have raided in 2 different weeks, officers review your trial and move you to Raider.');
}
const okBad = (ok, txt) => `<span class="pill ${ok ? 'ok' : 'bad'}">${txt}</span>`;
function rundownHtml(rd) {
  if (!rd) return '<p class="empty">Raider.io could not find this character (check the name and server, or they need to log in).</p>';
  const g = rd.gems, t = rd.tier;
  return `<div class="rd-grid">
    <div class="mini"><div class="k">Class</div><div class="v" style="color:${classHex(rd.cls)}">${esc([rd.spec, rd.cls].filter(Boolean).join(' ')) || '?'}</div></div>
    <div class="mini"><div class="k">Item level</div><div class="v">${rd.ilvl ? f2(rd.ilvl) : '-'}</div></div>
    <div class="mini"><div class="k">Mythic+</div><div class="v"${rd.color ? ` style="color:${rd.color}"` : ''}>${rd.score ? f1(rd.score) : '0'}</div></div>
    <div class="mini"><div class="k">Tier set</div><div class="v">${t ? t.n + '/' + t.max : '-'}</div></div></div>
    <div class="ench-summary" style="margin-top:8px">${(rd.missingEnchants || []).length ? okBad(false, 'Missing enchant: ' + esc(rd.missingEnchants.join(', '))) : okBad(true, 'Enchants OK')}
      ${g ? okBad(!g.empty, g.empty ? g.empty + ' empty socket' + (g.empty > 1 ? 's' : '') : 'Gems OK') + okBad(g.diamond, g.diamond ? 'Eversong Diamond' : 'No Eversong Diamond') : ''}
      ${rd.pvp && rd.pvp.mostly ? okBad(false, `In PvP gear (${rd.pvp.count}/${rd.pvp.total})`) : ''}</div>
    <p class="hint" style="margin:6px 0 0">Checked ${esc(rd.checked || '')}${rd.profile ? ` &middot; <a href="${esc(rd.profile)}" target="_blank" rel="noopener">Raider.io</a>` : ''}</p>`;
}
let apprMsg = '';
function approvalsHtml() {
  if (!OFF) { $('appr-body').innerHTML = offNeed(); return; }
  const reqs = OFF.requests || [], pend = reqs.filter(r => r.status === 'Pending'), done = reqs.filter(r => r.status !== 'Pending');
  const card = r => `<div class="card req-card"><div class="card-head"><h2>${r.type === 'alt' ? 'Alt' : r.type === 'main' ? 'New main' : r.type === 'initiate' ? 'Initiate' : 'Secondary main'}: <span style="color:${classHex(r.rundown && r.rundown.cls)}">${esc(r.name)}</span> <span class="hint" style="font-size:13px">${esc(r.realm)}</span></h2>
      <span class="hint">${r.type === 'initiate' ? `wants to join the raid${r.spec ? ' as ' + esc(r.spec.replace('|', ' ')) : ''}` : `for <b>${esc(r.player)}</b>`} &middot; sent ${esc(r.submitted)}</span></div>
    ${r.note ? `<p style="margin:0 0 8px">&ldquo;${esc(r.note)}&rdquo;</p>` : ''}${rundownHtml(r.rundown)}
    ${r.type === 'main' ? `<p class="hint" style="margin:8px 0 0">Approving replaces <b>${esc((((STATE.roster || []).find(p => p.player === r.player) || {}).main || {}).name || '?')}</b> as ${esc(r.player)}'s main.</p>` : ''}
    <div class="req-actions">${r.type !== 'secondary' ? '' : `<label class="hint">Raid spec <input data-reqspec="${esc(r.id)}" list="spec-list" value="${esc(r.spec || (r.rundown && r.rundown.spec) || '')}"></label>`}
      <button type="button" class="toggle-btn ok" data-reqdo="${esc(r.id)}|approve">Approve</button><button type="button" class="toggle-btn bad" data-reqdo="${esc(r.id)}|deny">Deny</button>
      <button type="button" class="toggle-btn" data-reqdo="${esc(r.id)}|recheck">Recheck gear</button></div></div>`;
  $('appr-body').innerHTML = `<datalist id="spec-list">${ALL_SPECS.map(x => `<option value="${x}">`).join('')}</datalist>
    <div class="card"><div class="card-head"><h2>Requests waiting</h2><span class="hint">${pend.length} pending &middot; approving adds the character to the Roster tab of the sheet</span></div>
      ${apprMsg ? `<p class="hint" style="margin:0">${esc(apprMsg)}</p>` : ''}${pend.length ? '' : '<p class="empty">Nothing waiting.</p>'}</div>
    <div class="req-grid">${pend.map(card).join('')}</div>
    ${initiatesHtml()}
    ${ranksHtml()}
    ${seasonTools()}
    ${done.length ? `<div class="card"><div class="card-head"><h2>Decided</h2><span class="hint">last 30</span></div><table class="logs-table"><tbody>${done.map(r =>
      `<tr><td>${esc(r.name)} <span class="hint">${esc(r.realm)}</span></td><td class="hint">${r.type === 'initiate' ? 'Initiate' : (r.type === 'alt' ? 'Alt' : r.type === 'main' ? 'New main' : 'Secondary main') + ' for ' + esc(r.player)}</td><td>${r.status === 'Approved' ? '<span class="pill ok">Approved</span>' : '<span class="pill bad">Denied</span>'}</td><td class="hint">${esc(r.decided)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}

/* Initiates: after raiding in 2 different reset weeks they are flagged for an officer to approve the trial (-> Raider) */
function initiatesHtml() {
  const list = (OFF.players || []).filter(x => x.status === 'Initiate');
  if (!list.length) return '';
  return `<div class="card"><div class="card-head"><h2>Initiates</h2><span class="hint">flagged once they have raided in 2 different weeks since joining</span></div>
    ${list.sort((a, b) => (b.initWeeks || 0) - (a.initWeeks || 0)).map(x => { const ready = (x.initWeeks || 0) >= 2;
      return `<div class="tool-row"><div>${nameHtml(x.main)} <span class="hint">joined ${x.since ? new Date(x.since).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '?'} &middot; raided ${x.initWeeks || 0} of 2 weeks${x.attPct != null ? ' &middot; attendance ' + x.attPct + '%' : ''}</span>
        ${ready ? '<span class="pill ok">Ready for trial review</span>' : ''}</div>
        <button type="button" class="toggle-btn${ready ? ' ok' : ''}" data-promote="${esc(x.player)}">Approve trial &rarr; Raider</button></div>`; }).join('')}</div>`;
}
/* Guild ranks: in-game rank vs the sheet, raid characters only. Rank numbers come from Blizzard (0 = Guild Master); officers say which number is which. */
let ranksAll = false;
function ranksHtml() {
  const R = OFF.ranks; if (!R) return '';
  const leg = R.legend || [], m = R.map || {};
  const sel = (k, label) => `<label class="rank-pick">${label}<select data-rankset="${k}"><option value="">not set</option>${leg.map(l => `<option value="${l.rank}"${m[k] === l.rank ? ' selected' : ''}>Rank ${l.rank} (${l.n}: ${esc(l.sample.join(', '))})</option>`).join('')}</select></label>`;
  const set = m.raider != null;
  const bad = (R.rows || []).filter(r => r.ok === false), shown = ranksAll ? R.rows : bad;
  const action = r => r.current == null ? 'Invite to the guild' : r.kind === 'Raider' ? `Promote to rank ${r.want} or higher` : `Set to rank ${r.want}`;
  return `<div class="card"><div class="card-head"><h2>Guild ranks</h2><span class="hint">raid characters only &middot; in-game ranks from Blizzard${R.fetched ? ', ' + new Date(R.fetched).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</span></div>
    <div class="rank-set">${sel('raider', 'Raider rank (this rank or higher)')}${sel('secondary', 'Secondary main rank (optional)')}${sel('initiate', 'Initiate rank (optional)')}</div>
    <div class="rank-off"><span class="hint">Officer ranks (never flagged):</span>${leg.map(l => `<label class="reset-pick"><input type="checkbox" data-rankoff="${l.rank}"${(m.officer || []).indexOf(l.rank) >= 0 ? ' checked' : ''}>Rank ${l.rank} <span class="hint">(${esc(l.sample.slice(0, 2).join(', '))})</span></label>`).join('')}</div>
    ${!leg.length ? '<p class="empty">No guild ranks yet: they load with the next refresh.</p>' : !set ? '<p class="empty">Pick the Raider rank above (Blizzard only gives numbers; the examples show who holds each). Secondary main and Initiate ranks are optional: without them those characters only need to be in the guild.</p>' :
      `<p class="hint" style="margin:6px 0">${bad.length ? `<b style="color:#ff7b72">${bad.length}</b> to fix in game` : '<b style="color:#7ee787">All raid characters have the right rank</b>'} &middot; <a href="#approvals" data-ranksall="1">${ranksAll ? 'show only the ones to fix' : 'show everyone'}</a></p>
      ${shown.length ? `<table class="logs-table"><thead><tr><th>Character</th><th>On the sheet</th><th>In-game rank</th><th>Should be</th><th>Do this</th></tr></thead><tbody>${shown.map(r => `<tr>
        <td>${nameHtml(r)}${r.name !== r.player ? ` <span class="hint">(${esc(r.player)})</span>` : ''}</td><td>${esc(r.kind)}</td><td>${r.current == null ? '<span class="pill bad">not in guild</span>' : 'Rank ' + r.current}</td>
        <td class="hint">${r.want == null ? 'in the guild' : r.kind === 'Raider' ? 'Rank ' + r.want + ' or higher' : 'Rank ' + r.want}</td><td>${r.ok ? '<span class="pill ok">OK</span>' : `<b style="color:#e3b341">${action(r)}</b>`}</td></tr>`).join('')}</tbody></table>` : ''}`}</div>`;
}

/* Season tools: show / hide alts, clear all alts, clear all secondary mains (pick each player's main first) */
let resetOpen = false, toolMsg = '';
function seasonTools() {
  const show = !!(STATE.guild && STATE.guild.showAlts);
  const withSec = (STATE.roster || []).filter(p => (p.alts || []).length);
  const altN = (STATE.roster || []).reduce((n, p) => n + (p.extras || []).length, 0), secN = withSec.reduce((n, p) => n + p.alts.length, 0);
  return `<div class="card"><div class="card-head"><h2>Roster &amp; season tools</h2><span class="hint">everything cleared is copied to a "Roster archive" tab on the sheet first</span></div>
    ${toolMsg ? `<p class="hint" style="margin:0 0 8px">${esc(toolMsg)}</p>` : ''}
    <div class="tool-row"><div><b>Alts on the Roster tab</b><span class="hint"> ${altN} alts &middot; ${show ? 'everyone can see them' : 'hidden from raiders (officers still see them)'}</span></div>
      <button type="button" class="toggle-btn" data-tool="showAlts|${show ? '0' : '1'}">${show ? 'Hide alts' : 'Show alts'}</button></div>
    <div class="tool-row"><div><b>Clear all alts</b><span class="hint"> empties the Alts column for everyone (new season)</span></div>
      <button type="button" class="toggle-btn bad" data-tool="clearAlts"${altN ? '' : ' disabled'}>Clear ${altN} alts</button></div>
    <div class="tool-row"><div><b>Clear all secondary mains</b><span class="hint"> ${withSec.length} players have ${secN}: pick who stays each player's main</span></div>
      <button type="button" class="toggle-btn bad" data-tool="resetOpen"${secN ? '' : ' disabled'}>${resetOpen ? 'Cancel' : 'Clear secondary mains…'}</button></div>
    ${resetOpen ? `<div class="reset-box"><p class="hint" style="margin:0 0 8px">Each player keeps one main. Pick it, then confirm: secondary mains and their offspec notes are removed.</p>
      ${withSec.map(p => `<div class="reset-row"><b>${esc(p.player)}</b>${[p.main].concat(p.alts).map((t, i) => `<label class="reset-pick"><input type="radio" name="rm-${esc(p.player)}" value="${esc(t.name + '-' + t.realm)}"${i === 0 ? ' checked' : ''}>${nameHtml(t)}${i === 0 ? ' <span class="hint">(main now)</span>' : ''}</label>`).join('')}</div>`).join('')}
      <button type="button" class="toggle-btn bad" data-tool="clearSecondaries" style="margin-top:10px">Clear all secondary mains</button></div>` : ''}</div>`;
}

/* ------------------------------------------------------------------ Attendance and Performance (officers) */
// What the last guild-log read did (so an empty tab explains itself)
function logInfoHtml() {
  const i = OFF && OFF.logInfo;
  if (!i) return '<p class="hint" style="margin:8px 0 0">Guild logs have not been read yet. In the sheet: <b>Apotheosis &gt; Read guild logs now</b>.</p>';
  if (i.error) return `<p class="hint" style="margin:8px 0 0;color:#ff7b72">Reading guild logs failed: ${esc(i.error)}</p>`;
  return `<p class="hint" style="margin:8px 0 0">Guild logs ${i.at ? 'read ' + new Date(i.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}: ${i.found} reports in the last 9 weeks, ${i.raid} in ${esc((i.raidZones || []).join(' / '))}, ${i.stored} read${i.left ? `, <b>${i.left} still to read</b> (a few each refresh, or <b>Apotheosis &gt; Read guild logs now</b>)` : ''}${
    i.otherZones && i.otherZones.length && !i.raid ? ` &middot; other zones found: ${esc(i.otherZones.join(', '))}` : ''}${i.skippedPoints ? ` &middot; ${i.skippedPoints} skipped (Warcraft Logs points)` : ''}${(i.errors || []).length ? `<br><span style="color:#ff7b72">Errors: ${esc(i.errors.join(' | '))}</span>` : ''}</p>`;
}
const parseColor = v => v == null ? '#666' : v >= 99 ? '#e268a8' : v >= 95 ? '#ff8000' : v >= 75 ? '#a335ee' : v >= 50 ? '#0070ff' : v >= 25 ? '#1eff00' : '#9d9d9d';
const offPlayers = () => (OFF.players || []).filter(x => x.raid || (x.att || []).some(Boolean)).sort((a, b) => (b.raid - a.raid) || a.player.localeCompare(b.player));
function attendanceHtml() {
  if (!OFF) { $('att-body').innerHTML = offNeed(); return; }
  const nights = OFF.nights || [], ps = offPlayers();
  const avg = ps.filter(x => x.raid && x.attPct != null);
  const d = s => { const [y, m, dd] = s.split('-'); return `${Number(m)}/${Number(dd)}`; };
  $('att-body').innerHTML = `<div class="card"><div class="card-head"><h2>Attendance</h2><span class="hint">rolling 8 weeks &middot; ${OFF.difficulty} raid nights from the guild's Warcraft Logs &middot; any of a player's characters counts</span></div>
    ${nights.length ? `<p class="hint" style="margin:0 0 8px">${nights.length} raid nights &middot; raid team average <b>${avg.length ? Math.round(avg.reduce((a, x) => a + x.attPct, 0) / avg.length) : '-'}%</b></p>
    <div class="table-wrap"><table class="logs-table att-table"><thead><tr><th>Raider</th><th>%</th>${nights.map(n => `<th data-tip="${esc(n.zones.join(', '))}: ${n.pulls} pulls, ${n.kills} kills">${d(n.date)}</th>`).join('')}</tr></thead><tbody>${
      ps.map(x => `<tr${x.raid ? '' : ' class="bench"'}><td>${nameHtml(x.main)}${x.raid ? '' : ' <span class="hint">bench</span>'}</td><td><b style="color:${x.attPct >= 90 ? '#7ee787' : x.attPct >= 75 ? '#e3b341' : '#ff7b72'}">${x.attPct == null ? '-' : x.attPct + '%'}</b></td>${
        x.att.map(a => `<td class="att ${a ? 'y' : 'n'}">${a ? '&#10003;' : '&middot;'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">No raid nights logged in the last 8 weeks yet.</p>'}${logInfoHtml()}</div>`;
}
function performanceHtml() {
  if (!OFF) { $('perf-body').innerHTML = offNeed(); return; }
  const weeks = OFF.weeks || [], ps = offPlayers().filter(x => x.kills || x.pulls);
  const wk = ms => new Date(ms).toLocaleDateString([], { month: 'numeric', day: 'numeric' });
  // One row per role a raider played (healing nights and dps nights are never mixed), so an off-role night isn't a "drop"
  const rows = []; ps.forEach(x => { const roles = x.roles && x.roles.length ? x.roles : [{ role: '', kills: x.kills, avg: x.avg, weekly: x.weekly, byBoss: x.byBoss }];
    roles.forEach((r, i) => rows.push({ x, r, first: i === 0, multi: roles.length > 1 })); if (!x.kills) rows.push({ x, r: { role: '', kills: 0, avg: null, weekly: weeks.map(() => null), byBoss: [] }, first: true }); });
  const delta = r => { const v = (r.weekly || []).filter(y => y != null); if (v.length < 3) return null;
    return Math.round(v.slice(-2).reduce((a, y) => a + y, 0) / 2 - v.slice(0, -2).reduce((a, y) => a + y, 0) / (v.length - 2)); };
  const trend = r => { const d = delta(r); return d == null ? '<span class="hint">-</span>' : `<b style="color:${d > 2 ? '#7ee787' : d < -2 ? '#ff7b72' : '#aaa'}">${d > 0 ? '&#9650; +' : d < 0 ? '&#9660; ' : ''}${d}</b>`; };
  const fd = x => x.pulls ? Math.round(x.firsts / x.pulls * 100) : 0;
  const leaders = ps.filter(x => x.firsts).sort((a, b) => fd(b) - fd(a) || b.firsts - a.firsts).slice(0, 5);
  const tr = rows.filter(o => o.r.kills).map(o => ({ o, d: delta(o.r) })).filter(t => t.d != null).sort((a, b) => b.d - a.d);
  const roleTag = r => r.role ? `${roleIcon(r.role)} <span class="hint">${r.role}</span>` : '';
  $('perf-body').innerHTML = `<div class="sum-grid">
    <div class="card"><div class="card-head"><h2>Dies first most</h2><span class="hint">share of pulls where they were the first death</span></div>
      ${leaders.length ? leaders.map((x, i) => `<div class="sum-row"><span class="rk">${i + 1}</span>${nameHtml(x.main)}<span class="r"><b>${fd(x)}%</b> <span class="hint">${x.firsts} of ${x.pulls} pulls</span></span></div>`).join('') : '<p class="empty">No deaths logged yet.</p>'}</div>
    <div class="card"><div class="card-head"><h2>Trending</h2><span class="hint">parse % last 2 weeks vs the weeks before, same role only</span></div>
      ${tr.length ? [tr.slice(0, 3).filter(t => t.d > 0), tr.slice(-3).reverse().filter(t => t.d < 0)].map(list => list.map(t => `<div class="sum-row">${nameHtml(t.o.x.main)} ${t.o.multi ? roleTag(t.o.r) : ''}<span class="r"><b style="color:${t.d > 0 ? '#7ee787' : '#ff7b72'}">${t.d > 0 ? '&#9650; +' : '&#9660; '}${t.d}</b></span></div>`).join('')).join('') || '<p class="empty">Nobody is trending up or down.</p>' : '<p class="empty">Needs 3+ weeks of logs.</p>'}</div></div>
    <div class="card"><div class="card-head"><h2>Performance &amp; trends</h2><span class="hint">parse % on ${OFF.difficulty} kills per reset week (overall %), by the role they played &middot; 8 weeks</span></div>
    ${ps.length ? `<div class="table-wrap"><table class="logs-table perf-table"><thead><tr><th>Raider</th><th>Role</th><th>Avg</th><th data-tip="Last 2 weeks compared with the weeks before, in this role only">Trend</th>${weeks.map(w => `<th>${wk(w)}</th>`).join('')}<th>Kills</th><th data-tip="Pulls where they died first / pulls they were in">First deaths</th><th>Best / worst boss</th></tr></thead><tbody>${
      rows.map(({ x, r, first }) => { const bb = (r.byBoss || []).slice().sort((a, b) => b.avg - a.avg); const best = bb[0], worst = bb[bb.length - 1];
        return `<tr${first ? '' : ' class="role-row"'}><td>${first ? nameHtml(x.main) : ''}</td><td>${roleTag(r)}</td><td><b style="color:${parseColor(r.avg)}">${r.avg == null ? '-' : r.avg}</b></td><td>${trend(r)}</td>${
          (r.weekly || []).map(v => `<td><span style="color:${parseColor(v)}">${v == null ? '<span class="hint">-</span>' : v}</span></td>`).join('')}<td>${r.kills}</td>
          <td${first ? ` data-tip="${esc(Object.keys(x.firstBy).map(b => b + ': ' + x.firstBy[b]).join('<br>') || 'none')}"` : ''}>${first ? `${x.firsts} <span class="hint">/ ${x.pulls} (${fd(x)}%)</span>` : ''}</td>
          <td class="hint">${best ? `<span style="color:${parseColor(best.avg)}">${esc(best.boss)} ${best.avg}</span>${worst && worst !== best ? ` &middot; <span style="color:${parseColor(worst.avg)}">${esc(worst.boss)} ${worst.avg}</span>` : ''}` : '-'}</td></tr>`; }).join('')}</tbody></table></div>`
      : '<p class="empty">No raid logs read yet.</p>'}${logInfoHtml()}</div>`;
}

/* ------------------------------------------------------------------ render */
// Guild links in the header: Warcraft Logs, Raider.io, Armory, Discord (Discord link from the sheet's Settings tab)
function guildLinks() {
  const g = (STATE && STATE.guild) || {}, region = g.region || 'us', realm = g.realm || 'eldrethalas', name = g.name || 'Apotheosis';
  const wclId = g.wcl && g.wcl.id;
  const links = [
    ['warcraftlogs.com', 'Warcraft Logs', wclId ? `https://www.warcraftlogs.com/guild/id/${wclId}` : `https://www.warcraftlogs.com/guild/${region}/${realm}/${encodeURIComponent(name)}`],
    ['raider.io', 'Raider.io', (g.rio && g.rio.url) || `https://raider.io/guilds/${region}/${realm}/${encodeURIComponent(name)}`],
    ['worldofwarcraft.blizzard.com', 'Armory', `https://worldofwarcraft.blizzard.com/en-us/guild/${region}/${realm}/${encodeURIComponent(name.toLowerCase())}`],
    ['discord.com', 'Discord', g.discord || '']
  ].filter(l => l[2]);
  $('guild-links').innerHTML = links.map(([d, l, u]) => `<a class="glink" href="${esc(u)}" target="_blank" rel="noopener">${fav(d, l[0])}<span>${l}</span></a>`).join('');
}
function render() {
  if (!STATE) return;
  guildLinks();
  // Officer tabs: hidden unless the officer key is entered
  $('off-tabs').style.display = officerKey ? '' : 'none';
  if (!officerKey && OFF_TABS.includes(tab)) { tab = 'guild'; history.replaceState(null, '', '#guild'); }
  const pendN = OFF ? (OFF.requests || []).filter(r => r.status === 'Pending').length : (STATE.pendingRequests || 0);
  $('appr-count').textContent = pendN ? ' ' + pendN : '';
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
  $('alts-wrap').innerHTML = altsHtml();
  const bench = benchPlayers();
  $('bench-wrap').innerHTML = bench.length ? `<div class="section-title"><h2>Others on the roster</h2><span class="hint">${bench.length} players</span></div><div class="chars lite-grid">${bench.map(p => playerTile(p, 'bench')).join('')}</div>` : '';
  lootHtml();
  priorityHtml();
  simsHtml();
  paintLock();
  talentsHtml();
  vaultHtml();
  requestsHtml();
  if (officerKey) { uploadHtml(); approvalsHtml(); attendanceHtml(); performanceHtml(); }
  guildHtml();
  mplusHtml();
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-lock]')) {
    e.preventDefault();
    if (officerKey) { officerKey = ''; OFF = null; try { localStorage.removeItem('apoOfficerKey'); } catch (er) { /* */ } render(); return; }
    const k = prompt('Officer key (set in the sheet: Apotheosis > Set officer key):');
    if (!k || !k.trim()) return;
    officerKey = k.trim();
    officerPost({ action: 'check' }).then(() => { try { localStorage.setItem('apoOfficerKey', officerKey); } catch (er) { /* */ } render(); loadOfficer(); })
      .catch(err => { officerKey = ''; alert(err.message); render(); });
    return;
  }
  const oa = e.target.closest('[data-openall]');
  if (oa) {
    const kind = oa.dataset.openall, onlyStale = !!oa.dataset.stale;
    const list = simPlayers().map(simStatus).filter(x => x.ok).map(x => x.c).filter(c => !onlyStale || !simOf(c, kind) || ageDays(simOf(c, kind).date) > STALE_DAYS);
    let blocked = 0;
    list.forEach(c => { const w = window.open(rbUrl('droptimizer', c), '_blank'); if (!w) blocked++; else { try { w.opener = null; } catch (er) { /* */ } } });
    const m = document.getElementById('openall-msg');
    if (m) m.innerHTML = !list.length ? 'Everyone is up to date.' : blocked >= list.length - 1 && list.length > 1
      ? `Your browser blocked the pop-ups: allow pop-ups for this site (icon at the right of the address bar), then click again.` : `Opened ${list.length} tabs.`;
    return;
  }
  const pr = e.target.closest('[data-promote]');
  if (pr) { if (!confirm('Move ' + pr.dataset.promote + ' from Initiate to Raider?')) return; pr.disabled = true; toolMsg = 'Saving…';
    officerPost({ action: 'setStatus', player: pr.dataset.promote, status: 'Raider' }).then(msg => { toolMsg = msg; apprMsg = msg; return Promise.all([load(), loadOfficer()]); }).catch(err => { apprMsg = 'Not saved: ' + err.message; render(); }); return; }
  const ra = e.target.closest('[data-ranksall]');
  if (ra) { e.preventDefault(); ranksAll = !ranksAll; render(); return; }
  const tl = e.target.closest('[data-tool]');
  if (tl) {
    const [what, val] = tl.dataset.tool.split('|');
    if (what === 'resetOpen') { resetOpen = !resetOpen; render(); return; }
    let body;
    if (what === 'showAlts') body = { action: 'setOption', name: 'showAlts', value: val === '1' };
    if (what === 'clearAlts') { if (prompt('Type CLEAR to remove every alt from the roster (they are copied to the Roster archive tab first):') !== 'CLEAR') return; body = { action: 'clearAlts' }; }
    if (what === 'clearSecondaries') {
      if (prompt('Type CLEAR to remove every secondary main (copied to the Roster archive tab first):') !== 'CLEAR') return;
      const mains = {}; (STATE.roster || []).filter(p => (p.alts || []).length).forEach(p => { const r = document.querySelector(`input[name="rm-${CSS.escape(p.player)}"]:checked`); if (r) mains[p.player] = r.value; });
      body = { action: 'clearSecondaries', mains };
    }
    if (!body) return;
    tl.disabled = true; toolMsg = 'Saving…'; render();
    officerPost(body).then(msg => { toolMsg = msg; resetOpen = false; return Promise.all([load(), loadOfficer()]); }).catch(err => { toolMsg = 'Not saved: ' + err.message; render(); });
    return;
  }
  const rq = e.target.closest('[data-reqdo]');
  if (rq) {
    const [id, decision] = rq.dataset.reqdo.split('|');
    if (decision === 'deny' && !confirm('Deny this request?')) return;
    const specEl = document.querySelector(`[data-reqspec="${id}"]`);
    rq.disabled = true; apprMsg = decision === 'recheck' ? 'Rechecking gear…' : 'Saving…'; approvalsHtml();
    officerPost(decision === 'recheck' ? { action: 'requestRecheck', id } : { action: 'requestDecide', id, decision, spec: specEl ? specEl.value.trim() : '' })
      .then(msg => { apprMsg = msg; return Promise.all([load(), loadOfficer()]); }).catch(err => { apprMsg = 'Not saved: ' + err.message; render(); });
    return;
  }
  const wd = e.target.closest('[data-wishdel]');
  if (wd) { e.preventDefault(); const [name, realm, item, kind] = wd.dataset.wishdel.split('|');
    if (!confirm('Remove ' + item + ' from ' + name + "'s wishlist?")) return;
    officerPost({ action: 'wishDelete', name, realm, item, kind }).then(() => load()).catch(err => alert(err.message)); return; }
  const lt = e.target.closest('[data-loottile]');
  if (lt && !e.target.closest('a')) { const k = lt.dataset.loottile; lootOpen.has(k) ? lootOpen.delete(k) : lootOpen.add(k); render(); return; }
  const lv = e.target.closest('[data-lootview]');
  if (lv) { lootView = lv.dataset.lootview; save('apoLootView', lootView); render(); return; }
  const tt2 = e.target.closest('[data-taltile]');
  if (tt2 && !e.target.closest('a,button')) { const k = tt2.dataset.taltile; talOpen.has(k) ? talOpen.delete(k) : talOpen.add(k); render(); return; }
  const tb2 = e.target.closest('[data-talboss]');
  if (tb2) { talBoss = tb2.dataset.talboss; save('apoTalBoss', talBoss); render(); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) { const code = cp.dataset.copy, done = () => { const t = cp.textContent; cp.textContent = 'Copied ✓'; setTimeout(() => { cp.textContent = t; }, 1500); };
    (navigator.clipboard ? navigator.clipboard.writeText(code).then(done) : Promise.reject()).catch(() => prompt('Copy this talent string (Ctrl+C):', code)); return; }
  const dt = e.target.closest('[data-droptoggle]');
  if (dt && !e.target.closest('a')) { const k = dt.dataset.droptoggle; dropOpen.has(k) ? dropOpen.delete(k) : dropOpen.add(k); render(); return; }
  const sv = e.target.closest('[data-simview]');
  if (sv) { simView = sv.dataset.simview; save('apoSimView', simView); render(); return; }
  const uk = e.target.closest('[data-uploadkind]');
  if (uk) { setupMsg = ''; uploadKind = uk.dataset.uploadkind; save('apoUploadKind', uploadKind); render(); return; }
  const sk = e.target.closest('[data-simkind]');
  if (sk) { setupMsg = ''; simKind = sk.dataset.simkind; save('apoSimKind', simKind); render(); return; }
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
  if (tg) { const k = tg.dataset.apotoggle; tileOpen.has(k) ? tileOpen.delete(k) : tileOpen.add(k); render(); return; }
  const tt = e.target.closest('[data-team]');
  if (tt) { e.preventDefault(); openTeam = openTeam === tt.dataset.team ? '' : tt.dataset.team; render(); return; }
  const tp = e.target.closest('[data-teampick]');
  if (tp) { const [tm, base, pick] = tp.dataset.teampick.split('|'); teamPick[tm + '|' + base] = pick; try { localStorage.setItem('apoTeamPick', JSON.stringify(teamPick)); } catch (er) { /* blocked */ } render(); return; }
  const db = e.target.closest('[data-dungeon]');
  if (db) { const k = db.dataset.dungeon; openDungeon.has(k) ? openDungeon.delete(k) : openDungeon.add(k); render(); return; }
});

// Healer wishlist form: picking a healer fills the "missing BiS" list; picking a BiS item fills in its boss
document.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.rankoff != null) {
    const list = [...document.querySelectorAll('[data-rankoff]:checked')].map(x => Number(x.dataset.rankoff));
    if (OFF && OFF.ranks) OFF.ranks.map.officer = list;
    officerPost({ action: 'setOption', name: 'rank:officer', value: list }).then(() => loadOfficer()).catch(err => { apprMsg = 'Not saved: ' + err.message; render(); });
    return;
  }
  if (e.target.dataset && e.target.dataset.rankset) {
    const k = e.target.dataset.rankset, v = e.target.value;
    if (OFF && OFF.ranks) OFF.ranks.map[k] = v === '' ? null : Number(v);
    officerPost({ action: 'setOption', name: 'rank:' + k, value: v }).then(() => loadOfficer()).catch(err => { apprMsg = 'Not saved: ' + err.message; render(); });
    return;
  }
  if (e.target.dataset && e.target.dataset.reqcls) {
    const sel = e.target.closest('form').querySelector('select[name=spec]'), specs = CLASS_SPECS[e.target.value] || [];
    sel.innerHTML = specs.length ? '<option value="">Pick a spec…</option>' + specs.map(x => `<option>${x}</option>`).join('') : '<option value="">Pick the class first</option>';
    sel.disabled = !specs.length;
  }
  if (e.target.id === 'wish-who') {
    const [n, r] = e.target.value.split('|');
    const p = raidPlayers().find(x => toonsOfP(x).some(t => t.name === n));
    const c = p ? toonsOfP(p).find(t => t.name === n) : null;
    const need = (c && c.bis && c.bis.need) || [];
    $('wish-bis').innerHTML = '<option value="">' + (need.length ? 'Pick from their missing BiS…' : 'No BiS list for this spec: type the item') + '</option>' +
      need.map((x, i) => `<option value="${i}">${esc(slotName(x.slot))}: ${esc(x.item)} (${esc(bossOfSrc(x.source) || x.source || '?')})</option>`).join('');
    $('wish-bis').dataset.need = JSON.stringify(need);
  }
  if (e.target.id === 'wish-bis' && e.target.value !== '') {
    const x = JSON.parse(e.target.dataset.need || '[]')[+e.target.value];
    if (x) { $('wish-item').value = x.item; const k = srcKind(x.source); $('wish-boss').value = k.kind === 'boss' ? k.key : 'Other'; $('wish-item').dataset.slot = slotName(x.slot); }
  }
});

document.addEventListener('submit', e => {
  const rf = e.target.closest('[data-reqform]');
  if (rf) {
    e.preventDefault();
    const type = rf.dataset.reqform, f = new FormData(rf), btn = rf.querySelector('button');
    const body = { action: 'request', type, player: type === 'initiate' ? '' : f.get('player'), name: String(f.get('name') || '').trim(), realm: f.get('realm'), spec: String(f.get('spec') || '').trim(), cls: String(f.get('cls') || ''), note: String(f.get('note') || '').trim() };
    btn.disabled = true; rf.querySelector('.req-msg').textContent = 'Sending…';
    fetch(WEBAPP_URL, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json())
      .then(out => { reqMsg[type] = out.ok ? '✓ ' + out.message : 'Not sent: ' + out.error; if (out.ok) { rf.reset(); return load(); } render(); })
      .catch(err => { reqMsg[type] = 'Not sent: ' + err.message; render(); });
    return;
  }
  if (e.target.id === 'wish-form') {
    e.preventDefault();
    const [name, realm] = $('wish-who').value.split('|'), item = $('wish-item').value.trim();
    if (!name || !item) { $('wish-msg').textContent = 'Pick a healer and an item.'; return; }
    $('wish-go').disabled = true;
    officerPost({ action: 'wishAdd', name, realm, item, slot: $('wish-item').dataset.slot || '', boss: $('wish-boss').value === 'Other' ? '' : $('wish-boss').value, kind: 'manual', note: $('wish-note').value.trim() })
      .then(msg => { wishMsg = msg; return load(); }).catch(err => { wishMsg = 'Not added: ' + err.message; $('wish-msg').textContent = wishMsg; })
      .finally(() => { const b = document.getElementById('wish-go'); if (b) b.disabled = false; });
    return;
  }
  if (e.target.id === 'setup-form') {
    e.preventDefault();
    const url = $('setup-url').value.trim();
    $('setup-go').disabled = true; $('setup-msg').textContent = 'Checking the setup on Raidbots…';
    officerPost({ action: 'setSetup', kind: e.target.dataset.kind, url })
      .then(msg => { setupMsg = '✓ ' + msg; return load(); }).catch(err => { setupMsg = 'Not saved: ' + err.message; render(); })
      .finally(() => { const b = document.getElementById('setup-go'); if (b) b.disabled = false; });
    return;
  }
  if (e.target.id !== 'sim-form') return;
  e.preventDefault();
  const urls = $('sim-url').value.split(/\s+/).filter(u => /raidbots\.com\/simbot\/report\//.test(u)), kind = $('sim-kindsel').value;
  if (!urls.length) { $('sim-msg').textContent = 'No Raidbots report links found.'; return; }
  $('sim-go').disabled = true;
  (async () => {
    const lines = [];
    for (const [i, url] of urls.entries()) {
      $('sim-msg').textContent = `Reading report ${i + 1} of ${urls.length}…`;
      try { lines.push('✓ ' + await officerPost({ action: 'simImport', url, kind })); }
      catch (err) { lines.push('✗ ' + url.replace(/.*report\//, '') + ': ' + err.message); }
    }
    simMsg = lines.join('\n');
    await load();
  })().finally(() => { const b = document.getElementById('sim-go'); if (b) b.disabled = false; });
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
    if (officerKey && !OFF) loadOfficer();
  } catch (e) {
    if (!STATE) $('when').textContent = 'Could not load: ' + e.message;
  }
}
const saved = store('apoSaved', null);
if (saved && saved.state) show(saved.state, saved.when + ' (updating…)', false);
load();
setInterval(load, REFRESH_MINUTES * 60 * 1000);
