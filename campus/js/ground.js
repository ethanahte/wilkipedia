// The ground, painted like an illustration: three canvases laid flat.
//   world   — the whole 860 × 710 m map: streets, lots with stall lines, fields,
//             tennis, the pool, lawns, the neighbourhood's yards
//   quad    — the quad at 5 cm a pixel: saw-cut concrete slabs, both lawns with
//             mow stripes, the walk round the stage, mulch beds
//   stadium — the track and football field at 10 cm a pixel, with the black end
//             zones, gold "WILCOX" / "CHARGERS" and the midfield bolt
// Plus the creek: a concrete channel with sloped banks and water at the bottom.

import * as THREE from 'three';
import { color, distToLine, offsetLine, clipLineZ, bankLine } from './geo.js';
import { gbuffer, TOON, maxAniso } from './toon.js';
import {
  WORLD, CAMPUS, LOTS, ROADS, BUILDINGS, FIELDS, TRACK, QUAD, STAGE,
  LAWN_W, LAWN_E, CEDAR, CREEK, creekAt, LAWN_TREES, BRIDGES,
} from './layout.js';
import { treeSpots } from './quad.js';
import { addHeight } from './collide.js';

export const STREETS = [];     // every street in the world ({ name, pts, w, center }), filled by planStreets()

