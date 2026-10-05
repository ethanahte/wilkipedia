// Study guides as a graph, modelled on Obsidian's graph view: a force layout
// drawn on a canvas, dark card, titles that fade out as you zoom out (the "text
// fade threshold"), hover to light a dot and its neighbours while the rest fades
// back, drag a dot and its neighbours follow, scroll to zoom toward the cursor.
//
// One kind of link only: hubs (Ethan). Three sizes of dot:
//   subject area (Math, English, Science…)  the biggest hubs
//   class (AP Biology, English 9…)          linked to its subject area
//   study guide or resource                 linked to every class it's for
// A guide shared across classes (payload.also) links to each, so it sits between them.
// Classes with no guides yet are dim, like Obsidian's unresolved notes.

import { initHeader, $, esc, courses, courseUrl, safeUrl, root, lessMotion } from './ui.js';
import { GUIDE } from './forms.js';

// Each kind of resource has its own colour (Ethan), from the Type the poster picked on the form.
// The legend's type chips show or hide that kind.
const TYPES = [
  ['guide', 'Study guide', '#f4efe2'],
  ['textbook', 'Textbook', '#b58cff'],
  ['practice', 'Practice problems', '#5fd4a6'],
  ['video', 'Video', '#ff8a7a'],
  ['website', 'Website', '#4fc7c7'],
  ['other', 'Other', '#9c948a'],
];
const TYPE = Object.fromEntries(TYPES.map(([k, label, color]) => [k, { label, color }]));
const typeOf = (g) => {
  const t = g.payload?.type || '';
  return t === GUIDE || g.payload?.pdf || /study guide/i.test(t) ? 'guide' : /textbook/i.test(t) ? 'textbook'
    : /practice/i.test(t) ? 'practice' : /video/i.test(t) ? 'video' : /website/i.test(t) ? 'website' : 'other';
};

const s = await initHeader();
const OPTS_KEY = 'wilkipedia-graph';
const C = { bg: '#1e1e1e', node: '#a8a8a8', guide: '#dcddde', subject: '#c9a227', ap: '#7aa7ff', empty: '#4a4a4a', line: '#3f3f3f', accent: '#f5c400', text: '#dcddde' };

const [data, guides] = await Promise.all([courses(), s.approved({ kind: 'resource' }).catch(() => [])]);
const bySlug = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
const dept = Object.fromEntries(data.departments.map((d) => [d.slug, d.name]));
const classesOf = (g) => [...new Set([g.course_slug, ...(g.payload.also || [])])].filter((x) => bySlug[x]);
// Uploaded study guides open through short-lived links, fetched once for the page
const pdfLinks = await s.pdfUrls(guides.map((g) => g.payload.pdf?.path).filter(Boolean)).catch(() => ({}));
const pdfUrl = (g) => (g.payload.pdf?.path ? pdfLinks[g.payload.pdf.path] || null : null);
const webUrl = (g) => safeUrl(g.payload.url) || null;
const openUrl = (g) => pdfUrl(g) || webUrl(g);
// A guide uploaded as a PDF can also link its live web version (a Google Doc): both, drawn with a ring
const both = (g) => !!(g.payload.pdf?.path && webUrl(g));

let opts = { orphans: false, apColor: true, labels: 1, size: 1, thick: 1, repel: 60, link: 40, gravity: .08, hide: [] };
try { Object.assign(opts, JSON.parse(localStorage.getItem(OPTS_KEY)) || {}); } catch { /* storage blocked */ }
const save = () => { try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch { /* ignore */ } };

