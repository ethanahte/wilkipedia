// Everything else outside the quad: the creek's fences and footbridges, trees
// around campus, the pool deck, the stadium (bleachers, press box, lights,
// scoreboard, goal posts), backstops and dugouts, tennis fences, and the
// neighbourhood around the school (every house as OpenStreetMap traced it,
// with a hipped roof and windows; street and yard trees).

import * as THREE from 'three';
import { color, rng, inPoly, ensureCCW, distToLine, offsetLine, clipLineZ, bankLine } from './geo.js';
import { gbuffer, TOON } from './toon.js';
import { CREEK, creekAt, BRIDGES, FIELDS, TRACK, CAMPUS, WORLD, MONROE_PTS, CALABAZAS_PTS, BUILDINGS } from './layout.js';
import { OSM_HOUSES } from './osm.js';
import { STREETS } from './ground.js';
import { shadeTree, conifer, youngTree, cards, SOLID_UV, G } from './nature.js';
import { World } from './geo.js';
import { LIGHTS } from './lights.js';
import { addSegment, addCircle, addBox, addPoly } from './collide.js';

const post = color('#8f959b'), rail = color('#a6abb0'), conc = color('#cfcbc3'), alu = color('#b9bec3'), black = color('#222326');

// Chain-link fence along a polyline, height h, posts every 3 m.
export function fence(W, pts, h = 1.8, { collide = true } = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    W.quad('fence', [ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az], color('#b8bdc2'), [[0, 0], [len, 0], [len, h], [0, h]]);
    W.beam('flat', ax, az, bx, bz, h - 0.04, h + 0.02, 0.05, rail);
    const n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      W.cyl('flat', x, 0, z, 0.035, 0.035, h + 0.05, 5, post);
    }
    if (collide) addSegment(ax, az, bx, bz, 0.15);
  }
}

