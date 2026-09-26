// The quad: the most photographed place on campus, so the most detailed.
// The big deodar cedar in its mulch bed; the half-round stage south-west of it
// (from Ethan's photos IMG_2324–2331: a raised platform flush with its edge,
// three steps along its straight north edge with two handrails at the east end,
// a ring walk a step lower round the curved side with a low lip wall, then a
// mulch bed of grasses, poppies, crape myrtles and young trees, and a straight
// stair up from the outer walk on the south side); the
// two lawns; young staked trees and umbrella tables in the spots the satellite
// shows; green picnic tables, the one red/yellow/blue table; black lamp posts
// on concrete bases; trash cans.

import { color, rng } from './geo.js';
import { STAGE, CEDAR, QUAD_SPOTS, LAWN_TREES, LAMPS, PICNIC, PICNIC_COLOR } from './layout.js';
import { cedar, youngTree, crapeMyrtle, grassTuft, shrub, shadeTree, G } from './nature.js';
import { addCircle, addOBB, addBox, addHeight } from './collide.js';
import { LIGHTS } from './lights.js';

const concrete = color('#d9d5cd'), concreteDark = color('#c4bfb6'), black = color('#26282b'),
  stageTop = color('#dcd8cf'), nosing = color('#55585c'),
  GRASS = ['#8a9a5c', '#9aa465', '#7f8f55', '#a8a06a'].map(color), POPPY = [color('#f29a1d'), color('#f5b52a')],
  AUTUMN = ['#c9a13a', '#d98a32', '#9aa03e', '#c0702f'].map(color),
  green = color('#3f7d4f'), greenDark = color('#2f5f3c'), galv = color('#a9aeb3'), lampLight = color('#fff4cf');

export const STAIR_A = 1.7;    // where the south stair comes up through the planting (radians; IMG_2324: the cedar is off to the right)

export function buildQuad(W) {
  const R = rng(2024);
  stage(W, R);

  // the cedar, its mulch bed and a low concrete curb
  cedar(W, CEDAR.x, CEDAR.z, R);
  W.ring('flat', CEDAR.x, CEDAR.z, CEDAR.bed - 0.22, CEDAR.bed, 0, 0.2, concrete, 40);
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2, d = 1.6 + R() * 2.4;
    W.blob('flat', Math.cos(a) * d, 0.05, Math.sin(a) * d, 0.7 + R() * 0.4, 0.22, 0.6 + R() * 0.3, G.leaf[i % 4], 0);
  }
  addCircle(CEDAR.x, CEDAR.z, 1.1);

  // trees and umbrella tables where the satellite shows them
  QUAD_SPOTS.forEach(([x, z], i) => {
    const nearCedar = Math.hypot(x, z - 8.5) < 12 && z > 7;
    if (!nearCedar && (i % 5 === 0 || i % 5 === 2 || i % 5 === 3)) {
      youngTree(W, x, z, R, { h: 4.2 + R() * 1.4, stake: R() < 0.6 });
      addCircle(x, z, 0.25);
    } else umbrellaTable(W, x, z, R);
  });
  for (const [x, z] of LAWN_TREES) { youngTree(W, x, z, R, { h: 4.6 + R(), stake: true }); addCircle(x, z, 0.25); }
  // the big leafy tree in front of Building R
  shadeTree(W, 27.5, 3, R, { h: 10.5, cols: G.leaf });
  addCircle(27.5, 3, 0.5);

  for (const [x, z, rot] of PICNIC) picnic(W, x, z, rot, green, green, green);
  for (const [x, z, rot] of PICNIC_COLOR) picnic(W, x, z, rot, color('#d0413a'), color('#e7b52f'), color('#2f68b5'));
  for (const [x, z] of LAMPS) lamp(W, x, z);
  for (const [x, z] of LAMPS) LIGHTS.push([x, z, 4.6, 6.5]);
  [[-24, -1], [-9, -4], [18, 12], [-29, 18], [5, -17], [-36, -8], [23, 26]].forEach(([x, z]) => trash(W, x, z, R));
}

