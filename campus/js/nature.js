// Plants, drawn as an illustrator would: canopies are clusters of rounded
// blobs, not leaves. The big deodar cedar is the one exception in silhouette
// (tall, tiered, drooping) and is built tier by tier.

import * as THREE from 'three';
import { color } from './geo.js';

export const G = {
  leaf: ['#5f9c43', '#6fae4c', '#4f8a3a', '#7bb853'].map(color),
  dark: ['#3f6f37', '#4a7d3d', '#355f31'].map(color),
  cedar: ['#3b6557', '#467363', '#528070', '#33594c', '#5b8a76'].map(color),
  bark: color('#6a5140'), barkDark: color('#4f3d31'), stake: color('#b8915f'),
  palm: ['#6c8f45', '#7d9f4f', '#5a7d3b'].map(color), palmTrunk: color('#8d7c68'), skirt: color('#8c6d4d'),
  flax: ['#6b2f3a', '#552634', '#7a3a43', '#5f7f3c', '#8a8f4c'].map(color),
  grass: ['#b9a86b', '#a39a5c', '#8fa05a', '#c7b981'].map(color),
  pink: ['#e38aae', '#d9739c', '#eea3c0'].map(color),
};
const pick = (arr, R) => arr[Math.floor(R() * arr.length) % arr.length];

// ── leaf cards ──
// Foliage is built like a background painter's trees: a solid, darker core for
// the mass, wrapped in many small cards painted with a clump of outlined leaves.
// Each card's normals point away from the canopy's centre, so the whole crown
// shades as one soft volume and only its ragged outline gets ink.
const UV = [[0, 1 / 3], [1 / 3, 2 / 3]];      // atlas columns: broad leaves, needles
export const SOLID_UV = [0.844, 0.5];
const _t = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function cards(W, cx, cy, cz, rx, ry, rz, col, R, n, size, { variant = 0, droop = 0, shade = 0.22 } = {}) {
  const [u0, u1] = UV[variant];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
    const dx = sq * Math.cos(th), dy = u, dz = sq * Math.sin(th);
    const k = 0.62 + 0.42 * Math.sqrt(R());
    const px = cx + dx * rx * k, py = cy + dy * ry * k - droop * (1 - dy) * 0.5, pz = cz + dz * rz * k;
    // face mostly outward, with some scatter; needles hang down
    _n.set(dx + (R() - 0.5) * 0.9, dy * 0.6 + (R() - 0.5) * 0.6, dz + (R() - 0.5) * 0.9).normalize();
    _t.crossVectors(Math.abs(_n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : _up, _n).normalize();
    _b.crossVectors(_n, _t).normalize();
    if (variant === 1) { _b.set(0, 1, 0); _t.crossVectors(_b, _n).normalize(); }
    else { const a = R() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); const tx = _t.clone(); _t.multiplyScalar(ca).addScaledVector(_b, sa); _b.multiplyScalar(ca).addScaledVector(tx, -sa); }
    const h = (size * (0.75 + R() * 0.5)) / 2;
    const corner = (a, b) => [px + (_t.x * a + _b.x * b) * h, py + (_t.y * a + _b.y * b) * h, pz + (_t.z * a + _b.z * b) * h];
    const A = corner(-1, -1), B = corner(1, -1), C = corner(1, 1), D = corner(-1, 1);
    const nrm = (v) => { const x = (v[0] - cx) / rx, y = (v[1] - cy) / ry, z = (v[2] - cz) / rz, l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
    c.copy(col).multiplyScalar((0.9 + R() * 0.2) * (1 - shade + shade * (dy * 0.5 + 0.5)));
    W.tris('foliage', [A, B, C, A, C, D], [nrm(A), nrm(B), nrm(C), nrm(A), nrm(C), nrm(D)],
      [[u0, 0], [u1, 0], [u1, 1], [u0, 0], [u1, 1], [u0, 1]], c);
  }
}
const darker = (col, k = 0.72) => col.clone().multiplyScalar(k);

