// The P building (P100–P107), from Ethan's photos (September 2026): two rows of
// portable classrooms facing each other across an open, tree-shaded courtyard
// that runs from the ball-field end up to the quad.
//   - every classroom is its own module (four a row, the rooms on the official
//     map); the roof is one level along a row
//   - white board-and-batten siding over a plain skirting band
//   - a low-slope metal roof with a yellow fascia: a deep canopy over the
//     courtyard walk for each classroom (cantilevered, no posts, bare wall between
//     one classroom's and the next: an E in plan) and a short eave everywhere else
//   - courtyard side: a yellow door in a charcoal frame with its room number and
//     a wall light, then a wide window in a thick yellow frame
//   - outer sides: yellow-framed windows and wall-hung air conditioners with
//     their conduits and downspouts, in an ivy bed with shrubs, flax and trees
//   - the courtyard is raised about half a metre above the driveway: big shade
//     trees down the middle in wooden bench surrounds, umbrella tables, and at
//     the ball-field end three black planters lettered W · H · S with steps
//     and grey pipe handrails between them
// At the quad end (from Ethan): two steps up from the quad, split by a planter
// with a tree, and a plain square planter beside P100; facing in from the quad,
// the ramp is on the left (along the east row's end wall, fenced in an L round
// its outside and the side of the steps) and the drinking fountains on the right (against the west
// row's end wall, to the right of a U-shaped barrier).

import * as THREE from 'three';
import { color, rng } from './geo.js';
import { canvasTex, decalMat } from './toon.js';
import { shadeTree, shrub, flax, grassTuft, cards, G } from './nature.js';
import { umbrellaTable } from './quad.js';
import { addBox, addCircle, addHeight } from './collide.js';
import { LIGHTS } from './lights.js';

const C = {
  siding: color('#f4f0e5'), skirt: color('#dcd6c8'), yellow: color('#e7c24a'), door: color('#e3bf4c'),
  doorFrame: color('#3d4046'), soffit: color('#efe9da'), roof: color('#cfd2d4'), mullion: color('#5c6065'),
  hvac: color('#ecebe4'), hvacDark: color('#4b4f54'), fixture: color('#2f3236'), concrete: color('#d8d4cb'),
  joint: color('#bdb8ae'), planter: color('#26282b'), soil: color('#5b4636'), rail: color('#a9aeb3'),
  wood: color('#9c7b58'), ivy: color('#3f6a36'), can: color('#8e9398'), mulch: color('#6b4a35'), bench: color('#46714f'), hedgeCore: color('#2c4f28'),
};
const LIT = color('#ffffff'), DARK = color('#b9bec8');

export const FLOOR = 0.4;                   // the courtyard terrace: two steps above the quad
// Each classroom is 7.3 m along the courtyard (measured off the door spacing in
// IMG_2303) and 9 m deep (the end wall in IMG_2311, by perspective: 8.6–9.2 m).
// Ethan, twice: "not that wide".
const MOD = 7.3, DEPTH = 9;
const Z = [0, 1, 2, 3, 4].map((k) => 41.1 + k * MOD);                // module edges, north → south
const COURT = { x0: 2.3, x1: 14 };
const ROWS = [
  // inner: the courtyard side's x; dir: which way the courtyard side faces (+1 = east)
  { id: 'P-w', x0: 2.3 - DEPTH, x1: 2.3, inner: 2.3, dir: 1, rooms: ['P100', 'P101', 'P102', 'P103'] },
  { id: 'P-e', x0: 14, x1: 14 + DEPTH, inner: 14, dir: -1, rooms: ['P107', 'P106', 'P105', 'P104'] },
];
const WALL = 3.2;                           // eave height above the driveway (one level along a row)
const GAP = 0.6;                            // wall left bare either side of a module joint, between two canopies

export function buildPortables(W, group) {
  const R = rng(107), WR = rng(108);
  const pane = () => (WR() < 0.6 ? LIT : DARK);
  for (const row of ROWS) {
    for (let i = 0; i < 4; i++) module(W, group, row, i, pane);
    addBox(row.x0, Z[0], row.x1, Z[4]);
    beds(W, row, R);
  }
  courtyard(W, group, R);
}

