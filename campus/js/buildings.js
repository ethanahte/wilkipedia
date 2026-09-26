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

function doorAt(W, e, t, w, h, col, { glass = false, frameCol = C.frame } = {}) {
  onWall(W, e, t, h / 2, 0.02, () => {
    W.box('flat', 0, 0, 0, w + 0.2, h + 0.1, 0.1, frameCol);
    if (glass) {
      W.quad('glass', [-w / 2, -h / 2, 0.06], [w / 2, -h / 2, 0.06], [w / 2, h / 2, 0.06], [-w / 2, h / 2, 0.06], C.glassTint, [[0, 0], [w, 0], [w, h], [0, h]]);
      W.box('flat', 0, 0, 0.08, 0.08, h, 0.04, frameCol);
      W.box('flat', 0, -h / 2 + 1.0, 0.1, w, 0.05, 0.04, color('#c9ccd0'));   // push bar
    } else {
      W.box('flat', 0, 0, 0.05, w, h, 0.04, col);
      // narrow vertical window, as on every American hallway door
      W.quad('glass', [w * 0.12, 0.1, 0.075], [w * 0.28, 0.1, 0.075], [w * 0.28, h * 0.42, 0.075], [w * 0.12, h * 0.42, 0.075], DARK, 'auto');
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
  r(W, b, e) { rFace(W, b, e); },
  caf(W, b, e, R) {
    if (e.len < 4) return;
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
// Its faces are laid out from Ethan's photos, face by face, rather than by a
// repeating rhythm. t runs along a face as edges() gives it: the west face from
// its north end, the east face from its south end, the south face from its west
// end and the north face from its east end.
const RC = {
  reveal: color('#d2c6ab'), tower: color('#a4a8aa'), towerLine: color('#8e9294'), panel: color('#eef0eb'),
  grid: color('#7c8186'), teal: color('#a9dcd6'), canopy: color('#8a8f94'), sconce: color('#6f7378'), cap: color('#ece0c4'),
};
const R_FLOORS = [0, 4.4, 8.8];

// The precast's reveals: a groove every 1.2 m up and every 2.7 m along.
function reveals(W, e, t0, t1, top, off = 0) {
  if (t1 - t0 < 0.3) return;
  onWall(W, e, (t0 + t1) / 2, 0, off + 0.012, () => {
    for (let y = 1.2; y < top - 0.3; y += 1.2) W.box('flat', 0, y, 0, t1 - t0, 0.035, 0.02, RC.reveal);
  });
  for (let t = t0 + 2.7; t < t1 - 0.4; t += 2.7) onWall(W, e, t, top / 2, off + 0.012, () => W.box('flat', 0, 0, 0, 0.035, top, 0.02, RC.reveal));
}
const sconce = (W, e, t, y) => onWall(W, e, t, y, 0.02, () => W.cyl('flat', 0, 0, 0.1, 0, 0.2, 0.26, 3, RC.sconce));

// A grey concrete tower standing out from the wall, full height but for a cream
// cap, with louvers on the chosen floors.
function rTower(W, e, t0, t1, h, louvers, out = 0.35) {
  const w = t1 - t0, top = h - 0.7;
  onWall(W, e, (t0 + t1) / 2, 0, out / 2, () => {
    W.box('stucco', 0, top / 2, 0, w, top, out + 0.02, RC.tower);
    W.box('stucco', 0, top + 0.4, 0, w, 0.8, out + 0.02, RC.cap);
    for (const y of [2.2, 6.6, 11]) W.box('flat', 0, y, out / 2 + 0.012, w, 0.035, 0.02, RC.towerLine);
  });
  for (const f of louvers) {
    onWall(W, e, (t0 + t1) / 2, R_FLOORS[f] + 2.2, out + 0.02, () => {
      W.box('flat', 0, 0, 0, w - 0.4, 2.5, 0.06, RC.towerLine);
      W.box('louver', 0, 0, 0.04, w - 0.6, 2.3, 0.03, color('#b7bbbe'));
    });
  }
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
      // the teal row, and the side strip
      const gx0 = -w / 2 + 0.25, gx1 = w / 2 - 0.95;
      W.quad('glass', [gx0, y1 - 0.62, 0.03], [gx1, y1 - 0.62, 0.03], [gx1, y1 - 0.08, 0.03], [gx0, y1 - 0.08, 0.03], RC.teal, 'auto');
      W.quad('glass', [w / 2 - 0.8, y0 + 0.08, 0.03], [w / 2 - 0.25, y0 + 0.08, 0.03], [w / 2 - 0.25, y1 - 0.08, 0.03], [w / 2 - 0.8, y1 - 0.08, 0.03], pane(), 'auto');
      for (const y of [y0, (y0 + y1 - 0.62) / 2, y1 - 0.62, y1]) W.box('flat', 0, y, 0.04, w - 0.3, 0.05, 0.03, RC.grid);
      for (let x = gx0; x <= gx1 + 0.01; x += (gx1 - gx0) / Math.max(1, Math.round((gx1 - gx0) / 1.25))) W.box('flat', x, (y0 + y1) / 2, 0.04, 0.05, y1 - y0, 0.03, RC.grid);
      for (const x of [w / 2 - 0.82, w / 2 - 0.23]) W.box('flat', x, (y0 + y1) / 2, 0.04, 0.05, y1 - y0, 0.03, RC.grid);
    });
  });
  if (storefront) {
    // the ASB Office's glass front under its awning (landmarks.js draws the awning)
    onWall(W, e, mid, 1.45, 0.03, () => {
      W.box('flat', 0, 0, 0, w - 0.3, 2.8, 0.08, RC.grid);
      W.quad('glass', [-w / 2 + 0.3, -1.3, 0.05], [w / 2 - 0.3, -1.3, 0.05], [w / 2 - 0.3, 1.3, 0.05], [-w / 2 + 0.3, 1.3, 0.05], LIT, 'auto');
      for (let x = -w / 2 + 0.3; x <= w / 2 - 0.29; x += (w - 0.6) / 7) W.box('flat', x, 0, 0.07, 0.06, 2.6, 0.03, RC.grid);
      W.box('flat', 0, 0.55, 0.07, w - 0.6, 0.05, 0.03, RC.grid);
    });
  }
}

// A plain cream stretch: its reveals, and narrow windows up it if asked.
function rPier(W, e, t0, t1, h, { narrow = null } = {}) {
  reveals(W, e, t0, t1, h - 0.6);
  if (narrow != null) for (const f of R_FLOORS) windowAt(W, e, narrow, f + 2.2, 0.62, 2.5, { frame: RC.grid });
}

// A recessed entrance: grey canopy, double glass doors and transom, and a big
// gridded window on each floor above (IMG_2345, IMG_2357).
function rEntrance(W, e, h) {
  const mid = e.len / 2;
  onWall(W, e, mid, 0, 0, () => {
    W.box('flat', 0, 3.3, 1.3, e.len + 1.2, 0.26, 2.6, RC.canopy);
    W.box('flat', 0, 3.17, 1.3, e.len + 1.0, 0.02, 2.4, color('#5b5f63'));
  });
  doorAt(W, e, mid, 1.9, 2.4, null, { glass: true, frameCol: RC.grid });
  windowAt(W, e, mid, 2.75, 2.1, 0.5, { frame: RC.grid });
  for (const f of [4.4, 8.8]) windowAt(W, e, mid, f + 2.2, e.len - 0.9, 2.7, { frame: RC.grid });
}

// The two ends: a plain wing with small square windows, a door and a fountain,
// the entrance bay, and a wing with tall narrow windows (IMG_2344, IMG_2346, IMG_2354).
function rEnd(W, e, h, north) {
  const len = e.len;
  if (len < 5) { rEntrance(W, e, h); return; }      // the recessed bay itself
  // which wing is this? the one that touches the west face has the door and the small windows
  const westWing = north ? e.bx < 40 : e.ax < 40;
  reveals(W, e, 0.2, len - 0.2, h - 0.6);
  if (westWing) {
    const tw = north ? len - 3.2 : 3.2;             // near the building's west corner
    for (const f of [4.4, 8.8]) windowAt(W, e, north ? len - 5.2 : 5.2, f + 2.4, 0.75, 0.7, { frame: RC.grid });
    doorAt(W, e, north ? len - 5.2 : 5.2, 0.95, 2.3, null, { glass: true, frameCol: RC.grid });
    windowAt(W, e, north ? len - 5.2 : 5.2, 2.75, 0.8, 0.45, { frame: RC.grid });
    onWall(W, e, north ? len - 6.3 : 6.3, 0.6, 0.12, () => W.box('flat', 0, 0, 0, 0.45, 0.35, 0.25, color('#9ea3a8')));   // drinking fountain
    doorAt(W, e, north ? len - 7.6 : 7.6, 0.9, 2.2, color('#e8dcc2'), { frameCol: color('#d9ccb0') });
    for (const t of [tw, north ? len - 7.0 : 7.0]) sconce(W, e, t, 3.1);
  } else {
    const tn = north ? 3.8 : len - 3.8;
    for (const f of R_FLOORS) windowAt(W, e, tn, f + 2.3, 0.7, 2.6, { frame: RC.grid });
    if (north) {
      // the big cream louver panel beside the north entrance (IMG_2357)
      onWall(W, e, len - 1.9, 2.0, 0.03, () => { W.box('flat', 0, 0, 0, 2.3, 3.2, 0.1, RC.cap); W.box('louver', 0, 0, 0.06, 2.0, 2.9, 0.03, color('#f2ead8')); });
    }
    sconce(W, e, north ? len - 3.4 : 3.4, 3.1);
  }
}

function rFace(W, b, e) {
  const h = b.h;
  if (e.len < 1.5) return;                         // the entrance bays' short sides
  if (e.nz > 0.5) return rEnd(W, e, h, false);
  if (e.nz < -0.5) return rEnd(W, e, h, true);
  if (e.nx < -0.5) {
    // the quad side, north to south: pier, bay, tower, bay, tower, the ASB Office's
    // bay, tower, bay, tower, bay, tower, pier (IMG_2342, IMG_2350–2352)
    const z0 = e.az, T = (z) => z - z0;
    const TOWERS = [[-14.0, -11.8, [0, 2]], [-5.0, -2.8, [0, 2]], [6.4, 8.6, [0, 2]], [13.2, 15.4, [2]], [20.6, 22.8, [0, 2]]];
    const BAYS = [[-20.5, -14.0], [-11.8, -5.0], [-2.8, 6.4, true], [8.6, 13.2], [15.4, 20.6]];
    rPier(W, e, T(-22.9), T(-20.5), h, { narrow: T(-21.7) });
    rPier(W, e, T(22.8), T(25.2), h, { narrow: T(24.0) });
    for (const [a, c, lv] of TOWERS) rTower(W, e, T(a), T(c), h, lv);
    for (const [a, c, sf] of BAYS) rBay(W, e, T(a), T(c), { storefront: !!sf });
    return;
  }
  // the pool side: a sawtooth of grey towers with cream caps, the cream wall
  // between with a few doors and lights (IMG_2356, IMG_2359–2361)
  reveals(W, e, 0.2, e.len - 0.2, h - 0.6);
  for (let t = 3.5, k = 0; t < e.len - 2; t += 7, k++) {
    rTower(W, e, t - 0.9, t + 0.9, h, [], 0.9);
    if (k % 2 === 0) sconce(W, e, t + 2.6, 3.1);
    if (k % 3 === 1) doorAt(W, e, t + 3.5, 0.95, 2.3, color('#e8dcc2'), { frameCol: color('#d9ccb0') });
  }
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
    // single-storey wings get a flat overhang on the long sides (covered walks)
    if (b.style === 'p') overhangs(W, b, 3.7);
    // R's covered walkway down its pool side: a flat roof on slim steel posts (IMG_2359, IMG_2360)
    if (b.style === 'r') {
      const x0 = Math.max(...b.poly.map((p) => p[0])), zs = b.poly.map((p) => p[1]), z0 = Math.min(...zs), z1 = Math.max(...zs);
      W.slab('flat', x0, z0, x0 + 3.0, z1, 3.2, 3.45, color('#cfd0cc'));
      for (let z = z0 + 1; z <= z1 - 0.5; z += 4) W.cyl('flat', x0 + 2.75, 0, z, 0.08, 0.08, 3.2, 8, RC.canopy);
    }
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