// Young street/quad tree (the ornamental pears): thin trunk, upright oval crown, a stake.
export function youngTree(W, x, z, R, { h = 4.4, stake = true, y = 0, cols = G.leaf } = {}) {
  const trunkH = h * 0.4;
  W.cyl('flat', x, y, z, 0.09, 0.07, trunkH + 0.6, 6, G.bark);
  if (stake) W.beam('flat', x + 0.28, z, x + 0.3, z + 0.05, y, y + 1.7, 0.06, G.stake);
  const cy = y + trunkH + (h - trunkH) * 0.5, rx = 0.95, ry = (h - trunkH) * 0.55;
  const col = pick(cols, R);
  W.blob('flat', x, cy, z, rx * 0.62, ry * 0.66, rx * 0.62, darker(col, 0.62));
  cards(W, x, cy, z, rx, ry, rx, col, R, 80, 1.3);
}

// A full-grown shade tree: fat trunk, limbs, and a crown of two or three lobes.
export function shadeTree(W, x, z, R, { h = 9, y = 0, cols = G.dark } = {}) {
  const trunkH = h * 0.38;
  W.cyl('flat', x, y, z, 0.34, 0.22, trunkH + 1.2, 7, G.barkDark);
  const cr = h * 0.3, cy = y + trunkH + cr;
  const col = pick(cols, R);
  const lobes = 2 + Math.floor(R() * 2);
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + R(), d = cr * 0.45;
    const lx = x + Math.cos(a) * d, lz = z + Math.sin(a) * d, ly = cy + (R() - 0.3) * cr * 0.5, s = cr * (0.85 + R() * 0.25);
    W.rod('flat', [x, y + trunkH, z], [lx, ly - s * 0.3, lz], 0.16, G.barkDark);
    W.blob('flat', lx, ly, lz, s * 0.66, s * 0.56, s * 0.66, darker(col, 0.6));
    cards(W, lx, ly, lz, s, s * 0.85, s, col, R, Math.round(52 * s), 2.1 + s * 0.15);
  }
  W.blob('flat', x, cy + cr * 0.45, z, cr * 0.58, cr * 0.46, cr * 0.58, darker(col, 0.6));
  cards(W, x, cy + cr * 0.45, z, cr * 0.9, cr * 0.7, cr * 0.9, col, R, Math.round(40 * cr), 2.1);
}

// Tall conifer (the pines and redwoods along the edges of campus): tiers of needle sprays.
export function conifer(W, x, z, R, { h = 16, y = 0 } = {}) {
  W.cyl('flat', x, y, z, 0.35, 0.15, h * 0.92, 6, G.barkDark);
  const tiers = 6, col = pick(G.dark, R);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, r = (1 - t) * h * 0.2 + 0.7, yy = y + h * 0.2 + t * h * 0.74;
    W.cyl('flat', x, yy, z, r * 0.8, r * 0.2, h * 0.2, 8, darker(col, 0.75), { bottom: true });
    cards(W, x, yy + h * 0.07, z, r, h * 0.09, r, col, R, Math.round(18 + r * 9), 1.7, { variant: 1, droop: 0.5 });
  }
}

export function crapeMyrtle(W, x, z, R, { h = 4, y = 0 } = {}) {
  for (let i = 0; i < 3; i++) W.beam('flat', x, z, x + (R() - 0.5) * 0.7, z + (R() - 0.5) * 0.7, y, y + h * 0.55, 0.08, G.bark);
  const cy = y + h * 0.72, pink = pick(G.pink, R);
  W.blob('flat', x, cy, z, 0.85, 0.6, 0.85, darker(G.leaf[2], 0.62));
  cards(W, x, cy, z, 1.3, 0.95, 1.3, G.leaf[0], R, 22, 1.1);
  cards(W, x, cy + 0.15, z, 1.35, 1.0, 1.35, pink, R, 60, 1.15);
}

export function shrub(W, x, z, R, { s = 0.8, y = 0, cols = G.dark } = {}) {
  const col = pick(cols, R);
  W.blob('flat', x, y + s * 0.38, z, s * 0.5, s * 0.34, s * 0.5, darker(col, 0.55));
  cards(W, x, y + s * 0.45, z, s, s * 0.6, s, col, R, 40, 0.9);
}

