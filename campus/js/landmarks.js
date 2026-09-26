// One-off pieces that make the campus recognisable, each from a photo:
//   the front sign wall with its concrete planter, flax, fan palms and flags;
//   the grey steel canopy from Building B to the cafeteria; the cafeteria's
//   covered walkway; the Career Center's yellow awning; the ASB Office awning;
//   Building R's solar roof; the solar carports; the art poles along B;
//   "WILCOX" on the main gym and the "WILCOX CHARGERS" entrance with its mosaic.
// Lettering is drawn on canvases at load, so it stays sharp up close.

import * as THREE from 'three';
import { color, rng } from './geo.js';
import { canvasTex, decalMat } from './toon.js';
import { FRONT, CARPORTS, BUILDINGS } from './layout.js';
import { wallEdges } from './buildings.js';
import { LIGHTS } from './lights.js';
import { palm, flax, grassTuft, shrub, G } from './nature.js';

const concrete = color('#cfcbc3'), soil = color('#5b4636'), steel = color('#6f747a'), fin = color('#f4efe4');

// A lettering plane. Returns the mesh so main.js can add it to the scene.
function decal(tex, x, y, z, w, h, rotY = 0, lit = true) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMat(tex, { lit }));
  m.position.set(x, y, z); m.rotation.y = rotY;
  m.receiveShadow = true;
  return m;
}

function textCanvas(w, h, draw) { return canvasTex(w, h, draw, { mips: true }); }

