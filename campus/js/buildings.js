// Buildings: every footprint in layout.js becomes stucco walls, a gravel roof
// with a parapet and rooftop units, and a facade "kit" picked by its style.
// The kits come from the photos:
//   b      Building B: tan pilasters, light recessed panels, grey-framed window
//          bands on both floors, tall louvre panels, a grey steel entry canopy
//   r      Building R (Ethan's photos IMG_2342–2361): cream precast panels with
//          reveals, grey concrete towers with louvers, bays of white panels with
//          teal glass, recessed entrances with grey canopies; see rFace()
//   caf/p  single-storey wings with a covered walkway, warm yellow doors and a
//          band of clerestory windows
//   s      the science building: white walls, curved metal barrel roofs
//   theatre, gym, mn, admin, library, plain
// Special one-off pieces (the sign wall, ASB awning, gym lettering…) live in
// landmarks.js.

import * as THREE from 'three';
import { color, rng, ensureCCW } from './geo.js';
import { BUILDINGS } from './layout.js';
import { LIGHTS } from './lights.js';

const C = {
  cream: color('#f0e5cc'), tan: color('#e0cca2'), panel: color('#f5eedf'), frame: color('#5f6368'),
  roof: color('#d6d3cc'), parapet: color('#e9dfc8'), hvac: color('#e7e1d3'), hvacTop: color('#9da1a6'),
  white: color('#f1f0ea'), fin: color('#f6f2e8'), door: color('#e6b43c'), doorTan: color('#c8a767'),
  glassTint: color('#ffffff'), steel: color('#6f747a'), awning: color('#e8b930'), louver: color('#ffffff'),
  metalRoof: color('#c7ccd2'), dark: color('#3b3f45'), lobbyGlass: color('#8fb2c8'),
};

// Walls as seen from outside: A→B along the wall, n = outward normal.
function edges(poly) {
  const P = ensureCCW(poly);
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    out.push({ ax, az, bx, bz, len, dx, dz, nx: -dz, nz: dx, rot: -Math.atan2(dz, dx) });
  }
  return out;
}
export { edges as wallEdges };

// Put something on a wall: t metres along it, y up, `off` metres out from the face.
function onWall(W, e, t, y, off, fn) {
  W.with(e.ax + e.dx * t + e.nx * off, y, e.az + e.dz * t + e.nz * off, e.rot, fn);
}

// About 60% of rooms have their lights on at night: those panes are pure white
// (the glass shader only glows where the vertex colour is white); the rest are
// a touch darker and stay dark.
const WR = rng(99);
const LIT = color('#ffffff'), DARK = color('#b9bec8');
const pane = () => (WR() < 0.6 ? LIT : DARK);

// A window: dark frame box and a glass pane just in front of it. (x,y) = centre.
function windowAt(W, e, t, y, w, h, { frame = C.frame, depth = 0.12 } = {}) {
  onWall(W, e, t, y, 0.03, () => {
    W.box('flat', 0, 0, 0, w + 0.16, h + 0.16, depth, frame);
    W.quad('glass', [-w / 2, -h / 2, depth / 2 + 0.01], [w / 2, -h / 2, depth / 2 + 0.01], [w / 2, h / 2, depth / 2 + 0.01], [-w / 2, h / 2, depth / 2 + 0.01], pane(),
      [[0, 0], [w, 0], [w, h], [0, h]]);
    // mullions: split wide windows into panes
    const panes = Math.max(1, Math.round(w / 1.3));
    for (let i = 1; i < panes; i++) W.box('flat', -w / 2 + (w * i) / panes, 0, depth / 2 + 0.03, 0.07, h, 0.05, frame);
  });
}

function doorAt(W, e, t, w, h, col, { glass = false, frameCol = C.frame, single = false, plain = false } = {}) {
  onWall(W, e, t, h / 2, 0.02, () => {
    W.box('flat', 0, 0, 0, w + 0.2, h + 0.1, 0.1, frameCol);
    if (glass) {
      W.quad('glass', [-w / 2, -h / 2, 0.06], [w / 2, -h / 2, 0.06], [w / 2, h / 2, 0.06], [-w / 2, h / 2, 0.06], C.glassTint, [[0, 0], [w, 0], [w, h], [0, h]]);
      if (!single) W.box('flat', 0, 0, 0.08, 0.08, h, 0.04, frameCol);
      W.box('flat', 0, -h / 2 + 1.0, 0.1, w, 0.05, 0.04, color('#c9ccd0'));   // push bar
    } else {
      W.box('flat', 0, 0, 0.05, w, h, 0.04, col);
      // narrow vertical window, as on every American hallway door
      if (!plain) W.quad('glass', [w * 0.12, 0.1, 0.075], [w * 0.28, 0.1, 0.075], [w * 0.28, h * 0.42, 0.075], [w * 0.12, h * 0.42, 0.075], DARK, 'auto');
      W.box('flat', -w * 0.32, -0.05, 0.09, 0.05, 0.3, 0.05, color('#b9bcc0'));   // handle
    }
  });
}

function louverAt(W, e, t, y, w, h) {
  onWall(W, e, t, y, 0.02, () => {
    W.box('flat', 0, 0, 0, w + 0.14, h + 0.14, 0.1, C.frame);
    W.box('louver', 0, 0, 0.06, w, h, 0.04, C.louver);
  });
}

function parapet(W, poly, h, col, t = 0.32, rise = 0.55, skip = () => false) {
  for (const e of edges(poly)) {
    if (skip(e)) continue;
    W.beam('stucco', e.ax - e.nx * t / 2, e.az - e.nz * t / 2, e.bx - e.nx * t / 2, e.bz - e.nz * t / 2, h - rise, h, t, col);
    // coping: a lighter cap
    W.beam('flat', e.ax - e.nx * t / 2, e.az - e.nz * t / 2, e.bx - e.nx * t / 2, e.bz - e.nz * t / 2, h, h + 0.08, t + 0.06, C.fin);
  }
}

function rooftop(W, b, R, y) {
  const xs = b.poly.map((p) => p[0]), zs = b.poly.map((p) => p[1]);
  const x0 = Math.min(...xs) + 2, x1 = Math.max(...xs) - 2, z0 = Math.min(...zs) + 2, z1 = Math.max(...zs) - 2;
  if (x1 - x0 < 3 || z1 - z0 < 3) return;
  const n = Math.max(1, Math.round(((x1 - x0) * (z1 - z0)) / 140));
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
    if (R() < 0.7) {
      const w = 1.6 + R() * 1.4, d = 1.1 + R() * 0.8, h = 0.9 + R() * 0.7, rot = R() < 0.5 ? 0 : Math.PI / 2;
      W.box('flat', x, y + h / 2, z, w, h, d, C.hvac, rot);
      W.box('flat', x, y + h + 0.03, z, w * 0.8, 0.06, d * 0.8, C.hvacTop, rot);
      W.cyl('flat', x + w * 0.2, y + h, z, 0.28, 0.28, 0.12, 10, C.hvacTop);
    } else {
      W.cyl('flat', x, y, z, 0.18, 0.18, 0.7, 8, C.hvacTop);
      W.cyl('flat', x, y + 0.7, z, 0.3, 0.05, 0.25, 8, C.hvacTop);
    }
  }
}

