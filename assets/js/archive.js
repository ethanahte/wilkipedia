// The study guides archive (Ethan): every class at Wilcox as a card lying on the ground, seen from
// above at an angle, one row per subject (Ethan: on the ground, not towers or shelves), and the
// classes that have study guides glow gold. Left and right, a drag or the wheel move along a row;
// up and down move to the row behind or in front, and the rows wrap round. Picking a card lifts it
// up off the floor and turns it towards you, a wave rolls out across its neighbours, and a normal
// page panel beside it lists that class's guides (real text, so it can be read and translated).
//
// The idea and the motion come from RhineLabUI, a fan recreation of an Arknights terminal. Only
// the MIT-licensed motion maths is adapted here (the ripple below). None of its models, logo,
// fonts, sound or opening sequence are used: those copy Hypergryph's designs.
//
//   RhineLabUI, Copyright (c) 2026 LBEILC. MIT License: Permission is hereby granted, free of
//   charge, to any person obtaining a copy of this software and associated documentation files
//   (the "Software"), to deal in the Software without restriction, including without limitation
//   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
//   of the Software, and to permit persons to whom the Software is furnished to do so, subject
//   to the following conditions: The above copyright notice and this permission notice shall be
//   included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED
//   "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
//   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
//   EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
//   CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { $, esc, courseUrl, root, lessMotion } from './ui.js';

const COL = 2.45, SHELF = 2.05, W = 2.2, H = 1.5, D = 0.12;  // card spacing, row spacing, card size
const CW = 224, CH = 152, PER = 9;                          // label cells in the texture atlas
const SHOW = 3.2, SIDE = 9;                                  // rows behind/in front, cards either side

const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * t * (10 + t * (-15 + 6 * t)); };
const bell = (x, w) => Math.exp(-0.5 * (x / w) ** 2);
// the wave that runs out from a picked block (RhineLabUI's baselineSelectionWave)
const ripple = (d, age) => (age < 0 || age > 3.2 ? 0
  : 0.8 * smooth(age / 0.2) * Math.exp(-age * 1.15) * Math.cos((d - age * 8) * 0.58) * bell(d - age * 8, 3.4));
const wrap = (v, n) => ((v % n) + n) % n;
const nearest = (v, c, p) => v + Math.floor((c - v + p / 2) / p) * p;
const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isDark = () => (document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches);

