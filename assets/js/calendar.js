// The Calendar page: the school year at a glance. A "Coming up" strip, a month
// view (no-school days shaded, today ringed, each event a coloured chip), and
// filters by kind of event. Click a day to see everything on it.
//
// Data: data/calendar.json, made by tools/school_calendar.py from Wilcox's
// official activities calendar. Nothing is added here; the full list is also
// in the page's HTML (#cal-list) for anyone without JavaScript.

import { initHeader, dataUrl, esc, $ } from './ui.js';

await initHeader();
const cal = await fetch(dataUrl('data/calendar.json')).then((r) => r.json());
const app = $('#cal-app');

const ORDER = ['off', 'milestone', 'tests', 'spirit', 'arts', 'family', 'sports', 'school', 'schedule'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = iso(new Date());
const byDay = new Map();                                   // 'YYYY-MM-DD' -> events on it
for (const ev of cal.events) {
  for (let d = parse(ev.start); iso(d) <= ev.end; d.setDate(d.getDate() + 1)) {
    const k = iso(d);
    (byDay.get(k) || byDay.set(k, []).get(k)).push(ev);
  }
}
const first = parse(cal.events[0].start), last = parse(cal.events[cal.events.length - 1].end);

// state: which month is shown, which kinds are on, which day is open
let shown = new Date();
if (shown < first || shown > last) shown = new Date(first);
shown = new Date(shown.getFullYear(), shown.getMonth(), 1);
const on = new Set(ORDER);
let openDay = null;

const fmtDay = (s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => parse(s).toLocaleDateString('en-US', opts);
const when = (ev) => (ev.start === ev.end ? fmtDay(ev.start) : `${fmtDay(ev.start)} – ${fmtDay(ev.end)}`);
const extra = (ev) => [ev.time, ev.where].filter(Boolean).join(' · ');
const visible = (ev) => on.has(ev.cat);

function comingUp() {
  // the next few things that matter most: breaks, milestones, tests, big events
  const big = new Set(['off', 'milestone', 'tests', 'spirit', 'arts']);
  const list = cal.events.filter((ev) => ev.end >= today && big.has(ev.cat) && visible(ev)).slice(0, 5);
  if (!list.length) return '';
  return `<section class="cal-next" aria-label="Coming up"><h2>Coming up</h2><ol>${list.map((ev) => {
    const days = Math.round((parse(ev.start) - parse(today)) / 864e5);
    const rel = days <= 0 ? 'Now' : days === 1 ? 'Tomorrow' : days < 14 ? `In ${days} days` : fmtDay(ev.start, { month: 'short', day: 'numeric' });
    return `<li class="c-${esc(ev.cat)}"><span class="cal-rel">${esc(rel)}</span><b>${esc(ev.title)}</b><small>${esc(when(ev))}</small></li>`;
  }).join('')}</ol></section>`;
}

function filters() {
  const counts = {};
  for (const ev of cal.events) counts[ev.cat] = (counts[ev.cat] || 0) + 1;
  return `<div class="cal-filters" role="group" aria-label="Show">${ORDER.filter((c) => counts[c]).map((c) =>
    `<button type="button" class="chip cal-f c-${c}" data-cat="${c}" aria-pressed="${on.has(c)}"><i></i>${esc(cal.labels[c])}</button>`).join('')}</div>`;
}

function month() {
  const y = shown.getFullYear(), m = shown.getMonth();
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());         // the Sunday on or before the 1st
  const title = shown.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const canBack = new Date(y, m, 0) >= new Date(first.getFullYear(), first.getMonth(), 1);
  const canFwd = new Date(y, m + 1, 1) <= last;
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== m) break;                           // drop an empty sixth row
    const k = iso(d), evs = (byDay.get(k) || []).filter(visible);
    const off = (byDay.get(k) || []).some((ev) => ev.cat === 'off');
    const cls = ['cal-day', d.getMonth() !== m && 'out', k === today && 'today', off && 'off', openDay === k && 'open', evs.length && 'has']
      .filter(Boolean).join(' ');
    cells += `<button type="button" class="${cls}" data-day="${k}" aria-label="${esc(fmtDay(k, { weekday: 'long', month: 'long', day: 'numeric' }))}${evs.length ? `, ${evs.length} event${evs.length > 1 ? 's' : ''}` : ''}">
      <span class="cal-n">${d.getDate()}</span>
      <span class="cal-chips">${evs.slice(0, 3).map((ev) => `<span class="cal-chip c-${esc(ev.cat)}">${esc(ev.title)}</span>`).join('')}
      ${evs.length > 3 ? `<span class="cal-more">+${evs.length - 3} more</span>` : ''}</span></button>`;
  }
  return `<section class="cal-month" aria-label="${esc(title)}">
    <div class="cal-head"><button type="button" class="cal-nav" data-go="-1" aria-label="Previous month" ${canBack ? '' : 'disabled'}>‹</button>
      <h2>${esc(title)}</h2>
      <button type="button" class="cal-nav" data-go="1" aria-label="Next month" ${canFwd ? '' : 'disabled'}>›</button>
      <button type="button" class="chip cal-today" data-go="0">Today</button></div>
    <div class="cal-grid"><div class="cal-dow">Sun</div><div class="cal-dow">Mon</div><div class="cal-dow">Tue</div><div class="cal-dow">Wed</div><div class="cal-dow">Thu</div><div class="cal-dow">Fri</div><div class="cal-dow">Sat</div>${cells}</div>
  </section>`;
}

