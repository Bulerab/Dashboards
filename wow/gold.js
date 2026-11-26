/* Gold Making page. Reads ?page=gold from the hub's Apps Script web app (built by Gold.gs from the gold sheet).
 * View only: change recipes, crafters and settings on the gold sheet itself. */
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwqXMIlBNvm2qwm2Z4OZ8MWIKvVvo3W4iAeCnAdRGR8VCrZ-nQfUS1Pb1sId9cUxZYR/exec';
const REFRESH_MINUTES = 5;
const SAVED_KEY = 'wowSaved_gold';
const HOME_CITY = 'Orgrimmar';   // first waypoint stop

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
let DATA = null;
let makerFilter = 'profit';

/** 12.5 -> "12.50g", 1234.5 -> "1,235g". Blank for missing values. */
function g(n) {
  if (n == null || n === '') return '';
  const abs = Math.abs(n);
  return n.toLocaleString('en-US', { minimumFractionDigits: abs < 100 ? 2 : 0, maximumFractionDigits: abs < 100 ? 2 : 0 }) + 'g';
}
const pct = n => (n == null ? '' : Math.round(n * 100).toLocaleString('en-US') + '%');
const int = n => (n == null ? '' : Number(n).toLocaleString('en-US'));
const itemLink = (id, name) => id ? `<a class="item" href="https://www.wowhead.com/item=${encodeURIComponent(id)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
const typeTag = t => `<span class="tag ${String(t).toLowerCase()}">${esc(t)}</span>`;
const profitCls = n => (n == null ? 'dim' : n > 0 ? 'pos' : n < 0 ? 'neg' : '');

function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg; t.className = bad ? 'bad' : ''; t.style.display = 'block';
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.style.display = 'none'; }, 4000);
}

/* ------------------------------------------------------------------ sections */
function glance(d) {
  const known = d.recipes.filter(r => r.known && r.type !== 'Reagent');
  const makers = known.filter(r => r.profit != null && r.profit >= d.threshold);
  const best = known.filter(r => r.profit != null).sort((a, b) => b.profit - a.profit)[0];
  const learn = d.recipes.filter(r => !r.known && r.type !== 'Reagent' && r.profit != null && r.profit >= d.threshold);
  const hot = d.hot[0];
  $('glance').innerHTML = `
    <div class="stat-box gold"><h3>Gold makers now</h3><p>${makers.length}</p><div class="small">known recipes at ${g(d.threshold)}+ profit</div></div>
    <div class="stat-box gold wide"><h3>Best craft right now</h3><p>${best ? itemLink(best.id, best.name) + ' · ' + g(best.profit) : 'No prices yet'}</p></div>
    <div class="stat-box"><h3>Hottest seller (24h)</h3><p>${hot ? esc(hot.name) : 'Collecting'}</p><div class="small">${hot ? int(hot.sold) + ' sold (est.)' : 'needs a day of snapshots'}</div></div>
    <div class="stat-box"><h3>Worth learning</h3><p>${learn.length}</p><div class="small">unlearned recipes at ${g(d.threshold)}+</div></div>`;
}

function hotTable(d, bodyOnly) {
  $('hot-note').textContent = d.hotNote || '';
  if (!d.hot.length) {
    $('hot').innerHTML = '<p class="empty">No sales estimates yet. Each refresh saves a snapshot of the Auction House; sellers show up here once listings start disappearing between snapshots.</p>';
    return;
  }
  const byItem = {}; d.recipes.forEach(r => { if (r.id) byItem[r.id] = r; });
  const all = d.hot.map(h => { const r = byItem[h.id] || {};
    return { h, r, f: { soldPerDay: r.soldPerDay, saleRate: r.saleRate, profit: r.profit, margin: r.margin, price: h.avg ?? r.price } }; });
  const list = all.filter(x => passes('hot', x.f));
  const shown = list.slice(0, filterOn('hot') ? 50 : 15);
  const rows = shown.map(({ h, r }) => `<tr>
    <td>${itemLink(h.id, h.name)}</td><td>${typeTag(h.type)}</td>
    <td>${h.known ? '<span class="tag yes">Known</span>' : '<span class="tag">Not learned</span>'}</td>
    <td class="num">${int(h.sold)}</td><td class="num">${r.soldPerDay == null ? '' : num1(r.soldPerDay)}</td><td class="num">${r.saleRate == null ? '' : pct1(r.saleRate)}</td>
    <td class="num">${g(h.avg)}</td><td class="num">${g(r.cost)}</td><td class="num ${profitCls(r.profit)}">${g(r.profit)}</td>
    <td class="num ${profitCls(r.margin)}">${pct(r.margin)}</td><td class="num">${int(h.listed)}</td>${addCell(h.known && r.rid ? 'r:' + r.rid : '')}</tr>`).join('');
  const head = `<tr><th>Item</th><th>Type</th><th>Scribe</th><th class="num" title="Listings that disappeared between snapshots; includes expired and cancelled auctions">Est. sold (24h)</th>`
    + `<th class="num" title="TSM: average sold per day across the US region">TSM sold/day</th><th class="num" title="TSM: share of auctions that sell">Sale rate</th><th class="num">Avg price</th><th class="num">Cost to craft</th>`
    + `<th class="num">Profit each</th><th class="num">Margin</th><th class="num">Listed now</th><th>Add to list</th></tr>`
    + filterRow('hot', [null, null, null, null, 'soldPerDay', 'saleRate', 'price', null, 'profit', 'margin', null, null]);
  putTable('hot', head, rows || emptyRow(12), bodyOnly);
  $('hot-count').textContent = filterOn('hot') ? `${list.length} of ${all.length} match` : '';
}

/* ------------------------------------------------------------------ column filters
 * Minimum values for Hot sellers and Gold makers. Blank means no filter. Saved in this browser. */
const FILTER_KEY = 'wowGoldFilters';
const FILTER_FIELDS = [
  { k: 'soldPerDay', label: 'Sold/day at least', step: '1', unit: '' },
  { k: 'saleRate', label: 'Sale rate at least', step: '1', unit: '%', scale: 0.01 },
  { k: 'profit', label: 'Profit at least', step: '10', unit: 'g' },
  { k: 'margin', label: 'Margin at least', step: '5', unit: '%', scale: 0.01 },
  { k: 'price', label: 'AH price at least', step: '10', unit: 'g' },
];
let filters = { hot: {}, makers: {} };
try { const f = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}'); if (f.hot) filters.hot = f.hot; if (f.makers) filters.makers = f.makers; } catch (e) { /* storage blocked */ }
const filterOn = t => FILTER_FIELDS.some(f => filters[t][f.k] != null && filters[t][f.k] !== '');
function passes(table, row) {
  return FILTER_FIELDS.every(f => {
    const v = filters[table][f.k];
    if (v == null || v === '') return true;
    return row[f.k] != null && row[f.k] >= v * (f.scale || 1) - 1e-9;
  });
}
/** A header row of "at least" boxes, one under each column it filters. cols: filter key or null per column. */
function filterRow(table, cols) {
  return '<tr class="frow">' + cols.map((k, i) => {
    const f = k && FILTER_FIELDS.find(x => x.k === k);
    if (f) return `<th class="num"><span class="fin" title="${f.label}${f.unit ? ' (' + f.unit + ')' : ''}"><span class="ge">&ge;</span><input type="number" data-ftable="${table}" data-fk="${f.k}" step="${f.step}" value="${filters[table][f.k] ?? ''}" placeholder="any" aria-label="${f.label}">${f.unit ? `<span class="u">${f.unit}</span>` : ''}</span></th>`;
    if (i === 0) return `<th class="fhead">Filter: at least <button type="button" class="copy" data-fclear="${table}">Clear</button> <span class="fcount" id="${table}-count"></span></th>`;
    return '<th></th>';
  }).join('') + '</tr>';
}
const emptyRow = n => `<tr><td colspan="${n}" class="empty">Nothing matches these filters.</td></tr>`;
/** Typing in a filter box only redraws the rows, so the box keeps focus. */
function putTable(id, head, body, bodyOnly) {
  const tb = bodyOnly && $(id).querySelector('tbody');
  if (tb) tb.innerHTML = body;
  else $(id).innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
const addCell = key => (key ? `<td class="addc"><input type="number" class="add-qty" min="1" max="10000" value="10" aria-label="How many"><button type="button" class="copy add-btn" data-add="${key}">Add</button></td>` : '<td></td>');

function recipeRows(list, threshold, withAdd) {
  return list.map(r => `<tr class="${r.profit != null && r.profit >= threshold ? 'hit' : ''}">
    <td>${itemLink(r.id, r.name)}${r.unpriced ? `<span class="warn-ic" title="${r.unpriced} reagent(s) have no AH price and are counted as free">&#9888;</span>` : ''}</td>
    <td>${typeTag(r.type)}</td><td class="dim">${esc(r.exp)}</td>
    <td class="num">${g(r.cost)}</td><td class="num">${r.price == null ? '<span class="dim">none listed</span>' : g(r.price)}</td>
    <td class="num">${int(r.listed)}</td><td class="num">${r.soldPerDay == null ? '' : num1(r.soldPerDay)}</td><td class="num">${r.saleRate == null ? '' : pct1(r.saleRate)}</td>
    <td class="num ${profitCls(r.profit)}">${g(r.profit)}</td><td class="num ${profitCls(r.margin)}">${pct(r.margin)}</td>${withAdd ? addCell('r:' + r.rid) : ''}</tr>`).join('');
}
const RECIPE_HEAD = '<tr><th>Recipe</th><th>Type</th><th>Expansion</th><th class="num">Cost to craft</th><th class="num">AH price</th><th class="num">Listed</th>'
  + '<th class="num" title="TSM: average number sold per day across the US region">Sold/day</th><th class="num" title="TSM: share of auctions that sell">Sale rate</th>'
  + '<th class="num">Profit each</th><th class="num">Margin</th>';
const recipeHead = withAdd => RECIPE_HEAD + (withAdd ? '<th>Add to list</th>' : '') + '</tr>';
const SELLS_WELL = 3;   // sold per day across the region, for the "Sells well" filter
const num1 = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 1 : 0 });
const pct1 = n => (Math.round(n * 1000) / 10).toLocaleString('en-US') + '%';

function makersTable(d, bodyOnly) {
  let list = d.recipes.filter(r => r.known && r.type !== 'Reagent');
  if (makerFilter === 'profit') list = list.filter(r => r.profit != null && r.profit > 0);
  else if (makerFilter === 'sells') list = list.filter(r => r.profit != null && r.profit > 0 && (r.soldPerDay || 0) >= SELLS_WELL);
  else if (makerFilter !== 'all') list = list.filter(r => r.type === makerFilter);
  const before = list.length;
  list = list.filter(r => passes('makers', r));
  list.sort((a, b) => (b.profit ?? -1e12) - (a.profit ?? -1e12));
  $('maker-note').textContent = `${list.length} recipes · profit is after the ${Math.round(d.ahCut * 100)}% AH cut · sold/day and sale rate are TSM region data`;
  const head = recipeHead(true) + filterRow('makers', [null, null, null, null, 'price', null, 'soldPerDay', 'saleRate', 'profit', 'margin', null]);
  putTable('makers', head, list.length ? recipeRows(list, d.threshold, true) : emptyRow(11), bodyOnly);
  $('makers-count').textContent = filterOn('makers') ? `${list.length} of ${before} match` : '';
}

function learnTable(d) {
  const list = d.recipes.filter(r => !r.known && r.type !== 'Reagent' && r.profit != null && r.profit > 0)
    .sort((a, b) => b.profit - a.profit);
  $('learn').innerHTML = list.length
    ? `<table><thead>${recipeHead(false)}</thead><tbody>${recipeRows(list, d.threshold, false)}</tbody></table>`
    : '<p class="empty">No unlearned recipe would make gold at today\'s prices.</p>';
}

const WAY_LABEL = { 'Buy on AH': 'Buy on AH', 'Craft it': 'Craft it', 'Mill herbs': 'Mill herbs', 'Vendor': 'Vendor', 'Ink trader': 'Ink trader', 'Farm (my cost)': 'Farm (my cost)', 'No price': 'No price' };
const cheapestCls = (val, used) => (val != null && used != null && Math.abs(val - used) < 0.005 ? 'pos' : '');

function inksTable(d) {
  const list = d.materials.filter(m => m.craft != null || m.trade != null).filter(m => /Ink$/.test(m.name) || m.craft != null)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) { $('inks').innerHTML = '<p class="empty">No ink recipes found.</p>'; return; }
  if (d.umbralCost != null) $('inks-note').textContent = `Cheapest of the Auction House, crafting from the cheapest pigment, and the ink trader (1 Umbral Ink ≈ ${g(d.umbralCost)}, 10 for rare inks). Recipe costs above use the cheapest.`;
  const rows = list.map(i => `<tr><td>${itemLink(i.id, i.name)}</td>
      <td class="num ${cheapestCls(i.ah, i.used)}">${g(i.ah)}</td><td class="num ${cheapestCls(i.craft, i.used)}">${g(i.craft)}</td>
      <td class="num ${cheapestCls(i.trade, i.used)}">${g(i.trade)}</td><td>${esc(WAY_LABEL[i.way] || i.way)}</td></tr>`).join('');
  $('inks').innerHTML = `<table><thead><tr><th>Ink</th><th class="num">AH price</th><th class="num">Craft (cheapest pigment)</th><th class="num">Ink trader</th><th>Cheapest way</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function bestMill(d, pigmentId) {
  return d.milling.filter(m => m.pigmentId === pigmentId && m.costEach != null).sort((a, b) => a.costEach - b.costEach)[0] || null;
}

