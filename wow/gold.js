/* Gold Making page. Reads ?page=gold from the hub's Apps Script web app (built by Gold.gs from the gold sheet).
 * View only: change recipes, crafters and settings on the gold sheet itself. */
const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwqXMIlBNvm2qwm2Z4OZ8MWIKvVvo3W4iAeCnAdRGR8VCrZ-nQfUS1Pb1sId9cUxZYR/exec';
const REFRESH_MINUTES = 5;
const SAVED_KEY = 'wowSaved_gold';

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
  const rows = d.hot.slice(0, 15).map(h => `<tr>
    <td>${itemLink(h.id, h.name)}</td><td>${typeTag(h.type)}</td>
    <td>${h.known ? '<span class="tag yes">Known</span>' : '<span class="tag">Not learned</span>'}</td>
    <td class="num">${int(h.sold)}</td><td class="num">${g(h.avg)}</td><td class="num">${g(h.traded)}</td><td class="num">${int(h.listed)}</td></tr>`).join('');
  $('hot').innerHTML = `<table><thead><tr><th>Item</th><th>Type</th><th>Scribe</th><th class="num">Est. sold (24h)</th><th class="num">Avg price</th><th class="num">Gold traded</th><th class="num">Listed now</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function recipeRows(list, threshold) {
  return list.map(r => `<tr class="${r.profit != null && r.profit >= threshold ? 'hit' : ''}">
    <td>${itemLink(r.id, r.name)}${r.unpriced ? `<span class="warn-ic" title="${r.unpriced} reagent(s) have no AH price and are counted as free">&#9888;</span>` : ''}</td>
    <td>${typeTag(r.type)}</td><td class="dim">${esc(r.exp)}</td>
    <td class="num">${g(r.cost)}</td><td class="num">${r.price == null ? '<span class="dim">none listed</span>' : g(r.price)}</td>
    <td class="num">${int(r.listed)}</td><td class="num ${profitCls(r.profit)}">${g(r.profit)}</td><td class="num ${profitCls(r.margin)}">${pct(r.margin)}</td></tr>`).join('');
}
const RECIPE_HEAD = '<thead><tr><th>Recipe</th><th>Type</th><th>Expansion</th><th class="num">Cost to craft</th><th class="num">AH price</th><th class="num">Listed</th><th class="num">Profit each</th><th class="num">Margin</th></tr></thead>';

function makersTable(d) {
  let list = d.recipes.filter(r => r.known && r.type !== 'Reagent');
  if (makerFilter === 'profit') list = list.filter(r => r.profit != null && r.profit > 0);
  else if (makerFilter !== 'all') list = list.filter(r => r.type === makerFilter);
  list.sort((a, b) => (b.profit ?? -1e12) - (a.profit ?? -1e12));
  $('maker-note').textContent = `${list.length} recipes · profit is after the ${Math.round(d.ahCut * 100)}% AH cut`;
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

function inksTable(d) {
  const list = d.inks.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) { $('inks').innerHTML = '<p class="empty">No ink recipes found.</p>'; return; }
  const rows = list.map(i => {
    const save = i.ah != null && i.craft != null ? i.ah - i.craft : null;
    return `<tr><td>${itemLink(i.id, i.name)}</td><td class="num">${g(i.ah)}</td><td class="num">${g(i.craft)}</td>
      <td class="num ${profitCls(save)}">${save == null ? '' : g(save)}</td><td>${esc(i.way)}</td></tr>`;
  }).join('');
  $('inks').innerHTML = `<table><thead><tr><th>Ink</th><th class="num">AH price</th><th class="num">Craft cost</th><th class="num">Saved by crafting</th><th>Cheapest way</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const shortTier = (tier, prof) => String(tier).replace(new RegExp('\\s*' + prof + '$'), '') || tier;

function crafterCards(d) {
  if (!d.crafters.length) { $('gcrafters').innerHTML = '<p class="empty">No crafting characters listed yet.</p>'; return; }
  $('gcrafters').innerHTML = d.crafters.map(c => {
    const profs = c.professions.length ? c.professions.map(p => {
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
  glance(d); hotTable(d); makersTable(d); learnTable(d); inksTable(d); crafterCards(d);
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