export function buildProps(W, scene, q, M) {
  const R = rng(77);
  // ── street lights along Monroe, on the campus side: pole, arm, cobra head ──
  for (const { x, z, nx, nz } of alongLine(MONROE_PTS, -9.9, 42, (x, z) => x > -190 && x < 250)) {
    const hx = x + nx * 2.7, hz = z + nz * 2.7, rot = Math.atan2(nx, nz);
    W.cyl('flat', x, 0, z, 0.12, 0.09, 8.2, 8, color('#8d9399'));
    W.rod('flat', [x, 8.0, z], [x + nx * 2.4, 8.3, z + nz * 2.4], 0.1, color('#8d9399'));
    W.box('flat', hx, 8.25, hz, 0.45, 0.18, 0.9, color('#7d8389'), rot);
    W.box('glow', hx, 8.15, hz, 0.34, 0.02, 0.7, color('#ffe2b0'), rot);
    addCircle(x, z, 0.2);
    LIGHTS.push([hx, hz, 8.2, 9]);
  }
  // ── creek: fences on both banks with gaps at the bridges and Monroe ──
  const gaps = [...BRIDGES.map((b) => [b.z - b.w / 2 - 0.2, b.z + b.w / 2 + 0.2]), [-120, -97], CREEK.culvert].sort((a, b) => a[0] - b[0]);
  for (const side of [-1, 1]) {
    const bank = bankLine(CREEK.pts, side * (CREEK.top + 0.5), side * (CREEK.south.top + 0.5), CREEK.culvert[0], -1e4, 1e4);
    let z = -97;
    for (const [g0, g1] of gaps) {
      if (g1 <= z) continue;
      if (g0 > z) fence(W, clipLineZ(bank, z, g0));
      z = g1;
    }
    fence(W, clipLineZ(bank, z, WORLD.z1 - 1));
  }
  // footbridges: flat concrete decks with pipe railings
  for (const b of BRIDGES) {
    const x0 = CREEK.x - CREEK.top - 0.6, x1 = CREEK.x + CREEK.top + 0.6;
    W.slab('flat', x0, b.z - b.w / 2, x1, b.z + b.w / 2, -0.35, 0.04, conc);
    for (const s of [-1, 1]) {
      const z = b.z + s * (b.w / 2 - 0.08);
      for (const y of [0.5, 1.05]) W.beam('flat', x0, z, x1, z, y, y + 0.05, 0.05, rail);
      for (let x = x0; x <= x1; x += 2.2) W.cyl('flat', x, 0, z, 0.03, 0.03, 1.1, 5, rail);
      addSegment(x0, z, x1, z, 0.1);
    }
  }
  // road decks where streets cross the channel
  W.slab('flat', CREEK.x - CREEK.top - 0.2, -108.5 - 12, CREEK.x + CREEK.top + 0.2, -108.5 + 12, -0.5, 0.01, color('#6a6e73'));   // Monroe

  // ── trees round campus ──
  for (const side of [-1, 1]) {
    for (let z = -92; z < CREEK.culvert[0] - 4; z += 8 + R() * 5) {
      if (BRIDGES.some((b) => Math.abs(z - b.z) < 5)) continue;
      const x = CREEK.x + side * (CREEK.top + 3 + R() * 3);
      if (BUILDINGS.some((b) => inPoly(x, z, b.poly))) continue;
      shadeTree(W, x, z, R, { h: 8 + R() * 5 });
      addCircle(x, z, 0.4);
    }
  }
  // tall conifers south of the science building and west of the theatre
  for (let x = -84; x < -14; x += 8.5) { conifer(W, x + R() * 2, 142 + R() * 3, R, { h: 14 + R() * 6 }); }
  // (the row along Calabazas, between the sidewalk and the theatre)
  for (const { x, z } of alongLine(CALABAZAS_PTS, -12.5, 9, (x, z) => z > -95 && z < 12 && x > WORLD.x0 + 3)) {
    if (BUILDINGS.some((b) => inPoly(x, z, b.poly))) continue;
    conifer(W, x, z, R, { h: 15 + R() * 6 });
  }
  // street trees along Monroe on the campus side
  for (const { x, z } of alongLine(MONROE_PTS, -12.4, 19, (x, z) => x > -170 && x < 200 && !(x > -30 && x < -14))) {
    youngTree(W, x, z, R, { h: 6 + R() * 1.5, stake: false });   // (a gap keeps the view of the front office clear)
    addCircle(x, z, 0.3);
  }
  // round the fields
  for (let x = -40; x < 60; x += 11) shadeTree(W, x, 265 - x * 0.3, R, { h: 9 + R() * 3 });
  for (const [x, z] of [[-150, 60], [-150, 85], [-30, 150], [140, 60], [150, 205], [200, 190], [60, 214]]) {
    shadeTree(W, x, z, R, { h: 8 + R() * 4 }); addCircle(x, z, 0.4);
  }

  pool(W);
  stadium(W, R);
  diamonds(W);
  tennis(W);
  neighbourhood(W, scene, R, q, M);
}