export function buildLandmarks(W, group, fontFamily) {
  const R = rng(9);
  const serif = `"${fontFamily}", Georgia, "Times New Roman", serif`;

  // ── the front of the school ──
  const z = FRONT.wallZ;
  const s = FRONT.sign;
  const signTex = textCanvas(2048, 400, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#141414';
    g.textBaseline = 'alphabetic';
    g.font = `600 150px ${serif}`;
    const big = 'ADRIAN WILCOX';
    const bw = g.measureText(big).width;
    g.font = `600 88px ${serif}`;
    const small = 'HIGH SCHOOL', sw = g.measureText(small).width;
    const total = bw + 50 + sw, x0 = (w - total) / 2;
    g.font = `600 150px ${serif}`; g.fillText(big, x0, 200);
    g.font = `600 88px ${serif}`; g.fillText(small, x0 + bw + 50, 200);
    g.fillStyle = '#9a968e';
    g.font = `500 44px ${serif}`;
    g.textAlign = 'center';
    g.fillText('3250 MONROE STREET   ·   SANTA CLARA UNIFIED SCHOOL DISTRICT', w / 2, 290);
  });
  group.add(decal(signTex, s.x, s.y, z - 0.03, s.w, s.w * 400 / 2048, Math.PI));

  // roof edge over the sign wall, and the stepped-up volume behind it
  W.slab('flat', -47.2, z - 1.3, -26.2, z, 4.45, 4.85, fin);
  W.slab('stucco', -41, -71, -30, -62, 4.8, 6.6, color('#efe8d6'));
  // the main entrance: a flat canopy on two posts, glass doors and a mosaic panel
  const e = FRONT.entry;
  W.slab('flat', e.x0, z - 4.6, e.x1 + 1.5, z, 3.4, 3.7, fin);
  for (const px of [e.x0 + 0.4, e.x1 + 1.1]) W.slab('flat', px - 0.14, z - 4.4, px + 0.14, z - 4.12, 0, 3.4, fin);
  W.slab('mosaic', e.x0 + 0.2, z - 0.12, e.x0 + 2.2, z, 0, 3.2, color('#ffffff'));
  for (const dx of [2.6, 4.0]) {
    W.slab('flat', e.x0 + dx, z - 0.08, e.x0 + dx + 1.35, z, 0, 2.5, steel);
    W.quad('glass', [e.x0 + dx + 1.25, 0.1, z - 0.1], [e.x0 + dx + 0.1, 0.1, z - 0.1], [e.x0 + dx + 0.1, 2.4, z - 0.1], [e.x0 + dx + 1.25, 2.4, z - 0.1], color('#fff'), 'auto');
  }
  W.slab('glow', e.x0 + 1.5, z - 2.6, e.x0 + 2.3, z - 1.8, 3.36, 3.4, color('#ffe6bd')); LIGHTS.push([e.x0 + 1.9, z - 2.2, 3.4, 5]);
  // student entrance: a second door just south of the main one, on the east face
  W.slab('flat', -26.2, -67.5, -24.2, -64.5, 3.2, 3.45, fin);
  W.slab('flat', -26.26, -66.8, -26.2, -65.2, 0, 2.4, steel);

  // the planter: poured concrete, rounded at the east end, full of flax and fan palms
  const p = FRONT.planter, r = (p.z1 - p.z0) / 2, cz = (p.z0 + p.z1) / 2;
  const outline = [[p.x0, p.z0], [p.x1 - r, p.z0]];
  for (let i = 1; i < 10; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 10; outline.push([p.x1 - r + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  outline.push([p.x1 - r, p.z1], [p.x0, p.z1]);
  W.prism('flat', outline, 0, p.h, concrete);
  const inner = outline.map(([x, zz]) => [x + (x < p.x0 + 0.1 ? 0.2 : 0), zz + (zz < cz ? 0.2 : -0.2)]);
  W.prism('flat', inner, p.h - 0.1, p.h + 0.02, soil, { walls: false });
  for (let x = p.x0 + 0.8; x < p.x1 - 0.6; x += 1.05 + R() * 0.5) {
    if (R() < 0.72) flax(W, x, cz + (R() - 0.5) * 1.2, R, { y: p.h, h: 1.2 + R() * 0.7 });
    else shrub(W, x, cz, R, { y: p.h, s: 0.9, cols: G.leaf });
  }
  for (const [x, zz, h] of FRONT.palms) palm(W, x, zz, R, { h });
  // blue accessible-parking sign
  const [ax, az] = FRONT.ada;
  W.cyl('flat', ax, 0, az, 0.04, 0.04, 2.3, 6, color('#9a9ea3'));
  const ada = textCanvas(128, 160, (g, w, h) => {
    g.fillStyle = '#1f5fbf'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#fff'; g.font = 'bold 96px sans-serif'; g.textAlign = 'center'; g.fillText('♿', w / 2, 112);
  });
  group.add(decal(ada, ax, 2.0, az - 0.05, 0.45, 0.56, Math.PI));

  // flagpole
  const [fx, fz] = FRONT.flag;
  W.cyl('flat', fx, 0, fz, 0.55, 0.5, 0.35, 12, concrete);
  W.cyl('flat', fx, 0.35, fz, 0.1, 0.055, 11.6, 8, color('#c7cbd0'));
  W.blob('flat', fx, 12.05, fz, 0.16, 0.16, 0.16, color('#e2b53b'));

  // ── Building B's grey steel entry canopy, running to the cafeteria's walkway ──
  const c0 = -54.7, c1 = -17.8, cz0 = -33.6, cz1 = -28.4;
  W.slab('flat', c0, cz0, c1, cz1, 3.55, 3.8, color('#e9e7e2'));          // soffit/underside
  W.slab('flat', c0, cz0 - 0.1, c1, cz0, 3.4, 3.9, steel);
  W.slab('flat', c0, cz1, c1, cz1 + 0.1, 3.4, 3.9, steel);
  for (let x = c0 + 5; x < c1; x += 6) {
    for (const zz of [cz0 + 0.35, cz1 - 0.35]) W.slab('flat', x - 0.14, zz - 0.14, x + 0.14, zz + 0.14, 0, 3.55, steel);
    W.beam('flat', x, cz0 + 0.35, x + 1.8, cz0 + 1.8, 2.6, 3.55, 0.12, steel);   // angled struts, as in the photo
    W.beam('flat', x, cz1 - 0.35, x + 1.8, cz1 - 1.8, 2.6, 3.55, 0.12, steel);
  }
  // B's glass entry under the canopy's west end, with the triangular wall light
  W.slab('flat', c0 + 0.02, -33.2, c0 + 0.14, -29, 0, 3.3, steel);
  for (let i = 0; i < 3; i++) {
    const zz = -32.9 + i * 1.4;
    W.quad('glass', [c0 + 0.16, 0.1, zz + 1.2], [c0 + 0.16, 0.1, zz], [c0 + 0.16, 2.4, zz], [c0 + 0.16, 2.4, zz + 1.2], color('#fff'), 'auto');
  }
  W.quad('glass', [c0 + 0.16, 2.55, -29.1], [c0 + 0.16, 2.55, -33.1], [c0 + 0.16, 3.2, -33.1], [c0 + 0.16, 3.2, -29.1], color('#fff'), 'auto');
  W.tris('flat', [[c0 + 0.2, 2.9, -34.2], [c0 + 0.2, 2.9, -34.9], [c0 + 0.2, 3.25, -34.55]], [[1, 0, 0], [1, 0, 0], [1, 0, 0]], null, color('#6b5a4a'));

  // downlights under B's canopy
  for (let x = c0 + 3; x < c1; x += 6) { W.slab('glow', x - 0.35, -31.3, x + 0.35, -30.7, 3.5, 3.54, color('#ffe6bd')); LIGHTS.push([x, -31, 3.5, 4.5]); }

  // ── the cafeteria's covered walkway along the quad ──
  const wz0 = -30.4, wz1 = -27.0;
  for (let x = -14; x < 62; x += 7.5) { W.slab('glow', x - 0.3, -28.9, x + 0.3, -28.5, 3.45, 3.49, color('#ffe6bd')); LIGHTS.push([x, -28.7, 3.45, 4]); }
  W.slab('flat', -17.8, wz0, 62.6, wz1, 3.5, 3.78, fin);
  W.slab('flat', -17.8, wz1 - 0.05, 62.6, wz1 + 0.05, 3.2, 3.8, color('#e3dccb'));
  for (let x = -15; x < 62; x += 5) W.slab('flat', x - 0.08, wz1 - 0.38, x + 0.08, wz1 - 0.12, 0, 3.5, color('#9ea3a8'));   // grey steel posts (IMG_2363)

  // ── the Career Center's yellow awning on B, over its quad-side door ──
  awning(W, -54.7, 26.2, 31.2, 1.6, 2.7, color('#e8b930'), 'x');

  // ── Building R: the ASB Office awning on the quad side ──
  const asbZ0 = 13.8, asbZ1 = 20.1;            // the southernmost bay (Ethan: "on the very right side")
  roundAwning(W, 33.2, asbZ0, asbZ1, 1.5, 3.0, color('#ecc75a'));
  const asbTex = textCanvas(1024, 96, (g, w, h) => {
    g.fillStyle = '#16181b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c547'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 66px "Helvetica Neue", Arial, sans-serif'; g.fillText('ASB OFFICE', w / 2, h / 2 + 3);
    g.font = 'italic 800 70px Georgia, serif'; g.fillText('W', 150, h / 2 + 4); g.fillText('W', w - 150, h / 2 + 4);
    g.fillRect(170, h / 2 + 18, 38, 4); g.fillRect(w - 132, h / 2 + 18, 38, 4);
  });
  group.add(decal(asbTex, 33.2 - 1.52, 2.83, (asbZ0 + asbZ1) / 2, asbZ1 - asbZ0, (asbZ1 - asbZ0) * 96 / 1024, -Math.PI / 2));

  // ── Building R's roof: rows of solar panels ──
  solarRows(W, 34.6, -21.5, 53.3, 23.8, 13.15, 0);

  // ── solar carports over the faculty lot ──
  for (const pc of CARPORTS) {
    const [[x0, z0], , [x1, z1]] = pc;
    const mz = (z0 + z1) / 2;
    for (let x = x0 + 3; x < x1 - 1; x += 9) {
      W.slab('flat', x - 0.2, mz - 0.2, x + 0.2, mz + 0.2, 0, 4.3, color('#9da2a8'));
      W.slab('flat', x - 0.12, z0 + 0.5, x + 0.12, z1 - 0.5, 4.1, 4.35, color('#9da2a8'));
    }
    solarRows(W, x0, z0, x1, z1, 4.35, 0.12, true);
  }

  // ── colourful ceramic art poles in the planting bed along B ──
  const beads = ['#d1463c', '#2f6db3', '#e2b336', '#e07a2e', '#2d9b8f', '#7b4aa0', '#f0e6d2'].map(color);
  for (let i = 0; i < 9; i++) {
    const x = -52.6 + (R() - 0.5) * 1.2, zz = -14 + i * 4.2 + R() * 1.5;
    let y = 0;
    const H = 2.2 + R() * 1.1;
    W.cyl('flat', x, 0, zz, 0.05, 0.05, H, 6, color('#555'));
    while (y < H) {
      const k = 0.18 + R() * 0.22, c = beads[Math.floor(R() * beads.length)];
      if (R() < 0.5) W.cyl('flat', x, y, zz, 0.13, 0.13, k, 8, c); else W.blob('flat', x, y + k / 2, zz, 0.15, k / 2, 0.15, c, 0);
      y += k + 0.02;
    }
  }
  // grasses in the same bed
  for (let zz = -26; zz < 36; zz += 1.3) grassTuft(W, -53.2 + R() * 2.4, zz + R(), R, { h: 0.7 + R() * 0.5 });

  // ── the main gym: WILCOX in huge black letters on its east wall ──
  const wilcox = textCanvas(2048, 360, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#111';
    g.font = '900 300px "Arial Black", "Helvetica Neue", Arial, sans-serif';
    g.textBaseline = 'middle';
    const letters = 'WILCOX'.split(''), step = w / letters.length;
    letters.forEach((L, i) => { g.textAlign = 'center'; g.fillText(L, step * (i + 0.5), h / 2 + 10); });
  });
  group.add(decal(wilcox, 133.2 + 0.03, 6.4, -1.9, 32, 32 * 360 / 2048, Math.PI / 2));

  // ── the main gym entrance: glass doors under a dark tiled band, mosaic wall beside ──
  const gz = -31.4, gx0 = 116.2, gx1 = 131.6;
  W.slab('flat', gx0, gz - 0.25, gx1, gz, 2.7, 4.5, color('#3a3d42'));
  const charger = textCanvas(2048, 200, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f2f2ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 120px "Helvetica Neue", Arial, sans-serif';
    g.fillText('W I L C O X   C H A R G E R S', w / 2, h / 2 + 6);
  });
  group.add(decal(charger, (gx0 + gx1) / 2, 3.6, gz - 0.27, gx1 - gx0 - 0.6, (gx1 - gx0 - 0.6) * 200 / 2048, Math.PI, false));
  for (let x = gx0 + 0.3; x < gx1 - 1; x += 1.25) {
    W.slab('flat', x, gz - 0.08, x + 0.08, gz, 0, 2.7, steel);
    W.quad('glass', [x + 1.2, 0.05, gz - 0.1], [x + 0.1, 0.05, gz - 0.1], [x + 0.1, 2.6, gz - 0.1], [x + 1.2, 2.6, gz - 0.1], color('#fff'), 'auto');
  }
  W.slab('mosaic', 115.4, -47.2, 115.55, -31.9, 0.2, 5.1, color('#ffffff'));

  // ── the lecture hall's blue glass front, on its curved east side ──
  const lecture = BUILDINGS.find((b) => b.id === 'S-lecture');
  for (const ed of wallEdges(lecture.poly)) {
    if (ed.nx < 0.3) continue;
    W.with(ed.ax + ed.dx * ed.len / 2 + ed.nx * 0.06, 3, ed.az + ed.dz * ed.len / 2 + ed.nz * 0.06, ed.rot, () => {
      const hw = ed.len / 2 - 0.3;
      W.quad('glass', [-hw, -2.8, 0], [hw, -2.8, 0], [hw, 2.8, 0], [-hw, 2.8, 0], color('#b9d3ff'), [[0, 0], [hw * 2, 0], [hw * 2, 5.6], [0, 5.6]]);
      for (let t = -hw; t <= hw + 0.01; t += hw / 3) W.box('flat', t, 0, 0.03, 0.1, 5.6, 0.08, color('#2b3440'));
    });
  }
}

