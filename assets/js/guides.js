// Study guides as a graph, modelled on Obsidian's graph view: a force layout
// drawn on a canvas, dark card, node size by links, titles that fade out as you
// zoom out (the "text fade threshold"), hover to light a node and its
// neighbours while the rest fades back, drag a node and its neighbours follow,
// scroll to zoom toward the cursor. Every dot is a real record: a study guide
// someone shared, or a class.
//
// How dots connect:
//   guide → its class      the class works like an Obsidian folder/tag hub
//   guide ↔ guide          they share meaningful words in their titles or
//                          "what it's good for" notes (see keywords())
//   class ↔ class          a prerequisite link from the course catalog
//                          (data/pathways.json, same as the home page map)
// Classes with no guides yet are dim, like Obsidian's unresolved notes.

import { initHeader, $, esc, courses, dataUrl, courseUrl, safeUrl, root, lessMotion } from './ui.js';

const s = await initHeader();
const OPTS_KEY = 'wilkipedia-graph';
const C = { bg: '#1e1e1e', node: '#a8a8a8', guide: '#dcddde', hub: '#dcddde', empty: '#4a4a4a', line: '#3f3f3f', accent: '#f5c400', text: '#dcddde' };

// Words that say nothing about the topic (so they never create a link)
const STOP = new Set(`a an the and or of for to in on at by with from into over under about as is are was were be been it its this that these those
  you your we our they their i me my he she his her them us all any each every both more most other some such no not only own same so than too very can will just
  also there here what which who whom when where why how do does did done doing have has had having make made makes using use used
  study guide guides notes note review reviews reviewing practice test tests quiz quizzes exam exams final finals midterm unit units chapter chapters ch sec section sections
  part parts sheet sheets packet answer answers key keys flashcard flashcards quizlet video videos lesson lessons class classes course ap honors semester
  worksheet worksheets summary outline prep complete full best good great help helps helpful covers cover covering includes including everything things thing
  interactive built slides slide warm warmups warm-ups problems problem example examples question questions hidden labeled textbook lecture lectures data set sets
  same numbers line up come comes which usually hardest facts one two three four five first second new way`.split(/\s+/));
