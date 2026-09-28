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
import { FRONT, CARPORTS, BUILDINGS, COURT } from './layout.js';
import { wallEdges } from './buildings.js';
import { LIGHTS } from './lights.js';
import { palm, flax, grassTuft, shrub, shadeTree, youngTree, G } from './nature.js';
import { umbrellaTable } from './quad.js';
import { addCircle, addPoly } from './collide.js';
import { inPoly, ensureCCW } from './geo.js';

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

  // the planter: poured concrete, rounded at the east end, full of flax (the palms have their own bed, below)
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
  for (const [x, zz, h] of FRONT.palms) palm(W, x, zz, R, { h, y: FRONT.palmBed.h });   // in their bed (below)
  // blue accessible-parking sign
  const [ax, az] = FRONT.ada;
  W.cyl('flat', ax, 0, az, 0.04, 0.04, 2.3, 6, color('#9a9ea3'));
  const ada = textCanvas(128, 160, (g, w, h) => {
    g.fillStyle = '#1f5fbf'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#fff'; g.font = 'bold 96px sans-serif'; g.textAlign = 'center'; g.fillText('♿', w / 2, 112);
  });
  group.add(decal(ada, ax, 2.0, az - 0.05, 0.45, 0.56, Math.PI));

  // the palms' bed at the office's north-east corner, rounded at its south-east corner
  {
    const b = FRONT.palmBed, out = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1 - b.r]];
    for (let i = 1; i < 8; i++) { const a = (Math.PI / 2) * (i / 8); out.push([b.x1 - b.r + Math.cos(a) * b.r, b.z1 - b.r + Math.sin(a) * b.r]); }
    out.push([b.x1 - b.r, b.z1], [b.x0, b.z1]);
    W.prism('flat', out, 0, b.h, concrete, { top: true, topMat: 'flat', topCol: soil });
    addPoly(ensureCCW(out));
    const R2 = rng(611);
    for (let k = 0; k < 9; k++) {
      const x = b.x0 + 0.8 + R2() * (b.x1 - b.x0 - 1.6), zz = b.z0 + 0.8 + R2() * (b.z1 - b.z0 - 1.6);
      if (inPoly(x, zz, out)) flax(W, x, zz, R2, { y: b.h, h: 1.1 + R2() * 0.6 });
    }
  }
  // the flagpole, in its round planter: a ring of shrubs round a paved circle
  const [fx, fz] = FRONT.flag, fb = FRONT.flagBed;
  W.cyl('flat', fx, 0, fz, fb.r, fb.r, 0.3, 36, soil);
  W.cyl('flat', fx, 0, fz, fb.inner, fb.inner, 0.34, 36, color('#d6b98c'));
  { const R3 = rng(612); for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; shrub(W, fx + Math.cos(a) * 3.6, fz + Math.sin(a) * 3.6, R3, { y: 0.3, s: 1.0 + R3() * 0.3 }); } }
  addCircle(fx, fz, 0.6);
  W.cyl('flat', fx, 0.3, fz, 0.55, 0.5, 0.35, 12, concrete);
  W.cyl('flat', fx, 0.65, fz, 0.1, 0.055, 11.6, 8, color('#c7cbd0'));
  W.blob('flat', fx, 12.35, fz, 0.16, 0.16, 0.16, color('#e2b53b'));

  court(W);

  // ── Building B's grey steel canopy, running to the snack bar (IMG_2391, Ethan) ──
  // A butterfly (V) roof on ONE row of posts: the row nearer the parking lot, under the
  // roof's middle (its valley). Each post splits near the top into a Y whose arms hold the
  // two wings. It stands taller than the cafeteria's walkway roof (3.5–3.78) it meets.
  // Its extent is off the Apple Maps view: from B's white entry block (x -48.2) to x -20, z -35.2..-29.0.
  const c0 = -48.2, c1 = -20.0, zp = -32.1, hw = 3.1;          // post line; half-width of the roof
  const yv = 3.95, ye = 4.6, th = 0.12;                         // underside at the valley and at the edges
  const under = (d) => yv + (ye - yv) * (Math.abs(d) / hw);     // underside height d metres from the valley
  const post = color('#3d4044'), soffit = color('#e9e7e2'), metal = color('#9ea3a8');
  for (const s of [-1, 1]) {                                     // the two wings: s -1 north, +1 south
    const zE = zp + s * hw;
    const top = (a, b, c, d) => W.quad('metal', a, b, c, d, metal, 'auto');
    const bot = (a, b, c, d) => W.quad('flat', a, b, c, d, soffit, 'auto');
    if (s < 0) {
      top([c0, yv + th, zp], [c1, yv + th, zp], [c1, ye + th, zE], [c0, ye + th, zE]);
      bot([c0, yv, zp], [c0, ye, zE], [c1, ye, zE], [c1, yv, zp]);
    } else {
      top([c1, yv + th, zp], [c0, yv + th, zp], [c0, ye + th, zE], [c1, ye + th, zE]);
      bot([c1, yv, zp], [c1, ye, zE], [c0, ye, zE], [c0, yv, zp]);
    }
    W.slab('flat', c0, Math.min(zE, zE - s * 0.1), c1, Math.max(zE, zE - s * 0.1), ye - 0.1, ye + th + 0.12, soffit);   // fascia
  }
  W.slab('flat', c0, zp - 0.14, c1, zp + 0.14, yv - 0.3, yv + 0.02, post);                       // the beam along the valley
  const nPost = Math.round((c1 - c0) / 6), gap = (c1 - c0) / nPost;
  for (let x = c0 + gap / 2; x < c1; x += gap) {
    W.slab('flat', x - 0.15, zp - 0.15, x + 0.15, zp + 0.15, 0, yv - 0.3, post);                  // the post
    for (const s of [-1, 1]) {
      W.rod('flat', [x, yv - 0.8, zp + s * 0.1], [x, under(1.7) - 0.02, zp + s * 1.7], 0.14, post);   // the Y's arm
      W.rod('flat', [x, under(0.2), zp + s * 0.2], [x, under(hw - 0.2), zp + s * (hw - 0.2)], 0.1, post);  // rib under the wing
    }
    W.slab('glow', x - 0.05, zp + 0.15, x + 0.05, zp + 0.2, 1.9, 2.6, color('#ffe6bd'));          // the light on the post
    LIGHTS.push([x, zp + 0.5, 2.3, 4]);
  }
  // B's glass entry under the canopy's west end, with the triangular wall light
  W.slab('flat', c0 + 0.02, -33.2, c0 + 0.14, -29, 0, 3.3, steel);
  for (let i = 0; i < 3; i++) {
    const zz = -32.9 + i * 1.4;
    W.quad('glass', [c0 + 0.16, 0.1, zz + 1.2], [c0 + 0.16, 0.1, zz], [c0 + 0.16, 2.4, zz], [c0 + 0.16, 2.4, zz + 1.2], color('#fff'), 'auto');
  }
  W.quad('glass', [c0 + 0.16, 2.55, -29.1], [c0 + 0.16, 2.55, -33.1], [c0 + 0.16, 3.2, -33.1], [c0 + 0.16, 3.2, -29.1], color('#fff'), 'auto');
  W.tris('flat', [[c0 + 0.2, 2.9, -34.2], [c0 + 0.2, 2.9, -34.9], [c0 + 0.2, 3.25, -34.55]], [[1, 0, 0], [1, 0, 0], [1, 0, 0]], null, color('#6b5a4a'));


  // ── the cafeteria's covered walkway along the quad ──
  const wz0 = -30.4, wz1 = -27.0;
  // it starts at the west wing's corner (x -18.3); between it and B's canopy (which ends at x -20)
  // is a gap open to the sky, in front of the door into the teachers' yard (Apple Maps view)
  const wx0 = -18.3;
  for (let x = -14; x < 62; x += 7.5) { W.slab('glow', x - 0.3, -28.9, x + 0.3, -28.5, 3.45, 3.49, color('#ffe6bd')); LIGHTS.push([x, -28.7, 3.45, 4]); }
  W.slab('flat', wx0, wz0, 62.6, wz1, 3.5, 3.78, fin);
  W.slab('flat', wx0, wz1 - 0.05, 62.6, wz1 + 0.05, 3.2, 3.8, color('#e3dccb'));
  // it reaches back over the snack bar's recess and the set-back corner beside it (layout.js CAF-w)
  W.slab('flat', -15.6, -32.4, -4.95, wz0, 3.5, 3.78, fin);
  W.slab('flat', -18.3, -35.4, -15.6, wz0, 3.5, 3.78, fin);
  W.slab('glow', -17.25, -33.3, -16.65, -32.9, 3.45, 3.49, color('#ffe6bd')); LIGHTS.push([-16.95, -33.1, 3.45, 4]);
  for (const x of [-13.5, -8.5]) { W.slab('glow', x - 0.3, -31.6, x + 0.3, -31.2, 3.45, 3.49, color('#ffe6bd')); LIGHTS.push([x, -31.4, 3.45, 4]); }
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