function stage(W, R) {
  const { x: cx, z: cz, r, ring, lip, plant, h } = STAGE;
  const RING_H = 0.3;                          // the ring walk's height, all but its ends
  // the ring walk comes down to the plaza at both ends of the straight edge
  const ringY = (a) => { const t = Math.min(1, Math.min(a, Math.PI - a) / 0.55); return RING_H * t * t * (3 - 2 * t); };
  const lipY = (a) => Math.max(ringY(a) + 0.2, 0.45);
  const P = (d, a, y) => [cx + Math.cos(a) * d, y, cz + Math.sin(a) * d];
  const A = STAIR_A, ux = Math.cos(A), uz = Math.sin(A), px = -uz, pz = ux;
  const HW = 1.15;                             // half the south stair's width
  const at = (along, across, y = 0) => [cx + ux * along + px * across, y, cz + uz * along + pz * across];
  const onStair = (a, d) => Math.cos(a - A) > 0 && Math.abs(Math.sin(a - A) * d) < HW + 0.3;

  // the platform: a half-disc, notched on the south where the stair comes up
  const del = Math.asin(HW / r), rc = r * Math.cos(del), n = 40, plat = [];
  let notched = false;
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n;
    if (!notched && a >= A - del) {
      notched = true;
      for (const [al, ac] of [[r, -HW], [rc - 0.8, -HW], [rc - 0.8, HW], [r, HW]]) {
        const q = al === r ? P(r, A + Math.sign(ac) * del, 0) : at(al, ac);
        plat.push([q[0], q[2]]);
      }
    }
    if (a > A - del && a < A + del) continue;
    plat.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  W.prism('flat', plat, 0, h, stageTop);
  // two steps up from the ring walk into the notch (the platform's edge is the third)
  const dH = h - RING_H;
  for (const [a0, a1, y] of [[rc - 0.4, r + 0.05, RING_H + dH / 3], [rc - 0.8, rc - 0.4, RING_H + (2 * dH) / 3]]) {
    W.with(cx + ux * (a0 + a1) / 2, 0, cz + uz * (a0 + a1) / 2, -A, () => W.box('flat', 0, y / 2, 0, a1 - a0, y, HW * 2, concrete));
  }

  // three steps along the straight north edge, a dark strip on each nosing
  for (let i = 0; i < 3; i++) {
    const z0 = cz - 1.2 + i * 0.4, y = (h / 3) * (i + 1);
    W.slab('flat', cx - r, z0, cx + r, cz, 0, y, concrete);
    W.slab('flat', cx - r, z0, cx + r, z0 + 0.06, y, y + 0.004, nosing);
  }
  // two handrails down them near the east end (IMG_2328, IMG_2330)
  for (const x of [cx + r - 1.3, cx + r - 2.8]) {
    W.rod('flat', [x, 0.9, cz - 1.6], [x, 0.9, cz - 1.25], 0.05, galv);
    W.rod('flat', [x, 0.9, cz - 1.25], [x, h + 0.9, cz + 0.05], 0.05, galv);
    W.rod('flat', [x, h + 0.9, cz + 0.05], [x, h + 0.9, cz + 0.4], 0.05, galv);
    for (const [z, y] of [[cz - 1.6, 0], [cz + 0.4, h]]) W.cyl('flat', x, y, z, 0.03, 0.03, 0.9, 6, galv);
    addBox(x - 0.05, cz - 1.6, x + 0.05, cz + 0.4);
  }
  // galvanised trash cans at both corners
  for (const s of [-1, 1]) {
    const x = cx + s * (r + 0.7), z = cz - 0.8;
    W.cyl('flat', x, 0, z, 0.3, 0.32, 0.9, 12, galv);
    W.cyl('flat', x, 0.9, z, 0.33, 0.33, 0.05, 12, galv);
    addCircle(x, z, 0.36);
  }

  // the ring walk, a step below the platform, and the low lip wall round its outside
  const m = 64;
  for (let i = 0; i < m; i++) {
    const t0 = (Math.PI * i) / m, t1 = (Math.PI * (i + 1)) / m, y0 = Math.max(0.012, ringY(t0)), y1 = Math.max(0.012, ringY(t1));
    W.quad('flat', P(r, t0, y0), P(r, t1, y1), P(ring, t1, y1), P(ring, t0, y0), concrete);
    const tm = (t0 + t1) / 2;
    if (onStair(tm, (ring + lip) / 2)) continue;
    const l0 = lipY(t0), l1 = lipY(t1);
    W.quad('flat', P(ring, t0, l0), P(ring, t1, l1), P(lip, t1, l1), P(lip, t0, l0), concrete);
    W.quad('flat', P(lip, t0, 0), P(lip, t0, l0), P(lip, t1, l1), P(lip, t1, 0), concreteDark);
    W.quad('flat', P(ring, t0, y0), P(ring, t1, y1), P(ring, t1, l1), P(ring, t0, l0), concrete);
  }
  for (const a of [0, Math.PI]) W.quad('flat', P(ring, a, 0), P(ring, a, lipY(a)), P(lip, a, lipY(a)), P(lip, a, 0), concrete);   // the lip's square ends

  // the south stair: up from the outer walk between two cheek walls, two steps and
  // a landing on the ring walk, a galvanised handrail each side (IMG_2324)
  W.with(cx + ux * (ring + 10.9) / 2, 0, cz + uz * (ring + 10.9) / 2, -A, () => W.box('flat', 0, RING_H / 2, 0, 10.9 - ring, RING_H, HW * 2, concrete));
  W.with(cx + ux * 11.2, 0, cz + uz * 11.2, -A, () => W.box('flat', 0, RING_H / 4, 0, 0.6, RING_H / 2, HW * 2, concrete));
  for (const s of [-1, 1]) {
    for (const [a0, a1, y] of [[ring, 11.0, lipY(A) + 0.05], [11.0, plant, 0.4]]) {
      W.with(cx + ux * (a0 + a1) / 2 + px * s * (HW + 0.15), 0, cz + uz * (a0 + a1) / 2 + pz * s * (HW + 0.15), -A,
        () => W.box('flat', 0, y / 2, 0, a1 - a0, y, 0.3, concrete));
    }
    const lo = at(plant - 0.3, s * 0.8, 0.9), hi = at(10.9, s * 0.8, RING_H + 0.9), top = at(10.3, s * 0.8, RING_H + 0.9);
    W.rod('flat', lo, hi, 0.05, galv);
    W.rod('flat', hi, top, 0.05, galv);
    W.cyl('flat', lo[0], 0, lo[2], 0.03, 0.03, 0.9, 6, galv);
    W.cyl('flat', top[0], RING_H, top[2], 0.03, 0.03, 0.9, 6, galv);
  }

  // the bed: grasses all round, California poppies, crape myrtles on the east
  // half, young trees turning colour on the west half
  const inBed = (a, d) => !onStair(a, d) && d > lip + 0.3 && d < plant - 0.3;
  for (let i = 0; i < 80; i++) {
    const a = 0.05 + R() * (Math.PI - 0.1), d = lip + 0.4 + R() * (plant - lip - 0.8);
    if (!inBed(a, d)) continue;
    grassTuft(W, cx + Math.cos(a) * d, cz + Math.sin(a) * d, R, { h: 0.6 + R() * 0.5, cols: GRASS });
  }
  for (let i = 0; i < 26; i++) {
    const a = A + 0.25 + R() * 1.1, d = lip + 0.5 + R() * (plant - lip - 1.0);
    if (inBed(a, d)) poppies(W, cx + Math.cos(a) * d, cz + Math.sin(a) * d, R);
  }
  for (let i = 0; i < 10; i++) {
    const a = A - 0.2 - R() * 0.6, d = lip + 0.5 + R() * (plant - lip - 1.0);
    if (inBed(a, d)) poppies(W, cx + Math.cos(a) * d, cz + Math.sin(a) * d, R);
  }
  const mid = (lip + plant) / 2;
  for (const a of [0.3, 0.85, A - 0.3]) crapeMyrtle(W, cx + Math.cos(a) * mid, cz + Math.sin(a) * mid, R, { h: 3.6 + R() });
  for (const a of [2.25, 2.85]) youngTree(W, cx + Math.cos(a) * mid, cz + Math.sin(a) * mid, R, { h: 5 + R(), stake: false, cols: AUTUMN });

  // walking: the platform, its steps, the ring walk, the south stair; the lip and bed are solid
  addHeight((x, z) => {
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
    if (z < cz) {
      if (Math.abs(dx) <= r && z >= cz - 1.2) return (h / 3) * (Math.floor((z - (cz - 1.2)) / 0.4) + 1);
      return null;
    }
    if (d > plant) return null;
    const a = Math.atan2(dz, dx), along = Math.cos(a - A) * d, across = Math.abs(Math.sin(a - A) * d);
    const stair = Math.cos(a - A) > 0 && across < HW;
    if (d <= r) {
      if (stair && along > rc - 0.8) return along > rc - 0.4 ? RING_H + dH / 3 : RING_H + (2 * dH) / 3;
      return h;
    }
    if (d <= ring) return ringY(a);
    if (stair) return along < 10.9 ? RING_H : along < 11.5 ? RING_H / 2 : 0;
    return 50;
  });
}

