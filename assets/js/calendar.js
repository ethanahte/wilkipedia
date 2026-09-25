// The Calendar page: the school year at a glance. A "Coming up" strip, a month
// view (no-school days shaded, today ringed, each event a coloured chip), and
// filters by kind of event. Click a day to see everything on it.
//
// Where events come from, in layers:
//   data/calendar.json        Wilcox's official activities calendar (tools/school_calendar.py)
//   data/calendar-extra.json  other groups' own calendars (e.g. the Class of 2027's
//                             homecoming schedule), each event tagged with its source
//   calendar_events table     admins' changes, made right here: new events, and
//                             edits or hides of file events (by their `id`)
// The full file list is also in the page's HTML (#cal-list) for anyone without JS.

import { initHeader, dataUrl, esc, $, toast } from './ui.js';

const s = await initHeader();
const [cal, extra] = await Promise.all([
  fetch(dataUrl('data/calendar.json')).then((r) => r.json()),
  fetch(dataUrl('data/calendar-extra.json')).then((r) => r.json()).catch(() => ({ sources: {}, events: [] })),
]);
const app = $('#cal-app');

const ORDER = ['off', 'milestone', 'tests', 'spirit', 'arts', 'family', 'sports', 'school', 'schedule'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = iso(new Date());
const SOURCES = { official: { label: 'Official', from: 'Wilcox’s official activities calendar', url: cal.source },
  site: { label: 'Wilkipedia', from: 'Added by a Wilkipedia admin' }, ...extra.sources };

// ── merge the layers ──
let edits = [];
let events = [], byDay = new Map();
let isAdmin = false;
async function loadEdits() {
  try { edits = await s.calendarEdits(); } catch { edits = []; }   // (before migration 011 the table isn't there: files only)
}
function merge() {
  const rows = new Map(edits.filter((r) => r.replaces).map((r) => [r.replaces, r]));
  const out = [];
  for (const ev of [...cal.events.map((e) => ({ ...e, src: 'official' })), ...extra.events]) {
    const r = rows.get(ev.id);
    if (!r) { out.push(ev); continue; }
    out.push({ ...ev, start: r.start_on || ev.start, end: r.end_on || r.start_on || ev.end, title: r.title || ev.title,
      time: r.time_note ?? ev.time, where: r.place ?? ev.where, cat: r.cat || ev.cat, hidden: r.hidden, rowId: r.id,
      edited: [r.start_on, r.end_on, r.title, r.time_note, r.place, r.cat].some((x) => x != null) });
  }
  for (const r of edits.filter((x) => !x.replaces)) {
    out.push({ id: `db-${r.id}`, rowId: r.id, start: r.start_on, end: r.end_on || r.start_on, title: r.title,
      time: r.time_note || '', where: r.place || '', cat: r.cat, src: 'site', hidden: r.hidden });
  }
  out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : (a.cat !== 'off') - (b.cat !== 'off')));
  events = out;
  byDay = new Map();
  for (const ev of events) {
    for (let d = parse(ev.start); iso(d) <= ev.end; d.setDate(d.getDate() + 1)) {
      const k = iso(d);
      (byDay.get(k) || byDay.set(k, []).get(k)).push(ev);
    }
  }
}
await loadEdits();
merge();
const first = parse(events[0].start), last = parse(events.reduce((m, e) => (e.end > m ? e.end : m), events[0].end));

// state: which month is shown, which kinds are on, which day is open
let shown = new Date();
if (shown < first || shown > last) shown = new Date(first);
shown = new Date(shown.getFullYear(), shown.getMonth(), 1);
const on = new Set(ORDER);
let openDay = null;

