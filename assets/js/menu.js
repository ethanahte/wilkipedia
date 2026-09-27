// The cafeteria menu, read live from the district's menu service
// (schoolnutritionandfitness.com, which allows other sites to read it).
// Nothing is copied into this repo, so the page is always the current menu.
//
// Used two ways: the Menu page (when #menu-app exists) and the Cafeteria
// panel on the campus map (todaysLunch()).

import { initHeader, $, $$, esc, root } from './ui.js';
import { loadBell, dayPlan, nextSchoolDay, clock } from './bell.js';

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

// → { 'M/D/YYYY': { Entrees: [{name, calories}], ... } }
export async function fetchMenu(which, start, end) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query m($t: String!, $s: String!, $e: String!) { menuType(id: $t) {
        items(start_date: $s, end_date: $e) { date product { name category prod_calories } } } }`,
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
    (day[cat] ??= []).push({ name: p.name, calories: p.prod_calories ? Math.round(p.prod_calories) : null });
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
  return `<li><span class="item">${esc(name)} ${tags.map((t) => `<span class="diet d-${t.toLowerCase()}" title="${label[t]}">${t}</span>`).join(' ')}</span>
    <span class="cal">${it.calories ? `${it.calories} cal` : ''}</span></li>`;
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
  [/bosco|breadstick|stick|pretzel|bread|roll|toast/i, '🥖'], [/fries|potato|tots/i, '🍟'], [/yogurt|parfait/i, '🍨'],
  [/fruit|apple/i, '🍎'],
];
const foodIcon = (name) => FOOD.find(([re]) => re.test(name))?.[1] || '🍽️';
const entrees = (d) => (d ? d.Entrees || d[sortedCats(d)[0]] || [] : []);
// "Nature's Path Organic Choco Cereal (GF)" → {name: 'Choco Cereal', tags: ['GF']}
function dish(it) {
  const tags = [];
  const name = it.name.replace(/\s*\((VG|V|GF)\)/g, (_, x) => { tags.push(x); return ''; })
    .replace(/^Nature's Path Organic /, '').replace(/\s{2,}/g, ' ').trim();
  return { raw: it.name, name, tags, icon: foodIcon(name) };
}
const diet = (tags) => tags.map((x) => `<span class="diet d-${x.toLowerCase()}" title="${DIET[x]}">${x}</span>`).join(' ');
function regularsIn(days) {
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
    const tab = (d) => (key(d) === key(now) ? 'Today' : key(d) === key(tmr) ? 'Tomorrow'
      : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`);
    const sep = '<i class="nm-sep" aria-hidden="true">·</i>';
    const inline = (x) => `<span class="nm-dish"><span class="nm-i" aria-hidden="true">${x.icon}</span>&#8288;${esc(x.name)}${x.tags.length ? ` ${diet(x.tags)}` : ''}</span>`;
    // The day's dishes, changing ones first; if everything is a regular, show it all as changing
    const split = (list, reg) => {
      const all = list.map(dish);
      const fresh = all.filter((x) => !reg.has(x.raw));
      return fresh.length ? [fresh, all.filter((x) => reg.has(x.raw))] : [all, []];
    };

    el.innerHTML = `<div class="nm-top">
        <span class="nm-title">Cafeteria</span>
        <div class="nm-days" role="tablist" aria-label="Day">${days.map((d, i) =>
          `<button type="button" role="tab" data-i="${i}" aria-selected="${i === 0}" tabindex="${i ? -1 : 0}">${tab(d)}</button>`).join('')}</div>
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
          <span class="nm-list">${bFresh.map(inline).join(sep)}</span>
          ${bReg.length ? `<button type="button" class="nm-more" aria-expanded="false">+${bReg.length} regulars</button>
            <span class="nm-list nm-extra" hidden>${bReg.map(inline).join(sep)}</span>` : ''}</div>` : ''}
        <div class="nm-row nm-lhead"><span class="nm-label">Lunch</span>
          ${lp ? `<span class="nm-time">${clock(lp[1])}–${clock(lp[2])}</span>` : ''}
          ${when ? `<span class="nm-when${when === 'on now' ? ' now' : ''}">${when}</span>` : ''}
          ${lReg.length ? `<button type="button" class="nm-more nm-more-l" aria-expanded="false">+${lReg.length} regulars</button>` : ''}</div>
        <ul class="nm-tiles">${lFresh.map((x, j) => `<li class="nm-tile" style="--i:${j}">
          <span class="nm-ic" aria-hidden="true">${x.icon}</span><span class="nm-name">${esc(x.name)}${x.tags.length ? ` ${diet(x.tags)}` : ''}</span></li>`).join('')}</ul>
        ${lReg.length ? `<div class="nm-row nm-regulars" title="On the menu most days"><span class="nm-label">Regulars</span>
          <span class="nm-list">${lReg.map(inline).join(sep)}</span></div>` : ''}`;
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
if ($('#menu-app')) {
  await initHeader();
  const state = { which: 'lunch', monday: mondayOf(new Date()) };

  function mondayOf(d) {
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = m.getDay();                        // weekends show the coming week
    m.setDate(m.getDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
    return m;
  }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = key(new Date());

  async function draw() {
    const week = [0, 1, 2, 3, 4].map((i) => addDays(state.monday, i));
    $('#week-label').textContent = `${week[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${week[4].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    $('#official').href = MENUS[state.which].official;
    $$('#menu-which [data-which]').forEach((b) => b.setAttribute('aria-checked', b.dataset.which === state.which));
    $('#menu-days').innerHTML = '<div class="meta">Loading the menu…</div>';
    try {
      const days = await fetchMenu(state.which, week[0], week[4]);
      $('#menu-days').innerHTML = week.map((d) => {
        const day = days[key(d)];
        const isToday = key(d) === today;
        return `<article class="menu-day${isToday ? ' today' : ''}" ${isToday ? 'id="today"' : ''}>
          <h2>${d.toLocaleDateString('en-US', { weekday: 'long' })} <span class="meta">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            ${isToday ? '<span class="tag today-tag">Today</span>' : ''}</h2>
          ${day ? sortedCats(day).map((c) => `<div class="menu-cat"><div class="label">${esc(c)}</div>
            <ul>${day[c].map(itemHtml).join('')}</ul></div>`).join('')
            : '<p class="meta">No menu posted. It may be a holiday or a day off.</p>'}</article>`;
      }).join('');
    } catch (e) {
      console.error(e);
      $('#menu-days').innerHTML = `<div class="empty">Couldn’t load the menu right now. <a href="${MENUS[state.which].official}" target="_blank" rel="noopener">Open the official menu</a>.</div>`;
    }
  }
  $('#menu-which').addEventListener('click', (e) => {
    const b = e.target.closest('[data-which]');
    if (b) { state.which = b.dataset.which; draw(); }
  });
  $('#prev-week').onclick = () => { state.monday = addDays(state.monday, -7); draw(); };
  $('#next-week').onclick = () => { state.monday = addDays(state.monday, 7); draw(); };
  $('#this-week').onclick = () => { state.monday = mondayOf(new Date()); draw(); };
  const h = new Date().getHours();
  if (h < 10) state.which = 'breakfast';   // before 10 AM, breakfast is what people want
  draw();
}