// Evenly spaced bays along a wall, leaving `margin` at the ends.
function bays(len, spacing, margin = 1.2) {
  const n = Math.max(0, Math.floor((len - margin * 2) / spacing));
  const start = (len - n * spacing) / 2 + spacing / 2;
  return Array.from({ length: n }, (_, i) => ({ i, t: start + i * spacing }));
}

// ── facade kits ──
const KITS = {
  b(W, b, e, R) {
    const h = b.h, fl = [0, 4.5];
    if (e.len < 4) return;
    const bs = bays(e.len, 4.0, 1.0);
    for (const { i, t } of bs) {
      if (i % 3 === 0) {
        // pilaster: tan, proud of the wall, rising past the parapet
        onWall(W, e, t - 2.0, 0, 0.22, () => W.box('stucco', 0, (h + 0.7) / 2, 0, 1.7, h + 0.7, 0.45, C.tan));
        continue;
      }
      if (i % 3 === 2 && R() < 0.55) { louverAt(W, e, t, h / 2 - 0.2, 1.25, h - 2.6); continue; }
      for (const f of fl) windowAt(W, e, t, f + 2.0, 2.8, 1.55);
    }
    // belt course between the floors
    onWall(W, e, e.len / 2, 4.35, 0.06, () => W.box('flat', 0, 0, 0, e.len, 0.16, 0.12, C.fin));
  },
  r() {},                                       // buildR() draws R whole
  caf(W, b, e, R) {
    if (e.len < 4 || e.nz > 0.5) return;          // the quad side is cafFront()'s
    const tall = b.h > 6;
    for (const { i, t } of bays(e.len, 4.2, 1.5)) {
      if (e.nz > 0.5 && i % 3 === 1) doorAt(W, e, t, 1.8, 2.3, C.door);
      else windowAt(W, e, t, 1.9, 2.4, 1.3);
      windowAt(W, e, t, 3.3, 2.6, 0.55);                       // clerestory band
      if (tall) windowAt(W, e, t, 5.6, 3.0, 1.0);
    }
  },
  p(W, b, e, R) {
    if (e.len < 4) return;
    for (const { i, t } of bays(e.len, 4.6, 1.4)) {
      if (i % 2 === 1) doorAt(W, e, t, 1.0, 2.2, C.door);
      else windowAt(W, e, t, 1.8, 2.6, 1.2);
      windowAt(W, e, t, 3.25, 2.4, 0.45);
    }
  },
  library(W, b, e) {
    if (e.len < 4) return;
    for (const { t } of bays(e.len, 3.4, 1.5)) windowAt(W, e, t, 3.3, 2.6, 4.6);
  },
  admin(W, b, e) {
    if (e.len < 4 || e.nz < -0.5) return;   // the north face is the sign wall (landmarks.js)
    for (const { t } of bays(e.len, 3.6, 1.2)) windowAt(W, e, t, 2.0, 2.6, 1.6);
  },
  gym(W, b, e, R) {
    if (e.len < 5) return;
    for (const { i, t } of bays(e.len, 6, 2)) {
      if (i % 4 === 1) doorAt(W, e, t, 2.0, 2.4, C.steel);
      if (b.h > 8) windowAt(W, e, t, b.h - 2.2, 3.4, 0.8);
      else if (i % 2 === 0) louverAt(W, e, t, 2.6, 1.4, 1.4);
    }
  },
  gymlobby(W, b, e) {
    if (e.len < 5) return;
    for (const { i, t } of bays(e.len, 6, 2)) if (i % 3 === 0) louverAt(W, e, t, 2.6, 1.4, 1.4);
  },
  plain(W, b, e) {
    if (e.len < 4) return;
    for (const { i, t } of bays(e.len, 4.4, 1.2)) {
      if (i % 4 === 2) doorAt(W, e, t, 1.0, 2.2, C.door);
      else windowAt(W, e, t, 1.9, 2.2, 1.3);
    }
  },
  mn(W, b, e) {
    if (e.len < 4) return;
    for (const { i, t } of bays(e.len, 4.2, 1.2)) {
      if (e.nx > 0.5 && i % 2 === 0) doorAt(W, e, t, 1.0, 2.2, C.doorTan);   // tan doors facing the creek walk
      else windowAt(W, e, t, 2.0, 2.0, 1.2);
    }
  },
  s(W, b, e) {
    if (e.len < 4) return;
    for (const { i, t } of bays(e.len, 4.0, 1.2)) {
      if (i % 4 === 3) doorAt(W, e, t, 1.0, 2.2, C.doorTan);
      else windowAt(W, e, t, 2.0, 2.4, 1.4);
    }
  },
  theatre(W, b, e) {
    // mostly blank walls; brick wainscot on the street and parking sides
    if (e.nz < -0.5 || e.nx < -0.5) onWall(W, e, e.len / 2, 1.5, 0.05, () => W.box('brick', 0, 0, 0, e.len, 3, 0.1, color('#ffffff')));
    if (b.h < 13 && e.len > 8 && e.nx < -0.5) for (const { t } of bays(e.len, 8, 3)) doorAt(W, e, t, 1.9, 2.4, C.steel);
  },
  'theatre-lobby'() {},
};

const WALL = {
  b: C.cream, r: color('#ece0c4'), caf: color('#efe6d0'), p: color('#efe5cf'), library: color('#efe5cf'),
  admin: color('#efe8d6'), gym: color('#eee6d3'), gymlobby: color('#eee6d3'), plain: color('#efe5cf'), mn: color('#f1efe7'),
  s: color('#f3f3ef'), theatre: color('#eef0ef'), 'theatre-lobby': color('#3d4e5a'),
};

// ── Building R ──
// Built piece by piece from Ethan and his photos (IMG_2342–2361), placed by world
// position rather than by a repeating rhythm. The numbers match R's outline in
// layout.js: the quad face at x 33.2, the thick blocks out to 31.6, the step at
// x 41.1, the pool face at 54.7, the narrow ends at z -21.6 / 25.2, the wide ends
// at -23.75 / 27.3 with their entrances set 0.9 m in between x 43.1 and 46.2.
const RC = {
  reveal: color('#d2c6ab'), tower: color('#a4a8aa'), towerLine: color('#8e9294'), panel: color('#eef0eb'),
  grid: color('#7c8186'), teal: color('#a9dcd6'), canopy: color('#8a8f94'), sconce: color('#6f7378'), cap: color('#ece0c4'),
  wall: color('#ece0c4'), steel: color('#b8bcc0'), galv: color('#a9aeb3'), dark: color('#5f6368'),
};
const R_FLOORS = [0, 4.4, 8.8];
const RD = 0.22;             // the precast skin laid over R's end walls: its openings are set this far in
const RQ = 33.2, RF = 31.6, RS = 41.1, RE = 54.7, RN = -21.6, RNW = -23.75, RSN = 25.2, RSW = 27.3, RX0 = 43.1, RX1 = 46.2, RIN = 0.9;

