// The P building (P100–P107), from Ethan's photos (September 2026): two rows of
// portable classrooms facing each other across an open, tree-shaded courtyard
// that runs from the ball-field end up to the quad.
//   - every classroom is its own module (four a row, the rooms on the official
//     map), and the roofs step a little from one module to the next
//   - white board-and-batten siding over a plain skirting band
//   - a low-slope metal roof with a yellow fascia: a deep canopy over the
//     courtyard walk (cantilevered, no posts) and a short eave everywhere else
//   - courtyard side: a yellow door in a charcoal frame with its room number and
//     a wall light, then a wide window in a thick yellow frame
//   - outer sides: yellow-framed windows and wall-hung air conditioners with
//     their conduits and downspouts, in an ivy bed with shrubs, flax and trees
//   - the courtyard is raised about half a metre above the driveway: big shade
//     trees down the middle in wooden bench surrounds, umbrella tables, and at
//     the ball-field end three black planters lettered W · H · S with steps
//     and grey pipe handrails between them
// At the quad end (from Ethan): two steps up from the quad; facing in from the
// quad, the ramp is on the left (along the east row's end wall) and the two
// drinking fountains on the right (against the west row's end wall).

import * as THREE from 'three';
import { color, rng } from './geo.js';
import { canvasTex, decalMat } from './toon.js';
import { shadeTree, shrub, flax, grassTuft, G } from './nature.js';
import { umbrellaTable } from './quad.js';
import { addBox, addCircle, addHeight } from './collide.js';
import { LIGHTS } from './lights.js';

const C = {
  siding: color('#f4f0e5'), skirt: color('#dcd6c8'), yellow: color('#e7c24a'), door: color('#e3bf4c'),
  doorFrame: color('#3d4046'), soffit: color('#efe9da'), roof: color('#cfd2d4'), mullion: color('#5c6065'),
  hvac: color('#ecebe4'), hvacDark: color('#4b4f54'), fixture: color('#2f3236'), concrete: color('#d8d4cb'),
  joint: color('#bdb8ae'), planter: color('#26282b'), soil: color('#5b4636'), rail: color('#a9aeb3'),
  wood: color('#9c7b58'), ivy: color('#3f6a36'), can: color('#8e9398'),
};
const LIT = color('#ffffff'), DARK = color('#b9bec8');

