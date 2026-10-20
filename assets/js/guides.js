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

import { initHeader, openSigned, $, esc, courses, courseUrl, safeUrl, root, lessMotion } from './ui.js';
import { GUIDE } from './forms.js';

// Each kind of resource has its own colour (Ethan), from the Type the poster picked on the form.
// The legend's type chips show or hide that kind.
// Muted on purpose (Ethan 2026-10-19: the bright set felt cheap; "more 高级"): dusty tones that sit
// together on the dark card, with gold kept for what you point at.
const TYPES = [
  ['guide', 'Study guide', '#d8d2c4'],
  ['textbook', 'Textbook', '#a89cc8'],
  ['practice', 'Practice problems', '#8fb9a5'],
  ['video', 'Video', '#c39389'],
  ['website', 'Website', '#88b0b2'],
  ['other', 'Other', '#8e8981'],
];
const TYPE = Object.fromEntries(TYPES.map(([k, label, color]) => [k, { label, color }]));
const typeOf = (g) => {
  const t = g.payload?.type || '';
  return t === GUIDE || g.payload?.pdf || /study guide/i.test(t) ? 'guide' : /textbook/i.test(t) ? 'textbook'
    : /practice/i.test(t) ? 'practice' : /video/i.test(t) ? 'video' : /website/i.test(t) ? 'website' : 'other';
};

const s = await initHeader();
const OPTS_KEY = 'wilkipedia-graph';
const C = { bg: '#161616', node: '#8c9098', guide: '#d8d2c4', subject: '#c8b07a', ap: '#8b9cc6', empty: '#5c5c5c', line: '#2f2f2f', accent: '#d9bd78', text: '#a9a9a9' };

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
// Redrawn 2026-10-19 (Ethan: clearer, more designed, "use Obsidian as reference again"):
//   labels are placed by priority (what you point at and its neighbours, search matches,
//   subjects, classes, then guides) and a label that would overlap one already drawn is skipped,
//   so text never piles up; guide titles appear as you zoom in (the text fade threshold).
//   Dots have a collision force so they never overlap, a dark outline to separate them, and
//   subjects a soft glow. Classes with no guides are hollow (Obsidian's unresolved notes).
//   Clicking a dot keeps it lit and glides the camera to it; + / − / fit buttons by the gear.
const box = $('#gv-chart');
const cv = document.createElement('canvas');
cv.className = 'gv-canvas';
box.append(cv);
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, bgFill = C.bg;
const view = { x: 0, y: 0, k: 1 };                 // screen = world * k + centre + (x, y)
let N = [], L = [], byId = new Map(), nbr = new Map();
let alpha = 1, alphaTarget = 0, raf = 0, hover = null, sel = null, fade = 0, current, cam = null;
const still = lessMotion();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const toWorld = (sx, sy) => [(sx - W / 2 - view.x) / view.k, (sy - H / 2 - view.y) / view.k];
const toScreen = (x, y) => [W / 2 + view.x + x * view.k, H / 2 + view.y + y * view.k];
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

// Three sizes: subject areas biggest, then classes, then guides. Hubs grow a little with what hangs off them.
function radius(n) {
  const d = current.deg[n.id] || 0;
  return (n.kind === 'subject' ? 13 + Math.sqrt(d) * 1.8
    : n.kind === 'class' ? (n.has ? 7 + Math.sqrt(d) * 1.3 : 4)
    : 4.6 + Math.max(0, d - 1) * .9) * opts.size;                     // a guide shared across classes is a touch bigger
}

