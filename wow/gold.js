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

function hotTable(d) {
  $('hot-note').textContent = d.hotNote || '';
  if (!d.hot.length) {
    $('hot').innerHTML = '<p class="empty">No sales estimates yet. Each refresh saves a snapshot of the Auction House; sellers show up here once listings start disappearing between snapshots.</p>';
    return;
  }
  const byItem = {}; d.recipes.forEach(r => { if (r.id) byItem[r.id] = r; });
  const rows = d.hot.slice(0, 15).map(h => { const r = byItem[h.id] || {}; return `<tr>
    <td>${itemLink(h.id, h.name)}</td><td>${typeTag(h.type)}</td>
    <td>${h.known ? '<span class="tag yes">Known</span>' : '<span class="tag">Not learned</span>'}</td>
    <td class="num">${int(h.sold)}</td><td class="num">${r.soldPerDay == null ? '' : num1(r.soldPerDay)}</td><td class="num">${g(h.avg)}</td>
    <td class="num">${g(r.cost)}</td><td class="num ${profitCls(r.profit)}">${g(r.profit)}</td><td class="num">${int(h.listed)}</td></tr>`; }).join('');
  $('hot').innerHTML = `<table><thead><tr><th>Item</th><th>Type</th><th>Scribe</th><th class="num" title="Listings that disappeared between snapshots; includes expired and cancelled auctions">Est. sold (24h)</th>`
    + `<th class="num" title="TSM: average sold per day across the US region">TSM sold/day</th><th class="num">Avg price</th><th class="num">Cost to craft</th><th class="num">Profit each</th><th class="num">Listed now</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function recipeRows(list, threshold) {
  return list.map(r => `<tr class="${r.profit != null && r.profit >= threshold ? 'hit' : ''}">
    <td>${itemLink(r.id, r.name)}${r.unpriced ? `<span class="warn-ic" title="${r.unpriced} reagent(s) have no AH price and are counted as free">&#9888;</span>` : ''}</td>
    <td>${typeTag(r.type)}</td><td class="dim">${esc(r.exp)}</td>
    <td class="num">${g(r.cost)}</td><td class="num">${r.price == null ? '<span class="dim">none listed</span>' : g(r.price)}</td>
    <td class="num">${int(r.listed)}</td><td class="num">${r.soldPerDay == null ? '' : num1(r.soldPerDay)}</td><td class="num">${r.saleRate == null ? '' : pct1(r.saleRate)}</td>
    <td class="num ${profitCls(r.profit)}">${g(r.profit)}</td><td class="num ${profitCls(r.margin)}">${pct(r.margin)}</td></tr>`).join('');
}
const RECIPE_HEAD = '<thead><tr><th>Recipe</th><th>Type</th><th>Expansion</th><th class="num">Cost to craft</th><th class="num">AH price</th><th class="num">Listed</th>'
  + '<th class="num" title="TSM: average number sold per day across the US region">Sold/day</th><th class="num" title="TSM: share of auctions that sell">Sale rate</th>'
  + '<th class="num">Profit each</th><th class="num">Margin</th></tr></thead>';
const SELLS_WELL = 3;   // sold per day across the region, for the "Sells well" filter
const num1 = n => Number(n).toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 1 : 0 });
const pct1 = n => (Math.round(n * 1000) / 10).toLocaleString('en-US') + '%';

function makersTable(d) {
  let list = d.recipes.filter(r => r.known && r.type !== 'Reagent');
  if (makerFilter === 'profit') list = list.filter(r => r.profit != null && r.profit > 0);
  else if (makerFilter === 'sells') list = list.filter(r => r.profit != null && r.profit > 0 && (r.soldPerDay || 0) >= SELLS_WELL);
  else if (makerFilter !== 'all') list = list.filter(r => r.type === makerFilter);
  list.sort((a, b) => (b.profit ?? -1e12) - (a.profit ?? -1e12));
  $('maker-note').textContent = `${list.length} recipes · profit is after the ${Math.round(d.ahCut * 100)}% AH cut · sold/day and sale rate are TSM region data`;
  $('makers').innerHTML = list.length
    ? `<table>${RECIPE_HEAD}<tbody>${recipeRows(list, d.threshold)}</tbody></table>`
    : '<p class="empty">Nothing in this filter right now.</p>';
}

function learnTable(d) {
  const list = d.recipes.filter(r => !r.known && r.type !== 'Reagent' && r.profit != null && r.profit > 0)
    .sort((a, b) => b.profit - a.profit);
  $('learn').innerHTML = list.length
    ? `<table>${RECIPE_HEAD}<tbody>${recipeRows(list, d.threshold)}</tbody></table>`
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
  return { mat, reag, craftOf, trade, vendor, names, umbralId: umbral ? umbral.id : null };
}

function calcPlan(d, target, qty, goblin) {
  const ix = calcIndex;
  const plan = { ah: {}, vendor: {}, farm: {}, mills: {}, trades: {}, crafts: {}, unknown: {} };
  let level = {};
  const addTo = (map, id, n) => { map[id] = (map[id] || 0) + n; };
  if (target.kind === 'recipe') {
    (ix.reag[target.rid] || []).forEach(r => addTo(level, r.id, r.q * qty));
    plan.final = { name: target.name, qty };
  } else addTo(level, target.id, qty);

  for (let depth = 0; depth < 8 && Object.keys(level).length; depth++) {
    const next = {};
    Object.keys(level).forEach(key => {
      const id = Number(key), need = level[key], m = ix.mat[id];
      let way = m ? m.way : 'Buy on AH';
      if (way === 'Vendor' && !ix.vendor[id]) way = 'Buy on AH';
      if (way === 'Craft it' && !ix.craftOf[id]) way = 'Buy on AH';
      if (way === 'Ink trader' && (!ix.trade[id] || !ix.umbralId)) way = 'Buy on AH';
      if (way === 'Mill herbs' && !bestMill(d, id)) way = 'Buy on AH';
      if (way === 'Craft it') {
        const r = ix.craftOf[id], crafts = Math.ceil(need / (r.yield || 1));
        addTo(plan.crafts, id, crafts);
        (ix.reag[r.rid] || []).forEach(x => addTo(next, x.id, x.q * crafts));
      } else if (way === 'Mill herbs') {
        const best = bestMill(d, id), mills = Math.ceil(need / best.perMill);
        const k = best.herbId + ':' + id;
        const cur = plan.mills[k] || (plan.mills[k] = { herbId: best.herbId, herb: best.herb, pigmentId: id, pigment: best.pigment, perMill: best.perMill, mills: 0 });
        cur.mills += mills;
        addTo(plan.ah, best.herbId, mills * 5);
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
  // Mills give other pigments too (Nightshade: Umbral, Luminous and Tranquil). Count those against what you'd buy.
  Object.values(plan.mills).forEach(m => {
    m.extras = [];
    d.milling.filter(x => x.herbId === m.herbId && x.pigmentId !== m.pigmentId).forEach(x => {
      const got = Math.floor(m.mills * x.perMill);
      if (!got) return;
      const need = plan.ah[x.pigmentId] || 0, use = Math.min(need, got);
      if (use) { plan.ah[x.pigmentId] -= use; if (plan.ah[x.pigmentId] <= 0) delete plan.ah[x.pigmentId]; }
      m.extras.push({ name: x.pigment, got, use });
    });
  });
  // prices
  const herbPrice = {}; d.milling.forEach(m => { if (m.herbPrice != null) herbPrice[m.herbId] = m.herbPrice; });
  const ahEach = id => (ix.mat[id] && ix.mat[id].ah != null ? ix.mat[id].ah : herbPrice[id] ?? null);
  const vendorEach = id => { const v = ix.vendor[id]; return v ? (goblin ? v.pay : v.price) : null; };
  plan.ahRows = Object.keys(plan.ah).map(id => ({ id: Number(id), name: ix.names[id] || ('Item ' + id), qty: plan.ah[id], each: ahEach(id) }))
    .sort((a, b) => (b.each ?? 0) * b.qty - (a.each ?? 0) * a.qty);
  plan.vendorRows = Object.keys(plan.vendor).map(id => ({ id: Number(id), name: ix.names[id] || ix.vendor[id].name, qty: plan.vendor[id], each: vendorEach(id) }));
  plan.cost = plan.ahRows.reduce((s, r) => s + (r.each || 0) * r.qty, 0) + plan.vendorRows.reduce((s, r) => s + (r.each || 0) * r.qty, 0)
    + Object.keys(plan.farm).reduce((s, id) => s + ((ix.mat[id] && ix.mat[id].mine) || 0) * plan.farm[id], 0);
  plan.missing = plan.ahRows.filter(r => r.each == null).length + Object.keys(plan.unknown).length;
  return plan;
}

function copyBtn(text, label) { return `<button type="button" class="copy" data-copy="${esc(text)}">${label || 'Copy'}</button>`; }

function renderCalc() {
  const d = DATA; if (!d || !calcIndex) return;
  const sel = $('calc-item').value;
  const qty = Math.max(1, Math.min(10000, parseInt($('calc-qty').value, 10) || 1));
  const goblin = $('calc-goblin').checked;
  let target;
  if (sel.startsWith('r:')) { const r = d.recipes.find(x => String(x.rid) === sel.slice(2)); if (!r) return; target = { kind: 'recipe', rid: r.rid, name: r.name, recipe: r }; }
  else { const id = Number(sel.slice(2)); target = { kind: 'item', id, name: calcIndex.names[id] || '' }; }
  const plan = calcPlan(d, target, qty, goblin);
  const ix = calcIndex;

  const r = target.recipe;
  const revenue = r && r.price != null ? r.price * (1 - d.ahCut) * qty : null;
  const profit = revenue != null ? revenue - plan.cost : null;
  const sum = `<div class="calc-sum">
    <div class="mini"><div class="k">Materials cost</div><div class="v">${g(plan.cost)}</div></div>
    ${r ? `<div class="mini"><div class="k">Sells for (after ${Math.round(d.ahCut * 100)}% cut)</div><div class="v">${revenue == null ? 'Not listed' : g(revenue)}</div></div>
    <div class="mini"><div class="k">Profit for ${qty}</div><div class="v ${profit == null ? '' : profit >= 0 ? 'pos' : 'neg'}">${profit == null ? '' : g(profit)}</div></div>
    <div class="mini"><div class="k">Region sells per day</div><div class="v">${r.soldPerDay == null ? 'No data' : num1(r.soldPerDay)}${r.saleRate == null ? '' : ` <span class="dim" style="font-size:12px">(${pct1(r.saleRate)} sale rate)</span>`}</div></div>` : `<div class="mini"><div class="k">Per item</div><div class="v">${g(plan.cost / qty)}</div></div>`}
  </div>`;

  const ahTable = plan.ahRows.length ? `<div class="calc-block"><h3>Buy on the Auction House ${copyBtn(plan.ahRows.map(x => x.name).join('\n'), 'Copy all names')}</h3>
    <table><thead><tr><th>Item</th><th class="num">Quantity</th><th class="num">Price each</th><th class="num">Total</th></tr></thead><tbody>${plan.ahRows.map(x => `<tr>
      <td>${itemLink(x.id, x.name)}${copyBtn(x.name)}</td><td class="num">${int(x.qty)}</td><td class="num">${x.each == null ? '<span class="dim">not listed</span>' : (x.each < 0.01 ? '&lt;0.01g' : g(x.each))}</td>
      <td class="num">${x.each == null ? '' : g(x.each * x.qty)}</td></tr>`).join('')}</tbody></table></div>` : '';

  const vendorTable = plan.vendorRows.length ? `<div class="calc-block"><h3>Buy from a vendor${goblin ? ' (Goblin price)' : ''} ${copyBtn(plan.vendorRows.map(x => x.name).join('\n'), 'Copy all names')}</h3>
    <table><thead><tr><th>Item</th><th class="num">Quantity</th><th class="num">Price each</th><th class="num">Total</th></tr></thead><tbody>${plan.vendorRows.map(x => `<tr>
      <td>${itemLink(x.id, x.name)}${copyBtn(x.name)}</td><td class="num">${int(x.qty)}</td><td class="num">${x.each == null ? '' : (x.each < 0.01 ? '&lt;0.01g' : g(x.each))}</td>
      <td class="num">${x.each == null ? '' : (x.each * x.qty < 0.01 ? '&lt;0.01g' : g(x.each * x.qty))}</td></tr>`).join('')}</tbody></table></div>` : '';

  const steps = [];
  Object.values(plan.mills).forEach(m => steps.push(`Mill <b>${int(m.mills * 5)} ${esc(m.herb)}</b> (${int(m.mills)} mills) for about <b>${int(Math.round(m.mills * m.perMill))} ${esc(m.pigment)}</b>`
    + (m.extras && m.extras.length ? ', plus about ' + m.extras.map(x => `${int(x.got)} ${esc(x.name)}${x.use ? ` (covers ${int(x.use)} you need)` : ''}`).join(' and ') : '')));
  Object.keys(plan.trades).forEach(id => { const t = ix.trade[id]; steps.push(`Trade <b>${int(plan.trades[id] * t.umbral)} Umbral Ink</b> to the ink trader for <b>${int(plan.trades[id])} ${esc(t.name)}</b>`); });
  // crafts: inks first, then the final item
  Object.keys(plan.crafts).forEach(id => { const rr = ix.craftOf[id]; steps.push(`Craft <b>${int(plan.crafts[id])} × ${esc(rr ? rr.name : ix.names[id])}</b>${rr && rr.yield > 1 ? ` (makes ${int(plan.crafts[id] * rr.yield)})` : ''}`); });
  if (plan.final) steps.push(`Craft <b>${int(plan.final.qty)} × ${esc(plan.final.name)}</b>`);
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

['calc-item', 'calc-qty', 'calc-goblin'].forEach(id => $(id).addEventListener('input', renderCalc));
$('calc-card').addEventListener('click', e => {
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