function pool(W) {
  const [[dx0, dz0], , [dx1, dz1]] = FIELDS.pool.deck;
  fence(W, [[dx0, dz0], [dx1, dz0], [dx1, dz1], [dx0, dz1], [dx0, dz0]], 2.1);
  const [[wx0, wz0], , [wx1, wz1]] = FIELDS.pool.water;
  for (let i = 0; i < 8; i++) {
    const z = wz0 + ((i + 0.5) * (wz1 - wz0)) / 8;
    W.box('flat', wx0 - 0.4, 0.35, z, 0.55, 0.7, 0.55, color('#f2f2ee'));
    W.box('flat', wx0 - 0.2, 0.72, z, 0.6, 0.06, 0.55, color('#2f5f9e'));
  }
  // lifeguard chair
  const lx = (wx0 + wx1) / 2, lz = wz1 + 2.2;
  for (const [ox, oz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) W.cyl('flat', lx + ox, 0, lz + oz, 0.04, 0.04, 1.9, 5, color('#e8e8e2'));
  W.box('flat', lx, 1.9, lz, 0.9, 0.08, 0.7, color('#e8e8e2'));
  W.box('flat', lx, 2.3, lz + 0.35, 0.9, 0.8, 0.06, color('#d23a33'));
}

// Aluminium bleachers: rows rising away from the field.
function bleachers(W, x0, z0, x1, z1, facing, rows, { press = false } = {}) {
  // facing: +1 = seats face +x, -1 = face -x
  const depth = Math.abs(x1 - x0), rowD = depth / rows, len = z1 - z0;
  for (let i = 0; i < rows; i++) {
    const y = 0.45 + i * 0.4;
    const xa = facing > 0 ? x1 - (i + 1) * rowD : x0 + i * rowD;
    W.slab('flat', xa, z0, xa + rowD, z1, y - 0.05, y, i % 2 ? alu : color('#c9cdd1'));
    W.slab('flat', xa, z0, xa + rowD, z1, 0, y - 0.05, color('#8d9297'), new Set(['top']));
  }
  const back = facing > 0 ? x0 : x1;
  W.slab('flat', back - 0.1, z0, back + 0.1, z1, 0, 0.45 + rows * 0.4 + 1.1, color('#8d9297'));
  addBox(Math.min(x0, x1), z0, Math.max(x0, x1), z1);
  if (press) {
    const px = facing > 0 ? x0 - 1.5 : x1 + 1.5, y = 0.45 + rows * 0.4;
    W.slab('flat', px - 2, z0 + len * 0.35, px + 2, z0 + len * 0.65, y, y + 3.2, color('#e8e3d6'));
    W.slab('flat', px - 2.2, z0 + len * 0.35 - 0.2, px + 2.2, z0 + len * 0.65 + 0.2, y + 3.2, y + 3.45, black);
    const gx = facing > 0 ? px + 2.02 : px - 2.02;
    W.quad('glass', [gx, y + 1.3, z0 + len * 0.36], [gx, y + 1.3, z0 + len * 0.64], [gx, y + 2.6, z0 + len * 0.64], [gx, y + 2.6, z0 + len * 0.36].map((v) => v), color('#fff'), 'auto');
  }
}

function stadium(W, R) {
  const [[hx0, hz0], , [hx1, hz1]] = FIELDS.homeStands;
  bleachers(W, hx0, hz0, hx1, hz1, 1, 18, { press: true });
  const [[ax0, az0], , [ax1, az1]] = FIELDS.awayStands;
  bleachers(W, ax0, az0, ax1, az1, -1, 14);
  // light poles
  for (const [x, z] of [[184, 40], [184, 134], [297, 40], [297, 134]]) {
    W.cyl('flat', x, 0, z, 0.35, 0.22, 24, 8, color('#b7bcc1'));
    W.slab('flat', x - 1.8, z - 0.2, x + 1.8, z + 0.2, 23.2, 25.4, color('#51565c'));
    addCircle(x, z, 0.45);
  }
  // scoreboard beyond the south end zone: black with gold trim
  const sx = TRACK.x, sz = TRACK.z + 92 + 3;
  for (const o of [-3.5, 3.5]) W.cyl('flat', sx + o, 0, sz, 0.2, 0.2, 4.5, 8, color('#51565c'));
  W.slab('flat', sx - 5.2, sz - 0.4, sx + 5.2, sz + 0.4, 4.5, 8.6, color('#1b1c1f'));
  W.slab('flat', sx - 5.4, sz - 0.45, sx + 5.4, sz + 0.45, 8.6, 8.85, color('#e0a82e'));
  W.slab('flat', sx - 5.4, sz - 0.45, sx + 5.4, sz + 0.45, 4.3, 4.5, color('#e0a82e'));
  // goal posts (gold)
  const yd = 0.9144, gz = 60 * yd;
  for (const s of [-1, 1]) {
    const z = TRACK.z + s * gz;
    W.cyl('flat', TRACK.x, 0, z + s * 1.2, 0.1, 0.1, 3.05, 8, color('#e7b73a'));
    W.beam('flat', TRACK.x, z + s * 1.2, TRACK.x, z, 3.0, 3.1, 0.12, color('#e7b73a'));
    W.beam('flat', TRACK.x - 2.82, z, TRACK.x + 2.82, z, 3.0, 3.12, 0.1, color('#e7b73a'));
    for (const o of [-2.82, 2.82]) W.cyl('flat', TRACK.x + o, 3.05, z, 0.05, 0.05, 6, 6, color('#e7b73a'));
  }
  // fence round the track
  fence(W, [[192, 176], [192, -2], [287, -2], [287, 176], [192, 176]], 1.2, { collide: false });
  // soccer goals
  const [[sx0, sz0], , [sx1, sz1]] = FIELDS.soccer, mz = (sz0 + sz1) / 2;
  for (const x of [sx0 + 3, sx1 - 3]) {
    for (const o of [-3.66, 3.66]) W.cyl('flat', x, 0, mz + o, 0.06, 0.06, 2.44, 6, color('#f4f4f0'));
    W.beam('flat', x, mz - 3.66, x, mz + 3.66, 2.38, 2.48, 0.1, color('#f4f4f0'));
  }
}

function diamonds(W) {
  for (const F of [FIELDS.softball, FIELDS.baseball]) {
    const [hx, hz] = F.home, d = F.dir;
    // backstop: a tall curved fence behind home
    const pts = [];
    for (let i = 0; i <= 6; i++) { const a = d + Math.PI - 0.9 + (1.8 * i) / 6; pts.push([hx + Math.cos(a) * 9, hz + Math.sin(a) * 9]); }
    fence(W, pts, 6);
    // dugouts along both foul lines
    for (const s of [-1, 1]) {
      const a = d + s * (Math.PI / 4 + 0.25), r = 15;
      W.with(hx + Math.cos(a) * r, 0, hz + Math.sin(a) * r, -a, () => {
        W.box('flat', 0, 1.2, 0, 7, 2.4, 2.2, color('#d8d2c4'), 0, new Set(['s']));
        W.box('flat', 0, 2.45, 0.2, 7.4, 0.12, 2.8, color('#6f7479'));
      });
    }
    // outfield fence
    const of = [];
    for (let i = 0; i <= 16; i++) { const a = d - Math.PI / 4 + (Math.PI / 2) * (i / 16); of.push([hx + Math.cos(a) * F.fence, hz + Math.sin(a) * F.fence]); }
    fence(W, of, 2.4, { collide: false });
  }
}

function tennis(W) {
  const T = FIELDS.tennis, c = Math.cos(T.rot), s = Math.sin(T.rot);
  const tp = (ax, az) => [T.x + ax * c - az * s, T.z + ax * s + az * c];
  fence(W, [tp(-T.w / 2, -T.l / 2), tp(T.w / 2, -T.l / 2), tp(T.w / 2, T.l / 2), tp(-T.w / 2, T.l / 2), tp(-T.w / 2, -T.l / 2)], 3.2, { collide: true });
  for (let row = 0; row < 2; row++) for (let i = 0; i < 2; i++) {
    const ox = -T.w / 4 + (i * T.w) / 2, oz = -T.l / 4 + (row * T.l) / 2;
    const a = tp(ox - 6.4, oz), b = tp(ox + 6.4, oz);
    W.quad('fence', [a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], 1.0, b[1]], [a[0], 1.0, a[1]], color('#222'), 'auto');
    W.beam('flat', a[0], a[1], b[0], b[1], 0.98, 1.05, 0.05, color('#f4f4f0'));
  }
}