const stem = (w) => w.replace(/ies$/, 'y').replace(/(?<=[a-z]{3})s$/, '');
function keywords(text) {
  const out = new Set();
  const t = String(text || '').toLowerCase();
  for (const m of t.matchAll(/\b(?:unit|chapter|ch|section|sec)\.?\s*(\d+[a-z]?)/g)) out.add(`#${m[1]}`);   // "Ch. 6", "Unit 2"
  for (const w of t.replace(/[’']/g, '').split(/[^a-z0-9]+/)) {
    if (w.length < 3 || /^\d/.test(w) || STOP.has(w)) continue;
    const st = stem(w);
    if (!STOP.has(st)) out.add(st);
  }
  return out;
}

const [data, pw, guides] = await Promise.all([courses(), fetch(dataUrl('data/pathways.json')).then((r) => r.json()).catch(() => ({ edges: [] })),
                                              s.approved({ kind: 'resource' }).catch(() => [])]);
const bySlug = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
const dept = Object.fromEntries(data.departments.map((d) => [d.slug, d.name]));

let opts = { orphans: true, prereq: true, words: true, labels: 1, size: 1, thick: 1, repel: 60, link: 40, gravity: .08 };
try { Object.assign(opts, JSON.parse(localStorage.getItem(OPTS_KEY)) || {}); } catch { /* storage blocked */ }
const save = () => { try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch { /* ignore */ } };

// ── build the graph ──
function graph(filter = '') {
  const q = filter.trim().toLowerCase();
  const G = guides.map((g) => ({ ...g, words: keywords(g.payload.title), note: keywords(g.payload.note),
                                 hit: !q || `${g.payload.title} ${g.payload.note || ''} ${bySlug[g.course_slug]?.name || ''}`.toLowerCase().includes(q) }));
  const withGuides = new Set(G.map((g) => g.course_slug));
  const prereqLinks = pw.edges.filter((e) => !e.kind && bySlug[e.from] && bySlug[e.to]);   // catalog prerequisites only, not the grade-order lines
  const linked = new Set(prereqLinks.flatMap((e) => [e.from, e.to]));
  const nodes = [], links = [], deg = {};
  const bump = (id) => { deg[id] = (deg[id] || 0) + 1; };

  // classes (hubs); classes without guides are "unresolved": dim, hollow
  for (const c of data.courses) {
    if (!withGuides.has(c.slug) && !(opts.orphans && linked.has(c.slug))) continue;
    nodes.push({ id: 'c:' + c.slug, kind: 'class', slug: c.slug, name: c.name, has: withGuides.has(c.slug),
                 hit: !q || c.name.toLowerCase().includes(q) });
  }
  const shown = new Set(nodes.map((n) => n.id));
  if (opts.prereq) for (const e of prereqLinks) {
    const a = 'c:' + e.from, b = 'c:' + e.to;
    if (shown.has(a) && shown.has(b)) { links.push({ source: a, target: b, kind: 'prereq' }); bump(a); bump(b); }
  }
  G.forEach((g, i) => {
    const id = 'g:' + i;
    nodes.push({ id, kind: 'guide', g, name: g.payload.title, hit: g.hit });
    links.push({ source: id, target: 'c:' + g.course_slug, kind: 'class' }); bump(id); bump('c:' + g.course_slug);
  });
  // guide ↔ guide: a shared title word counts 2, a shared note word 1; chapter
  // numbers ("#6") only count inside the same class
  if (opts.words) {
    const cand = [];
    for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
      const a = G[i], b = G[j], same = a.course_slug === b.course_slug, shared = new Set();
      let score = 0;
      for (const w of a.words) if (b.words.has(w) && (same || !w.startsWith('#'))) { score += 2; shared.add(w); }
      for (const w of a.note) if ((b.note.has(w) || b.words.has(w)) && !shared.has(w) && (same || !w.startsWith('#'))) { score += 1; shared.add(w); }
      for (const w of a.words) if (b.note.has(w) && !shared.has(w) && (same || !w.startsWith('#'))) { score += 1; shared.add(w); }
      if (score >= 2) cand.push({ i, j, score, shared: [...shared].map((w) => (w.startsWith('#') ? `unit/ch. ${w.slice(1)}` : w)) });
    }
    const per = {};
    cand.sort((x, y) => y.score - x.score).forEach((c) => {
      if ((per[c.i] || 0) >= 6 || (per[c.j] || 0) >= 6) return;            // keep it a web, not a hairball
      per[c.i] = (per[c.i] || 0) + 1; per[c.j] = (per[c.j] || 0) + 1;
      links.push({ source: 'g:' + c.i, target: 'g:' + c.j, kind: 'words', shared: c.shared, score: c.score });
      bump('g:' + c.i); bump('g:' + c.j);
    });
  }
  return { nodes, links, deg, G };
}

// ── the engine: a small force simulation drawn on a canvas ──
const box = $('#gv-chart');
const cv = document.createElement('canvas');
cv.className = 'gv-canvas';
box.append(cv);
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
const view = { x: 0, y: 0, k: 1 };                 // screen = world * k + centre + (x, y)
let N = [], L = [], byId = new Map(), nbr = new Map();
let alpha = 1, alphaTarget = 0, raf = 0, hover = null, fade = 0, current;
const still = lessMotion();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const toWorld = (sx, sy) => [(sx - W / 2 - view.x) / view.k, (sy - H / 2 - view.y) / view.k];

function radius(n) {
  const d = current.deg[n.id] || 0;
  return (n.kind === 'guide' ? 4.2 + Math.sqrt(d) * 1.9 : n.has ? 5 + Math.sqrt(d) * 1.7 : 2.6 + Math.sqrt(d) * 0.7) * opts.size;
}

// Rebuild the nodes, keeping where every surviving dot already is
function load(replay) {
  current = graph($('#gv-q').value);
  const old = byId;
  byId = new Map(); nbr = new Map();
  N = current.nodes.map((n, i) => {
    const was = !replay && old.get(n.id);
    const a = i * 2.39996, r = 14 * Math.sqrt(i + 1);              // a sunflower to start from
    const o = { ...n, x: was ? was.x : Math.cos(a) * r, y: was ? was.y : Math.sin(a) * r, vx: 0, vy: 0, fx: null, fy: null };
    byId.set(n.id, o); nbr.set(n.id, new Set([n.id]));
    return o;
  });
  L = current.links.map((l) => ({ ...l, a: byId.get(l.source), b: byId.get(l.target) })).filter((l) => l.a && l.b);
  for (const l of L) { nbr.get(l.a.id).add(l.b.id); nbr.get(l.b.id).add(l.a.id); }
  for (const n of N) n.r = radius(n);
  const guidesN = current.G.length, wordLinks = L.filter((l) => l.kind === 'words').length;
  $('#gv-count').textContent = `${guidesN} study guide${guidesN === 1 ? '' : 's'} · ${N.length - guidesN} classes · ${wordLinks} keyword link${wordLinks === 1 ? '' : 's'}`;
}

function tick() {
  const rep = opts.repel * 14, dist = opts.link * 1.3, grav = opts.gravity * 0.06;
  for (let i = 0; i < N.length; i++) {
    const a = N[i];
    for (let j = i + 1; j < N.length; j++) {                        // everything pushes everything apart
      const b = N[j];
      let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - .5; dy = Math.random() - .5; d2 = 1; }
      if (d2 > 90000) continue;
      const f = rep * alpha / d2, d = Math.sqrt(d2);
      a.vx -= dx / d * f; a.vy -= dy / d * f; b.vx += dx / d * f; b.vy += dy / d * f;
    }
    a.vx -= a.x * grav * alpha; a.vy -= a.y * grav * alpha;       // and the centre pulls gently
  }
  for (const l of L) {                                              // links act as springs
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const want = dist * (l.kind === 'class' ? .8 : 1.2), f = (d - want) / d * .09 * alpha;
    l.a.vx += dx * f; l.a.vy += dy * f; l.b.vx -= dx * f; l.b.vy -= dy * f;
  }
  for (const n of N) {
    if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; continue; }
    n.vx *= .6; n.vy *= .6; n.x += n.vx; n.y += n.vy;
  }
  alpha += (alphaTarget - alpha) * .025;
}