export async function mountArchive(el, { data, guides, openUrl, classesOf }) {
  let THREE;
  // (a relative import() resolves against this file, not the page, so make the address absolute)
  try { THREE = await import(new URL(`${root}campus/vendor/three.module.min.js`, location.href).href); } catch { THREE = null; }

  // ── the data: one lane per subject, classes with guides first, then A–Z ──
  const byClass = {};
  for (const g of guides) for (const c of classesOf(g)) (byClass[c] ||= []).push(g);
  const lanes = data.departments.map((d) => ({
    d, classes: data.courses.filter((c) => c.department === d.slug)
      .sort((a, b) => ((byClass[b.slug]?.length || 0) > 0) - ((byClass[a.slug]?.length || 0) > 0) || a.name.localeCompare(b.name)),
  })).filter((l) => l.classes.length);
  const cells = lanes.flatMap((l, lane) => l.classes.map((c, row) => ({ lane, row, c, n: byClass[c.slug]?.length || 0 })));
  const NL = lanes.length;
  const at = (lane, row) => cells.findIndex((x) => x.lane === lane && x.row === row);

  el.innerHTML = `<div class="ar-stage" tabindex="0" role="application" aria-roledescription="archive"
      aria-label="Study guide archive. Left and right move along a subject's classes, up and down between subjects, Enter opens a class.">
      <div class="ar-hud" aria-hidden="true"><span class="ar-k" id="ar-sub"></span><span class="ar-pos" id="ar-pos"></span></div>
      <form class="ar-jump" id="ar-jump" role="search"><label class="sr" for="ar-q">Jump to a class</label>
        <input id="ar-q" list="ar-classes" placeholder="Jump to a class…" autocomplete="off"><datalist id="ar-classes">${
          data.courses.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></form>
      <p class="ar-hint" aria-hidden="true">← → classes · ↑ ↓ subjects · Enter opens · drag or scroll</p>
      <aside class="ar-panel" id="ar-panel" hidden></aside>
      <p class="sr" aria-live="polite" id="ar-live"></p>
    </div>`;
  const stage = $('.ar-stage', el), panel = $('#ar-panel', el);

  // ── state ──
  const rowOf = lanes.map(() => 0);
  let cur = Math.max(0, lanes.findIndex((l) => byClass[l.classes[0].slug]));   // start on a subject with guides
  let camLane = cur, openCell = -1, openAt = 0, dirty = true;
  // the render loop (set up once three.js is in) runs only while something moves and it's on screen
  let raf = 0, visible = false, last = 0, frame = null;
  const wake = () => { if (visible && !raf && frame) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const scroll = lanes.map(() => 0);
  const lift = new Float32Array(cells.length), laneW = new Float32Array(NL);
  const focusCell = () => at(wrap(cur, NL), rowOf[wrap(cur, NL)]);

  function hud() {
    const l = lanes[wrap(cur, NL)], c = cells[focusCell()];
    $('#ar-sub', el).textContent = l.d.name;
    $('#ar-pos', el).textContent = `${String(rowOf[wrap(cur, NL)] + 1).padStart(2, '0')} / ${String(l.classes.length).padStart(2, '0')}`;
    $('#ar-live', el).textContent = `${c.c.name}, ${c.n ? `${c.n} study guide${c.n === 1 ? '' : 's'}` : 'no study guides yet'}`;
  }

  function fill(i) {
    const { c, n } = cells[i], l = lanes[cells[i].lane];
    const list = (byClass[c.slug] || []).map((g) => {
      const u = openUrl(g);
      return `<li class="rv">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(g.payload.title)}</a>` : `<b>${esc(g.payload.title)}</b>`}
        <span class="meta">${esc(g.payload.author || g.author)}${g.payload.pdf ? ' · PDF' : ''}</span></li>`;
    }).join('');
    panel.innerHTML = `<button type="button" class="ar-x" aria-label="Close">✕</button>
      <p class="ar-k rv">${esc(l.d.name)}</p>
      <h3 class="rv">${esc(c.name)}</h3>
      <p class="ar-m rv">${n ? `${n} study guide${n === 1 ? '' : 's'}` : 'No study guides yet'}</p>
      ${list ? `<ol class="ar-guides">${list}</ol>` : '<p class="rv ar-empty">Took this class? Your notes could be the first guide here.</p>'}
      <p class="ar-acts rv"><a href="${courseUrl(c.slug)}">Class page</a><a href="${root}submit/?kind=resource&amp;course=${encodeURIComponent(c.slug)}">Share a guide</a></p>`;
    // the "decryption": bars over each line pull back one after another
    [...panel.querySelectorAll('.rv')].forEach((x, k) => x.style.setProperty('--i', k));
    panel.classList.remove('in'); void panel.offsetWidth; panel.classList.add('in');
  }
  function open(i) {
    if (i < 0) return;
    openCell = i; openAt = performance.now();
    panel.hidden = false; fill(i); stage.classList.add('has-panel'); dirty = true; wake();
  }
  function close() {
    openCell = -1; panel.hidden = true; stage.classList.remove('has-panel'); dirty = true; wake();
  }
  function move(dLane, dRow) {
    if (dLane) cur += dLane;
    const l = wrap(cur, NL);
    if (dRow) rowOf[l] = Math.max(0, Math.min(lanes[l].classes.length - 1, rowOf[l] + dRow));
    hud();
    if (openCell >= 0) open(focusCell());          // an open panel follows the focus
    dirty = true; wake();
  }
  function focusOn(i, andOpen) {
    const x = cells[i];
    cur = nearest(x.lane, cur, NL); rowOf[x.lane] = x.row;
    hud(); if (andOpen) open(i); dirty = true; wake();
  }

  panel.addEventListener('click', (e) => { if (e.target.closest('.ar-x')) { close(); stage.focus(); } });
  $('#ar-jump', el).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#ar-q', el).value.trim().toLowerCase();
    const i = cells.findIndex((x) => x.c.name.toLowerCase() === v) + 1 || cells.findIndex((x) => x.c.name.toLowerCase().includes(v)) + 1;
    if (v && i) { focusOn(i - 1, true); $('#ar-q', el).value = ''; stage.focus(); }
  });
  $('#ar-q', el).addEventListener('change', () => $('#ar-jump', el).requestSubmit());
  stage.addEventListener('keydown', (e) => {
    if (e.target.closest('input, a, button')) return;
    const k = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (k) { e.preventDefault(); move(...k); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCell === focusCell() ? close() : open(focusCell()); }
    if (e.key === 'Escape' && openCell >= 0) { e.preventDefault(); close(); }
    if (e.key === 'Home') { e.preventDefault(); move(0, -999); }
    if (e.key === 'End') { e.preventDefault(); move(0, 999); }
  });
  hud();

  if (!THREE) { stage.classList.add('no-gl'); stage.insertAdjacentHTML('afterbegin', '<p class="ar-nogl">The archive couldn’t load here. The graph and the list below have every guide.</p>'); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch { stage.classList.add('no-gl'); stage.insertAdjacentHTML('afterbegin', '<p class="ar-nogl">Your browser can’t draw the archive. The graph and the list below have every guide.</p>'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  const sky = new THREE.HemisphereLight(0xffffff, 0xd9d4c7, 1.3); scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-3, 12, 6); scene.add(sun);   // from above and in front: the card faces point up
  scene.add(sun.target);
  // the floor: a fine grid that fades into the fog
  const floor = new THREE.GridHelper(240, 98);
  floor.material.transparent = true; floor.material.opacity = 0.16; floor.position.y = -0.02;
  scene.add(floor);

  // blocks: one instanced box; their front labels: one instanced plane reading a texture atlas
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(W, H, D),
    new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0 }), cells.length);
  blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(blocks);
  const atlas = document.createElement('canvas');
  atlas.width = CW * PER; atlas.height = CH * Math.ceil(cells.length / PER);
  const tex = new THREE.CanvasTexture(atlas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const labelGeo = new THREE.PlaneGeometry(W, H);
  const cellAttr = new Float32Array(cells.length * 4);
  cells.forEach((_, i) => {
    const cx = (i % PER) * CW, cy = Math.floor(i / PER) * CH;
    cellAttr.set([cx / atlas.width, 1 - (cy + CH) / atlas.height, CW / atlas.width, CH / atlas.height], i * 4);
  });
  labelGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellAttr, 4));
  const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
  labelMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = aCell.xy + uv * aCell.zw;\n#endif');
  };
  const labels = new THREE.InstancedMesh(labelGeo, labelMat, cells.length);
  labels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(labels);
  // each row's subject, printed on the floor at its left
  const heads = lanes.map(() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 96;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6 * 96 / 1024), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    scene.add(m); return { c, t, m };
  });

  let palette;
  function paint() {                                             // colours follow day and night mode
    const dark = isDark();
    palette = {
      bg: new THREE.Color(css('--paper') || (dark ? '#0d0d0d' : '#ffffff')),
      plain: new THREE.Color(dark ? '#2a2a28' : '#fbfaf6'),
      edge: dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)',
      gold: new THREE.Color(css('--gold') || '#f5c400'),
      ink: dark ? '#ecebe6' : '#171717', inkGold: '#171717', muted: dark ? '#9a9892' : '#6b6a66',
    };
    scene.background = palette.bg;
    scene.fog = new THREE.Fog(palette.bg, 11, 27);
    floor.material.color.set(dark ? 0x8a8a84 : 0x6b6a66);
    sky.groundColor.set(dark ? 0x202020 : 0xd9d4c7); sky.intensity = dark ? 0.9 : 1.3; sun.intensity = dark ? 1.1 : 1.5;
    const g = atlas.getContext('2d');
    g.clearRect(0, 0, atlas.width, atlas.height);
    cells.forEach(({ c, n }, i) => {
      const x = (i % PER) * CW, y = Math.floor(i / PER) * CH;
      g.save(); g.beginPath(); g.rect(x, y, CW, CH); g.clip();
      g.strokeStyle = n ? 'rgba(0,0,0,.16)' : palette.edge; g.lineWidth = 2;   // a hairline round the face
      g.strokeRect(x + 1, y + 1, CW - 2, CH - 2);
      g.fillStyle = n ? palette.inkGold : palette.ink;
      g.textBaseline = 'alphabetic';
      g.font = '500 21px Newsreader, Georgia, serif';
      const words = c.name.split(' '), lines = [];
      for (const w of words) {
        const tryLine = lines.length ? `${lines[lines.length - 1]} ${w}` : w;
        if (lines.length && g.measureText(tryLine).width <= CW - 30) lines[lines.length - 1] = tryLine; else lines.push(w);
      }
      if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/\s*\S*$/, '') + '…'; }
      lines.forEach((ln, k) => g.fillText(ln, x + 15, y + 34 + k * 24));
      g.font = '600 10px ui-monospace, Menlo, monospace'; g.letterSpacing = '2px';
      g.fillStyle = n ? 'rgba(0,0,0,.72)' : palette.muted;
      g.fillText(n ? `${n} GUIDE${n === 1 ? '' : 'S'}` : (/^AP\b/.test(c.name) ? 'AP' : ''), x + 15, y + CH - 16);
      g.letterSpacing = '0px';
      g.restore();
    });
    tex.needsUpdate = true;
    heads.forEach(({ c, t }, l) => {
      const h = c.getContext('2d'); h.clearRect(0, 0, c.width, c.height);
      const withG = lanes[l].classes.filter((x) => byClass[x.slug]).length;
      h.fillStyle = palette.ink; h.font = '600 34px ui-monospace, Menlo, monospace';
      h.letterSpacing = '3px';
      h.fillText(lanes[l].d.name.toUpperCase(), 8, 40);
      h.fillStyle = palette.muted; h.font = '500 26px ui-monospace, Menlo, monospace';
      h.fillText(`${lanes[l].classes.length} CLASSES${withG ? ` · ${withG} WITH GUIDES` : ''}`, 8, 80);
      t.needsUpdate = true;
    });
    cells.forEach(({ n }, i) => blocks.setColorAt(i, n ? palette.gold : palette.plain));
    blocks.instanceColor.needsUpdate = true;
    dirty = true; wake();
  }
  await document.fonts?.load('500 22px Newsreader').catch(() => {});
  paint();
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);

  // ── pointer: click to pick, drag or scroll to move ──
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let px = 0, py = 0, drag = null, wheel = 0;
  const hit = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObject(blocks)[0];
    return h ? h.instanceId : -1;
  };
  renderer.domElement.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, ax: 0, ay: 0, moved: false };
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    px = ((e.clientX - r.left) / r.width) * 2 - 1; py = ((e.clientY - r.top) / r.height) * 2 - 1; dirty = true; wake();
    if (!drag) { renderer.domElement.style.cursor = hit(e) >= 0 ? 'pointer' : ''; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    drag.x = e.clientX; drag.y = e.clientY; drag.ax += dx; drag.ay += dy;
    while (drag.ax <= -70) { drag.ax += 70; move(0, 1); }
    while (drag.ax >= 70) { drag.ax -= 70; move(0, -1); }
    while (drag.ay <= -80) { drag.ay += 80; move(-1, 0); }      // drag up: the row behind
    while (drag.ay >= 80) { drag.ay -= 80; move(1, 0); }
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    const was = drag; drag = null;
    if (was?.moved) return;
    const i = hit(e);
    if (i < 0) { if (openCell >= 0) close(); return; }
    if (i === openCell) close(); else focusOn(i, true);
    stage.focus({ preventScroll: true });
  });
  renderer.domElement.addEventListener('pointerleave', () => { px = py = 0; dirty = true; wake(); });
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheel += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    while (wheel >= 60) { wheel -= 60; move(0, 1); }
    while (wheel <= -60) { wheel += 60; move(0, -1); }
  }, { passive: false });

  // ── the loop: runs only while the archive is on screen ──
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const LM = new THREE.Matrix4().makeTranslation(0, 0, D / 2 + 0.004);
  const T = new THREE.Vector3(), camOff = { x: 0, y: 0, pan: 0 };
  frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const still = lessMotion(), k = still ? 1e3 : 1;
    camLane = damp(camLane, cur, 7 * k, dt);
    camOff.x = damp(camOff.x, px * 0.5, 3 * k, dt); camOff.y = damp(camOff.y, py * 0.3, 3 * k, dt);
    camOff.pan = damp(camOff.pan, openCell >= 0 ? 2.6 : 0, 6 * k, dt);   // make room for the panel
    const t = now / 1000, age = (now - openAt) / 1000, fc = focusCell();
    let moving = Math.abs(camLane - cur) > 1e-3 || (!still && age < 3.2 && openCell >= 0);
    for (let l = 0; l < NL; l++) {
      scroll[l] = damp(scroll[l], rowOf[l], 9 * k, dt);
      laneW[l] = damp(laneW[l], l === wrap(cur, NL) ? 1 : 0, 6 * k, dt);
      if (Math.abs(scroll[l] - rowOf[l]) > 1e-3) moving = true;
    }
    const open = openCell >= 0 ? cells[openCell] : null;
    cells.forEach((x, i) => {
      const dl = nearest(x.lane, camLane, NL), across = x.row - scroll[x.lane];
      if (Math.abs(dl - camLane) > SHOW || Math.abs(across) > SIDE) { M.makeScale(0, 0, 0); blocks.setMatrixAt(i, M); labels.setMatrixAt(i, M); return; }
      const target = i === openCell ? 1 : i === fc ? 0.18 : 0;
      lift[i] = damp(lift[i], target, 8 * k, dt);
      if (Math.abs(lift[i] - target) > 1e-3) moving = true;
      const up = smooth(lift[i]);
      let y = i === openCell ? 1.35 * up : 0.9 * lift[i];      // the focused card floats a little; the opened one comes up
      if (!still) y += 0.035 * Math.sin(t * 0.9 + x.row * 0.55 + x.lane * 1.3);
      if (open && i !== openCell && !still) {
        const od = nearest(open.lane, dl, NL);
        y += 0.55 * ripple(Math.hypot(x.row - open.row, (dl - od) * 1.2), age);
      }
      P.set(across * COL, D / 2 + y, dl * SHELF + (i === openCell ? 2.0 * up : 0));
      // lying face up; the opened card turns most of the way towards you
      E.set(-Math.PI / 2 + (i === openCell ? 0.85 * up : 0), 0, 0);
      Q.setFromEuler(E);
      S.setScalar(1 + (i === openCell ? 0.18 * up : 0));
      M.compose(P, Q, S);
      blocks.setMatrixAt(i, M);
      labels.setMatrixAt(i, M.multiply(LM));
    });
    blocks.instanceMatrix.needsUpdate = labels.instanceMatrix.needsUpdate = true;
    const tall = camera.aspect < 1;
    heads.forEach(({ m }, l) => {
      const dl = nearest(l, camLane, NL);
      m.visible = Math.abs(dl - camLane) <= SHOW;
      // on the floor in the gap before each row, fixed to the left of the view
      m.position.set((tall ? -1.2 : -3.1) + (tall ? 0 : camOff.pan), 0.01, dl * SHELF - H / 2 - 0.22);
    });
    T.set(tall ? 0 : camOff.pan, 0, camLane * SHELF);
    camera.position.set(T.x + (tall ? 0.3 : 1.6) + camOff.x, (tall ? 10.5 : 8.6) - camOff.y, T.z + (tall ? 6.8 : 7.6));
    camera.lookAt(T.x + (tall ? 0.1 : 0.4), 0, T.z + (tall ? 0.6 : 1.3));   // aim a little in front, so the focused row sits mid-frame
    floor.position.x = Math.round(T.x / 2.45) * 2.45; floor.position.z = Math.round(T.z / 2.45) * 2.45;   // an endless floor
    renderer.render(scene, camera);
    dirty = false;
    if (visible && (moving || dirty || !still)) raf = requestAnimationFrame(frame);
  };
  const size = () => {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.fov = r.width < 640 ? 46 : 34;
    camera.updateProjectionMatrix();
    dirty = true; wake();
  };
  new ResizeObserver(size).observe(stage);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; wake(); }).observe(stage);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden && stage.offsetParent !== null; wake(); });
  size();
  return { focus: () => stage.focus({ preventScroll: true }) };
}
