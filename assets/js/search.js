// Site-wide search. One index (data/search.json, built by tools/build.py) holds
// every class, teacher, club, team, room and page; approved student writing is
// added live, so "bathroom pass" finds the School info article that mentions it.
//
// Matching is forgiving on purpose: shortcuts ("apush", "calc"), titles
// ("Ms. Dutton"), plurals and one-letter typos ("chemestry") all still work.

import { dataUrl, esc, root } from './ui.js';

const TYPES = {
  c: ['Class', 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5'],
  t: ['Teacher', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'],
  club: ['Club', 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z'],
  sport: ['Sport', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9.5c5 1 12 1 17 0M3.5 14.5c5-1 12-1 17 0'],
  room: ['Room', 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  page: ['Page', 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6'],
  post: ['Written by students', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
};
const ORDER = ['c', 't', 'room', 'club', 'sport', 'page', 'post'];

// Shortcuts students actually type → what the catalog calls it
const ALIASES = {
  apush: 'ap us history', apwh: 'ap world history', apeuro: 'ap european history', apgov: 'ap us government',
  apes: 'ap environmental science', apcsa: 'ap computer science a', apcsp: 'ap computer science principles',
  csa: 'computer science a', csp: 'computer science principles', calc: 'calculus', precalc: 'precalculus',
  chem: 'chemistry', bio: 'biology', physio: 'physiology', anat: 'anatomy', econ: 'economics',
  macro: 'macroeconomics', gov: 'government', lit: 'literature', lang: 'language', stats: 'statistics',
  psych: 'psychology', pe: 'physical education', phys: 'physics', eng: 'english', hist: 'history',
  alg: 'algebra', geo: 'geometry', trig: 'trigonometry', span: 'spanish', jpn: 'japanese',
  compsci: 'computer science', cs: 'computer science', erwc: 'expository reading writing',
  lunch: 'lunch menu', breakfast: 'breakfast menu', food: 'menu', cafe: 'cafeteria', gym: 'gym',
  hw: 'homework', counselor: 'counselor', counseling: 'counselor',
};
const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'is', 'are', 'what', 'whats', 'where', 'wheres', 'when', 'who',
  'how', 'to', 'in', 'at', 'on', 'and', 'do', 'does', 'i', 'my', 'mr', 'ms', 'mrs', 'miss', 'dr', 'teacher', 'class',
  'find', 'show', 'me', 'about', 'with', 'wilcox']);

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const stem = (w) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y'
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

function editDistanceAtMost(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// Query → list of terms; each term is a list of alternatives that all count
function parse(q) {
  const raw = norm(q).split(' ').filter(Boolean);
  const terms = [];
  for (const w of raw) {
    if (STOP.has(w) && raw.length > 1) continue;
    const alias = ALIASES[w];
    if (alias) alias.split(' ').forEach((x) => terms.push([x]));
    else terms.push([w, stem(w)].filter((x, i, a) => a.indexOf(x) === i));
  }
  return terms;
}

let index = null;
let live = [];
async function load() {
  index ??= fetch(dataUrl('data/search.json')).then((r) => r.json()).then((list) => list.map((x) => ({
    ...x, _n: norm(x.n), _nw: norm(x.n).split(' '), _k: norm(`${x.d} ${x.k}`), _kw: norm(`${x.d} ${x.k}`).split(' '),
  })));
  return index;
}

// Approved student writing, fetched once per page view
export async function addLive(store) {
  try {
    const subs = await store.approved();
    const courseNames = Object.fromEntries((await load()).filter((x) => x.t === 'c').map((x) => [x.u, x.n]));
    live = subs.map((x) => {
      const p = x.payload || {};
      const text = Object.values(p).filter((v) => typeof v === 'string').join(' ');
      let n, u, d;
      if (x.kind === 'school_info') { n = p.title || 'School info'; u = 'school/'; d = `School info · ${p.topic || ''}`; }
      else if (x.kind === 'club' || x.kind === 'sport') return null;   // folded into their cards below
      else if (x.course_slug) {
        u = `courses/${x.course_slug}/`;
        n = courseNames[u] || x.course_slug;
        d = { tip: 'Tip', resource: `Resource: ${p.title || ''}`, summer_hw: 'Summer homework', course_overview: 'Student overview',
              teacher_section: `${x.teacher || 'Teacher'} section` }[x.kind] || 'Student writing';
      } else return null;
      return { t: 'post', n, u, d, k: text, _n: norm(n), _nw: norm(n).split(' '), _k: norm(`${d} ${text}`), _kw: norm(`${d} ${text}`).split(' '), snippet: text };
    }).filter(Boolean);
    // club / team details students wrote make those cards findable by their contents
    for (const x of subs.filter((y) => y.kind === 'club' || y.kind === 'sport')) {
      const card = (await load()).find((y) => y.t === x.kind && y._n === norm(x.payload?.name));
      if (card) { const extra = norm(Object.values(x.payload || {}).join(' ')); card._k += ' ' + extra; card._kw = card._k.split(' '); }
    }
  } catch { /* search still works on the static index */ }
}

function scoreOne(x, terms) {
  let total = 0;
  for (const alts of terms) {
    let best = 0;
    for (const w of alts) {
      if (x._nw.includes(w)) best = Math.max(best, 10);
      else if (x._nw.some((y) => y.startsWith(w))) best = Math.max(best, w.length >= 2 ? 7 : 3);
      else if (w.length >= 3 && x._n.includes(w)) best = Math.max(best, 5);
      else if (x._kw.includes(w)) best = Math.max(best, 4);
      else if (w.length >= 3 && x._kw.some((y) => y.startsWith(w))) best = Math.max(best, 3);
      else if (w.length >= 4) {
        const max = w.length >= 7 ? 2 : 1;
        if (x._nw.some((y) => editDistanceAtMost(w, y, max))) best = Math.max(best, 4);
        else if (x._kw.some((y) => y.length > 3 && editDistanceAtMost(w, y, max))) best = Math.max(best, 1.5);
      }
    }
    if (!best) return 0;             // every word must match something
    total += best;
  }
  return total;
}

export async function search(q, limit = 40) {
  const list = [...(await load()), ...live];
  const terms = parse(q);
  if (!terms.length) return [];
  const nq = norm(q);
  // the whole query as a phrase, after shortcuts ("apush" → "ap us history")
  const phrase = norm(q).split(' ').map((w) => ALIASES[w] || w).join(' ');
  const roomLike = /^[a-z]\s?\d{3}[a-z]?$/.test(nq) ? nq.replace(' ', '') : null;
  const hits = [];
  for (const x of list) {
    let sc = scoreOne(x, terms);
    if (!sc) continue;
    if (x._n === nq) sc += 30;                                   // exact name
    else if (x._n.startsWith(nq)) sc += 12;
    if (phrase.includes(' ')) {
      if (x._n.includes(phrase)) sc += 20;
      else if (x._k.includes(phrase)) sc += 8;
    }
    if (roomLike && x.t === 'room' && x.u.toLowerCase().endsWith('#' + roomLike)) sc += 50;
    if (x.t === 'post') sc -= 2;                                 // prefer the thing itself over mentions
    hits.push({ x, sc });
  }
  hits.sort((a, b) => b.sc - a.sc || a.x.n.length - b.x.n.length);
  // one "post" hit per page is enough
  const seen = new Set();
  return hits.filter(({ x }) => (x.t !== 'post' ? true : !seen.has(x.u) && seen.add(x.u))).slice(0, limit).map((h) => h.x);
}

const icon = (t) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${TYPES[t][1]}"/></svg>`;

function snippet(x, q) {
  if (x.t !== 'post' || !x.snippet) return esc(x.d);
  const words = parse(q).flat();
  const text = x.snippet.replace(/\s+/g, ' ');
  const i = words.map((w) => text.toLowerCase().indexOf(w)).filter((n) => n >= 0).sort((a, b) => a - b)[0] ?? 0;
  const part = text.slice(Math.max(0, i - 40), i + 80);
  return `${esc(x.d)} · “${i > 40 ? '…' : ''}${esc(part)}${i + 80 < text.length ? '…' : ''}”`;
}

export const resultHtml = (x, q, active = false) => `<a class="result${active ? ' active' : ''}" href="${root}${esc(x.u)}" role="option">
  <span class="r-icon t-${x.t}">${icon(x.t)}</span>
  <span class="r-main"><b>${esc(x.n)}</b><span class="meta">${snippet(x, q)}</span></span>
  <span class="r-type">${TYPES[x.t][0]}</span></a>`;

// Grouped list for the search page
export function groupedHtml(results, q) {
  const by = {};
  for (const x of results) (by[x.t] ??= []).push(x);
  return ORDER.filter((t) => by[t]).map((t) => `<section class="r-group"><h2 class="label-h">${TYPES[t][0]}${t === 'post' ? '' : 's'} <span class="meta">${by[t].length}</span></h2>
    ${by[t].map((x) => resultHtml(x, q)).join('')}</section>`).join('');
}

// Live suggestions under a text box: arrows move, Enter opens, Esc closes
export function attach(input, box, { limit = 8, seeAll = true } = {}) {
  let results = [];
  let active = -1;
  let seq = 0;
  const paint = () => {
    const q = input.value.trim();
    box.hidden = !q;
    if (!q) return;
    box.innerHTML = results.length
      ? results.map((x, i) => resultHtml(x, q, i === active)).join('')
        + (seeAll ? `<a class="result see-all" href="${root}search/?q=${encodeURIComponent(q)}">See all results for “${esc(q)}” →</a>` : '')
      : `<div class="empty">No matches for “${esc(q)}”. <a href="${root}search/?q=${encodeURIComponent(q)}">Search again</a></div>`;
  };
  input.addEventListener('input', async () => {
    const my = ++seq;
    const r = await search(input.value, limit);
    if (my !== seq) return;          // a newer keystroke already answered
    results = r; active = -1; paint();
  });
  input.addEventListener('keydown', (e) => {
    if (box.hidden || !results.length) return;
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, results.length - 1); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, -1); paint(); e.preventDefault(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); location.href = root + results[active].u; }
    else if (e.key === 'Escape') { box.hidden = true; }
  });
  input.addEventListener('focus', () => { if (input.value.trim()) box.hidden = false; });
  document.addEventListener('click', (e) => { if (!box.contains(e.target) && e.target !== input) box.hidden = true; });
}