function pigmentsTable(d) {
  const list = d.materials.filter(m => m.mill != null || d.milling.some(x => x.pigmentId === m.id)).sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) { $('pigments').innerHTML = '<p class="empty">No milling data yet.</p>'; return; }
  const rows = list.map(p => {
    const best = bestMill(d, p.id);
    return `<tr><td>${itemLink(p.id, p.name)}</td><td class="num ${cheapestCls(p.ah, p.used)}">${g(p.ah)}</td>
      <td class="num ${cheapestCls(p.mill, p.used)}">${g(p.mill)}</td>
      <td>${best ? `${itemLink(best.herbId, best.herb)} <span class="dim">(${g(best.herbPrice)} each, ~${best.perMill} per mill)</span>` : '<span class="dim">no priced herb</span>'}</td>
      <td>${esc(WAY_LABEL[p.way] || p.way)}</td></tr>`;
  }).join('');
  $('pigments').innerHTML = `<table><thead><tr><th>Pigment</th><th class="num">AH price</th><th class="num">Mill cost</th><th>Cheapest herb to mill</th><th>Cheapest way</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ------------------------------------------------------------------ shopping list calculator
 * Expands a glyph/mark (or an ink) into what to buy, mill, trade and craft, following each material's
 * cheapest way from the gold sheet. Works level by level so shared materials are added up before rounding. */
let calcIndex = null;
function buildIndex(d) {
  const mat = {}; d.materials.forEach(m => { mat[m.id] = m; });
  const reag = {}; d.reagents.forEach(([rid, id, name, q]) => { (reag[rid] = reag[rid] || []).push({ id, name, q }); });
  const craftOf = {}; d.recipes.filter(r => r.type === 'Reagent' && r.known && r.id).forEach(r => { craftOf[r.id] = r; });
  const trade = {}; d.trades.forEach(t => { trade[t.id] = t; });
  const vendor = {}; d.vendor.forEach(v => { vendor[v.id] = v; });
  const names = {}; d.materials.forEach(m => { names[m.id] = m.name; }); d.milling.forEach(m => { names[m.herbId] = m.herb; names[m.pigmentId] = m.pigment; });
  d.trades.forEach(t => { names[t.id] = t.name; });
  const umbral = d.materials.find(m => m.name === 'Umbral Ink');
  const herbPrice = {}; d.milling.forEach(m => { if (m.herbPrice != null) herbPrice[m.herbId] = m.herbPrice; });
  const pigPrice = {}; (d.depth ? Object.keys(d.depth) : []).forEach(id => { if (d.depth[id].length) pigPrice[id] = d.depth[id][0][0]; });
  return { mat, reag, craftOf, trade, vendor, names, herbPrice, pigPrice, umbralId: umbral ? umbral.id : null };
}

/* Crafting stats: best guesses from the gold sheet's Settings tab, only for newer expansions' recipes */
function craftFx(r) {
  const cs = DATA && DATA.craftStats;
  if (!cs || !r || !cs.exps.some(e => String(r.exp).indexOf(e) === 0)) return { yieldX: 1, reagX: 1 };
  return { yieldX: 1 + cs.mcChance * cs.mcExtra, reagX: 1 - cs.resChance * cs.resSave };
}

/** Cost of buying n from the AH, working up through the cheapest listings.
 *  {total, each (average), lowest, top (dearest price paid), short (more than the listings we know of)} */
function ahBuy(id, n) {
  const ix = calcIndex, lad = DATA.depth && DATA.depth[id];
  if (!lad || !lad.length) {
    const p = ix.mat[id] && ix.mat[id].ah != null ? ix.mat[id].ah : ix.herbPrice[id];
    return p == null ? null : { total: p * n, each: p, lowest: p, top: p, short: 0 };
  }
  let left = n, total = 0, top = lad[0][0];
  for (const [p, q] of lad) { const take = Math.min(left, q); total += take * p; left -= take; top = p; if (left <= 0) break; }
  const short = Math.max(0, left);
  total += short * top;
  return { total, each: total / n, lowest: lad[0][0], top, short };
}
const sellEach = id => { const m = calcIndex.mat[id]; const p = m && m.ah != null ? m.ah : calcIndex.pigPrice[id]; return p == null ? 0 : p * (1 - DATA.ahCut); };

/** Cheapest way to get n of an item at this quantity: buy, vendor, craft, mill or trade.
 *  Works with the real AH listings, so a big buy can tip it towards milling or crafting. */
function bestWay(id, n, depth, memo) {
  const key = id + '|' + Math.ceil(n) + '|' + depth;
  if (memo[key]) return memo[key];
  const ix = calcIndex, m = ix.mat[id], opts = [];
  n = Math.ceil(n);
  if (m && m.mine != null) { const r = { way: 'Farm (my cost)', cost: m.mine * n }; memo[key] = r; return r; }
  const ah = ahBuy(id, n); if (ah) opts.push({ way: 'Buy on AH', cost: ah.total });
  const v = ix.vendor[id]; if (v) opts.push({ way: 'Vendor', cost: (DATA_GOBLIN() ? v.pay : v.price) * n });
  if (depth < 5) {
    const r = ix.craftOf[id];
    if (r) {
      const fx = craftFx(r), crafts = Math.ceil(n / ((r.yield || 1) * fx.yieldX));
      let c = 0, ok = true;
      (ix.reag[r.rid] || []).forEach(x => { const b = bestWay(x.id, x.q * crafts * fx.reagX, depth + 1, memo); if (b.cost == null) ok = false; else c += b.cost; });
      if (ok) opts.push({ way: 'Craft it', cost: c });
    }
    DATA.milling.filter(x => x.pigmentId === id).forEach(x => {
      const mills = Math.ceil(n / x.perMill), herb = ahBuy(x.herbId, mills * 5);
      if (!herb) return;
      const spare = DATA.milling.filter(y => y.herbId === x.herbId && y.pigmentId !== id).reduce((s, y) => s + Math.floor(mills * y.perMill) * sellEach(y.pigmentId), 0);
      opts.push({ way: 'Mill herbs', cost: Math.max(0, herb.total - spare), mill: x });
    });
    const t = ix.trade[id];
    if (t && ix.umbralId && id !== ix.umbralId) { const b = bestWay(ix.umbralId, n * t.umbral, depth + 1, memo); if (b.cost != null) opts.push({ way: 'Ink trader', cost: b.cost }); }
  }
  opts.sort((a, b) => a.cost - b.cost);
  const r = opts[0] || { way: 'No price', cost: null };
  memo[key] = r;
  return r;
}
const DATA_GOBLIN = () => $('calc-goblin').checked;

function calcPlan(d, targets, goblin) {
  const ix = calcIndex, memo = {};
  const plan = { ah: {}, vendor: {}, farm: {}, mills: {}, trades: {}, crafts: {}, unknown: {}, finals: [], boosted: false };
  let level = {};
  const addTo = (map, id, n) => { map[id] = (map[id] || 0) + n; };
  // Everything on the list goes in together, so shared inks and herbs are added up before rounding
  targets.forEach(({ target, qty }) => {
    if (target.kind === 'recipe') {
      const fx = craftFx(target.recipe);
      if (fx.reagX < 1) plan.boosted = true;
      (ix.reag[target.rid] || []).forEach(r => addTo(level, r.id, r.q * qty * fx.reagX));
      plan.finals.push({ name: target.name, qty });
    } else addTo(level, target.id, qty);
  });

  for (let depth = 0; depth < 8 && Object.keys(level).length; depth++) {
    const next = {};
    Object.keys(level).forEach(key => {
      const id = Number(key), need = Math.ceil(level[key] - 1e-9);
      const best = bestWay(id, need, 0, memo), way = best.way;
      if (way === 'Craft it') {
        const r = ix.craftOf[id], fx = craftFx(r), crafts = Math.ceil(need / ((r.yield || 1) * fx.yieldX));
        if (fx.reagX < 1) plan.boosted = true;
        addTo(plan.crafts, id, crafts);
        (ix.reag[r.rid] || []).forEach(x => addTo(next, x.id, x.q * crafts * fx.reagX));
      } else if (way === 'Mill herbs') {
        // One pile of herbs per herb: Umbral and Luminous from Nightshade come out of the same mills
        const x = best.mill;
        const cur = plan.mills[x.herbId] || (plan.mills[x.herbId] = { herbId: x.herbId, herb: x.herb, needs: {}, mills: 0 });
        addTo(cur.needs, id, need);
      } else if (way === 'Ink trader') {
        const t = ix.trade[id];
        addTo(plan.trades, id, need);
        addTo(next, ix.umbralId, need * t.umbral);
      } else if (way === 'Vendor') addTo(plan.vendor, id, need);
      else if (way === 'Farm (my cost)') addTo(plan.farm, id, need);
      else if (way === 'No price') addTo(plan.unknown, id, need);
      else addTo(plan.ah, id, need);
    });
    level = next;
  }
  // Mill enough for the pigment that needs the most mills; the rest of each mill covers other needs or gets sold.
  plan.spareValue = 0;
  Object.values(plan.mills).forEach(m => {
    const rows = d.milling.filter(x => x.herbId === m.herbId);
    m.mills = Math.max(0, ...Object.keys(m.needs).map(pid => { const x = rows.find(y => y.pigmentId === Number(pid)); return x ? Math.ceil(m.needs[pid] / x.perMill) : 0; }));
    addTo(plan.ah, m.herbId, m.mills * 5);
    m.out = [];
    rows.forEach(x => {
      const got = Math.floor(m.mills * x.perMill), forList = Math.min(got, m.needs[x.pigmentId] || 0);
      let left = got - forList, use = 0;
      const ahNeed = plan.ah[x.pigmentId] || 0;
      if (left && ahNeed) { use = Math.min(left, ahNeed); left -= use; plan.ah[x.pigmentId] -= use; if (plan.ah[x.pigmentId] <= 0) delete plan.ah[x.pigmentId]; }
      const value = left * sellEach(x.pigmentId);
      plan.spareValue += value;
      if (got) m.out.push({ id: x.pigmentId, name: x.pigment, got, used: forList + use, sell: left, value });
    });
  });
  // prices: AH through the real listings, vendors at the (Goblin) price
  const vendorEach = id => { const v = ix.vendor[id]; return v ? (goblin ? v.pay : v.price) : null; };
  plan.ahRows = Object.keys(plan.ah).map(id => { const qty = Math.ceil(plan.ah[id] - 1e-9), b = ahBuy(Number(id), qty);
    return { id: Number(id), name: ix.names[id] || ('Item ' + id), qty, each: b ? b.each : null, total: b ? b.total : null, lowest: b ? b.lowest : null, top: b ? b.top : null, short: b ? b.short : 0 }; })
    .filter(r => r.qty > 0).sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  plan.vendorRows = Object.keys(plan.vendor).map(id => ({ id: Number(id), name: ix.names[id] || ix.vendor[id].name, qty: Math.ceil(plan.vendor[id] - 1e-9), each: vendorEach(id) }));
  plan.cost = plan.ahRows.reduce((s, r) => s + (r.total || 0), 0) + plan.vendorRows.reduce((s, r) => s + (r.each || 0) * r.qty, 0)
    + Object.keys(plan.farm).reduce((s, id) => s + ((ix.mat[id] && ix.mat[id].mine) || 0) * plan.farm[id], 0);
  plan.missing = plan.ahRows.filter(r => r.each == null).length + Object.keys(plan.unknown).length;
  return plan;
}

function copyBtn(text, label) { return `<button type="button" class="copy" data-copy="${esc(text)}">${label || 'Copy'}</button>`; }

/* ------------------------------------------------------------------ running shopping list
 * Add from the tables or the picker; adding the same item again adds to its count. Saved in this browser. */
const CART_KEY = 'wowGoldCart';
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]').filter(c => c && c.key && c.qty > 0); } catch (e) { cart = []; }
const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* storage blocked */ } };
const clampQty = v => Math.max(1, Math.min(10000, parseInt(v, 10) || 1));

function cartTarget(d, key) {
  if (key.startsWith('r:')) { const r = d.recipes.find(x => String(x.rid) === key.slice(2)); return r ? { kind: 'recipe', rid: r.rid, name: r.name, recipe: r } : null; }
  const id = Number(key.slice(2)); const name = calcIndex && calcIndex.names[id];
  return name ? { kind: 'item', id, name } : null;
}
function addToCart(key, qty) {
  qty = clampQty(qty);
  const c = cart.find(x => x.key === key);
  if (c) c.qty += qty; else cart.push({ key, qty });
  saveCart(); renderCalc();
  const t = DATA && cartTarget(DATA, key), total = cart.find(x => x.key === key).qty;
  toast(`Added ${qty} × ${t ? t.name : 'item'}${total > qty ? ` (${total} on the list)` : ''}`);
}

function renderCart(d, items) {
  if (!items.length) { $('cart').innerHTML = ''; return; }
  const rows = items.map(({ c, t }) => { const r = t.recipe;
    const each = r && r.profit != null ? r.profit : null;
    return `<tr><td>${t.kind === 'recipe' ? itemLink(r.id, t.name) : itemLink(t.id, t.name)}</td>
      <td class="num"><input type="number" class="cart-qty" data-key="${esc(c.key)}" min="1" max="10000" value="${c.qty}" aria-label="How many"></td>
      <td class="num ${profitCls(each)}">${g(each)}</td><td class="num ${profitCls(each)}">${each == null ? '' : g(each * c.qty)}</td>
      <td class="num">${r && r.soldPerDay != null ? num1(r.soldPerDay) : ''}</td>
      <td class="num"><button type="button" class="copy" data-remove="${esc(c.key)}" title="Remove from the list">Remove</button></td></tr>`; }).join('');
  $('cart').innerHTML = `<div class="calc-block"><h3>On your list <button type="button" class="copy" data-cart-clear>Clear list</button></h3>
    <table><thead><tr><th>Item</th><th class="num">How many</th><th class="num">Profit each</th><th class="num">Profit total</th><th class="num" title="TSM: sold per day across the US region">Sold/day</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderCalc() {
  const d = DATA; if (!d || !calcIndex) return;
  const goblin = $('calc-goblin').checked;
  const items = cart.map(c => ({ c, t: cartTarget(d, c.key) })).filter(x => x.t);
  renderCart(d, items);
  if (!items.length) {
    $('calc-out').innerHTML = '<p class="empty">Your list is empty. Use <b>Add</b> on Hottest sellers or Gold makers below, or pick something above.</p>';
    return;
  }
  const plan = calcPlan(d, items.map(x => ({ target: x.t, qty: x.c.qty })), goblin);
  const ix = calcIndex;

  const recipes = items.filter(x => x.t.kind === 'recipe');
  const unlisted = recipes.filter(x => x.t.recipe.price == null).map(x => x.t.name);
  const revenue = recipes.length ? recipes.reduce((s, x) => s + (x.t.recipe.price == null ? 0 : x.t.recipe.price * (1 - d.ahCut) * x.c.qty), 0) : null;
  const profit = revenue != null ? revenue - plan.cost + plan.spareValue : null;
  const crafts = recipes.reduce((s, x) => s + x.c.qty, 0);
  const sum = `<div class="calc-sum">
    <div class="mini"><div class="k">Materials cost</div><div class="v">${g(plan.cost)}</div></div>
    ${recipes.length ? `<div class="mini"><div class="k">Sells for (after ${Math.round(d.ahCut * 100)}% cut)</div><div class="v">${g(revenue)}</div></div>
    ${plan.spareValue >= 1 ? `<div class="mini"><div class="k">Spare pigments to sell</div><div class="v">${g(plan.spareValue)}</div></div>` : ''}
    <div class="mini"><div class="k">Profit for the list${plan.spareValue >= 1 ? ' (incl. spares)' : ''}</div><div class="v ${profit >= 0 ? 'pos' : 'neg'}">${g(profit)}</div></div>
    <div class="mini"><div class="k">Crafts</div><div class="v">${int(crafts)} <span class="dim" style="font-size:12px">(${recipes.length} kind${recipes.length > 1 ? 's' : ''})</span></div></div>` : ''}
  </div>`;

  const ahTable = plan.ahRows.length ? `<div class="calc-block"><h3>Buy on the Auction House ${copyBtn(plan.ahRows.map(x => x.name).join('\n'), 'Copy all names')}</h3>
    <table><thead><tr><th>Item</th><th class="num">Quantity</th><th class="num" title="Average over the cheapest listings you'd buy">Price each (avg)</th><th class="num">Total</th></tr></thead><tbody>${plan.ahRows.map(x => `<tr>
      <td>${itemLink(x.id, x.name)}${copyBtn(x.name)}</td><td class="num">${int(x.qty)}</td><td class="num">${x.each == null ? '<span class="dim">not listed</span>' : (x.each < 0.01 ? '&lt;0.01g' : g(x.each))
        + (x.top != null && x.top > x.lowest * 1.05 ? `<div class="sub">${g(x.lowest)} up to ${g(x.top)}</div>` : '')
        + (x.short ? `<div class="sub warn">only ${int(x.qty - x.short)} listed cheaply</div>` : '')}</td>
      <td class="num">${x.total == null ? '' : g(x.total)}</td></tr>`).join('')}</tbody></table></div>` : '';

  const vendorTable = plan.vendorRows.length ? `<div class="calc-block"><h3>Buy from a vendor${goblin ? ' (Goblin price)' : ''} ${copyBtn(plan.vendorRows.map(x => x.name).join('\n'), 'Copy all names')}</h3>
    <table><thead><tr><th>Item</th><th class="num">Quantity</th><th class="num">Price each</th><th class="num">Total</th></tr></thead><tbody>${plan.vendorRows.map(x => `<tr>
      <td>${itemLink(x.id, x.name)}${copyBtn(x.name)}</td><td class="num">${int(x.qty)}</td><td class="num">${x.each == null ? '' : (x.each < 0.01 ? '&lt;0.01g' : g(x.each))}</td>
      <td class="num">${x.each == null ? '' : (x.each * x.qty < 0.01 ? '&lt;0.01g' : g(x.each * x.qty))}</td></tr>`).join('')}</tbody></table></div>` : '';

  const steps = [];
  Object.values(plan.mills).forEach(m => {
    const used = m.out.filter(x => x.used), sold = m.out.filter(x => x.sell);
    steps.push(`Mill <b>${int(m.mills * 5)} ${esc(m.herb)}</b> (${int(m.mills)} mills) for about ${m.out.map(x => `<b>${int(x.got)} ${esc(x.name)}</b>`).join(', ')}`
      + (used.length ? `. You use ${used.map(x => `${int(x.used)} ${esc(x.name)}`).join(', ')}` : '')
      + (sold.length ? `; sell ${sold.map(x => `${int(x.sell)} ${esc(x.name)} (about ${g(x.value)})`).join(', ')}` : ''));
  });
  Object.keys(plan.trades).forEach(id => { const t = ix.trade[id]; steps.push(`Trade <b>${int(plan.trades[id] * t.umbral)} Umbral Ink</b> to the ink trader for <b>${int(plan.trades[id])} ${esc(t.name)}</b>`); });
  // crafts: inks first, then the final item
  Object.keys(plan.crafts).forEach(id => { const rr = ix.craftOf[id]; steps.push(`Craft <b>${int(plan.crafts[id])} × ${esc(rr ? rr.name : ix.names[id])}</b>${rr && rr.yield > 1 ? ` (makes ${int(plan.crafts[id] * rr.yield)})` : ''}`); });
  plan.finals.forEach(f => steps.push(`Craft <b>${int(f.qty)} × ${esc(f.name)}</b>`));
  Object.keys(plan.farm).forEach(id => steps.push(`Use <b>${int(plan.farm[id])} ${esc(ix.names[id])}</b> you farmed`));
  const stepsHtml = steps.length ? `<div class="calc-block"><h3>Then</h3><ol class="steps">${steps.map(s => `<li>${s}</li>`).join('')}</ol></div>` : '';

  // Waypoints for TomTom's /ttpaste (ZygorRoute hands them to Zygor's travel system). Home city first.
  const stops = {};
  const addStop = (st, what) => {
    if (!st || !st.npc || st.x == null || st.y == null) return false;
    const k = st.npc + '|' + st.zone;
    (stops[k] = stops[k] || { npc: st.npc, zone: st.zone, x: st.x, y: st.y, items: [] }).items.push(what);
    return true;
  };
  const noStop = [];
  plan.vendorRows.forEach(x => { if (!addStop(ix.vendor[x.id], x.name)) noStop.push(x.name); });
  if (Object.keys(plan.trades).length) addStop(d.inkStop, 'ink trades');
  const stopList = Object.values(stops).sort((a, b) => (a.zone === HOME_CITY ? -1 : b.zone === HOME_CITY ? 1 : a.zone.localeCompare(b.zone)));
  const wayLines = stopList.map(st => `/way ${st.zone} ${st.x} ${st.y} ${st.npc}: ${st.items.join(', ')}`);
  // One paste block: clear TomTom and Zygor's arrow, then add every stop (home city first)
  const pasteBlock = ['/way reset all', '/run ZGV.Pointer:ClearWaypoints("manual")'].concat(wayLines).join('\n');
  const wayHtml = wayLines.length ? `<div class="calc-block"><h3>Vendor stops <span>${copyBtn('/ttpaste', '1. Copy /ttpaste')} ${copyBtn(pasteBlock, '2. Copy stops')}</span></h3>
    <pre class="way">${esc(pasteBlock)}</pre>
    <p class="calc-note">In game: paste <b>/ttpaste</b> into chat, then paste the stops into the window and press Ctrl+Enter. It clears old TomTom and Zygor waypoints first, then adds ${wayLines.length} stop${wayLines.length > 1 ? 's' : ''}; Zygor's arrow takes you there. Type <b>/cway</b> to switch the arrow to the closest stop.${noStop.length ? ' No saved vendor location for: ' + esc(noStop.join(', ')) + ' (add one on the gold sheet\'s Vendor tab).' : ''}</p></div>` : '';

  const notes = [];
  if (unlisted.length) notes.push(`Not on the Auction House right now, so not counted in "Sells for": ${esc(unlisted.join(', '))}.`);
  if (plan.ahRows.some(x => x.top != null && x.top > x.lowest * 1.05)) notes.push('AH prices are averaged over the cheapest listings for the amount you need, so big buys cost more than the lowest price.');
  if (plan.ahRows.some(x => x.short)) notes.push('Some items run past the cheap listings we track; the rest is priced at the last price seen.');
  if (plan.boosted) { const cs = d.craftStats; notes.push(`Newer recipes (${esc(cs.exps.join(', '))}) assume ${Math.round(cs.resChance * 100)}% resourcefulness saving ${Math.round(cs.resSave * 100)}% and ${Math.round(cs.mcChance * 100)}% multicraft; set your real numbers on the gold sheet's Settings tab.`); }
  if (Object.keys(plan.mills).length) notes.push('Milling uses average yields, so you may get a few more or less pigment than shown.');
  if (plan.missing) notes.push(`${plan.missing} item(s) have no price right now, so the cost is missing them.`);
  if (goblin && plan.vendorRows.length) notes.push('Goblin prices apply at vendors with a reputation (city and profession suppliers).');
  $('calc-out').innerHTML = sum + ahTable + vendorTable + wayHtml + stepsHtml + (notes.length ? `<p class="calc-note">${notes.join(' ')}</p>` : '');
}

