// Study guides as a graph, after Obsidian's graph view: a planned layout with springy
// dots drawn on a canvas, dark card, titles that fade out as you zoom out (the "text
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

// Shape = kind of resource (study guide ●, textbook ■, practice ◆, video ▲, website ⬢, other ○); the
// legend's chips hide or show a kind. Layout is planned, not left to physics (2026-10-22): every subject
// is a flower (subject in the middle, its classes round it, each class's guides fanned out beyond), the
// flowers packed side by side; springs only make it draggable. Look: Swiss, ink on paper (see palette()).
const TYPES = [
  ['guide', 'Study guide', 'circle'],
  ['textbook', 'Textbook', 'square'],
  ['practice', 'Practice problems', 'diamond'],
  ['video', 'Video', 'triangle'],
  ['website', 'Website', 'hexagon'],
  ['other', 'Other', 'ring'],
];
const TYPE = Object.fromEntries(TYPES.map(([k, label, shape]) => [k, { label, shape }]));
const typeOf = (g) => {
  const t = g.payload?.type || '';
  return t === GUIDE || g.payload?.pdf || /study guide/i.test(t) ? 'guide' : /textbook/i.test(t) ? 'textbook'
    : /practice/i.test(t) ? 'practice' : /video/i.test(t) ? 'video' : /website/i.test(t) ? 'website' : 'other';
};

const s = await initHeader();
const OPTS_KEY = 'wilkipedia-graph';

const [data, guides] = await Promise.all([courses(), s.approved({ kind: 'resource' }).catch(() => [])]);
const bySlug = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
const dept = Object.fromEntries(data.departments.map((d) => [d.slug, d.name]));
const classesOf = (g) => [...new Set([g.course_slug, ...(g.payload.also || [])])].filter((x) => bySlug[x]);
// Uploaded study guides open through short-lived links, fetched once for the page
const pdfLinks = await s.pdfUrls(guides.map((g) => g.payload.pdf?.path).filter(Boolean)).catch(() => ({}));
const pdfUrl = (g) => (g.payload.pdf?.path ? pdfLinks[g.payload.pdf.path] || null : null);
const webUrl = (g) => safeUrl(g.payload.url) || null;
const openUrl = (g) => pdfUrl(g) || webUrl(g);

let opts = { orphans: false, labels: 1, size: 1, thick: 1, spread: 1, hide: [], bg: 'auto' };
try { Object.assign(opts, JSON.parse(localStorage.getItem(OPTS_KEY)) || {}); } catch { /* storage blocked */ }
const save = () => { try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch { /* ignore */ } };

// ── build the graph ──
function graph(filter = '') {
  const q = filter.trim().toLowerCase();
  const G = guides.filter((g) => !(opts.hide || []).includes(typeOf(g))).map((g) => ({ ...g, type: typeOf(g), classes: classesOf(g),
    hit: !q || `${g.payload.title} ${g.payload.note || ''} ${TYPE[typeOf(g)].label} ${classesOf(g).map((c) => `${bySlug[c].name} ${dept[bySlug[c].department] || ''}`).join(' ')}`.toLowerCase().includes(q) }))
    .filter((g) => g.classes.length);
  const withGuides = new Set(G.flatMap((g) => g.classes));
  const nodes = [], links = [], deg = {};
  const link = (a, b, kind) => { links.push({ source: a, target: b, kind }); deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; };
  // classes (with guides, or all of them with "Classes without guides" on), each under its subject area
  const cls = data.courses.filter((c) => withGuides.has(c.slug) || opts.orphans);
  const subjects = new Set(cls.map((c) => c.department));
  for (const d of data.departments) if (subjects.has(d.slug)) {
    nodes.push({ id: 'd:' + d.slug, kind: 'subject', slug: d.slug, dept: d.slug, name: d.name, has: cls.some((c) => c.department === d.slug && withGuides.has(c.slug)),
                 hit: !q || d.name.toLowerCase().includes(q) });
  }
  for (const c of cls) {
    nodes.push({ id: 'c:' + c.slug, kind: 'class', slug: c.slug, dept: c.department, name: c.name, has: withGuides.has(c.slug),
                 hit: !q || `${c.name} ${dept[c.department] || ''}`.toLowerCase().includes(q) });
    link('c:' + c.slug, 'd:' + c.department, 'subject');
  }
  G.forEach((g, i) => {
    const gid = 'g:' + (g.id ?? i);                           // the post's own id, so a dot keeps its place when types are hidden
    nodes.push({ id: gid, kind: 'guide', g, type: g.type, dept: bySlug[g.classes[0]].department, name: g.payload.title, hit: g.hit });
    for (const c of g.classes) link(gid, 'c:' + c, 'class');
  });
  return { nodes, links, deg, G };
}

