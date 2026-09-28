// Stitches painted views of the quad into the six cube faces the home page turns through (assets/js/pano.js).
// Every view was first rendered from the 3D campus with a known heading and pitch at 90 degrees, then painted over
// by an image tool. The tool zooms and nudges each one differently, so each painting is lined up with its render
// (a similarity fit, then a 9 x 9 grid of local matches), and every output pixel takes the painting that owns it.
const LD = (s) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = s; });
// Line a painting up with the render it came from. Returns a G x G grid of painting coordinates (0..1) for
// evenly spaced points of the render, so any render point can be looked up in the painting by bilinear interpolation.
const M = 256;
function gradImg(img) {
  const c = document.createElement('canvas'); c.width = c.height = M;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, M, M);
  const d = g.getImageData(0, 0, M, M).data, l = new Float32Array(M * M), o = new Float32Array(M * M);
  for (let i = 0; i < M * M; i++) l[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  for (let y = 1; y < M - 1; y++) for (let x = 1; x < M - 1; x++) {
    const i = y * M + x, gx = l[i + 1] - l[i - 1], gy = l[i + M] - l[i - M];
    o[i] = Math.sqrt(gx * gx + gy * gy);
  }
  return o;
}
window.align = async (orig, paint, sim, G = 9) => {
  const A = gradImg(await LD(orig)), B = gradImg(await LD(paint));
  const [z, ox, oy] = sim;                                   // painting uv = 0.5 + (true uv - 0.5 - o) * z
  const P = 24, R = 12;                                       // patch half size, search radius (px at 256)
  const pts = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const u = (i + 0.5) / G, v = (j + 0.5) / G;
    const pu = 0.5 + (u - 0.5 - ox) * z, pv = 0.5 + (v - 0.5 - oy) * z;
    const cx = Math.round(u * M), cy = Math.round(v * M), px = pu * M, py = pv * M;
    // NCC between render patch at (cx, cy) and painting patch (scaled by z) at (px + dx, py + dy)
    let best = [-2, 0, 0], energy = 0;
    for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) {
      let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let y = -P; y <= P; y += 2) for (let x = -P; x <= P; x += 2) {
        const ax = cx + x, ay = cy + y; if (ax < 1 || ay < 1 || ax >= M - 1 || ay >= M - 1) continue;
        const bx = Math.round(px + dx + x * z), by = Math.round(py + dy + y * z); if (bx < 1 || by < 1 || bx >= M - 1 || by >= M - 1) continue;
        const a = A[ay * M + ax], b = B[by * M + bx]; n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
      }
      if (n < 100) continue;
      const va = saa - sa * sa / n, vb = sbb - sb * sb / n; energy = va / n;
      const r = (sab - sa * sb / n) / Math.sqrt(va * vb + 1e-6);
      if (r > best[0]) best = [r, dx, dy];
    }
    pts.push({ u, v, pu, pv, r: best[0], dx: best[1] / M, dy: best[2] / M, energy });
  }
  // trust a point only where the render has structure and the match is good; smooth the offsets toward the fit
  const out = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    let sw = 0, sx = 0, sy = 0;
    for (let jj = Math.max(0, j - 1); jj <= Math.min(G - 1, j + 1); jj++) for (let ii = Math.max(0, i - 1); ii <= Math.min(G - 1, i + 1); ii++) {
      const q = pts[jj * G + ii], w = Math.max(0, q.r - 0.3) * (jj === j && ii === i ? 2 : 1);
      sw += w; sx += w * q.dx; sy += w * q.dy;
    }
    const p = pts[j * G + i], k = sw / (sw + 0.3);          // weak evidence stays near the similarity fit
    out.push({ u: p.u, v: p.v, pu: p.pu + (sw ? sx / sw : 0) * k, pv: p.pv + (sw ? sy / sw : 0) * k, r: +p.r.toFixed(2) });
  }
  return { G, sim, pts: out };
};
// render-space uv -> painting uv via the grid (bilinear, extrapolating with the similarity at the rim)
window.mapUV = (W, u, v) => {
  const G = W.G, gx = u * G - 0.5, gy = v * G - 0.5;
  const i0 = Math.max(0, Math.min(G - 2, Math.floor(gx))), j0 = Math.max(0, Math.min(G - 2, Math.floor(gy)));
  const fx = gx - i0, fy = gy - j0, P = W.pts, z = W.sim[0];
  const at = (i, j) => P[j * G + i];
  const a = at(i0, j0), b = at(i0 + 1, j0), c = at(i0, j0 + 1), d = at(i0 + 1, j0 + 1);
  // offsets relative to the similarity, interpolated (and held constant past the outer points)
  const off = (q) => [q.pu - (0.5 + (q.u - 0.5 - W.sim[1]) * z), q.pv - (0.5 + (q.v - 0.5 - W.sim[2]) * z)];
  const cx = Math.max(0, Math.min(1, fx)), cy = Math.max(0, Math.min(1, fy));
  const oa = off(a), ob = off(b), oc = off(c), od = off(d);
  const ox = (oa[0] * (1 - cx) + ob[0] * cx) * (1 - cy) + (oc[0] * (1 - cx) + od[0] * cx) * cy;
  const oy = (oa[1] * (1 - cx) + ob[1] * cx) * (1 - cy) + (oc[1] * (1 - cx) + od[1] * cx) * cy;
  return [0.5 + (u - 0.5 - W.sim[1]) * z + ox, 0.5 + (v - 0.5 - W.sim[2]) * z + oy];
};
// draw the painting pulled into the render's framing (transparent where the painting has nothing)
window.unwarp = async (paint, W, size = 1024) => {
  const img = await LD(paint), sc = document.createElement('canvas'); sc.width = img.width; sc.height = img.height;
  const sg = sc.getContext('2d'); sg.drawImage(img, 0, 0); const src = sg.getImageData(0, 0, img.width, img.height).data;
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), o = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [pu, pv] = mapUV(W, (x + 0.5) / size, (y + 0.5) / size);
    if (pu < 0 || pv < 0 || pu >= 1 || pv >= 1) continue;
    const sx = Math.floor(pu * img.width), sy = Math.floor(pv * img.height), si = (sy * img.width + sx) * 4, di = (y * size + x) * 4;
    o.data[di] = src[si]; o.data[di + 1] = src[si + 1]; o.data[di + 2] = src[si + 2]; o.data[di + 3] = 255;
  }
  g.putImageData(o, 0, 0); return c;
};
// Stitch painted views into the six cube faces pano.js reads. Every view was rendered from the campus with a known
// heading and pitch at 90 degrees; each painting is lined up with its render (fit + align), then each output pixel
// takes the painting whose view points closest to it. Colour blends over a wide band, detail over a narrow one.
async function fitPair(ou, cu) {
  const N = 160, gradN = (img) => {
    const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); g.drawImage(img, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data, l = new Float32Array(N * N), o = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) l[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { const i = y * N + x, gx = l[i + 1] - l[i - 1], gy = l[i + N] - l[i - N]; o[i] = Math.sqrt(gx * gx + gy * gy); }
    return o;
  };
  const o = gradN(await LD(ou)), k = gradN(await LD(cu));
  const samp = (u, v) => { const x = Math.round(u * N), y = Math.round(v * N); return x < 1 || y < 1 || x >= N - 1 || y >= N - 1 ? null : o[y * N + x]; };
  const score = (s, ox, oy) => {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let y = 2; y < N - 2; y += 2) for (let x = 2; x < N - 2; x += 2) {
      const a = samp(0.5 + (x / N - 0.5) / s + ox, 0.5 + (y / N - 0.5) / s + oy); if (a === null) continue;
      const b = k[y * N + x]; n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    }
    return n < 500 ? -1 : (sab - sa * sb / n) / Math.sqrt((saa - sa * sa / n) * (sbb - sb * sb / n) + 1e-9);
  };
  let best = [-1];
  for (let s = 0.8; s <= 1.9; s += 0.02) for (let ox = -0.2; ox <= 0.2; ox += 0.01) for (let oy = -0.2; oy <= 0.2; oy += 0.01) { const r = score(s, ox, oy); if (r > best[0]) best = [r, s, ox, oy]; }
  const [, s0, x0, y0] = best;
  for (let s = s0 - 0.02; s <= s0 + 0.02; s += 0.004) for (let ox = x0 - 0.01; ox <= x0 + 0.01; ox += 0.002) for (let oy = y0 - 0.01; oy <= y0 + 0.01; oy += 0.002) { const r = score(s, ox, oy); if (r > best[0]) best = [r, s, ox, oy]; }
  return { corr: best[0], sim: [best[1], best[2], best[3]], ident: score(1, 0, 0) };
}
const D2R = Math.PI / 180;
function basis(headingDeg, pitchDeg) {                   // campus camera: yaw = -heading, forward -Z at yaw 0
  const y = -headingDeg * D2R, p = pitchDeg * D2R, sy = Math.sin(y), cy = Math.cos(y), sp = Math.sin(p), cp = Math.cos(p);
  return { f: [-sy * cp, sp, -cy * cp], r: [cy, 0, -sy], u: [sy * sp, cp, cy * sp] };
}
const Q = 128;
async function prepView(v) {
  const img = await LD(v.src), w = img.width, h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h; let g = c.getContext('2d'); g.drawImage(img, 0, 0);
  if (v.patch) v.patch(g, w, h);
  let src = c, W = w, H = h;
  // small paintings (about 1080 px) look soft next to the 2000 px ones: upscale well, then sharpen the ink a little
  if (w < 1600) {
    const k = 2000 / w; W = Math.round(w * k); H = Math.round(h * k);
    const up = document.createElement('canvas'); up.width = W; up.height = H; const ug = up.getContext('2d');
    ug.imageSmoothingEnabled = true; ug.imageSmoothingQuality = 'high'; ug.drawImage(c, 0, 0, W, H);
    const bl = document.createElement('canvas'); bl.width = W; bl.height = H; const bg = bl.getContext('2d');
    bg.filter = `blur(${v.sharpR || 1.6}px)`; bg.drawImage(up, 0, 0);
    const a = ug.getImageData(0, 0, W, H), b = bg.getImageData(0, 0, W, H).data, amt = v.sharpA ?? 0.9;
    for (let i = 0; i < a.data.length; i += 4) for (let j = 0; j < 3; j++) a.data[i + j] = a.data[i + j] + amt * (a.data[i + j] - b[i + j]);
    ug.putImageData(a, 0, 0); src = up; g = ug;
  }
  v.px = g.getImageData(0, 0, W, H).data; v.w = W; v.h = H;
  const L = 48, lc = document.createElement('canvas'); lc.width = lc.height = L; const lg = lc.getContext('2d'); lg.imageSmoothingQuality = 'high'; lg.drawImage(src, 0, 0, L, L);
  // blur the tiny copy a little more so the colour layer carries no detail
  lg.filter = 'blur(2px)'; lg.drawImage(lc, 0, 0); v.lo = lg.getImageData(0, 0, L, L).data; v.L = L;
  v.B = basis(v.h0, v.p0);
  v.map = new Float32Array((Q + 1) * (Q + 1) * 2);
  if (v.orig) {
    const f = await fitPair(v.orig, v.src); v.fit = f;
    const W = await align(v.orig, v.src, f.sim, 9); v.W = W;
    for (let j = 0; j <= Q; j++) for (let i = 0; i <= Q; i++) { const m = mapUV(W, i / Q, j / Q), k = (j * (Q + 1) + i) * 2; v.map[k] = m[0]; v.map[k + 1] = m[1]; }
  } else for (let j = 0; j <= Q; j++) for (let i = 0; i <= Q; i++) { const k = (j * (Q + 1) + i) * 2; v.map[k] = i / Q; v.map[k + 1] = j / Q; }
  v.W0 = v.W ? v.W.sim[0] : 1;
  return v;
}
function lookup(v, tu, tv, out) {                        // true uv -> painting uv
  const gx = Math.min(Q - 1e-6, Math.max(0, tu * Q)), gy = Math.min(Q - 1e-6, Math.max(0, tv * Q));
  const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, m = v.map, a = (j * (Q + 1) + i) * 2, b = a + 2, c = a + (Q + 1) * 2, d = c + 2;
  out[0] = (m[a] * (1 - fx) + m[b] * fx) * (1 - fy) + (m[c] * (1 - fx) + m[d] * fx) * fy;
  out[1] = (m[a + 1] * (1 - fx) + m[b + 1] * fx) * (1 - fy) + (m[c + 1] * (1 - fx) + m[d + 1] * fx) * fy;
}
function bil(px, w, h, u, v, out) {
  const x = Math.min(w - 1.001, Math.max(0, u * w - 0.5)), y = Math.min(h - 1.001, Math.max(0, v * h - 0.5));
  const i = x | 0, j = y | 0, fx = x - i, fy = y - j, a = (j * w + i) * 4, b = a + 4, c = a + w * 4, d = c + 4;
  for (let k = 0; k < 3; k++) out[k] = (px[a + k] * (1 - fx) + px[b + k] * fx) * (1 - fy) + (px[c + k] * (1 - fx) + px[d + k] * fx) * fy;
}
const TAU = 0.35;
const FACE_DIRS = { n: [0, 0], e: [90, 0], s: [180, 0], w: [270, 0], u: [0, 90], d: [0, -90] };
window.stitchFace = (views, face, S = 2048, kn = 260, kw = 24) => {
  const B = basis(...FACE_DIRS[face]), c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), o = g.createImageData(S, S), od = o.data;
  const pu = [0, 0], I = [0, 0, 0], Lc = [0, 0, 0];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = 2 * (x + 0.5) / S - 1, b = 1 - 2 * (y + 0.5) / S;
    let dx = B.f[0] + a * B.r[0] + b * B.u[0], dy = B.f[1] + a * B.r[1] + b * B.u[1], dz = B.f[2] + a * B.r[2] + b * B.u[2];
    const n = Math.hypot(dx, dy, dz); dx /= n; dy /= n; dz /= n;
    let sn0 = 0, hr0 = 0, hg0 = 0, hb0 = 0, sw = 0, sn = 0, lr = 0, lg2 = 0, lb = 0, hr = 0, hg = 0, hb = 0, conf = 0, fw = 0, fr = 0, fg = 0, fb = 0;
    for (const v of views) {
      const zc = dx * v.B.f[0] + dy * v.B.f[1] + dz * v.B.f[2]; if (zc < 0.45) continue;
      const tu = 0.5 + 0.5 * (dx * v.B.r[0] + dy * v.B.r[1] + dz * v.B.r[2]) / zc;
      const tv = 0.5 - 0.5 * (dx * v.B.u[0] + dy * v.B.u[1] + dz * v.B.u[2]) / zc;
      if (tu < -0.3 || tv < -0.3 || tu > 1.3 || tv > 1.3) continue;
      lookup(v, Math.min(1, Math.max(0, tu)), Math.min(1, Math.max(0, tv)), pu);
      // outside the render too: carry on in the direction we left it, so the gap fill knows how far out it is
      if (tu < 0) pu[0] += tu * v.W0; else if (tu > 1) pu[0] += (tu - 1) * v.W0;
      if (tv < 0) pu[1] += tv * v.W0; else if (tv > 1) pu[1] += (tv - 1) * v.W0;
      const m = Math.min(pu[0], pu[1], 1 - pu[0], 1 - pu[1]);
      // gap fill: the colour layer at the nearest point of each painting, fading with distance outside it
      const ww = Math.exp(kw * (zc - 1));
      const out = Math.max(0, -m), fwt = ww * Math.exp(-out / 0.04);
      bil(v.lo, v.L, v.L, Math.min(1, Math.max(0, pu[0])), Math.min(1, Math.max(0, pu[1])), Lc);
      fw += fwt; fr += fwt * Lc[0]; fg += fwt * Lc[1]; fb += fwt * Lc[2];
      if (m <= 0) continue;
      const t = Math.min(1, m / 0.03), e = t * t * (3 - 2 * t);
      conf = Math.max(conf, Math.min(1, m / 0.05));
      bil(v.px, v.w, v.h, pu[0], pu[1], I);
      const wn0 = e * Math.exp(kn * (zc - 1)), we = e * ww;
      let wn = wn0;
      if (window.SEAMS && v.p0 === 0) {
        // side views share the ring by the seams alone; against up and down only the elevation counts
        const ph = Math.asin(Math.max(-1, Math.min(1, dy))) / D2R, th = Math.atan2(dx, -dz) / D2R;
        const lo = seamAt(SEAMS[(v.si + SEAMS.length - 1) % SEAMS.length], ph), hi = seamAt(SEAMS[v.si], ph);
        // sharp seams on the ground, where the path was chosen; a soft wide blend in the watercolour sky
        const t2 = Math.min(1, Math.max(0, (ph - 4) / 10)), tau = TAU + (3.2 - TAU) * t2 * t2 * (3 - 2 * t2);
        const sg = (x) => 1 / (1 + Math.exp(-x / tau));
        wn = e * sg(wrap(th - lo)) * sg(wrap(hi - th)) * Math.exp(kn * (Math.cos(ph * D2R) - 1));
      }
      sn0 += wn0; hr0 += wn0 * (I[0] - Lc[0]); hg0 += wn0 * (I[1] - Lc[1]); hb0 += wn0 * (I[2] - Lc[2]);
      sw += we; lr += we * Lc[0]; lg2 += we * Lc[1]; lb += we * Lc[2];
      sn += wn; hr += wn * (I[0] - Lc[0]); hg += wn * (I[1] - Lc[1]); hb += wn * (I[2] - Lc[2]);
    }
    const k = (y * S + x) * 4, F = fw > 0 ? [fr / fw, fg / fw, fb / fw] : [200, 180, 160];
    // a seam mask can leave nobody in charge where the owner doesn't reach: fall back to plain angular weights
    if (sn < 1e-9 * sn0) { sn = sn0; hr = hr0; hg = hg0; hb = hb0; }
    if (sw > 0 && sn > 0) {
      const q = conf * conf * (3 - 2 * conf), R = [lr / sw + hr / sn, lg2 / sw + hg / sn, lb / sw + hb / sn];
      for (let j = 0; j < 3; j++) od[k + j] = F[j] + (R[j] - F[j]) * q;
    } else for (let j = 0; j < 3; j++) od[k + j] = F[j];
    od[k + 3] = 255;
  }
  g.putImageData(o, 0, 0); return c;
};
window.saveCanvas = async (c, name, type = 'image/png', q) => {
  const blob = await new Promise((r) => c.toBlob(r, type, q));
  await fetch('http://127.0.0.1:8799/' + name, { method: 'POST', body: blob }); return name + ':' + Math.round(blob.size / 1024) + 'k';
};
// Seams between neighbouring side views: instead of a straight cut halfway between them, find the top-to-bottom path
// (within +-SPAN degrees) where the two paintings differ least, so a tree one painting drew wider isn't sliced off.
const SPAN = 15, DT = 0.1, PHI0 = 50, DP = 0.25;
function sampleView(v, dx, dy, dz, I, Lc, pu) {
  const zc = dx * v.B.f[0] + dy * v.B.f[1] + dz * v.B.f[2]; if (zc < 0.3) return -1;
  const tu = 0.5 + 0.5 * (dx * v.B.r[0] + dy * v.B.r[1] + dz * v.B.r[2]) / zc, tv = 0.5 - 0.5 * (dx * v.B.u[0] + dy * v.B.u[1] + dz * v.B.u[2]) / zc;
  if (tu < 0 || tv < 0 || tu > 1 || tv > 1) return -1;
  lookup(v, tu, tv, pu); const m = Math.min(pu[0], pu[1], 1 - pu[0], 1 - pu[1]); if (m <= 0.01) return -1;
  bil(v.px, v.w, v.h, pu[0], pu[1], I); bil(v.lo, v.L, v.L, pu[0], pu[1], Lc); return m;
}
window.computeSeams = (views) => {
  const side = views.filter((v) => v.p0 === 0).sort((a, b) => a.h0 - b.h0), seams = [];
  const C = Math.round(2 * SPAN / DT) + 1, R = Math.round(2 * PHI0 / DP) + 1, I1 = [0, 0, 0], L1 = [0, 0, 0], I2 = [0, 0, 0], L2 = [0, 0, 0], pu = [0, 0];
  for (let k = 0; k < side.length; k++) {
    const A = side[k], Bv = side[(k + 1) % side.length], mid = A.h0 + 22.5;
    const cost = new Float32Array(R * C);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const th = (mid - SPAN + c * DT) * D2R, ph = (PHI0 - r * DP) * D2R;
      const dx = Math.sin(th) * Math.cos(ph), dy = Math.sin(ph), dz = -Math.cos(th) * Math.cos(ph);
      const ma = sampleView(A, dx, dy, dz, I1, L1, pu), mb = sampleView(Bv, dx, dy, dz, I2, L2, pu);
      let e = 0;
      if (ma < 0 || mb < 0) e = 60; else for (let j = 0; j < 3; j++) e += Math.abs((I1[j] - L1[j]) - (I2[j] - L2[j])) / 3 + Math.abs(L1[j] - L2[j]) / 12;
      cost[r * C + c] = e + 0.3 * Math.abs(c * DT - SPAN);
    }
    // blur the cost a little so the path doesn't thread between single pixels
    const cb = new Float32Array(R * C);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { let s = 0, n = 0; for (let y = Math.max(0, r - 2); y <= Math.min(R - 1, r + 2); y++) for (let x = Math.max(0, c - 3); x <= Math.min(C - 1, c + 3); x++) { s += cost[y * C + x]; n++; } cb[r * C + c] = s / n; }
    const acc = new Float32Array(R * C), from = new Int16Array(R * C);
    for (let c = 0; c < C; c++) acc[c] = cb[c];
    for (let r = 1; r < R; r++) for (let c = 0; c < C; c++) {
      let best = 1e30, bc = c;
      for (let d = -3; d <= 3; d++) { const cc = c + d; if (cc < 0 || cc >= C) continue; const v = acc[(r - 1) * C + cc] + 0.8 * Math.abs(d); if (v < best) { best = v; bc = cc; } }
      acc[r * C + c] = best + cb[r * C + c]; from[r * C + c] = bc;
    }
    let c = 0; for (let x = 1; x < C; x++) if (acc[(R - 1) * C + x] < acc[(R - 1) * C + c]) c = x;
    const off = new Float32Array(R);
    for (let r = R - 1; r >= 0; r--) { off[r] = c * DT - SPAN; c = from[r * C + c]; }
    const sm = new Float32Array(R); for (let r = 0; r < R; r++) { let s = 0, n = 0; for (let y = Math.max(0, r - 4); y <= Math.min(R - 1, r + 4); y++) { s += off[y]; n++; } sm[r] = s / n; }
    A.si = k; seams.push({ a: A.name, b: Bv.name, mid, off: sm });
  }
  return seams;
};
const wrap = (x) => ((x + 540) % 360) - 180;                // to -180..180
window.seamAt = (s, phDeg) => { const r = Math.min(Math.round(2 * PHI0 / DP), Math.max(0, Math.round((PHI0 - phDeg) / DP))); return s.mid + s.off[r]; };