function fit() {
  if (!N.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of N) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  view.k = Math.min(2, Math.max(.2, Math.min((W - 60) / (x1 - x0 + 40), (H - 110) / (y1 - y0 + 40))));
  view.x = -(x0 + x1) / 2 * view.k; view.y = -(y0 + y1) / 2 * view.k + 10;
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(DPR * view.k, 0, 0, DPR * view.k, DPR * (W / 2 + view.x), DPR * (H / 2 + view.y));
  const k = view.k, near = hover ? nbr.get(hover.id) : null;
  // the rest of the graph fades back while one dot is pointed at
  const dim = (id) => (near && !near.has(id) ? 1 - .85 * fade : 1);
  for (const l of L) {
    const on = near && (l.a === hover || l.b === hover);
    ctx.globalAlpha = (on ? 1 : Math.min(dim(l.a.id), dim(l.b.id)) * (l.kind === 'prereq' ? .55 : .8)) * ((l.a.hit && l.b.hit) ? 1 : .2);
    ctx.strokeStyle = on ? C.accent : l.kind === 'words' ? '#6b6b6b' : C.line;
    ctx.lineWidth = ((on ? 1.6 : l.kind === 'words' ? .8 + l.score * .25 : .8) * opts.thick) / Math.max(.5, k);
    ctx.setLineDash(l.kind === 'prereq' ? [3 / k, 3 / k] : []);
    ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const n of N) {
    ctx.globalAlpha = dim(n.id) * (n.hit ? 1 : .15);
    ctx.fillStyle = n === hover ? C.accent : n.has === false ? C.empty : n.kind === 'guide' ? C.guide : C.node;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (n === hover ? 1 + .25 * fade : 1), 0, Math.PI * 2); ctx.fill();
  }
  // titles fade out as you zoom out (Obsidian's text fade threshold); the dot
  // you point at and its neighbours always keep theirs
  const t = opts.labels, base = smooth(t * .6, t, k), faint = smooth(t * 1.1, t * 1.7, k);   // classes with no guides need a closer look
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const n of N) {
    const focus = near?.has(n.id);
    let a = focus ? Math.max(base, fade) : (n.has === false ? faint * .7 : base) * dim(n.id);
    if (!n.hit) a *= .2;
    if (a < .02) continue;
    const size = n.kind === 'guide' ? 11 : 10;
    ctx.font = `${n === hover ? 600 : 400} ${size / Math.max(1, k * .9)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.globalAlpha = a;
    ctx.fillStyle = n === hover ? '#fff' : n.has === false ? '#8a8a8a' : C.text;
    const label = n.name.length > 34 ? n.name.slice(0, 32) + '…' : n.name;
    ctx.fillText(label, n.x, n.y + n.r + 3 / Math.max(.6, k));
  }
  ctx.globalAlpha = 1;
}

function frame() {
  raf = 0;
  const target = hover ? 1 : 0;
  fade = still ? target : fade + (target - fade) * .25;             // hover focus fades in fast
  if (alpha > .004 || alphaTarget > 0) tick();
  render();
  if (alpha > .004 || alphaTarget > 0 || Math.abs(fade - target) > .01) raf = requestAnimationFrame(frame);
}
const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

function size() {
  const r = box.getBoundingClientRect();
  DPR = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cv.style.width = `${W}px`; cv.style.height = `${H}px`;
  wake();
}

function draw(replay = false) {
  load(replay);
  alpha = 1;
  const warm = still ? 400 : replay ? 30 : 140;                     // settle most of the way first (less for Animate, to watch it settle)
  for (let i = 0; i < warm; i++) tick();
  fit();
  wake();
}

// pointing, dragging, zooming, pinching
function hit(sx, sy) {
  const [x, y] = toWorld(sx, sy);
  let best = null, bd = Infinity;
  for (const n of N) { const d = Math.hypot(n.x - x, n.y - y); if (d < n.r + 5 / view.k && d < bd) { bd = d; best = n; } }
  return best;
}
const pts = new Map();
let press = null, pinch = null;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k }; press = null; return; }
  const n = hit(e.offsetX, e.offsetY);
  press = { n, sx: e.offsetX, sy: e.offsetY, vx: view.x, vy: view.y, moved: false };
  if (n) { n.fx = n.x; n.fy = n.y; }
  cv.classList.add('grabbing');
});
cv.addEventListener('pointermove', (e) => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pinch && pts.size === 2) {
    const [a, b] = [...pts.values()];
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d / view.k);
    return;
  }
  if (press) {
    const dx = e.offsetX - press.sx, dy = e.offsetY - press.sy;
    if (Math.hypot(dx, dy) > 3) press.moved = true;
    if (press.n) { [press.n.fx, press.n.fy] = toWorld(e.offsetX, e.offsetY); alphaTarget = .25; alpha = Math.max(alpha, .25); }
    else { view.x = press.vx + dx; view.y = press.vy + dy; }
    wake();
    return;
  }
  const n = hit(e.offsetX, e.offsetY);
  if (n !== hover) { hover = n; cv.style.cursor = n ? 'pointer' : ''; wake(); }
});
const release = (e) => {
  pts.delete(e.pointerId);
  if (pts.size < 2) pinch = null;
  if (!press) return;
  if (press.n) { press.n.fx = press.n.fy = null; alphaTarget = 0; }
  if (!press.moved) info(press.n);
  press = null;
  cv.classList.remove('grabbing');
  wake();
};
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);
cv.addEventListener('pointerleave', () => { if (!press && hover) { hover = null; wake(); } });
function zoomAt(sx, sy, by) {
  const k = Math.min(6, Math.max(.12, view.k * by)), f = k / view.k;
  view.x = (view.x - (sx - W / 2)) * f + (sx - W / 2);
  view.y = (view.y - (sy - H / 2)) * f + (sy - H / 2);
  view.k = k;
  wake();
}
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018))); }, { passive: false });
cv.addEventListener('dblclick', (e) => {
  const n = hit(e.offsetX, e.offsetY);
  if (!n) return;
  const u = n.kind === 'guide' ? safeUrl(n.g.payload.url) : courseUrl(n.slug);
  if (u) window.open(u, n.kind === 'guide' ? '_blank' : '_self', 'noopener');
});

// Obsidian-style settings: Filters / Display / Forces, plus Animate
function panel() {
  const sl = (k, label, min, max, step) => `<label class="gv-sl"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${opts[k]}"></label>`;
  const tg = (k, label) => `<label class="gv-tg"><span>${label}</span><span class="tgl"><input type="checkbox" data-k="${k}" ${opts[k] ? 'checked' : ''}><span aria-hidden="true"></span></span></label>`;
  $('#gv-panel').innerHTML = `
    <details open><summary>Filters</summary>${tg('orphans', 'Classes without guides')}${tg('prereq', 'Prerequisite links')}${tg('words', 'Keyword links')}</details>
    <details><summary>Display</summary>${sl('labels', 'Text fade threshold', .4, 3, .1)}${sl('size', 'Node size', .5, 2, .1)}${sl('thick', 'Link thickness', .5, 3, .1)}</details>
    <details><summary>Forces</summary>${sl('gravity', 'Center force', 0, .4, .01)}${sl('repel', 'Repel force', 10, 200, 5)}${sl('link', 'Link distance', 10, 120, 5)}</details>
    <button type="button" class="gv-animate" id="gv-animate">Animate</button>`;
}

