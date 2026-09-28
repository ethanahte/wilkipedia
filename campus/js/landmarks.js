// One-off pieces that make the campus recognisable, each from a photo:
//   the front sign wall with its concrete planter, flax, fan palms and flags;
//   the grey steel canopy from Building B to the cafeteria; the cafeteria's
//   covered walkway; the ASB Office awning;
//   Building R's solar roof; the solar carports; the totems by B's entry block;
//   "WILCOX" on the main gym and the "WILCOX CHARGERS" entrance with its mosaic.
// Lettering is drawn on canvases at load, so it stays sharp up close.

import * as THREE from 'three';
import { color, rng } from './geo.js';
import { canvasTex, decalMat } from './toon.js';
import { FRONT, CARPORTS, BUILDINGS, COURT, B_BED, B_QUAD } from './layout.js';
import { wallEdges } from './buildings.js';
import { LIGHTS } from './lights.js';
import { palm, flax, grassTuft, shrub, shadeTree, youngTree, crapeMyrtle, cards, G } from './nature.js';
import { umbrellaTable, poppies, bench } from './quad.js';
import { addCircle, addPoly, addSegment, addBox } from './collide.js';
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
  W.slab('flat', -47.2, z - 1.3, FRONT.entry.x + FRONT.entry.depth, z, 4.45, 4.85, fin);   // wraps round to the entrance overhang
  W.slab('stucco', -41, -71, -30.4, -62, 4.8, 6.6, color('#efe8d6'));
  // the office's entrance, on its EAST face toward the flagpole (Ethan's photo from the parking lot,
  // IMG_2400, IMG_2404): recessed under a deep overhang that runs the whole face and a little past
  // its south end, thick and flush with the roofline, with ADMINISTRATION in grey letters on its
  // fascia. One square post holds its south corner; the free-standing wall holds its north end.
  // Under it, south to north: a wide pebble-mosaic panel at the corner, then a storefront of frosted
  // glass over white panels with a clear transom row: the WHS public-entrance door in the south bay,
  // a second glass door at the north end, where a short pier meets the wall.
  const e = FRONT.entry, ox = e.x + e.depth;
  W.slab('flat', e.x, e.z0, ox, e.z1, 3.4, 4.8, fin);
  W.slab('flat', ox - 0.15, e.z0, ox, e.z1, 3.3, 3.4, fin);
  W.slab('flat', ox - 0.7, e.z1 - 0.9, ox - 0.1, e.z1 - 0.3, 0, 3.4, fin); addBox(ox - 0.7, e.z1 - 0.9, ox - 0.1, e.z1 - 0.3);
  const adm = textCanvas(1024, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#4a4e54'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 92px "Helvetica Neue", Arial, sans-serif'; g.fillText('ADMINISTRATION', w / 2, h / 2 + 4);
  });
  group.add(decal(adm, ox + 0.03, 4.05, -67.6, 4.4, 0.55, Math.PI / 2));
  const zS = -59.0;                                              // the office's south-east corner (layout COURT.step)
  W.slab('mosaic', e.x, zS - 2.5, e.x + 0.1, zS, 0, 3.3, color('#ffffff'));
  frostFrontE(W, zS - 2.6, e.z0 + 0.9, e.x, ['f', 'd', 'f', '|', 'f', 'f', 'f', '|', 'f', 'f', 'd']);
  W.slab('stucco', e.x, e.z0 + 0.3, e.x + 0.2, e.z0 + 0.9, 0, 3.4, color('#efe8d6'));
  for (const gz of [-70.0, -63.0]) { W.slab('glow', e.x + 1.6, gz - 0.4, e.x + 2.4, gz + 0.4, 3.36, 3.4, color('#ffe6bd')); LIGHTS.push([e.x + 2.0, gz, 3.35, 5]); }

  for (const [x, zz, h] of FRONT.palms) palm(W, x, zz, R, { h, y: FRONT.bed.h });   // in the bed round the wall (below)
  // blue accessible-parking sign
  const [ax, az] = FRONT.ada;
  W.cyl('flat', ax, 0, az, 0.04, 0.04, 2.3, 6, color('#9a9ea3'));
  const ada = textCanvas(128, 160, (g, w, h) => {
    g.fillStyle = '#1f5fbf'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#fff'; g.font = 'bold 96px sans-serif'; g.textAlign = 'center'; g.fillText('♿', w / 2, 112);
  });
  group.add(decal(ada, ax, 2.0, az - 0.05, 0.45, 0.56, Math.PI));
  // the free-standing wall that runs east from the office's north-east corner, flush with its north
  // face, closing the entrance court (it carries the overhang's north end, then stands clear of it),
  // and the ONE raised concrete bed that wraps round it (Ethan, IMG_2401): agapanthus, red-leaf
  // shrubs and boulders in the south leg and the round end, flax along the north side
  {
    const sw = FRONT.screenWall, b = FRONT.bed, r = (b.zs - b.zn) / 2, cz = (b.zs + b.zn) / 2;
    W.slab('stucco', e.x, sw.z0, sw.x1, sw.z1, 0, sw.h, color('#efe8d6'));
    W.slab('flat', ox, sw.z0 - 0.03, sw.x1 + 0.03, sw.z1 + 0.03, sw.h, sw.h + 0.1, fin);
    addBox(e.x, sw.z0, sw.x1, sw.z1);
    const out = [[b.xw, z], [b.xw, b.zn], [b.cx, b.zn]];
    for (let i = 1; i < 12; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 12; out.push([b.cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    out.push([b.cx, b.zs], [b.x0, b.zs], [b.x0, z]);
    W.prism('flat', out, 0, b.h, concrete, { top: true, topMat: 'flat', topCol: soil });
    addPoly(ensureCCW(out));
    const R2 = rng(611), AG = [color('#3f6f37'), color('#4a7d3d')], RED = ['#6e2f3a', '#7d3b3f', '#5e3a34'].map(color);
    const mS = (sw.z1 + b.zs) / 2, mN = (z + b.zn) / 2;             // middle lines of the south and north legs
    for (let x = b.x0 + 0.7; x < b.cx + r - 0.8; x += 0.9 + R2() * 0.5) {
      const zz = x < b.cx ? mS + (R2() - 0.5) * 1.4 : cz + (R2() - 0.5) * 4.0;
      const k = R2();
      if (k < 0.6) grassTuft(W, x, zz, R2, { y: b.h, h: 0.9, cols: AG });
      else if (k < 0.8) shrub(W, x, zz, R2, { y: b.h, s: 1.0, cols: RED });
      else W.blob('flat', x, b.h + 0.2, zz, 0.45, 0.3, 0.35, color('#9a948a'));
    }
    for (let x = b.xw + 0.8; x < b.cx; x += 1.05 + R2() * 0.5) {
      if (R2() < 0.75) flax(W, x, mN + (R2() - 0.5) * 1.2, R2, { y: b.h, h: 1.2 + R2() * 0.7 });
      else shrub(W, x, mN, R2, { y: b.h, s: 0.9, cols: G.leaf });
    }
  }
  // the cafeteria's north wall, toward the flagpole: two blue banners (IMG_2402)
  const ban = textCanvas(512, 280, (g, w, h) => {
    g.fillStyle = '#23407e'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.fillRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#23407e'; g.fillRect(18, 18, w - 36, h - 36); g.fillStyle = '#ffffff'; g.textAlign = 'center';
    g.font = '800 48px "Helvetica Neue", Arial, sans-serif'; g.fillText('WILCOX HIGH SCHOOL', w / 2, 120);
    g.font = '700 40px "Helvetica Neue", Arial, sans-serif'; g.fillText('#CHARGERSTRONG', w / 2, 190);
  });
  for (const [xx, bw] of [[-12.5, 2.3], [-7.5, 1.5]]) group.add(decal(ban, xx, 3.1, -52.83, bw, bw * 280 / 512, Math.PI));
  // the flagpole, in its round planter: a ring of shrubs round a paved circle
  const [fx, fz] = FRONT.flag, fb = FRONT.flagBed;
  W.cyl('flat', fx, 0, fz, fb.r, fb.r, 0.3, 36, soil);
  W.cyl('flat', fx, 0, fz, fb.inner, fb.inner, 0.34, 36, color('#d6b98c'));
  // golden mounded shrubs round it, yellow tree roses on the outside, a bench at its edge (IMG_2402, IMG_2403)
  {
    const R3 = rng(612), GOLD = ['#b9c94a', '#a8bd3f', '#c7d25e'].map(color);
    for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2; shrub(W, fx + Math.cos(a) * 3.4, fz + Math.sin(a) * 3.4, R3, { y: 0.3, s: 1.4 + R3() * 0.3, cols: GOLD }); }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; treeRose(W, fx + Math.cos(a) * 4.0, fz + Math.sin(a) * 4.0, R3, color('#f2d24a')); }
    bench(W, fx - 5.2, fz + 0.6, 0);
  }
  addCircle(fx, fz, 0.6);
  W.cyl('flat', fx, 0.3, fz, 0.55, 0.5, 0.35, 12, concrete);
  W.cyl('flat', fx, 0.65, fz, 0.1, 0.055, 11.6, 8, color('#c7cbd0'));
  W.blob('flat', fx, 12.35, fz, 0.16, 0.16, 0.16, color('#e2b53b'));

  court(W, group);
  bEntryBed(W);

  // ── B's quad side and the library's entrance (IMG_2376–2386; the rest is buildings.js) ──
  bQuadBeds(W);
  const ccrc = textCanvas(2048, 190, (g, w, h) => {
    g.fillStyle = '#1f2f5c'; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f4f4f2'; g.font = '600 64px "Helvetica Neue", Arial, sans-serif';
    g.fillText('CAREER & COLLEGE RESOURCE CENTER     RM B-113', w / 2 - 50, h / 2 + 4);
    g.fillStyle = '#e8c341'; g.font = 'italic 800 130px Georgia, serif'; g.fillText('W', w - 120, h / 2 + 8);
    g.font = 'italic 800 80px Georgia, serif'; g.fillText('W', 70, h / 2 + 6);
  });
  group.add(decal(ccrc, -53.13, 3.47, 20.05, 5.1, 5.1 * 190 / 2048, Math.PI / 2));
  const libSign = textCanvas(512, 180, (g, w, h) => {
    g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a8f96'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#26292e'; g.font = '600 110px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Library', w / 2, h / 2 + 6);
  });
  group.add(decal(libSign, -48.2, 3.4, 33.27, 1.3, 1.3 * 180 / 512, Math.PI));

  // ── Building B's grey steel canopy, running to the snack bar (IMG_2391, Ethan) ──
  // A butterfly (V) roof on ONE row of posts: the row nearer the parking lot, under the
  // roof's middle (its valley). Each post splits near the top into a Y whose arms hold the
  // two wings. It stands taller than the cafeteria's walkway roof (3.5–3.78) it meets.
  // It runs from B's white entry block (x -48.2, the Apple Maps view) to the snack bar (Ethan),
  // with its posts just in front of the teachers' yard wall (z -32.4).
  const c0 = -48.2, c1 = -17.8, zp = -31.65, hw = 3.0;         // post line; half-width of the roof
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
  // one post every 6 m; none in front of B's doors (Ethan) — the roof's west end rests on the block
  for (let x = c0 + 7.0; x < c1 - 2; x += 6) {
    W.slab('flat', x - 0.15, zp - 0.15, x + 0.15, zp + 0.15, 0, yv - 0.3, post);                  // the post
    for (const s of [-1, 1]) {
      W.rod('flat', [x, yv - 0.8, zp + s * 0.1], [x, under(1.7) - 0.02, zp + s * 1.7], 0.14, post);   // the Y's arm
      W.rod('flat', [x, under(0.2), zp + s * 0.2], [x, under(hw - 0.2), zp + s * (hw - 0.2)], 0.1, post);  // rib under the wing
    }
    W.slab('glow', x - 0.05, zp + 0.15, x + 0.05, zp + 0.2, 1.9, 2.6, color('#ffe6bd'));          // the light on the post
    LIGHTS.push([x, zp + 0.5, 2.3, 4]);
  }
  // (B's entrance itself, on its entry block, is buildings.js bEntry())


  // ── the cafeteria's covered walkway along the quad ──
  const wz0 = -30.4, wz1 = -27.0;
  // it starts at the west wing's corner, where B's canopy ends and the snack bar begins (IMG_2371)
  const wx0 = -17.8;
  for (let x = -14; x < 62; x += 7.5) { W.slab('glow', x - 0.3, -28.9, x + 0.3, -28.5, 3.45, 3.49, color('#ffe6bd')); LIGHTS.push([x, -28.7, 3.45, 4]); }
  W.slab('flat', wx0, wz0, 62.6, wz1, 3.5, 3.78, fin);
  W.slab('flat', wx0, wz1 - 0.05, 62.6, wz1 + 0.05, 3.2, 3.8, color('#e3dccb'));
  // it reaches back over the snack bar's recess and the door niche beside it (layout.js CAF-w)
  W.slab('flat', -17.8, -32.4, -4.95, wz0, 3.5, 3.78, fin);
  W.slab('flat', -17.8, -33.4, -15.6, -32.4, 3.5, 3.78, fin);
  for (const x of [-13.5, -8.5]) { W.slab('glow', x - 0.3, -31.6, x + 0.3, -31.2, 3.45, 3.49, color('#ffe6bd')); LIGHTS.push([x, -31.4, 3.45, 4]); }
  for (let x = -15; x < 62; x += 5) W.slab('flat', x - 0.08, wz1 - 0.38, x + 0.08, wz1 - 0.12, 0, 3.5, color('#9ea3a8'));   // grey steel posts (IMG_2363)

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
function court(W, group) {
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
  // the purple-leaf tree by the walk's west end is big, its crown high over the walk's roof
  // (IMG_2392, IMG_2395); drawn with a set crown so no leaves cut into B or the roof
  {
    const [rx, rz] = COURT.redTree, pc = color('#5e2b3a');
    W.cyl('flat', rx, 0, rz, 0.2, 0.13, 4.6, 7, G.barkDark);
    for (const [dx, dz] of [[-0.7, 0.3], [0.6, -0.4]]) W.rod('flat', [rx, 3.2, rz], [rx + dx, 4.9, rz + dz], 0.09, G.barkDark);
    W.blob('flat', rx, 6.2, rz, 2.3 * 0.62, 2.0 * 0.66, 2.3 * 0.62, darker(pc));
    cards(W, rx, 6.2, rz, 2.3, 2.0, 2.3, pc, R, 190, 1.0);
    addCircle(rx, rz, 0.3);
  }
  const [sx, sz] = COURT.smallTree; youngTree(W, sx, sz, R, { h: 3.2, stake: false, cols: [color('#c7793f'), color('#b8683a')] }); addCircle(sx, sz, 0.15);
  const [tx, tz] = COURT.table; umbrellaTable(W, tx, tz, R);
  // the bed under the trees: ferns and feather grass, and the small maple by B's entry block
  const CB = ensureCCW(COURT.bed);
  W.prism('flat', CB, 0, 0.07, soil, { top: true, topMat: 'flat', topCol: soil });
  bedFill(W, CB, R, 70, (x, z) => (R() < 0.5 ? fern(W, x, z, R) : grassTuft(W, x, z, R, { y: 0.07, h: 0.7, cols: FEATHER })));
  const [mx, mz] = COURT.maple;
  // it spreads wide, up past the block's first floor (IMG_2392, IMG_2394)
  youngTree(W, mx, mz, R, { h: 6.4, rx: 2.1, stake: false, cols: [color('#6f8a3f'), color('#7d9148'), color('#b8773a')] }); addCircle(mx, mz, 0.25);
  // the covered walk along the office's south face: a flat roof on slim posts
  const c = COURT.porch;
  W.slab('flat', c.x0, c.z0, c.x1, c.z1, 3.2, 3.45, fin);
  W.slab('flat', COURT.step.x, COURT.step.z, -30.2, c.z0, 3.2, 3.45, fin);    // over the set-back half
  // round grey steel posts along its edge, and a light in each bay (IMG_2395, IMG_2397)
  const nP = Math.round((c.x1 - c.x0) / 6);
  for (let i = 0; i <= nP; i++) {
    const x = c.x0 + 1 + (i * (c.x1 - c.x0 - 1.5)) / nP;
    W.cyl('flat', x, 0, c.z1 - 0.3, 0.09, 0.09, 3.2, 10, color('#8d9399')); addCircle(x, c.z1 - 0.3, 0.12);
    if (i < nP) { const lx = x + (c.x1 - c.x0 - 1.5) / nP / 2; W.slab('glow', lx - 0.25, c.z0 + 1.9, lx + 0.25, c.z0 + 2.3, 3.16, 3.2, color('#ffe6bd')); LIGHTS.push([lx, c.z0 + 2.1, 3.15, 4]); }
  }
  // and one at its front corner past the office, by the main entrance, where nothing else holds it
  W.cyl('flat', c.x1 - 0.3, 0, c.z0 + 0.3, 0.09, 0.09, 3.2, 10, color('#8d9399')); addCircle(c.x1 - 0.3, c.z0 + 0.3, 0.12);
  for (const [x, z, rot] of COURT.benches) bench(W, x, z, rot);
  // the black steel fence from the office to the teachers' yard, with its gates, the PTSA banner
  // and no-smoking signs on the passage side, and a bike rack there (IMG_2396, IMG_2398, IMG_2399)
  const [[fa, fb], [fc, fd], [fe, ff]] = COURT.fence;
  const gw = COURT.gateWall;                                           // the wall out from the office's corner
  W.slab('stucco', gw.x0, gw.z0, gw.x1, gw.z1, 0, gw.h, color('#efe8d6')); addBox(gw.x0, gw.z0, gw.x1, gw.z1);
  steelFence(W, fa, fb, fc, fd, [[0.75, 1.2, true]]);                 // south from its end, the gate first
  steelFence(W, fc, fd, fe, ff, [[(fe - fc) / 2, 3.0, false]]);       // east to the yard's short side
  const ptsa = textCanvas(512, 256, (g, w, h) => {
    g.fillStyle = '#f2cf3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f2330'; g.textAlign = 'center';
    g.font = '800 54px "Helvetica Neue", Arial, sans-serif'; g.fillText('GO CHARGERS!', w / 2, 80);
    g.font = '600 36px "Helvetica Neue", Arial, sans-serif'; g.fillText('We\u2019re stronger together.', w / 2, 140); g.fillText('Join us.', w / 2, 190);
  });
  const nosm = textCanvas(128, 180, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c8352e'; g.lineWidth = 8;
    g.beginPath(); g.arc(w / 2, 70, 40, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(w / 2 - 28, 42); g.lineTo(w / 2 + 28, 98); g.stroke();
    g.fillStyle = '#c8352e'; g.font = '700 20px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('NO SMOKING', w / 2, 140); g.fillText('NO VAPING', w / 2, 165);
  });
  // on the south leg's east face, toward the passage, over the flower bed
  group.add(decal(ptsa, fa + 0.06, 1.3, -51.2, 1.6, 0.8, Math.PI / 2));
  for (const zz of [-50.0, -49.55]) group.add(decal(nosm, fa + 0.06, 1.3, zz, 0.36, 0.5, Math.PI / 2));
  const [kx, kz] = COURT.bikeRack;                       // a grey hoop rack
  W.rod('flat', [kx, 0.75, kz - 1.1], [kx, 0.75, kz + 1.1], 0.05, color('#9ea3a8'));
  for (let k = 0; k < 6; k++) { const zz = kz - 1.0 + k * 0.4; W.rod('flat', [kx - 0.3, 0.05, zz], [kx - 0.3, 0.75, zz], 0.03, color('#9ea3a8')); W.rod('flat', [kx + 0.3, 0.05, zz], [kx + 0.3, 0.75, zz], 0.03, color('#9ea3a8')); W.rod('flat', [kx - 0.3, 0.75, zz], [kx + 0.3, 0.75, zz], 0.03, color('#9ea3a8')); }
  addSegment(kx, kz - 1.1, kx, kz + 1.1, 0.35);
  // a pink crape myrtle and roses in the zig-zag planter, by the fence (IMG_2396, IMG_2398)
  crapeMyrtle(W, -32.6, -50.2, R, { h: 4.6, y: 0.45 });
  for (const [x, zz, c] of [[-31.6, -47.6, '#c8352e'], [-31.6, -46.0, '#e38aae'], [-31.7, -49.2, '#e8784e']]) roseBush(W, x, zz, R, color(c), 0.45);
}