// ── one classroom ──
function module(W, group, row, i, pane) {
  const z0 = Z[i], z1 = Z[i + 1], zm = (z0 + z1) / 2, H = WALL;
  const { x0, x1, inner, dir } = row;
  const outer = dir > 0 ? x0 : x1;             // the back wall's x
  // walls: siding over a skirting band
  const poly = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  W.prism('siding', poly, 0.5, H, C.siding, { top: false });
  W.prism('flat', [[x0 - 0.03, z0 - 0.03], [x1 + 0.03, z0 - 0.03], [x1 + 0.03, z1 + 0.03], [x0 - 0.03, z1 + 0.03]], 0, 0.5, C.skirt, { top: false });

  // roof: one level along the row, a 0.35 m eave at the back and the row's ends.
  // Over the courtyard each classroom has its OWN canopy, 2.2 m deep, with bare
  // wall between it and the next one's (Ethan: "like an E", photo IMG_2304).
  const first = i === 0, last = i === 3;
  const endN = first ? 0.3 : 0, endS = last ? 0.3 : 0;
  const bx = dir > 0 ? x0 - 0.35 : x1 + 0.35;                 // the back eave's edge
  roofPiece(W, Math.min(bx, inner), z0 - endN, Math.max(bx, inner), z1 + endS, H,
    { back: dir > 0 ? 'x0' : 'x1', n: first, s: last });
  const cz0 = first ? z0 - endN : z0 + GAP, cz1 = last ? z1 + endS : z1 - GAP;
  const cx = inner + dir * 2.2;
  roofPiece(W, Math.min(inner, cx), cz0, Math.max(inner, cx), cz1, H,
    { back: dir > 0 ? 'x1' : 'x0', n: true, s: true });

  // courtyard side: the door near the module's right-hand end, a light to its left, then the big window
  // (IMG_2303, IMG_2304). The room's clickable number plate goes between them (portableDoors).
  // face(): local +z points out of the wall and local -x is the left of someone facing it
  const along = (d) => (dir > 0 ? zm + d : zm - d);
  const doorZ = along(DOOR), winZ = along(1.3);
  const face = (x, y, z, fn) => W.with(x, y, z, dir > 0 ? Math.PI / 2 : -Math.PI / 2, fn);
  const left = dir > 0 ? 1 : -1;               // world z step toward that left side
  face(inner + dir * 0.02, FLOOR, doorZ, () => {
    W.box('flat', 0, 1.1, 0, 1.28, 2.3, 0.1, C.doorFrame);
    W.box('flat', 0, 1.08, 0.05, 1.0, 2.14, 0.04, C.door);
    W.box('flat', -0.36, 1.0, 0.09, 0.05, 0.28, 0.05, color('#b9bcc0'));                   // lever
    W.box('flat', -0.95, 2.55, 0.08, 0.2, 0.28, 0.16, C.fixture);                        // wall light
    W.box('glow', -0.95, 2.4, 0.15, 0.14, 0.02, 0.1, color('#ffe6bd'));
  });
  LIGHTS.push([inner + dir * 0.3, doorZ + left * 0.95, FLOOR + 2.4, 3.5]);
  face(inner + dir * 0.03, FLOOR + 1.75, winZ, () => yellowWindow(W, 2.3, 1.25, pane()));

  // the end walls are all blank (IMG_2302, IMG_2311, IMG_2313)

  // the back: seen from outside, a window at the left-hand end of each classroom, a
  // wall-hung air conditioner to its right with its conduit, and a downspout at the
  // right-hand end (IMG_2296–2300, IMG_2306, IMG_2308)
  const back = -dir;
  const bface = (d, y, fn) => W.with(outer + back * 0.02, y, zm + d, back > 0 ? Math.PI / 2 : -Math.PI / 2, fn);
  bface(-dir * 2.1, 2.0, () => yellowWindow(W, 2.2, 1.2, pane()));
  bface(dir * 1.25, 0, () => {
    W.box('flat', 0, 2.15, 0.22, 1.08, 1.9, 0.44, C.hvac);
    W.quad('louver', [-0.44, 1.35, 0.445], [0.44, 1.35, 0.445], [0.44, 2.0, 0.445], [-0.44, 2.0, 0.445], color('#ffffff'), [[0, 0], [0.88, 0], [0.88, 0.65], [0, 0.65]]);
    W.box('flat', 0, 2.55, 0.445, 0.5, 0.12, 0.01, C.hvacDark);                          // the vent above
    W.box('flat', 0.62, 0.9, 0.05, 0.05, 1.3, 0.05, C.hvac);                             // conduit
    W.box('flat', 0.62, 0.95, 0.07, 0.24, 0.3, 0.1, C.hvac);                             // its box
  });
  bface(dir * ((z1 - z0) / 2 - 0.15), 0, () => W.box('flat', 0, H / 2, 0.06, 0.09, H, 0.09, C.siding));   // downspout
}