// The precast's reveals: a groove every 1.2 m up and every 2.7 m along.
function reveals(W, e, t0, t1, top, off = 0) {
  if (t1 - t0 < 0.3) return;
  onWall(W, e, (t0 + t1) / 2, 0, off + 0.012, () => {
    for (let y = 1.2; y < top - 0.3; y += 1.2) W.box('flat', 0, y, 0, t1 - t0, 0.035, 0.02, RC.reveal);
  });
  for (let t = t0 + 2.7; t < t1 - 0.4; t += 2.7) onWall(W, e, t, top / 2, off + 0.012, () => W.box('flat', 0, 0, 0, 0.035, top, 0.02, RC.reveal));
}
// The triangular wall lamps (Ethan): a dark three-sided shade, lit underneath at night.
function sconce(W, e, t, y, off = 0) {
  onWall(W, e, t, y, off + 0.02, () => {
    W.cyl('flat', 0, 0, 0.12, 0, 0.21, 0.26, 3, RC.sconce);
    W.cyl('glow', 0, -0.005, 0.12, 0.19, 0.19, 0.01, 3, color('#ffe6bd'), { top: false, bottom: true });
  });
  LIGHTS.push([e.ax + e.dx * t + e.nx * (off + 0.3), e.az + e.dz * t + e.nz * (off + 0.3), y - 0.2, 3.5]);
}

// A wall face with outward normal (nx, nz) between two points; t runs as edges() would.
function rWall(ax, az, bx, bz, nx, nz) {
  const dx = nz, dz = -nx;
  if ((bx - ax) * dx + (bz - az) * dz < 0) [ax, az, bx, bz] = [bx, bz, ax, az];
  return { ax, az, bx, bz, len: Math.hypot(bx - ax, bz - az), dx, dz, nx, nz, rot: -Math.atan2(dz, dx) };
}
const tAt = (e, x, z) => (x - e.ax) * e.dx + (z - e.az) * e.dz;
const span = (e, p, q) => { const a = tAt(e, ...p), b = tAt(e, ...q); return [Math.min(a, b), Math.max(a, b)]; };

// A skin of precast RD thick laid over a wall from t0 to t1, ground to `top`,
// with openings [ta, tb, ya, yb]: the windows and doors set in them sit back
// from its face, as the real ones do (Ethan). Its reveals break at the openings.
function rSkin(W, e, t0, t1, top, holes = []) {
  const ts = [...new Set([t0, t1, ...holes.flatMap(([a, b]) => [a, b])])].filter((t) => t >= t0 && t <= t1).sort((a, b) => a - b);
  for (let i = 0; i + 1 < ts.length; i++) {
    const a = ts[i], b = ts[i + 1], m = (a + b) / 2;
    if (b - a < 0.005) continue;
    const cut = holes.filter(([ha, hb]) => ha < m && hb > m).map(([, , ya, yb]) => [ya, yb]).sort((p, q) => p[0] - q[0]);
    const pieces = [];
    let y = 0;
    for (const [ya, yb] of cut) { if (ya > y + 0.005) pieces.push([y, ya]); y = Math.max(y, yb); }
    if (top > y + 0.005) pieces.push([y, top]);
    for (const [ya, yb] of pieces) {
      onWall(W, e, m, 0, RD / 2, () => {
        W.box('stucco', 0, (ya + yb) / 2, 0, b - a, yb - ya, RD, RC.wall);
        for (let yy = 1.2; yy < top - 0.3; yy += 1.2) if (yy > ya + 0.03 && yy < yb - 0.03) W.box('flat', 0, yy, RD / 2 + 0.006, b - a, 0.035, 0.012, RC.reveal);
      });
      for (let tt = t0 + 2.7; tt < t1 - 0.4; tt += 2.7) {
        if (tt > a + 0.03 && tt < b - 0.03) onWall(W, e, tt, (ya + yb) / 2, RD + 0.006, () => W.box('flat', 0, 0, 0, 0.035, yb - ya, 0.012, RC.reveal));
      }
    }
  }
  onWall(W, e, (t0 + t1) / 2, top + 0.04, RD / 2, () => W.box('flat', 0, 0, 0, t1 - t0, 0.08, RD + 0.06, C.fin));
}
// An opening for a window drawn by windowAt at (t, y, w, h).
const winHole = (t, y, w, h) => [t - w / 2 - 0.08, t + w / 2 + 0.08, y - h / 2 - 0.08, y + h / 2 + 0.08];
// A window with its mullions where they really are: cols are the columns' shares
// of the width, rows equal.
function gridWindow(W, e, t, y, w, h, cols, rows) {
  onWall(W, e, t, y, 0.03, () => {
    W.box('flat', 0, 0, 0, w + 0.14, h + 0.14, 0.1, RC.grid);
    W.quad('glass', [-w / 2, -h / 2, 0.06], [w / 2, -h / 2, 0.06], [w / 2, h / 2, 0.06], [-w / 2, h / 2, 0.06], pane(), [[0, 0], [w, 0], [w, h], [0, h]]);
    let x = -w / 2;
    for (const c of cols.slice(0, -1)) { x += c * w; W.box('flat', x, 0, 0.08, 0.06, h, 0.05, RC.grid); }
    for (let k = 1; k < rows; k++) W.box('flat', 0, -h / 2 + (k * h) / rows, 0.08, w, 0.05, 0.05, RC.grid);
  });
}

// A bay of white panels on a grey grid, a row of teal glass at the head of each
// floor and a strip of glass up one side (IMG_2350, IMG_2352).
function rBay(W, e, t0, t1, { storefront = false } = {}) {
  const w = t1 - t0, mid = (t0 + t1) / 2;
  R_FLOORS.forEach((f, k) => {
    if (k === 0 && storefront) return;
    const y0 = f + 0.8, y1 = f + 3.4;
    onWall(W, e, mid, 0, 0.03, () => {
      W.box('flat', 0, (y0 + y1) / 2, 0, w - 0.3, y1 - y0, 0.05, RC.panel);
      const gx0 = -w / 2 + 0.25, gx1 = w / 2 - 0.95;
      W.quad('glass', [gx0, y1 - 0.62, 0.03], [gx1, y1 - 0.62, 0.03], [gx1, y1 - 0.08, 0.03], [gx0, y1 - 0.08, 0.03], RC.teal, 'auto');
      W.quad('glass', [w / 2 - 0.8, y0 + 0.08, 0.03], [w / 2 - 0.25, y0 + 0.08, 0.03], [w / 2 - 0.25, y1 - 0.08, 0.03], [w / 2 - 0.8, y1 - 0.08, 0.03], pane(), 'auto');
      for (const y of [y0, (y0 + y1 - 0.62) / 2, y1 - 0.62, y1]) W.box('flat', 0, y, 0.04, w - 0.3, 0.05, 0.03, RC.grid);
      for (let x = gx0; x <= gx1 + 0.01; x += (gx1 - gx0) / Math.max(1, Math.round((gx1 - gx0) / 1.25))) W.box('flat', x, (y0 + y1) / 2, 0.04, 0.05, y1 - y0, 0.03, RC.grid);
      for (const x of [w / 2 - 0.82, w / 2 - 0.23]) W.box('flat', x, (y0 + y1) / 2, 0.04, 0.05, y1 - y0, 0.03, RC.grid);
    });
  });
  if (storefront) asbFront(W, e, t0 + 0.3, t1 - 0.3);
}