// Rebuild the nodes, keeping where every surviving dot already is
function load(replay) {
  current = graph($('#gv-q').value);
  const old = byId;
  byId = new Map(); nbr = new Map();
  // Start from the hierarchy: subjects round a circle, their classes round each subject,
  // guides fanned out beyond their (first) class. The forces then only have to relax it.
  const seed = new Map(), subs = current.nodes.filter((n) => n.kind === 'subject');
  const R = subs.length < 2 ? 0 : 80 + 34 * subs.length;
  subs.forEach((n, i) => { const a = i / subs.length * Math.PI * 2 - Math.PI / 2; seed.set(n.id, [Math.cos(a) * R, Math.sin(a) * R, a]); });
  for (const d of subs) {
    const cls = current.nodes.filter((n) => n.kind === 'class' && bySlug[n.slug].department === d.slug), [dx, dy, da] = seed.get(d.id);
    cls.forEach((n, i) => { const a = da + (i - (cls.length - 1) / 2) * Math.min(.8, 3.4 / cls.length); seed.set(n.id, [dx + Math.cos(a) * 115, dy + Math.sin(a) * 115, a]); });
  }
  for (const n of current.nodes.filter((x) => x.kind === 'guide')) {
    const sibs = current.G.filter((g) => g.classes[0] === n.g.classes[0]), k = sibs.indexOf(n.g), home = seed.get('c:' + n.g.classes[0]) || [0, 0, 0];
    const a = home[2] + (k - (sibs.length - 1) / 2) * Math.min(1, 4 / sibs.length);
    seed.set(n.id, [home[0] + Math.cos(a) * 66, home[1] + Math.sin(a) * 66, a]);
  }
  N = current.nodes.map((n) => {
    const was = !replay && old.get(n.id), [sx, sy] = seed.get(n.id) || [0, 0];
    const o = { ...n, x: was ? was.x : sx, y: was ? was.y : sy, vx: 0, vy: 0, fx: null, fy: null };
    byId.set(n.id, o); nbr.set(n.id, new Set([n.id]));
    return o;
  });
  L = current.links.map((l) => ({ ...l, a: byId.get(l.source), b: byId.get(l.target) })).filter((l) => l.a && l.b);
  for (const l of L) { nbr.get(l.a.id).add(l.b.id); nbr.get(l.b.id).add(l.a.id); }
  for (const n of N) { n.r = radius(n); n.w = n.kind === 'subject' ? 3.4 : n.kind === 'class' ? 1.8 : 1.15; }   // hubs push harder, so subjects spread out
  if (sel) sel = byId.get(sel.id) || null;
  const count = (k) => N.filter((n) => n.kind === k).length, g = count('guide'), c = count('class'), d = count('subject');
  $('#gv-count').textContent = `${g} study guide${g === 1 ? '' : 's'} & resources · ${c} class${c === 1 ? '' : 'es'} · ${d} subject${d === 1 ? '' : 's'}`;
}

function tick() {
  const rep = opts.repel * 16, dist = opts.link * 1.3, grav = opts.gravity * 0.11;
  for (let i = 0; i < N.length; i++) {
    const a = N[i];
    for (let j = i + 1; j < N.length; j++) {                        // everything pushes everything apart
      const b = N[j];
      let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - .5; dy = Math.random() - .5; d2 = 1; }
      if (d2 > 360000) continue;
      const f = rep * alpha * a.w * b.w / d2, d = Math.sqrt(d2);
      a.vx -= dx / d * f; a.vy -= dy / d * f; b.vx += dx / d * f; b.vy += dy / d * f;
    }
    a.vx -= a.x * grav * alpha; a.vy -= a.y * grav * alpha;       // and the centre pulls gently
  }
  for (const l of L) {                                              // links act as springs
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const want = dist * (l.kind === 'class' ? 1.15 : 1.65), f = (d - want) / d * .08 * alpha;   // guides a little way out from their class, classes further from their subject
    l.a.vx += dx * f; l.a.vy += dy * f; l.b.vx -= dx * f; l.b.vy -= dy * f;
  }
  for (const n of N) {
    if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; continue; }
    n.vx *= .6; n.vy *= .6; n.x += n.vx; n.y += n.vy;
  }
  // collisions: no two dots overlap, with a little air between them
  for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
    const a = N[i], b = N[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01;
    const min = a.r + b.r + (a.kind === 'guide' && b.kind === 'guide' ? 9 : 14);
    if (d >= min) continue;
    const push = (min - d) / d * .5;
    if (a.fx == null) { a.x -= dx * push; a.y -= dy * push; }
    if (b.fx == null) { b.x += dx * push; b.y += dy * push; }
  }
  alpha += (alphaTarget - alpha) * .025;
}