// Points every `step` metres along a line, `off` metres to its side (positive =
// right of travel), with the unit vector back toward the line.
function alongLine(pts, off, step, keep = () => true) {
  const out = [], side = offsetLine(pts, off);
  let s = step / 2, run = 0;
  for (let i = 0; i < side.length - 1; i++) {
    const [ax, az] = side[i], [bx, bz] = side[i + 1], len = Math.hypot(bx - ax, bz - az);
    const [cx, cz] = pts[i], [dx, dz] = pts[i + 1];
    for (; s < run + len; s += step) {
      const k = (s - run) / len, x = ax + (bx - ax) * k, z = az + (bz - az) * k;
      const lx = cx + (dx - cx) * k - x, lz = cz + (dz - cz) * k - z, l = Math.hypot(lx, lz) || 1;
      if (keep(x, z)) out.push({ x, z, nx: lx / l, nz: lz / l });
    }
    run += len;
  }
  return out;
}

// ── the neighbourhood: every house OpenStreetMap has, and trees ──
// A polygon (counter-clockwise from above) moved inward by d, corners mitred.
function inset(P, d) {
  const n = P.length, N = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % n], l = Math.hypot(bx - ax, bz - az) || 1;
    N.push([(bz - az) / l, -(bx - ax) / l]);      // inward normal
  }
  return P.map(([x, z], i) => {
    const a = N[(i + n - 1) % n], b = N[i], k = Math.max(0.2, 1 + a[0] * b[0] + a[1] * b[1]);
    return [x + ((a[0] + b[0]) / k) * d, z + ((a[1] + b[1]) / k) * d];
  });
}
// How far a hipped roof can climb before its edges would cross: the largest
// inset that keeps every edge pointing the same way and inside the walls.
function hipDepth(P) {
  const ok = (d) => {
    const Q = inset(P, d);
    for (let i = 0; i < P.length; i++) {
      const j = (i + 1) % P.length;
      if ((Q[j][0] - Q[i][0]) * (P[j][0] - P[i][0]) + (Q[j][1] - Q[i][1]) * (P[j][1] - P[i][1]) < -1e-6) return false;
      if (!inPoly(Q[i][0], Q[i][1], P)) return false;
    }
    return true;
  };
  let lo = 0, hi = 9;
  for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}
