// The Orrery: the bounty board as a star system, ported from the BountyBoard
// app. A hand-rolled 3D camera on a plain 2D canvas, no WebGL, no libraries.
//
//   Orbit radius   = rank. S rides the innermost ring, D the outermost.
//   Body size      = effort (S ~30 min … L ~5+ hrs).
//   Ring on a body = someone on the team has claimed it.
//   Moons          = the people working on it, one each (yours is gold).
//   Burning trail  = overdue. A breathing outline = due today.
//   The belt       = completed bounties, between rings B and C.
//   Lines          = bounties in the same track.
//
// Click a body to lock it: the camera flies in and the readout slides in on
// the right with the brief and the actions. Admins can also drag a body onto
// another ring to re-rank it. Always dark, whatever the site theme: it is space.
//
// The backdrop is a real photograph: ESO's 360° Milky Way panorama
// (assets/img/sky.jpg), sampled by view direction and rotated to the galactic
// pole. ESO require the credit "ESO/S. Brunier" to be visible whenever it is
// shown, so the Orrery shows it in the lower right. Do not remove it. The image
// is only fetched once someone opens the Orrery; until it arrives (or if it
// fails, or Photo sky is off) the drawn sky below stands in.
//
// Left out on purpose from the personal app: comets (bounties here don't
// repeat) and the black hole (deleting is an admin decision made in the editor).

import { esc, root, lessMotion } from './ui.js';