// The ASB Office's front under its awning (IMG_2342, IMG_2350; landmarks.js draws
// the awning). North to south: a glass side light, the glass door, then five
// columns of windows: a transom row, a middle row (blinds, posters), a row of
// small service windows over a white counter on two legs, and a cream knee wall.
function asbFront(W, e, t0, t1) {
  const H = 2.95, frame = RC.grid, glass = (x0, x1, y0, y1, col = DARK) =>
    W.quad('glass', [x0, y0, 0.05], [x1, y0, 0.05], [x1, y1, 0.05], [x0, y1, 0.05], col, [[0, 0], [x1 - x0, 0], [x1 - x0, y1 - y0], [0, y1 - y0]]);
  const bar = (x, y, w, h) => W.box('flat', x, y, 0.07, w, h, 0.06, frame);
  onWall(W, e, 0, 0, 0.03, () => {
    W.box('flat', (t0 + t1) / 2, H / 2, 0, t1 - t0, H, 0.06, frame);          // the frame behind it all
    const sl = t0 + 0.55, dr = sl + 1.0;
    // side light and door, each with a transom
    glass(t0 + 0.06, sl - 0.04, 0.12, 2.3); glass(t0 + 0.06, sl - 0.04, 2.38, H - 0.06);
    glass(sl + 0.08, dr - 0.08, 0.1, 2.25); glass(sl + 0.04, dr - 0.04, 2.38, H - 0.06);
    W.box('flat', dr - 0.2, 1.0, 0.1, 0.04, 0.3, 0.05, color('#c9ccd0'));      // the door's handle
    W.box('flat', (t0 + sl) / 2, 1.25, 0.08, 0.3, 0.38, 0.005, color('#f4f2ea'));   // notices taped up
    W.box('flat', (sl + dr) / 2, 1.55, 0.08, 0.22, 0.28, 0.005, color('#f4f2ea'));
    for (const x of [sl, dr]) bar(x, H / 2, 0.08, H);
    bar((t0 + dr) / 2, 2.34, dr - t0, 0.07);
    // the windows: five columns
    const n = 5, cw = (t1 - dr) / n;
    for (let k = 0; k < n; k++) {
      const x0 = dr + k * cw, x1 = x0 + cw;
      glass(x0 + 0.04, x1 - 0.04, 2.38, H - 0.06);                               // transom
      glass(x0 + 0.04, x1 - 0.04, 1.48, 2.3, k % 2 ? LIT : DARK);                  // middle row
      if (k >= 2) W.box('louver', (x0 + x1) / 2, 1.9, 0.06, cw - 0.12, 0.78, 0.01, color('#e9e6dc'));   // blinds
      for (const j of [0, 1]) glass(x0 + 0.04 + (j * cw) / 2, x0 + ((j + 1) * cw) / 2 - 0.04, 0.9, 1.42);   // service windows
      W.box('stucco', (x0 + x1) / 2, 0.43, 0.06, cw - 0.06, 0.8, 0.05, RC.wall);  // knee wall
      bar(x1, H / 2, 0.07, H);
    }
    bar((dr + t1) / 2, 2.34, t1 - dr, 0.07); bar((dr + t1) / 2, 1.45, t1 - dr, 0.06); bar((dr + t1) / 2, 0.86, t1 - dr, 0.06);
    // posters in the windows (IMG_2342)
    const poster = (x, y, w, h, col) => W.box('flat', x, y, 0.075, w, h, 0.005, col);
    poster(dr + cw * 0.5, 1.9, 0.42, 0.55, color('#5da0c9')); poster(dr + cw * 0.3, 1.15, 0.36, 0.44, color('#6fb3a4'));
    poster(dr + cw * 0.12, 1.95, 0.2, 0.26, color('#e2b43b')); poster(dr + cw * 1.3, 1.1, 0.32, 0.4, color('#8fc2df'));
    // the service counter under the small windows, on two legs
    W.box('flat', (dr + cw + t1) / 2, 0.9, 0.25, t1 - dr - cw - 0.4, 0.06, 0.4, color('#f1efe8'));
    for (const x of [dr + cw + 0.3, t1 - 0.3]) W.box('flat', x, 0.44, 0.35, 0.08, 0.88, 0.08, color('#e8e5dc'));
  });
}

// A single glass door with a panel over it: a grey louver (the ends' side doors)
// or glass (the quad corners' doors). Returns its opening for rSkin.
function rSideDoor(W, e, t, glassTop = false) {
  doorAt(W, e, t, 0.95, 2.3, null, { glass: true, frameCol: RC.grid, single: true });
  onWall(W, e, t, 2.72, 0.02, () => {
    W.box('flat', 0, 0, 0, 1.15, 0.74, 0.1, RC.grid);
    if (glassTop) W.quad('glass', [-0.45, -0.29, 0.06], [0.45, -0.29, 0.06], [0.45, 0.29, 0.06], [-0.45, 0.29, 0.06], pane(), 'auto');
    else W.box('louver', 0, 0, 0.06, 0.92, 0.56, 0.03, color('#9ca1a6'));
  });
  return [t - 0.58, t + 0.58, 0, 3.09];
}
// The stainless bottle-filler fountain (IMG_2347, IMG_2355): the filler above,
// the bowl, the housing below; and the pipe guard beside it.
function rFountain(W, e, t, off) {
  onWall(W, e, t, 0, off, () => {
    W.box('flat', 0, 1.36, 0.06, 0.42, 0.62, 0.12, RC.steel);
    W.box('flat', 0, 1.32, 0.122, 0.28, 0.36, 0.01, RC.dark);
    W.box('flat', 0, 0.96, 0.2, 0.52, 0.13, 0.4, RC.steel);
    W.box('flat', 0, 1.027, 0.22, 0.4, 0.006, 0.28, RC.dark);
    W.cyl('flat', 0.1, 1.02, 0.3, 0.02, 0.02, 0.07, 6, RC.steel);
    W.box('flat', 0, 0.68, 0.15, 0.4, 0.42, 0.3, color('#9ea3a8'));
    for (let y = 0.55; y < 0.85; y += 0.06) W.box('flat', -0.12, y, 0.302, 0.1, 0.015, 0.006, RC.dark);
  });
}
function rGuard(W, e, t, off) {
  onWall(W, e, t, 0, off, () => {
    for (const z of [0.1, 0.56]) W.cyl('flat', 0, 0, z, 0.024, 0.024, 0.88, 8, RC.galv);
    W.box('flat', 0, 0.88, 0.33, 0.05, 0.05, 0.5, RC.galv);
  });
}
const serviceDoor = (W, e, t) => doorAt(W, e, t, 0.9, 2.2, color('#e8dcc2'), { frameCol: color('#d9ccb0'), plain: true });