// A flat roof piece: cream soffit, metal top (seams running across the row), and
// a yellow fascia on the edges named: back ('x0' or 'x1', the long edge), n, s.
function roofPiece(W, x0, z0, x1, z1, H, { back, n, s }) {
  W.slab('flat', x0, z0, x1, z1, H, H + 0.14, C.soffit);
  W.quad('metal', [x0, H + 0.145, z0], [x0, H + 0.145, z1], [x1, H + 0.145, z1], [x1, H + 0.145, z0], C.roof, 'auto');
  const f0 = H - 0.06, f1 = H + 0.2, t = 0.05;
  if (back === 'x0') W.slab('flat', x0 - t, z0 - (n ? t : 0), x0, z1 + (s ? t : 0), f0, f1, C.yellow);
  if (back === 'x1') W.slab('flat', x1, z0 - (n ? t : 0), x1 + t, z1 + (s ? t : 0), f0, f1, C.yellow);
  if (n) W.slab('flat', x0, z0 - t, x1, z0, f0, f1, C.yellow);
  if (s) W.slab('flat', x0, z1, x1, z1 + t, f0, f1, C.yellow);
}

// A wide window in a thick yellow frame: two sliders either side of a fixed centre pane.
function yellowWindow(W, w, h, glassCol) {
  W.box('flat', 0, 0, 0, w + 0.32, h + 0.32, 0.07, C.yellow);
  W.quad('glass', [-w / 2, -h / 2, 0.045], [w / 2, -h / 2, 0.045], [w / 2, h / 2, 0.045], [-w / 2, h / 2, 0.045], glassCol, [[0, 0], [w, 0], [w, h], [0, h]]);
  for (const x of [-w / 2 + w * 0.28, w / 2 - w * 0.28]) W.box('flat', x, 0, 0.06, 0.06, h, 0.03, C.mullion);
  W.box('flat', 0, h / 2 - 0.03, 0.06, w, 0.05, 0.03, C.mullion);
}

// Where each room's clickable number plate goes (rooms.js): on the wall beside its
// door, between its door and window, at eye height, instead of up at the eave.
const DOOR = -2.7;                          // the door's offset from the module's centre, toward its right-hand end
export function portableDoors() {
  const out = {};
  for (const row of ROWS) {
    row.rooms.forEach((id, i) => {
      const zm = (Z[i] + Z[i + 1]) / 2, doorZ = row.dir > 0 ? zm + DOOR : zm - DOOR;
      out[id] = { x: row.inner + row.dir * 0.14, z: doorZ + (row.dir > 0 ? 1 : -1) * 1.5, y: FLOOR + 1.62, nx: row.dir, nz: 0 };
    });
  }
  return out;
}

