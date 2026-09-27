// The cafeteria menu, read live from the district's menu service
// (schoolnutritionandfitness.com, which allows other sites to read it).
// Nothing is copied into this repo, so the page is always the current menu.
//
// Used three ways: the Menu page (when #menu-app exists), the home page's
// next-meal card (mountNextMeal) and the Cafeteria panel on the campus map
// (todaysLunch()). Photos, nutrition and allergens are the district's own data.

import { initHeader, $, $$, esc, root } from './ui.js';
import { loadBell, dayPlan, nextSchoolDay, clock } from './bell.js';
import { t as tr, dateText, relDay } from './i18n.js';

export const MENUS = {
  lunch: { type: '5654e429eabc8820748b4568', label: 'Lunch',
           official: 'https://www.schoolnutritionandfitness.com/webmenus2/#/view?id=6a7f7a63fe03f3701a08feef&siteCode=2714' },
  breakfast: { type: '565dfa0eeabc883c668b4567', label: 'Breakfast',
               official: 'https://www.schoolnutritionandfitness.com/webmenus2/#/view?id=6a7f7d40d5d8ab459e351282&siteCode=2714' },
};
const API = 'https://api.schoolnutritionandfitness.com/graphql';
// The order categories appear in; anything else goes after, condiments are hidden
const ORDER = ['Entrees', 'Proteins', 'Grains', 'Vegetables', 'Fruits', 'Dairy', 'Beverages'];
const HIDE = ['Condiment', 'Condiments'];

const mdy = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
const key = (d) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;   // the API's date format

// Nutrition fields the district fills in (the same ones its own menu app shows),
// as [label, field, unit, indent]. Allergens come as "1" (contains), "0" (doesn't)
// or null (not listed). Never read null as "free of".
export const FACTS = [
  ['Total fat', 'prod_total_fat', 'g', 0], ['Saturated fat', 'prod_sat_fat', 'g', 1], ['Trans fat', 'prod_trans_fat', 'g', 1],
  ['Cholesterol', 'prod_cholesterol', 'mg', 0], ['Sodium', 'prod_sodium', 'mg', 0],
  ['Carbohydrates', 'prod_carbs', 'g', 0], ['Fiber', 'prod_dietary_fiber', 'g', 1], ['Sugars', 'sugar', 'g', 1], ['Added sugars', 'added_sugar', 'g', 2],
  ['Protein', 'prod_protein', 'g', 0],
  ['Calcium', 'prod_calcium', 'mg', 0], ['Iron', 'prod_iron', 'mg', 0], ['Vitamin C', 'prod_vitc', 'mg', 0], ['Potassium', 'prod_potassium', 'mg', 0],
];
export const ALLERGENS = { dairy: 'Dairy', egg: 'Egg', fish: 'Fish', shellfish: 'Shellfish', peanut: 'Peanuts', treenuts: 'Tree nuts',
                           soy: 'Soy', sesame: 'Sesame', wheat: 'Wheat', gluten: 'Gluten', pork: 'Pork' };
const BASIC = 'id name category prod_calories';
const FULL = `${BASIC} image_url1 portion_size portion_size_unit ${FACTS.map((f) => f[1]).join(' ')} allergen_milk ${
  Object.keys(ALLERGENS).map((a) => `allergen_${a}`).join(' ')}`;

// One dish: {id, name, calories, image, serving, nut: {field: number}, allergens: {dairy: true|false, …}}
// (a key is missing from `allergens` when the district doesn't say)
function toDish(p) {
  const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const allergens = {};
  for (const a of Object.keys(ALLERGENS)) if (p[`allergen_${a}`] != null) allergens[a] = p[`allergen_${a}`] === '1';
  if (p.allergen_milk === '1') allergens.dairy = true;             // the district uses both for milk
  return {
    id: String(p.id), name: p.name, calories: p.prod_calories ? Math.round(p.prod_calories) : null,
    image: /^https:\/\//.test(p.image_url1 || '') ? p.image_url1 : null,
    serving: p.portion_size ? `${p.portion_size} ${p.portion_size_unit || ''}`.trim() : null,
    nut: Object.fromEntries(FACTS.map(([, f]) => [f, n(p[f])]).filter(([, v]) => v !== null)),
    allergens,
  };
}