// Click: a card with the real thing behind the dot
function info(n) {
  const card = $('#gv-info');
  if (!n) { card.hidden = true; return; }
  if (n.kind === 'guide') {
    const g = n.g, u = safeUrl(g.payload.url), c = bySlug[g.course_slug];
    const near = current.links.filter((l) => l.kind === 'words' && (l.source === n.id || l.target === n.id))
      .map((l) => current.nodes.find((x) => x.id === (l.source === n.id ? l.target : l.source)));
    card.innerHTML = `<button type="button" class="gv-x" aria-label="Close">✕</button>
      <div class="gv-k">${esc(g.payload.type)}</div><h3>${esc(g.payload.title)}</h3>
      <p class="gv-m"><a href="${courseUrl(g.course_slug)}">${esc(c?.name || '')}</a>${g.teacher ? ` · ${esc(g.teacher)}’s class` : ''}</p>
      ${g.payload.note ? `<p>${esc(g.payload.note)}</p>` : ''}
      <p class="gv-m">${g.payload.author ? `Made by ${esc(g.payload.author)} · shared by ${esc(g.author)}` : `Made by ${esc(g.author)}`}</p>
      ${near.length ? `<p class="gv-m">Connected to: ${near.map((x) => esc(x.name)).join(' · ')}</p>` : ''}
      ${u ? `<a class="gv-open" href="${esc(u)}" target="_blank" rel="noopener nofollow">Open study guide ↗</a>` : ''}`;
  } else {
    const list = current.G.filter((g) => g.course_slug === n.slug);
    card.innerHTML = `<button type="button" class="gv-x" aria-label="Close">✕</button>
      <div class="gv-k">${esc(dept[bySlug[n.slug]?.department] || 'Class')}</div><h3>${esc(n.name)}</h3>
      <p class="gv-m">${list.length ? `${list.length} study guide${list.length === 1 ? '' : 's'}` : 'No study guides yet.'}</p>
      <a class="gv-open" href="${list.length ? courseUrl(n.slug) + '#s-resources' : `${root}submit/?course=${n.slug}&kind=resource`}">${list.length ? 'Open the class page →' : 'Share the first one →'}</a>`;
  }
  card.hidden = false;
}

