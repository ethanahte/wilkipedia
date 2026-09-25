// Everything drawn over the 3D view, in Wilkipedia's own look (Newsreader,
// ink #111, Wilcox gold #f5c400): the loading screen, the top bar, the
// minimap (and the full map, which you can click to jump anywhere), the room
// card, the hover tip, toasts, and the thumbstick on phones.
//
// The minimap is drawn from layout.js, the same numbers the 3D world is built
// from, so the dot is always where you are. It is styled after the official
// campus map: white buildings, black outlines, north up.

import { BUILDINGS, LOTS, FIELDS, TRACK, CREEK, CAMPUS, MONROE_PTS, CALABAZAS_PTS, SANJUAN_PTS, LAWN_E, LAWN_W, STAGE, WORLD } from './layout.js';

const $ = (s, r = document) => r.querySelector(s);
const LABELS = [
  ['B', -68, -25], ['R', 44, 1], ['Cafeteria', 22, -42], ['Library', -36, 45], ['P', 8, 59], ['Aux gym', 62, 48],
  ['Main gym', 118, -2], ['Pool', 78, 0], ['S', -50, 108], ['M', -125, 75], ['N', -138, 27], ['Theatre', -136, -26],
  ['Front office', -36, -65], ['Stadium', 240, 87], ['P108', 178, -33], ['P111', 179, -2], ['P115', 157, -2], ['P117', 174, 30],
];

export class Hud {
  constructor(root) {
    this.root = root;
    this.mapCanvas = null;
    this.big = false;
    this.onJump = null;       // (x, z) from a click on the big map
    this.onRoomSearch = null; // (id) from the map's search box
  }

  progress(frac, text) {
    const bar = $('#load-bar'), msg = $('#load-msg');
    if (bar) bar.style.transform = `scaleX(${frac})`;
    if (msg && text) msg.textContent = text;
  }
  loaded() {
    const l = $('#loader');
    l?.classList.add('done');
    setTimeout(() => l?.remove(), 700);
  }
  fail(err) {
    const msg = $('#load-msg');
    if (msg) msg.innerHTML = `This browser couldn’t start the 3D campus (${String(err?.message || err).replace(/</g, '&lt;')}). Try the <a href="../map/">flat campus map</a> instead.`;
  }

