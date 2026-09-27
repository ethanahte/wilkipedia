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
// Today's menu until lunch is over, then the next school day's. Breakfast shows
// until the first bell. If the menu service has nothing for that day (a day off
// the bell data doesn't know about), the next day it does have is shown.
const mins = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export async function mountNextMeal(el) {
  try {
    const bell = await loadBell();
    const now = new Date();
    const m = now.getHours() * 60 + now.getMinutes();
    const lunchOf = (plan) => plan?.periods?.find(([n]) => /^Lunch/.test(n)) || null;
    const today = dayPlan(bell, now);
    const lunchEnd = lunchOf(today) ? mins(lunchOf(today)[2]) : 13 * 60 + 30;   // adjusted days: assume 1:30
    let day = (today.periods || today.adjusted) && m < lunchEnd ? dayOnly(now) : nextSchoolDay(bell, now)[0];
    if (!day) { el.hidden = true; return; }
    const end = new Date(day); end.setDate(end.getDate() + 14);
    const [lunch, breakfast] = await Promise.all([fetchMenu('lunch', day, end), fetchMenu('breakfast', day, end)]);
    // the first day from `day` on that has a lunch posted
    for (let i = 0; i < 15 && !lunch[key(day)]; i++) day.setDate(day.getDate() + 1);
    if (!lunch[key(day)]) { el.hidden = true; return; }

    const isToday = key(day) === key(now);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const when = isToday ? 'Today' : key(day) === key(tomorrow) ? 'Tomorrow'
      : day.toLocaleDateString('en-US', { weekday: 'long' });
    const plan = dayPlan(bell, day);
    const firstBell = plan.periods?.[0]?.[1];
    const showBreakfast = breakfast[key(day)] && !(isToday && firstBell && m >= mins(firstBell));
    const lunchTime = lunchOf(plan);
    // Phones show the first 6 entrées and a "+N more" chip (CSS), one meal at a time
    const chips = (d) => {
      const list = d.Entrees || d[sortedCats(d)[0]];
      return `<ul class="nm-items">${list.map((it) => {
        const tags = [];
        const name = it.name.replace(/\s*\((VG|V|GF)\)/g, (_, x) => { tags.push(x); return ''; });
        return `<li>${esc(name)}${tags.map((x) => ` <span class="diet d-${x.toLowerCase()}">${x}</span>`).join('')}</li>`;
      }).join('')}${list.length > 6 ? `<li class="nm-more"><a href="${root}menu/">+${list.length - 6} more</a></li>` : ''}</ul>`;
    };
    const meal = (which, label, time, d) => `<div class="nm-meal" data-meal="${which}"><h3>${label}${time ? ` <small>${time}</small>` : ''}</h3>${chips(d)}</div>`;
    el.innerHTML = `<div class="bell-top">
        <div class="bell-text"><span class="bell-day">Cafeteria menu · ${when === 'Today' ? 'Today' : `${when}, ${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</span>
          <span class="bell-status"><b>${showBreakfast ? `${when === 'Today' ? 'Today’s' : `${when}’s`} breakfast and lunch` : `Lunch ${when === 'Today' ? 'today' : when === 'Tomorrow' ? 'tomorrow' : `on ${when}`}`}</b></span></div>
        <a class="bell-more" href="${root}menu/">Full menu</a></div>
      ${showBreakfast ? `<div class="seg nm-seg" role="radiogroup" aria-label="Meal">
        <button type="button" role="radio" data-show="breakfast" aria-checked="true">Breakfast</button>
        <button type="button" role="radio" data-show="lunch" aria-checked="false">Lunch</button></div>` : ''}
      <div class="nm-meals" data-show="${showBreakfast ? 'breakfast' : 'lunch'}">
        ${showBreakfast ? meal('breakfast', 'Breakfast', 'before school', breakfast[key(day)]) : ''}
        ${meal('lunch', 'Lunch', lunchTime ? `${clock(lunchTime[1])}–${clock(lunchTime[2])}` : '', lunch[key(day)])}
      </div>`;
    el.querySelector('.nm-seg')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-show]');
      if (!b) return;
      el.querySelector('.nm-meals').dataset.show = b.dataset.show;
      el.querySelectorAll('.nm-seg [data-show]').forEach((x) => x.setAttribute('aria-checked', x === b));
    });
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="bell-top"><div class="bell-text"><span class="bell-day">Cafeteria menu</span>
      <span class="bell-status">Couldn’t load the menu right now.</span></div><a class="bell-more" href="${root}menu/">Full menu</a></div>`;
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