// ── the planting beds along the backs ──
// West row, the library side (IMG_2296–2302): ivy, a round clipped shrub under each
// back window, and three trees, not evenly spaced (Ethan): one by the corner at
// the quad, one outside P101's window and one by the ball-field corner. Its
// ball-field end is mulch with two round shrubs (IMG_2302).
// East row, the small-gym side (IMG_2306, 2308–2312): a bed with a curving edge,
// not a rectangle (Ethan), wider round the one tree outside P104 (Ethan). Outside
// P106 and P107 it is bark mulch with flax and grasses, a low clipped mound at the
// corner and two long green benches along its front with a trash can (IMG_2309);
// further south it is groundcover with flax and the odd shrub. Its ball-field end
// has a clipped hedge on bark mulch (IMG_2304, IMG_2307).
function beds(W, row, R) {
  const { dir } = row, outer = dir > 0 ? row.x0 : row.x1, s = -dir, zE = Z[4];
  const tree = (x, z) => { shadeTree(W, x, z, R, { h: 7.5 + R() * 2, cols: G.leaf }); addCircle(x, z, 0.3); };
  if (dir > 0) {
    W.slab('flat', outer - 2.2, Z[0], outer, zE, 0, 0.06, C.ivy);
    for (let i = 0; i < 4; i++) {
      const x = outer - 0.75, z = (Z[i] + Z[i + 1]) / 2 - 2.1 + (R() - 0.5) * 0.5;
      shrub(W, x, z, R, { s: 1.15 + R() * 0.25 });
      addCircle(x, z, 0.5);
    }
    tree(outer - 1.3, Z[0] + 0.6);
    tree(outer - 1.6, Z[1] + 1.2);
    tree(outer - 1.4, zE - 0.4);
    W.slab('flat', outer - 2.2, zE, row.x1 - 0.6, zE + 1.4, 0, 0.05, C.mulch);
    for (const [x, sz] of [[outer + 2.0, 1.3], [row.x1 - 0.9, 1.1]]) {
      shrub(W, x, zE + 0.7, R, { s: sz });
      addCircle(x, zE + 0.7, sz * 0.45);
    }
    return;
  }
  // the bed's outer edge: its width out from the wall at points down the row
  // (metres south of the quad-end corner), eased between them
  const EDGE = [[0.2, 0.9], [1.2, 2.1], [3, 2.6], [7, 2.7], [11, 2.5], [15, 2.2], [19, 2.4], [22, 3.1], [24.4, 3.6], [27, 3.0], [28.7, 2.3], [30.1, 1.4], [30.7, 0.2]];
  const width = (z) => {
    const d = z - Z[0];
    let k = 1;
    while (k < EDGE.length - 1 && EDGE[k][0] < d) k++;
    const [d0, w0] = EDGE[k - 1], [d1, w1] = EDGE[k], t = Math.min(1, Math.max(0, (d - d0) / (d1 - d0)));
    return w0 + (w1 - w0) * (1 - Math.cos(Math.PI * t)) / 2;
  };
  const zone = (za, zb, y, col) => {
    const pts = [[outer, za], [outer, zb]];
    for (let z = zb; z > za + 0.2; z -= 0.4) pts.push([outer + width(z), z]);
    pts.push([outer + width(za), za]);
    W.prism('flat', pts, 0, y, col);
  };
  const zSplit = Z[0] + 14.1;                   // mulch to the north, groundcover to the south
  zone(Z[0] + 0.2, zSplit, 0.05, C.mulch);
  zone(zSplit, Z[0] + 30.7, 0.06, C.ivy);
  // the mulch: flax against the wall with grasses between, and a low mound at the corner
  hedge(W, outer + 1.1, Z[0] + 0.5, outer + 1.1, Z[0] + 2.4, R, { h: 0.5, d: 1.5 });
  for (let z = Z[0] + 3.4; z < zSplit - 0.8; z += 2.3 + R() * 0.5) {
    flax(W, outer + 0.9 + R() * 0.3, z, R, { h: 1.5 + R() * 0.4 });
    grassTuft(W, outer + 1.1 + R() * 0.4, z + 1.15, R, { h: 0.6 });
  }
  // two long green benches along the front, and a trash can by the north one
  bench(W, outer + 2.05, Z[0] + 4.5, Z[0] + 8.0);
  bench(W, outer + 2.05, Z[0] + 9.5, Z[0] + 13.1);
  W.cyl('flat', outer + 2.1, 0, Z[0] + 3.9, 0.3, 0.32, 0.9, 12, C.can);
  addCircle(outer + 2.1, Z[0] + 3.9, 0.35);
  // the groundcover: flax and the odd shrub, clear of the bed's edge
  for (let z = zSplit + 1.2; z < zE - 0.8; z += 2.6 + R() * 1.2) {
    const x = outer + 0.8 + R() * Math.max(0.2, width(z) - 1.6), k = R();
    if (k < 0.35) shrub(W, x, z, R, { s: 0.8 + R() * 0.4 });
    else if (k < 0.85) flax(W, x, z, R, { h: 1.4 + R() * 0.4 });
    else grassTuft(W, x, z, R, { h: 0.7 });
  }
  tree(outer + 2.0, Z[3] + 2.5);
  W.slab('flat', row.x0 + 0.1, zE, row.x1, zE + 1.5, 0, 0.05, C.mulch);
  hedge(W, row.x0 + 0.5, zE + 0.7, row.x1 - 0.3, zE + 0.7, R);
  addBox(row.x0 + 0.1, zE, row.x1, zE + 1.25);
}

