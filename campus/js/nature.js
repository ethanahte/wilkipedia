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

// Young street/quad tree (ornamental pear-ish): thin trunk, upright oval canopy, a stake.
export function youngTree(W, x, z, R, { h = 4.4, stake = true, y = 0 } = {}) {
  const trunkH = h * 0.38;
  W.cyl('flat', x, y, z, 0.09, 0.07, trunkH + 0.4, 6, G.bark);
  if (stake) W.beam('flat', x + 0.28, z, x + 0.3, z + 0.05, y, y + 1.7, 0.06, G.stake);
  const cy = y + trunkH + (h - trunkH) * 0.5, ch = (h - trunkH) * 0.55;
  const n = 4 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = 0.35 + R() * 0.3;
    const s = 0.75 + R() * 0.35;
    W.blob('flat', x + Math.cos(a) * d, cy + (R() - 0.35) * ch * 0.9, z + Math.sin(a) * d, s, s * 1.15, s, pick(G.leaf, R));
  }
  W.blob('flat', x, cy + ch * 0.55, z, 0.7, 0.9, 0.7, pick(G.leaf, R));
}

// A full-grown shade tree: fat trunk, big lumpy crown.
export function shadeTree(W, x, z, R, { h = 9, y = 0, cols = G.dark, detail = 1 } = {}) {
  const trunkH = h * 0.36;
  W.cyl('flat', x, y, z, 0.32, 0.22, trunkH + 0.8, 7, G.barkDark);
  const cr = h * 0.33, cy = y + trunkH + cr * 0.9;
  const n = 5 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.6, d = cr * (0.35 + R() * 0.35);
    const s = cr * (0.55 + R() * 0.3);
    W.blob('flat', x + Math.cos(a) * d, cy + (R() - 0.4) * cr * 0.7, z + Math.sin(a) * d, s, s * 0.85, s, pick(cols, R), detail);
  }
  W.blob('flat', x, cy + cr * 0.5, z, cr * 0.7, cr * 0.6, cr * 0.7, pick(cols, R), detail);
}

// Tall conifer (the pines and redwoods along the edges of campus).
export function conifer(W, x, z, R, { h = 16, y = 0 } = {}) {
  W.cyl('flat', x, y, z, 0.35, 0.15, h * 0.9, 6, G.barkDark);
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, r = (1 - t) * h * 0.22 + 0.6, yy = y + h * 0.22 + t * h * 0.72;
    W.cyl('flat', x, yy, z, r, r * 0.25, h * 0.26, 9, pick(G.dark, R), { bottom: true });
  }
}

export function crapeMyrtle(W, x, z, R, { h = 4, y = 0 } = {}) {
  for (let i = 0; i < 3; i++) W.beam('flat', x, z, x + (R() - 0.5) * 0.7, z + (R() - 0.5) * 0.7, y, y + h * 0.5, 0.08, G.bark);
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2, d = R() * 0.6, s = 0.55 + R() * 0.3;
    W.blob('flat', x + Math.cos(a) * d, y + h * 0.62 + R() * h * 0.3, z + Math.sin(a) * d, s, s * 0.8, s, i % 3 === 2 ? pick(G.leaf, R) : pick(G.pink, R));
  }
}

export function shrub(W, x, z, R, { s = 0.8, y = 0, cols = G.dark } = {}) {
  const n = 2 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) W.blob('flat', x + (R() - 0.5) * s, y + s * 0.45, z + (R() - 0.5) * s, s * (0.6 + R() * 0.3), s * 0.55, s * (0.6 + R() * 0.3), pick(cols, R));
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
export function cedar(W, x, z, R) {
  const H = 21.5;
  W.cyl('flat', x, 0, z, 0.8, 0.3, H - 2.5, 10, G.barkDark);
  W.cyl('flat', x, 0, z, 1.1, 0.8, 0.8, 10, G.barkDark);
  // a few bare limbs reaching out under the lowest shelf
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2, y = 2.6 + R() * 1.2, L = 3 + R() * 2;
    W.rod('flat', [x, y, z], [x + Math.cos(a) * L, y + 0.9, z + Math.sin(a) * L], 0.22, G.barkDark);
  }
  const tiers = 9;
  for (let t = 0; t < tiers; t++) {
    const k = t / tiers;
    const y = 3.4 + t * 1.85 + (R() - 0.5) * 0.5;
    const Rt = (8.4 * Math.pow(1 - k, 0.85) + 0.9) * (0.85 + R() * 0.3);
    const n = Math.max(3, Math.round(Rt * 0.95 + R() * 2));
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const d = Rt * (0.35 + R() * 0.35);
      // one shelf = a broad upper pad and a smaller, lower, further-out droop
      for (const [out, down, sc] of [[0, 0, 1], [0.55, 0.75, 0.62]]) {
        const dd = d + Rt * out * 0.5;
        const m = new THREE.Matrix4().makeTranslation(x + Math.cos(a) * dd, y - down - R() * 0.4, z + Math.sin(a) * dd)
          .multiply(new THREE.Matrix4().makeRotationY(-a + (R() - 0.5) * 0.5))
          .multiply(new THREE.Matrix4().makeRotationZ(-0.22 - R() * 0.2));
        const col = G.cedar[Math.floor(R() * G.cedar.length)];
        W.withM(m, () => W.blob('flat', 0, 0, 0, Rt * 0.42 * sc + 0.5, (0.7 + R() * 0.5) * sc, (Rt * 0.3 + 0.5) * sc, col));
      }
    }
    if (t > 2) W.blob('flat', x + (R() - 0.5), y, z + (R() - 0.5), Rt * 0.38, 1.1, Rt * 0.38, G.cedar[Math.floor(R() * 5)]);
  }
  // the leader nods over at the top, as deodars do
  W.blob('flat', x + 0.3, H - 1.6, z, 0.9, 1.5, 0.9, G.cedar[2]);
  W.blob('flat', x + 0.9, H - 0.4, z + 0.2, 0.45, 0.8, 0.45, G.cedar[4]);
}