// A thick block standing out from the quad face (Ethan: "much thicker"), half a
// grey AC shaft with louvers, half plain cream wall (IMG_2344, IMG_2349, IMG_2352).
function rBlock(W, h, z0, z1, kind, { louvers = [], door = false, sides = [] } = {}) {
  const front = rWall(RF, z0, RF, z1, -1, 0), [a, b] = span(front, [RF, z0], [RF, z1]);
  const sideFaces = sides.map((z) => rWall(RF, z, RQ, z, 0, z === z0 ? -1 : 1));
  if (kind === 'grey') {
    W.slab('stucco', RF, z0, RQ, z1, 0, h - 0.7, RC.tower);
    W.slab('stucco', RF, z0, RQ, z1, h - 0.7, h + 0.08, RC.wall);
    for (const e of [front, ...sideFaces]) onWall(W, e, e.len / 2, 0, 0.012, () => { for (const y of [2.2, 6.6, 11]) W.box('flat', 0, y, 0, e.len, 0.035, 0.02, RC.towerLine); });
    for (const f of louvers) {
      onWall(W, front, (a + b) / 2, R_FLOORS[f] + 2.2, 0.02, () => {
        W.box('flat', 0, 0, 0, b - a - 0.4, 2.5, 0.06, RC.towerLine);
        W.box('louver', 0, 0, 0.04, b - a - 0.6, 2.3, 0.03, color('#b7bbbe'));
      });
    }
    if (door) doorAt(W, front, (a + b) / 2, 0.95, 2.2, color('#8f9496'), { frameCol: RC.grid });
    return;
  }
  if (kind === 'cream') {
    W.slab('stucco', RF, z0, RQ, z1, 0, h, RC.wall);
    W.slab('flat', RF - 0.03, z0, RQ, z1, h, h + 0.08, C.fin);
    reveals(W, front, a, b, h - 0.6);
    for (const e of sideFaces) reveals(W, e, 0, e.len, h - 0.6);
    sconce(W, front, (a + b) / 2, 3.1);
    return;
  }
  // a corner: the cream block has narrow windows up it and a glass door at the
  // foot, set in a skin like the ends (IMG_2348, IMG_2352)
  W.slab('stucco', RF + RD, z0, RQ, z1, 0, h, RC.wall);
  const inner = rWall(RF + RD, z0, RF + RD, z1, -1, 0), m = inner.len / 2, holes = [rSideDoor(W, inner, m, true)];
  for (const f of [4.4, 8.8]) { windowAt(W, inner, m, f + 2.1, 0.62, 2.6, { frame: RC.grid }); holes.push(winHole(m, f + 2.1, 0.62, 2.6)); }
  rSkin(W, inner, 0, inner.len, h, holes);
  sconce(W, front, m - 1.0, 3.1);
}

// One end of R (north or south): the narrow block's end, the step, and the wide
// block's end with its entrance set in beside the step.
function rEnd(W, h, north) {
  const s = north ? -1 : 1, zN = north ? RN : RSN, zW = north ? RNW : RSW, zR = zW - s * RIN;
  // the narrow end: blank but for the side door with two small windows above,
  // a lamp, and by the inside corner the fountain and its guard (Ethan; IMG_2344,
  // IMG_2346, IMG_2347, IMG_2355). k = metres from the inside corner.
  const nE = rWall(RF, zN, RS, zN, 0, s), kx = (k) => tAt(nE, RS - RD - k, zN);   // from the corner as seen
  const holes = [rSideDoor(W, nE, kx(1.75))];
  for (const f of [4.4, 8.8]) { windowAt(W, nE, kx(1.75), f + 2.4, 0.75, 0.7, { frame: RC.grid }); holes.push(winHole(kx(1.75), f + 2.4, 0.75, 0.7)); }
  rSkin(W, nE, ...span(nE, [RF, zN], [RS, zN]), h, holes);
  rFountain(W, nE, kx(0.42), RD);
  rGuard(W, nE, kx(1.0), RD);
  sconce(W, nE, kx(3.4), 3.1, RD);
  // the step: the white service door by the inside corner, a card reader, the fire bell
  const st = rWall(RS, zN, RS, zW, -1, 0), [p0, p1] = span(st, [RS, zN + s * RD], [RS, zW + s * RD]);
  const sk = (k) => tAt(st, RS, zN + s * (RD + k));
  serviceDoor(W, st, sk(0.75));
  rSkin(W, st, p0, p1, h, [[sk(0.75) - 0.55, sk(0.75) + 0.55, 0, 2.3]]);
  onWall(W, st, sk(1.55), 1.3, RD + 0.01, () => W.box('flat', 0, 0, 0, 0.12, 0.16, 0.04, color('#26282b')));
  onWall(W, st, sk(0.95), 3.8, RD + 0.03, () => W.box('flat', 0, 0, 0, 0.24, 0.24, 0.06, color('#c8352e')));
  // the wide end: a pier by the step with a lamp and camera, the entrance, then
  // tall narrow windows (the lowest reaching the ground) with a lamp either side
  const wE = rWall(RS - RD, zW, RE, zW, 0, s), wx = (x) => tAt(wE, x, zW);
  rSkin(W, wE, ...span(wE, [RS - RD, zW], [RX0, zW]), h);
  sconce(W, wE, wx(42.4), 3.1, RD);
  onWall(W, wE, wx(42.6), 3.9, RD, () => { W.box('flat', 0, 0, 0.08, 0.05, 0.05, 0.16, C.white); W.cyl('flat', 0, -0.1, 0.18, 0.07, 0.07, 0.1, 8, C.white); });
  onWall(W, wE, wx(RX0 - 0.12), 0, RD + 0.08, () => W.cyl('flat', 0, 0, 0, 0.05, 0.05, 3.25, 8, color('#efe7d6')));
  const wholes = [], nx = 51.0;
  for (const [y, hh] of [[1.55, 2.95], [5.85, 2.75], [9.75, 2.55]]) { windowAt(W, wE, wx(nx), y, 0.7, hh, { frame: RC.grid }); wholes.push(winHole(wx(nx), y, 0.7, hh)); }
  if (north) {
    // the big cream louver panel beside the north entrance (IMG_2357)
    onWall(W, wE, wx(47.75), 2.05, 0.03, () => { W.box('flat', 0, 0, 0, 2.3, 3.5, 0.1, RC.cap); W.box('louver', 0, 0, 0.06, 2.0, 3.2, 0.03, color('#f2ead8')); });
    wholes.push([...span(wE, [46.6, zW], [48.9, zW]), 0.3, 3.8]);
  } else sconce(W, wE, wx(49.2), 3.1, RD);
  sconce(W, wE, wx(54.0), 3.1, RD);
  rSkin(W, wE, ...span(wE, [RX1, zW], [RE, zW]), h, wholes);
  // the entrance, set 0.9 m in under a band at the top: canopy, glass doors and
  // side lights, and a big gridded window on each floor above (IMG_2345)
  const bE = rWall(RX0, zR, RX1, zR, 0, s), bm = bE.len / 2;
  onWall(W, bE, bm, 0, 0, () => {
    W.box('flat', 0, 3.3, (RIN + RD + 1.3) / 2, 4.3, 0.26, RIN + RD + 1.3, RC.canopy);
    W.box('flat', 0, 3.165, (RIN + RD + 1.3) / 2, 4.1, 0.02, RIN + RD + 1.1, color('#5b5f63'));
  });
  LIGHTS.push([bE.ax + bE.dx * bm + bE.nx * 1.2, bE.az + bE.dz * bm + bE.nz * 1.2, 3.1, 4.5]);
  doorAt(W, bE, bm, 1.9, 2.4, null, { glass: true, frameCol: RC.grid });
  for (const d of [-1.18, 1.18]) windowAt(W, bE, bm + d, 1.25, 0.45, 2.35, { frame: RC.grid });
  windowAt(W, bE, bm, 2.85, bE.len - 0.3, 0.5, { frame: RC.grid });
  // the big windows: narrow side lights either side of a wide middle, four rows (IMG_2345)
  for (const [y, hh] of [[5.8, 3.2], [9.9, 2.8]]) gridWindow(W, bE, bm, y, bE.len - 0.3, hh, [0.16, 0.68, 0.16], 4);
  for (const [x, n] of [[RX0, 1], [RX1, -1]]) reveals(W, rWall(x, zR, x, zW, n, 0), 0, RIN, 12.2);
  W.slab('stucco', RX0, Math.min(zR, zW + s * RD), RX1, Math.max(zR, zW + s * RD), 12.2, h, RC.wall);
  onWall(W, wE, (wx(RX0) + wx(RX1)) / 2, h + 0.04, RD / 2, () => W.box('flat', 0, 0, 0, RX1 - RX0, 0.08, RD + 0.06, C.fin));
}