// ── the courtyard ──
function courtyard(W, group, R) {
  const { x0, x1 } = COURT, zN = Z[0], zS = Z[4], xm = (x0 + x1) / 2;
  // the terrace, with saw-cut joints
  W.slab('flat', x0, zN, x1, zS, 0, FLOOR, C.concrete);
  for (let z = zN + 3; z < zS; z += 3) W.slab('flat', x0, z - 0.015, x1, z + 0.015, FLOOR, FLOOR + 0.006, C.joint);
  W.slab('flat', xm - 0.015, zN, xm + 0.015, zS, FLOOR, FLOOR + 0.006, C.joint);
  // the quad end (Ethan: two steps up from the quad; the ramp on the left and
  // the drinking fountains on the right, facing in from the quad)
  const RAMP = { x0: 16, x1: 21.2, z0: 39.3, z1: 40.9 }, landX = 12.2;
  // two black planters at the top of the two steps: a plain square one right beside
  // P100, and one splitting the steps in two, with a tree and painted rocks in it
  // (Ethan, and IMG_2321, which is taken from the quad just north of that one)
  const NQ = { x0: 2.4, x1: 4.2, z0: zN - 1.5, z1: zN + 0.3 }, pTop = 0.55;   // both 1.8 m square (Ethan)
  const hx = (NQ.x1 + landX) / 2;
  const MQ = { x0: hx - 0.9, x1: hx + 0.9, z0: zN - 1.5, z1: zN + 0.3 };   // smaller (Ethan)
  for (const b of [NQ, MQ]) {
    W.slab('flat', b.x0, b.z0, b.x1, b.z1, 0, pTop, C.planter);
    W.slab('flat', b.x0 + 0.13, b.z0 + 0.13, b.x1 - 0.13, b.z1 - 0.13, pTop - 0.08, pTop - 0.02, C.soil);
    addBox(b.x0, b.z0, b.x1, b.z1);
  }
  const mqx = hx + 0.15, mqz = (MQ.z0 + MQ.z1) / 2 - 0.1;
  shadeTree(W, mqx, mqz, R, { h: 8.5, y: pTop - 0.05, cols: G.leaf });
  const ROCKS = ['#d65a5a', '#e0b73d', '#6a9ed8', '#8fc46a', '#b58ad6', '#f0efe8', '#e98f4f'].map(color);
  for (let k = 0; k < 11; k++) {
    const rx = MQ.x0 + 0.22 + R() * (MQ.x1 - MQ.x0 - 0.44), rz = MQ.z0 + 0.22 + R() * (MQ.z1 - MQ.z0 - 0.44);
    if (Math.hypot(rx - mqx, rz - mqz) < 0.35) continue;
    W.blob('flat', rx, pTop - 0.01, rz, 0.07 + R() * 0.04, 0.045, 0.06 + R() * 0.03, ROCKS[k % ROCKS.length], 0);
  }
  W.slab('flat', NQ.x1, zN - 0.6, landX, zN, 0, FLOOR / 2, C.concrete);                // the lower step
  // a handrail up the steps on the east side of the middle planter
  const hr = MQ.x1 + 0.25;
  W.rod('flat', [hr, 0.9, zN - 1.0], [hr, FLOOR + 0.9, zN + 0.1], 0.05, C.rail);
  W.rod('flat', [hr, FLOOR + 0.9, zN + 0.1], [hr, FLOOR + 0.9, zN + 0.5], 0.05, C.rail);
  for (const [z, y] of [[zN - 1.0, 0], [zN + 0.5, FLOOR]]) W.box('flat', hr, y + 0.45, z, 0.05, 0.9, 0.05, C.rail);
  addBox(hr - 0.05, zN - 1.0, hr + 0.05, zN + 0.5);
  // the ramp's top landing, in front of the east row's end wall, then the ramp
  // running east along that wall down to the quad
  W.slab('flat', landX, RAMP.z0, RAMP.x0, zN, 0, FLOOR, C.concrete);
  const rise = (x) => FLOOR * (RAMP.x1 - x) / (RAMP.x1 - RAMP.x0);
  W.quad('flat', [RAMP.x0, FLOOR, RAMP.z1], [RAMP.x1, 0.004, RAMP.z1], [RAMP.x1, 0.004, RAMP.z0], [RAMP.x0, FLOOR, RAMP.z0], C.concrete, 'auto');
  W.quad('flat', [RAMP.x0, 0, RAMP.z0], [RAMP.x0, FLOOR, RAMP.z0], [RAMP.x1, 0.004, RAMP.z0], [RAMP.x1, 0, RAMP.z0], C.concrete, 'auto');   // its side
  // a picket fence in an L round the outside: down the ramp's outer side, along the
  // landing's front and back along the side of the two steps. Only the ramp's top,
  // where it meets the landing, and the landing's courtyard side are open.
  const fz = RAMP.z0 + 0.06, fx = landX + 0.06;
  guard(W, [[fx, FLOOR, zN], [fx, FLOOR, fz], [RAMP.x0, FLOOR, fz], [RAMP.x1 + 0.3, 0, fz]]);
  addBox(fx - 0.1, fz - 0.1, fx + 0.1, zN);
  addBox(fx - 0.1, fz - 0.1, RAMP.x1 + 0.3, fz + 0.1);
  // and a pipe handrail down the wall side of the slope
  const iz = RAMP.z1 - 0.02;
  W.rod('flat', [RAMP.x0, FLOOR + 0.9, iz], [RAMP.x1 + 0.3, 0.9, iz], 0.05, C.rail);
  for (const x of [RAMP.x0, (RAMP.x0 + RAMP.x1) / 2, RAMP.x1 + 0.3]) {
    const y = x <= RAMP.x0 ? FLOOR : rise(Math.min(x, RAMP.x1));
    W.box('flat', x, y + 0.45, iz, 0.05, 0.9, 0.05, C.rail);
  }
  // the two drinking fountains out at the far (west) corner of the west row's end
  // wall, and just to their left, facing the wall from the quad, a U-shaped pipe
  // barrier standing out from it (IMG_2322; Ethan: further right)
  const wx = ROWS[0].x0, ux = wx + 3.4;
  W.rod('flat', [ux, 0.9, zN - 0.12], [ux, 0.9, zN - 0.95], 0.05, C.rail);
  for (const z of [zN - 0.12, zN - 0.95]) W.rod('flat', [ux, 0, z], [ux, 0.9, z], 0.05, C.rail);
  addBox(ux - 0.05, zN - 0.95, ux + 0.05, zN);
  for (const x of [wx + 2.2, wx + 0.9]) fountain(W, x, zN - 0.02);

  // the ball-field end: W · H · S planters with two flights of steps between them
  // (the flights are 2.7 m wide, the planters 2.1 m: Ethan, and IMG_2304)
  const PW = 2.1, P = [['W', x0, x0 + PW], ['H', xm - PW / 2, xm + PW / 2], ['S', x1 - PW, x1]];
  const zP = zS + 2.0, top = 0.95;
  for (const [letter, a, b] of P) {
    W.slab('flat', a, zS - 0.3, b, zP, 0, top, C.planter);
    W.slab('flat', a + 0.12, zS - 0.18, b - 0.12, zP - 0.12, top - 0.1, top - 0.02, C.soil);
    letterDecal(group, letter, (a + b) / 2, 0.5, zP + 0.012);
    addBox(a, zS - 0.3, b, zP);
  }
  shadeTree(W, xm, zS + 0.85, R, { h: 9.5, y: top - 0.1, cols: G.leaf });              // the H planter's tree
  for (let k = 0; k < 3; k++) grassTuft(W, x0 + 0.6 + k * 0.6, zS + 0.8 + R() * 0.4, R, { y: top - 0.1, h: 0.5 });   // W's plants
  const flights = [[x0 + PW, xm - PW / 2], [xm + PW / 2, x1 - PW]];
  for (const [a, b] of flights) {
    W.slab('flat', a, zS, b, zS + 0.6, 0, FLOOR * 2 / 3, C.concrete);
    W.slab('flat', a, zS + 0.6, b, zS + 1.2, 0, FLOOR / 3, C.concrete);
    for (const x of [a + 0.14, b - 0.14]) {
      W.rod('flat', [x, FLOOR + 0.9, zS - 0.4], [x, 0.9, zS + 1.5], 0.05, C.rail);
      for (const [zz, y] of [[zS - 0.4, FLOOR], [zS + 1.5, 0]]) W.box('flat', x, y + 0.45, zz, 0.05, 0.9, 0.05, C.rail);
    }
  }
  for (const x of [x0 + PW + 0.35, x1 - PW - 0.35]) { W.cyl('flat', x, 0, zP + 0.5, 0.3, 0.32, 0.9, 12, C.can); addCircle(x, zP + 0.5, 0.35); }

  // shade trees down the middle, each in a square wooden bench
  for (const z of [zN + 6.2, zN + 15.2, zN + 24.2]) {
    W.slab('flat', xm - 1.4, z - 1.4, xm + 1.4, z + 1.4, FLOOR, FLOOR + 0.35, C.concrete);
    W.slab('flat', xm - 1.5, z - 1.5, xm + 1.5, z + 1.5, FLOOR + 0.35, FLOOR + 0.45, C.wood, new Set(['bottom']));
    W.slab('flat', xm - 0.9, z - 0.9, xm + 0.9, z + 0.9, FLOOR + 0.451, FLOOR + 0.46, C.soil);
    shadeTree(W, xm, z, R, { h: 9 + R() * 1.5, y: FLOOR + 0.45, cols: G.leaf });
    addBox(xm - 1.5, z - 1.5, xm + 1.5, z + 1.5);
  }
  // umbrella tables down the middle, between the three trees
  W.with(0, FLOOR, 0, 0, () => { for (const z of [zN + 10.7, zN + 19.7]) umbrellaTable(W, xm, z, R); });

  // walking: the terrace, the two steps and the ramp up from the quad, the flights at the far end
  addHeight((x, z) => {
    if (x >= x0 && x <= x1 && z >= zN && z <= zS) return FLOOR;
    if (x >= NQ.x1 && x < landX && z >= zN - 0.6 && z < zN) return FLOOR / 2;
    if (x >= landX && x <= RAMP.x0 && z >= RAMP.z0 && z < zN) return FLOOR;
    if (x > RAMP.x0 && x <= RAMP.x1 && z >= RAMP.z0 && z <= RAMP.z1) return rise(x);
    if (x >= x0 && x <= x1 && z > zS && z <= zS + 1.2) return z <= zS + 0.6 ? FLOOR * 2 / 3 : FLOOR / 3;
    return null;
  });
}