function painter(g, x0, z0, x1, z1, W, H) {
  const sx = W / (x1 - x0), sz = H / (z1 - z0);
  const P = (x, z) => [(x - x0) * sx, (z - z0) * sz];
  const api = {
    sx,
    poly(pts, fill) { g.beginPath(); pts.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); g.fillStyle = fill; g.fill(); },
    rect(xa, za, xb, zb, fill) { const [a, b] = P(xa, za), [c, d] = P(xb, zb); g.fillStyle = fill; g.fillRect(a, b, c - a, d - b); },
    line(pts, w, stroke, { cap = 'round', dash = null } = {}) {
      g.beginPath(); pts.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
      g.lineWidth = Math.max(1, w * sx); g.strokeStyle = stroke; g.lineCap = cap; g.lineJoin = 'round';
      g.setLineDash(dash ? dash.map((d) => d * sx) : []); g.stroke(); g.setLineDash([]);
    },
    circle(x, z, r, fill, stroke, lw = 0.15) {
      const [a, b] = P(x, z); g.beginPath(); g.arc(a, b, r * sx, 0, Math.PI * 2);
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.lineWidth = Math.max(1, lw * sx); g.strokeStyle = stroke; g.stroke(); }
    },
    sector(x, z, r0, r1, a0, a1, fill) {
      const [a, b] = P(x, z); g.beginPath(); g.arc(a, b, r1 * sx, a0, a1); if (r0 > 0) g.arc(a, b, r0 * sx, a1, a0, true); else g.lineTo(a, b);
      g.closePath(); g.fillStyle = fill; g.fill();
    },
    text(s, x, z, size, fill, rot = 0, font = '700', family = '"Arial Black", "Helvetica Neue", Arial, sans-serif') {
      const [a, b] = P(x, z); g.save(); g.translate(a, b); g.rotate(rot); g.fillStyle = fill; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${font} ${size * sx}px ${family}`; g.fillText(s, 0, 0); g.restore();
    },
    P, g,
  };
  return api;
}

function blotches(g, W, H, n, cols, rmin, rmax, seed = 11) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.25 + r() * 0.3;
    g.beginPath(); g.ellipse(r() * W, r() * H, rmin + r() * (rmax - rmin), rmin + r() * (rmax - rmin), r() * 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function texFrom(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// A flat ground plane covering [x0,z0]-[x1,z1] with part of a texture that covers [tx0..tx1] × [tz0..tz1].
function plane(x0, z0, x1, z1, y, tex, t0) {
  const g = new THREE.BufferGeometry();
  const [tx0, tz0, tx1, tz1] = t0;
  const u = (x) => (x - tx0) / (tx1 - tx0), v = (z) => 1 - (z - tz0) / (tz1 - tz0);
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u(x0), v(z1), u(x1), v(z1), u(x1), v(z0), u(x0), v(z1), u(x1), v(z0), u(x0), v(z0)], 2));
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: TOON });
  // a detail layer lies 2 cm over the ground: also pull it forward in depth, or
  // at a distance / a glancing angle the two can't be told apart and flicker
  if (y > 0) { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4; }
  const m = new THREE.Mesh(g, gbuffer(mat));
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}

// The streets round the school, as OpenStreetMap has them (layout.js ROADS).
export function planStreets() {
  STREETS.length = 0;
  STREETS.push(...ROADS);
}

// Flat ground over a polygon, textured by world position like plane().
function groundPoly(poly, y, tex, t0) {
  const [tx0, tz0, tx1, tz1] = t0;
  const tris = THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const pos = [], uv = [], nor = [];
  for (const t of tris) {
    // wind each triangle so its face points up
    const [a, b, c] = t.map((k) => poly[k]);
    const upward = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
    for (const k of upward ? t : [t[0], t[2], t[1]]) {
      const [x, z] = poly[k];
      pos.push(x, y, z); nor.push(0, 1, 0); uv.push((x - tx0) / (tx1 - tx0), 1 - (z - tz0) / (tz1 - tz0));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, gbuffer(new THREE.MeshToonMaterial({ map: tex, gradientMap: TOON })));
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}

export function buildGround(scene, q = 1) {
  planStreets();
  // ── the world canvas ──
  const WW = Math.round(2048 * q), WH = Math.round(WW * (WORLD.z1 - WORLD.z0) / (WORLD.x1 - WORLD.x0));
  const wc = makeCanvas(WW, WH), g = wc.getContext('2d');
  const p = painter(g, WORLD.x0, WORLD.z0, WORLD.x1, WORLD.z1, WW, WH);
  g.fillStyle = '#b3c38f'; g.fillRect(0, 0, WW, WH);
  blotches(g, WW, WH, 900, ['#a4b67f', '#c0cd9b', '#9fb27a', '#c9d2a6'], 3, 14);

  // streets (sidewalk first, asphalt over it)
  const road = (pts, w, side = 2.5, center = false) => {
    p.line(pts, w + side * 2, '#d8d4ca'); p.line(pts, w, '#676b70');
    if (center) p.line(pts, 0.35, '#e8c341');
  };

  // campus paving and planting
  p.poly(CAMPUS, '#d6d2c9');
  // grass and dry grass along the creek banks
  // (only where it's open: nothing shows over the culvert)
  const [c0, c1] = CREEK.culvert;
  p.line(clipLineZ(CREEK.pts, WORLD.z0 - 20, c0), 30, '#b7ae80', { cap: 'butt' });
  p.line(clipLineZ(CREEK.pts, WORLD.z0 - 20, c0), 24, '#a9a574', { cap: 'butt' });
  p.line(clipLineZ(CREEK.pts, c1, WORLD.z1 + 20), CREEK.south.top * 2 + 3, '#a9a574', { cap: 'butt' });
  // residential streets (after the creek's banks: south of the culvert they run right beside it)
  for (const s of STREETS) if (!s.center) road(s.pts, s.w, 1.6);
  // lawns and beds between buildings (from the satellite)
  p.rect(-176, -50, -160, 110, '#98b865');           // west edge by Calabazas
  p.rect(-93, -78, -88, 68, '#8fb35c');              // strip along B's west side
  p.rect(-110, 100, -12, 150, '#97b765');            // round the science building
  p.rect(-160, 40, -148, 110, '#98b865');

  // parking lots
  for (const L of LOTS) {
    const [x0, z0, x1, z1] = L.r;
    p.rect(x0, z0, x1, z1, '#6c7075');
    for (let z = z0 + 0.6; z + 11 <= z1; z += 18.3) {
      for (const zz of [z, z + 5.5, z + 11]) p.line([[x0 + 1, zz], [x1 - 1, zz]], 0.14, '#f4f4f0', { cap: 'butt' });
      for (let x = x0 + 1; x <= x1 - 1; x += 2.75) p.line([[x, z], [x, z + 11]], 0.14, '#f4f4f0', { cap: 'butt' });
    }
  }
  // the front drive: yellow curb, yellow arrows (photo of the flagpole)
  p.line([[-75, -80.2], [-18, -80.2]], 0.35, '#e3c43a', { cap: 'butt' });
  arrow(p, -40, -86, 0, '#e3c43a'); arrow(p, -58, -86, 0, '#e3c43a');
  // the gym-entrance lot: yellow curb and white arrows
  p.line([[108, -49.2], [205, -49.2]], 0.35, '#e3c43a', { cap: 'butt' });
  for (const x of [125, 150, 175]) arrow(p, x, -55, Math.PI, '#f4f4f0');

  // Monroe, Calabazas, San Juan
  for (const s of STREETS) if (s.center) road(s.pts, s.w, s.w > 16 ? 3 : 2.5, true);
  // school crosswalk in front of the office (yellow ladder)
  for (let i = 0; i < 9; i++) p.rect(-26 + (i % 2) * 0.1, -117.5 + i * 2, -18, -116.5 + i * 2, '#e8c341');
  p.rect(-26, -117.5, -25.5, -99.5, '#e8c341'); p.rect(-18.5, -117.5, -18, -99.5, '#e8c341');

  fields(p);

  // pool deck and water
  const { deck, water } = FIELDS.pool;
  p.poly(deck, '#e4e1db');
  p.poly(water, '#3ab0c8');
  const [[wx0, wz0], , [wx1, wz1]] = water;
  for (let i = 1; i < 8; i++) { const z = wz0 + (i * (wz1 - wz0)) / 8; p.line([[wx0 + 1.5, z], [wx1 - 1.5, z]], 0.25, '#23839c', { cap: 'butt' }); }
  // building footprints (under the walls)
  for (const b of BUILDINGS) p.poly(b.poly, '#bdb9b1');

  const worldTex = texFrom(wc);
  const WB = [WORLD.x0, WORLD.z0, WORLD.x1, WORLD.z1];
  // two pieces of ground, west and east of the creek's channel (narrower south of the culvert)
  const bank = (s) => bankLine(CREEK.pts, s * CREEK.top, s * CREEK.south.top, c0, WORLD.z0, WORLD.z1);
  scene.add(groundPoly([[WORLD.x0, WORLD.z0], ...bank(1), [WORLD.x0, WORLD.z1]], 0, worldTex, WB));
  scene.add(groundPoly([...bank(-1), [WORLD.x1, WORLD.z1], [WORLD.x1, WORLD.z0]], 0, worldTex, WB));
  // and the strip over the culvert
  const ws = CREEK.south.top;
  scene.add(groundPoly([...clipLineZ(offsetLine(CREEK.pts, ws), c0, c1), ...clipLineZ(offsetLine(CREEK.pts, -ws), c0, c1).reverse()], 0, worldTex, WB));

  // ── quad detail ──
  const Q = { x0: -56, z0: -31, x1: 36.5, z1: 38 };
  const QW = Math.round(1850 * q), QH = Math.round(QW * (Q.z1 - Q.z0) / (Q.x1 - Q.x0));
  const qc = makeCanvas(QW, QH), qg = qc.getContext('2d');
  const qp = painter(qg, Q.x0, Q.z0, Q.x1, Q.z1, QW, QH);
  quadPaint(qp, qg, QW, QH, Q);
  scene.add(plane(Q.x0, Q.z0, Q.x1, Q.z1, 0.02, texFrom(qc), [Q.x0, Q.z0, Q.x1, Q.z1]));

  // ── stadium detail ──
  const S = { x0: TRACK.x - 50, z0: TRACK.z - 92, x1: TRACK.x + 50, z1: TRACK.z + 92 };
  const SW = Math.round(1000 * q), SH = Math.round(SW * 1.84);
  const sc = makeCanvas(SW, SH), sg = sc.getContext('2d');
  stadiumPaint(painter(sg, S.x0, S.z0, S.x1, S.z1, SW, SH), sg, SW, SH);
  scene.add(plane(S.x0, S.z0, S.x1, S.z1, 0.02, texFrom(sc), [S.x0, S.z0, S.x1, S.z1]));

  creek(scene);
  plinth(scene);
  return { worldCanvas: wc };
}

function arrow(p, x, z, rot, col) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const T = (ax, az) => [x + ax * c - az * s, z + ax * s + az * c];
  p.poly([T(-0.25, 1.6), T(0.25, 1.6), T(0.25, -0.2), T(0.8, -0.2), T(0, -1.6), T(-0.8, -0.2), T(-0.25, -0.2)], col);
}

function quadPaint(p, g, W, H, Q) {
  // concrete, poured in big slabs with saw-cut joints
  g.fillStyle = '#dedad1'; g.fillRect(0, 0, W, H);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let x = Q.x0; x < Q.x1; x += 3.05) for (let z = Q.z0; z < Q.z1; z += 4.5) {
    const k = Math.floor(r() * 10) - 5;
    p.rect(x, z, x + 3.05, z + 4.5, `rgb(${222 + k},${218 + k},${209 + k})`);
  }
  for (let x = Q.x0; x < Q.x1; x += 3.05) p.line([[x, Q.z0], [x, Q.z1]], 0.03, 'rgba(120,112,100,0.45)', { cap: 'butt' });
  for (let z = Q.z0; z < Q.z1; z += 4.5) p.line([[Q.x0, z], [Q.x1, z]], 0.03, 'rgba(120,112,100,0.45)', { cap: 'butt' });
  // planting bed along Building B (grasses and the art poles)
  p.rect(-54.7, -27, -50.6, 36, '#8a6c52');
  // the cafeteria walkway and the canopy walk: a finer, lighter finish
  p.rect(-17.8, -30.4, 36.5, -27, '#e6e2da');
  p.rect(-54.7, -33.6, -17.8, -28.4, '#e6e2da');
  // walk round the stage
  const { x: cx, z: cz } = STAGE;
  p.sector(cx, cz, 0, STAGE.walk, 0, Math.PI, '#e7e3db');
  for (let a = 0; a <= Math.PI + 0.01; a += Math.PI / 14) {
    p.line([[cx + Math.cos(a) * STAGE.plant, cz + Math.sin(a) * STAGE.plant], [cx + Math.cos(a) * STAGE.walk, cz + Math.sin(a) * STAGE.walk]], 0.03, 'rgba(120,112,100,0.45)');
  }
  // lawns, clipped by the walk round the stage
  g.save();
  g.beginPath(); g.rect(0, 0, W, H);
  const [a, b] = p.P(cx, cz); g.moveTo(a + STAGE.walk * p.sx, b); g.arc(a, b, STAGE.walk * p.sx, 0, Math.PI * 2, true);
  g.clip('evenodd');
  g.beginPath();
  const lawnPath = (pts) => pts.forEach(([x, z], i) => { const [u, v] = p.P(x, z); i ? g.lineTo(u, v) : g.moveTo(u, v); });
  const [lx0, lz0, lx1, lz1] = LAWN_W.box;
  lawnPath([[lx0, lz0], [lx1, lz0], [lx1, lz1], [lx0, lz1]]); g.closePath();
  lawnPath(LAWN_E); g.closePath();
  g.clip();
  g.fillStyle = '#79b54a'; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.2;
  for (let x = -60; x < 40; x += 2.4) p.line([[x, 8], [x + 12, 40]], 1.2, '#b8e07e', { cap: 'butt' });
  g.globalAlpha = 1;
  g.restore();
  // planting ring round the stage
  p.sector(cx, cz, STAGE.wall, STAGE.plant, 0, Math.PI, '#7b624a');
  // the cedar's bed
  p.circle(CEDAR.x, CEDAR.z, CEDAR.bed, '#5f4b3b');
  // mulch rings for the young trees
  for (const [x, z] of treeSpots()) p.circle(x, z, 1.15, '#7d5f47');
  for (const [x, z] of LAWN_TREES) p.circle(x, z, 0.7, '#7d5f47');
}

function stadiumPaint(p, g, W, H) {
  const cx = TRACK.x, cz = TRACK.z, r0 = TRACK.r, lanes = TRACK.lanes, half = TRACK.straight / 2;
  g.fillStyle = '#8c8f8e'; g.fillRect(0, 0, W, H);
  const oval = (r) => {
    g.beginPath();
    const [a, b] = p.P(cx - r, cz - half); g.moveTo(a, b);
    const [c1x, c1y] = p.P(cx, cz - half); g.arc(c1x, c1y, r * p.sx, Math.PI, 0);
    const [c2x, c2y] = p.P(cx, cz + half); g.arc(c2x, c2y, r * p.sx, 0, Math.PI);
    g.closePath();
  };
  const R1 = r0 + lanes * 1.22;
  oval(R1 + 1); g.fillStyle = '#b8543f'; g.fill();
  oval(r0); g.fillStyle = '#4c9446'; g.fill();
  g.strokeStyle = '#f7f1ea'; g.lineWidth = Math.max(1, 0.06 * p.sx);
  for (let i = 0; i <= lanes; i++) { oval(r0 + i * 1.22); g.stroke(); }
  // football field: 120 × 53⅓ yards
  const yd = 0.9144, fw = 53.333 * yd, fl = 120 * yd;
  const fx0 = cx - fw / 2, fx1 = cx + fw / 2, fz0 = cz - fl / 2, fz1 = cz + fl / 2;
  for (let i = 0; i < 24; i++) p.rect(fx0 - 1.8, fz0 + i * 5 * yd, fx1 + 1.8, fz0 + (i + 1) * 5 * yd, i % 2 ? '#4f9b48' : '#57a551');
  p.rect(fx0, fz0, fx1, fz0 + 10 * yd, '#1d1d1d');
  p.rect(fx0, fz1 - 10 * yd, fx1, fz1, '#1d1d1d');
  p.text('WILCOX', cx, fz0 + 5 * yd, 6.2, '#f0a92a', 0, '900');
  p.text('CHARGERS', cx, fz1 - 5 * yd, 5.2, '#f0a92a', Math.PI, '900');
  // gold bands along the sidelines
  for (const s of [-1, 1]) p.rect(cx + s * 27.2 - 0.6, cz - 30, cx + s * 27.2 + 0.6, cz + 30, '#e3a82b');
  const white = '#f7f6f0', lw = 0.1;
  p.line([[fx0, fz0], [fx1, fz0], [fx1, fz1], [fx0, fz1], [fx0, fz0]], lw * 1.5, white, { cap: 'butt' });
  for (let y = 10; y <= 110; y += 5) {
    const z = fz0 + y * yd;
    p.line([[fx0, z], [fx1, z]], lw, white, { cap: 'butt' });
    const n = y - 10 <= 50 ? y - 10 : 110 - y;
    if (n % 10 === 0 && n > 0 && n <= 50) {
      p.text(String(n), fx0 + 11 * yd, z, 1.8, white, -Math.PI / 2, '700', '"Helvetica Neue", Arial, sans-serif');
      p.text(String(n), fx1 - 11 * yd, z, 1.8, white, Math.PI / 2, '700', '"Helvetica Neue", Arial, sans-serif');
    }
  }
  for (let y = 11; y < 110; y++) {
    const z = fz0 + y * yd;
    for (const x of [fx0 + 0.3, fx0 + 20.4, fx1 - 20.4 - 0.6, fx1 - 0.9]) p.line([[x, z], [x + 0.6, z]], lw, white, { cap: 'butt' });
  }
  // the gold bolt at midfield
  const bolt = [[-6, 1.2], [-1, 0.2], [-1.6, -1.4], [6.5, -0.8], [1.2, 0.2], [1.8, 1.8]].map(([x, z]) => [cx + x, cz + z]);
  p.poly(bolt, '#f0a92a');
}

function fields(p) {
  const turf = '#509b49', turf2 = '#58a551', white = '#f5f4ee';
  // soccer / lacrosse field
  const [[sx0, sz0], , [sx1, sz1]] = FIELDS.soccer;
  for (let x = sx0, i = 0; x < sx1; x += 5, i++) p.rect(x, sz0, Math.min(sx1, x + 5), sz1, i % 2 ? turf : turf2);
  p.line([[sx0 + 3, sz0 + 3], [sx1 - 3, sz0 + 3], [sx1 - 3, sz1 - 3], [sx0 + 3, sz1 - 3], [sx0 + 3, sz0 + 3]], 0.14, white, { cap: 'butt' });
  const mx = (sx0 + sx1) / 2, mz = (sz0 + sz1) / 2;
  p.line([[mx, sz0 + 3], [mx, sz1 - 3]], 0.14, white);
  p.circle(mx, mz, 9.15, null, white, 0.14);
  for (const s of [-1, 1]) {
    const gx = s < 0 ? sx0 + 3 : sx1 - 3;
    p.line([[gx, mz - 20], [gx - s * 16.5, mz - 20], [gx - s * 16.5, mz + 20], [gx, mz + 20]], 0.14, white);
    p.circle(gx - s * 12, mz, 2.7, null, white, 0.14);
  }
  // practice football field (runs east-west)
  const [[px0, pz0], , [px1, pz1]] = FIELDS.practice;
  p.rect(px0, pz0, px1, pz1, turf);
  for (let x = px0 + 6, i = 0; x < px1 - 6; x += 4.572, i++) {
    p.line([[x, pz0 + 4], [x, pz1 - 4]], 0.12, white, { cap: 'butt' });
  }
  // softball: all-dirt infield, grass outfield, warning track
  diamond(p, FIELDS.softball, { dirtR: 20, bases: 18.3, mound: 13.1, grassInfield: false });
  diamond(p, FIELDS.baseball, { dirtR: 29, bases: 27.4, mound: 18.4, grassInfield: true });
  // a small practice infield south of the practice field
  diamond(p, { home: [78, 232], dir: -Math.PI / 4, fence: 22 }, { dirtR: 20, bases: 18.3, mound: 13.1, grassInfield: false, noFence: true });
  // tennis courts
  const T = FIELDS.tennis;
  const c = Math.cos(T.rot), s = Math.sin(T.rot);
  const tp = (ax, az) => [T.x + ax * c - az * s, T.z + ax * s + az * c];
  p.poly([tp(-T.w / 2, -T.l / 2), tp(T.w / 2, -T.l / 2), tp(T.w / 2, T.l / 2), tp(-T.w / 2, T.l / 2)], '#4f7d5b');
  for (let row = 0; row < 2; row++) for (let i = 0; i < 2; i++) {
    const ox = -T.w / 4 + (i * T.w) / 2, oz = -T.l / 4 + (row * T.l) / 2;
    const w = 10.97, l = 23.77;
    p.poly([tp(ox - w / 2, oz - l / 2), tp(ox + w / 2, oz - l / 2), tp(ox + w / 2, oz + l / 2), tp(ox - w / 2, oz + l / 2)], '#3d6cae');
    p.line([tp(ox - w / 2, oz - l / 2), tp(ox + w / 2, oz - l / 2), tp(ox + w / 2, oz + l / 2), tp(ox - w / 2, oz + l / 2), tp(ox - w / 2, oz - l / 2)], 0.1, white, { cap: 'butt' });
    p.line([tp(ox - w / 2, oz), tp(ox + w / 2, oz)], 0.1, white, { cap: 'butt' });
  }
}

function diamond(p, F, o) {
  const [hx, hz] = F.home, d = F.dir;
  const a0 = d - Math.PI / 4, a1 = d + Math.PI / 4;
  if (!o.noFence) {
    p.sector(hx, hz, 0, F.fence, a0, a1, '#6fae4a');
    for (let r = 8; r < F.fence; r += 6) p.sector(hx, hz, r, r + 3, a0, a1, 'rgba(160,210,110,0.25)');
    p.sector(hx, hz, F.fence - 4.5, F.fence, a0, a1, '#c9955f');
  }
  p.sector(hx, hz, 0, o.dirtR, a0 - 0.05, a1 + 0.05, '#c98a5a');
  const pt = (a, r) => [hx + Math.cos(a) * r, hz + Math.sin(a) * r];
  if (o.grassInfield) {
    const m = 1.6;
    p.poly([pt(d, m * 1.4), pt(a0, o.bases - m), pt(d, o.bases * Math.SQRT2 - m * 1.4), pt(a1, o.bases - m)], '#6aa84a');
    p.circle(...pt(d, o.mound), 2.7, '#c98a5a');
  } else p.circle(...pt(d, o.mound), 2.4, null, '#f5f4ee', 0.1);
  p.circle(hx, hz, 3.2, '#c98a5a');
  p.line([pt(a0, F.fence), [hx, hz], pt(a1, F.fence)], 0.12, '#f5f4ee');
  for (const [a, r] of [[a0, o.bases], [d, o.bases * Math.SQRT2], [a1, o.bases]]) {
    const [bx, bz] = pt(a, r); p.rect(bx - 0.25, bz - 0.25, bx + 0.25, bz + 0.25, '#ffffff');
  }
}

// The creek: a concrete trapezoid channel, water along the bottom.
function creek(scene) {
  const conc = new THREE.Color('#c9c5bb'), wet = new THREE.Color('#8f9a8c'), water = new THREE.Color('#3f6f86');
  const pos = [], nor = [], col = [], uv = [];
  // the open reaches: north of the culvert, and south of it to the world's edge
  const [c0, c1] = CREEK.culvert;
  // one strip between two offsets of the centre line: [offset, y] at each edge
  const strip = (z0, z1, [da, ya], [db, yb], cl) => {
    const A = clipLineZ(offsetLine(CREEK.pts, da), z0, z1), B = clipLineZ(offsetLine(CREEK.pts, db), z0, z1);
    for (let i = 0; i < Math.min(A.length, B.length) - 1; i++) {
      const a = [A[i][0], ya, A[i][1]], b = [B[i][0], yb, B[i][1]], c = [B[i + 1][0], yb, B[i + 1][1]], d = [A[i + 1][0], ya, A[i + 1][1]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...n) || 1; n = n.map((k) => k / l);
      const up = n[1] < 0;   // keep every face pointing up, out of the channel
      const quad = up ? [a, d, c, a, c, b] : [a, b, c, a, c, d];
      if (up) n = n.map((k) => -k);
      for (const p of quad) { pos.push(...p); nor.push(...n); col.push(cl.r, cl.g, cl.b); uv.push(p[0] * 0.5, p[2] * 0.5); }
    }
  };
  for (const [z0, z1, { top, bottom, depth }] of [[WORLD.z0, c0, CREEK], [c1, WORLD.z1, CREEK.south]]) {
    strip(z0, z1, [top, 0], [bottom, -depth], conc);                    // west bank
    strip(z0, z1, [bottom, -depth], [-bottom, -depth], wet);            // bottom
    strip(z0, z1, [-bottom, -depth], [-top, 0], conc);                  // east bank
    strip(z0, z1, [bottom + 0.35, -depth + 0.28], [-bottom - 0.35, -depth + 0.28], water);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, gbuffer(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TOON })));
  m.receiveShadow = true;
  scene.add(m);
  // concrete headwalls where it dives under the Georgetown Place corner, each with a dark mouth
  for (const [z, s, { top, bottom, depth }] of [[c0, 1, CREEK], [c1, -1, CREEK.south]]) {
    const W = clipLineZ(offsetLine(CREEK.pts, top), z - 0.01, z + 0.01)[0], E = clipLineZ(offsetLine(CREEK.pts, -top), z - 0.01, z + 0.01)[0];
    const hw = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(E[0] - W[0], E[1] - W[1]), depth + 0.6, 0.6),
      gbuffer(new THREE.MeshToonMaterial({ color: conc, gradientMap: TOON })));
    hw.position.set((W[0] + E[0]) / 2, -depth / 2 + 0.3, z + s * 0.3);
    hw.rotation.y = -Math.atan2(E[1] - W[1], E[0] - W[0]);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(bottom * 2, depth - 0.6), gbuffer(new THREE.MeshToonMaterial({ color: '#1d2226', gradientMap: TOON })));
    mouth.position.set(0, -0.2, -s * 0.31);
    mouth.rotation.y = s > 0 ? Math.PI : 0;                   // face the open channel
    hw.add(mouth);
    hw.receiveShadow = hw.castShadow = true;
    scene.add(hw);
  }
  // you can't walk into it (the fences stop you anyway), except over the bridges
  addHeight((x, z) => {
    if (Math.abs(x - CREEK.x) > 50) return null;              // cheap reject: the creek never strays far east or west
    if (z > c0 && z < c1) return null;                         // over the culvert
    if (distToLine(x, z, CREEK.pts) >= creekAt(z).top) return null;
    if (BRIDGES.some((b) => Math.abs(z - b.z) < b.w / 2)) return null;
    return 50;
  });
}

// The whole world sits on a thick slab, like a model on a table: layered
// earth sides and a dark underside, so from the air it reads as a diorama.
function plinth(scene) {
  const { x0, z0, x1, z1 } = WORLD, D = 16;
  const bands = [[0, 0.5, '#8a9a6a'], [0.5, 2.2, '#6d5a47'], [2.2, 7, '#5a4a3c'], [7, 11, '#4c3f35'], [11, D, '#3c332c']];
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  const quad = (a, b, cc, d, n) => { for (const v of [a, b, cc, a, cc, d]) { pos.push(...v); nor.push(...n); col.push(c.r, c.g, c.b); } };
  for (const [ya, yb, hex] of bands) {
    c.set(hex);
    const y0 = -yb, y1 = -ya;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
  }
  c.set('#2a2420');
  quad([x0, -D, z0], [x1, -D, z0], [x1, -D, z1], [x0, -D, z1], [0, -1, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, gbuffer(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TOON }), { paint: false }));
  m.frustumCulled = false;
  scene.add(m);
}