// ── the layout: every subject is a flower, and the flowers are packed together ──
// Inside a flower, classes that share guides (AP Calculus AB, BC and Calculus share most of theirs)
// stand together as one "unit"; the unit's guides fan out beyond its classes, a guide sitting
// closest to the class(es) it belongs to. Units are spaced round the subject so none overlap.
const GAP = 14.5;                                                      // centre to centre, guide to guide
function flower(d, nodes) {
  const cls = nodes.filter((n) => n.kind === 'class' && n.dept === d.slug).sort((a, b) => a.name.localeCompare(b.name));
  const mine = nodes.filter((n) => n.kind === 'guide' && n.dept === d.slug);
  const up = new Map(cls.map((c) => [c.slug, c.slug]));
  const find = (x) => (up.get(x) === x ? x : find(up.get(x)));
  for (const g of mine) { const cs = g.g.classes.filter((c) => up.has(c)); for (const c of cs.slice(1)) up.set(find(c), find(cs[0])); }
  const units = new Map();
  for (const c of cls) { const r = find(c.slug); if (!units.has(r)) units.set(r, { cls: [], gs: [] }); units.get(r).cls.push(c); }
  for (const g of mine) units.get(find(g.g.classes.find((c) => up.has(c)))).gs.push(g);
  const local = [];                                                  // [node, x, y] with the unit facing +x
  const shapes = [...units.values()].map((u) => {
    // a shared class sits in the middle of its unit, the ones with guides of their own at the ends
    const own = (c) => u.gs.filter((g) => g.g.classes.length === 1 && g.g.classes[0] === c.slug).length;
    u.cls.sort((a, b) => own(a) - own(b) || a.name.localeCompare(b.name));
    if (u.cls.length > 2) { const [first, ...rest] = u.cls; u.cls = [...rest.slice(0, Math.floor(rest.length / 2)), first, ...rest.slice(Math.floor(rest.length / 2))]; }
    const m = u.cls.length, step = 34, at = new Map();
    const pts = u.cls.map((c, i) => { const y = (i - (m - 1) / 2) * step; at.set(c.slug, y); return [c, 0, y]; });
    // guides: closest to their own class, the shared ones in the middle
    const key = (g) => { const ys = g.g.classes.filter((c) => at.has(c)).map((c) => at.get(c)); return ys.reduce((a, b) => a + b, 0) / ys.length; };
    const gs = u.gs.slice().sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name));
    // fan them in rows round the classes, never swinging back past 75° (that side faces the subject)
    let rho = Math.max(38, (m - 1) * step / 2 + 30), left = gs.length, k = 0;
    const span = 1.3;
    while (left > 0) {
      const cap = Math.max(1, Math.floor(rho * 2 * span / GAP) + 1), n = Math.min(cap, left);
      const row = gs.slice(k, k + n), arc = n === 1 ? 0 : Math.min(2 * span, (n - 1) * GAP / rho);
      row.forEach((g, i) => { const a = n === 1 ? (key(g) / (rho + 1)) * .6 : -arc / 2 + arc * i / (n - 1); pts.push([g, Math.cos(a) * rho, Math.sin(a) * rho]); });
      k += n; left -= n; rho += GAP;
    }
    let depth = 0, half = 0;
    for (const [, x, y] of pts) { depth = Math.max(depth, x); half = Math.max(half, Math.abs(y)); }
    return { pts, depth: depth + 8, half: half + 12 };
  });
  // round the subject: each unit takes the angle it needs at distance D, the slack shared out evenly
  const hub = 21;
  const need = shapes.reduce((a, u) => a + 2 * u.half + 14, 0);
  const D = Math.max(hub + 50, need / (Math.PI * 2) * 1.04);
  let a = -Math.PI / 2;
  const slack = Math.max(0, Math.PI * 2 - need / D) / Math.max(1, shapes.length);
  
  shapes.sort((p, q) => q.pts.length - p.pts.length);
  for (const u of shapes) {
    const w = (2 * u.half + 14) / D + slack;
    const t = shapes.length === 1 ? Math.PI / 6 : a + w / 2, cos = Math.cos(t), sin = Math.sin(t);
    for (const [n, x, y] of u.pts) local.push([n, cos * (D + x) - sin * y, sin * (D + x) + cos * y]);
    a += w;
  }
  return { d, local };                                    // a little air, and room for labels
}