function buildR(W, b) {
  const h = b.h;
  // the quad face: the thick blocks, and between them the window bays; the ASB
  // Office is the southernmost (Ethan: "on the very right side")
  const q = rWall(RQ, RN, RQ, RSN, -1, 0), T = (z) => tAt(q, RQ, z);
  rBlock(W, h, RN, -19.0, 'corner');
  rBlock(W, h, -19.0, -16.8, 'grey', { door: true, sides: [-16.8] });
  for (const [z0, zm, z1, lv] of [[-9.9, -7.9, -6.7, [0, 1, 2]], [0.2, 2.2, 3.4, [0, 2]], [10.3, 12.3, 13.5, [0, 2]]]) {
    rBlock(W, h, z0, zm, 'grey', { louvers: lv, sides: [z0] });
    rBlock(W, h, zm, z1, 'cream', { sides: [z1] });
  }
  rBlock(W, h, 20.4, 22.6, 'grey', { louvers: [0, 2], sides: [20.4] });
  rBlock(W, h, 22.6, RSN, 'corner');
  for (const [z0, z1, sf] of [[-16.8, -9.9], [-6.7, 0.2], [3.4, 10.3], [13.5, 20.4, true]]) rBay(W, q, T(z0), T(z1), { storefront: !!sf });
  rEnd(W, h, true);
  rEnd(W, h, false);
  // the pool side: a sawtooth of grey towers with cream caps, the cream wall
  // between with a few doors and lights (IMG_2356, IMG_2361)
  const e = rWall(RE, RNW, RE, RSW, 1, 0);
  reveals(W, e, 0.2, e.len - 0.2, h - 0.6);
  for (let t = 3.5, k = 0; t < e.len - 2; t += 7, k++) {
    onWall(W, e, t, 0, 0.45, () => {
      W.box('stucco', 0, (h - 0.7) / 2, 0, 1.8, h - 0.7, 0.92, RC.tower);
      W.box('stucco', 0, h - 0.3, 0, 1.8, 0.8, 0.92, RC.cap);
    });
    if (k % 2 === 0) sconce(W, e, t + 2.6, 3.1);
    if (k % 3 === 1) serviceDoor(W, e, t + 3.5);
  }
}

// ── the cafeteria's quad side ──
// From Ethan's photos IMG_2362–2371: under the covered walkway a one-storey front of
// dark-framed storefront (glass over a solid lower panel, a transom row, glass
// doors) in groups between cream piers; the tall dining hall set 2.4 m back above
// it with a band of clerestory windows, white panels over glass; the lower wings
// either side plain cream with yellow doors, a notice board and a box fountain.
const CC = { frame: color('#5d6166'), panel: color('#ebe7dc'), pier: color('#ece3cc'), white: color('#f4f3ee') };
const southWall = (x0, x1, z) => rWall(x0, z, x1, z, 0, 1);        // t = x - x0

// A run of storefront along a south-facing wall from x0 to x1. parts: 'p' a window
// bay, 'd' a pair of glass doors, 's' a single glass door; they stretch to fit.
function storefront(W, z, x0, x1, parts, top = 3.1) {
  const want = { p: 1.35, d: 1.9, s: 1.0 };
  const k = (x1 - x0) / [...parts].reduce((a, c) => a + want[c], 0);
  onWall(W, southWall(x0, x1, z), 0, 0, 0.03, () => {
    W.box('flat', (x1 - x0) / 2, top / 2, 0, x1 - x0, top, 0.06, CC.frame);
    let t = 0;
    for (const c of parts) {
      const w = want[c] * k, a = t + 0.05, b = t + w - 0.05;
      const glass = (y0, y1, col = pane()) => W.quad('glass', [a, y0, 0.05], [b, y0, 0.05], [b, y1, 0.05], [a, y1, 0.05], col, [[0, 0], [b - a, 0], [b - a, y1 - y0], [0, y1 - y0]]);
      if (c === 'p') {
        W.box('flat', (a + b) / 2, 0.43, 0.05, b - a, 0.82, 0.03, CC.panel);           // solid lower panel
        glass(0.9, 2.2); glass(2.28, top - 0.06);
        for (const y of [0.87, 2.24]) W.box('flat', (a + b) / 2, y, 0.07, b - a, 0.06, 0.04, CC.frame);
      } else {
        const leaves = c === 'd' ? 2 : 1, lw = (b - a) / leaves;
        for (let i = 0; i < leaves; i++) {
          const la = a + i * lw + 0.02, lb = la + lw - 0.04;
          W.box('flat', (la + lb) / 2, 1.12, 0.05, lb - la, 2.24, 0.04, CC.frame);
          for (const [y0, y1] of [[0.25, 1.0], [1.2, 2.1]]) W.quad('glass', [la + 0.1, y0, 0.075], [lb - 0.1, y0, 0.075], [lb - 0.1, y1, 0.075], [la + 0.1, y1, 0.075], DARK, 'auto');
          W.box('flat', leaves === 2 && i === 0 ? lb - 0.14 : la + 0.14, 1.05, 0.1, 0.05, 0.3, 0.05, color('#c9ccd0'));   // pull
        }
        glass(2.32, top - 0.06);                                                     // transom
      }
      W.box('flat', t, top / 2, 0.07, 0.07, top, 0.04, CC.frame);
      t += w;
    }
    W.box('flat', t, top / 2, 0.07, 0.07, top, 0.04, CC.frame);
  });
}
const cafPier = (W, z, x0, x1, top) => W.slab('stucco', x0, z, x1, z + 0.14, 0, top, CC.pier);