const ORB = {
  ring: { S: 54, A: 88, B: 146, C: 300, D: 492 },
  inc:  { S: 0.10, A: -0.17, B: 0.24, C: -0.14, D: 0.21, belt: 0.07 },
  node: { S: 0.0, A: 1.95, B: 3.40, C: 5.10, D: 2.35, belt: 2.60 },
  belt: { inner: 178, outer: 270, thickness: 15 },
  sun: 17,
};
const RANK_KEYS = ['S', 'A', 'B', 'C', 'D'];
const RANK_LABEL = { S: 'critical', A: 'high', B: 'normal', C: 'low', D: 'whenever' };
const RANK_W = { S: 0, A: 1, B: 2, C: 3, D: 4 };
const CAM_HOME = { yaw: -1.05, pitch: 0.50, dist: 830, tx: 0, ty: 0, tz: 0, ox: 0, oy: 0 };
const TAU = Math.PI * 2;
const SKY_R = 20000;
const CORE_TH = 1.15;
const OPTS_KEY = 'wilkipedia-orrery';
const MOON_SPEED = 0.26;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hash01 = (str) => {                 // stable per-id pseudo-random in [0,1)
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
};
const _rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => { const [r, g, b] = _rgb(hex); return `rgba(${r},${g},${b},${a})`; };
function mix(hex, to, t) {
  const a = _rgb(hex), b = _rgb(to);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
const sizeFromMins = (m) => clamp(1.8 + 1.615 * Math.log10(Math.max(5, m) / 15), 1.6, 5.6);

function tiltOff(inc, nod, dx, dz, out = {}) {
  const y1 = -dz * Math.sin(inc), z1 = dz * Math.cos(inc);
  const cn = Math.cos(nod), sn = Math.sin(nod);
  out.x = dx * cn + z1 * sn; out.y = y1; out.z = -dx * sn + z1 * cn;
  return out;
}
const planeOff = (rk, dx, dz, out) => tiltOff(ORB.inc[rk] || 0, ORB.node[rk] || 0, dx, dz, out);
const orbPoint = (rk, R, a, out) => planeOff(rk, Math.cos(a) * R, Math.sin(a) * R, out);
const orrSpeed = (R) => 0.30 / Math.pow(R / ORB.ring.S, 1.5);

const DETAIL = `
  <button class="od-close" type="button" aria-label="Close">✕</button>
  <div class="od-kicker hud-l"></div>
  <div class="od-head"><div class="od-rank"></div><h3 class="od-title"></h3></div>
  <div class="od-sub hud-l"></div>
  <div class="od-rows"></div>
  <div class="od-sec" data-sec="get"><div class="od-h hud-l">You get</div><p class="od-p"></p></div>
  <div class="od-sec" data-sec="done"><div class="od-h hud-l">Done means</div><p class="od-p"></p></div>
  <div class="od-sec" data-sec="links"><div class="od-h hud-l">Page</div><div class="od-links"></div></div>
  <div class="od-acts"></div>`;

/**
 * wrap:     the .orr-wrap element (holds canvas, bar, hint, tip, detail)
 * actions:  (t) => [{ act, label, go }]   buttons for the target panel
 * onAction: (act, id) => void
 * canDrag:  () => boolean                  admins re-rank by dragging
 * onRerank: (id, rank) => Promise
 */
export function createOrrery({ wrap, actions, onAction, canDrag, onRerank }) {
  const cv = wrap.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const detail = wrap.querySelector('.orr-detail');
  const tip = wrap.querySelector('.orr-tip');
  const credit = wrap.querySelector('.orr-credit');
  detail.innerHTML = DETAIL;
  const q = (sel) => detail.querySelector(sel);

  let items = [];
  let opts = { motion: !lessMotion(), labels: true, belt: true, photo: true, lines: 'linked' };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(OPTS_KEY)) || {}); } catch { /* storage blocked */ }
  const saveOpts = () => { try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch { /* ignore */ } };

  const cam = { ...CAM_HOME }, goal = { ...CAM_HOME };
  const CAMB = { eye: { x: 0, y: 0, z: 0 }, r: { x: 0, y: 0, z: 0 }, u: { x: 0, y: 0, z: 0 }, f: { x: 0, y: 0, z: 0 }, focal: 0 };
  const orr = { raf: 0, last: 0, clock: 0, dpr: 1, w: 0, h: 0, pos: [], stars: [], galaxy: [], glow: [], dust: [],
                bg: null, bgc: null, bgKey: null, hover: null, focus: null, drag: null, orbiting: null, panning: null,
                dropRank: null, dirty: true, preFocus: null, camRate: 6, running: false, theme: {} };
  const dirty = () => { orr.dirty = true; };
  const byId = (id) => items.find((t) => t.id === id);

  function readTheme() {
    const cs = getComputedStyle(wrap), g = (n) => cs.getPropertyValue(n).trim();
    orr.theme = { hud: g('--hud'), dim: g('--hud-dim'), void: g('--void'), bad: g('--bad-hud'), sig: g('--sig'),
                  on: g('--pane-on'),
                  rank: { S: g('--pl-S'), A: g('--pl-A'), B: g('--pl-B'), C: g('--pl-C'), D: g('--pl-D') } };
  }
  const rankHex = (r) => orr.theme.rank[r] || '#8fa3b0';

  // ── camera ──
  const focalLen = () => Math.min(orr.h * 1.05, orr.w * 0.78);
  function camUpdate() {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const e = CAMB.eye;
    e.x = cam.tx + cam.dist * cp * cy; e.y = cam.ty + cam.dist * sp; e.z = cam.tz + cam.dist * cp * sy;
    let fx = cam.tx - e.x, fy = cam.ty - e.y, fz = cam.tz - e.z;
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    CAMB.f.x = fx; CAMB.f.y = fy; CAMB.f.z = fz;
    let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    CAMB.r.x = rx; CAMB.r.y = 0; CAMB.r.z = rz;
    CAMB.u.x = -rz * fy; CAMB.u.y = rz * fx - rx * fz; CAMB.u.z = rx * fy;
    CAMB.focal = focalLen();
  }
  const KEYS = ['tx', 'ty', 'tz', 'dist', 'ox', 'oy', 'pitch', 'yaw'];
  function camStep(dt) { const f = 1 - Math.exp(-dt * orr.camRate); for (const k of KEYS) cam[k] += (goal[k] - cam[k]) * f; }
  const camSettled = () => KEYS.every((k) => Math.abs(goal[k] - cam[k]) < 0.02);
  function proj(x, y, z, out = {}) {
    const dx = x - CAMB.eye.x, dy = y - CAMB.eye.y, dz = z - CAMB.eye.z;
    const vz = dx * CAMB.f.x + dy * CAMB.f.y + dz * CAMB.f.z;
    if (vz < 4) return null;
    const vx = dx * CAMB.r.x + dy * CAMB.r.y + dz * CAMB.r.z;
    const vy = dx * CAMB.u.x + dy * CAMB.u.y + dz * CAMB.u.z;
    const k = CAMB.focal / vz;
    out.x = orr.w / 2 + cam.ox + vx * k; out.y = orr.h / 2 + cam.oy - vy * k; out.z = vz; out.k = k;
    return out;
  }
  // Which point on which ring is nearest the cursor on screen (stable at every camera angle)
  const _sp = {}, _sq = {};
  function snapToRing(sx, sy) {
    let bestRk = null, bestA = 0, bestD = Infinity;
    for (const rk of RANK_KEYS) {
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        orbPoint(rk, ORB.ring[rk], a, _sq);
        if (!proj(_sq.x, _sq.y, _sq.z, _sp)) continue;
        const d = (_sp.x - sx) ** 2 + (_sp.y - sy) ** 2;
        if (d < bestD) { bestD = d; bestRk = rk; bestA = a; }
      }
    }
    if (!bestRk) return null;
    let step = TAU / 48;
    for (let it = 0; it < 14; it++) {
      step *= 0.5;
      for (const s of [-step, step]) {
        orbPoint(bestRk, ORB.ring[bestRk], bestA + s, _sq);
        if (!proj(_sq.x, _sq.y, _sq.z, _sp)) continue;
        const d = (_sp.x - sx) ** 2 + (_sp.y - sy) ** 2;
        if (d < bestD) { bestD = d; bestA += s; }
      }
    }
    return { rk: bestRk, a: bestA };
  }

  // ── the sky: 3D points on a distant shell, with a tilted galactic band ──
  function buildSky() {
    const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const N = nrm([0.30, 0.90, 0.31]);
    const U = nrm(cross([0, 1, 0], N)), V = cross(N, U);
    orr.gal = { N, U, V };                      // the photo is sampled in this frame
    const onBand = (th, beta) => {
      const cb = Math.cos(beta), sb = Math.sin(beta);
      return { x: SKY_R * (cb * Math.cos(th) * U[0] + cb * Math.sin(th) * V[0] + sb * N[0]),
               y: SKY_R * (cb * Math.cos(th) * U[1] + cb * Math.sin(th) * V[1] + sb * N[1]),
               z: SKY_R * (cb * Math.cos(th) * U[2] + cb * Math.sin(th) * V[2] + sb * N[2]) };
    };
    const g3 = (k) => (hash01(k + 'a') + hash01(k + 'b') + hash01(k + 'c')) / 3 - 0.5;
    const wrapA = (d) => { while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
    const coreW = (th) => Math.exp(-(wrapA(th - CORE_TH) ** 2) / (2 * 1.05 * 1.05));
    for (let i = 0; i < 420; i++) {
      const u = hash01('u' + i) * 2 - 1, th = hash01('t' + i) * TAU, sn = Math.sqrt(1 - u * u);
      orr.stars.push({ x: SKY_R * sn * Math.cos(th), y: SKY_R * u, z: SKY_R * sn * Math.sin(th), b: 0.06 + hash01('b' + i) * 0.30 });
    }
    for (let i = 0; i < 2600; i++) {
      const th = hash01('gs' + i) < 0.6 ? CORE_TH + g3('gc' + i) * 2.6 : hash01('gt' + i) * TAU;
      const cw = coreW(th), sigma = 0.050 + 0.085 * cw, beta = g3('gb' + i) * sigma * 3;
      const p = onBand(th, beta);
      p.b = (0.06 + hash01('gv' + i) * 0.36) * (0.25 + 0.85 * Math.exp(-(beta * beta) / (2 * sigma * sigma))) * (0.55 + 0.75 * cw);
      p.w = hash01('gw' + i) > 0.986 ? 1.5 : 1;
      p.warm = hash01('gc2' + i) < (0.25 + 0.5 * cw);
      orr.galaxy.push(p);
    }
    for (let i = 0; i < 5; i++) {
      const p = onBand(CORE_TH + g3('kt' + i) * 0.55, g3('kb' + i) * 0.10);
      p.a = 0.075 + hash01('ka' + i) * 0.065; p.r = 0.32 + hash01('kr' + i) * 0.30; p.warm = true; orr.glow.push(p);
    }
    for (let i = 0; i < 76; i++) {
      const th = (i / 76) * TAU + hash01('lo' + i) * 0.07, cw = coreW(th);
      const p = onBand(th, g3('lb' + i) * 0.13);
      p.a = (0.032 + hash01('la' + i) * 0.062) * (0.45 + 0.95 * cw); p.r = 0.105 + hash01('lr' + i) * 0.165;
      p.warm = hash01('lc' + i) < (0.2 + 0.6 * cw); orr.glow.push(p);
    }
    for (let i = 0; i < 70; i++) {
      const th = (i / 70) * TAU + hash01('do' + i) * 0.05, cw = coreW(th);
      const beta = Math.sin(th * 2.3 + 1.1) * 0.030 + Math.sin(th * 5.7) * 0.014 + g3('db' + i) * 0.020;
      const p = onBand(th, beta);
      p.a = (0.030 + hash01('da' + i) * 0.080) * (0.35 + cw); p.r = 0.038 + hash01('dr' + i) * 0.075;
      orr.dust.push(p);
    }
  }
  // ── the photographic backdrop ──
  // Work out where the camera looks in galactic coordinates, cut that window out
  // of the equirectangular panorama, and rotate it by the roll of the galactic
  // pole on screen. Moves correctly as you fly, with no WebGL.
  const skyImg = new Image();
  let skyReady = false;
  function loadPhoto() {
    if (skyImg.src) return;
    skyImg.onload = () => { skyReady = true; orr.bgKey = null; paintMenu(); dirty(); };
    skyImg.onerror = () => { skyReady = false; };
    skyImg.src = root + 'assets/img/sky.jpg';
  }
  const usePhoto = () => skyReady && opts.photo;
  function drawWrapped(c, img, sx, sy, ss, dx, dy, ds) {
    const W = img.width, x = ((sx % W) + W) % W;
    if (x + ss <= W) { c.drawImage(img, x, sy, ss, ss, dx, dy, ds, ds); return; }
    const first = W - x, f = first / ss;
    c.drawImage(img, x, sy, first, ss, dx, dy, ds * f, ds);
    c.drawImage(img, 0, sy, ss - first, ss, dx + ds * f, dy, ds * (1 - f), ds);
  }
  function drawPhoto(c) {
    const W = skyImg.width, H = skyImg.height;
    const { N, U, V } = orr.gal, f = CAMB.f, r = CAMB.r, u = CAMB.u;
    const dot = (a, b) => a[0] * b.x + a[1] * b.y + a[2] * b.z;
    const beta = Math.asin(clamp(dot(N, f), -1, 1));            // galactic latitude
    const lam = Math.atan2(dot(V, f), dot(U, f));               // galactic longitude
    const roll = Math.atan2(dot(N, r), dot(N, u));              // pole's tilt on screen
    const D = Math.hypot(orr.w, orr.h) * 1.06;                  // covers the rotation
    const ss = (D / CAMB.focal) * (H / Math.PI);                // isotropic for a 2:1 map
    const cx = (lam / TAU + 0.5) * W;
    const cy = clamp((0.5 - beta / Math.PI) * H, ss / 2, H - ss / 2);
    c.save(); c.translate(orr.w / 2, orr.h / 2); c.rotate(roll);
    drawWrapped(c, skyImg, cx - ss / 2, cy - ss / 2, ss, -D / 2, -D / 2, D);
    c.restore();
    c.fillStyle = 'rgba(4,7,13,.52)';                           // hold it back so bodies and labels read
    c.fillRect(0, 0, orr.w, orr.h);
  }

  const skyKey = () => `${orr.w}|${orr.h}|${cam.yaw}|${cam.pitch}|${cam.dist}|${cam.tx}|${cam.ty}|${cam.tz}|${cam.ox}|${cam.oy}|${usePhoto()}`;
  function drawSky() {
    const c = orr.bgc;
    c.setTransform(orr.dpr, 0, 0, orr.dpr, 0, 0);
    c.fillStyle = orr.theme.void; c.fillRect(0, 0, orr.w, orr.h);
    credit.hidden = !usePhoto();                                // ESO require a visible credit
    if (usePhoto()) { drawPhoto(c); orr.bgKey = skyKey(); return; }
    const n1 = c.createRadialGradient(orr.w * 0.2, orr.h * 0.16, 0, orr.w * 0.2, orr.h * 0.16, orr.w * 0.72);
    n1.addColorStop(0, 'rgba(38,78,132,.15)'); n1.addColorStop(1, 'rgba(38,78,132,0)');
    c.fillStyle = n1; c.fillRect(0, 0, orr.w, orr.h);
    const n2 = c.createRadialGradient(orr.w * 0.84, orr.h * 0.88, 0, orr.w * 0.84, orr.h * 0.88, orr.w * 0.6);
    n2.addColorStop(0, 'rgba(104,54,132,.12)'); n2.addColorStop(1, 'rgba(104,54,132,0)');
    c.fillStyle = n2; c.fillRect(0, 0, orr.w, orr.h);
    const blob = (p0, a0, a1, a2) => {
      const p = proj(p0.x, p0.y, p0.z); if (!p) return;
      const rad = CAMB.focal * p0.r;
      if (p.x < -rad || p.y < -rad || p.x > orr.w + rad || p.y > orr.h + rad) return;
      const grd = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
      grd.addColorStop(0, a0); grd.addColorStop(0.5, a1); grd.addColorStop(1, a2);
      c.fillStyle = grd; c.beginPath(); c.arc(p.x, p.y, rad, 0, TAU); c.fill();
    };
    c.globalCompositeOperation = 'lighter';
    for (const g of orr.glow) {
      const col = g.warm ? '255,228,196' : '186,206,255';
      blob(g, `rgba(${col},${g.a})`, `rgba(${col},${g.a * 0.30})`, `rgba(${col},0)`);
    }
    c.globalCompositeOperation = 'source-over';
    const vd = _rgb(orr.theme.void).join(',');
    for (const d of orr.dust) blob(d, `rgba(${vd},${d.a})`, `rgba(${vd},${d.a * 0.55})`, `rgba(${vd},0)`);
    for (const st of orr.galaxy) {
      const p = proj(st.x, st.y, st.z); if (!p || p.x < 0 || p.y < 0 || p.x > orr.w || p.y > orr.h) continue;
      c.globalAlpha = st.b; c.fillStyle = st.warm ? '#ffeeda' : '#e2ecff'; c.fillRect(p.x, p.y, st.w, st.w);
    }
    for (const st of orr.stars) {
      const p = proj(st.x, st.y, st.z); if (!p || p.x < 0 || p.y < 0 || p.x > orr.w || p.y > orr.h) continue;
      c.globalAlpha = st.b * 0.8; c.fillStyle = '#e6f0ff'; c.fillRect(p.x, p.y, 1, 1);
    }
    c.globalAlpha = 1;
    orr.bgKey = skyKey();
  }

  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    orr.dpr = Math.min(window.devicePixelRatio || 1, 2);
    orr.w = r.width; orr.h = r.height;
    cv.width = Math.round(r.width * orr.dpr); cv.height = Math.round(r.height * orr.dpr);
    ctx.setTransform(orr.dpr, 0, 0, orr.dpr, 0, 0);
    if (!orr.bg) { orr.bg = document.createElement('canvas'); orr.bgc = orr.bg.getContext('2d'); }
    orr.bg.width = cv.width; orr.bg.height = cv.height;
    orr.bgKey = null;
    readTheme();
    if (orr.focus) focusCamera(orr.focus);
  }

  // ── layout ──
  const baseAngle = (t) => hash01(t.id + 'orb') * TAU;
  const beltRadius = (t) => ORB.belt.inner + (ORB.belt.outer - ORB.belt.inner) * hash01(t.id + 'br');
  const beltLift = (t) => (hash01(t.id + 'bl') - 0.5) * ORB.belt.thickness;
  const bodySize = (t) => (t.status === 'done' ? 0.7 + sizeFromMins(t.mins) * 0.34 : sizeFromMins(t.mins));

  function layout() {
    camUpdate();
    orr.pos.length = 0;
    const add = (t, rk, R, a, lift = 0) => {
      const p = orbPoint(rk, R, a);
      const y = p.y + lift;
      orr.pos.push({ t, rk, R, a, x: p.x, y, z: p.z, size: bodySize(t), ghost: t.status === 'done', s: proj(p.x, y, p.z) });
    };
    for (const t of items) {
      if (t.status === 'done') {
        if (!opts.belt) continue;
        const R = beltRadius(t);
        add(t, 'belt', R, baseAngle(t) + orr.clock * orrSpeed(R), beltLift(t));
      } else {
        const R = ORB.ring[t.rank];
        add(t, t.rank, R, baseAngle(t) + orr.clock * orrSpeed(R));
      }
    }
    if (orr.drag && !orr.drag.ghost) {        // preview the drop exactly where it will land
      const p = orr.pos.find((x) => x.t.id === orr.drag.id);
      if (p) {
        const rk = orr.drag.rk, a = orr.drag.a, w = orbPoint(rk, ORB.ring[rk], a);
        Object.assign(p, { rk, R: ORB.ring[rk], a, x: w.x, y: w.y, z: w.z, s: proj(w.x, w.y, w.z) });
      }
    }
    if (orr.focus && !orr.drag) {
      const p = orr.pos.find((x) => x.t.id === orr.focus);
      if (p) { goal.tx = p.x; goal.ty = p.y; goal.tz = p.z; }
    }
    orr.pos.sort((a, b) => (b.s ? b.s.z : -1) - (a.s ? a.s.z : -1));
  }

  // ── drawing ──
  const _off = {};
  function ringPath(c, rk, cx, cy, cz, R, steps) {
    let started = false, drew = false;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * TAU;
      planeOff(rk, Math.cos(a) * R, Math.sin(a) * R, _off);
      const p = proj(cx + _off.x, cy + _off.y, cz + _off.z);
      if (!p) { started = false; continue; }
      if (started) c.lineTo(p.x, p.y); else { c.moveTo(p.x, p.y); started = true; }
      drew = true;
    }
    return drew;
  }
  function drawBody(c, x, y, r, col, seed, detailed) {
    const gr = r * 3.2 + (r < 5 ? (5 - r) * 2.2 : 0);
    const g = c.createRadialGradient(x, y, r * 0.7, x, y, gr);
    g.addColorStop(0, rgba(col, r < 5 ? 0.44 : 0.32)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, gr, 0, TAU); c.fill();
    const lg = c.createRadialGradient(x - r * 0.36, y - r * 0.40, r * 0.05, x, y, r * 1.05);
    lg.addColorStop(0, mix(col, '#ffffff', 0.6)); lg.addColorStop(0.5, col); lg.addColorStop(1, mix(col, '#020610', 0.68));
    c.fillStyle = lg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    if (detailed && r > 14) {                     // banded surface, scrolling with spin
      c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
      for (let i = 0; i < 6; i++) {
        const yy = y - r + 2 * r * ((i + 0.5) / 6 + hash01(seed + 'y' + i) * 0.06);
        c.globalAlpha = 0.10 + hash01(seed + 'a' + i) * 0.07;
        c.fillStyle = i % 2 ? '#ffffff' : '#000814';
        c.beginPath(); c.ellipse(x, yy, r * 1.25, r * (0.05 + hash01(seed + 'h' + i) * 0.07), 0, 0, TAU); c.fill();
      }
      const spin = (orr.clock * 0.10 + hash01(seed)) % 1;
      for (let i = 0; i < 3; i++) {
        const px = x - r * 1.2 + ((spin + i / 3) % 1) * r * 2.4;
        c.globalAlpha = 0.13; c.fillStyle = '#000814';
        c.beginPath(); c.ellipse(px, y + r * (hash01(seed + 's' + i) - 0.5) * 1.1, r * 0.20, r * 0.09, 0, 0, TAU); c.fill();
      }
      c.globalAlpha = 1; c.restore();
    }
    c.strokeStyle = rgba(col, 0.9); c.lineWidth = Math.max(0.55, r * 0.085);
    c.beginPath(); c.arc(x, y, r * 0.985, 0, TAU); c.stroke(); c.lineWidth = 1;
  }
  function drawRock(c, x, y, r, col, seed) {
    const g = c.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r * 1.04);
    g.addColorStop(0, mix(col, '#ffffff', 0.42)); g.addColorStop(0.55, col); g.addColorStop(1, mix(col, '#05070c', 0.72));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    if (r > 16) {
      c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
      for (let i = 0; i < 7; i++) {
        const a = hash01(seed + 'ca' + i) * TAU, d = Math.sqrt(hash01(seed + 'cd' + i)) * r * 0.82;
        const cr = r * (0.07 + hash01(seed + 'cr' + i) * 0.15);
        c.globalAlpha = 0.16 + hash01(seed + 'co' + i) * 0.14; c.fillStyle = '#05070c';
        c.beginPath(); c.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, cr, cr * 0.78, a, 0, TAU); c.fill();
      }
      c.globalAlpha = 1; c.restore();
    }
  }
  function bracket(c, x, y, r, col) {
    const d = r + 7, L = Math.max(4, r * 0.45);
    c.strokeStyle = col; c.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      c.save(); c.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); c.rotate(a + Math.PI / 4);
      c.beginPath(); c.moveTo(-L, 0); c.lineTo(0, 0); c.lineTo(0, -L); c.stroke(); c.restore();
    }
    c.lineWidth = 1;
  }

  function draw() {
    const c = ctx, TH = orr.theme;
    c.clearRect(0, 0, orr.w, orr.h);
    if (orr.bgKey !== skyKey()) drawSky();
    c.drawImage(orr.bg, 0, 0, orr.w, orr.h);

    for (const [rank, R] of Object.entries(ORB.ring)) {        // orbit rings
      const hot = orr.dropRank === rank;
      c.strokeStyle = hot ? rankHex(rank) : rgba(TH.hud, 0.16); c.lineWidth = hot ? 1.8 : 1;
      c.beginPath(); if (ringPath(c, rank, 0, 0, 0, R, 128)) c.stroke();
      const lq = orbPoint(rank, R, -0.4), lp = proj(lq.x, lq.y, lq.z);
      if (lp) {
        c.fillStyle = hot ? rankHex(rank) : rgba(TH.hud, 0.5);
        c.font = '600 9px ui-sans-serif, sans-serif'; c.textAlign = 'center';
        c.fillText(rank, lp.x, lp.y - 6);
      }
    }
    c.lineWidth = 1;
    if (opts.belt) {                                            // the belt's edges
      c.strokeStyle = rgba(TH.hud, 0.14); c.setLineDash([2, 6]);
      for (const R of [ORB.belt.inner, ORB.belt.outer]) { c.beginPath(); if (ringPath(c, 'belt', 0, 0, 0, R, 110)) c.stroke(); }
      c.setLineDash([]);
    }

    // Links: bounties in the same track
    if (opts.lines === 'all') {
      const byTrack = new Map();
      for (const p of orr.pos) { if (p.ghost || !p.s) continue; (byTrack.get(p.t.track) || byTrack.set(p.t.track, []).get(p.t.track)).push(p); }
      for (const list of byTrack.values()) {
        if (list.length < 2) continue;
        list.sort((a, b) => a.a - b.a);
        c.strokeStyle = rgba(list[0].t.trackColor, 0.42);
        c.beginPath(); list.forEach((p, i) => (i ? c.lineTo(p.s.x, p.s.y) : c.moveTo(p.s.x, p.s.y))); c.stroke();
      }
    } else if (opts.lines === 'linked') {
      const activeId = orr.focus || orr.hover;
      const ap = activeId && orr.pos.find((p) => p.t.id === activeId && !p.ghost && p.s);
      if (ap) {
        c.strokeStyle = rgba(ap.t.trackColor, 0.75);
        for (const p of orr.pos) {
          if (p.ghost || !p.s || p.t.id === activeId || p.t.track !== ap.t.track) continue;
          c.beginPath(); c.moveTo(ap.s.x, ap.s.y); c.lineTo(p.s.x, p.s.y); c.stroke();
        }
      }
    }

    const sunP = proj(0, 0, 0);
    const liveN = items.filter((t) => t.status !== 'done').length;
    const drawSun = () => {
      if (!sunP) return;
      const r = ORB.sun * sunP.k;
      const g = c.createRadialGradient(sunP.x, sunP.y, 0, sunP.x, sunP.y, r * 4);
      g.addColorStop(0, 'rgba(255,238,170,.55)'); g.addColorStop(0.3, 'rgba(255,190,90,.22)'); g.addColorStop(1, 'rgba(255,170,60,0)');
      c.fillStyle = g; c.beginPath(); c.arc(sunP.x, sunP.y, r * 4, 0, TAU); c.fill();
      c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(sunP.x, sunP.y, r, 0, TAU); c.fill();
      if (r < 70) {
        c.fillStyle = 'rgba(50,34,0,.85)'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `600 ${Math.max(8, r * 0.85)}px ui-sans-serif, sans-serif`;
        c.fillText(String(liveN), sunP.x, sunP.y); c.textBaseline = 'alphabetic';
      }
    };
    let sunDrawn = false;

    for (const p of orr.pos) {
      if (!sunDrawn && sunP && p.s && p.s.z < sunP.z) { drawSun(); sunDrawn = true; }
      if (!p.s) continue;
      const { x, y, k } = p.s;
      const rad = Math.max(1.9, p.size * k);
      const col = rankHex(p.rk === 'belt' ? p.t.rank : p.rk);
      const n = p.t.daysLeft;

      if (p.ghost) {                                            // a completed bounty in the belt
        const shade = hash01(p.t.id + 'bc');
        const lit = orr.hover === p.t.id || orr.focus === p.t.id;
        const rc = shade > 0.62 ? '#9b8f80' : shade > 0.30 ? '#8a8f99' : '#6f7480';
        if (rad > 5) { c.globalAlpha = lit ? 1 : 0.85; drawRock(c, x, y, rad, rc, p.t.id); }
        else {
          c.globalAlpha = lit ? 1 : 0.34 + shade * 0.34;
          c.fillStyle = lit ? mix(rc, '#ffffff', 0.5) : rc;
          c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
        }
        if (lit) { c.globalAlpha = 0.9; c.strokeStyle = TH.hud; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, rad + 6, 0, TAU); c.stroke(); c.lineWidth = 1; }
        c.globalAlpha = 1; continue;
      }
      if (n !== null && n < 0) {                                // overdue: burning trail
        const span = 0.28 + Math.min(0.5, -n / 26), seg = 14;
        c.strokeStyle = TH.bad; c.lineWidth = Math.max(1, rad * 0.35);
        for (let i = 0; i < seg; i++) {
          const w0 = orbPoint(p.rk, p.R, p.a - span * (i / seg)), w1 = orbPoint(p.rk, p.R, p.a - span * ((i + 1) / seg));
          const q0 = proj(w0.x, w0.y, w0.z), q1 = proj(w1.x, w1.y, w1.z);
          if (!q0 || !q1) continue;
          c.globalAlpha = 0.55 * (1 - i / seg);
          c.beginPath(); c.moveTo(q0.x, q0.y); c.lineTo(q1.x, q1.y); c.stroke();
        }
        c.globalAlpha = 1; c.lineWidth = 1;
      }
      if (p.t.claims.length) {                                  // claimed: ring in the orbital plane
        c.strokeStyle = rgba(col, 0.9); c.lineWidth = Math.max(0.9, rad * 0.16);
        c.beginPath(); if (ringPath(c, p.rk, p.x, p.y, p.z, p.size * 2.2, 44)) c.stroke();
        c.lineWidth = 1;
      }
      drawBody(c, x, y, rad, col, p.t.id, orr.focus === p.t.id);
      if (n === 0) {                                            // due today: breathing outline
        c.strokeStyle = TH.sig; c.globalAlpha = 0.4 + Math.sin(orr.clock * 2.6) * 0.3;
        c.beginPath(); c.arc(x, y, rad + 5 + Math.sin(orr.clock * 2.6) * 1.6, 0, TAU); c.stroke();
        c.globalAlpha = 1;
      }
      // One moon per person working on it, each on its own radius, plane and period
      p.t.claims.forEach((cl, i) => {
        const seed = p.t.id + cl.user_id;
        const mr = p.size * (2.9 + i * 0.62);
        const spd = MOON_SPEED / Math.pow(mr / (p.size * 2.9), 1.5);
        const ma = orr.clock * spd + hash01(seed) * TAU;
        const inc = (ORB.inc[p.rk] || 0) + (hash01(seed + 'mi') - 0.5) * 0.7;
        const nod = (ORB.node[p.rk] || 0) + hash01(seed + 'mn') * TAU;
        tiltOff(inc, nod, Math.cos(ma) * mr, Math.sin(ma) * mr, _off);
        const mq = proj(p.x + _off.x, p.y + _off.y, p.z + _off.z); if (!mq) return;
        c.fillStyle = cl.mine ? TH.on : '#eaf7ff'; c.globalAlpha = 0.9;
        c.beginPath(); c.arc(mq.x, mq.y, Math.max(0.9, rad * 0.18), 0, TAU); c.fill();
        c.globalAlpha = 1;
      });
      if (orr.hover === p.t.id && orr.focus !== p.t.id) bracket(c, x, y, rad, rgba(TH.hud, 0.6));
    }
    if (!sunDrawn) drawSun();

    // Labels thin out as you pull back; whatever you point at keeps its name
    const LBL_FULL = 950, LBL_FADE = 2100;
    const zoomFade = clamp((LBL_FADE - cam.dist) / (LBL_FADE - LBL_FULL), 0, 1);
    if (opts.labels && !orr.focus && (zoomFade > 0.02 || orr.hover)) {
      const taken = [];
      const order = orr.pos.filter((p) => !p.ghost && p.s)
        .sort((a, b) => (orr.hover === b.t.id) - (orr.hover === a.t.id) || RANK_W[a.t.rank] - RANK_W[b.t.rank]);
      c.font = '600 10px ui-sans-serif, -apple-system, sans-serif'; c.textAlign = 'center';
      for (const p of order) {
        const forced = orr.hover === p.t.id;
        if (!forced && zoomFade <= 0.02) continue;
        const rad = Math.max(1.9, p.size * p.s.k);
        const label = (p.t.title.length > 24 ? p.t.title.slice(0, 23) + '…' : p.t.title).toUpperCase();
        const w = c.measureText(label).width, ly = p.s.y + rad + 15;
        const box = { l: p.s.x - w / 2 - 5, r: p.s.x + w / 2 + 5, t: ly - 10, b: ly + 4 };
        if (!forced && taken.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) continue;
        taken.push(box);
        c.fillStyle = p.t.daysLeft !== null && p.t.daysLeft < 0 ? TH.bad : TH.hud;
        c.globalAlpha = forced ? 1 : 0.62 * zoomFade;
        c.save(); c.letterSpacing = '1.2px'; c.fillText(label, p.s.x, ly); c.restore();
        c.globalAlpha = 1;
      }
    }
  }

  function frame(ts) {
    const dt = Math.min(0.05, (ts - orr.last) / 1000 || 0);
    orr.last = ts;
    const settled = camSettled();
    if (!settled) camStep(dt);
    const moving = opts.motion || orr.drag || orr.orbiting || orr.panning || !settled;
    if (moving || orr.dirty) {
      if (opts.motion) orr.clock += dt;
      orr.dirty = false;
      layout(); draw();
    }
    orr.raf = requestAnimationFrame(frame);
  }
  const start = () => { if (orr.raf || document.hidden || !orr.running) return; orr.last = performance.now(); orr.raf = requestAnimationFrame(frame); };
  const stop = () => { cancelAnimationFrame(orr.raf); orr.raf = 0; };

  // ── target lock ──
  const panelW = () => Math.min(340, orr.w * 0.82);
  function focusCamera(id) {
    const t = byId(id); if (!t) return;
    camUpdate();
    const want = clamp(orr.h * 0.13, 44, 92);
    const narrow = orr.w < 620;                  // phones: the panel is a sheet along the bottom
    goal.ox = narrow ? 0 : -panelW() / 2;
    goal.oy = narrow ? -orr.h * 0.31 : 0;
    goal.dist = clamp(bodySize(t) * (CAMB.focal || focalLen()) / want, 9, 400);
    goal.pitch = 0.38;
  }
  function focus(id) {
    const t = id && byId(id);
    if (!t) {
      if (orr.preFocus) { Object.assign(goal, orr.preFocus); orr.preFocus = null; } else { goal.ox = 0; goal.oy = 0; }
      orr.focus = null; detail.hidden = true; wrap.classList.remove('locked'); dirty(); return;
    }
    if (!orr.focus) orr.preFocus = { ...goal };
    orr.camRate = 6; orr.focus = id;
    focusCamera(id); fill(t); detail.hidden = false; wrap.classList.add('locked'); dirty();
  }
  function fill(t) {
    const col = rankHex(t.rank), done = t.status === 'done';
    q('.od-rank').textContent = t.rank; q('.od-rank').style.color = col;
    q('.od-title').textContent = t.title;
    q('.od-sub').textContent = done ? `Completed · ${t.track}` : `${RANK_LABEL[t.rank]} · ${t.effort}`;
    q('.od-kicker').textContent = done ? 'Belt · Completed' : 'Target · Locked';
    const n = t.daysLeft;
    const rows = done ? [
      ['Status', 'Completed', 'good'],
      ['Finished', t.closedLabel || '—'],
      ['Done by', t.doneBy.length ? esc(t.doneBy.join(', ')) : '—', '', true],
      ['Paid', `${t.points} pts`],
      ['Track', t.trackHtml, '', true],
      ['Posted', t.postedLabel],
    ] : [
      ['Status', t.claims.length ? 'Claimed' : 'Posted', t.claims.length ? 'good' : ''],
      ['Due', t.dueLabel || '—', n === null ? '' : n < 0 ? 'bad' : n <= 1 ? 'warn' : ''],
      ['Effort', t.effort],
      ['Worth', `${t.points} pts`],
      ['Orbit', `${ORB.ring[t.rank]} · ring ${t.rank}`],
      ['Track', t.trackHtml, '', true],
      ['Working on it', t.claims.length ? esc(t.claims.map((c) => c.name).join(', ')) : '—', '', true],
      ['Posted', t.postedLabel],
    ];
    q('.od-rows').innerHTML = rows.map(([k, v, cls, html]) =>
      `<div class="od-row"><span class="k">${k}</span><span class="v ${cls || ''}">${html ? v : esc(v)}</span></div>`).join('');
    const sec = (name, text) => {
      const el = q(`[data-sec="${name}"]`); el.hidden = !text; el.querySelector('.od-p').textContent = text || '';
    };
    sec('get', t.you_get); sec('done', t.done_means);
    q('[data-sec="links"]').hidden = !t.links.length;
    q('.od-links').innerHTML = t.links.map(([href, label]) => `<a href="${esc(href)}">↗ ${esc(label)}</a>`).join('');
    q('.od-acts').innerHTML = actions(t).map((a) => `<button type="button" class="od-btn ${a.go ? 'go' : ''}" data-oi="${a.act}">${esc(a.label)}</button>`).join('');
  }

  // ── interaction ──
  function hit(sx, sy) {
    let best = null, bz = Infinity;
    for (const p of orr.pos) {
      if (!p.s) continue;
      const rad = p.ghost ? Math.max(7, p.size * p.s.k + 4) : Math.max(10, p.size * p.s.k + 6);
      if ((sx - p.s.x) ** 2 + (sy - p.s.y) ** 2 <= rad * rad && p.s.z < bz) { best = p; bz = p.s.z; }
    }
    return best;
  }
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    const p = hit(e.offsetX, e.offsetY);
    if (p) {
      const fixed = p.ghost || !canDrag();                      // belt and non-admins: inspect only
      const snap = fixed ? { rk: p.rk, a: p.a } : (snapToRing(e.offsetX, e.offsetY) || { rk: p.rk, a: p.a });
      orr.drag = { id: p.t.id, rk: snap.rk, a: snap.a, moved: false, ghost: fixed, sx: e.offsetX, sy: e.offsetY, fromFocus: orr.focus };
    } else if (e.shiftKey) {
      orr.panning = { sx: e.clientX, sy: e.clientY, tx: goal.tx, tz: goal.tz, moved: false };
      orr.camRate = 17; cv.classList.add('grabbing');
    } else {
      orr.orbiting = { sx: e.clientX, sy: e.clientY, yaw: goal.yaw, pitch: goal.pitch, moved: false };
      orr.camRate = 17; cv.classList.add('grabbing');
    }
    dirty();
  });
  cv.addEventListener('pointermove', (e) => {
    if (orr.drag) {
      if (Math.abs(e.offsetX - orr.drag.sx) + Math.abs(e.offsetY - orr.drag.sy) > 4) {
        if (!orr.drag.moved && !orr.drag.ghost && orr.focus) {  // pull back so there's a ring to aim at
          Object.assign(goal, { dist: CAM_HOME.dist, pitch: CAM_HOME.pitch, tx: 0, ty: 0, tz: 0 }); orr.camRate = 7;
        }
        orr.drag.moved = true;
      }
      if (!orr.drag.ghost && orr.drag.moved) {
        const snap = snapToRing(e.offsetX, e.offsetY);
        if (snap) { orr.drag.rk = snap.rk; orr.drag.a = snap.a; }
        orr.dropRank = orr.drag.rk;
      }
      tip.hidden = true; dirty(); return;
    }
    if (orr.orbiting) {
      goal.yaw = orr.orbiting.yaw + (e.clientX - orr.orbiting.sx) * 0.0032;
      goal.pitch = clamp(orr.orbiting.pitch + (e.clientY - orr.orbiting.sy) * 0.0026, 0.08, 1.45);
      if (Math.abs(e.clientX - orr.orbiting.sx) + Math.abs(e.clientY - orr.orbiting.sy) > 4) orr.orbiting.moved = true;
      dirty(); return;
    }
    if (orr.panning && !orr.focus) {
      const k = cam.dist / CAMB.focal;
      const dx = -(e.clientX - orr.panning.sx) * k, dy = -(e.clientY - orr.panning.sy) * k;
      const gl = Math.hypot(CAMB.f.x, CAMB.f.z) || 1;
      goal.tx = orr.panning.tx + CAMB.r.x * dx + (CAMB.f.x / gl) * dy;
      goal.tz = orr.panning.tz + CAMB.r.z * dx + (CAMB.f.z / gl) * dy;
      orr.panning.moved = true; dirty(); return;
    }
    const p = hit(e.offsetX, e.offsetY);
    const id = p ? p.t.id : null;
    if (id !== orr.hover) { orr.hover = id; dirty(); }
    cv.classList.toggle('onstar', !!p);
    if (p && p.t.id !== orr.focus) {
      const sub = p.t.status === 'done' ? `Completed · ${p.t.track}` : `${p.t.rank} · ${p.t.dueLabel || 'no due date'}`;
      tip.innerHTML = `${esc(p.t.title)}<div class="sub">${esc(sub)}</div>`;
      tip.style.left = e.offsetX + 'px'; tip.style.top = e.offsetY + 'px'; tip.hidden = false;
    } else tip.hidden = true;
  });
  const end = async () => {
    cv.classList.remove('grabbing');
    if (orr.drag) {
      const d = orr.drag;
      orr.drag = null; orr.dropRank = null; dirty();
      const t = byId(d.id); if (!t) return;
      if (!d.moved) { focus(d.id); return; }                    // a click, not a drag
      if (d.ghost) return;
      if (d.rk !== t.rank) {
        const from = t.rank;
        t.rank = d.rk; dirty();                                 // show it where it was dropped
        if (!(await onRerank(t.id, d.rk))) { t.rank = from; dirty(); }
      }
      if (d.fromFocus && byId(d.fromFocus)) { orr.camRate = 6; focus(d.fromFocus); }
      return;
    }
    if (orr.orbiting) { const m = orr.orbiting.moved; orr.orbiting = null; if (!m) focus(null); }
    if (orr.panning) orr.panning = null;
    orr.camRate = 6; dirty();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { tip.hidden = true; if (orr.hover) { orr.hover = null; dirty(); } });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    goal.dist = clamp(goal.dist * (e.deltaY < 0 ? 1 / 1.13 : 1.13), 60, 6000); dirty();
  }, { passive: false });
  const home = () => { focus(null); Object.assign(goal, CAM_HOME); dirty(); };
  cv.addEventListener('dblclick', home);

  // The bar: Display menu, zoom (for touch screens) and reset
  const menu = wrap.querySelector('.orr-menu'), menuBtn = wrap.querySelector('[data-orr="menu"]');
  function paintMenu() {
    menu.querySelectorAll('.om-row[data-t]').forEach((row) => row.classList.toggle('on', !!opts[row.dataset.t]));
    menu.querySelector('[data-t="photo"]').hidden = !skyReady;   // no image, no option
    menu.querySelectorAll('[data-l]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === opts.lines)));
  }
  const closeMenu = () => { if (!menu.hidden) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); return true; } return false; };
  wrap.querySelector('.orr-bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-orr]'); if (!b) return;
    e.stopPropagation();
    const a = b.dataset.orr;
    if (a === 'menu') { menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', String(!menu.hidden)); paintMenu(); }
    if (a === 'home') home();
    if (a === 'in' || a === 'out') { goal.dist = clamp(goal.dist * (a === 'in' ? 1 / 1.35 : 1.35), 60, 6000); dirty(); }
  });
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const seg = e.target.closest('[data-l]');
    if (seg) opts.lines = seg.dataset.l;
    else {
      const row = e.target.closest('.om-row[data-t]'); if (!row) return;
      opts[row.dataset.t] = !opts[row.dataset.t];
      if (row.dataset.t === 'photo') orr.bgKey = null;
      if (row.dataset.t === 'belt' && !opts.belt && byId(orr.focus)?.status === 'done') focus(null);
    }
    saveOpts(); paintMenu(); dirty();
  });
  document.addEventListener('click', closeMenu);
  detail.addEventListener('click', (e) => {
    if (e.target.closest('.od-close')) return focus(null);
    const a = e.target.closest('[data-oi]')?.dataset.oi;
    if (a && orr.focus) onAction(a, orr.focus);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !orr.running) return;
    if (!closeMenu() && orr.focus) focus(null);
  });

  new ResizeObserver(() => { resize(); dirty(); }).observe(cv);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  buildSky();

  return {
    setItems(list) {
      items = list;
      if (orr.focus) { const t = byId(orr.focus); if (t && (t.status !== 'done' || opts.belt)) fill(t); else focus(null); }
      dirty();
    },
    show() {
      orr.running = true; loadPhoto(); resize(); paintMenu();
      if (orr.w) { layout(); draw(); }            // paint now, even before the first animation frame
      dirty(); start();
    },
    hide() { orr.running = false; stop(); tip.hidden = true; closeMenu(); },
    focus,
  };
}