// Pack the flowers by their real dots, not by circles round them (a flower is lopsided, so circles
// waste space): biggest first, then each next one slides in toward the middle from every direction,
// in each of eight turns, until it would come within CLEAR of a dot already placed. The spot kept
// is the one that lets the whole graph be shown biggest on the card.
const CLEAR = 30;
const side = () => (W < 640 ? 40 : 96);                             // room at the sides for labels that hang off the edge dots
// room above for the search bar and below for the legend, measured, since the legend wraps on a phone
const pads = () => ({ top: 70, bottom: Math.max(56, ($('#gv-graph .gv-foot')?.offsetHeight || 60) + 8) });
function layout(nodes) {
  const fl = nodes.filter((n) => n.kind === 'subject').map((d) => flower(d, nodes)).sort((a, b) => b.local.length - a.local.length);
  const rOf = (n) => (n.kind === 'subject' ? 26 : n.kind === 'class' ? 12 : 7);
  const P = [];                                                      // placed dots: [x, y, r]
  const zoomFor = (x0, y0, x1, y1) => Math.min(((W || 1000) - 2 * side()) / (x1 - x0 + 1), ((H || 620) - pads().top - pads().bottom) / (y1 - y0 + 1));
  let bb = [0, 0, 0, 0];
  const turn = (f, t) => { const c = Math.cos(t), s = Math.sin(t); return [[f.d, 0, 0], ...f.local].map(([n, x, y]) => [n, c * x - s * y, s * x + c * y, rOf(n)]); };
  const box = (pts, ox, oy) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [, x, y, r] of pts) { x0 = Math.min(x0, x + ox - r); y0 = Math.min(y0, y + oy - r); x1 = Math.max(x1, x + ox + r); y1 = Math.max(y1, y + oy + r + 14); }
    return [x0, y0, x1, y1];
  };
  const clash = (pts, ox, oy) => {
    for (const [, x, y, r] of pts) for (const q of P) { const dx = x + ox - q[0], dy = y + oy - q[1], m = r + q[2] + CLEAR; if (dx * dx + dy * dy < m * m) return true; }
    return false;
  };
  const home = new Map();
  for (const f of fl) {
    let best = null;
    if (!P.length) best = { pts: turn(f, 0), ox: 0, oy: 0 };
    else {
      const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, far = Math.max(bb[2] - bb[0], bb[3] - bb[1]) + 600;
      let top = -Infinity;
      for (let r = 0; r < 8; r++) {
        const pts = turn(f, r * Math.PI / 4);
        for (let i = 0; i < 32; i++) {
          const t = i / 32 * Math.PI * 2, ux = Math.cos(t), uy = Math.sin(t);
          // come in from far away along this direction, stopping just before the first clash
          let lo = 0, hi = far;
          if (!clash(pts, cx + ux * lo, cy + uy * lo)) hi = 0;
          else for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (clash(pts, cx + ux * mid, cy + uy * mid)) lo = mid; else hi = mid; }
          const ox = cx + ux * hi, oy = cy + uy * hi, [x0, y0, x1, y1] = box(pts, ox, oy);
          const z = zoomFor(Math.min(x0, bb[0]), Math.min(y0, bb[1]), Math.max(x1, bb[2]), Math.max(y1, bb[3])) - Math.hypot(ox - cx, oy - cy) * 1e-6;
          if (z > top) { top = z; best = { pts, ox, oy }; }
        }
      }
    }
    for (const [n, x, y, r] of best.pts) { P.push([x + best.ox, y + best.oy, r]); home.set(n.id, [x + best.ox, y + best.oy]); }
    const [x0, y0, x1, y1] = box(best.pts, best.ox, best.oy);
    bb = P.length === best.pts.length ? [x0, y0, x1, y1] : [Math.min(x0, bb[0]), Math.min(y0, bb[1]), Math.max(x1, bb[2]), Math.max(y1, bb[3])];
  }
  const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, sp = opts.spread;
  for (const [id, [x, y]] of home) home.set(id, [(x - cx) * sp, (y - cy) * sp]);
  return home;
}