function cafFront(W) {
  const z = -30.4, top = 3.1;
  // the one-storey front (x 0–50): six groups between cream piers (IMG_2364, IMG_2368)
  const groups = ['ppdpp', 'ppps', 'pdp', 'pppp', 'ppdpp', 'sppp'], P = 0.55, gw = (50 - P * (groups.length + 1)) / groups.length;
  for (let i = 0; i <= groups.length; i++) cafPier(W, z, i * (gw + P), i * (gw + P) + P, 3.5);
  groups.forEach((g, i) => storefront(W, z, P + i * (gw + P), P + i * (gw + P) + gw, g, top));
  // "SNACK BAR C-123" beside the second group's single door
  const snack = P + (gw + P) + gw + 0.3;
  onWall(W, southWall(snack - 0.3, snack + 0.3, z + 0.14), 0.3, 1.55, 0.01, () => W.box('flat', 0, 0, 0, 0.36, 0.2, 0.02, color('#9aa0a6')));
  // the tall hall's clerestory, set back above the front's roof: white panels over glass (IMG_2362–2364)
  const ce = southWall(0, 50, -32.8), units = 20, uw = 49.6 / units;
  onWall(W, ce, 0, 0, 0.03, () => {
    W.box('flat', 25, 5.15, 0, 49.6, 2.36, 0.08, CC.frame);
    for (let i = 0; i < units; i++) {
      const a = 0.2 + i * uw + 0.05, b = 0.2 + (i + 1) * uw - 0.05;
      W.quad('flat', [a, 4.86, 0.045], [b, 4.86, 0.045], [b, 6.25, 0.045], [a, 6.25, 0.045], CC.white);
      W.quad('glass', [a, 4.05, 0.045], [b, 4.05, 0.045], [b, 4.8, 0.045], [a, 4.8, 0.045], pane(), [[0, 0], [b - a, 0], [b - a, 0.75], [0, 0.75]]);
      W.box('flat', 0.2 + i * uw, 5.15, 0.06, 0.07, 2.3, 0.04, CC.frame);
    }
    W.box('flat', 49.8, 5.15, 0.06, 0.07, 2.3, 0.04, CC.frame);
    W.box('flat', 25, 4.83, 0.06, 49.6, 0.06, 0.04, CC.frame);
  });
  // the west wing (IMG_2371): a notice board, a yellow door, windows, a yellow door,
  // a white ice machine and a dark door
  const ww = southWall(-17.8, 0, z), wt = (x) => x + 17.8;
  onWall(W, ww, wt(-15.4), 1.65, 0.03, () => { W.box('flat', 0, 0, 0, 1.8, 1.15, 0.06, color('#5b4432')); W.box('flat', 0, 0, 0.035, 1.62, 0.97, 0.01, color('#c9a877')); });
  doorAt(W, ww, wt(-12.6), 0.95, 2.2, C.door, { frameCol: color('#d9ccb0') });
  storefront(W, z, -10.8, -5.4, 'pppp', 2.9);
  doorAt(W, ww, wt(-4.3), 0.95, 2.2, C.door, { frameCol: color('#d9ccb0') });
  W.box('flat', -2.9, 0.95, z + 0.4, 0.9, 1.9, 0.7, color('#eef0ee'));
  doorAt(W, ww, wt(-1.3), 0.95, 2.2, color('#4f5459'), { frameCol: CC.frame, plain: true });
  // the east wing (IMG_2365, IMG_2367): a yellow door, the fountain box with its two
  // bubblers, a fire bell and a sign, then blank wall to a pair of dark doors
  const ew = southWall(50, 62.6, z), et = (x) => x - 50;
  doorAt(W, ew, et(51.3), 0.95, 2.2, C.door, { frameCol: color('#d9ccb0') });
  onWall(W, ew, et(53.9), 0, 0.02, () => {
    W.box('stucco', 0, 0.68, 0.14, 0.78, 1.36, 0.28, RC.wall);                      // the cream pedestal
    for (const [y, x] of [[0.78, -0.12], [1.0, -0.12]]) W.box('flat', x - 0.26, y, 0.22, 0.32, 0.12, 0.3, RC.steel);
    W.box('flat', -0.12, 0.9, 0.29, 0.1, 0.36, 0.02, RC.steel);
  });
  onWall(W, ew, et(52.6), 3.0, 0.03, () => W.box('flat', 0, 0, 0, 0.18, 0.18, 0.06, color('#c8352e')));
  onWall(W, ew, et(52.6), 1.7, 0.02, () => W.box('flat', 0, 0, 0, 0.14, 0.26, 0.02, color('#e2b43b')));
  doorAt(W, ew, et(60.6), 1.8, 2.3, color('#4f5459'), { frameCol: CC.frame, plain: true });
}

export function buildBuildings(W) {
  const R = rng(42);
  for (const b of BUILDINGS) {
    const wall = WALL[b.style] || C.cream;
    const roofY = b.h - 0.5;
    if (b.style === 'theatre-lobby') { lobbyGlass(W, b); continue; }
    if (b.style === 'portable') continue;           // portables.js
    W.prism('stucco', b.poly, 0, roofY, wall, { top: true, topMat: 'roof', topCol: C.roof });
    // no parapet on a wall shared with a neighbour at least as tall: it would be
    // hidden, and its coping would overlap the neighbour's and flicker
    parapet(W, b.poly, b.h, wall, undefined, undefined, (e) => BUILDINGS.some((o) => o !== b && o.h >= b.h - 0.01 && sharesEdge(e, o)));
    if (b.gable) gable(W, b, roofY);
    else if (b.barrel) barrels(W, b, roofY);
    else if (b.style !== 'r') rooftop(W, b, R, roofY);
    const kit = KITS[b.style] || KITS.plain;
    for (const e of edges(b.poly)) kit(W, b, e, R);
    if (b.style === 'r') buildR(W, b);
    if (b.id === 'CAF') cafFront(W);
    // single-storey wings get a flat overhang on the long sides (covered walks)
    if (b.style === 'p') overhangs(W, b, 3.7);

  }
}

// Does building o have a wall back to back with edge e (same line, facing the other way, overlapping)?
function sharesEdge(e, o) {
  const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2;
  return edges(o.poly).some((f) => {
    if (e.nx * f.nx + e.nz * f.nz > -0.99) return false;
    const t = (mx - f.ax) * f.dx + (mz - f.az) * f.dz;
    if (t < 0 || t > f.len) return false;
    return Math.abs((mx - f.ax) * f.nx + (mz - f.az) * f.nz) < 0.05;
  });
}

// Flat roof overhang on the long sides, on square posts.
function overhangs(W, b, y) {
  for (const e of edges(b.poly)) {
    if (e.len < 12) continue;
    const d = 2.2;
    const x0 = e.ax, z0 = e.az;
    W.with(x0 + e.nx * (d / 2), y, z0 + e.nz * (d / 2), e.rot, () => {
      W.box('flat', e.len / 2, 0.12, 0, e.len, 0.24, d, C.fin);
    });
    for (const { t } of bays(e.len, 5, 1)) onWall(W, e, t, y / 2, d - 0.15, () => W.box('flat', 0, 0, 0, 0.18, y, 0.18, C.fin));
  }
}