  toast(text, ms = 3200) {
    const t = $('#toast');
    t.textContent = text; t.classList.add('on');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), ms);
  }

  tip(r) {
    const t = $('#tip');
    if (!r) { t.hidden = true; return; }
    t.hidden = false;
    t.innerHTML = `<b>${r.label}</b> <span>${r.buildingName}${r.floor > 1 ? ` · floor ${r.floor}` : ''}</span><kbd>click</kbd>`;
  }

  roomCard(r, href) {
    const c = $('#room-card');
    if (!r) { c.hidden = true; return; }
    const kind = { classroom: 'Classroom', office: 'Office', place: 'Place' }[r.kind] || 'Room';
    c.innerHTML = `<button class="x" aria-label="Close">×</button>
      <div class="rc-k">${kind} · ${r.buildingName}${r.floor ? ` · floor ${r.floor}` : ''}</div>
      <h2>${r.label}</h2>
      <p>Who teaches here, and what the room is like, lives on the Wilkipedia map.</p>
      <p class="rc-a"><a class="btn" href="${href}">Open ${r.id} on Wilkipedia →</a></p>`;
    c.hidden = false;
    $('.x', c).onclick = () => { c.hidden = true; };
  }

  setMode(mode) {
    document.body.dataset.mode = mode;
    const b = $('#btn-fly');
    b.innerHTML = mode === 'fly' ? '<span>Walk</span>' : '<span>Fly up</span>';
    b.setAttribute('aria-pressed', mode === 'fly');
  }

  setQuality(q) {
    for (const b of document.querySelectorAll('[data-q]')) b.setAttribute('aria-pressed', b.dataset.q === q);
    $('#btn-quality span').textContent = { high: 'High', medium: 'Medium', low: 'Low' }[q];
  }

  // ── the map, drawn once, then cropped for the minimap ──
  drawMap() {
    const S = 2;   // pixels per metre
    const W = Math.round((WORLD.x1 - WORLD.x0) * S), H = Math.round((WORLD.z1 - WORLD.z0) * S);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const P = (x, z) => [(x - WORLD.x0) * S, (z - WORLD.z0) * S];
    const poly = (pts, fill, stroke, lw = 2) => {
      g.beginPath(); pts.forEach(([x, z], i) => g[i ? 'lineTo' : 'moveTo'](...P(x, z))); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
    };
    const line = (pts, w, col) => { g.beginPath(); pts.forEach(([x, z], i) => g[i ? 'lineTo' : 'moveTo'](...P(x, z))); g.lineWidth = w * S; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
    g.fillStyle = '#eceae3'; g.fillRect(0, 0, W, H);
    poly(CAMPUS, '#f8f7f3');
    for (const pts of [MONROE_PTS, CALABAZAS_PTS, SANJUAN_PTS]) line(pts, 16, '#d6d3cb');
    line([[CREEK.x, WORLD.z0], [CREEK.x, WORLD.z1]], 9, '#b9d4e3');
    for (const L of LOTS) { const [x0, z0, x1, z1] = L.r; poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], '#e2e0da'); }
    for (const f of [FIELDS.soccer, FIELDS.practice]) poly(f, '#cfe3c0');
    poly(LAWN_E, '#cfe3c0'); const [a, b, cc, d] = LAWN_W.box; poly([[a, b], [cc, b], [cc, d], [a, d]], '#cfe3c0');
    // track
    g.beginPath(); const [tx, tz] = P(TRACK.x, TRACK.z), r = (TRACK.r + 7.3) * S, hl = (TRACK.straight / 2) * S;
    g.moveTo(tx - r, tz - hl); g.arc(tx, tz - hl, r, Math.PI, 0); g.arc(tx, tz + hl, r, 0, Math.PI); g.closePath();
    g.fillStyle = '#e9c2b6'; g.fill();
    g.beginPath(); g.moveTo(tx - TRACK.r * S, tz - hl); g.arc(tx, tz - hl, TRACK.r * S, Math.PI, 0); g.arc(tx, tz + hl, TRACK.r * S, 0, Math.PI); g.closePath();
    g.fillStyle = '#cfe3c0'; g.fill();
    poly(FIELDS.pool.water, '#b9dbe8', '#111', 1.5);
    g.beginPath(); g.arc(...P(STAGE.x, STAGE.z), STAGE.r * S, 0, Math.PI); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#111'; g.stroke();
    for (const b of BUILDINGS) poly(b.poly, '#ffffff', '#111', 2);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [t, x, z] of LABELS) {
      g.font = `${t.length <= 2 ? 600 : 500} ${t.length <= 2 ? 30 : 17}px Newsreader, Georgia, serif`;
      g.fillText(t, ...P(x, z));
    }
    g.font = '600 15px system-ui, sans-serif'; g.fillStyle = '#6b6860';
    g.fillText('MONROE ST', ...P(-120, -108.5));
    g.save(); g.translate(...P(-104, 180)); g.rotate(-Math.PI / 2); g.fillText('CALABAZAS CREEK', 0, 0); g.restore();
    this.mapCanvas = c; this.mapScale = S;
  }

  // Minimap: north up, centred on you, your arrow turns as you do.
  minimap(x, z, yaw) {
    const cv = $('#minimap canvas'), g = cv.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1), size = cv.clientWidth;
    if (cv.width !== size * dpr) { cv.width = cv.height = size * dpr; }
    const S = this.mapScale, zoom = 0.75 * dpr, M = this.mapCanvas;
    if (!M) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#eceae3'; g.fillRect(0, 0, cv.width, cv.height);
    const px = (x - WORLD.x0) * S, pz = (z - WORLD.z0) * S;
    g.setTransform(zoom, 0, 0, zoom, cv.width / 2 - px * zoom, cv.height / 2 - pz * zoom);
    g.drawImage(M, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    this._arrow(g, cv.width / 2, cv.height / 2, yaw, 9 * dpr);
  }

  _arrow(g, x, y, yaw, s) {
    g.save(); g.translate(x, y); g.rotate(-yaw);
    g.beginPath(); g.moveTo(0, -s * 1.3); g.lineTo(s * 0.85, s); g.lineTo(0, s * 0.45); g.lineTo(-s * 0.85, s); g.closePath();
    g.fillStyle = '#f5c400'; g.fill(); g.lineWidth = Math.max(1.5, s * 0.22); g.strokeStyle = '#111'; g.stroke();
    g.restore();
  }

  openBig(x, z, yaw) {
    const o = $('#bigmap'), cv = $('canvas', o);
    o.hidden = false; this.big = true;
    const draw = () => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      const g = cv.getContext('2d'), M = this.mapCanvas;
      // fit the campus core (not the whole neighbourhood)
      const fx0 = -200, fz0 = -125, fx1 = 380, fz1 = 300, S = this.mapScale;
      const k = Math.min(cv.width / ((fx1 - fx0) * S), cv.height / ((fz1 - fz0) * S));
      const ox = (cv.width - (fx1 - fx0) * S * k) / 2 - (fx0 - WORLD.x0) * S * k, oz = (cv.height - (fz1 - fz0) * S * k) / 2 - (fz0 - WORLD.z0) * S * k;
      g.fillStyle = '#eceae3'; g.fillRect(0, 0, cv.width, cv.height);
      g.setTransform(k, 0, 0, k, ox, oz); g.drawImage(M, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
      this._arrow(g, ox + (x - WORLD.x0) * S * k, oz + (z - WORLD.z0) * S * k, yaw, 10 * dpr);
      cv.onclick = (e) => {
        const b = cv.getBoundingClientRect();
        const mx = (e.clientX - b.left) * dpr, mz = (e.clientY - b.top) * dpr;
        const wx = (mx - ox) / (S * k) + WORLD.x0, wz = (mz - oz) / (S * k) + WORLD.z0;
        this.closeBig();
        this.onJump?.(wx, wz);
      };
    };
    requestAnimationFrame(draw);
    $('#room-q').value = '';
    setTimeout(() => $('#room-q').focus(), 50);
  }
  closeBig() { $('#bigmap').hidden = true; this.big = false; }

  bind({ onFly, onMap, onQuality, onHelp }) {
    $('#btn-fly').onclick = onFly;
    $('#btn-map').onclick = onMap;
    $('#minimap').onclick = onMap;
    for (const b of document.querySelectorAll('[data-q]')) b.onclick = () => { onQuality(b.dataset.q); $('#qmenu').hidden = true; };
    $('#btn-quality').onclick = (e) => { e.stopPropagation(); $('#qmenu').hidden = !$('#qmenu').hidden; };
    addEventListener('click', (e) => { if (!e.target.closest('#qmenu, #btn-quality')) $('#qmenu').hidden = true; });
    $('#btn-help').onclick = onHelp;
    $('#help .x').onclick = () => { $('#help').hidden = true; };
    $('#bigmap .x').onclick = () => this.closeBig();
    $('#room-form').onsubmit = (e) => {
      e.preventDefault();
      const id = $('#room-q').value.trim().toUpperCase().replace(/\s+/g, '');
      if (id) this.onRoomSearch?.(id);
    };
  }
}