// ── build the graph ──
function graph(filter = '') {
  const q = filter.trim().toLowerCase();
  const G = guides.filter((g) => !(opts.hide || []).includes(typeOf(g))).map((g) => ({ ...g, type: typeOf(g), classes: classesOf(g),
    hit: !q || `${g.payload.title} ${g.payload.note || ''} ${TYPE[typeOf(g)].label} ${classesOf(g).map((c) => `${bySlug[c].name} ${dept[bySlug[c].department] || ''}`).join(' ')}`.toLowerCase().includes(q) }));
  const withGuides = new Set(G.flatMap((g) => g.classes));
  const nodes = [], links = [], deg = {};
  const link = (a, b, kind) => { links.push({ source: a, target: b, kind }); deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; };
  // classes (with guides, or all of them with "Classes without guides" on), each under its subject area
  const cls = data.courses.filter((c) => withGuides.has(c.slug) || opts.orphans);
  const subjects = new Set(cls.map((c) => c.department));
  for (const d of data.departments) if (subjects.has(d.slug)) {
    nodes.push({ id: 'd:' + d.slug, kind: 'subject', slug: d.slug, name: d.name, has: cls.some((c) => c.department === d.slug && withGuides.has(c.slug)),
                 hit: !q || d.name.toLowerCase().includes(q) });
  }
  for (const c of cls) {
    nodes.push({ id: 'c:' + c.slug, kind: 'class', slug: c.slug, name: c.name, has: withGuides.has(c.slug), ap: /^AP\b/.test(c.name),
                 hit: !q || `${c.name} ${dept[c.department] || ''}`.toLowerCase().includes(q) });
    link('c:' + c.slug, 'd:' + c.department, 'subject');
  }
  G.forEach((g, i) => {
    const gid = 'g:' + (g.id ?? i);                           // the post's own id, so a dot keeps its place when types are hidden
    nodes.push({ id: gid, kind: 'guide', g, type: g.type, name: g.payload.title, hit: g.hit });
    for (const c of g.classes) link(gid, 'c:' + c, 'class');
  });
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

// Three sizes: subject areas biggest, then classes, then guides. Hubs grow a little with what hangs off them.
function radius(n) {
  const d = current.deg[n.id] || 0;
  return (n.kind === 'subject' ? 12 + Math.sqrt(d) * 1.6
    : n.kind === 'class' ? (n.has ? 6.5 + Math.sqrt(d) * 1.2 : 3.2)
    : 3.8 + Math.max(0, d - 1) * .8) * opts.size;                     // a guide shared across classes is a touch bigger
}

// Rebuild the nodes, keeping where every surviving dot already is
function load(replay) {
  current = graph($('#gv-q').value);
  const old = byId;
  byId = new Map(); nbr = new Map();
  // Start from the hierarchy: subjects round a circle, their classes round each subject,
  // guides round their (first) class. The forces then only have to relax it.
  const seed = new Map(), subs = current.nodes.filter((n) => n.kind === 'subject');
  const R = subs.length < 2 ? 0 : 70 + 32 * subs.length;
  subs.forEach((n, i) => { const a = i / subs.length * Math.PI * 2 - Math.PI / 2; seed.set(n.id, [Math.cos(a) * R, Math.sin(a) * R, a]); });
  for (const d of subs) {
    const cls = current.nodes.filter((n) => n.kind === 'class' && bySlug[n.slug].department === d.slug), [dx, dy, da] = seed.get(d.id);
    cls.forEach((n, i) => { const a = da + (i - (cls.length - 1) / 2) * Math.min(.7, 2.6 / cls.length); seed.set(n.id, [dx + Math.cos(a) * 80, dy + Math.sin(a) * 80, a]); });
  }
  for (const n of current.nodes.filter((x) => x.kind === 'guide')) {
    const sibs = current.G.filter((g) => g.classes[0] === n.g.classes[0]), k = sibs.indexOf(n.g), home = seed.get('c:' + n.g.classes[0]) || [0, 0, 0];
    const a = home[2] + (k - (sibs.length - 1) / 2) * Math.min(.9, 3.2 / sibs.length);   // fanned out, away from the subject
    seed.set(n.id, [home[0] + Math.cos(a) * 42, home[1] + Math.sin(a) * 42, a]);
  }
  N = current.nodes.map((n) => {
    const was = !replay && old.get(n.id), [sx, sy] = seed.get(n.id) || [0, 0];
    const o = { ...n, x: was ? was.x : sx, y: was ? was.y : sy, vx: 0, vy: 0, fx: null, fy: null };
    byId.set(n.id, o); nbr.set(n.id, new Set([n.id]));
    return o;
  });
  L = current.links.map((l) => ({ ...l, a: byId.get(l.source), b: byId.get(l.target) })).filter((l) => l.a && l.b);
  for (const l of L) { nbr.get(l.a.id).add(l.b.id); nbr.get(l.b.id).add(l.a.id); }
  for (const n of N) { n.r = radius(n); n.w = n.kind === 'subject' ? 3.2 : n.kind === 'class' ? 1.7 : 1; }   // hubs push harder, so subjects spread out
  const count = (k) => N.filter((n) => n.kind === k).length, g = count('guide'), c = count('class'), d = count('subject');
  $('#gv-count').textContent = `${g} study guide${g === 1 ? '' : 's'} & resources · ${c} class${c === 1 ? '' : 'es'} · ${d} subject${d === 1 ? '' : 's'}`;
}

function tick() {
  const rep = opts.repel * 14, dist = opts.link * 1.3, grav = opts.gravity * 0.06;
  for (let i = 0; i < N.length; i++) {
    const a = N[i];
    for (let j = i + 1; j < N.length; j++) {                        // everything pushes everything apart
      const b = N[j];
      let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - .5; dy = Math.random() - .5; d2 = 1; }
      if (d2 > 250000) continue;
      const f = rep * alpha * a.w * b.w / d2, d = Math.sqrt(d2);
      a.vx -= dx / d * f; a.vy -= dy / d * f; b.vx += dx / d * f; b.vy += dy / d * f;
    }
    a.vx -= a.x * grav * alpha; a.vy -= a.y * grav * alpha;       // and the centre pulls gently
  }
  for (const l of L) {                                              // links act as springs
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const want = dist * (l.kind === 'class' ? .75 : 1.6), f = (d - want) / d * .09 * alpha;   // guides close to their class, classes further out from their subject
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
    ctx.globalAlpha = (on ? 1 : Math.min(dim(l.a.id), dim(l.b.id)) * .8) * ((l.a.hit && l.b.hit) ? 1 : .2);
    ctx.strokeStyle = on ? C.accent : C.line;
    ctx.lineWidth = ((on ? 1.6 : l.kind === 'subject' ? 1.1 : .8) * opts.thick) / Math.max(.5, k);
    ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
  }
  for (const n of N) {
    ctx.globalAlpha = dim(n.id) * (n.hit ? 1 : .15);
    ctx.fillStyle = n === hover ? C.accent : n.kind === 'subject' ? C.subject : n.has === false ? C.empty : n.kind === 'guide' ? TYPE[n.type]?.color || C.guide : n.ap && opts.apColor ? C.ap : C.node;
    const r = n.r * (n === hover ? 1 + .25 * fade : 1);
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
    if (n.kind === 'guide' && both(n.g)) {                     // PDF + web version: a ring around the dot
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(.8, r * .3);
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 1.7, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // titles fade out as you zoom out (Obsidian's text fade threshold); the dot
  // you point at and its neighbours always keep theirs
  const t = opts.labels, base = smooth(t * .6, t, k), faint = smooth(t * 1.1, t * 1.7, k);   // classes with no guides need a closer look
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const n of N) {
    const focus = near?.has(n.id);
    // subject names stay readable when zoomed right out
    let a = focus ? Math.max(base, fade) : (n.kind === 'subject' ? 1 : n.has === false ? faint * .7 : base) * dim(n.id);
    if (!n.hit) a *= .2;
    if (a < .02) continue;
    const size = n.kind === 'subject' ? 14 : n.kind === 'guide' ? 11 : 10;
    ctx.font = `${n === hover || n.kind === 'subject' ? 600 : 400} ${size / Math.max(n.kind === 'subject' ? .5 : 1, k * .9)}px ui-sans-serif, system-ui, sans-serif`;
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
  const warm = still ? 500 : replay ? 30 : 320;                     // settle most of the way first (less for Animate, to watch it settle)
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
  if (n.kind === 'subject') return;
  const u = n.kind === 'guide' ? openUrl(n.g) : courseUrl(n.slug);
  if (u) window.open(u, n.kind === 'guide' ? '_blank' : '_self', 'noopener');
});

// Obsidian-style settings: Filters / Display / Forces, plus Animate
function panel() {
  const sl = (k, label, min, max, step) => `<label class="gv-sl"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${opts[k]}"></label>`;
  const tg = (k, label) => `<label class="gv-tg"><span>${label}</span><span class="tgl"><input type="checkbox" data-k="${k}" ${opts[k] ? 'checked' : ''}><span aria-hidden="true"></span></span></label>`;
  $('#gv-panel').innerHTML = `
    <details open><summary>Filters</summary>${tg('orphans', 'Classes without guides')}</details>
    <details><summary>Display</summary>${tg('apColor', 'Colour AP classes')}${sl('labels', 'Text fade threshold', .4, 3, .1)}${sl('size', 'Node size', .5, 2, .1)}${sl('thick', 'Link thickness', .5, 3, .1)}</details>
    <details><summary>Forces</summary>${sl('gravity', 'Center force', 0, .4, .01)}${sl('repel', 'Repel force', 10, 200, 5)}${sl('link', 'Link distance', 10, 120, 5)}</details>
    <button type="button" class="gv-animate" id="gv-animate">Animate</button>`;
}

// Click: a card with the real thing behind the dot
function info(n) {
  const card = $('#gv-info');
  if (!n) { card.hidden = true; return; }
  const count = (list) => `${list.length} study guide${list.length === 1 ? '' : 's'} & resource${list.length === 1 ? '' : 's'}`;
  if (n.kind === 'guide') {
    const g = n.g, pdf = pdfUrl(g), web = webUrl(g), hasPdf = !!g.payload.pdf?.path;
    const webLink = (label, alt) => `<a class="gv-open${alt ? ' alt' : ''}" href="${esc(web)}" target="_blank" rel="noopener nofollow">${label} ↗</a>`;
    const opens = hasPdf
      ? `<div class="gv-opens">${pdf ? `<a class="gv-open" href="${esc(pdf)}" target="_blank" rel="noopener">Open the PDF ↗</a>` : '<span class="gv-m">The PDF isn’t available right now.</span>'}${web ? webLink('Open the web version', !!pdf) : ''}</div>`
      : web ? webLink(`Open the ${g.type === 'guide' ? 'web version' : esc(TYPE[g.type].label.toLowerCase())}`) : '';
    card.innerHTML = `<button type="button" class="gv-x" aria-label="Close">✕</button>
      <div class="gv-k"><i class="gv-dot" style="background:${TYPE[g.type].color}"></i>${esc(TYPE[g.type].label)}${hasPdf && web ? ' · PDF and web version' : hasPdf ? ' · PDF' : g.type === 'guide' && web ? ' · web version' : ''}</div><h3>${esc(g.payload.title)}</h3>
      <p class="gv-m">${g.classes.map((c) => `<a href="${courseUrl(c)}">${esc(bySlug[c].name)}</a>`).join(' · ')}${g.teacher ? ` · ${esc(g.teacher)}’s class` : ''}</p>
      ${g.payload.note ? `<p>${esc(g.payload.note)}</p>` : ''}
      <p class="gv-m">${g.payload.author ? `Made by ${esc(g.payload.author)} · shared by ${esc(g.author)}` : `Made by ${esc(g.author)}`}</p>
      ${opens}`;
  } else if (n.kind === 'class') {
    const list = current.G.filter((g) => g.classes.includes(n.slug));
    card.innerHTML = `<button type="button" class="gv-x" aria-label="Close">✕</button>
      <div class="gv-k">${esc(dept[bySlug[n.slug]?.department] || 'Class')}</div><h3>${esc(n.name)}</h3>
      <p class="gv-m">${list.length ? count(list) : 'Nothing shared yet.'}</p>
      <a class="gv-open" href="${list.length ? courseUrl(n.slug) + '#s-resources' : `${root}submit/?course=${n.slug}&kind=resource`}">${list.length ? 'Open the class page →' : 'Share the first one →'}</a>`;
  } else {
    const cls = data.courses.filter((c) => c.department === n.slug)
      .map((c) => [c, current.G.filter((g) => g.classes.includes(c.slug)).length]).filter(([, k]) => k).sort((a, b) => b[1] - a[1]);
    card.innerHTML = `<button type="button" class="gv-x" aria-label="Close">✕</button>
      <div class="gv-k">Subject</div><h3>${esc(n.name)}</h3>
      <p class="gv-m">${cls.length ? `${count(current.G.filter((g) => g.classes.some((c) => bySlug[c].department === n.slug)))} in ${cls.length} class${cls.length === 1 ? '' : 'es'}` : 'Nothing shared yet.'}</p>
      ${cls.length ? `<p class="gv-m">${cls.map(([c, k]) => `<a href="${courseUrl(c.slug)}#s-resources">${esc(c.name)}</a> (${k})`).join(' · ')}</p>` : ''}`;
  }
  card.hidden = false;
}

// The accessible version: every guide, by subject and class (a shared one is listed under each class)
function list() {
  const by = {};
  for (const g of guides) for (const c of classesOf(g)) (by[c] ||= []).push(g);
  const subj = {};
  for (const slug of Object.keys(by)) (subj[bySlug[slug].department] ||= []).push(slug);
  const card = (g) => { const u = openUrl(g);
    if (both(g)) return `<div class="res-card has-pdf"><a class="res-main" href="${esc(u)}" target="_blank" rel="noopener"><b>${esc(g.payload.title)}</b></a>
      ${g.payload.note ? `<span class="note-line">${esc(g.payload.note.slice(0, 160))}${g.payload.note.length > 160 ? '…' : ''}</span>` : ''}
      <span class="meta"><span class="rtype" style="--c:${TYPE[typeOf(g)].color}">${esc(TYPE[typeOf(g)].label)}</span>PDF · ${esc(g.payload.author || g.author)}${g.teacher ? ` · ${esc(g.teacher)}’s class` : ''}</span>
      <a class="res-alt" href="${esc(webUrl(g))}" target="_blank" rel="noopener nofollow">Web version ↗</a><span class="arrow" aria-hidden="true">📄</span></div>`;
    return `<a class="res-card" ${u ? `href="${esc(u)}" target="_blank" rel="noopener nofollow"` : ''}>
      <b>${esc(g.payload.title)}</b>${g.payload.note ? `<span class="note-line">${esc(g.payload.note.slice(0, 160))}${g.payload.note.length > 160 ? '…' : ''}</span>` : ''}
      <span class="meta"><span class="rtype" style="--c:${TYPE[typeOf(g)].color}">${esc(TYPE[typeOf(g)].label)}</span>${g.payload.pdf ? 'PDF · ' : ''}${esc(g.payload.author || g.author)}${g.teacher ? ` · ${esc(g.teacher)}’s class` : ''}</span>${u ? `<span class="arrow" aria-hidden="true">${g.payload.pdf ? '📄' : '↗'}</span>` : ''}</a>`; };
  $('#gv-list').innerHTML = Object.keys(by).length ? data.departments.filter((d) => subj[d.slug]).map((d) => `
    <h2 class="gv-subject">${esc(d.name)}</h2>
    ${subj[d.slug].sort((a, b) => bySlug[a].name.localeCompare(bySlug[b].name)).map((slug) => `
    <section class="gv-class"><h3><a href="${courseUrl(slug)}">${esc(bySlug[slug].name)}</a></h3>${by[slug].map(card).join('')}</section>`).join('')}`).join('')
    : `<p class="empty-line">No study guides yet. Made one? <a class="add-link" href="${root}submit/?kind=resource">Share it →</a></p>`;
}

// ── wire up ──
// the legend: what each dot is, and a chip per kind of resource (only kinds there are) to hide or show it
function legend() {
  const present = TYPES.filter(([k]) => guides.some((g) => typeOf(g) === k));
  const hidden = new Set(opts.hide || []);
  $('#gv-legend').innerHTML = `<span><i class="s"></i>Subject</span><span class="ap"><i class="a"></i>AP class</span><span><i class="c"></i>Class</span>`
    + (guides.some(both) ? '<span class="gv-both" title="A ring means it has a PDF and a web version"><i></i>PDF + web</span>' : '')
    + present.map(([k, label, color]) => `<button type="button" class="gv-type" data-type="${k}" aria-pressed="${!hidden.has(k)}" title="${hidden.has(k) ? 'Show' : 'Hide'} ${esc(label.toLowerCase())}"><i style="background:${color}"></i>${esc(label)}</button>`).join('');
  $('#gv-legend').classList.toggle('no-ap', !opts.apColor);
}
$('#gv-legend').addEventListener('click', (e) => {
  const b = e.target.closest('[data-type]'); if (!b) return;
  const k = b.dataset.type, h = new Set(opts.hide || []);
  h.has(k) ? h.delete(k) : h.add(k);
  opts.hide = [...h]; save(); legend(); info(null); draw();
});
legend();
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
  if (k === 'apColor') { $('#gv-legend').classList.toggle('no-ap', !opts.apColor); wake(); }   // just a colour
  else if (e.target.type === 'checkbox') draw();                  // filters change what's on the graph
  else if (['repel', 'link', 'gravity'].includes(k)) { alpha = Math.max(alpha, .5); wake(); }   // forces: let it resettle
  else { for (const n of N) n.r = radius(n); wake(); }            // display: just redraw
});
$('#gv-panel').addEventListener('click', (e) => { if (e.target.id === 'gv-animate') draw(true); });
$('#gv-info').addEventListener('click', (e) => { if (e.target.closest('.gv-x')) info(null); });
