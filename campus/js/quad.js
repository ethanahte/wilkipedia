// The quad: the most photographed place on campus, so the most detailed.
// The big deodar cedar in its mulch bed; the half-round stage south-west of it
// (from Ethan and his photos IMG_2324–2331: a raised platform with a low wall
// round its curve, three long steps along its straight north edge between two
// square concrete blocks, a straight stair up the middle of the south side, a
// curved ramp round the east half from the plaza up to that stair's landing, and
// planting everywhere else: grasses, poppies, crape myrtles, young trees); the
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

export const STAIR_A = Math.PI / 2;   // the south stair, in the very middle of the curve (Ethan)

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
  const WALL = 0.45, T = 0.3;                  // the low wall round the curve: height above the platform, thickness
  const HW = 1.15;                             // half the south stair's width
  const A = STAIR_A, ux = Math.cos(A), uz = Math.sin(A), px = -uz, pz = ux;   // across > 0 is west
  const at = (along, across, y = 0) => [cx + ux * along + px * across, y, cz + uz * along + pz * across];
  const P = (d, a, y) => [cx + Math.cos(a) * d, y, cz + Math.sin(a) * d];
  const gap = Math.asin(HW / r);               // the wall's opening onto the stair landing
  // the ramp: round the east half from the plaza (a = 0) up to the landing
  const aTop = A - Math.asin(HW / ((r + ring) / 2)) - 0.02;
  const rampY = (a) => h * Math.min(1, Math.max(0, a / aTop));
  const lipY = (a) => Math.max(rampY(a) + 0.2, 0.45);
  const eastCheek = (a, d) => Math.sin(A - a) * d < HW + 0.3;         // inside the east cheek wall's line

  // the platform, and the low wall round its curve with an opening onto the landing
  const plat = [];
  for (let i = 0; i <= 40; i++) { const a = (Math.PI * i) / 40; plat.push([cx + Math.cos(a) * (r - T), cz + Math.sin(a) * (r - T)]); }
  W.prism('flat', plat, 0, h, stageTop, { walls: false });
  W.ring('flat', cx, cz, r - T, r, 0, h + WALL, concrete, 22, 0, A - gap);
  W.ring('flat', cx, cz, r - T, r, 0, h + WALL, concrete, 22, A + gap, Math.PI);
  W.ring('flat', cx, cz, r - T, r, 0, h, stageTop, 3, A - gap, A + gap);
  // close the wall's two ends at the opening (ring() leaves its ends open)
  W.quad('flat', P(r - T, A - gap, h), P(r, A - gap, h), P(r, A - gap, h + WALL), P(r - T, A - gap, h + WALL), concrete);
  W.quad('flat', P(r, A + gap, h), P(r - T, A + gap, h), P(r - T, A + gap, h + WALL), P(r, A + gap, h + WALL), concrete);
  // square concrete blocks at both ends of the long steps, as tall as the wall
  for (const s of [-1, 1]) W.slab('flat', cx + (s > 0 ? r - 1.2 : -r), cz - 1.2, cx + (s > 0 ? r : -r + 1.2), cz, 0, h + WALL, concreteDark);
  // three long steps between them, a dark strip on each nosing
  for (let i = 0; i < 3; i++) {
    const z0 = cz - 1.2 + i * 0.4, y = (h / 3) * (i + 1);
    W.slab('flat', cx - r + 1.2, z0, cx + r - 1.2, cz, 0, y, concrete);
    W.slab('flat', cx - r + 1.2, z0, cx + r - 1.2, z0 + 0.06, y, y + 0.004, nosing);
  }
  // two handrails down them beside the east block (IMG_2328, IMG_2330)
  for (const x of [cx + r - 1.9, cx + r - 3.3]) {
    W.rod('flat', [x, 0.9, cz - 1.6], [x, 0.9, cz - 1.25], 0.05, galv);
    W.rod('flat', [x, 0.9, cz - 1.25], [x, h + 0.9, cz + 0.05], 0.05, galv);
    W.rod('flat', [x, h + 0.9, cz + 0.05], [x, h + 0.9, cz + 0.4], 0.05, galv);
    for (const [z, y] of [[cz - 1.6, 0], [cz + 0.4, h]]) W.cyl('flat', x, y, z, 0.03, 0.03, 0.9, 6, galv);
    addBox(x - 0.05, cz - 1.6, x + 0.05, cz + 0.4);
  }
  // galvanised trash cans in front of the blocks
  for (const s of [-1, 1]) {
    const x = cx + s * (r - 0.6), z = cz - 1.8;
    W.cyl('flat', x, 0, z, 0.3, 0.32, 0.9, 12, galv);
    W.cyl('flat', x, 0.9, z, 0.33, 0.33, 0.05, 12, galv);
    addCircle(x, z, 0.36);
  }

  // the ramp round the east half, with a low lip wall along its outside; its top
  // end is the stair's landing, level with the platform
  const m = 40, aEnd = A + gap;
  for (let i = 0; i < m; i++) {
    const t0 = (aEnd * i) / m, t1 = (aEnd * (i + 1)) / m, y0 = Math.max(0.012, rampY(t0)), y1 = Math.max(0.012, rampY(t1));
    W.quad('flat', P(r, t0, y0), P(r, t1, y1), P(ring, t1, y1), P(ring, t0, y0), concrete);
    if (eastCheek((t0 + t1) / 2, lip)) continue;
    const l0 = lipY(t0), l1 = lipY(t1);
    W.quad('flat', P(ring, t0, l0), P(ring, t1, l1), P(lip, t1, l1), P(lip, t0, l0), concrete);
    W.quad('flat', P(lip, t0, 0), P(lip, t0, l0), P(lip, t1, l1), P(lip, t1, 0), concreteDark);
    W.quad('flat', P(ring, t0, y0), P(ring, t1, y1), P(ring, t1, l1), P(ring, t0, l0), concrete);
  }
  // the east bed's end: a low wall along the stage's straight edge, in line with
  // the long steps and facing the quad, closing the bed and the lip (Ethan)
  const endT = 0.35;
  W.slab('flat', cx + ring, cz - endT, cx + plant, cz, 0, lipY(0), concrete);

  // the south stair: two steps up from the outer walk to the landing between two
  // cheek walls, a galvanised handrail each side (IMG_2324)
  const s1 = ring + 0.8, s2 = ring + 1.6;     // where the two steps start; the pad runs on to the outer walk
  for (const [a0, a1, y] of [[ring, s1, (2 * h) / 3], [s1, s2, h / 3]]) {
    W.with(cx + ux * (a0 + a1) / 2, 0, cz + uz * (a0 + a1) / 2, -A, () => W.box('flat', 0, y / 2, 0, a1 - a0, y, HW * 2, concrete));
  }
  // the concrete pad at the foot of the steps, between the cheek walls (not mulch).
  // 5 cm up: the ground's painted detail layer lies at 2 cm and is pulled forward, so it hides anything lower
  W.with(cx + ux * (s2 + plant) / 2, 0, cz + uz * (s2 + plant) / 2, -A, () => W.box('flat', 0, 0.025, 0, plant - s2, 0.05, HW * 2, concrete));
  // the landing's front, above the top step
  W.quad('flat', at(ring, HW, (2 * h) / 3), at(ring, -HW, (2 * h) / 3), at(ring, -HW, h), at(ring, HW, h), concrete);
  for (const s of [-1, 1]) {
    const from = s > 0 ? r : ring;             // the west one also closes the landing's side
    // one flat low wall each side, not stepped (Ethan)
    const y = h + 0.15;
    W.with(cx + ux * (from + plant) / 2 + px * s * (HW + 0.15), 0, cz + uz * (from + plant) / 2 + pz * s * (HW + 0.15), -A,
      () => W.box('flat', 0, y / 2, 0, plant - from, y, T, concrete));
    const lo = at(plant - 0.5, s * 0.8, 0.9), hi = at(ring, s * 0.8, h + 0.9), top = at(ring - 0.5, s * 0.8, h + 0.9);
    W.rod('flat', lo, hi, 0.05, galv);
    W.rod('flat', hi, top, 0.05, galv);
    W.cyl('flat', lo[0], 0, lo[2], 0.03, 0.03, 0.9, 6, galv);
    W.cyl('flat', top[0], h, top[2], 0.03, 0.03, 0.9, 6, galv);
  }

  // the planting: outside the ramp on the east, right up to the stage's wall on
  // the west. Grasses all round, poppies, crape myrtles east, young trees west.
  const bedFrom = (a) => (a < A ? lip : r) + 0.3;
  const clear = (a, d) => Math.abs(Math.sin(a - A) * d) > HW + 0.6 || Math.cos(a - A) < 0;
  const spot = (a0, a1, slack = 0.4) => {
    const a = a0 + R() * (a1 - a0), d = bedFrom(a) + slack + R() * (plant - bedFrom(a) - slack * 2);
    return clear(a, d) ? [cx + Math.cos(a) * d, cz + Math.sin(a) * d] : null;
  };
  for (let i = 0; i < 110; i++) { const q = spot(0.05, Math.PI - 0.05); if (q) grassTuft(W, q[0], q[1], R, { h: 0.6 + R() * 0.5, cols: GRASS }); }
  for (let i = 0; i < 34; i++) { const q = spot(A + 0.2, Math.PI - 0.15); if (q) poppies(W, q[0], q[1], R); }
  for (let i = 0; i < 8; i++) { const q = spot(0.3, A - 0.25); if (q) poppies(W, q[0], q[1], R); }
  const eMid = (lip + plant) / 2, wMid = (r + plant) / 2 + 0.3;
  for (const a of [0.3, 0.85, 1.3]) crapeMyrtle(W, cx + Math.cos(a) * eMid, cz + Math.sin(a) * eMid, R, { h: 3.6 + R() });
  for (const a of [2.05, 2.5, 2.95]) youngTree(W, cx + Math.cos(a) * wMid, cz + Math.sin(a) * wMid, R, { h: 5 + R(), stake: false, cols: AUTUMN });
  crapeMyrtle(W, cx + Math.cos(2.75) * (r + 1.3), cz + Math.sin(2.75) * (r + 1.3), R, { h: 3.4 });

  // walking: every surface at its real height, so the low walls, the blocks and
  // the lip can be stepped or jumped over and the planting crossed (Ethan)
  addHeight((x, z) => {
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
    if (z < cz) {
      if (dx >= ring && dx <= plant && z >= cz - endT) return lipY(0);   // the east bed's end wall
      if (z < cz - 1.2 || Math.abs(dx) > r) return null;
      if (Math.abs(dx) > r - 1.2) return h + WALL;                       // the square blocks
      return (h / 3) * (Math.floor((z - (cz - 1.2)) / 0.4) + 1);
    }
    if (d > plant) return null;
    if (d <= r - T) return h;
    const a = Math.atan2(dz, dx), along = Math.cos(a - A) * d, across = Math.sin(a - A) * d;
    const ahead = Math.cos(a - A) > 0, stair = ahead && Math.abs(across) < HW;
    if (d <= r) return stair ? h : h + WALL;                              // the low wall, or the opening
    if (d <= ring && a <= aEnd && (a < A || stair)) return rampY(a);
    if (stair) return along < s1 ? (2 * h) / 3 : along < s2 ? h / 3 : 0;
    const cheek = ahead && Math.abs(across) <= HW + T && along <= plant && (across > 0 ? along >= r : along >= ring);
    if (cheek) return h + 0.15;
    if (a < A && d <= lip) return lipY(a);
    return null;                                                          // the planting
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
