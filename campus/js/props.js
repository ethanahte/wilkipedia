// Everything else outside the quad: the creek's fences and footbridges, trees
// around campus, the pool deck, the stadium (bleachers, press box, lights,
// scoreboard, goal posts), backstops and dugouts, tennis fences, and the
// neighbourhood around the school (instanced houses and street trees).

import * as THREE from 'three';
import { color, rng, inPoly } from './geo.js';
import { gbuffer, TOON } from './toon.js';
import { CREEK, BRIDGES, FIELDS, TRACK, CAMPUS, WORLD, MONROE_PTS, CALABAZAS_PTS, SANJUAN_PTS, BUILDINGS } from './layout.js';
import { STREETS } from './ground.js';
import { shadeTree, conifer, youngTree, cards, SOLID_UV, G } from './nature.js';
import { World } from './geo.js';
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
  // ── creek: fences on both banks with gaps at the bridges and Monroe ──
  const gaps = [...BRIDGES.map((b) => [b.z - b.w / 2 - 0.2, b.z + b.w / 2 + 0.2]), [-120, -97]].sort((a, b) => a[0] - b[0]);
  for (const side of [-1, 1]) {
    const x = CREEK.x + side * (CREEK.top + 0.5);
    let z = -97;
    for (const [g0, g1] of gaps) {
      if (g1 <= z) continue;
      if (g0 > z) fence(W, [[x, z], [x, g0]]);
      z = g1;
    }
    fence(W, [[x, z], [x, 290]]);
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
  for (const z of [-108.5, -172, -236]) W.slab('flat', CREEK.x - CREEK.top - 0.2, z - 12, CREEK.x + CREEK.top + 0.2, z + 12, -0.5, 0.01, color('#6a6e73'));

  // ── trees round campus ──
  for (const side of [-1, 1]) {
    for (let z = -92; z < 285; z += 8 + R() * 5) {
      if (BRIDGES.some((b) => Math.abs(z - b.z) < 5)) continue;
      const x = CREEK.x + side * (CREEK.top + 3 + R() * 3);
      if (BUILDINGS.some((b) => inPoly(x, z, b.poly))) continue;
      shadeTree(W, x, z, R, { h: 8 + R() * 5 });
      addCircle(x, z, 0.4);
    }
  }
  // tall conifers south of the science building and west of the theatre
  for (let x = -84; x < -14; x += 8.5) { conifer(W, x + R() * 2, 142 + R() * 3, R, { h: 14 + R() * 6 }); }
  for (let z = -60; z < 10; z += 9) { conifer(W, -167 + R() * 2, z, R, { h: 15 + R() * 6 }); }
  // street trees along Monroe on the campus side
  for (let x = -170; x < 150; x += 16 + R() * 6) {
    if (x > -30 && x < -14) continue;   // keep the view of the front office clear
    youngTree(W, x, -96.4, R, { h: 6 + R() * 1.5, stake: false });
    addCircle(x, -96.4, 0.3);
  }
  // round the fields
  for (let x = -40; x < 60; x += 11) shadeTree(W, x, 265 - x * 0.3, R, { h: 9 + R() * 3 });
  for (const [x, z] of [[-150, 60], [-150, 85], [-100, 120], [-30, 150], [140, 60], [150, 205], [200, 190], [60, 214]]) {
    shadeTree(W, x, z, R, { h: 8 + R() * 4 }); addCircle(x, z, 0.4);
  }

  pool(W);
  stadium(W, R);
  diamonds(W);
  tennis(W);
  neighbourhood(scene, R, q, M);
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

// ── the neighbourhood: instanced houses and street trees ──
function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

function neighbourhood(scene, R, q, M) {
  const houses = [], trees = [];
  const majors = [[MONROE_PTS, 9], [CALABAZAS_PTS, 8], [SANJUAN_PTS, 8]];
  const clear = (x, z, pad) => {
    if (x < WORLD.x0 + 6 || x > WORLD.x1 - 6 || z < WORLD.z0 + 6 || z > WORLD.z1 - 6) return false;
    if (inPoly(x, z, CAMPUS) || Math.abs(x - CREEK.x) < 18) return false;
    // stay off Monroe's campus side entirely
    if (z > -100 && z < 0 && x > -200 && x < 170) return false;
    for (const [pts, w] of majors) if (distToPolyline(x, z, pts) < w + pad) return false;
    for (const s of STREETS) if (distToPolyline(x, z, s) < 4.5 + pad) return false;
    for (const h of houses) if (Math.hypot(h.x - x, h.z - z) < 15) return false;
    return true;
  };
  const along = (pts, off, step) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let t = step / 2; t < len; t += step) {
        for (const s of [-1, 1]) {
          const x = ax + dx * t - dz * off * s, z = az + dz * t + dx * off * s;
          if (clear(x, z, 7)) houses.push({ x, z, rot: Math.atan2(dx, dz) + (s > 0 ? 0 : Math.PI), w: 11 + R() * 5, d: 12 + R() * 4 });
          const tx = x + dx * 8 - dz * -5 * s, tz = z + dz * 8 + dx * -5 * s;
          if (R() < 0.6 && clear(tx, tz, 2)) trees.push({ x: tx, z: tz, s: 0.8 + R() * 0.7 });
        }
      }
    }
  };
  for (const [pts, w] of majors) along(pts, w + 16, 21);
  for (const s of STREETS) { along(s, 16, 20); along(s, 40, 22); }
  // fill the leftover gaps with yard trees
  for (let i = 0; i < 1400; i++) {
    const x = WORLD.x0 + R() * (WORLD.x1 - WORLD.x0), z = WORLD.z0 + R() * (WORLD.z1 - WORLD.z0);
    if (clear(x, z, 3)) trees.push({ x, z, s: 0.7 + R() * 0.8 });
  }

  const mat = () => gbuffer(new THREE.MeshToonMaterial({ gradientMap: TOON }));
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat(), houses.length);
  const roofGeo = new THREE.ConeGeometry(0.74, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const roof = new THREE.InstancedMesh(roofGeo, mat(), houses.length);
  const walls = ['#efe6d6', '#e8dcc6', '#dfe3e6', '#f1ecde', '#e4d3bc', '#d9dfd7'].map(color);
  const roofs = ['#b46a4c', '#8e5a45', '#7a7f86', '#9b6b4f', '#6d6a66', '#c07a55'].map(color);
  const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  houses.forEach((h, i) => {
    const hh = 3.6 + R() * 1.4;
    qn.setFromAxisAngle(up, h.rot);
    m.compose(new THREE.Vector3(h.x, 0, h.z), qn, new THREE.Vector3(h.w, hh, h.d));
    body.setMatrixAt(i, m); body.setColorAt(i, walls[i % walls.length]);
    m.compose(new THREE.Vector3(h.x, hh, h.z), qn, new THREE.Vector3(h.w * 1.08, 2.2 + R() * 1.2, h.d * 1.08));
    roof.setMatrixAt(i, m); roof.setColorAt(i, roofs[(i * 7) % roofs.length]);
  });
  for (const im of [body, roof]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); }

  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 1, 5).translate(0, 0.5, 0), mat(), trees.length);
  const crown = new THREE.InstancedMesh(crownGeometry(R), M.foliage, trees.length);
  crown.customDepthMaterial = M.foliage.userData.depthMat;
  trees.forEach((t, i) => {
    const h = 7 * t.s;
    m.compose(new THREE.Vector3(t.x, 0, t.z), qn.identity(), new THREE.Vector3(1, h * 0.45, 1));
    trunk.setMatrixAt(i, m); trunk.setColorAt(i, G.barkDark);
    m.compose(new THREE.Vector3(t.x, h * 0.62, t.z), qn.setFromAxisAngle(up, R() * 6), new THREE.Vector3(h * 0.36, h * 0.32, h * 0.36));
    crown.setMatrixAt(i, m); crown.setColorAt(i, G.dark[i % 3]);
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