function hull(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

const HOUSE_WALLS = ['#efe6d6', '#e8dcc6', '#dfe3e6', '#f1ecde', '#e4d3bc', '#d9dfd7', '#e9e1cf', '#d7d0c4'].map(color);
const HOUSE_ROOFS = ['#6f6c69', '#7a7f86', '#5f625f', '#8e5a45', '#9b6b4f', '#b46a4c', '#6d6a66', '#846f5c'].map(color);
const H_LIT = color('#ffffff'), H_DARK = color('#b9bec8');

function house(W, R, levels, flat) {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  const P = ensureCCW(pts);
  const wall = HOUSE_WALLS[Math.floor(R() * HOUSE_WALLS.length)], roofCol = HOUSE_ROOFS[Math.floor(R() * HOUSE_ROOFS.length)];
  const H = 2.9 * levels + 0.3;
  W.prism('stucco', P, 0, H, wall, { top: false });
  // windows: a few panes on every wall long enough, some lit
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], len = Math.hypot(bx - ax, bz - az);
    if (len < 4) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len, ox = uz * 0.04, oz = -ux * 0.04;   // just proud of the wall
    const count = Math.floor(len / 4.5);
    for (let f = 0; f < levels; f++) {
      for (let k = 0; k < count; k++) {
        if (R() < 0.3) continue;
        const t = (len * (k + 0.5)) / count, w = 0.7, y0 = 1.0 + f * 2.9, y1 = y0 + 1.25;
        const x0 = ax + ux * (t - w) + ox, z0 = az + uz * (t - w) + oz, x1 = ax + ux * (t + w) + ox, z1 = az + uz * (t + w) + oz;
        W.quad('glass', [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], R() < 0.45 ? H_LIT : H_DARK, 'auto');
      }
    }
  }
  // hipped roof: eaves 0.35 m out, sides climbing at ~27° to the ridge
  const O = inset(P, -0.35), d = hipDepth(P), Q = inset(P, d * 0.999), top = H + Math.min(d * 0.5, 3.2) + 0.18;
  for (let i = 0; i < P.length; i++) {
    const j = (i + 1) % P.length;
    W.quad('flat', [O[i][0], H, O[i][1]], [O[j][0], H, O[j][1]], [Q[j][0], top, Q[j][1]], [Q[i][0], top, Q[i][1]], roofCol, 'auto');
  }
  W.cap('flat', Q, top, roofCol, true);                // a flat crown where the hips can't meet
  addPoly(ensureCCW(hull(P)));
}