export const FLOOR = 0.4;                   // the courtyard terrace: two steps above the quad
const Z = [41.1, 50.225, 59.35, 68.475, 77.6];                     // module edges, north → south
const COURT = { x0: 2.3, x1: 14 };
const ROWS = [
  // inner: the courtyard side's x; dir: which way the courtyard side faces (+1 = east)
  { id: 'P-w', x0: -11.7, x1: 2.3, inner: 2.3, dir: 1, rooms: ['P100', 'P101', 'P102', 'P103'], rise: [0, 0.22, 0.08, 0.3] },
  { id: 'P-e', x0: 14, x1: 28, inner: 14, dir: -1, rooms: ['P107', 'P106', 'P105', 'P104'], rise: [0.18, 0.04, 0.26, 0.1] },
];
const WALL = 3.2;                           // eave height above the driveway

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
  const z0 = Z[i], z1 = Z[i + 1], zm = (z0 + z1) / 2, H = WALL + row.rise[i];
  const { x0, x1, inner, dir } = row;
  const outer = dir > 0 ? x0 : x1;             // the back wall's x
  // walls: siding over a skirting band
  const poly = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  W.prism('siding', poly, 0.5, H, C.siding, { top: false });
  W.prism('flat', [[x0 - 0.03, z0 - 0.03], [x1 + 0.03, z0 - 0.03], [x1 + 0.03, z1 + 0.03], [x0 - 0.03, z1 + 0.03]], 0, 0.5, C.skirt, { top: false });

  // roof: a thin slab reaching 2.2 m over the courtyard walk and 0.35 m elsewhere
  const endN = i === 0 ? 0.3 : 0, endS = i === 3 ? 0.3 : 0;
  const rx0 = dir > 0 ? x0 - 0.35 : x0 - 2.2, rx1 = dir > 0 ? x1 + 2.2 : x1 + 0.35;
  W.slab('flat', rx0, z0 - endN, rx1, z1 + endS, H, H + 0.14, C.soffit);
  // (seams run across the module, from the courtyard to the back)
  W.quad('metal', [rx0, H + 0.145, z0 - endN], [rx0, H + 0.145, z1 + endS], [rx1, H + 0.145, z1 + endS], [rx1, H + 0.145, z0 - endN], C.roof, 'auto');
  // the yellow fascia round its edge
  const f = 0.26, t = 0.05;
  W.slab('flat', rx0 - t, z0 - endN - t, rx0, z1 + endS + t, H - 0.06, H + f - 0.06, C.yellow);
  W.slab('flat', rx1, z0 - endN - t, rx1 + t, z1 + endS + t, H - 0.06, H + f - 0.06, C.yellow);
  W.slab('flat', rx0, z0 - endN - t, rx1, z0 - endN, H - 0.06, H + f - 0.06, C.yellow);
  W.slab('flat', rx0, z1 + endS, rx1, z1 + endS + t, H - 0.06, H + f - 0.06, C.yellow);

  // courtyard side: door (its number and a light to its left, as in the photos), then the big window.
  // face(): local +z points out of the wall and local -x is the left of someone facing it
  const along = (d) => (dir > 0 ? zm + d : zm - d);
  const doorZ = along(-2.4), winZ = along(1.6);
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
  numberPlate(group, row.rooms[i], inner + dir * 0.03, FLOOR + 1.55, doorZ + left * 0.95, dir);
  face(inner + dir * 0.03, FLOOR + 1.75, winZ, () => yellowWindow(W, 2.3, 1.25, pane()));

  // the back: a window and a wall-hung air conditioner, with its conduit and a downspout
  const back = -dir;
  const bface = (d, y, fn) => W.with(outer + back * 0.02, y, zm + d, back > 0 ? Math.PI / 2 : -Math.PI / 2, fn);
  bface(dir > 0 ? 1.8 : -1.8, 2.0, () => yellowWindow(W, 2.2, 1.2, pane()));
  bface(dir > 0 ? -1.6 : 1.6, 0, () => {
    W.box('flat', 0, 2.15, 0.22, 1.08, 1.9, 0.44, C.hvac);
    W.quad('louver', [-0.44, 1.35, 0.445], [0.44, 1.35, 0.445], [0.44, 2.0, 0.445], [-0.44, 2.0, 0.445], color('#ffffff'), [[0, 0], [0.88, 0], [0.88, 0.65], [0, 0.65]]);
    W.box('flat', 0, 2.55, 0.445, 0.5, 0.12, 0.01, C.hvacDark);                          // the vent above
    W.box('flat', 0.62, 0.9, 0.05, 0.05, 1.3, 0.05, C.hvac);                             // conduit
    W.box('flat', 0.62, 0.95, 0.07, 0.24, 0.3, 0.1, C.hvac);                             // its box
  });
  bface(dir > 0 ? -(z1 - z0) / 2 + 0.15 : (z1 - z0) / 2 - 0.15, 0, () => W.box('flat', 0, H / 2, 0.06, 0.09, H, 0.09, C.siding));   // downspout
}

// A wide window in a thick yellow frame: two sliders either side of a fixed centre pane.
function yellowWindow(W, w, h, glassCol) {
  W.box('flat', 0, 0, 0, w + 0.32, h + 0.32, 0.07, C.yellow);
  W.quad('glass', [-w / 2, -h / 2, 0.045], [w / 2, -h / 2, 0.045], [w / 2, h / 2, 0.045], [-w / 2, h / 2, 0.045], glassCol, [[0, 0], [w, 0], [w, h], [0, h]]);
  for (const x of [-w / 2 + w * 0.28, w / 2 - w * 0.28]) W.box('flat', x, 0, 0.06, 0.06, h, 0.03, C.mullion);
  W.box('flat', 0, h / 2 - 0.03, 0.06, w, 0.05, 0.03, C.mullion);
}