// A low mound of California poppies: blue-green leaves dotted with orange cups.
function poppies(W, x, z, R) {
  const s = 0.35 + R() * 0.25;
  W.blob('flat', x, 0.1, z, s, s * 0.45, s, color('#7f9a6a'));
  for (let k = 0; k < 7; k++) {
    const a = R() * Math.PI * 2, d = R() * s * 0.85;
    W.blob('flat', x + Math.cos(a) * d, 0.12 + s * 0.35 * (1 - d / s), z + Math.sin(a) * d, 0.06, 0.04, 0.06, POPPY[k % 2]);
  }
}

export function umbrellaTable(W, x, z, R) {
  const rot = R() * Math.PI;
  W.cyl('flat', x, 0, z, 0.06, 0.06, 0.74, 6, black);
  W.cyl('flat', x, 0.72, z, 0.62, 0.62, 0.05, 16, black);
  for (let i = 0; i < 4; i++) {
    const a = rot + (i * Math.PI) / 2, sx = x + Math.cos(a) * 0.95, sz = z + Math.sin(a) * 0.95;
    W.beam('flat', x, z, sx, sz, 0.1, 0.16, 0.05, black);
    W.cyl('flat', sx, 0.42, sz, 0.22, 0.22, 0.04, 10, black);
    W.cyl('flat', sx, 0.1, sz, 0.03, 0.03, 0.34, 5, black);
  }
  // the umbrella: dark on top, white underneath, as in the photos
  W.cyl('flat', x, 0.74, z, 0.03, 0.03, 1.7, 6, black);
  W.cyl('flat', x, 2.28, z, 1.35, 0.08, 0.32, 10, color('#34373b'), { bottom: false });
  W.cyl('flat', x, 2.265, z, 1.33, 0.02, 0.012, 10, color('#ecebe7'), { top: false, bottom: true });
  addCircle(x, z, 1.05);
}