// A gabled standing-seam metal roof (the theatre's west wing).
function gable(W, b, y) {
  const xs = b.poly.map((p) => p[0]), zs = b.poly.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const xm = (x0 + x1) / 2, top = y + b.gable, o = 0.4;
  const col = C.metalRoof;
  W.quad('metal', [x0 - o, y, z1 + o], [x0 - o, y, z0 - o], [xm, top, z0 - o], [xm, top, z1 + o], col, 'auto');
  W.quad('metal', [x1 + o, y, z0 - o], [x1 + o, y, z1 + o], [xm, top, z1 + o], [xm, top, z0 - o], col, 'auto');
  // gable ends
  W.tris('stucco', [[x0, y, z0], [xm, top, z0], [x1, y, z0]], [[0, 0, -1], [0, 0, -1], [0, 0, -1]], null, WALL.theatre);
  W.tris('stucco', [[x1, y, z1], [xm, top, z1], [x0, y, z1]], [[0, 0, 1], [0, 0, 1], [0, 0, 1]], null, WALL.theatre);
}

// The science building's curved metal barrel roofs, with a strip of clerestory under each.
function barrels(W, b, y) {
  const xs = b.poly.map((p) => p[0]), zs = b.poly.map((p) => p[1]);
  const x0 = Math.min(...xs) + 0.8, x1 = Math.max(...xs) - 0.8, z0 = Math.min(...zs) + 0.8, z1 = Math.max(...zs) - 0.8;
  const alongX = b.barrel === 'x';
  const span = alongX ? z1 - z0 : x1 - x0, len = alongX ? x1 - x0 : z1 - z0;
  const w = Math.min(6.5, span * 0.6), rise = 1.4, base = y + 0.9, seg = 10;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  W.with(cx, 0, cz, alongX ? 0 : Math.PI / 2, () => {
    // clerestory box under the vault
    W.box('stucco', 0, y + 0.45, 0, len, 0.9, w, WALL.s);
    windowRow(W, len, y + 0.45, w / 2 + 0.01);
    windowRow(W, len, y + 0.45, -(w / 2 + 0.01), true);
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
      const p = (a) => [-(w / 2) * Math.cos(a), base + rise * Math.sin(a)];
      const [z_0, y_0] = p(a0), [z_1, y_1] = p(a1);
      W.quad('metal', [-len / 2 - 0.3, y_0, z_0], [-len / 2 - 0.3, y_1, z_1], [len / 2 + 0.3, y_1, z_1], [len / 2 + 0.3, y_0, z_0], C.metalRoof,
        [[0, 0], [0, 1], [len, 1], [len, 0]]);
    }
    // end caps
    for (const s of [-1, 1]) {
      const pos = [], nor = [];
      for (let i = 0; i < seg; i++) {
        const a0 = Math.PI * (i / seg), a1 = Math.PI * ((i + 1) / seg);
        const q = (a) => [s * (len / 2 + 0.3), base + rise * Math.sin(a), -(w / 2) * Math.cos(a)];
        const tri = s > 0 ? [[s * (len / 2 + 0.3), base, 0], q(a0), q(a1)] : [[s * (len / 2 + 0.3), base, 0], q(a1), q(a0)];
        pos.push(...tri); nor.push([s, 0, 0], [s, 0, 0], [s, 0, 0]);
      }
      W.tris('flat', pos, nor, null, C.metalRoof);
    }
  });
}

function windowRow(W, len, y, z, back = false) {
  const n = Math.floor(len / 2.2);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 1.1 + i * 2.2;
    const d = back ? -1 : 1;
    W.quad('glass', [x - 0.9 * d, y - 0.3, z], [x + 0.9 * d, y - 0.3, z], [x + 0.9 * d, y + 0.3, z], [x - 0.9 * d, y + 0.3, z], pane(), 'auto');
  }
}

// The theatre lobby: a dark glass box with a curved flat canopy reaching toward Monroe.
function lobbyGlass(W, b) {
  const [[x0, z0], , [x1, z1]] = b.poly;
  const h = b.h;
  W.slab('flat', x0, z0, x1, z1, h - 0.6, h, color('#e9ecec'));
  W.slab('flat', x0 + 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2, 0, h - 0.6, color('#33424d'));
  for (const e of edges(b.poly)) {
    for (let t = 1.2; t < e.len - 0.6; t += 2.4) {
      onWall(W, e, t, (h - 0.6) / 2, -0.15, () => W.quad('glass', [-1.15, -(h - 0.6) / 2, 0], [1.15, -(h - 0.6) / 2, 0], [1.15, (h - 0.6) / 2, 0], [-1.15, (h - 0.6) / 2, 0], LIT,
        [[0, 0], [2.3, 0], [2.3, h], [0, h]]));
      onWall(W, e, t + 1.2, (h - 0.6) / 2, -0.1, () => W.box('flat', 0, 0, 0, 0.1, h - 0.6, 0.12, C.dark));
    }
    onWall(W, e, e.len / 2, 3.2, -0.1, () => W.box('flat', 0, 0, 0, e.len, 0.12, 0.14, C.dark));
  }
  // curved canopy: a quarter-disc slab off the lobby's north-east corner, on round columns
  const cx = x1, cz = z0 + 2, r = 13;
  const pos = [], nor = [], segs = 14;
  for (let i = 0; i < segs; i++) {
    const a0 = -Math.PI / 2 + (Math.PI / 2) * (i / segs), a1 = -Math.PI / 2 + (Math.PI / 2) * ((i + 1) / segs);
    const P = (a, rr) => [cx + Math.cos(a) * rr, 4.6, cz + Math.sin(a) * rr * 0.55];
    pos.push(P(a0, 0), P(a1, r), P(a0, r)); nor.push([0, 1, 0], [0, 1, 0], [0, 1, 0]);
    pos.push(P(a0, 0), P(a0, r), P(a1, r)); nor.push([0, -1, 0], [0, -1, 0], [0, -1, 0]);
    // fascia
    const A = P(a0, r), B = P(a1, r);
    W.quad('flat', [A[0], 4.1, A[2]], [B[0], 4.1, B[2]], [B[0], 4.75, B[2]], [A[0], 4.75, A[2]], color('#e9ecec'));
    W.quad('flat', [B[0], 4.1, B[2]], [A[0], 4.1, A[2]], [A[0], 4.75, A[2]], [B[0], 4.75, B[2]], color('#e9ecec'));
  }
  W.tris('flat', pos, nor, null, color('#e9ecec'));
  for (const a of [-1.3, -0.8, -0.3]) W.cyl('flat', cx + Math.cos(a) * (r - 1.2), 0, cz + Math.sin(a) * (r - 1.2) * 0.55, 0.22, 0.22, 4.4, 10, color('#dfe2e2'));
}