// One arching blade: flax, grasses, palm leaflets.
export function blade(W, x, y, z, ang, lean, len, width, col, curve = 0.8, seg = 3) {
  const ux = Math.cos(ang), uz = Math.sin(ang), px = -uz, pz = ux;
  let prev = null;
  for (let i = 0; i <= seg; i++) {
    const s = i / seg, a = lean + curve * s * s;
    // integrate a curved path: position along the blade
    const r = len * s, py = y + Math.cos(a) * r * (1 - 0.25 * s), out = Math.sin(a) * r;
    const cx = x + ux * out, cz = z + uz * out, w = width * (1 - s * 0.85);
    const L = [cx - px * w / 2, py, cz - pz * w / 2], Rr = [cx + px * w / 2, py, cz + pz * w / 2];
    if (prev) W.quad('leaf', prev[0], prev[1], Rr, L, col);
    prev = [L, Rr];
  }
}

export function flax(W, x, z, R, { y = 0, h = 1.5 } = {}) {
  const col = pick(G.flax, R);
  const n = 9 + Math.floor(R() * 6);
  for (let i = 0; i < n; i++) {
    blade(W, x + (R() - 0.5) * 0.2, y, z + (R() - 0.5) * 0.2, R() * Math.PI * 2, 0.15 + R() * 0.35, h * (0.7 + R() * 0.5), 0.11, R() < 0.8 ? col : pick(G.flax, R), 0.9);
  }
}

export function grassTuft(W, x, z, R, { y = 0, h = 0.8, cols = G.grass } = {}) {
  const col = pick(cols, R);
  for (let i = 0; i < 7; i++) blade(W, x, y, z, R() * Math.PI * 2, 0.1 + R() * 0.35, h * (0.6 + R() * 0.5), 0.07, col, 0.6, 2);
}

// Mexican fan palm: tall slim trunk, a brown skirt of dead fronds, a round head of fans.
export function palm(W, x, z, R, { h = 15, y = 0 } = {}) {
  const lean = (R() - 0.5) * 0.5;
  const tx = x + Math.sin(lean) * 0.6, tz = z + Math.cos(lean) * 0.6;
  W.cyl('flat', x, y, z, 0.32, 0.22, h - 1.4, 8, G.palmTrunk);
  W.cyl('flat', x, y + h - 2.6, z, 0.3, 0.55, 1.6, 8, G.skirt);
  const cy = y + h;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + R() * 0.3;
    const up = -0.5 + R() * 1.3;               // elevation: some fronds droop, some stand up
    const m = new THREE.Matrix4().makeTranslation(x, cy - 0.6, z)
      .multiply(new THREE.Matrix4().makeRotationY(-a))
      .multiply(new THREE.Matrix4().makeRotationZ(up))
      .multiply(new THREE.Matrix4().makeTranslation(1.25, 0, 0));
    W.withM(m, () => {
      W.box('flat', -0.7, 0, 0, 1.3, 0.06, 0.06, G.palmTrunk);          // petiole
      W.blob('leaf', 0.35, 0, 0, 0.95, 0.07, 0.8, pick(G.palm, R), 1); // the fan
    });
  }
  W.blob('flat', x, cy - 0.5, z, 0.7, 0.6, 0.7, G.palm[2]);
}