// "P 101" stencilled beside each door.
function numberPlate(group, id, x, y, z, dir) {
  const tex = canvasTex(256, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#1d1f22'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 64px "Helvetica Neue", Arial, sans-serif';
    g.fillText(id.replace(/^P/, 'P '), w / 2, h / 2 + 3);
  }, { mips: true });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), decalMat(tex));
  m.position.set(x + dir * 0.01, y, z); m.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  group.add(m);
}

// ── the planting beds along the backs ──
function beds(W, row, R) {
  const outer = row.dir > 0 ? row.x0 : row.x1, s = -row.dir, bx0 = Math.min(outer, outer + s * 2.6), bx1 = Math.max(outer, outer + s * 2.6);
  W.slab('flat', bx0, Z[0] + 0.4, bx1, Z[4] - 0.4, 0, 0.06, C.ivy);
  for (let z = Z[0] + 2; z < Z[4] - 1; z += 3.4 + R() * 1.6) {
    const x = outer + s * (0.9 + R() * 1.0), k = R();
    if (k < 0.45) shrub(W, x, z, R, { s: 0.8 + R() * 0.4 });
    else if (k < 0.8) flax(W, x, z, R, { h: 1.4 + R() * 0.4 });
    else grassTuft(W, x, z, R, { h: 0.7 });
  }
  for (const z of [Z[0] + 5, Z[2] + 1.5, Z[3] + 4]) {
    const x = outer + s * 1.7;
    shadeTree(W, x, z, R, { h: 7.5 + R() * 2, cols: G.leaf });
    addCircle(x, z, 0.3);
  }
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
  W.slab('flat', x0, zN - 0.6, landX, zN, 0, FLOOR / 2, C.concrete);                  // the lower step
  // the ramp's top landing, in front of the east row's end wall, then the ramp
  // running east along that wall down to the quad
  W.slab('flat', landX, RAMP.z0, RAMP.x0, zN, 0, FLOOR, C.concrete);
  const rise = (x) => FLOOR * (RAMP.x1 - x) / (RAMP.x1 - RAMP.x0);
  W.quad('flat', [RAMP.x0, FLOOR, RAMP.z1], [RAMP.x1, 0.004, RAMP.z1], [RAMP.x1, 0.004, RAMP.z0], [RAMP.x0, FLOOR, RAMP.z0], C.concrete, 'auto');
  W.quad('flat', [RAMP.x0, 0, RAMP.z0], [RAMP.x0, FLOOR, RAMP.z0], [RAMP.x1, 0.004, RAMP.z0], [RAMP.x1, 0, RAMP.z0], C.concrete, 'auto');   // its side
  for (const z of [RAMP.z0 + 0.06, RAMP.z1 - 0.02]) {                                    // grey pipe rails both sides
    W.rod('flat', [landX + 0.1, FLOOR + 0.9, z], [RAMP.x0, FLOOR + 0.9, z], 0.05, C.rail);
    W.rod('flat', [RAMP.x0, FLOOR + 0.9, z], [RAMP.x1 + 0.3, 0.9, z], 0.05, C.rail);
    for (const x of [RAMP.x0, (RAMP.x0 + RAMP.x1) / 2, RAMP.x1 + 0.3]) {
      const y = x <= RAMP.x0 ? FLOOR : rise(Math.min(x, RAMP.x1));
      W.box('flat', x, y + 0.45, z, 0.05, 0.9, 0.05, C.rail);
    }
  }
  W.rod('flat', [landX + 0.1, FLOOR + 0.9, RAMP.z0 + 0.06], [landX + 0.1, FLOOR + 0.9, zN - 0.05], 0.05, C.rail);
  addBox(RAMP.x0, RAMP.z0 - 0.1, RAMP.x1 + 0.3, RAMP.z0 + 0.1);                          // the outer rail
  // two drinking fountains against the west row's end wall
  for (const x of [-2.6, -0.9]) fountain(W, x, zN - 0.02);
  // a U-shaped pipe barrier standing out from the wall beside them (photo IMG_2322)
  W.rod('flat', [-3.5, 0.9, zN - 0.12], [-3.5, 0.9, zN - 0.95], 0.05, C.rail);
  for (const z of [zN - 0.12, zN - 0.95]) W.rod('flat', [-3.5, 0, z], [-3.5, 0.9, z], 0.05, C.rail);
  addBox(-3.55, zN - 0.95, -3.45, zN);

  // the ball-field end: W · H · S planters with two flights of steps between them
  const P = [['W', x0, x0 + 2.4], ['H', xm - 1.15, xm + 1.15], ['S', x1 - 2.4, x1]];
  const zP = zS + 2.0, top = 0.95;
  for (const [letter, a, b] of P) {
    W.slab('flat', a, zS - 0.3, b, zP, 0, top, C.planter);
    W.slab('flat', a + 0.12, zS - 0.18, b - 0.12, zP - 0.12, top - 0.1, top - 0.02, C.soil);
    letterDecal(group, letter, (a + b) / 2, 0.5, zP + 0.012);
    addBox(a, zS - 0.3, b, zP);
  }
  shadeTree(W, xm, zS + 0.85, R, { h: 9.5, y: top - 0.1, cols: G.leaf });              // the H planter's tree
  for (let k = 0; k < 3; k++) grassTuft(W, x0 + 0.6 + k * 0.6, zS + 0.8 + R() * 0.4, R, { y: top - 0.1, h: 0.5 });   // W's plants
  const flights = [[x0 + 2.4, xm - 1.15], [xm + 1.15, x1 - 2.4]];
  for (const [a, b] of flights) {
    W.slab('flat', a, zS, b, zS + 0.6, 0, FLOOR * 2 / 3, C.concrete);
    W.slab('flat', a, zS + 0.6, b, zS + 1.2, 0, FLOOR / 3, C.concrete);
    for (const x of [a + 0.14, b - 0.14]) {
      W.rod('flat', [x, FLOOR + 0.9, zS - 0.4], [x, 0.9, zS + 1.5], 0.05, C.rail);
      for (const [zz, y] of [[zS - 0.4, FLOOR], [zS + 1.5, 0]]) W.box('flat', x, y + 0.45, zz, 0.05, 0.9, 0.05, C.rail);
    }
  }
  for (const x of [x0 + 2.75, x1 - 2.75]) { W.cyl('flat', x, 0, zP + 0.5, 0.3, 0.32, 0.9, 12, C.can); addCircle(x, zP + 0.5, 0.35); }

  // shade trees down the middle, each in a square wooden bench
  for (const z of [49, 59.5, 69.5]) {
    W.slab('flat', xm - 1.4, z - 1.4, xm + 1.4, z + 1.4, FLOOR, FLOOR + 0.35, C.concrete);
    W.slab('flat', xm - 1.5, z - 1.5, xm + 1.5, z + 1.5, FLOOR + 0.35, FLOOR + 0.45, C.wood, new Set(['bottom']));
    W.slab('flat', xm - 0.9, z - 0.9, xm + 0.9, z + 0.9, FLOOR + 0.451, FLOOR + 0.46, C.soil);
    shadeTree(W, xm, z, R, { h: 9 + R() * 1.5, y: FLOOR + 0.45, cols: G.leaf });
    addBox(xm - 1.5, z - 1.5, xm + 1.5, z + 1.5);
  }
  // umbrella tables (on the terrace)
  W.with(0, FLOOR, 0, 0, () => { for (const [x, z] of [[4.8, 44.5], [11.4, 54.2], [4.9, 64.3]]) umbrellaTable(W, x, z, R); });

  // walking: the terrace, the two steps and the ramp up from the quad, the flights at the far end
  addHeight((x, z) => {
    if (x >= x0 && x <= x1 && z >= zN && z <= zS) return FLOOR;
    if (x >= x0 && x < landX && z >= zN - 0.6 && z < zN) return FLOOR / 2;
    if (x >= landX && x <= RAMP.x0 && z >= RAMP.z0 && z < zN) return FLOOR;
    if (x > RAMP.x0 && x <= RAMP.x1 && z >= RAMP.z0 && z <= RAMP.z1) return rise(x);
    if (x >= x0 && x <= x1 && z > zS && z <= zS + 1.2) return z <= zS + 0.6 ? FLOOR * 2 / 3 : FLOOR / 3;
    return null;
  });
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