// The view that shows everything, with room for the bar on top and the legend underneath
function fitView() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of N) { x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r + 14); }
  const k = Math.min(1.6, Math.max(.2, Math.min((W - 80) / (x1 - x0 || 1), (H - 150) / (y1 - y0 || 1))));
  return { k, x: -(x0 + x1) / 2 * k, y: -(y0 + y1) / 2 * k + 6 };
}
function fit(animated = false) { if (N.length) goTo(fitView(), animated); }
// glide the camera (or jump, with reduced motion)
function goTo(to, animated = true) {
  if (!animated || still) { Object.assign(view, to); cam = null; wake(); return; }
  cam = { from: { ...view }, to, t0: performance.now(), dur: 420 };
  wake();
}
function focusOn(n) {
  const k = Math.max(view.k, n.kind === 'guide' ? 1.5 : 1.1);
  goTo({ k, x: -n.x * k, y: -n.y * k });
}

function size() {
  const r = box.getBoundingClientRect();
  DPR = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cv.style.width = `${W}px`; cv.style.height = `${H}px`;
  // a soft vignette: a touch lighter in the middle, like a lit desk
  const g = ctx.createRadialGradient(W / 2, H * .45, 0, W / 2, H * .45, Math.max(W, H) * .75);
  g.addColorStop(0, '#1d1d1d'); g.addColorStop(1, '#111111');
  bgFill = g;
  wake();
}