const fmtDay = (s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => parse(s).toLocaleDateString('en-US', opts);
const when = (ev) => (ev.start === ev.end ? fmtDay(ev.start) : `${fmtDay(ev.start)} – ${fmtDay(ev.end)}`);
const extraLine = (ev) => [ev.time, ev.where].filter(Boolean).join(' · ');
const visible = (ev) => on.has(ev.cat) && !ev.hidden;
const tag = (ev) => {
  if (ev.src === 'official') return '';
  const src = SOURCES[ev.src] || {};
  return `<span class="cal-src-tag" title="${esc(src.from || '')}">${esc(src.label || ev.src)}</span>`;
};

function comingUp() {
  // the next few things that matter most: breaks, milestones, tests, big official events
  const big = new Set(['off', 'milestone', 'tests', 'spirit', 'arts']);
  const list = events.filter((ev) => ev.end >= today && big.has(ev.cat) && visible(ev) && ev.src !== 'c2027').slice(0, 5);
  if (!list.length) return '';
  return `<section class="cal-next" aria-label="Coming up"><h2>Coming up</h2><ol>${list.map((ev) => {
    const days = Math.round((parse(ev.start) - parse(today)) / 864e5);
    const rel = days <= 0 ? 'Now' : days === 1 ? 'Tomorrow' : days < 14 ? `In ${days} days` : fmtDay(ev.start, { month: 'short', day: 'numeric' });
    return `<li class="c-${esc(ev.cat)}"><span class="cal-rel">${esc(rel)}</span><b>${esc(ev.title)}</b><small>${esc(when(ev))}</small></li>`;
  }).join('')}</ol></section>`;
}

function filters() {
  const counts = {};
  for (const ev of events) counts[ev.cat] = (counts[ev.cat] || 0) + 1;
  return `<div class="cal-filters" role="group" aria-label="Show">${ORDER.filter((c) => counts[c]).map((c) =>
    `<button type="button" class="chip cal-f c-${c}" data-cat="${c}" aria-pressed="${on.has(c)}"><i></i>${esc(cal.labels[c])}</button>`).join('')}
    ${isAdmin ? '<button type="button" class="btn small cal-add" data-act="new">＋ Add event</button>' : ''}</div>`;
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
    const k = iso(d), all = byDay.get(k) || [], evs = all.filter(visible);
    const off = all.some((ev) => ev.cat === 'off' && !ev.hidden);
    const cls = ['cal-day', d.getMonth() !== m && 'out', k === today && 'today', off && 'off', openDay === k && 'open', evs.length && 'has']
      .filter(Boolean).join(' ');
    cells += `<button type="button" class="${cls}" data-day="${k}" aria-label="${esc(fmtDay(k, { weekday: 'long', month: 'long', day: 'numeric' }))}${evs.length ? `, ${evs.length} event${evs.length > 1 ? 's' : ''}` : ''}">
      <span class="cal-n">${d.getDate()}</span>
      <span class="cal-chips">${evs.slice(0, 3).map((ev) => `<span class="cal-chip c-${esc(ev.cat)}${ev.src !== 'official' ? ' other' : ''}">${esc(ev.title)}</span>`).join('')}
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

function adminActions(ev) {
  if (!isAdmin) return '';
  const b = (act, label) => `<button type="button" class="linkish" data-act="${act}" data-id="${esc(ev.id)}">${label}</button>`;
  if (ev.hidden) return `<span class="cal-admin"><span class="cal-flag">Hidden</span>${b('restore', 'Show again')}</span>`;
  return `<span class="cal-admin">${ev.edited ? '<span class="cal-flag">Edited</span>' : ''}${b('edit', 'Edit')}
    ${ev.src === 'site' ? b('delete', 'Delete') : b('hide', 'Hide')}${ev.edited ? b('undo', 'Undo edits') : ''}</span>`;
}

function dayPanel() {
  if (!openDay) return '';
  const evs = (byDay.get(openDay) || []).filter((ev) => on.has(ev.cat) && (!ev.hidden || isAdmin));
  return `<section class="cal-dayview" aria-live="polite"><div class="cal-dayhead"><h3>${esc(fmtDay(openDay, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3>
    ${isAdmin ? `<button type="button" class="btn ghost small" data-act="new" data-on="${openDay}">＋ Add on this day</button>` : ''}</div>
    ${evs.length ? `<ul>${evs.map((ev) => `<li class="c-${esc(ev.cat)}${ev.hidden ? ' is-hidden' : ''}"><i></i><div><b>${esc(ev.title)}</b>${extraLine(ev) ? `<small>${esc(extraLine(ev))}</small>` : ''}
      ${ev.start !== ev.end ? `<small>${esc(when(ev))}</small>` : ''}<span class="cal-kind">${esc(cal.labels[ev.cat])}</span>${tag(ev)}
      ${SOURCES[ev.src]?.url && ev.src !== 'official' ? `<a class="cal-from" href="${esc(SOURCES[ev.src].url)}" target="_blank" rel="noopener">From ${esc(SOURCES[ev.src].from)}</a>` : ''}
      ${adminActions(ev)}</div></li>`).join('')}</ul>`
      : '<p class="meta">Nothing on the calendar this day.</p>'}</section>`;
}

function monthList() {
  // everything in the shown month, as a list (what the grid is too small to spell out)
  const y = shown.getFullYear(), m = shown.getMonth();
  const key = `${y}-${pad(m + 1)}`;
  const evs = events.filter((ev) => visible(ev) && (ev.start.startsWith(key) || (ev.start < `${key}-01` && ev.end >= `${key}-01`)));
  return `<section class="cal-month-list"><h2>All of ${esc(shown.toLocaleDateString('en-US', { month: 'long' }))}</h2>
    ${evs.length ? `<ul class="cal-rows">${evs.map((ev) => `<li class="cal-row c-${esc(ev.cat)}"><span class="cal-when">${esc(when(ev))}</span>
      <span class="cal-what">${esc(ev.title)} ${tag(ev)}${extraLine(ev) ? `<small>${esc(extraLine(ev))}</small>` : ''}</span></li>`).join('')}</ul>`
      : '<p class="meta">Nothing listed this month.</p>'}</section>`;
}

function draw() {
  app.innerHTML = comingUp() + filters() + month() + dayPanel() + monthList();
  refreshIcs();
}

// ── "Add to my calendar": built here from what's shown, so it includes admins' edits ──
let icsUrl = null;
function refreshIcs() {
  const link = document.querySelector('.cal-ics');
  if (!link) return;
  const escI = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const ymd = (s) => s.replace(/-/g, '');
  const after = (s) => { const d = parse(s); d.setDate(d.getDate() + 1); return iso(d).replace(/-/g, ''); };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wilkipedia//Wilcox calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:Wilcox ${cal.year} (Wilkipedia)`];
  for (const ev of events.filter((e) => !e.hidden)) {
    const note = [ev.time, ev.where, cal.labels[ev.cat], SOURCES[ev.src]?.from].filter(Boolean).join(' · ');
    lines.push('BEGIN:VEVENT', `UID:${ev.id}@wilcoxwiki.org`, 'DTSTAMP:20260101T000000Z', `DTSTART;VALUE=DATE:${ymd(ev.start)}`,
      `DTEND;VALUE=DATE:${after(ev.end)}`, `SUMMARY:${escI(ev.title)}`, `DESCRIPTION:${escI(note)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  if (icsUrl) URL.revokeObjectURL(icsUrl);
  icsUrl = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar' }));
  link.href = icsUrl;
}

// ── the admin editor ──
const dlg = document.createElement('dialog');
dlg.className = 'cal-editor';
document.body.append(dlg);
function openEditor(ev, onDay) {
  const v = ev || { start: onDay || today, end: onDay || today, title: '', time: '', where: '', cat: 'school' };
  dlg.innerHTML = `<form method="dialog" class="cal-form">
    <h2>${ev ? 'Edit event' : 'Add an event'}</h2>
    ${ev && ev.src !== 'site' ? `<p class="meta">This event comes from ${esc(SOURCES[ev.src]?.from || 'a calendar file')}. Your changes show on Wilkipedia; the source stays as it is.</p>` : ''}
    <label>Title<input name="title" required minlength="2" maxlength="140" value="${esc(v.title)}"></label>
    <div class="cal-form-row"><label>Starts<input type="date" name="start" required value="${esc(v.start)}"></label>
      <label>Ends<input type="date" name="end" required value="${esc(v.end)}"></label></div>
    <div class="cal-form-row"><label>Time <small>(optional)</small><input name="time" maxlength="60" placeholder="e.g. 6 – 8 pm, Lunch" value="${esc(v.time)}"></label>
      <label>Where <small>(optional)</small><input name="where" maxlength="80" placeholder="e.g. Main Gym" value="${esc(v.where)}"></label></div>
    <label>Kind<select name="cat">${ORDER.map((c) => `<option value="${c}"${c === v.cat ? ' selected' : ''}>${esc(cal.labels[c])}</option>`).join('')}</select></label>
    <div class="cal-form-actions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn">Save</button></div>
  </form>`;
  const form = $('form', dlg);
  $('[data-close]', dlg).onclick = () => dlg.close();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (f.end < f.start) { toast('The end date is before the start date.', 'bad'); return; }
    const row = { start_on: f.start, end_on: f.end, title: f.title.trim(), time_note: f.time.trim() || null, place: f.where.trim() || null, cat: f.cat, hidden: false };
    if (ev?.rowId) row.id = ev.rowId;
    if (ev && ev.src !== 'site') row.replaces = ev.id;
    await act(() => s.saveCalendarEvent(row), ev ? 'Saved.' : 'Added to the calendar.');
    dlg.close();
    openDay = f.start;
    shown = new Date(parse(f.start).getFullYear(), parse(f.start).getMonth(), 1);
    draw();
  };
  dlg.showModal();
  $('input[name=title]', dlg).focus();
}
async function act(fn, msg) {
  try { await fn(); await loadEdits(); merge(); toast(msg); }
  catch (err) { toast(/calendar_events|relation|schema cache/.test(err.message) ? 'Calendar editing needs migration 011 run in Supabase first.' : err.message, 'bad'); throw err; }
}
const find = (id) => events.find((e) => e.id === id);

app.addEventListener('click', async (e) => {
  const f = e.target.closest('.cal-f');
  if (f) { const c = f.dataset.cat; on.has(c) ? on.delete(c) : on.add(c); draw(); return; }
  const a = e.target.closest('[data-act]');
  if (a) {
    const ev = a.dataset.id ? find(a.dataset.id) : null;
    const run = (fn, msg) => act(fn, msg).then(draw).catch(() => {});
    if (a.dataset.act === 'new') openEditor(null, a.dataset.on);
    else if (a.dataset.act === 'edit') openEditor(ev);
    else if (a.dataset.act === 'hide') run(() => s.saveCalendarEvent({ ...(ev.rowId ? { id: ev.rowId } : {}), replaces: ev.id, hidden: true }), 'Hidden from the calendar.');
    else if (a.dataset.act === 'restore') {
      // a plain hide just goes away; a hide on top of edits keeps the edits
      run(() => (ev.src !== 'site' && !ev.edited ? s.deleteCalendarEvent(ev.rowId)
        : s.saveCalendarEvent({ id: ev.rowId, ...(ev.src !== 'site' ? { replaces: ev.id } : {}), hidden: false })), 'Back on the calendar.');
    }
    else if (a.dataset.act === 'undo') run(() => s.deleteCalendarEvent(ev.rowId), 'Back to the original.');
    else if (a.dataset.act === 'delete' && confirm(`Delete “${ev.title}” from the calendar?`)) run(() => s.deleteCalendarEvent(ev.rowId), 'Deleted.');
    return;
  }
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
const paint = (u) => { isAdmin = u?.role === 'admin'; draw(); };
paint(s.user());
s.onAuth?.(async (u) => { await loadEdits(); merge(); paint(u); });