function setupCalc(d) {
  calcIndex = buildIndex(d);
  const sel = $('calc-item');
  const prev = sel.value;
  const known = d.recipes.filter(r => r.known && r.type !== 'Reagent').sort((a, b) => (b.profit ?? -1e9) - (a.profit ?? -1e9));
  const items = d.materials.filter(m => m.craft != null || m.mill != null || m.trade != null).sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML = `<optgroup label="Glyphs and marks you know (best profit first)">${known.map(r => `<option value="r:${r.rid}">${esc(r.name)}${r.profit != null ? ' (' + g(r.profit) + ' each)' : ''}</option>`).join('')}</optgroup>
    <optgroup label="Inks and pigments">${items.map(m => `<option value="i:${m.id}">${esc(m.name)}</option>`).join('')}</optgroup>`;
  if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
  if (!setupCalc.done) { $('calc-goblin').checked = !!d.goblin; setupCalc.done = true; }
  renderCalc();
}

const shortTier = (tier, prof) => String(tier).replace(new RegExp('\\s*' + prof + '$'), '') || tier;
// Newest expansion first. Blizzard's tier IDs don't follow release order, so rank by name.
const EXP_ORDER = ['Midnight', 'Khaz Algar', 'Dragon Isles', 'Shadowlands', 'Kul Tiran', 'Zandalari', 'Legion', 'Draenor', 'Pandaria', 'Cataclysm', 'Northrend', 'Outland', 'Classic'];
const expRank = name => { const i = EXP_ORDER.findIndex(e => String(name).indexOf(e) === 0); return i < 0 ? EXP_ORDER.length : i; };