// The deodar cedar in the middle of the quad: about 21 m tall and nearly as
// wide at the bottom, with a clear trunk to ~3 m, and broad, uneven, drooping
// shelves of blue-green foliage that thin out toward a nodding tip.
// The quad's big cedar (Ethan's photos IMG_2332–2337): a short, thick trunk that
// forks about 3 m up into three leaning leaders, and a broad, irregular crown of
// flat, layered sprays held high enough for picnic tables to sit underneath:
// about 15 m across (the satellite) and 17 m tall.
export function cedar(W, x, z, R) {
  const FORK = 3.1, TOP = 17;
  W.cyl('flat', x, 0, z, 0.95, 0.62, 0.6, 12, G.barkDark);                  // root flare
  W.cyl('flat', x, 0.5, z, 0.62, 0.52, FORK - 0.4, 12, G.barkDark);
  const a0 = R() * Math.PI * 2, leaders = [];
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i * Math.PI * 2) / 3 + (R() - 0.5) * 0.5, lean = 0.22 + R() * 0.18, L = 10 + R() * 3;
    const mid = [x + Math.cos(a) * Math.sin(lean) * L * 0.45, FORK + Math.cos(lean) * L * 0.45, z + Math.sin(a) * Math.sin(lean) * L * 0.45];
    const tip = [x + Math.cos(a) * Math.sin(lean) * L * 0.8, FORK + Math.cos(lean) * L, z + Math.sin(a) * Math.sin(lean) * L * 0.8];
    W.rod('flat', [x, FORK - 0.3, z], mid, 0.36, G.barkDark);
    W.rod('flat', mid, tip, 0.2, G.barkDark);
    leaders.push({ a, mid, tip });
  }
  // the crown's outline: widest in its lowest tiers, tapering to a rounded top
  const span = (y) => 8.2 * Math.pow(Math.max(0, 1 - (y - 4) / (TOP - 3.4)), 0.72) + 0.7;
  const SPRAY = [...G.cedar, color('#7d9660'), color('#6b8a57'), color('#86a063')];
  W.blob('flat', x, 12.5, z, 2.2, 1.6, 2.2, darker(G.cedar[3], 0.62));        // a small dark heart up top
  // flat, layered tiers with sky between them; the outer sprays droop at their tips
  const TIERS = [4.3, 5.9, 7.5, 9.1, 10.8, 12.6, 14.4, 16.0];
  TIERS.forEach((ty, t) => {
    const sp = span(ty), n = Math.max(3, Math.round(sp * 1.35)), off = R() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = off + ((i + (R() - 0.5) * 0.6) * Math.PI * 2) / n;
      const d = sp * (0.55 + R() * 0.4), y = ty + (R() - 0.5) * 0.7;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, sc = (0.8 + R() * 0.4) * (t < 5 ? 1 : 0.8);
      const col = SPRAY[Math.floor(R() * SPRAY.length)];
      const m = new THREE.Matrix4().makeTranslation(px, y, pz)
        .multiply(new THREE.Matrix4().makeRotationY(-a + (R() - 0.5) * 0.6))
        .multiply(new THREE.Matrix4().makeRotationZ(-0.15 - R() * 0.15));
      W.withM(m, () => {
        W.blob('flat', 0, 0, 0, 1.3 * sc, 0.32 * sc, 1.0 * sc, darker(col, 0.66));
        cards(W, 0, 0.08, 0, 2.2 * sc, 0.55 * sc, 1.6 * sc, col, R, Math.round(24 * sc), 1.8, { variant: 1, droop: 0.7 });
      });
      // every spray hangs off a limb from the nearest leader
      const L = leaders.reduce((b, l) => (Math.cos(l.a - a) > Math.cos(b.a - a) ? l : b));
      const tt = Math.min(1, Math.max(0, (y - FORK) / (L.tip[1] - FORK)));
      const from = tt < 0.45 ? [x + (L.mid[0] - x) * tt / 0.45, FORK + (L.mid[1] - FORK) * tt / 0.45, z + (L.mid[2] - z) * tt / 0.45]
        : [L.mid[0] + (L.tip[0] - L.mid[0]) * (tt - 0.45) / 0.55, L.mid[1] + (L.tip[1] - L.mid[1]) * (tt - 0.45) / 0.55, L.mid[2] + (L.tip[2] - L.mid[2]) * (tt - 0.45) / 0.55];
      W.rod('flat', from, [px - Math.cos(a) * 0.9, y - 0.1, pz - Math.sin(a) * 0.9], Math.max(0.06, 0.16 - t * 0.012), G.barkDark);
    }
  });

}