// → { 'M/D/YYYY': { Entrees: [dish], ... } }. `full` adds photos, nutrition and allergens.
export async function fetchMenu(which, start, end, { full = false } = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query m($t: String!, $s: String!, $e: String!) { menuType(id: $t) {
        items(start_date: $s, end_date: $e) { date product { ${full ? FULL : BASIC} } } } }`,
      variables: { t: MENUS[which].type, s: mdy(start), e: mdy(end) },
    }),
  });
  if (!res.ok) throw new Error(`Menu service answered ${res.status}`);
  const json = await res.json();
  const days = {};
  for (const it of json.data?.menuType?.items ?? []) {
    const p = it.product;
    if (!p?.name || HIDE.includes(p.category)) continue;
    const day = (days[it.date] ??= {});
    const cat = p.category || 'Other';
    (day[cat] ??= []).push(toDish(p));
  }
  return days;
}

export const sortedCats = (day) => Object.keys(day).sort((a, b) =>
  (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));

// Diet markers the district puts in item names: (V) vegetarian, (VG) vegan, (GF) gluten-free
export function itemHtml(it) {
  const tags = [];
  const name = it.name.replace(/\s*\((VG|V|GF)\)/g, (_, t) => { tags.push(t); return ''; });
  const label = { V: 'Vegetarian', VG: 'Vegan', GF: 'Gluten-free' };
  return `<li><span class="item">${esc(name)} ${tags.map((t) => `<span class="diet d-${t.toLowerCase()}" title="${label[t]}" translate="no">${t}</span>`).join(' ')}</span>
    <span class="cal" translate="no">${it.calories ? `${it.calories} ${tr('cal')}` : ''}</span></li>`;
}

export async function todaysLunch() {
  const d = new Date();
  const days = await fetchMenu('lunch', d, d);
  return days[key(d)] || null;
}

// ── the next meal, for the home page ──
// Today's menu until lunch is over, then the next school day's, with tabs for the
// next few menu days (all from one fetch). Most of the menu repeats daily (the
// halal sandwich, cheese pizza, bagels, cereal…), so each day's changing entrées
// lead as tiles and the regulars follow in one short line. A regular is worked
// out from the data: on at least 70% of the menu days fetched (two weeks ahead).
const mins = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const pad2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;   // for #links
const REGULAR = 0.7;
const DIET = { V: 'Vegetarian', VG: 'Vegan', GF: 'Gluten-free' };

// A food icon from the dish's name so a row of dishes scans at a glance. First match wins.
const FOOD = [
  [/smoothie/i, '🥤'], [/pancake/i, '🥞'], [/waffle/i, '🧇'], [/french toast/i, '🍞'], [/muffin|cupcake/i, '🧁'],
  [/bagel/i, '🥯'], [/cereal|oatmeal|granola/i, '🥣'], [/egg roll|spring roll|dumpling|potsticker/i, '🥟'],
  [/\beggs?\b|omelet/i, '🍳'], [/burrito/i, '🌯'], [/taco|quesadilla|nacho|enchilada/i, '🌮'],
  [/gyro|pita|falafel|shawarma/i, '🥙'], [/burger/i, '🍔'], [/hot ?dog|corn ?dog/i, '🌭'], [/pizza|flatbread/i, '🍕'],
  [/salad/i, '🥗'], [/mac(aroni)? (and|&|n) cheese/i, '🧀'], [/pasta|lasagna|spaghetti|ziti|penne|alfredo|ravioli/i, '🍝'],
  [/noodle|ramen|lo mein|chow mein/i, '🍜'], [/sandwich|melt|\bsub\b|wrap|hoagie|panini|grilled cheese|slider/i, '🥪'],
  [/soup|chili|stew/i, '🍲'], [/rice|bowl/i, '🍚'], [/tofu|teriyaki/i, '🍱'], [/fish|salmon|shrimp/i, '🐟'],
  [/chicken|wing|nugget|tender|strip/i, '🍗'], [/beef|steak|meatball/i, '🥩'],
  [/carrot/i, '🥕'], [/\bcorn\b/i, '🌽'], [/broccoli/i, '🥦'],
  [/bosco|breadstick|stick|pretzel|bread|roll|toast/i, '🥖'], [/fries|potato|tots/i, '🍟'], [/yogurt|parfait/i, '🍨'],
  [/milk/i, '🥛'], [/juice/i, '🧃'], [/\borange/i, '🍊'],
  [/peach/i, '🍑'], [/banana/i, '🍌'], [/melon/i, '🍉'], [/grape/i, '🍇'], [/pear\b/i, '🍐'], [/berr/i, '🍓'], [/fruit|apple/i, '🍎'],
];
export const foodIcon = (name) => FOOD.find(([re]) => re.test(name))?.[1] || '🍽️';
const entrees = (d) => (d ? d.Entrees || d[sortedCats(d)[0]] || [] : []);
// "Nature's Path Organic Choco Cereal (GF)" → {name: 'Choco Cereal', tags: ['GF']}
export function dish(it) {
  const tags = [];
  const name = it.name.replace(/\s*\((VG|V|GF)\)/g, (_, x) => { tags.push(x); return ''; })
    .replace(/^Nature's Path Organic /, '').replace(/\s{2,}/g, ' ').trim();
  return { id: it.id, raw: it.name, name, tags, icon: foodIcon(name) };
}
// translate="no": Google read "V" as a Roman numeral and pulled words into the badge
export const diet = (tags) => tags.map((x) => `<span class="diet d-${x.toLowerCase()}" title="${DIET[x]}" translate="no">${x}</span>`).join(' ');
export function regularsIn(days) {
  const lists = Object.values(days).map((d) => new Set(entrees(d).map((i) => i.name)));
  if (lists.length < 4) return new Set();             // too little to tell
  const n = {};
  lists.forEach((s) => s.forEach((x) => { n[x] = (n[x] || 0) + 1; }));
  return new Set(Object.keys(n).filter((x) => n[x] >= REGULAR * lists.length));
}
const span = (n) => (n >= 60 ? `${Math.floor(n / 60)} hr${n % 60 ? ` ${n % 60} min` : ''}` : `${n} min`);

export async function mountNextMeal(el) {
  try {
    const bell = await loadBell();
    const now = new Date();
    const m = now.getHours() * 60 + now.getMinutes();
    const lunchOf = (plan) => plan?.periods?.find(([n]) => /^Lunch/.test(n)) || null;
    const today = dayPlan(bell, now);
    const lunchEnd = lunchOf(today) ? mins(lunchOf(today)[2]) : 13 * 60 + 30;   // adjusted days: assume 1:30
    const start = (today.periods || today.adjusted) && m < lunchEnd ? dayOnly(now) : nextSchoolDay(bell, now)[0];
    if (!start) { el.hidden = true; return; }
    const end = new Date(start); end.setDate(end.getDate() + 14);
    const [lunch, breakfast] = await Promise.all([fetchMenu('lunch', start, end), fetchMenu('breakfast', start, end)]);
    // Up to 5 days from `start` that have a lunch posted (skips days off the bell data doesn't know)
    const days = [];
    for (let d = new Date(start), i = 0; i < 15 && days.length < 5; i++, d.setDate(d.getDate() + 1)) {
      if (entrees(lunch[key(d)]).length) days.push(new Date(d));
    }
    if (!days.length) { el.hidden = true; return; }
    const regL = regularsIn(lunch);
    const regB = regularsIn(breakfast);
    const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
    const tab = (d) => (key(d) === key(now) ? relDay(0) : key(d) === key(tmr) ? relDay(1)
      : `${dateText(d, { weekday: 'short' })} ${d.getDate()}`);
    const sep = '<i class="nm-sep" aria-hidden="true">·</i>';
    const link = (which, d, x) => `${root}menu/#${which}/${iso(d)}/${encodeURIComponent(x.id)}`;
    const inline = (x, href) => `<${href ? `a href="${href}"` : 'span'} class="nm-dish"><span class="nm-i" aria-hidden="true">${x.icon}</span>&#8288;${esc(x.name)}${x.tags.length ? ` ${diet(x.tags)}` : ''}</${href ? 'a' : 'span'}>`;
    // The day's dishes, changing ones first; if everything is a regular, show it all as changing
    const split = (list, reg) => {
      const all = list.map(dish);
      const fresh = all.filter((x) => !reg.has(x.raw));
      return fresh.length ? [fresh, all.filter((x) => reg.has(x.raw))] : [all, []];
    };

    el.innerHTML = `<div class="nm-top">
        <span class="nm-title">Cafeteria</span>
        <div class="nm-days" role="tablist" aria-label="Day">${days.map((d, i) =>
          `<button type="button" role="tab" data-i="${i}" aria-selected="${i === 0}" tabindex="${i ? -1 : 0}" translate="no">${tab(d)}</button>`).join('')}</div>
        <a class="nm-full" href="${root}menu/">Full menu <span aria-hidden="true">→</span></a></div>
      <div class="nm-body" role="tabpanel"></div>`;
    const body = el.querySelector('.nm-body');

    const paint = (i) => {
      const d = days[i];
      const k = key(d);
      const isToday = k === key(now);
      const plan = dayPlan(bell, d);
      const lp = lunchOf(plan);
      const firstBell = plan.periods?.[0]?.[1];
      const [lFresh, lReg] = split(entrees(lunch[k]), regL);
      const bList = entrees(breakfast[k]);
      const showB = bList.length && !(isToday && firstBell && m >= mins(firstBell));   // breakfast is over once class starts
      const [bFresh, bReg] = split(bList, regB);
      let when = '';
      if (isToday && lp) {
        const a = mins(lp[1]);
        const b = mins(lp[2]);
        when = m < a ? `in ${span(a - m)}` : m < b ? 'on now' : '';
      }
      body.innerHTML = `
        ${showB ? `<div class="nm-row nm-bfast"><span class="nm-label">Breakfast</span>
          <span class="nm-list">${bFresh.map((x) => inline(x, link('breakfast', d, x))).join(sep)}</span>
          ${bReg.length ? `<button type="button" class="nm-more" aria-expanded="false" translate="no">${tr('+{n} regulars', { n: bReg.length })}</button>
            <span class="nm-list nm-extra" hidden>${bReg.map((x) => inline(x)).join(sep)}</span>` : ''}</div>` : ''}
        <div class="nm-row nm-lhead"><span class="nm-label">Lunch</span>
          ${lp ? `<span class="nm-time">${clock(lp[1])}–${clock(lp[2])}</span>` : ''}
          ${when ? `<span class="nm-when${when === 'on now' ? ' now' : ''}">${when}</span>` : ''}
          ${lReg.length ? `<button type="button" class="nm-more nm-more-l" aria-expanded="false" translate="no">${tr('+{n} regulars', { n: lReg.length })}</button>` : ''}</div>
        <ul class="nm-tiles">${lFresh.map((x, j) => `<li><a class="nm-tile" style="--i:${j}" href="${link('lunch', d, x)}">
          <span class="nm-ic" aria-hidden="true">${x.icon}</span><span class="nm-name">${esc(x.name)}${x.tags.length ? ` ${diet(x.tags)}` : ''}</span></a></li>`).join('')}</ul>
        ${lReg.length ? `<div class="nm-row nm-regulars" title="On the menu most days"><span class="nm-label">Regulars</span>
          <span class="nm-list">${lReg.map((x) => inline(x)).join(sep)}</span></div>` : ''}`;
    };
    paint(0);

    const tabs = [...el.querySelectorAll('.nm-days [role=tab]')];
    const pick = (i, focus) => {
      tabs.forEach((b, j) => { b.setAttribute('aria-selected', j === i); b.tabIndex = j === i ? 0 : -1; });
      if (focus) tabs[i].focus();
      paint(i);
    };
    el.querySelector('.nm-days').addEventListener('click', (e) => {
      const b = e.target.closest('[role=tab]');
      if (b) pick(Number(b.dataset.i));
    });
    el.querySelector('.nm-days').addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (i < 0 || !step) return;
      e.preventDefault();
      pick((i + step + tabs.length) % tabs.length, true);
    });
    // "+N regulars": breakfast's are listed inline after the button; lunch's line is
    // always shown on wide screens and folded behind the button on phones (CSS)
    body.addEventListener('click', (e) => {
      const b = e.target.closest('.nm-more');
      if (!b) return;
      if (b.classList.contains('nm-more-l')) body.querySelector('.nm-regulars')?.classList.add('open');
      else b.nextElementSibling.hidden = false;
      b.remove();
    });
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="nm-top"><span class="nm-title">Cafeteria</span>
      <span class="nm-time">Couldn’t load the menu right now.</span><a class="nm-full" href="${root}menu/">Full menu <span aria-hidden="true">→</span></a></div>`;
  }
}

// ── the Menu page ──
// A strip of the week's days (each with its headline dish), then the chosen day:
// the changing dishes as photo cards, the regulars as a compact row, and the sides.
// Any dish opens a panel with its photo, nutrition and allergens (a side drawer on
// wide screens, a bottom sheet on phones). Hover only previews; tap/click is the
// real way in, so phones and keyboards get everything too.
// Links: #lunch/2026-09-30 opens that day, #lunch/2026-09-30/<dish id> that dish.
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function mondayOf(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = m.getDay();                        // weekends show the coming week
  m.setDate(m.getDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
  return m;
}
const num = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
const DIETS = [['V', 'Vegetarian'], ['VG', 'Vegan'], ['GF', 'Gluten-free']];

if ($('#menu-app')) {
  await initHeader();
  const todayK = key(new Date());
  const fromIso = (s) => { const [y, mo, d] = s.split('-').map(Number); return new Date(y, mo - 1, d); };
  const state = { which: new Date().getHours() < 10 ? 'breakfast' : 'lunch',   // before 10 AM, breakfast is what people want
                  monday: mondayOf(new Date()), day: null, diet: new Set(), avoid: new Set() };
  const [hWhich, hDay, hDish] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (MENUS[hWhich]) state.which = hWhich;
  if (/^\d{4}-\d\d-\d\d$/.test(hDay || '')) { const d = fromIso(hDay); state.monday = mondayOf(d); state.day = key(d); }
  let wantDish = hDish || null;
  const bell = await loadBell().catch(() => null);
  const cache = {};
  let week = [];
  let data = {};
  let regs = new Set();
  let byId = {};
  let served = {};                               // dish id → the days this week it's on

  const dayOf = (k) => week.find((d) => key(d) === k);
  const setHash = (dishId) => history.replaceState(null, '', `#${state.which}/${iso(dayOf(state.day) || state.monday)}${dishId ? `/${encodeURIComponent(dishId)}` : ''}`);
  const pic = (x) => (x.image
    ? `<img src="${esc(x.image)}" alt="" loading="lazy" decoding="async" data-ic="${foodIcon(dish(x).name)}">`
    : `<span class="mn-emoji" aria-hidden="true">${foodIcon(dish(x).name)}</span>`);
  // A photo that won't load becomes the dish's icon
  $('#menu-app').addEventListener('error', (e) => {
    if (e.target.tagName !== 'IMG' || !e.target.dataset.ic) return;
    e.target.outerHTML = `<span class="mn-emoji" aria-hidden="true">${e.target.dataset.ic}</span>`;
  }, true);

  async function load() {
    week = [0, 1, 2, 3, 4].map((i) => addDays(state.monday, i));
    $('#week-label').textContent = `${dateText(week[0], { month: 'short', day: 'numeric' })} – ${dateText(week[4], { month: 'short', day: 'numeric', year: 'numeric' })}`;
    $$('.official-link').forEach((a) => { a.href = MENUS[state.which].official; });   // the district's own page for this meal
    $$('#menu-which [data-which]').forEach((b) => b.setAttribute('aria-checked', b.dataset.which === state.which));
    $('#mn-view').innerHTML = `<div class="mn-cards">${'<div class="mn-card mn-skel"><span class="mn-photo"></span><span class="mn-name">&nbsp;</span></div>'.repeat(5)}</div>`;
    const ck = `${state.which}:${key(state.monday)}`;
    try {
      data = cache[ck] || (cache[ck] = await fetchMenu(state.which, week[0], week[4], { full: true }));
    } catch (e) {
      console.error(e);
      $('#mn-week').innerHTML = '';
      $('#mn-filters').innerHTML = '';
      $('#mn-view').innerHTML = `<div class="empty">Couldn’t load the menu right now. <a href="${MENUS[state.which].official}" target="_blank" rel="noopener">Open the official menu</a>.</div>`;
      return;
    }
    regs = regularsIn(data);
    byId = {};
    served = {};
    for (const [k, day] of Object.entries(data)) {
      for (const list of Object.values(day)) {
        for (const x of list) { byId[x.id] = x; (served[x.id] ??= []).includes(k) || served[x.id].push(k); }
      }
    }
    if (!dayOf(state.day) || !data[state.day]) {
      state.day = key(dayOf(todayK) && data[todayK] ? dayOf(todayK) : week.find((d) => data[key(d)]) || week[0]);
    }
    paintWeek();
    paintFilters();
    paintDay();
    if (wantDish && byId[wantDish]) openDish(wantDish);
    wantDish = null;
  }

  // The day's dishes: [changing, regulars]. If every dish is a regular, they all count as changing.
  const splitDay = (k) => {
    const list = entrees(data[k]);
    const fresh = list.filter((x) => !regs.has(x.name));
    return fresh.length ? [fresh, list.filter((x) => regs.has(x.name))] : [list, []];
  };

  function paintWeek() {
    $('#mn-week').innerHTML = week.map((d) => {
      const k = key(d);
      const [fresh] = splitDay(k);
      const star = fresh.find((x) => x.image) || fresh[0];
      return `<button type="button" role="tab" class="mn-day${k === todayK ? ' today' : ''}" data-k="${k}"
          aria-selected="${k === state.day}" tabindex="${k === state.day ? 0 : -1}" ${data[k] ? '' : 'disabled'}>
        <span class="mn-dow" translate="no">${k === todayK ? relDay(0) : dateText(d, { weekday: 'short' })}</span>
        <span class="mn-date">${d.getDate()}</span>
        <span class="mn-thumb">${star ? pic(star) : ''}</span>
        <span class="mn-star">${star ? esc(dish(star).name) : 'No menu'}</span></button>`;
    }).join('');
  }

  function paintFilters() {
    const marked = Object.keys(ALLERGENS).filter((a) => Object.values(byId).some((x) => x.allergens[a]));
    const chip = (kind, v, label) => `<button type="button" class="chip" data-f="${kind}" data-v="${v}" aria-pressed="${state[kind].has(v)}">${label}</button>`;
    $('#mn-filters').innerHTML = !Object.keys(byId).length ? '' : `
      <span class="mn-flabel">Show</span>${DIETS.map(([v, l]) => chip('diet', v, l)).join('')}
      ${marked.length ? `<span class="mn-flabel">Avoid</span>${marked.map((a) => chip('avoid', a, ALLERGENS[a])).join('')}` : ''}`;
  }

  // Filters dim what doesn't fit rather than hiding it, so the day never jumps around.
  // Diet marks come from the dish names (V, VG, GF), so they apply to main dishes only.
  function applyFilters() {
    let shown = 0;
    let total = 0;
    let dashed = 0;
    $$('#mn-view [data-id]').forEach((el) => {
      const x = byId[el.dataset.id];
      const tags = dish(x).tags;
      const main = el.classList.contains('mn-card');
      const dietOk = !main || [...state.diet].every((t) => (t === 'V' ? tags.includes('V') || tags.includes('VG') : tags.includes(t)));
      const has = [...state.avoid].filter((a) => x.allergens[a]);
      const unknown = [...state.avoid].filter((a) => !(a in x.allergens));
      const off = !dietOk || has.length > 0;
      el.classList.toggle('off', off);
      el.classList.toggle('unk', !off && unknown.length > 0);
      el.title = has.length ? `Contains ${has.map((a) => ALLERGENS[a]).join(', ')}`
        : !off && unknown.length ? `${unknown.map((a) => ALLERGENS[a]).join(', ')}: not listed for this dish` : '';
      if (main) { total++; if (!off) shown++; }
      if (!off && unknown.length) dashed++;
    });
    const note = $('#mn-fnote');
    if (note) {
      note.textContent = !state.diet.size && !state.avoid.size ? ''
        : `${shown} of ${total} dishes fit.${dashed ? ' Dashed: the district doesn’t list that allergen for it.' : ''}${
          state.avoid.size ? ' If you have a food allergy, check with the cafeteria staff.' : ''}`;
    }
  }

  const card = (x, i) => {
    const v = dish(x);
    const n = x.nut;
    const peek = [n.prod_carbs != null && `${num(n.prod_carbs)}g carbs`, n.prod_total_fat != null && `${num(n.prod_total_fat)}g fat`,
                  n.prod_sodium != null && `${num(n.prod_sodium)}mg sodium`].filter(Boolean).join(' · ');
    return `<button type="button" class="mn-card" data-id="${esc(x.id)}" style="--i:${i}">
      <span class="mn-photo">${pic(x)}${peek ? `<span class="mn-peek">${peek}</span>` : ''}</span>
      <span class="mn-name">${esc(v.name)}${v.tags.length ? ` ${diet(v.tags)}` : ''}</span>
      <span class="mn-kcal">${x.calories ? `<span translate="no"><b>${x.calories}</b> ${tr('cal')}</span>` : ''}${n.prod_protein != null ? `${x.calories ? ' · ' : ''}${num(n.prod_protein)}g protein` : ''}</span></button>`;
  };
  const side = (x) => {
    const v = dish(x);
    return `<button type="button" class="mn-side" data-id="${esc(x.id)}"><span aria-hidden="true">${v.icon}</span>${esc(v.name)}${
      x.calories ? `<small translate="no">${x.calories} ${tr('cal')}</small>` : ''}</button>`;
  };

  function paintDay() {
    const k = state.day;
    const d = dayOf(k);
    const day = data[k];
    $$('#mn-week [role=tab]').forEach((b) => { const on = b.dataset.k === k; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    const plan = bell && d ? dayPlan(bell, d) : null;
    const lp = plan?.periods?.find(([name]) => /^Lunch/.test(name));
    const head = `<div class="mn-dayhead"><h2 translate="no">${dateText(d, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
      ${k === todayK ? `<span class="tag today-tag" translate="no">${relDay(0)}</span>` : ''}
      ${state.which === 'lunch' && lp ? `<span class="mn-when">Lunch ${clock(lp[1])}–${clock(lp[2])}</span>` : ''}</div>`;
    if (!day) {
      $('#mn-view').innerHTML = `${head}<p class="empty">No ${state.which} menu posted for this day. It may be a holiday or a day off.</p>`;
      return;
    }
    const [mains, regulars] = splitDay(k);
    const sides = sortedCats(day).filter((c) => c !== 'Entrees' && day[c].length);
    $('#mn-view').innerHTML = `${head}
      <div class="mn-cards">${mains.map(card).join('')}</div>
      ${regulars.length ? `<h3 class="mn-h">Regulars <span>on the menu most days</span></h3>
        <div class="mn-cards mn-small">${regulars.map((x, i) => card(x, i + mains.length)).join('')}</div>` : ''}
      ${sides.length ? `<h3 class="mn-h">On the side</h3><div class="mn-sides">${sides.map((c) =>
        `<div class="mn-side-group"><span class="mn-side-label">${esc(c)}</span>${day[c].map(side).join('')}</div>`).join('')}</div>` : ''}`;
    applyFilters();
  }

  // ── the dish panel ──
  const sheet = document.createElement('div');
  sheet.className = 'mn-sheet';
  sheet.hidden = true;
  sheet.innerHTML = '<div class="mn-scrim" data-close></div><aside class="mn-panel" role="dialog" aria-modal="true" aria-labelledby="mn-d-name"></aside>';
  document.body.append(sheet);
  const panel = $('.mn-panel', sheet);
  let back = null;

  function openDish(id, from) {
    const x = byId[id];
    if (!x) return;
    const v = dish(x);
    const n = x.nut;
    // Where the calories come from: 4 kcal per gram of protein and carbs, 9 per gram of fat
    const parts = [['Protein', n.prod_protein, 4, 'p'], ['Carbs', n.prod_carbs, 4, 'c'], ['Fat', n.prod_total_fat, 9, 'f']];
    const known = parts.every(([, g]) => g != null);
    const sum = known ? parts.reduce((s, [, g, per]) => s + g * per, 0) : 0;
    const bar = known && sum ? `<div class="mn-split" role="img" aria-label="Calories from ${parts.map(([l, g, per]) => `${l.toLowerCase()} ${Math.round(g * per / sum * 100)}%`).join(', ')}">
        ${parts.map(([, g, per, c]) => `<i class="s-${c}" style="width:${(g * per / sum * 100).toFixed(1)}%"></i>`).join('')}</div>
      <div class="mn-legend">${parts.map(([l, g, per, c]) => `<span><i class="s-${c}"></i>${l} <b>${num(g)}g</b> <small>${Math.round(g * per / sum * 100)}%</small></span>`).join('')}</div>` : '';
    const rows = FACTS.filter(([, f]) => n[f] != null).map(([label, f, unit, ind]) =>
      `<tr class="in${ind}"><td>${label}</td><td>${num(n[f])} ${unit}</td></tr>`).join('');
    const has = Object.keys(ALLERGENS).filter((a) => x.allergens[a]);
    const said = Object.keys(x.allergens).length;
    const days = (served[id] || []).filter((k) => k !== state.day).map((k) => (k === todayK ? 'today'
      : dayOf(k).toLocaleDateString('en-US', { weekday: 'long' })));
    panel.innerHTML = `
      <button type="button" class="mn-x icon-btn" data-close aria-label="Close">✕</button>
      <div class="mn-hero">${x.image ? `<img class="bg" src="${esc(x.image)}" alt=""><img class="fg" src="${esc(x.image)}" alt="${esc(v.name)}">`
        : `<span class="mn-emoji">${v.icon}</span>`}</div>
      <h2 id="mn-d-name">${esc(v.name)}</h2>
      <p class="mn-d-sub">${v.tags.map((t) => `${diet([t])} ${DIET[t]}`).join(' · ')}${v.tags.length && x.serving ? ' · ' : ''}${x.serving ? `Serving: ${esc(x.serving)}` : ''}</p>
      ${x.calories ? `<p class="mn-d-cal"><b>${x.calories}</b> calories</p>` : ''}
      ${bar}
      ${rows ? `<table class="mn-facts"><caption>Nutrition per serving</caption><tbody>${rows}</tbody></table>` : '<p class="meta">The district hasn’t listed nutrition for this one.</p>'}
      <div class="mn-allergy ${has.length ? 'has' : ''}"><b>Allergens</b>
        ${has.length ? `Contains ${has.map((a) => ALLERGENS[a]).join(', ')}.` : said ? 'None marked by the district.' : 'Not listed by the district.'}</div>
      ${days.length ? `<p class="mn-d-also">Also on the menu ${days.join(', ')} this week.</p>` : ''}
      <p class="meta mn-d-src">Photo, nutrition and allergens from Santa Clara Unified Nutrition Services. Recipes can change,
        so if you have a food allergy, check with the cafeteria staff.
        <a href="${MENUS[state.which].official}" target="_blank" rel="noopener">Original menu ↗</a></p>`;
    back = from || document.activeElement;
    sheet.hidden = false;
    document.documentElement.classList.add('mn-locked');
    void panel.offsetWidth;                        // lay it out closed first, so the slide-in runs
    sheet.classList.add('open');
    $('.mn-x', panel).focus({ preventScroll: true });
    panel.scrollTop = 0;
    setHash(id);
  }
  function closeDish() {
    if (sheet.hidden) return;
    sheet.classList.remove('open');
    document.documentElement.classList.remove('mn-locked');
    setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 260);
    back?.focus?.({ preventScroll: true });
    setHash();
  }
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDish(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDish();
    if (e.key === 'Tab' && !sheet.hidden) {               // keep Tab inside the panel while it's open
      const f = [...panel.querySelectorAll('button, a[href]')];
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });

  // ── controls ──
  $('#mn-view').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) openDish(b.dataset.id, b);
  });
  const pickDay = (k, focus) => {
    state.day = k;
    paintDay();
    setHash();
    if (focus) $(`#mn-week [data-k="${k}"]`)?.focus();
  };
  $('#mn-week').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (b && !b.disabled) pickDay(b.dataset.k);
  });
  $('#mn-week').addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const open = week.map(key).filter((k) => data[k]);
    const i = open.indexOf(state.day);
    pickDay(open[(i + step + open.length) % open.length], true);
  });
  $('#mn-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    const set = state[b.dataset.f];
    set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v);
    b.setAttribute('aria-pressed', set.has(b.dataset.v));
    applyFilters();
  });
  $('#menu-which').addEventListener('click', (e) => {
    const b = e.target.closest('[data-which]');
    if (b && b.dataset.which !== state.which) { state.which = b.dataset.which; load().then(() => setHash()); }
  });
  const toWeek = (m) => { state.monday = m; state.day = null; load().then(() => setHash()); };
  $('#prev-week').onclick = () => toWeek(addDays(state.monday, -7));
  $('#next-week').onclick = () => toWeek(addDays(state.monday, 7));
  $('#this-week').onclick = () => toWeek(mondayOf(new Date()));
  load();
}