// ── the courtyard between the front office and B's canopy (layout.js COURT) ──
function court(W) {
  const R = rng(613);
  // the raised zig-zag planter: a concrete rim round soil, full of shrubs and grasses
  const P = ensureCCW(COURT.planter), h = 0.45;
  W.prism('flat', P, 0, h, concrete, { top: true, topMat: 'flat', topCol: soil });
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
    W.beam('flat', ax, az, bx, bz, h - 0.02, h + 0.05, 0.3, concrete);
  }
  addPoly(P);
  const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
  for (let k = 0; k < 60; k++) {
    const x = Math.min(...xs) + R() * (Math.max(...xs) - Math.min(...xs)), z = Math.min(...zs) + R() * (Math.max(...zs) - Math.min(...zs));
    if (!inPoly(x, z, P)) continue;
    if (R() < 0.55) shrub(W, x, z, R, { y: h, s: 0.8 + R() * 0.5, cols: R() < 0.5 ? G.leaf : G.dark });
    else grassTuft(W, x, z, R, { y: h });
  }
  // the trees: a big shade tree by B, a small reddish one north of it, a small orange one east of it
  const [bx, bz] = COURT.bigTree; shadeTree(W, bx, bz, R, { h: 11 }); addCircle(bx, bz, 0.45);
  const [rx, rz] = COURT.redTree; youngTree(W, rx, rz, R, { h: 5.5, stake: false, cols: [color('#7a3b3f'), color('#8e4a45'), color('#6b3440')] }); addCircle(rx, rz, 0.2);
  const [sx, sz] = COURT.smallTree; youngTree(W, sx, sz, R, { h: 3.2, stake: false, cols: [color('#c7793f'), color('#b8683a')] }); addCircle(sx, sz, 0.15);
  const [tx, tz] = COURT.table; umbrellaTable(W, tx, tz, R);
  // the covered walk along the office's south face: a flat roof on slim posts
  const c = COURT.porch;
  W.slab('flat', c.x0, c.z0, c.x1, c.z1, 3.2, 3.45, fin);
  const nP = Math.round((c.x1 - c.x0) / 6);
  for (let i = 0; i <= nP; i++) { const x = c.x0 + 1 + (i * (c.x1 - c.x0 - 1.5)) / nP; W.slab('flat', x - 0.1, c.z1 - 0.35, x + 0.1, c.z1 - 0.15, 0, 3.2, fin); }
}