function dayPanel() {
  if (!openDay) return '';
  const evs = (byDay.get(openDay) || []).filter(visible);
  return `<section class="cal-dayview" aria-live="polite"><h3>${esc(fmtDay(openDay, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3>
    ${evs.length ? `<ul>${evs.map((ev) => `<li class="c-${esc(ev.cat)}"><i></i><div><b>${esc(ev.title)}</b>${extra(ev) ? `<small>${esc(extra(ev))}</small>` : ''}
      ${ev.start !== ev.end ? `<small>${esc(when(ev))}</small>` : ''}<span class="cal-kind">${esc(cal.labels[ev.cat])}</span></div></li>`).join('')}</ul>`
      : '<p class="meta">Nothing on the calendar this day.</p>'}</section>`;
}

function monthList() {
  // everything in the shown month, as a list (what the grid is too small to spell out)
  const y = shown.getFullYear(), m = shown.getMonth();
  const key = `${y}-${pad(m + 1)}`;
  const evs = cal.events.filter((ev) => visible(ev) && (ev.start.startsWith(key) || (ev.start < `${key}-01` && ev.end >= `${key}-01`)));
  return `<section class="cal-month-list"><h2>All of ${esc(shown.toLocaleDateString('en-US', { month: 'long' }))}</h2>
    ${evs.length ? `<ul class="cal-rows">${evs.map((ev) => `<li class="cal-row c-${esc(ev.cat)}"><span class="cal-when">${esc(when(ev))}</span>
      <span class="cal-what">${esc(ev.title)}${extra(ev) ? `<small>${esc(extra(ev))}</small>` : ''}</span></li>`).join('')}</ul>`
      : '<p class="meta">Nothing listed this month.</p>'}</section>`;
}

function draw() {
  app.innerHTML = comingUp() + filters() + month() + dayPanel() + monthList();
}

app.addEventListener('click', (e) => {
  const f = e.target.closest('.cal-f');
  if (f) { const c = f.dataset.cat; on.has(c) ? on.delete(c) : on.add(c); draw(); return; }
  const g = e.target.closest('[data-go]');
  if (g) {
    const step = +g.dataset.go;
    if (step === 0) { const t = new Date(); shown = new Date(t.getFullYear(), t.getMonth(), 1); openDay = today; }
    else { shown = new Date(shown.getFullYear(), shown.getMonth() + step, 1); openDay = null; }
    draw(); return;
  }
  const d = e.target.closest('[data-day]');
  if (d) {
    openDay = openDay === d.dataset.day ? null : d.dataset.day;
    const dd = parse(d.dataset.day);
    if (dd.getMonth() !== shown.getMonth()) shown = new Date(dd.getFullYear(), dd.getMonth(), 1);
    draw();
    $('.cal-dayview')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
});

$('#cal-list').hidden = true;     // the script's views replace the plain list
openDay = byDay.has(today) ? today : null;
draw();
