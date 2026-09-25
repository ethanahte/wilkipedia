// The quad: the most photographed place on campus, so the most detailed.
// The big deodar cedar in its mulch bed; the half-round stage south-west of it
// (raised platform, three steps along its straight north edge, a curved seat
// wall, a ring of grasses and crape myrtles, side steps with a handrail); the
// two lawns; young staked trees and umbrella tables in the spots the satellite
// shows; green picnic tables, the one red/yellow/blue table; black lamp posts
// on concrete bases; trash cans.

import { color, rng } from './geo.js';
import { STAGE, CEDAR, QUAD_SPOTS, LAWN_TREES, LAMPS, PICNIC, PICNIC_COLOR } from './layout.js';
import { cedar, youngTree, crapeMyrtle, grassTuft, shrub, shadeTree, G } from './nature.js';
import { addCircle, addOBB, addBox, addHeight } from './collide.js';
import { LIGHTS } from './lights.js';

const concrete = color('#d9d5cd'), concreteDark = color('#c4bfb6'), black = color('#26282b'),
  green = color('#3f7d4f'), greenDark = color('#2f5f3c'), galv = color('#a9aeb3'), lampLight = color('#fff4cf');

export const STAIR_A = 2.05;   // where the side steps cut through the stage's planting (radians)

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
  const { x: cx, z: cz, r, wall, plant, h } = STAGE;
  const half = (r0, a0 = 0, a1 = Math.PI, n = 28) => {
    const pts = [[cx + r0, cz]];
    for (let i = 1; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + Math.cos(a) * r0, cz + Math.sin(a) * r0]); }
    pts.push([cx - r0, cz]);
    return pts;
  };
  // the raised half-disc
  W.prism('flat', half(r), 0, h, color('#dcd8cf'));
  // three steps along the straight north edge
  for (let i = 0; i < 3; i++) W.slab('flat', cx - r, cz - 1.2 + i * 0.4, cx + r, cz, 0, (h / 3) * (i + 1), i % 2 ? concrete : concreteDark);
  // the curved wall: retaining face outside, seat on top, with a gap for the side steps
  const gap = 0.16;
  W.ring('flat', cx, cz, r, wall, 0, h + 0.45, concrete, 20, 0, STAIR_A - gap);
  W.ring('flat', cx, cz, r, wall, 0, h + 0.45, concrete, 12, STAIR_A + gap, Math.PI);
  // concrete blocks at both ends of the straight edge
  for (const s of [-1, 1]) W.slab('flat', cx + s * (r + 0.1) - 0.6, cz - 0.4, cx + s * (r + 0.1) + 0.6, cz + 2.0, 0, 1.0, concreteDark);
  // side steps through the planting, with a handrail
  const ux = Math.cos(STAIR_A), uz = Math.sin(STAIR_A);
  for (let i = 0; i < 3; i++) {
    const d0 = plant - i * 1.1, d1 = d0 - 1.1, y = (h / 3) * (i + 1);
    W.with(cx + ux * (d0 + d1) / 2, 0, cz + uz * (d0 + d1) / 2, -STAIR_A, () => W.box('flat', 0, y / 2, 0, 1.1, y, 2.2, concreteDark));
  }
  for (const s of [-1, 1]) {
    const px = -uz * 1.2 * s, pz = ux * 1.2 * s;
    const a = [cx + ux * plant + px, cz + uz * plant + pz], b = [cx + ux * wall + px, cz + uz * wall + pz];
    W.rod('flat', [a[0], 0.95, a[1]], [b[0], 0.95 + h, b[1]], 0.05, black);
    W.cyl('flat', a[0], 0, a[1], 0.03, 0.03, 0.98, 6, black);
    W.cyl('flat', b[0], h, b[1], 0.03, 0.03, 1.0, 6, black);
  }
  // planting ring: grasses and crape myrtles
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI, d = wall + 0.4 + R() * (plant - wall - 0.7);
    if (Math.abs(a - STAIR_A) < 0.2) continue;
    grassTuft(W, cx + Math.cos(a) * d, cz + Math.sin(a) * d, R, { h: 0.6 + R() * 0.5 });
  }
  for (const a of [0.35, 0.9, 1.5, 2.55, 2.95]) crapeMyrtle(W, cx + Math.cos(a) * (plant - 1.4), cz + Math.sin(a) * (plant - 1.4), R, { h: 3.4 + R() });
  for (const a of [0.6, 1.2, 2.3, 2.75]) shrub(W, cx + Math.cos(a) * (wall + 1.2), cz + Math.sin(a) * (wall + 1.2), R, { s: 0.9 });

  // walking rules: platform, steps, blocked planting, the side stair
  addHeight((x, z) => {
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
    if (z < cz) {
      if (Math.abs(dx) <= r && z >= cz - 1.2) return (h / 3) * (Math.floor((z - (cz - 1.2)) / 0.4) + 1);
      return null;
    }
    if (d <= r) return h;
    if (d > plant) return null;
    const a = Math.atan2(dz, dx);
    const across = Math.abs(Math.sin(a - STAIR_A)) * d;
    if (Math.abs(a - STAIR_A) < 0.5 && across < 1.05) {
      if (d <= wall) return h;
      return (h / 3) * Math.min(3, Math.floor((plant - d) / 1.1) + 1);
    }
    return 50;   // the seat wall and the planting
  });
  for (const s of [-1, 1]) addBox(cx + s * (r + 0.1) - 0.6, cz - 0.4, cx + s * (r + 0.1) + 0.6, cz + 2.0);
}

function umbrellaTable(W, x, z, R) {
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