const FEATHER = ['#a9b86a', '#b7c27a', '#9aad5e'].map(color);            // Mexican feather grass
const EUPHORBIA = ['#6f8f86', '#7b9a8f', '#62837b'].map(color);          // blue-green euphorbias
// Scatter n plants over a bed polygon (points outside it are skipped).
function bedFill(W, P, R, n, plant) {
  const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  for (let k = 0; k < n; k++) { const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0); if (inPoly(x, z, P)) plant(x, z); }
}
// A low fern: a rosette of arching fronds (leaf cards round a small core).
function fern(W, x, z, R) {
  const s = 0.55 + R() * 0.3;
  W.blob('flat', x, 0.2, z, s * 0.35, s * 0.25, s * 0.35, color('#2f5a2c'));
  cards(W, x, 0.3, z, s, s * 0.45, s, G.dark[Math.floor(R() * G.dark.length)], R, 26, 0.8, { droop: 0.4 });
}
// A ceramic totem pole (IMG_2374, IMG_2387): a thin rod threaded with glazed blocks and balls.
function totem(W, x, z, R) {
  const cols = ['#2f5fae', '#c8352e', '#e2b43b', '#f2efe6', '#3f8a5a', '#1f2a44', '#8a3b8e', '#d9772e'].map(color);
  const h = 2.2 + R() * 0.8;
  W.cyl('flat', x, 0, z, 0.02, 0.02, h + 0.3, 5, color('#3b3b3b'));
  let y = 0.3;
  while (y < h) {
    const sz = 0.14 + R() * 0.08, c = cols[Math.floor(R() * cols.length)];
    if (R() < 0.3) W.blob('flat', x, y + sz / 2, z, sz * 0.55, sz * 0.5, sz * 0.55, c);
    else W.box('flat', x, y + sz / 2, z, sz, sz, sz, c, R() * Math.PI);
    y += sz + 0.01;
  }
  W.blob('flat', x, h + 0.1, z, 0.08, 0.08, 0.08, cols[Math.floor(R() * 3)]);
  addCircle(x, z, 0.12);
}
// The flower bed on the quad side of B's entry block (layout.js B_BED): mulch at grade, the totems
// in its north end, blue-green euphorbias, feather grass, orange poppies, a red-leaf shrub, dark flax.
export function bEntryBed(W) {
  const R = rng(614), P = ensureCCW(B_BED.poly);
  W.prism('flat', P, 0, 0.07, soil, { top: true, topMat: 'flat', topCol: soil });
  for (const [x, z] of B_BED.totems) totem(W, x, z, R);
  // red-leaf trees: bigger and taller than first drawn (Ethan; IMG_2372, IMG_2374)
  const RED = [color('#8e2f33'), color('#9c3a34'), color('#7a2a33')];
  // (set clear of B's wall, the AC shaft and the totems, so no leaves cut through them)
  youngTree(W, -52.0, -20.4, R, { h: 3.6, rx: 1.0, stake: false, y: 0.07, cols: RED }); addCircle(-52.0, -20.4, 0.15);
  youngTree(W, -51.8, -16.4, R, { h: 3.3, rx: 1.0, stake: false, y: 0.07, cols: RED }); addCircle(-51.8, -16.4, 0.15);
  bedFill(W, P, R, 110, (x, z) => {
    if (B_BED.totems.some(([a, b]) => Math.hypot(a - x, b - z) < 0.45)) return;
    const r = R();
    if (r < 0.3) shrub(W, x, z, R, { y: 0.07, s: 0.8 + R() * 0.5, cols: EUPHORBIA });
    else if (r < 0.66) grassTuft(W, x, z, R, { y: 0.07, h: 0.75, cols: FEATHER });
    else if (r < 0.84) poppies(W, x, z, R);
    else if (x < -52) flax(W, x, z, R, { y: 0.07, h: 1.2 });
    else shrub(W, x, z, R, { y: 0.07, s: 0.6, cols: G.leaf });
  });
}