// A grey picket fence along a polyline of [x, groundY, z] points: posts, a top
// and bottom rail, and pickets every 14 cm that follow the ground (so a ramp's fence slopes).
function guard(W, pts) {
  const h = 0.95;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay, az] = pts[i - 1], [bx, by, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    W.rod('flat', [ax, ay + h, az], [bx, by + h, bz], 0.05, C.rail);
    W.rod('flat', [ax, ay + 0.12, az], [bx, by + 0.12, bz], 0.035, C.rail);
    const n = Math.max(1, Math.round(L / 0.14));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      const post = k === 0 || k === n || k % 13 === 0;
      if (post) W.box('flat', x, y + h / 2, z, 0.06, h, 0.06, C.rail);
      else W.box('flat', x, y + 0.12 + (h - 0.12) / 2, z, 0.022, h - 0.12, 0.022, C.rail);
    }
  }
}

// A long, low green bench along z: one plank on two posts (IMG_2309).
function bench(W, x, z0, z1) {
  const y = 0.45;
  W.slab('flat', x - 0.14, z0, x + 0.14, z1, y - 0.06, y, C.bench);
  for (const z of [z0 + 0.55, z1 - 0.55]) {
    W.slab('flat', x - 0.035, z - 0.05, x + 0.035, z + 0.05, 0, y - 0.06, C.bench);
    W.slab('flat', x - 0.12, z - 0.07, x + 0.12, z + 0.07, 0, 0.03, C.bench);          // its foot
  }
  addBox(x - 0.16, z0, x + 0.16, z1);
}