// ── the engine: springs on a canvas ──
const box = $('#gv-chart');
const cv = document.createElement('canvas');
cv.className = 'gv-canvas';
box.append(cv);
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, bgFill = '#ffffff';
const view = { x: 0, y: 0, k: 1 };                 // screen = world * k + centre + (x, y)
let N = [], L = [], byId = new Map(), nbr = new Map();
let energy = 0, dragging = false, raf = 0, hover = null, sel = null, fade = 0, current, cam = null;
const still = lessMotion();
// Swiss (Ethan 2026-10-23: "more 简约, try the Swiss style", and "a white background option"). The
// earlier drift, flowing lights, stars, ripples, halos and bloom are gone. The graph is ink on paper:
// straight hairlines, solid dots, type doing the hierarchy (subjects bold, classes regular, guides small
// and grey), one accent (red) for the dot you point at or pick. The background is White or Black
// (`opts.bg`; Auto follows the site's night mode), switched from the bar.
const night = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
const dark = () => (opts.bg === 'black' || (opts.bg !== 'white' && night()));
let P;
const palette = () => (P = dark()
  ? { bg: '#0b0b0b', ink: '#f3f2ee', soft: '#9a9893', faint: '#4a4946', line: 'rgba(243,242,238,.22)', lineFaint: 'rgba(243,242,238,.07)', accent: '#ff3b30' }
  : { bg: '#ffffff', ink: '#111111', soft: '#6b6a66', faint: '#c9c7c0', line: 'rgba(17,17,17,.24)', lineFaint: 'rgba(17,17,17,.07)', accent: '#e2231a' });
palette();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const toWorld = (sx, sy) => [(sx - W / 2 - view.x) / view.k, (sy - H / 2 - view.y) / view.k];
const toScreen = (x, y) => [W / 2 + view.x + x * view.k, H / 2 + view.y + y * view.k];
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

// Three clear sizes: subject, class (a little bigger the more it has), guide.
function radius(n) {
  const d = current.deg[n.id] || 0;
  return (n.kind === 'subject' ? 16 + Math.min(4, Math.sqrt(d) * .8)
    : n.kind === 'class' ? (n.has ? 7.5 + Math.min(4.5, Math.sqrt(d - 1) * 1) : 4.5)
    : 5.6) * opts.size;
}
// how big a dot is drawn: never smaller than a few screen pixels, so the far-out view stays legible
const drawR = (n) => Math.max(n.r, (n.kind === 'subject' ? 7 : n.kind === 'class' ? 4 : 2.6) * Math.min(1, opts.size) / view.k);   // the floor shrinks with Node size too

const colorOf = (n) => (n.kind === 'guide' ? P.soft : n.kind === 'class' && n.has === false ? P.faint : P.ink);

// Rebuild the nodes. Surviving dots start where they are and spring to their new homes.
function load(replay) {
  current = graph($('#gv-q').value);
  const old = byId, home = layout(current.nodes);
  byId = new Map(); nbr = new Map();
  N = current.nodes.map((n) => {
    const [hx, hy] = home.get(n.id) || [0, 0], was = !replay && old.get(n.id);
    // Animate: everything starts at its subject and blooms out
    const from = replay ? home.get('d:' + n.dept) || [0, 0] : was ? [was.x, was.y] : [hx, hy];
    const o = { ...n, hx, hy, x: from[0] + (replay ? (Math.random() - .5) * 4 : 0), y: from[1] + (replay ? (Math.random() - .5) * 4 : 0), vx: 0, vy: 0, fx: null, fy: null };
    byId.set(n.id, o); nbr.set(n.id, new Set([n.id]));
    return o;
  });
  L = current.links.map((l) => ({ ...l, a: byId.get(l.source), b: byId.get(l.target) })).filter((l) => l.a && l.b);
  for (const l of L) { nbr.get(l.a.id).add(l.b.id); nbr.get(l.b.id).add(l.a.id); l.rest = Math.hypot(l.a.hx - l.b.hx, l.a.hy - l.b.hy); }
  // A guide for several classes is linked to each, but only the link to its nearest class is drawn in
  // full; the others are a faint thread (they light up when you point at it), so a shared fan stays clean.
  const near = new Map();
  for (const l of L) if (l.kind === 'class' && (!near.has(l.a.id) || l.rest < near.get(l.a.id).rest)) near.set(l.a.id, l);
  for (const l of L) { l.extra = l.kind === 'class' && near.get(l.a.id) !== l; }
  for (const n of N) n.r = radius(n);
  if (sel) sel = byId.get(sel.id) || null;
  const count = (k) => N.filter((n) => n.kind === k).length, g = count('guide'), c = count('class'), d = count('subject');
  $('#gv-count').textContent = `${g} study guide${g === 1 ? '' : 's'} & resources · ${c} class${c === 1 ? '' : 'es'} · ${d} subject${d === 1 ? '' : 's'}`;
}