// A black steel picket fence from (ax, az) to (bx, bz). gates: [distance from a, width, open]:
// heavier posts either side; an open gate leaves the gap walkable.
function steelFence(W, ax, az, bx, bz, gates = [], h = 2.0) {
  const ink = color('#26282b'), L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
  const P = (d, y) => [ax + ux * d, y, az + uz * d];
  W.rod('flat', P(0, h - 0.1), P(L, h - 0.1), 0.04, ink);
  W.rod('flat', P(0, 0.14), P(L, 0.14), 0.04, ink);
  for (let d = 0.06; d < L; d += 0.12) W.rod('flat', P(d, 0.1), P(d, h), 0.014, ink);
  for (let d = 0; d <= L + 0.01; d += L / Math.max(1, Math.round(L / 2.4))) { const [x, , z] = P(d, 0); W.box('flat', x, h / 2 + 0.05, z, 0.08, h + 0.1, 0.08, ink); }
  let from = 0;
  for (const [d, w, open] of gates) {
    for (const g of [d - w / 2, d + w / 2]) { const [x, , z] = P(g, 0); W.box('flat', x, (h + 0.15) / 2, z, 0.11, h + 0.15, 0.11, ink); }
    const [lx, , lz] = P(d + w / 2 - 0.12, 0); W.box('flat', lx, 1.1, lz, 0.14, 0.22, 0.14, color('#3a3d41'));
    if (open) { if (d - w / 2 > from) addSegment(...P(from, 0).filter((_, i) => i !== 1), ...P(d - w / 2, 0).filter((_, i) => i !== 1), 0.1); from = d + w / 2; }
  }
  addSegment(...P(from, 0).filter((_, i) => i !== 1), ...P(L, 0).filter((_, i) => i !== 1), 0.1);
}
// A rose bush: a leafy mound dotted with blooms.
function roseBush(W, x, z, R, bloom, y = 0) {
  shrub(W, x, z, R, { y, s: 1.0, cols: G.leaf });
  for (let k = 0; k < 9; k++) { const a = R() * Math.PI * 2, d = R() * 0.4; W.blob('flat', x + Math.cos(a) * d, y + 0.55 + R() * 0.35, z + Math.sin(a) * d, 0.07, 0.06, 0.07, bloom); }
}
// A tree rose (a standard): a bare stem with a round, flowering head.
function treeRose(W, x, z, R, bloom) {
  W.cyl('flat', x, 0, z, 0.03, 0.025, 1.1, 5, G.bark);
  W.blob('flat', x, 1.35, z, 0.42, 0.36, 0.42, darker(G.leaf[2]));
  cards(W, x, 1.35, z, 0.55, 0.45, 0.55, G.leaf[0], R, 30, 0.6);
  for (let k = 0; k < 12; k++) { const a = R() * Math.PI * 2, e = R() * Math.PI - Math.PI / 2; W.blob('flat', x + Math.cos(a) * Math.cos(e) * 0.5, 1.35 + Math.sin(e) * 0.4, z + Math.sin(a) * Math.cos(e) * 0.5, 0.07, 0.06, 0.07, bloom); }
  addCircle(x, z, 0.1);
}
const darker = (c) => c.clone().multiplyScalar(0.62);
// A storefront on the office's east-facing front wall at x, from zS (south end) to zN (north end):
// 'f' a frosted glass bay (clear transom row, frosted middle, white panel below), 'd' a glass door,
// '|' a pier. They stretch to fit.
function frostFrontE(W, zS, zN, x, parts) {
  const want = { f: 1.2, d: 1.0, '|': 0.3 }, k = (zS - zN) / parts.reduce((a, c) => a + want[c], 0);
  const frame = color('#6b7076'), top = 3.1;
  W.slab('flat', x, zN, x + 0.06, zS, 0, top, frame);
  let z = zS;
  for (const c of parts) {
    const w = want[c] * k, a = z - 0.05, b = z - w + 0.05;          // a: the part's south edge, b: its north edge
    const q = (y0, y1, col) => W.quad('glass', [x + 0.08, y0, a], [x + 0.08, y0, b], [x + 0.08, y1, b], [x + 0.08, y1, a], col, 'auto');
    if (c === '|') W.slab('stucco', x, z - w, x + 0.2, z, 0, top, color('#efe8d6'));
    else if (c === 'f') {
      W.slab('flat', x + 0.06, b, x + 0.09, a, 0.05, 0.85, color('#f1f1ee'));
      q(0.9, 2.15, color('#dfe6ea')); q(2.25, top - 0.06, color('#ffffff'));
    } else { q(0.1, 2.3, color('#ffffff')); q(2.4, top - 0.06, color('#ffffff')); W.slab('flat', x + 0.08, a - 0.14, x + 0.12, a - 0.1, 0.9, 1.3, color('#c9ccd0')); }
    W.slab('flat', x + 0.06, z - w - 0.03, x + 0.1, z - w + 0.03, 0, top, frame);
    z -= w;
  }
}

