/* Raid Boss Strats tab + officer Strat Notes tab.
   Guides come from strats.json (this folder). Officer notes, pictures and edited cliff notes come from the sheet
   ("Strat Notes" tab) through the web app: STATE.strat = { notes: { bossId: [{id, text, img, at}] }, cliff: { bossId: [5] } }.
   Loaded after app.js and uses its helpers (esc, $, officerPost, officerKey, render, artOf, load). */

let STRATS = null, stratErr = '';
let stratPick = (location.hash.split('/')[1] || '');       // boss id from #strats/<id>
let stratSeason = '', stratRaid = '';
let snPick = '', snMsg = '', snImg = null, snEdit = '', snBusy = false;  // officer form state
let ABIL = null, abilLoading = false, apImg = null, apPick = '';          // Adventure Guide abilities (from the web app, ?part=abil)
function loadAbil() {
  if (ABIL || abilLoading || typeof WEBAPP_URL === 'undefined' || !WEBAPP_URL) return;
  abilLoading = true;
  fetch(WEBAPP_URL + '?part=abil').then(r => r.json()).then(j => { ABIL = j.bosses || {}; abilLoading = false; stratsRender(); stratNotesTabRender(); })
    .catch(() => { ABIL = {}; abilLoading = false; });
}
// Icons + descriptions for boss spells come from Wowhead's public tooltip feed (Blizzard's API has none for boss spells), kept in this browser
let WH = {}; try { WH = JSON.parse(localStorage.getItem('apoWH') || '{}'); } catch (e) { WH = {}; }
Object.keys(WH).forEach(k => { if (!WH[k] || !WH[k].i) delete WH[k]; });            // drop blanks saved by the first version
const whQueue = [], whQueued = new Set(), whTries = {}; let whActive = 0, whTimer = 0;
const abIcon = n => n ? 'https://wow.zamimg.com/images/wow/icons/large/' + n + '.jpg' : '';  // Wowhead's icon server has the newest icons
function whFill(list) {
  list.forEach(a => { if (a.s && !WH[a.s] && !whQueued.has(a.s) && (whTries[a.s] || 0) < 3) { whQueued.add(a.s); whQueue.push(a.s); } });
  whPump();
}
function whPump() {
  while (whActive < 6 && whQueue.length) {
    const id = whQueue.shift(); whActive++;
    fetch('https://nether.wowhead.com/tooltip/spell/' + id + '?dataEnv=1&locale=0').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(j => {
      const div = document.createElement('div'); div.innerHTML = String(j.tooltip || '').replace(/<br\s*\/?>/gi, ' ');
      const q = div.querySelector('.q'); WH[id] = { i: j.icon || '', d: ((q || div).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 420) };
    }).catch(() => { whTries[id] = (whTries[id] || 0) + 1; }).finally(() => {
      whActive--; whQueued.delete(id);
      if (!WH[id] && (whTries[id] || 0) < 3) setTimeout(() => { whQueued.add(id); whQueue.push(id); whPump(); }, 1500 * (whTries[id] || 1));
      clearTimeout(whTimer);
      whTimer = setTimeout(() => { try { localStorage.setItem('apoWH', JSON.stringify(WH)); } catch (e) { /* full */ } abRxBoss = ''; stratsRender(); }, 300);
      whPump();
    });
  }
}
const abilsOf = b => {
  if (!ABIL) return [];
  const raw = (ABIL[b.journal || b.name] || ABIL[b.name] || []).filter(a => a.s);
  whFill(raw);
  return raw.map(a => { const w = WH[a.s] || {}; return { n: a.n, s: a.s, i: a.i || w.i || '', d: a.d || w.d || '' }; });
};
const abilPic = (b, n) => (((STATE && STATE.strat && STATE.strat.pics) || {})[b.id] || {})[n] || '';
const abilTip = (b, a) => `<div class="abtip"><div class="abt-h">${a.i ? `<img src="${abIcon(esc(a.i))}" alt="">` : ''}<b>${esc(a.n)}</b></div>${a.d ? `<p>${esc(a.d)}</p>` : ''}${abilPic(b, a.n) ? `<img class="abt-pic" src="${esc(abilPic(b, a.n))}" alt="">` : ''}</div>`;
// Wrap known ability names in already-escaped guide text with an icon + hover tooltip
let abRx = null, abRxBoss = '', abMap = {};
function abilLink(b, html) {
  const list = abilsOf(b); if (!list.length) return html;
  if (abRxBoss !== b.id) {
    abMap = {}; list.forEach(a => { if (a.n.length >= 4) abMap[esc(a.n).toLowerCase()] = a; });
    const keys = Object.keys(abMap).sort((x, y) => y.length - x.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    abRx = keys.length ? new RegExp('(^|[^A-Za-z])(' + keys.join('|') + ')(?![A-Za-z])', 'gi') : null; abRxBoss = b.id;
  }
  if (!abRx) return html;
  return html.replace(abRx, (m, pre, name) => { const a = abMap[name.toLowerCase()]; if (!a) return m;
    return pre + `<span class="ab${abilPic(b, a.n) ? ' has-pic' : ''}" data-tip="${esc(abilTip(b, a))}">${a.i ? `<img src="${abIcon(esc(a.i))}" alt="">` : ''}${name}</span>`; });
}

fetch('strats.json?v=8', { cache: 'no-cache' }).then(r => r.json()).then(j => { STRATS = j; if (typeof render === 'function' && STATE) render(); else stratsRender(); })
  .catch(e => { stratErr = e.message; stratsRender(); });

const stratAll = () => (STRATS ? STRATS.seasons : []).flatMap(s => s.raids.flatMap(r => r.bosses.map(b => ({ s, r, b }))));
const stratFind = id => stratAll().find(x => x.b.id === id);
const stratNotes = id => ((STATE && STATE.strat && STATE.strat.notes) || {})[id] || [];
// Officer cliff notes: 5 lines, then the Hero call as a 6th entry
const stratCliff = b => { const c = ((STATE && STATE.strat && STATE.strat.cliff) || {})[b.id], custom = !!(c && c.some(Boolean));  // eslint-disable-line
  return { lines: (custom ? c.slice(0, 5) : (b.cliff || [])).filter(Boolean), hero: (custom && c[5]) || b.hero || '', custom }; };
const HERO_ICON = `<img class="hero-ic" src="${ICON_BASE}ability_shaman_heroism.jpg" alt="" onerror="this.style.display='none'">`;
// Cliff note roles: a line can start with [T], [H], [D] or a mix ("[TH] text")
const cliffParse = line => { const m = String(line || '').match(/^\s*\[([THD]{1,3})\]\s*/i); return { roles: m ? m[1].toUpperCase() : '', text: m ? String(line).slice(m[0].length) : String(line || '') }; };
const CLIFF_ROLES = [['T', 'Tank', 'Tanks'], ['H', 'Healer', 'Healers'], ['D', 'DPS', 'DPS']];
const cliffIcons = roles => roles === 'THD' || !roles ? `<span class="cl-roles all" data-tip="Everyone">${CLIFF_ROLES.map(r => roleIcon(r[1])).join('')}</span>`
  : `<span class="cl-roles" data-tip="${CLIFF_ROLES.filter(r => roles.includes(r[0])).map(r => r[2]).join(' &amp; ')}">${CLIFF_ROLES.filter(r => roles.includes(r[0])).map(r => roleIcon(r[1])).join('')}</span>`;
// Guide lines starting with "HC: " are Heroic additions
const HC_TAG = '<span class="hc-tag" data-tip="Heroic addition: not on Normal">Heroic</span>';
let glBoss = null;
const gl = x => { const h = /^HC:\s*/.test(x), t = esc(String(x).replace(/^HC:\s*/, '')); return `<li${h ? ' class="hc"' : ''}>${h ? HC_TAG : ''}<span>${glBoss ? abilLink(glBoss, t) : t}</span></li>`; };
const stratArt = b => STATE ? (artOf(b.journal || b.name) || artOf(b.name)) : '';
const linkify = s => esc(s).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
const statusTag = b => b.status === 'ready' ? '' : b.status === 'draft' ? '<span class="st-tag draft">draft</span>' : '<span class="st-tag todo">guide coming</span>';

function stratCurrent() {
  const all = stratAll(); if (!all.length) return null;
  let cur = stratPick && stratFind(stratPick);
  if (!cur && stratRaid) cur = all.find(x => x.r.id === stratRaid);
  if (!cur && stratSeason) cur = all.find(x => x.s.id === stratSeason);
  if (!cur) cur = all[0];
  stratSeason = cur.s.id; stratRaid = cur.r.id; stratPick = cur.b.id;
  return cur;
}

function noteHtml(n, b, canEdit, i, total) {
  return `<div class="sn-note">
    ${n.text ? `<div class="sn-text">${linkify(n.text)}</div>` : ''}
    ${n.img ? `<a href="${esc(n.img)}" target="_blank" rel="noopener" class="sn-img"><img src="${esc(n.img)}" alt="" loading="lazy"></a>` : ''}
    ${canEdit ? `<div class="sn-tools"><span class="hint">${n.at ? new Date(n.at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</span>
      ${i > 0 ? `<button type="button" data-snmove="${esc(n.id)}|-1" title="Move up">&#9650;</button>` : ''}${i < total - 1 ? `<button type="button" data-snmove="${esc(n.id)}|1" title="Move down">&#9660;</button>` : ''}
      <button type="button" data-snedit="${esc(n.id)}|${esc(b.id)}">Edit</button><button type="button" class="danger" data-sndel="${esc(n.id)}">Remove</button></div>` : ''}
  </div>`;
}

/* ---------- Overhead maps (our own simple diagrams, not to scale) ----------
   b.map = [{t: panel title, floor: 'circle'|'rect'|'none', n: caption, s: [shapes]}] on a 100 x 70 grid.
   Shapes: {k:'boss'|'add'|'T'|'H'|'D'|'raid'|'zone'|'ring'|'arrow'|'x'|'text'|'line', x, y, ...} */
const MAPC = { red: '#e5484d', green: '#46a758', blue: '#3e8ef7', purple: '#a26cf0', gold: '#f0c24b', orange: '#f08a3c', teal: '#2fb5a8', grey: '#8b8b8b', white: '#e6e6e6' };
const mc = c => MAPC[c] || c || MAPC.grey;
const mtx = (x, y, l, o) => l ? `<text x="${x}" y="${y}" text-anchor="${(o && o.a) || 'middle'}" font-size="${(o && o.fs) || 3.4}" fill="${(o && o.fill) || '#ddd'}" font-weight="${(o && o.fw) || 600}" paint-order="stroke" stroke="#111" stroke-width=".9">${esc(l)}</text>` : '';
function mapShape(z) {
  const c = mc(z.c);
  switch (z.k) {
    case 'boss': return `<circle cx="${z.x}" cy="${z.y}" r="${z.r || 5}" fill="#6b1d1d" stroke="#ff6b6b" stroke-width=".8"/><text x="${z.x}" y="${z.y + 1.4}" text-anchor="middle" font-size="4" fill="#fff">💀</text>${mtx(z.x, z.y - (z.r || 5) - 1.5, z.l, { fill: '#ffb4b4' })}`;
    case 'add': return `<circle cx="${z.x}" cy="${z.y}" r="${z.r || 2.6}" fill="${c}" fill-opacity=".85" stroke="#111" stroke-width=".4"/>${mtx(z.x, z.y + (z.r || 2.6) + 3.6, z.l, { fs: 3 })}`;
    case 'T': case 'H': case 'D': { const col = { T: '#3e8ef7', H: '#46a758', D: '#e5484d' }[z.k];
      return `<circle cx="${z.x}" cy="${z.y}" r="2.6" fill="${col}" stroke="#111" stroke-width=".4"/><text x="${z.x}" y="${z.y + 1.2}" text-anchor="middle" font-size="3.2" font-weight="700" fill="#fff">${z.k}</text>${mtx(z.x, z.y + 6, z.l, { fs: 3 })}`; }
    case 'raid': { const r = z.r || 6, dots = [[0, 0], [-.5, -.45], [.5, -.45], [-.55, .4], [.55, .4], [0, -.85], [0, .8]];
      return `<circle cx="${z.x}" cy="${z.y}" r="${r}" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-width=".5" stroke-dasharray="1.2 1"/>${dots.map(d => `<circle cx="${z.x + d[0] * r * .7}" cy="${z.y + d[1] * r * .7}" r=".95" fill="${c}"/>`).join('')}${mtx(z.x, z.y + r + 3.6, z.l, { fs: 3 })}`; }
    case 'zone': return `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="1.5" fill="${c}" fill-opacity="${z.o || .22}" stroke="${c}" stroke-width=".5"${z.dash ? ' stroke-dasharray="1.5 1"' : ''}/>${mtx(z.x + z.w / 2, z.y + z.h / 2 + 1.2, z.l, { fs: 3 })}`;
    case 'ring': return `<circle cx="${z.x}" cy="${z.y}" r="${z.r}" fill="${c}" fill-opacity="${z.o == null ? .15 : z.o}" stroke="${c}" stroke-width=".6"${z.dash ? ' stroke-dasharray="1.5 1"' : ''}/>${mtx(z.x, z.y + (z.ly || 1.2), z.l, { fs: 3 })}`;
    case 'line': return `<line x1="${z.x}" y1="${z.y}" x2="${z.x2}" y2="${z.y2}" stroke="${c}" stroke-width="${z.w || .7}"${z.dash ? ' stroke-dasharray="1.6 1.2"' : ''}/>${mtx((z.x + z.x2) / 2, (z.y + z.y2) / 2 - 1.5, z.l, { fs: 3 })}`;
    case 'arrow': return `<line x1="${z.x}" y1="${z.y}" x2="${z.x2}" y2="${z.y2}" stroke="${c}" stroke-width="${z.w || .8}" marker-end="url(#ah-${(z.c || 'grey')})"${z.dash ? ' stroke-dasharray="1.6 1.2"' : ''}/>${mtx((z.x + z.x2) / 2 + (z.lx || 0), (z.y + z.y2) / 2 + (z.ly || -1.6), z.l, { fs: 3 })}`;
    case 'x': return `<text x="${z.x}" y="${z.y + 2}" text-anchor="middle" font-size="6" font-weight="800" fill="${MAPC.red}">✕</text>${mtx(z.x, z.y + 6.5, z.l, { fs: 2.9, fill: '#ffb4b4' })}`;
    case 'text': return mtx(z.x, z.y, z.l, { fs: z.fs || 3.2, a: z.a, fill: z.c ? c : '#bbb', fw: 500 });
  }
  return '';
}
function stratMapHtml(b) {
  if (!b.map || !b.map.length) return '';
  const markers = Object.keys(MAPC).map(k => `<marker id="ah-${k}" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6z" fill="${MAPC[k]}"/></marker>`).join('');
  const floor = p => p.floor === 'none' ? '' : p.floor === 'rect' ? '<rect x="3" y="3" width="94" height="64" rx="4" fill="#1c1d22" stroke="#3a3b42" stroke-width=".6"/>' : '<circle cx="50" cy="35" r="32" fill="#1c1d22" stroke="#3a3b42" stroke-width=".6"/>';
  return `<div class="card strat-map"><div class="card-head"><h2>🗺️ Positioning map</h2><span class="hint">simple overhead view &middot; not to scale</span></div>
    <div class="map-row">${b.map.map((p, i) => `<figure class="map-panel"><figcaption><span class="map-n">${i + 1}</span>${esc(p.t)}</figcaption>
      <svg viewBox="0 0 100 70" role="img" aria-label="${esc(p.t)}"><defs>${markers}</defs>${floor(p)}${(p.s || []).map(mapShape).join('')}</svg>
      ${p.n ? `<p>${abilLink(b, esc(p.n))}</p>` : ''}</figure>`).join('')}</div>
    <div class="map-key"><span><i style="background:#3e8ef7">T</i>Tank</span><span><i style="background:#46a758">H</i>Healer</span><span><i style="background:#e5484d">D</i>DPS</span><span><i class="dots"></i>Raid / group</span><span><b style="color:#ff6b6b">💀</b>Boss</span><span><b style="color:#e5484d">✕</b>Don't stand here</span></div></div>`;
}
/* ---------- Ground effects: every soak / dodge / line / pool / spread / stack the guide mentions ----------
   Built from the guide text: each sentence that names an ability is sorted by what it asks you to do. */
const GE_TYPES = [
  ['soak', 'Soak', '#f0c24b', /\b(soak|soaks|soaked|soakers?|step(ping)? on|collect|pick up|grab)\b/i],
  ['line', 'Line / frontal', '#e5484d', /\b(line|lines|beam|laser|frontal|cone|breath|charge|arrow)\b/i],
  ['pool', 'Pool / puddle', '#a26cf0', /\b(pool|pools|puddle|puddles|patch|patches|goo)\b/i],
  ['spread', 'Spread', '#3e8ef7', /\bspread\b/i],
  ['stack', 'Stack', '#46a758', /\b(pixel-)?stack(ed)?\b(?! of)/i],
  ['dodge', 'Dodge', '#f08a3c', /\b(dodge|avoid|swirls?|circles?|waves?|tornado(es)?|don't stand|stay out|step out|run out|move off|out of)\b/i]
];
const GE_GLYPH = {
  soak: '<circle cx="20" cy="20" r="15" fill="#f0c24b33" stroke="#f0c24b" stroke-width="1.5"/><circle cx="15" cy="17" r="2.2" fill="#fff"/><circle cx="24" cy="16" r="2.2" fill="#fff"/><circle cx="20" cy="24" r="2.2" fill="#fff"/><circle cx="13" cy="25" r="2.2" fill="#fff"/><circle cx="27" cy="24" r="2.2" fill="#fff"/>',
  line: '<circle cx="8" cy="20" r="5" fill="#6b1d1d" stroke="#ff6b6b"/><path d="M12 20 L37 9 L37 31 Z" fill="#e5484d44" stroke="#e5484d" stroke-width="1.2"/><circle cx="25" cy="34" r="2.4" fill="#46a758"/>',
  pool: '<ellipse cx="15" cy="16" rx="9" ry="6" fill="#a26cf066" stroke="#a26cf0"/><ellipse cx="27" cy="27" rx="8" ry="5.5" fill="#a26cf066" stroke="#a26cf0"/><circle cx="31" cy="11" r="2.4" fill="#46a758"/>',
  spread: '<circle cx="20" cy="20" r="2.4" fill="#3e8ef7"/><path d="M20 20 L7 8 M20 20 L33 8 M20 20 L7 32 M20 20 L33 32" stroke="#3e8ef7" stroke-width="1.4" stroke-dasharray="2 2"/><circle cx="7" cy="8" r="2.4" fill="#fff"/><circle cx="33" cy="8" r="2.4" fill="#fff"/><circle cx="7" cy="32" r="2.4" fill="#fff"/><circle cx="33" cy="32" r="2.4" fill="#fff"/>',
  stack: '<circle cx="20" cy="20" r="7" fill="#46a75844" stroke="#46a758"/><circle cx="18" cy="18" r="2" fill="#fff"/><circle cx="22" cy="18" r="2" fill="#fff"/><circle cx="20" cy="22" r="2" fill="#fff"/><path d="M5 5 L12 12 M35 5 L28 12 M5 35 L12 28 M35 35 L28 28" stroke="#46a758" stroke-width="1.4"/>',
  dodge: '<circle cx="18" cy="18" r="11" fill="#f08a3c33" stroke="#f08a3c" stroke-width="1.4" stroke-dasharray="3 2"/><path d="M14 14 L22 22 M22 14 L14 22" stroke="#e5484d" stroke-width="2"/><circle cx="33" cy="33" r="2.6" fill="#46a758"/><path d="M26 27 L31 31" stroke="#46a758" stroke-width="1.3"/>'
};
function groundOf(b) {
  const list = abilsOf(b); if (!list.length) return [];
  const lines = [];
  (b.phases || []).forEach(p => p.items.forEach(x => lines.push(x)));
  ['raid', 'tank', 'healer'].forEach(k => (b[k] || []).forEach(x => lines.push(x)));
  (b.cliff || []).forEach(x => lines.push(cliffParse(x).text));
  const sents = [];
  lines.forEach(l => { const hc = /^HC:\s*/.test(l); String(l).replace(/^HC:\s*/, '').split(/(?<=[.;!?])\s+|:\s+(?=[A-Z])/).forEach(t => t.trim() && sents.push({ t: t.trim(), hc })); });
  const out = [];
  list.forEach(a => {
    if (a.n.length < 4) return;
    const rx = new RegExp('(^|[^A-Za-z])' + a.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z])', 'i');
    const hits = sents.filter(x => rx.test(x.t)); if (!hits.length) return;
    for (const [k, label, col, re] of GE_TYPES) { const h = hits.find(x => re.test(x.t)); if (h) { out.push({ a, k, label, col, do: h.t, hc: h.hc }); return; } }
  });
  return out.sort((x, y) => GE_TYPES.findIndex(t => t[0] === x.k) - GE_TYPES.findIndex(t => t[0] === y.k));
}
const GE_GROUP = { soak: 'Soaks', line: 'Lines & frontals', pool: 'Pools & puddles', spread: 'Spreads', stack: 'Stacks', dodge: 'Dodges' };
function groundHtml(b) {
  const g = groundOf(b); if (!g.length) return '';
  const tile = x => { const pic = abilPic(b, x.a.n);
    return `<div class="ge"><div class="ge-top"><span class="ge-type">${({ soak: 'Soak', line: 'Line', pool: 'Pool', spread: 'Spread', stack: 'Stack', dodge: 'Dodge' })[x.k]}</span>${x.hc ? HC_TAG : ''}</div>
      <div class="ge-name"><span class="ab" data-tip="${esc(abilTip(b, x.a))}">${x.a.i ? `<img src="${abIcon(esc(x.a.i))}" alt="">` : ''}${esc(x.a.n)}</span></div>
      <div class="ge-look">${pic ? `<img src="${esc(pic)}" alt="${esc(x.a.n)}" loading="lazy">` : `<svg viewBox="0 0 40 40">${GE_GLYPH[x.k]}</svg><span>${officerKey ? 'No screenshot yet' : 'Screenshot coming'}</span>`}</div>
      <p class="ge-do">${esc(x.do)}</p></div>`; };
  const groups = GE_TYPES.map(t => ({ t, items: g.filter(x => x.k === t[0]) })).filter(x => x.items.length);
  return `<div class="card ground"><div class="card-head"><h2>🎯 Ground effects</h2><span class="hint">every soak, dodge, line and pool in this guide &middot; hover the name for the in-game text${officerKey ? ' &middot; add screenshots in Strat Notes → Ability pictures' : ''}</span></div>
    <div class="ge-groups">${groups.map(({ t, items }) => `<div class="ge-group" style="--ge:${t[2]}"><div class="ge-gh"><svg viewBox="0 0 40 40">${GE_GLYPH[t[0]]}</svg><h3>${GE_GROUP[t[0]]}</h3><span class="ge-count">${items.length}</span></div>
      <div class="ge-grid">${items.map(tile).join('')}</div></div>`).join('')}</div></div>`;
}
function stratBossHtml(cur) {
  loadAbil(); glBoss = cur.b;
  const b = cur.b, notes = stratNotes(b.id), cl = stratCliff(b), art = stratArt(b);
  const list = (title, items, cls) => items && items.length ? `<div class="sg-sec ${cls || ''}"><h3>${title}</h3><ul>${items.map(gl).join('')}</ul></div>` : '';
  const df = b.diff, meta = STRATS.metas && STRATS.metas[cur.s.id];
  const diffHtml = df ? `<div class="diff-tiles">${[['normal', 'Normal', 'What\'s easier or missing'], ['heroic', 'Heroic', 'What Heroic adds: this guide'], ['mythic', 'Mythic', 'For reference only']].map(([k, l, h]) =>
    `<div class="diff-tile ${k}"><div class="dt-head"><b>${l}</b><span class="hint">${h}</span></div><ul>${(df[k] || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li class="hint">No changes listed.</li>'}</ul></div>`).join('')}</div>` : '';
  const ach = b.ach ? `<div class="card ach-card"><div class="card-head"><h2>&#127942; Achievement: ${esc(b.ach.name)}</h2><span class="hint">${meta ? 'part of ' + esc(meta.name) : ''}</span></div>
      <p class="ach-req">${esc(b.ach.req)}</p>
      ${b.ach.pace ? `<div class="ach-pace ${esc(b.ach.pace.k)}"><span class="pace-chip">${({ burn: '🔥', hold: '✋', slow: '🐢', normal: '✅' })[b.ach.pace.k] || ''} ${esc(b.ach.pace.l)}</span><p><b>What to expect:</b> ${esc(b.ach.pace.t)}</p></div>` : ''}
      <div class="ach-pre"><h3>&#128230; Pre-encounter</h3>${(b.ach.pre || []).length ? `<ul>${b.ach.pre.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="hint">Nothing to grab or click before the pull.</p>'}</div>
      <h3>During the fight</h3><ol class="ach-how">${b.ach.how.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      ${b.ach.note ? `<p class="hint">&#9432; ${esc(b.ach.note)}</p>` : ''}
      ${meta ? `<p class="ach-meta">${esc(meta.name)}: ${esc(meta.note)} Reward: <b>${esc(meta.reward)}</b>.</p>` : ''}</div>` : '';
  const facts = [b.setup && ['Setup', b.setup], b.lust && ['Lust', b.lust], b.style && ['Fight', b.style]].filter(Boolean);
  return `<div class="sb-head${art ? ' has-art' : ''}"${art ? ` style="--art:url('${esc(art)}')"` : ''}>
      <div class="sb-title"><span class="hint">${esc(cur.s.name)} &middot; ${esc(cur.r.name)}</span><h2>${esc(b.name)} ${statusTag(b)}</h2>
        ${facts.length ? `<div class="sb-facts">${facts.map(([k, v]) => `<span><b>${k}</b> ${esc(v)}</span>`).join('')}</div>` : ''}</div>
    </div>
    <div class="sb-top">
      <div class="card cliff-card"><div class="card-head"><h2>&#9889; Before the pull</h2><span class="hint">${cl.custom ? 'officer version' : 'say these every pull'}</span></div>
        ${cl.hero ? `<div class="hero-line">${HERO_ICON}<div><b>Heroism / Bloodlust</b><span>${esc(cl.hero)}</span></div></div>` : ''}
        ${cl.lines.length ? `<ol class="cliff">${cl.lines.map(x => { const c = cliffParse(x); return `<li><span class="cl-text">${abilLink(b, esc(c.text))}</span>${cliffIcons(c.roles)}</li>`; }).join('')}</ol>` : '<p class="empty">No cliff notes yet.</p>'}
        ${officerKey ? `<a class="hint" data-tab="stratnotes" data-snboss="${esc(b.id)}" href="#stratnotes">Edit cliff notes</a>` : ''}</div>
      <div class="card notes-card"><div class="card-head"><h2>&#128221; Officer notes</h2><span class="hint">${notes.length ? notes.length + ' note' + (notes.length === 1 ? '' : 's') : 'our own strat'}</span></div>
        ${notes.length ? notes.map((n, i) => noteHtml(n, b, !!officerKey, i, notes.length)).join('') : '<p class="empty">No officer notes for this boss yet.</p>'}
        ${officerKey ? `<a class="toggle-btn sn-add" data-tab="stratnotes" data-snboss="${esc(b.id)}" href="#stratnotes">+ Add a note or picture</a>` : ''}</div>
    </div>
    ${diffHtml}
    ${stratMapHtml(b)}
    ${groundHtml(b)}
    ${b.summary ? `<div class="card"><div class="card-head"><h2>Overview</h2><span class="hint">Heroic guide &middot; ${HC_TAG} = Heroic addition</span></div><p class="lead">${esc(b.summary)}</p>
      ${(b.phases || []).map(p => `<div class="sg-phase"><h3>${esc(p.t)}</h3><ul>${p.items.map(gl).join('')}</ul></div>`).join('')}</div>` : ''}
    ${(b.tank || b.healer || b.raid) ? `<div class="sg-roles">
      ${list(`${roleIcon('Tank')} Tanks <span class="hint">cooldowns &amp; swaps</span>`, b.tank, 'tank')}
      ${list(`${roleIcon('Healer')} Healers <span class="hint">cooldowns &amp; dispels</span>`, b.healer, 'healer')}
      ${list(`${roleIcon('DPS')} Raid &amp; DPS <span class="hint">soaks, positioning, adds</span>`, b.raid, 'dps')}</div>` : ''}
    ${b.wipes && b.wipes.length ? `<div class="card wipes"><div class="card-head"><h2>&#9888; What wipes us</h2></div><ul>${b.wipes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${ach}
    ${abilsOf(b).length ? `<div class="card"><div class="card-head"><h2>Boss abilities</h2><span class="hint">from the Adventure Guide &middot; hover for details${officerKey ? ' &middot; add pictures in Strat Notes' : ''}</span></div>
      <div class="ab-grid">${abilsOf(b).map(a => `<span class="ab chip${abilPic(b, a.n) ? ' has-pic' : ''}" data-tip="${esc(abilTip(b, a))}">${a.i ? `<img src="${abIcon(esc(a.i))}" alt="">` : ''}${esc(a.n)}</span>`).join('')}</div></div>`
      : ABIL ? '' : `<div class="card"><p class="empty">Loading boss abilities…</p></div>`}
    ${b.status !== 'ready' ? `<div class="card"><p class="empty">${b.status === 'draft' ? 'This guide is a short draft.' : 'The full guide for this boss isn\'t written yet.'} ${(b.links || []).length ? 'In the meantime, the guides below cover it.' : ''}</p></div>` : ''}
    ${(b.links || []).length ? `<p class="sg-links">Full guides: ${b.links.map(l => `<a href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.t)}</a>`).join(' &middot; ')}</p>` : ''}`;
}

function stratsRender() {
  const el = document.getElementById('strats-body'); if (!el) return;
  if (!STRATS) { el.innerHTML = `<div class="card"><p class="empty">${stratErr ? 'Could not load the guides: ' + esc(stratErr) : 'Loading guides…'}</p></div>`; return; }
  const cur = stratCurrent(), season = STRATS.seasons.find(s => s.id === stratSeason), raid = season.raids.find(r => r.id === stratRaid);
  const notesN = id => stratNotes(id).length;
  el.innerHTML = `<div class="st-nav">
      <div class="st-row">${STRATS.seasons.map(s => `<a class="st-chip big${s.id === stratSeason ? ' on' : ''}" data-stseason="${s.id}">${esc(s.name)}</a>`).join('')}</div>
      <div class="st-row">${season.raids.map(r => `<a class="st-chip${r.id === stratRaid ? ' on' : ''}" data-straid="${r.id}">${esc(r.name)} <span class="n">${r.bosses.length}</span></a>`).join('')}</div>
    </div>
    <div class="st-bosses">${raid.bosses.map((b, i) => { const art = stratArt(b);
      return `<a class="st-boss${b.id === stratPick ? ' on' : ''}${art ? ' has-art' : ''}" data-stboss="${b.id}"${art ? ` style="--art:url('${esc(art)}')"` : ''}>
        <span class="num">${i + 1}</span><span class="nm">${esc(b.name)}</span>${b.status !== 'ready' ? '<span class="dot" title="Guide coming"></span>' : ''}${notesN(b.id) ? `<span class="nn" title="Officer notes">&#128221; ${notesN(b.id)}</span>` : ''}</a>`; }).join('')}</div>
    ${stratBossHtml(cur)}`;
  if (typeof tidyHeads === 'function') tidyHeads();
}

/* ---------------- Officer tab: Strat Notes ---------------- */
function snBoss() { const all = stratAll(); return stratFind(snPick) || stratFind(stratPick) || all[0]; }
function stratNotesTabRender() {
  const el = document.getElementById('sn-body'); if (!el) return;
  if (!STRATS) { el.innerHTML = '<div class="card"><p class="empty">Loading guides…</p></div>'; return; }
  const cur = snBoss(); if (!cur) return;
  snPick = cur.b.id;
  const season = cur.s, raid = cur.r, b = cur.b, notes = stratNotes(b.id), cl = stratCliff(b);
  const editing = snEdit && notes.find(n => n.id === snEdit);
  const opt = (v, l, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(l)}</option>`;
  el.innerHTML = `<div class="card"><div class="card-head"><h2>Strat notes</h2><span class="hint">notes and pictures show at the top of the boss's page &middot; Saved on the sheet's Strat Notes tab</span></div>
    <div class="sn-pick">
      <label>Season<select data-snsel="season">${STRATS.seasons.map(s => opt(s.id, s.name, s.id === season.id)).join('')}</select></label>
      <label>Raid<select data-snsel="raid">${season.raids.map(r => opt(r.id, r.name, r.id === raid.id)).join('')}</select></label>
      <label>Boss<select data-snsel="boss">${raid.bosses.map(x => opt(x.id, x.name + (stratNotes(x.id).length ? ` (${stratNotes(x.id).length})` : ''), x.id === b.id)).join('')}</select></label>
      <a class="hint" data-tab="strats" data-stboss="${esc(b.id)}" href="#strats/${esc(b.id)}">Open ${esc(b.name)}'s page &rarr;</a>
    </div>
    ${snMsg ? `<p class="msg-line" style="margin:10px 0 0">${esc(snMsg)}</p>` : ''}</div>
    <div class="sn-grid">
      <div class="card"><div class="card-head"><h2>${editing ? 'Edit note' : 'Add a note'}</h2>${editing ? '<a class="hint" data-sncancel="1">cancel</a>' : ''}</div>
        <form id="sn-form" class="req-form sn-form">
          <label class="wide">Note<textarea name="text" rows="6" placeholder="Our strat for this boss: assignments, positions, cooldown plan… Paste a picture here too (Ctrl+V).">${editing ? esc(editing.text) : ''}</textarea></label>
          <div class="sn-drop wide" id="sn-drop">${snImg ? `<img src="${snImg}" alt=""><button type="button" data-snclear="1">Remove picture</button>`
            : editing && editing.img ? `<img src="${esc(editing.img)}" alt=""><span class="hint">Current picture. Choose a new one to replace it.</span>` : '<span>Drop a picture here, paste it, or</span>'}
            <label class="toggle-btn">Choose picture<input type="file" accept="image/*" id="sn-file" style="display:none"></label></div>
          <label class="wide">or a picture link <span class="hint">(https://…)</span><input name="imageUrl" placeholder="https://"></label>
          <div class="wide"><button type="submit" class="toggle-btn"${snBusy ? ' disabled' : ''}>${snBusy ? 'Saving…' : editing ? 'Save changes' : 'Add note'}</button></div>
        </form></div>
      <div class="card"><div class="card-head"><h2>&#9889; Cliff notes</h2><span class="hint">${cl.custom ? 'officer version' : 'website default'}</span></div>
        <p class="hint" style="margin:0 0 8px">5 short lines to say before every pull: catchy, and the things that wipe us if we forget them. Tick the roles each one is for.</p>
        <form id="cliff-form" class="cliff-form">${[0, 1, 2, 3, 4].map(i => { const c = cliffParse(cl.lines[i]), r = c.text ? (c.roles || 'THD') : 'THD';
          return `<div class="cl-row"><b>${i + 1}</b><input name="l${i}" maxlength="120" value="${esc(c.text)}"><span class="cl-pick">${CLIFF_ROLES.map(x => `<label title="${x[2]}"><input type="checkbox" name="r${i}${x[0]}"${r.includes(x[0]) ? ' checked' : ''}>${roleIcon(x[1])}</label>`).join('')}</span></div>`; }).join('')}
          <div class="cl-row hero-edit">${HERO_ICON}<input name="hero" maxlength="120" placeholder="When to pop Hero, e.g. On pull, or Phase 3 start (~40%)" value="${esc(cl.hero)}"></div>
          <div><button type="submit" class="toggle-btn">Save cliff notes</button>${cl.custom ? ' <button type="button" class="toggle-btn" data-cliffreset="1">Back to default</button>' : ''}</div></form></div>
    </div>
    ${abilPicCard(b)}
    <div class="card"><div class="card-head"><h2>${esc(b.name)}: notes on the page</h2><span class="hint">${notes.length}</span></div>
      ${notes.length ? notes.map((n, i) => noteHtml(n, b, true, i, notes.length)).join('') : '<p class="empty">None yet.</p>'}</div>`;
}

function abilPicCard(b) {
  loadAbil();
  const list = abilsOf(b), pics = ((STATE && STATE.strat && STATE.strat.pics) || {})[b.id] || {};
  if (!list.length) return `<div class="card"><div class="card-head"><h2>Ability pictures</h2></div><p class="empty">${ABIL ? 'No Adventure Guide abilities loaded for this boss yet (Apotheosis → Load boss abilities now).' : 'Loading abilities…'}</p></div>`;
  if (!apPick || !list.some(a => a.n === apPick)) apPick = (groundOf(b)[0] || { a: list[0] }).a.n;
  const cur = pics[apPick];
  return `<div class="card"><div class="card-head"><h2>Ability pictures</h2><span class="hint">what it looks like in game &middot; shows in the hover tooltip</span></div>
    <form id="ap-form" class="ap-form">
      <label>Ability<select data-appick="1">${(() => { const ge = groundOf(b), gn = new Set(ge.map(x => x.a.n)), opt = (a, extra) => `<option value="${esc(a.n)}"${a.n === apPick ? ' selected' : ''}>${esc(a.n)}${extra || ''}${pics[a.n] ? ' ✓' : ''}</option>`;
        return (ge.length ? `<optgroup label="Ground effects">${ge.map(x => opt(x.a, ' (' + x.label.toLowerCase() + ')')).join('')}</optgroup>` : '') + `<optgroup label="All abilities">${list.filter(a => !gn.has(a.n)).map(a => opt(a)).join('')}</optgroup>`; })()}</select></label>
      <div class="sn-drop" id="ap-drop">${apImg ? `<img src="${apImg}" alt=""><button type="button" data-apclear="1">Remove</button>` : cur ? `<img src="${esc(cur)}" alt=""><span class="hint">Current picture</span>` : '<span>Drop or paste a screenshot, or</span>'}
        <label class="toggle-btn">Choose picture<input type="file" accept="image/*" id="ap-file" style="display:none"></label></div>
      <label>or a picture link<input name="imageUrl" placeholder="https://"></label>
      <div><button type="submit" class="toggle-btn">Save picture</button>${cur ? ' <button type="button" class="toggle-btn" data-apdel="1">Remove picture</button>' : ''}</div>
    </form>
    ${Object.keys(pics).length ? `<p class="hint" style="margin:8px 0 0">With pictures: ${Object.keys(pics).map(esc).join(', ')}</p>` : ''}</div>`;
}
/* Shrink pictures before upload (max 1600 px wide) */
function snReadImage(file, target) {
  if (!file || !/^image\//.test(file.type)) return;
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / img.width), c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const out = file.type === 'image/png' && file.size < 900000 && scale === 1 ? r.result : c.toDataURL('image/jpeg', 0.86);
      if (target === 'ap') apImg = out; else snImg = out;
      stratNotesTabRender();
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
}
async function snPost(body, okMsg) {
  snBusy = true; snMsg = 'Saving…'; stratNotesTabRender();
  try { const m = await officerPost(body); snMsg = '✓ ' + (okMsg || m); await load(); }
  catch (e) { snMsg = 'Not saved: ' + e.message; }
  snBusy = false; render();
}

document.addEventListener('click', e => {
  const t = e.target;
  const s = t.closest('[data-stseason]'); if (s) { e.preventDefault(); stratSeason = s.dataset.stseason; stratRaid = ''; stratPick = ''; stratCurrent(); history.replaceState(null, '', '#strats/' + stratPick); stratsRender(); return; }
  const r = t.closest('[data-straid]'); if (r) { e.preventDefault(); stratRaid = r.dataset.straid; stratPick = ''; stratCurrent(); history.replaceState(null, '', '#strats/' + stratPick); stratsRender(); return; }
  const bo = t.closest('[data-stboss]');
  if (bo) { e.preventDefault(); stratPick = bo.dataset.stboss; stratRaid = ''; stratSeason = ''; stratCurrent(); if (bo.dataset.tab) { tab = 'strats'; render(); } history.replaceState(null, '', '#strats/' + stratPick); stratsRender(); window.scrollTo({ top: document.getElementById('tab-strats').offsetTop - 10, behavior: 'smooth' }); e.stopImmediatePropagation(); return; }
  const sb = t.closest('[data-snboss]'); if (sb) { snPick = sb.dataset.snboss; snEdit = ''; snImg = null; snMsg = ''; }   // the tab switch itself is handled by app.js
  const dl = t.closest('[data-sndel]'); if (dl) { if (confirm('Remove this note?')) snPost({ action: 'stratDelete', id: dl.dataset.sndel }); return; }
  const mv = t.closest('[data-snmove]'); if (mv) { const [id, d] = mv.dataset.snmove.split('|'); snPost({ action: 'stratMove', id, dir: Number(d) }, 'Moved'); return; }
  const ed = t.closest('[data-snedit]'); if (ed) { e.preventDefault(); const [id, boss] = ed.dataset.snedit.split('|'); snPick = boss; snEdit = id; snImg = null; snMsg = ''; tab = 'stratnotes'; history.replaceState(null, '', '#stratnotes'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (t.closest('[data-sncancel]')) { snEdit = ''; snImg = null; stratNotesTabRender(); return; }
  if (t.closest('[data-snclear]')) { snImg = null; stratNotesTabRender(); return; }
  if (t.closest('[data-apclear]')) { apImg = null; stratNotesTabRender(); return; }
  if (t.closest('[data-apdel]')) { if (confirm('Remove the picture for ' + apPick + '?')) snPost({ action: 'stratAbilPic', boss: snPick, abil: apPick, imageUrl: '' }); return; }
  if (t.closest('[data-cliffreset]')) { if (confirm('Go back to the website\'s cliff notes for this boss?')) snPost({ action: 'stratCliff', boss: snPick, lines: [] }); return; }
}, true);

document.addEventListener('change', e => {
  const sel = e.target.dataset && e.target.dataset.snsel;
  if (sel) {
    const all = stratAll(), v = e.target.value;
    const hit = sel === 'season' ? all.find(x => x.s.id === v) : sel === 'raid' ? all.find(x => x.r.id === v) : stratFind(v);
    if (hit) snPick = hit.b.id;
    snEdit = ''; snImg = null; snMsg = ''; stratNotesTabRender(); return;
  }
  if (e.target.id === 'sn-file') snReadImage(e.target.files[0]);
  if (e.target.id === 'ap-file') snReadImage(e.target.files[0], 'ap');
  if (e.target.dataset && e.target.dataset.appick) { apPick = e.target.value; apImg = null; stratNotesTabRender(); }
});
document.addEventListener('paste', e => {
  if (tab !== 'stratnotes') return;
  const f = [...(e.clipboardData && e.clipboardData.files || [])].find(x => /^image\//.test(x.type));
  if (f) { e.preventDefault(); snReadImage(f, document.activeElement && document.activeElement.closest && document.activeElement.closest('#ap-form') ? 'ap' : ''); }
});
document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('#sn-drop, #ap-drop')) e.preventDefault(); });
document.addEventListener('drop', e => { const z = e.target.closest && e.target.closest('#sn-drop, #ap-drop'); if (!z) return; e.preventDefault(); snReadImage(e.dataTransfer.files[0], z.id === 'ap-drop' ? 'ap' : ''); });
document.addEventListener('submit', e => {
  if (e.target.id === 'sn-form') {
    e.preventDefault(); if (snBusy) return;
    const f = new FormData(e.target), body = { action: 'stratNote', boss: snPick, text: String(f.get('text') || ''), imageUrl: String(f.get('imageUrl') || '') };
    if (snImg) body.image = snImg;
    if (snEdit) body.id = snEdit;
    snPost(body).then(() => { if (!/^Not saved/.test(snMsg)) { snEdit = ''; snImg = null; render(); } });
  }
  if (e.target.id === 'ap-form') {
    e.preventDefault();
    const f = new FormData(e.target), body = { action: 'stratAbilPic', boss: snPick, abil: apPick, imageUrl: String(f.get('imageUrl') || '') };
    if (apImg) body.image = apImg;
    if (!apImg && !body.imageUrl) { snMsg = 'Choose a picture first.'; stratNotesTabRender(); return; }
    snPost(body).then(() => { if (!/^Not saved/.test(snMsg)) { apImg = null; render(); } });
  }
  if (e.target.id === 'cliff-form') {
    e.preventDefault();
    const f = new FormData(e.target);
    snPost({ action: 'stratCliff', boss: snPick, lines: [0, 1, 2, 3, 4].map(i => { const t = String(f.get('l' + i) || '').trim(), r = CLIFF_ROLES.filter(x => f.get('r' + i + x[0])).map(x => x[0]).join('');
      return t ? (r ? '[' + r + '] ' : '') + t : ''; }).concat([String(f.get('hero') || '').trim()]) });
  }
}, true);