// Each dot is tied to its home by a soft spring, and to its neighbours by springs as long as the
// link is at home. Dragging one stretches its links, so its neighbours follow; letting go, it all
// settles back. No forces fight the layout, so it always comes to rest where it was planned.
function tick() {
  for (const n of N) { if (n.fx == null) { n.vx += (n.hx - n.x) * .035; n.vy += (n.hy - n.y) * .035; } }
  for (const l of L) {
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.hypot(dx, dy) || 1, f = (d - l.rest) / d * .045;
    const wa = l.a.kind === 'subject' ? .35 : 1, wb = l.b.kind === 'subject' ? .35 : 1;   // a subject is heavy
    l.a.vx += dx * f * wa; l.a.vy += dy * f * wa; l.b.vx -= dx * f * wb; l.b.vy -= dy * f * wb;
  }
  let e = 0;
  for (const n of N) {
    if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; continue; }
    n.vx *= .82; n.vy *= .82; n.x += n.vx; n.y += n.vy;
    e = Math.max(e, Math.abs(n.vx) + Math.abs(n.vy), Math.abs(n.hx - n.x) * .02 + Math.abs(n.hy - n.y) * .02);
  }
  energy = e;
}

// The view that shows everything, with room for the bar on top, the legend underneath and the labels
function fitView() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of N) { x0 = Math.min(x0, n.hx - n.r); y0 = Math.min(y0, n.hy - n.r); x1 = Math.max(x1, n.hx + n.r); y1 = Math.max(y1, n.hy + n.r + 16); }
  const { top, bottom } = pads();
  const k = Math.min(1.6, Math.max(.2, Math.min((W - 2 * side()) / (x1 - x0 || 1), (H - top - bottom) / (y1 - y0 || 1))));
  return { k, x: -(x0 + x1) / 2 * k, y: -(y0 + y1) / 2 * k + (top - bottom) / 2 };
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
  bgFill = P.bg;
  wake();
}

// the six shapes, centred on (x, y), about the size of a circle of radius r
function shape(c, kind, x, y, r) {
  c.beginPath();
  if (kind === 'square') { const h = r * .86; c.rect(x - h, y - h, 2 * h, 2 * h); }
  else if (kind === 'diamond') { const h = r * 1.22; c.moveTo(x, y - h); c.lineTo(x + h, y); c.lineTo(x, y + h); c.lineTo(x - h, y); c.closePath(); }
  else if (kind === 'triangle') { const h = r * 1.25; c.moveTo(x, y - h); c.lineTo(x + h * .95, y + h * .62); c.lineTo(x - h * .95, y + h * .62); c.closePath(); }
  else if (kind === 'hexagon') { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1); } c.closePath(); }
  else c.arc(x, y, r, 0, Math.PI * 2);
}
// the same shapes for the legend and the card
const SVG = { circle: '<circle cx="6" cy="6" r="4.6"/>', square: '<rect x="2" y="2" width="8" height="8"/>', diamond: '<path d="M6 .8 11.2 6 6 11.2.8 6z"/>',
  triangle: '<path d="M6 1.2 11 10H1z"/>', hexagon: '<path d="M6 .9 10.4 3.45v5.1L6 11.1 1.6 8.55v-5.1z"/>', ring: '<circle cx="6" cy="6" r="3.9" fill="none" stroke="currentColor" stroke-width="1.6"/>' };