// The accessible version: every guide, by class
function list() {
  const by = {};
  for (const g of guides) (by[g.course_slug] ||= []).push(g);
  $('#gv-list').innerHTML = Object.keys(by).length ? Object.entries(by).sort(([a], [b]) => (bySlug[a]?.name || '').localeCompare(bySlug[b]?.name || '')).map(([slug, gs]) => `
    <section class="gv-class"><h3><a href="${courseUrl(slug)}">${esc(bySlug[slug]?.name || slug)}</a></h3>
      ${gs.map((g) => { const u = safeUrl(g.payload.url); return `<a class="res-card" ${u ? `href="${esc(u)}" target="_blank" rel="noopener nofollow"` : ''}>
        <b>${esc(g.payload.title)}</b>${g.payload.note ? `<span class="note-line">${esc(g.payload.note.slice(0, 160))}${g.payload.note.length > 160 ? '…' : ''}</span>` : ''}
        <span class="meta">${esc(g.payload.author || g.author)}${g.teacher ? ` · ${esc(g.teacher)}’s class` : ''}</span>${u ? '<span class="arrow" aria-hidden="true">↗</span>' : ''}</a>`; }).join('')}
    </section>`).join('')
    : `<p class="empty-line">No study guides yet. Made one? <a class="add-link" href="${root}submit/?kind=resource">Share it →</a></p>`;
}

// ── wire up ──
list();
panel();
new ResizeObserver(size).observe(box);
size();
draw();
$('#gv-q').addEventListener('input', () => {        // search: dim what doesn't match, don't move anything
  const g = graph($('#gv-q').value), hits = new Map(g.nodes.map((n) => [n.id, n.hit]));
  for (const n of N) n.hit = hits.get(n.id) ?? true;
  wake();
});
$('#gv-gear').addEventListener('click', () => { const p = $('#gv-panel'); p.hidden = !p.hidden; $('#gv-gear').setAttribute('aria-expanded', String(!p.hidden)); });
$('#gv-panel').addEventListener('input', (e) => {
  const k = e.target.dataset.k; if (!k) return;
  opts[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
  save();
  if (e.target.type === 'checkbox') draw();                       // filters change what's on the graph
  else if (['repel', 'link', 'gravity'].includes(k)) { alpha = Math.max(alpha, .5); wake(); }   // forces: let it resettle
  else { for (const n of N) n.r = radius(n); wake(); }            // display: just redraw
});
$('#gv-panel').addEventListener('click', (e) => { if (e.target.id === 'gv-animate') draw(true); });
$('#gv-info').addEventListener('click', (e) => { if (e.target.closest('.gv-x')) info(null); });