// A sloped fabric awning on a wall facing -x or +x (dir 'x'), spanning z0..z1.
function awning(W, x, z0, z1, depth, y, col) {
  const out = x > 0 ? -1 : 1;   // walls at x>0 face west (quad side of R), B's face east
  const xo = x + out * depth;
  W.quad('flat', [x, y + 0.9, z0], [x, y + 0.9, z1], [xo, y + 0.25, z1], [xo, y + 0.25, z0].map((v) => v), col);
  W.quad('flat', [x, y + 0.9, z1], [x, y + 0.9, z0], [xo, y + 0.25, z0], [xo, y + 0.25, z1], col);
  W.slab('flat', Math.min(x, xo), z0, Math.max(x, xo), z0 + 0.04, y + 0.25, y + 0.9, col);
  W.slab('flat', Math.min(x, xo), z1 - 0.04, Math.max(x, xo), z1, y + 0.25, y + 0.9, col);
  W.slab('flat', xo - 0.03, z0, xo + 0.03, z1, y - 0.2, y + 0.25, color('#1b1d20'));   // valance
}

// A rounded fabric awning against a west-facing wall at x (the ASB Office's,
// IMG_2342): a quarter-round of yellow over a dark valance.
function roundAwning(W, x, z0, z1, depth, y, col) {
  const n = 8, P = (k) => { const a = (k / n) * Math.PI / 2; return [x - Math.sin(a) * depth, y + 0.25 + Math.cos(a) * 0.72]; };
  for (let k = 0; k < n; k++) {
    const [xa, ya] = P(k), [xb, yb] = P(k + 1);
    W.quad('flat', [xa, ya, z1], [xa, ya, z0], [xb, yb, z0], [xb, yb, z1], col);
    for (const [z, flip] of [[z0, false], [z1, true]]) {
      const tri = [[x, y + 0.25, z], [xa, ya, z], [xb, yb, z]];
      W.quad('flat', ...(flip ? [tri[0], tri[2], tri[1], tri[1]] : [tri[0], tri[1], tri[2], tri[2]]), col);
    }
  }
  W.slab('flat', x - depth - 0.03, z0, x - depth + 0.03, z1, y - 0.2, y + 0.25, color('#1b1d20'));   // valance
}

// Rows of tilted solar panels between two corners at height y.
function solarRows(W, x0, z0, x1, z1, y, tilt, frames = false) {
  const rowD = 1.8, gap = frames ? 0.05 : 0.7;
  for (let z = z0 + 0.4; z + rowD < z1; z += rowD + gap) {
    const lift = Math.sin(0.17) * rowD;
    W.quad('solar', [x0, y + tilt, z + rowD], [x1, y + tilt, z + rowD], [x1, y + tilt + lift, z], [x0, y + tilt + lift, z], color('#ffffff'),
      [[0, 0], [x1 - x0, 0], [x1 - x0, rowD], [0, rowD]]);
    if (!frames) W.slab('flat', x0, z + 0.05, x1, z + 0.12, y, y + tilt + lift, color('#9aa0a6'));
  }
}