const mark = (kind, color) => `<svg class="gv-mark" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" style="color:${color};fill:${color}">${SVG[kind]}</svg>`;

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(DPR * view.k, 0, 0, DPR * view.k, DPR * (W / 2 + view.x), DPR * (H / 2 + view.y));
  const k = view.k, focus = hover || sel, near = focus ? nbr.get(focus.id) : null;
  const searching = !!$('#gv-q').value.trim();
  // the rest of the graph steps back while a dot is pointed at (or picked)
  const dim = (id) => (near && !near.has(id) ? 1 - .85 * fade : 1);
  const px = 1 / k;                                                    // one screen pixel, in world units
  // links: straight hairlines; a shared guide's extra links barely there until you point at it
  for (const l of L) {
    const on = near && (l.a === focus || l.b === focus);
    ctx.globalAlpha = (on ? 1 : Math.min(dim(l.a.id), dim(l.b.id))) * ((l.a.hit && l.b.hit) ? 1 : .15);
    ctx.strokeStyle = on ? P.ink : l.extra ? P.lineFaint : P.line;
    ctx.lineWidth = ((on ? 1.25 : l.kind === 'subject' ? 1 : .75) * opts.thick) * px;
    ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
  }
  // dots: solid, no outlines or glows
  for (const n of N) {
    ctx.globalAlpha = dim(n.id) * (n.hit ? 1 : .14);
    const r = drawR(n), kind = n.kind === 'guide' ? TYPE[n.type].shape : 'circle', col = n === focus ? P.accent : colorOf(n);
    shape(ctx, kind === 'ring' ? 'circle' : kind, n.x, n.y, r);
    if ((n.kind === 'class' && n.has === false) || kind === 'ring') {  // hollow: nothing shared yet, or "Other"
      ctx.fillStyle = P.bg; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.25 * px; ctx.stroke();
    } else { ctx.fillStyle = col; ctx.fill(); }
    if (n === focus) {                                                 // the dot you're on: a red ring
      ctx.globalAlpha = 1; ctx.strokeStyle = P.accent; ctx.lineWidth = 1.25 * px;
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 4 * px, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // labels, in screen space so they stay crisp at any zoom; set flush left of the dot, Swiss
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const t = opts.labels;
  const rank = (n) => (n === focus ? 0 : near?.has(n.id) ? 1 : searching && n.hit ? 2 : n.kind === 'subject' ? 3 : n.kind === 'class' ? 4 : 5);
  const show = (n) => {                                                // how visible this label is at this zoom (Obsidian's text fade)
    if (near?.has(n.id)) return Math.max(fade, n.kind === 'guide' ? smooth(1.05 * t, 1.5 * t, k) : 1);
    if (searching && n.hit && n.kind !== 'subject') return 1;
    const z = n.kind === 'subject' ? 1 : n.kind === 'class' ? (n.has ? smooth(.32 * t, .5 * t, k) : smooth(.95 * t, 1.3 * t, k) * .8) : smooth(1.25 * t, 1.75 * t, k);
    return z * dim(n.id) ** 2 * (n.hit ? 1 : .2);
  };
  const placed = [];
  const dots = N.filter((n) => dim(n.id) * (n.hit ? 1 : .14) > .3).map((n) => { const [x, y] = toScreen(n.x, n.y), r = drawR(n) * view.k + 2; return [x - r, y - r, x + r, y + r, n]; });
  const order = N.map((n) => [n, rank(n), current.deg[n.id] || 0]).sort((a, b) => a[1] - b[1] || b[2] - a[2]);
  const FONT = '"Helvetica Neue", Helvetica, Inter, Arial, system-ui, sans-serif';
  for (const [n, r] of order) {
    const a = show(n);
    if (a < .04) continue;
    const size = n.kind === 'subject' ? 14 : n.kind === 'class' ? 12 : 11;
    ctx.font = `${n.kind === 'subject' ? 700 : n === focus || n.kind === 'class' ? 500 : 400} ${size}px ${FONT}`;
    const text = clip(n.name, 34);
    const [sx, sy] = toScreen(n.x, n.y), rr = drawR(n) * view.k, w = ctx.measureText(text).width;
    // right of the dot first (flush left text), then left of it, then under, then over
    const spots = [[sx + rr + 9, sy], [sx - rr - 9 - w, sy], [sx - w / 2, sy + rr + 4 + size / 2], [sx - w / 2, sy - rr - 4 - size / 2]];
    let at = null;
    for (const [x, y] of spots) {
      const rect = [x - 2, y - size / 2 - 1, x + w + 2, y + size / 2 + 1];
      const over = (q) => rect[0] < q[2] && rect[2] > q[0] && rect[1] < q[3] && rect[3] > q[1];
      const inside = rect[0] > 4 && rect[2] < W - 4 && rect[1] > 4 && rect[3] < H - 4;
      if (r === 0 || (inside && !(placed.some(over) || dots.some((q) => q[4] !== n && (r > 1 || q[4] === focus) && over(q))))) { at = [x, y, rect]; break; }
    }
    if (!at) continue;
    placed.push(at[2]);
    ctx.globalAlpha = a;
    ctx.strokeStyle = P.bg; ctx.lineWidth = 4; ctx.strokeText(text, at[0], at[1]);   // a paper halo so text reads over lines
    ctx.fillStyle = n === focus ? P.accent : n.kind === 'guide' ? (r <= 2 ? P.ink : P.soft) : n.has === false ? P.soft : P.ink;
    ctx.fillText(text, at[0], at[1]);
  }
  ctx.globalAlpha = 1;
}

function frame(now) {
  raf = 0;
  const target = hover || sel ? 1 : 0;
  fade = still ? target : fade + (target - fade) * .22;
  if (cam) {
    const u = Math.min(1, (now - cam.t0) / cam.dur), e = 1 - Math.pow(1 - u, 3);
    for (const key of ['x', 'y', 'k']) view[key] = cam.from[key] + (cam.to[key] - cam.from[key]) * e;
    if (u >= 1) cam = null;
  }
  if (energy > .01 || dragging) { tick(); if (!dragging) tick(); }
  render();
  if (cam || energy > .01 || dragging || Math.abs(fade - target) > .01) raf = requestAnimationFrame(frame);
}
const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };
const stir = () => { energy = Math.max(energy, 1); wake(); };

