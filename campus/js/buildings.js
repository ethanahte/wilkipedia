// Buildings: every footprint in layout.js becomes stucco walls, a gravel roof
// with a parapet and rooftop units, and a facade "kit" picked by its style.
// The kits come from the photos:
//   b      Building B: tan pilasters, light recessed panels, grey-framed window
//          bands on both floors, tall louvre panels, a grey steel entry canopy
//   r      Building R: three floors of tall dark window bands, light fins at every
//          floor line, pilasters, solar panels on the roof
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

// A window: dark frame box and a glass pane just in front of it. (x,y) = centre.
function windowAt(W, e, t, y, w, h, { frame = C.frame, depth = 0.12 } = {}) {
  onWall(W, e, t, y, 0.03, () => {
    W.box('flat', 0, 0, 0, w + 0.16, h + 0.16, depth, frame);
    W.quad('glass', [-w / 2, -h / 2, depth / 2 + 0.01], [w / 2, -h / 2, depth / 2 + 0.01], [w / 2, h / 2, depth / 2 + 0.01], [-w / 2, h / 2, depth / 2 + 0.01], C.glassTint,
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
      W.quad('glass', [w * 0.12, 0.1, 0.075], [w * 0.28, 0.1, 0.075], [w * 0.28, h * 0.42, 0.075], [w * 0.12, h * 0.42, 0.075], C.glassTint, 'auto');
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

function parapet(W, poly, h, col, t = 0.32, rise = 0.55) {
  for (const e of edges(poly)) {
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
  r(W, b, e, R) {
    const h = b.h;
    if (e.len < 4) return;
    for (const { i, t } of bays(e.len, 3.6, 1.2)) {
      if (i % 3 === 0) {
        onWall(W, e, t - 1.8, 0, 0.25, () => W.box('stucco', 0, (h + 0.8) / 2, 0, 1.5, h + 0.8, 0.5, C.tan));
        continue;
      }
      if (i % 5 === 4) { louverAt(W, e, t, h / 2, 1.1, h - 2.4); continue; }
      // a tall band of windows running up through all three floors
      for (const f of [0, 4.4, 8.8]) windowAt(W, e, t, f + 2.1, 2.5, 2.3);
    }
    // light fins at every floor line
    for (const y of [4.3, 8.7]) onWall(W, e, e.len / 2, y, 0.2, () => W.box('flat', 0, 0, 0, e.len - 0.4, 0.14, 0.4, C.fin));
  },
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

export function buildBuildings(W) {
  const R = rng(42);
  for (const b of BUILDINGS) {
    const wall = WALL[b.style] || C.cream;
    const roofY = b.h - 0.5;
    if (b.style === 'theatre-lobby') { lobbyGlass(W, b); continue; }
    W.prism('stucco', b.poly, 0, roofY, wall, { top: true, topMat: 'roof', topCol: C.roof });
    parapet(W, b.poly, b.h, wall);
    if (b.gable) gable(W, b, roofY);
    else if (b.barrel) barrels(W, b, roofY);
    else if (b.style !== 'r') rooftop(W, b, R, roofY);
    const kit = KITS[b.style] || KITS.plain;
    for (const e of edges(b.poly)) kit(W, b, e, R);
    // single-storey wings get a flat overhang on the long sides (covered walks)
    if (b.style === 'p') overhangs(W, b, 3.7);
  }
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
    W.quad('glass', [x - 0.9 * d, y - 0.3, z], [x + 0.9 * d, y - 0.3, z], [x + 0.9 * d, y + 0.3, z], [x - 0.9 * d, y + 0.3, z], C.glassTint, 'auto');
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
      onWall(W, e, t, (h - 0.6) / 2, -0.15, () => W.quad('glass', [-1.15, -(h - 0.6) / 2, 0], [1.15, -(h - 0.6) / 2, 0], [1.15, (h - 0.6) / 2, 0], [-1.15, (h - 0.6) / 2, 0], C.lobbyGlass,
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