function picnic(W, x, z, rot, top, benchA, benchB) {
  W.with(x, 0, z, rot, () => {
    W.box('flat', 0, 0.76, 0, 1.85, 0.05, 0.78, top);
    W.box('flat', 0, 0.45, 0.66, 1.85, 0.04, 0.3, benchA);
    W.box('flat', 0, 0.45, -0.66, 1.85, 0.04, 0.3, benchB);
    for (const sx of [-0.72, 0.72]) {
      W.box('flat', sx, 0.38, 0, 0.05, 0.05, 1.7, greenDark);
      for (const s of [-1, 1]) {
        W.with(sx, 0.38, s * 0.42, 0, () => W.box('flat', 0, 0, 0, 0.05, 0.8, 0.05, greenDark));
      }
    }
  });
  addOBB(x, z, 2.0, 1.9, rot);
}

function lamp(W, x, z) {
  W.cyl('flat', x, 0, z, 0.3, 0.26, 0.55, 10, concrete);
  W.cyl('flat', x, 0.55, z, 0.075, 0.055, 4.1, 8, black);
  W.cyl('flat', x, 4.62, z, 0.42, 0.34, 0.14, 14, black);
  W.cyl('glow', x, 4.6, z, 0.3, 0.3, 0.02, 14, lampLight, { top: false, bottom: true });
  addCircle(x, z, 0.35);
}

function trash(W, x, z, R) {
  const col = R() < 0.5 ? galv : color('#3a4a5a');
  W.cyl('flat', x, 0, z, 0.3, 0.32, 0.9, 12, col);
  W.cyl('flat', x, 0.9, z, 0.33, 0.33, 0.05, 12, col);
  W.blob('flat', x, 0.95, z, 0.32, 0.14, 0.32, col);
  addCircle(x, z, 0.36);
}

// Used by the ground painter: where the plaza should show mulch rings.
export function treeSpots() {
  const out = [];
  QUAD_SPOTS.forEach(([x, z], i) => {
    const nearCedar = Math.hypot(x, z - 8.5) < 12 && z > 7;
    if (!nearCedar && (i % 5 === 0 || i % 5 === 2 || i % 5 === 3)) out.push([x, z]);
  });
  return out;
}
