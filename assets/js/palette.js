// The search palette: ⌘K / Ctrl+K anywhere (or "/" when you're not typing).
// One box for everything the site knows (search.js), arrow keys to move, Enter
// to go, and a peek pane on wide screens that previews the highlighted class
// without leaving the page. Empty, it offers your recently opened classes and
// the pages people jump to most.

import { $, esc, root, courses, dataUrl, lessMotion } from './ui.js';
import { search, addLive, resultHtml } from './search.js';

const RECENT = 'wilkipedia-recent-classes';
export function rememberClass(slug, name) {
  try {
    const list = (JSON.parse(localStorage.getItem(RECENT)) || []).filter((x) => x.slug !== slug);
    localStorage.setItem(RECENT, JSON.stringify([{ slug, name }, ...list].slice(0, 5)));
  } catch { /* storage blocked */ }
}
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT)) || []; } catch { return []; } };

const JUMPS = [['subjects/', 'All classes', 'Every class, by subject'], ['map/', 'Campus map', 'Find a room'],
  ['bell/', 'Bell schedule', 'Today’s periods'], ['menu/', 'Cafeteria menu', 'This week’s lunch'],
  ['summer/', 'Summer homework', 'What’s due before school'], ['settings/', 'Settings', 'Theme, text size, language']];

let el, input, list, peek, store, results = [], active = 0, seq = 0, lastFocus = null;
let courseData, pathways, hasInfo = new Set();

function build() {
  el = document.createElement('div');
  el.className = 'palette';
  el.hidden = true;
  el.innerHTML = `<div class="pal-card" role="dialog" aria-modal="true" aria-label="Search Wilkipedia">
      <div class="pal-top"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" placeholder="Search classes, teachers, rooms, clubs…" aria-label="Search" autocomplete="off" spellcheck="false">
        <kbd>esc</kbd></div>
      <div class="pal-body"><div class="pal-list" role="listbox"></div><aside class="pal-peek" aria-live="polite"></aside></div>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
    </div>`;
  document.body.append(el);
  input = $('input', el); list = $('.pal-list', el); peek = $('.pal-peek', el);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items().length) % Math.max(1, items().length);
      paintActive();
    } else if (e.key === 'Enter') {
      const a = items()[active];
      if (a) { e.preventDefault(); a.click(); }
    } else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('pointermove', (e) => {
    const a = e.target.closest('a'); if (!a) return;
    const i = items().indexOf(a);
    if (i >= 0 && i !== active) { active = i; paintActive(false); }
  });
}
const items = () => [...list.querySelectorAll('a')];

function paintActive(scroll = true) {
  items().forEach((a, i) => a.classList.toggle('active', i === active));
  const a = items()[active];
  if (a && scroll) a.scrollIntoView({ block: 'nearest' });
  paintPeek(a?.dataset.slug);
}

async function run() {
  const q = input.value.trim();
  const my = ++seq;
  if (!q) {
    const r = recent();
    list.innerHTML = (r.length ? `<div class="pal-h">Recently opened</div>${r.map((x) =>
      `<a class="result" href="${root}courses/${esc(x.slug)}/" data-slug="${esc(x.slug)}"><span class="r-main"><b>${esc(x.name)}</b></span><span class="r-type">Class</span></a>`).join('')}` : '')
      + `<div class="pal-h">Jump to</div>${JUMPS.map(([u, n, d]) =>
        `<a class="result" href="${root}${u}"><span class="r-main"><b>${n}</b><span class="meta">${d}</span></span></a>`).join('')}`;
    active = 0; paintActive(false); return;
  }
  const r = await search(q, 12);
  if (my !== seq) return;                    // a newer keystroke already answered
  results = r;
  list.innerHTML = r.length ? r.map((x) => resultHtml(x, q).replace('<a class="result', `<a data-slug="${x.t === 'c' ? esc(x.u.split('/')[1]) : ''}" class="result`)).join('')
    + `<a class="result see-all" href="${root}search/?q=${encodeURIComponent(q)}">See all results for “${esc(q)}” →</a>`
    : `<div class="empty">No matches for “${esc(q)}”.</div>`;
  active = 0; paintActive(false);
}

// The peek pane: what a class is, before you open it
function paintPeek(slug) {
  if (!peek || !courseData) return;
  const c = slug && courseData.bySlug[slug];
  if (!c) { peek.innerHTML = '<p class="pal-peek-hint">Highlight a class to preview it here.</p>'; return; }
  const dept = courseData.dept[c.department] || '';
  const leads = (pathways?.out[slug] || []).map((s) => courseData.bySlug[s]?.name).filter(Boolean);
  const needs = pathways?.prereq[slug];
  peek.innerHTML = `<div class="pal-peek-in">
    <div class="meta">${esc(dept)}</div>
    <h3>${esc(c.name)}</h3>
    <dl>${c.grades ? `<div><dt>Grades</dt><dd>${esc(c.grades)}</dd></div>` : ''}${c.ucCsu ? `<div><dt>UC/CSU a–g</dt><dd>${esc(c.ucCsu)}</dd></div>` : ''}
      ${c.teachers?.length ? `<div><dt>Teachers</dt><dd>${c.teachers.slice(0, 4).map(esc).join(', ')}${c.teachers.length > 4 ? ` +${c.teachers.length - 4}` : ''}</dd></div>` : ''}
      ${needs ? `<div><dt>Needs</dt><dd>“${esc(needs)}”</dd></div>` : ''}
      ${leads.length ? `<div><dt>Leads to</dt><dd>${leads.map(esc).join(', ')}</dd></div>` : ''}</dl>
    <p class="pal-status ${hasInfo.has(slug) ? 'yes' : ''}">${hasInfo.has(slug) ? 'Students have written about this class.' : 'Nobody has written about it yet.'}</p></div>`;
}

async function prime() {
  if (courseData) return;
  const [data, pw] = await Promise.all([courses(), fetch(dataUrl('data/pathways.json')).then((r) => r.json()).catch(() => null)]);
  courseData = { bySlug: Object.fromEntries(data.courses.map((c) => [c.slug, c])),
                 dept: Object.fromEntries(data.departments.map((d) => [d.slug, d.name])) };
  if (pw) {
    const out = {};
    for (const e of pw.edges) (out[e.from] ||= []).push(e.to);
    pathways = { out, prereq: Object.fromEntries(pw.nodes.filter((n) => n.prereq && !/^none\.?$/i.test(n.prereq.trim())).map((n) => [n.slug, n.prereq])) };
  }
  store?.contentIndex?.().then((h) => { hasInfo = h; paintActive(false); }).catch(() => {});
  addLive(store);
}

export function open(q = '') {
  if (!el) build();
  lastFocus = document.activeElement;
  el.hidden = false;
  el.classList.toggle('calm', lessMotion());
  requestAnimationFrame(() => el.classList.add('open'));
  document.documentElement.classList.add('pal-open');
  input.value = q;
  input.focus();
  prime().then(run);
  run();
}
export function close() {
  if (!el || el.hidden) return;
  el.classList.remove('open');
  document.documentElement.classList.remove('pal-open');
  el.hidden = true;
  lastFocus?.focus?.();
}

export function init(s) {
  store = s;
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); el && !el.hidden ? close() : open(); return; }
    if (e.key === '/' && !typing && !document.querySelector('[data-slash], .modal') && (!el || el.hidden)) { e.preventDefault(); open(); }
  });
}