function crafterCards(d) {
  if (!d.crafters.length) { $('gcrafters').innerHTML = '<p class="empty">No crafting characters listed yet.</p>'; return; }
  $('gcrafters').innerHTML = d.crafters.map(c => {
    const profs = c.professions.length ? c.professions.map(p => {
      p.tiers.sort((a, b) => expRank(a.name) - expRank(b.name));
      const cur = p.tiers[0];
      const w = cur.max ? Math.min(100, Math.round(cur.skill / cur.max * 100)) : 0;
      const tiers = p.tiers.map(t => `<div class="tier"><span>${esc(shortTier(t.name, p.name))}</span><span>${t.skill} / ${t.max}</span><span>${t.recipes} recipes</span></div>`).join('');
      return `<div class="prof">
        <div class="prof-head"><span><span class="pn">${esc(p.name)}</span><span class="pk">${p.kind === 'Primary' ? '' : 'Secondary'}</span></span>
          <span class="pt">${esc(shortTier(cur.name, p.name))} ${cur.skill} / ${cur.max}</span></div>
        <div class="meter"><div class="${w >= 100 ? 'full' : ''}" style="width:${w}%"></div></div>
        <div class="prof-sub"><span>${cur.recipes} recipes known</span>${p.tiers.length > 1 ? `<button type="button" class="tier-toggle">All ${p.tiers.length} expansions</button>` : '<span></span>'}</div>
        <div class="tiers">${tiers}</div></div>`;
    }).join('') : `<p class="empty">${esc(c.note || 'No professions')}</p>`;
    return `<div class="gcrafter"><div class="char-name">${esc(c.name)}</div>${profs}</div>`;
  }).join('');
}