// A clipped hedge along a straight line: a dark core boxed by leaf cards, flat-topped
// and square-sided like the ones in IMG_2307, in short runs with the odd gap.
function hedge(W, ax, az, bx, bz, R, { h = 1.05, d = 0.95 } = {}) {
  const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
  const along = Math.abs(ux) > 0.5;
  for (let t = 0; t < L - 0.3;) {
    const run = Math.min(L - t, 2.5 + R() * 3);
    const cx = ax + ux * (t + run / 2), cz = az + uz * (t + run / 2);
    const rx = along ? run / 2 : d / 2, rz = along ? d / 2 : run / 2;
    W.slab('flat', cx - rx + 0.08, cz - rz + 0.08, cx + rx - 0.08, cz + rz - 0.08, 0, h - 0.1, C.hedgeCore);
    for (let k = 0.45; k < run; k += 0.9) {
      const px = ax + ux * (t + k), pz = az + uz * (t + k);
      cards(W, px, h * 0.55, pz, along ? 0.55 : d / 2, h * 0.5, along ? d / 2 : 0.55, G.dark[Math.floor(R() * 3)], R, 22, 0.8);
    }
    t += run + (R() < 0.3 ? 0.35 : 0.08);
  }
}

// A galvanised pedestal drinking fountain against a wall at z (it stands north of it).
function fountain(W, x, z) {
  const galv = color('#a3a8ad'), steel = color('#d7dade');
  W.slab('flat', x - 0.17, z - 0.36, x + 0.17, z - 0.02, 0, 0.95, galv);
  W.slab('flat', x - 0.26, z - 0.5, x + 0.26, z - 0.02, 0.95, 1.08, galv);                // the top bowl's housing
  W.slab('flat', x - 0.2, z - 0.44, x + 0.2, z - 0.08, 1.081, 1.09, steel);
  W.slab('flat', x + 0.17, z - 0.46, x + 0.5, z - 0.1, 0.7, 0.82, galv);                   // the lower bowl, to one side
  W.cyl('flat', x, 1.09, z - 0.12, 0.025, 0.025, 0.07, 6, steel);
  addBox(x - 0.26, z - 0.5, x + 0.5, z);
}

// A big yellow block letter on a planter's face.
function letterDecal(group, letter, x, y, z) {
  const tex = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#efc63f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 118px "Helvetica Neue", Arial, sans-serif';
    g.fillText(letter, w / 2, h / 2 + 6);
  }, { mips: true });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), decalMat(tex));
  m.position.set(x, y, z);
  group.add(m);
}