const colorOf = (n) => (n.kind === 'subject' ? C.subject : n.kind === 'guide' ? TYPE[n.type]?.color || C.guide
  : n.has === false ? C.empty : n.ap && opts.apColor ? C.ap : C.node);

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = bgFill; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(DPR * view.k, 0, 0, DPR * view.k, DPR * (W / 2 + view.x), DPR * (H / 2 + view.y));
  const k = view.k, focus = hover || sel, near = focus ? nbr.get(focus.id) : null;
  const searching = !!$('#gv-q').value.trim();
  // the rest of the graph fades back while a dot is pointed at (or picked)
  const dim = (id) => (near && !near.has(id) ? 1 - .86 * fade : 1);
  const px = 1 / k;                                                    // one screen pixel, in world units
  // links
  for (const l of L) {
    const on = near && (l.a === focus || l.b === focus);
    ctx.globalAlpha = (on ? .85 : Math.min(dim(l.a.id), dim(l.b.id)) * .9) * ((l.a.hit && l.b.hit) ? 1 : .15);
    ctx.strokeStyle = on ? C.accent : C.line;
    ctx.lineWidth = ((on ? 1.4 : l.kind === 'subject' ? 1.1 : .8) * opts.thick) * px;
    ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
  }
  // dots
  for (const n of N) {
    const a = dim(n.id) * (n.hit ? 1 : .14);
    ctx.globalAlpha = a;
    const col = colorOf(n), r = n.r * (n === hover ? 1 + .18 * fade : 1);
    if (n.kind === 'subject') {                                        // a soft glow round each subject
      const g = ctx.createRadialGradient(n.x, n.y, r * .6, n.x, n.y, r * 2.6);
      g.addColorStop(0, 'rgba(200, 176, 122, .14)'); g.addColorStop(1, 'rgba(200, 176, 122, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    if (n.kind === 'class' && n.has === false) {                       // hollow: nothing shared yet
      ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.4 * px; ctx.stroke();
    } else {
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = C.bg; ctx.lineWidth = 1.6 * px; ctx.stroke();  // a dark outline keeps touching dots apart
    }
    if (n.kind === 'guide' && both(n.g)) {                             // PDF + web version: a fine ring
      ctx.strokeStyle = col; ctx.lineWidth = 1.1 * px;
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 3 * px, 0, Math.PI * 2); ctx.stroke();
    }
    if (n === focus) {                                                 // the dot you're on: a gold ring
      ctx.globalAlpha = 1; ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5 * px;
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 4.5 * px, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // labels, in screen space so they stay crisp at any zoom
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
  const t = opts.labels;
  const rank = (n) => (n === focus ? 0 : near?.has(n.id) ? 1 : searching && n.hit ? 2 : n.kind === 'subject' ? 3 : n.kind === 'class' ? 4 : 5);
  const show = (n) => {                                                // how visible this label is at this zoom (Obsidian's text fade)
    if (near?.has(n.id)) return Math.max(fade, n.kind === 'guide' ? smooth(1.05 * t, 1.5 * t, k) : 1);
    if (searching && n.hit && n.kind !== 'subject') return 1;
    const z = n.kind === 'subject' ? 1 : n.kind === 'class' ? (n.has ? smooth(.4 * t, .62 * t, k) : smooth(.95 * t, 1.3 * t, k) * .8) : smooth(1.05 * t, 1.5 * t, k);
    return z * dim(n.id) ** 2 * (n.hit ? 1 : .2);                   // faded dots lose their labels entirely
  };
  const placed = [];
  // dots are obstacles too: a label never covers another dot (only what you're pointing at may)
  const dots = N.filter((n) => dim(n.id) * (n.hit ? 1 : .14) > .3).map((n) => { const [x, y] = toScreen(n.x, n.y), r = n.r * view.k + 2; return [x - r, y - r, x + r, y + r, n]; });
  const order = N.map((n) => [n, rank(n), current.deg[n.id] || 0]).sort((a, b) => a[1] - b[1] || b[2] - a[2]);
  for (const [n, r] of order) {
    const a = show(n);
    if (a < .04) continue;
    const size = n.kind === 'subject' ? 13.5 : n.kind === 'class' ? 11.5 : 11;
    ctx.font = `${n.kind === 'subject' || n === focus ? 500 : 400} ${size}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    const text = clip(n.name, n.kind === 'guide' ? 30 : 30);
    const [sx, sy] = toScreen(n.x, n.y), y = sy + n.r * view.k + 4, w = ctx.measureText(text).width;
    const rect = [sx - w / 2 - 3, y - 1, sx + w / 2 + 3, y + size + 2];
    const over = (q) => rect[0] < q[2] && rect[2] > q[0] && rect[1] < q[3] && rect[3] > q[1];
    if (r > 0 && (placed.some(over) || (r > 3 && dots.some((q) => q[4] !== n && over(q))))) continue;   // never pile labels up (subject names may cross a dot)
    placed.push(rect);
    ctx.globalAlpha = a;
    ctx.strokeStyle = C.bg; ctx.lineWidth = 3.5; ctx.strokeText(text, sx, y);   // a dark halo so text reads over lines
    ctx.fillStyle = n === focus ? '#f2ead6' : n.kind === 'subject' ? '#ddd0ac' : n.has === false ? '#6f6f6f' : r <= 2 ? '#d6d6d6' : n.kind === 'class' ? '#b4b4b4' : '#8f8f8f';
    ctx.fillText(text, sx, y);
  }
  ctx.globalAlpha = 1;
}

function frame(now) {
  raf = 0;
  const target = hover || sel ? 1 : 0;
  fade = still ? target : fade + (target - fade) * .22;             // focus fades in fast
  if (cam) {
    const u = Math.min(1, (now - cam.t0) / cam.dur), e = 1 - Math.pow(1 - u, 3);
    for (const key of ['x', 'y', 'k']) view[key] = cam.from[key] + (cam.to[key] - cam.from[key]) * e;
    if (u >= 1) cam = null;
  }
  if (alpha > .004 || alphaTarget > 0) tick();
  render();
  if (cam || alpha > .004 || alphaTarget > 0 || Math.abs(fade - target) > .01) raf = requestAnimationFrame(frame);
}
const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

function draw(replay = false) {
  load(replay);
  alpha = 1;
  const warm = still ? 600 : replay ? 30 : 420;                     // settle most of the way first (less for Animate, to watch it settle)
  for (let i = 0; i < warm; i++) tick();
  fit(false);
  wake();
}

// pointing, dragging, zooming, pinching
function hit(sx, sy) {
  const [x, y] = toWorld(sx, sy);
  let best = null, bd = Infinity;
  for (const n of N) { const d = Math.hypot(n.x - x, n.y - y); if (d < n.r + 6 / view.k && d < bd) { bd = d; best = n; } }
  return best;
}
const pts = new Map();
let press = null, pinch = null;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, [e.offsetX, e.offsetY]);
  cam = null;
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
    if (press.n && press.moved) { [press.n.fx, press.n.fy] = toWorld(e.offsetX, e.offsetY); alphaTarget = .25; alpha = Math.max(alpha, .25); }
    else if (!press.n) { view.x = press.vx + dx; view.y = press.vy + dy; }
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
  if (!press.moved) {                                                 // a click: pick it (or let go, on the background)
    sel = press.n;
    info(press.n);
    if (press.n) focusOn(press.n);
  }
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
cv.addEventListener('wheel', (e) => { e.preventDefault(); cam = null; zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018))); }, { passive: false });
cv.addEventListener('dblclick', (e) => {
  const n = hit(e.offsetX, e.offsetY);
  if (!n) return;
  if (n.kind === 'subject') return;
  const u = n.kind === 'guide' ? openUrl(n.g) : courseUrl(n.slug);
  if (!u) return;
  if (n.kind === 'guide') openSigned(u);            // a PDF link may have expired while the page was open
  else window.open(u, '_self');
});
// the camera buttons by the gear: zoom in, zoom out, fit everything
$('#gv-zoom')?.addEventListener('click', (e) => {
  const z = e.target.closest('[data-z]')?.dataset.z;
  if (z === 'fit') fit(true);
  else if (z) { const by = z === 'in' ? 1.35 : 1 / 1.35, k = Math.min(6, Math.max(.12, view.k * by)); goTo({ k, x: view.x * k / view.k, y: view.y * k / view.k }); }
});
// keys on the graph: + / − to zoom, 0 to fit, Esc to let go of the picked dot
box.tabIndex = 0;
box.addEventListener('keydown', (e) => {
  if (e.key === '+' || e.key === '=') $('#gv-zoom [data-z="in"]')?.click();
  else if (e.key === '-') $('#gv-zoom [data-z="out"]')?.click();
  else if (e.key === '0') fit(true);
  else if (e.key === 'Escape') { sel = null; info(null); wake(); }
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

// The accessible version: every guide, by subject and class (a shared one is listed under each class).
// Laid out like a book's index (Ethan 2026-10-19: the card list was hard to read; no bubbles, nothing
// that looks generated): a ruled heading per subject, the class as a small header, then one row per
// guide — title, a two-line note, who made it — with its files as plain text links on the right.
function list() {
  const by = {};
  for (const g of guides) for (const c of classesOf(g)) (by[c] ||= []).push(g);
  const subj = {};
  for (const slug of Object.keys(by)) (subj[bySlug[slug].department] ||= []).push(slug);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const ext = 'target="_blank" rel="noopener nofollow"';
  const row = (g) => {
    const pdf = pdfUrl(g), web = webUrl(g), main = pdf || web, t = typeOf(g);
    const who = [t === 'guide' ? '' : TYPE[t].label, g.payload.author || g.author ? `Made by ${g.payload.author || g.author}` : '', g.teacher ? `${g.teacher}’s class` : '']
      .filter(Boolean).map(esc).join(' · ');
    const files = [pdf ? `<a href="${esc(pdf)}" ${ext}>PDF</a>` : g.payload.pdf?.path ? '<span class="gl-off" title="The PDF isn’t available right now">PDF</span>' : '',
      web ? `<a href="${esc(web)}" ${ext}>${t === 'guide' && pdf ? 'Web' : t === 'video' ? 'Watch' : 'Open'}</a>` : ''].filter(Boolean).join('');
    return `<li class="gl-row">
      <div class="gl-text">${main ? `<a class="gl-title" href="${esc(main)}" ${ext}>${esc(g.payload.title)}</a>` : `<span class="gl-title">${esc(g.payload.title)}</span>`}
        ${g.payload.note ? `<p class="gl-note">${esc(g.payload.note)}</p>` : ''}
        ${who ? `<p class="gl-who">${who}</p>` : ''}</div>
      ${files ? `<div class="gl-files">${files}</div>` : ''}</li>`;
  };
  const byTitle = (a, b) => a.payload.title.localeCompare(b.payload.title);
  $('#gv-list').innerHTML = Object.keys(by).length ? data.departments.filter((d) => subj[d.slug]).map((d) => {
    const n = new Set(subj[d.slug].flatMap((c) => by[c])).size;
    return `<section class="gl-subject">
      <header class="gl-subject-h"><h2>${esc(d.name)}</h2><span>${plural(n, 'guide')}</span></header>
      ${subj[d.slug].sort((a, b) => bySlug[a].name.localeCompare(bySlug[b].name)).map((slug) => `
      <section class="gl-class"><h3><a href="${courseUrl(slug)}#s-resources">${esc(bySlug[slug].name)}</a><span>${by[slug].length}</span></h3>
        <ol class="gl-rows">${by[slug].sort(byTitle).map(row).join('')}</ol></section>`).join('')}
    </section>`;
  }).join('')
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
$('#gv-info').addEventListener('click', (e) => { if (e.target.closest('.gv-x')) { sel = null; info(null); wake(); } });