/* ------------------------------------------------------------------ render & load */
function render(d, live, when) {
  DATA = d;
  $('src').className = 'src ' + (live ? 'live' : 'snap');
  $('src').textContent = live ? 'Live' : 'Saved copy';
  $('when').textContent = `Prices from ${d.generated} · page loaded ${when}`;
  if (d.character) $('sub').textContent = `${d.character}'s Inscription glyphs and marks, priced from the Auction House every 2 hours`;
  glance(d); setupCalc(d); hotTable(d); makersTable(d); learnTable(d); inksTable(d); pigmentsTable(d); crafterCards(d);
}

$('calc-goblin').addEventListener('input', renderCalc);
$('calc-add').addEventListener('click', () => { if ($('calc-item').value) addToCart($('calc-item').value, $('calc-qty').value); });
// Add buttons in Hottest sellers and Gold makers
document.addEventListener('click', e => {
  const b = e.target.closest('[data-add]');
  if (!b || !DATA) return;
  const q = b.parentElement.querySelector('.add-qty');
  addToCart(b.dataset.add, q ? q.value : 1);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('add-qty')) e.target.parentElement.querySelector('[data-add]').click();
});
// Filters
document.addEventListener('input', e => {
  const t = e.target.dataset && e.target.dataset.ftable;
  if (!t || !DATA) return;
  const v = e.target.value.trim();
  if (v === '' || isNaN(Number(v))) delete filters[t][e.target.dataset.fk]; else filters[t][e.target.dataset.fk] = Number(v);
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch (er) { /* storage blocked */ }
  t === 'hot' ? hotTable(DATA, true) : makersTable(DATA, true);
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fclear]');
  if (!b || !DATA) return;
  const t = b.dataset.fclear; filters[t] = {};
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch (er) { /* storage blocked */ }
  t === 'hot' ? hotTable(DATA) : makersTable(DATA);
});
// Cart edits
$('calc-card').addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.key;
  if (!k) return;
  const c = cart.find(x => x.key === k); if (c) { c.qty = clampQty(e.target.value); saveCart(); renderCalc(); }
});
$('calc-card').addEventListener('click', e => {
  const rm = e.target.closest('[data-remove]');
  if (rm) { cart = cart.filter(x => x.key !== rm.dataset.remove); saveCart(); renderCalc(); return; }
  const clr = e.target.closest('[data-cart-clear]');
  if (clr) {   // two clicks so a stray tap doesn't wipe the list
    if (clr.dataset.armed) { cart = []; saveCart(); renderCalc(); toast('Shopping list cleared'); }
    else { clr.dataset.armed = '1'; clr.textContent = 'Click again to clear'; setTimeout(() => { if (clr.isConnected) { delete clr.dataset.armed; clr.textContent = 'Clear list'; } }, 3000); }
    return;
  }
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const text = b.getAttribute('data-copy');
  const done = () => { b.classList.add('done'); const t = b.textContent; b.textContent = 'Copied'; setTimeout(() => { b.classList.remove('done'); b.textContent = t; }, 1200); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
});
function fallbackCopy(text, done) {
  const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed; select the name and copy it by hand', true); }
  t.remove();
}
$('maker-filters').addEventListener('click', e => {
  const b = e.target.closest('[data-f]');
  if (!b || !DATA) return;
  makerFilter = b.dataset.f;
  document.querySelectorAll('#maker-filters .chip').forEach(x => x.classList.toggle('on', x === b));
  makersTable(DATA);
});
$('gcrafters').addEventListener('click', e => {
  const b = e.target.closest('.tier-toggle');
  if (b) b.closest('.prof').classList.toggle('open');
});

function showSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    if (saved && saved.state) render(saved.state, false, saved.when + ' (updating…)');
  } catch (e) { /* storage blocked */ }
}

async function load() {
  try {
    const res = await fetch(WEBAPP_URL + '?page=gold', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = JSON.parse(await res.text());
    if (!d.recipes) throw new Error('the web app has no gold data yet');
    const when = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    render(d, true, when);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify({ when, state: d })); } catch (er) { /* storage full or blocked */ }
  } catch (e) {
    console.warn('Gold data failed to load:', e);
    if (!DATA) { $('src').textContent = 'Not loaded'; $('when').textContent = 'Live data could not be loaded: ' + e.message; }
    else toast('Live update failed; showing the saved copy', true);
  }
}

showSaved();
load();
setInterval(load, REFRESH_MINUTES * 60 * 1000);