function draw(replay = false) {
  load(replay);
  if (still) for (const n of N) { n.x = n.hx; n.y = n.hy; }
  stir();
  fit(false);
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
    if (press.n && press.moved) { [press.n.fx, press.n.fy] = toWorld(e.offsetX, e.offsetY); dragging = true; }
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
  if (press.n) { press.n.fx = press.n.fy = null; dragging = false; stir(); }
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

// Obsidian-style settings: Filters / Display, plus Animate
function panel() {
  const sl = (k, label, min, max, step) => `<label class="gv-sl"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${opts[k]}"></label>`;
  const tg = (k, label) => `<label class="gv-tg"><span>${label}</span><span class="tgl"><input type="checkbox" data-k="${k}" ${opts[k] ? 'checked' : ''}><span aria-hidden="true"></span></span></label>`;
  $('#gv-panel').innerHTML = `
    <details open><summary>Filters</summary>${tg('orphans', 'Classes without guides')}</details>
    <details><summary>Display</summary>${sl('labels', 'Text fade threshold', .4, 3, .1)}${sl('size', 'Node size', .15, 2, .05)}${sl('thick', 'Link thickness', .5, 3, .1)}${sl('spread', 'Spacing', .7, 1.8, .05)}</details>
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
      <div class="gv-k">${mark(TYPE[g.type].shape, 'currentColor')}${esc(TYPE[g.type].label)}${hasPdf && web ? ' · PDF and web version' : hasPdf ? ' · PDF' : g.type === 'guide' && web ? ' · web version' : ''}</div><h3>${esc(g.payload.title)}</h3>
      <p class="gv-m">${g.classes.map((c) => `<a href="${courseUrl(c)}">${esc(bySlug[c].name)}</a>`).join(' · ')}${g.teacher ? ` · ${esc(g.teacher)}’s class` : ''}</p>
      ${g.payload.note ? `<p>${esc(g.payload.note)}</p>` : ''}
      <p class="gv-m">${g.payload.author ? `Made by ${esc(g.payload.author)} · shared by ${esc(g.author)}` : `Made by ${esc(g.author)}`}</p>
      ${opens}`;
  } else if (n.kind === 'class') {
    const list = current.G.filter((g) => g.classes.includes(n.slug));
    card.innerHTML = `<button type="button" class="gv-x" aria-label="Close">✕</button>
      <div class="gv-k">${esc(dept[n.dept] || 'Class')}</div><h3>${esc(n.name)}</h3>
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
// the legend: one plain line, a shape per kind of resource there is (click to hide or show it)
function legend() {
  const present = TYPES.filter(([k]) => guides.some((g) => typeOf(g) === k));
  const hidden = new Set(opts.hide || []);
  $('#gv-legend').innerHTML = `<span class="gv-types">${present.map(([k, label, shp]) => `<button type="button" class="gv-type" data-type="${k}" aria-pressed="${!hidden.has(k)}" title="${hidden.has(k) ? 'Show' : 'Hide'} ${esc(label.toLowerCase())}">${mark(shp, 'currentColor')}${esc(label)}</button>`).join('')}</span>`;
}
$('#gv-legend').addEventListener('click', (e) => {
  const b = e.target.closest('[data-type]'); if (!b) return;
  const k = b.dataset.type, h = new Set(opts.hide || []);
  h.has(k) ? h.delete(k) : h.add(k);
  opts.hide = [...h]; save(); info(null); draw(); legend(); fit(false);
});
list();
panel();
new ResizeObserver(size).observe(box);
size();
draw();
legend();
fit(false);                                       // again, now the legend's height is known
// White / Black / Auto (follows the site's night mode), from the bar
const bgSeg = document.createElement('span');
bgSeg.className = 'gv-bg'; bgSeg.setAttribute('role', 'group'); bgSeg.setAttribute('aria-label', 'Background');
const paintBg = () => { bgSeg.innerHTML = [['white', 'White'], ['black', 'Black']].map(([k, l]) => `<button type="button" data-bg="${k}" aria-pressed="${dark() === (k === 'black')}">${l}</button>`).join('');
  $('#gv-graph').classList.toggle('gv-dark', dark()); $('#gv-graph').classList.toggle('gv-light', !dark()); };
$('#gv-zoom').before(bgSeg);
bgSeg.addEventListener('click', (e) => { const b = e.target.closest('[data-bg]'); if (!b) return; opts.bg = b.dataset.bg; save(); palette(); bgFill = P.bg; paintBg(); legend(); wake(); });
new MutationObserver(() => { if (opts.bg !== 'white' && opts.bg !== 'black') { palette(); paintBg(); legend(); wake(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
paintBg();
$('#gv-q').addEventListener('input', () => {        // search: dim what doesn't match, don't move anything
  const g = graph($('#gv-q').value), hits = new Map(g.nodes.map((n) => [n.id, n.hit]));
  for (const n of N) n.hit = hits.get(n.id) ?? true;
  wake();
});
const setPanel = (open) => { $('#gv-panel').hidden = !open; $('#gv-gear').setAttribute('aria-expanded', String(open)); };
$('#gv-gear').addEventListener('click', () => setPanel($('#gv-panel').hidden));
// the settings close on a click anywhere else (the graph included) or Escape, not only on the gear (Ethan)
document.addEventListener('pointerdown', (e) => {
  if (!$('#gv-panel').hidden && !e.target.closest('#gv-panel, #gv-gear')) setPanel(false);
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#gv-panel').hidden) { setPanel(false); $('#gv-gear').focus(); } });
$('#gv-panel').addEventListener('input', (e) => {
  const k = e.target.dataset.k; if (!k) return;
  opts[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
  save();
  if (e.target.type === 'checkbox') { draw(); legend(); fit(false); }        // filters change what's on the graph
  else if (k === 'spread') { const home = layout(N); for (const n of N) [n.hx, n.hy] = home.get(n.id); for (const l of L) l.rest = Math.hypot(l.a.hx - l.b.hx, l.a.hy - l.b.hy); stir(); fit(true); }
  else { for (const n of N) n.r = radius(n); wake(); }            // display: just redraw
});
$('#gv-panel').addEventListener('click', (e) => { if (e.target.id === 'gv-animate') draw(true); });
$('#gv-info').addEventListener('click', (e) => { if (e.target.closest('.gv-x')) { sel = null; info(null); wake(); } });