// The beds on B's quad side south of the entry block's bed, and the benches by that bed (layout.js
// B_QUAD): crape myrtles set clear of the walls, then flax, feather grass, yellow daisies and small
// shrubs, kept off B's piers.
function bQuadBeds(W) {
  const R = rng(615);
  for (const bed of B_QUAD.beds) {
    const P = ensureCCW(bed.poly);
    W.prism('flat', P, 0, 0.07, soil, { top: true, topMat: 'flat', topCol: soil });
    for (const [x, z] of bed.trees) { crapeMyrtle(W, x, z, R, { h: 4.4, y: 0.07 }); addCircle(x, z, 0.2); }
    bedFill(W, P, R, 60, (x, z) => {
      if (x < -54.0 || bed.trees.some(([a, b]) => Math.hypot(a - x, b - z) < 0.6)) return;
      const r = R();
      if (r < 0.3) flax(W, x, z, R, { y: 0.07, h: 1.1 + R() * 0.5 });
      else if (r < 0.62) grassTuft(W, x, z, R, { y: 0.07, h: 0.75, cols: FEATHER });
      else if (r < 0.82) roseBush(W, x, z, R, color('#f2c21b'), 0.07);
      else shrub(W, x, z, R, { y: 0.07, s: 0.7, cols: G.leaf });
    });
  }
  for (const [x, z, rot] of B_QUAD.benches) bench(W, x, z, rot);
  umbrellaTable(W, ...B_QUAD.table, R);
}