function neighbourhood(W, scene, R, q, M) {
  // the houses go in one batch per material: they ring the whole world, so
  // chunking them would only multiply draw calls
  const HW = new World({ chunk: 1e5 });
  const homes = OSM_HOUSES.map(([levels, flat]) => {
    house(HW, R, levels, flat);
    const xs = flat.filter((_, i) => i % 2 === 0), zs = flat.filter((_, i) => i % 2 === 1);
    return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
  });
  const hg = new THREE.Group();
  HW.build(M, hg);
  scene.add(hg);

  // trees: along the streets, then scattered through the yards
  const trees = [];
  const clear = (x, z, pad) => {
    if (x < WORLD.x0 + 3 || x > WORLD.x1 - 3 || z < WORLD.z0 + 3 || z > WORLD.z1 - 3) return false;
    if (inPoly(x, z, CAMPUS)) return false;
    if (distToLine(x, z, CREEK.pts) < creekAt(z).top + 3) return false;
    for (const s of STREETS) if (distToLine(x, z, s.pts) < s.w / 2 + 1.2 + pad) return false;
    for (const h of homes) if (x > h.x0 - pad - 1 && x < h.x1 + pad + 1 && z > h.z0 - pad - 1 && z < h.z1 + pad + 1) return false;
    for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < 5) return false;
    return true;
  };
  for (const s of STREETS) {
    for (const off of [-(s.w / 2 + 2.2), s.w / 2 + 2.2]) {
      for (const p of alongLine(s.pts, off, 13)) if (R() < 0.55 && clear(p.x, p.z, 0)) trees.push({ x: p.x, z: p.z, s: 0.7 + R() * 0.6 });
    }
  }
  for (let i = 0; i < 2500; i++) {
    const x = WORLD.x0 + R() * (WORLD.x1 - WORLD.x0), z = WORLD.z0 + R() * (WORLD.z1 - WORLD.z0);
    if (clear(x, z, 1.5)) trees.push({ x, z, s: 0.7 + R() * 0.8 });
  }

  const mat = () => gbuffer(new THREE.MeshToonMaterial({ gradientMap: TOON }));
  const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 1, 5).translate(0, 0.5, 0), mat(), trees.length);
  const crown = new THREE.InstancedMesh(crownGeometry(R), M.foliage, trees.length);
  crown.customDepthMaterial = M.foliage.userData.depthMat;
  trees.forEach((t, i) => {
    const h = 7 * t.s;
    m.compose(new THREE.Vector3(t.x, 0, t.z), qn.identity(), new THREE.Vector3(1, h * 0.45, 1));
    trunk.setMatrixAt(i, m); trunk.setColorAt(i, G.barkDark);
    m.compose(new THREE.Vector3(t.x, h * 0.62, t.z), qn.setFromAxisAngle(up, R() * 6), new THREE.Vector3(h * 0.36, h * 0.32, h * 0.36));
    crown.setMatrixAt(i, m); crown.setColorAt(i, G.dark[i % 3]);
    addCircle(t.x, t.z, 0.3);
  });
  for (const im of [trunk, crown]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); }
}

// One reusable crown for the street trees: a solid core wrapped in leaf cards.
function crownGeometry(R) {
  const W = new World();
  cards(W, 0, 0, 0, 1, 0.85, 1, new THREE.Color(1, 1, 1), R, 70, 0.9);
  const b = [...W.buckets.values()][0];
  const core = new THREE.IcosahedronGeometry(0.66, 1);
  const cp = core.attributes.position.array, cn = core.attributes.normal.array;
  const P = [...b.p], N = [...b.n], U = [...b.u], C = [...b.c];
  for (let i = 0; i < cp.length; i += 3) {
    P.push(cp[i], cp[i + 1] * 0.85, cp[i + 2]); N.push(cn[i], cn[i + 1], cn[i + 2]); U.push(...SOLID_UV); C.push(0.6, 0.6, 0.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
