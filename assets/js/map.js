// The campus map. Works like the BountyBoard orrery: tap a room and the camera
// flies in to frame it on the left while a panel slides in on the right with
// who teaches there, what, and when. Esc, ✕ or "Whole campus" flies back out.
//
// The camera IS the SVG viewBox, so the room outlines stay crisp at any zoom.
// Room boxes come from data/map.json (traced off the school's campus map);
// `mode` is always 'plan' now (an aerial photo view was tried and removed).
// room contents come from approved teacher sections whose "room" field matches.

import { initHeader, courses, dataUrl, slugify, $, $$, esc, courseUrl, root } from './ui.js';
import { todaysLunch, sortedCats, itemHtml } from './menu.js';

const s = await initHeader();
const svg = $('#map-svg');
const img = $('#map-img');
const spots = $('#hotspots');
const stage = $('#map-stage');
const panel = $('#map-panel');

const [map, data, index] = await Promise.all([
  fetch(dataUrl('data/map.json')).then((r) => r.json()),
  courses(),
  fetch(dataUrl('data/search.json')).then((r) => r.json()),
]);
const course = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
const teacherSlug = Object.fromEntries(index.filter((x) => x.t === 't').map((x) => [x.n, x.s]));
const roomById = Object.fromEntries(map.rooms.map((r) => [r.id, r]));

// "Room b-204" / "b204" / "B 204" all mean B204
const normRoom = (v) => String(v || '').toUpperCase().replace(/^ROOM\s*/, '').replace(/[\s-]+/g, '');

// ── room contents from approved teacher sections ──
let byRoom = {};
let clubsByRoom = {};
async function loadRooms() {
  const [sections, clubs] = await Promise.all([s.approved({ kind: 'teacher_section' }), s.approved({ kind: 'club' })]);
  byRoom = {};
  clubsByRoom = {};
  for (const c of clubs) {
    const id = normRoom(c.payload.room);
    if (!id || !c.payload.name) continue;
    const list = (clubsByRoom[id] ??= []);
    if (!list.some((x) => x.name === c.payload.name)) list.push({ name: c.payload.name, meets: c.payload.meets });
  }
  for (const x of sections) {
    const id = normRoom(x.payload.room);
    if (!id || !x.teacher) continue;
    const list = (byRoom[id] ??= []);
    let t = list.find((y) => y.teacher === x.teacher);
    if (!t) list.push(t = { teacher: x.teacher, courses: [], schedule: null, year: null });
    if (x.course_slug && !t.courses.includes(x.course_slug)) t.courses.push(x.course_slug);
    // sections arrive newest first: keep the newest schedule
    if (!t.schedule && x.payload.schedule) { t.schedule = x.payload.schedule; t.year = x.payload.school_year; }
  }
}

// ── camera ──
let mode = 'plan';
let dims = map.plan;
let cam = { x: 0, y: 0, w: dims.width };
let anim = 0;
const size = () => stage.getBoundingClientRect();
const camH = (c = cam) => c.w * size().height / size().width;
function apply() {
  svg.setAttribute('viewBox', `${cam.x} ${cam.y} ${cam.w} ${camH()}`);
}
function clamp(c) {
  const w = Math.min(Math.max(c.w, 80), dims.width * 1.6);
  const h = w * size().height / size().width;
  return { w, x: Math.min(Math.max(c.x, -w * 0.6), dims.width - w * 0.4),
           y: Math.min(Math.max(c.y, -h * 0.6), dims.height - h * 0.4) };
}
function fitCam() {
  const { width: W, height: H } = size();
  const pad = 1.04;
  const w = Math.max(dims.width, dims.height * W / H) * pad;
  const h = w * H / W;
  return { w, x: (dims.width - w) / 2, y: (dims.height - h) / 2 };
}
function flyTo(target, ms = 650) {
  cancelAnimationFrame(anim);
  const from = { ...cam };
  const to = clamp(target);
  const t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const step = (now) => {
    const k = ease(Math.min(1, (now - t0) / ms));
    cam = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k };
    apply();
    if (k < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
// Frame a box in the part of the stage the panel doesn't cover
function frame(box, zoom = 3.2) {
  const { width: W, height: H } = size();
  const wide = W >= 760;
  const vis = wide ? { l: 0, t: 0, w: W - Math.min(380, W * 0.42), h: H }
                   : { l: 0, t: 0, w: W, h: H * 0.5 };
  // At least ~430 map pixels across: enough context to see where the room is,
  // and not so close that the drawing blurs.
  const units = Math.max(box.w * zoom, box.h * zoom * vis.w / vis.h, 430);
  const k = units / vis.w;                 // map units per pixel
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  flyTo({ w: W * k, x: cx - (vis.l + vis.w / 2) * k, y: cy - (vis.t + vis.h / 2) * k });
}

// ── drawing ──
function drawSpots() {
  spots.innerHTML = mode !== 'plan' ? '' : map.rooms.map((r) => {
    const has = !!byRoom[r.id] || !!clubsByRoom[r.id] || r.id === 'CAFETERIA';
    return `<rect class="room k-${r.kind}${has ? ' has' : ''}" data-id="${esc(r.id)}" x="${r.x}" y="${r.y}"
      width="${r.w}" height="${r.h}" rx="2" tabindex="0" role="button" aria-label="${esc(r.label)}"><title>${esc(r.label)}</title></rect>`;
  }).join('');
  if (selected) spots.querySelector(`[data-id="${CSS.escape(selected)}"]`)?.classList.add('on');
}
function setMode(m) {
  mode = m;
  dims = map[m];
  img.setAttribute('href', root + dims.image);
  img.setAttribute('width', dims.width);
  img.setAttribute('height', dims.height);
  img.setAttribute('class', m);
  $('#map-credit').textContent = dims.credit;
  closePanel(false);
  cam = fitCam();
  apply();
  drawSpots();
}

// ── panel ──
let selected = null;
const badges = (c) => `${c.name.startsWith('AP ') ? '<span class="tag ap">AP</span>' : ''}${/Honors/.test(c.name) ? '<span class="tag">Honors</span>' : ''}`;

function panelHtml(r) {
  const multiFloor = map.rooms.some((x) => x.building === r.building && x.floor && x.floor !== r.floor);
  const where = [r.buildingName, multiFloor && r.floor ? `Floor ${r.floor}` : null].filter(Boolean).join(' · ');
  const head = `<div class="mp-head"><div><div class="label">${esc(where)}</div><h2>${esc(r.label)}</h2></div>
    <button type="button" class="icon-btn mp-close" aria-label="Close">✕</button></div>`;
  if (r.kind === 'building') {
    return `${head}<p>${esc(map.insets[r.target]?.label || '')}</p>
      <p><button type="button" class="btn" data-inset="${esc(r.target)}">Show the floors</button></p>`;
  }
  if (r.id === 'CAFETERIA') {
    return `${head}<div class="mp-menu"><div class="label">Today’s lunch</div><div id="mp-menu"><p class="meta">Loading…</p></div>
      <p><a class="btn" href="${root}menu/">Full breakfast &amp; lunch menu</a></p></div>`;
  }
  const list = byRoom[r.id] || [];
  const clubs = clubsByRoom[r.id] || [];
  const clubHtml = clubs.length ? `<section class="mp-teacher"><h3>Clubs that meet here</h3><ul class="mp-clubs">${clubs.map((c) =>
    `<li><a href="${root}clubs/#${slugify(c.name)}">${esc(c.name)}</a>${c.meets ? `<span class="meta"> · ${esc(c.meets)}</span>` : ''}</li>`).join('')}</ul></section>` : '';
  const add = `${root}submit/?kind=teacher_section&room=${encodeURIComponent(r.id)}`;
  if (!list.length && clubs.length) return head + clubHtml;
  if (!list.length) {
    return `${head}<div class="mp-empty">
      <p>${r.kind === 'classroom' ? 'Nobody has added who teaches here yet.' : r.kind === 'office' ? 'An office, not a classroom.' : 'A shared space, not a classroom.'}</p>
      ${r.kind === 'classroom' ? `<p><a class="btn" href="${add}">Add the teacher and schedule</a></p>
      <p class="meta">Pick the class and teacher, then put <b>${esc(r.id)}</b> in the room field.</p>` : ''}</div>`;
  }
  return `${head}${list.map((t) => `<section class="mp-teacher">
      <h3>${teacherSlug[t.teacher] ? `<a href="${root}teachers/${teacherSlug[t.teacher]}/">${esc(t.teacher)}</a>` : esc(t.teacher)}</h3>
      <ul class="course-list compact">${t.courses.map((slug) => {
        const c = course[slug];
        return c ? `<li class="course-row"><a href="${courseUrl(slug)}"><span class="c-name">${esc(c.name)}</span>
          <span class="c-meta">${c.grades ? `Grades ${esc(c.grades)}` : ''}</span></a><span class="c-badges">${badges(c)}</span></li>` : '';
      }).join('')}</ul>
      <div class="kv"><div class="k">Schedule</div><div class="v">${t.schedule
        ? `${esc(t.schedule)}${t.year ? ` <span class="tag">${esc(t.year)}</span>` : ''}`
        : `<span class="meta">Not added yet.</span> <a href="${add}">Add it</a>`}</div></div>
    </section>`).join('')}${clubHtml}
    <p class="meta mp-foot">Wrong or missing? <a href="${add}">Update this room</a></p>`;
}

function select(id, { fly = true } = {}) {
  const r = roomById[id];
  if (!r) return false;
  if (mode !== 'plan') setMode('plan');
  selected = id;
  $$('.room.on', spots).forEach((el) => el.classList.remove('on'));
  spots.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('on');
  panel.innerHTML = panelHtml(r);
  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add('open'));
  $('#map-hint').hidden = true;
  if (fly) frame(r);
  if (id === 'CAFETERIA') {
    todaysLunch().then((day) => {
      const el = $('#mp-menu');
      if (!el) return;
      const main = day ? sortedCats(day).filter((c) => c === 'Entrees' || c === 'Proteins') : [];
      el.innerHTML = day ? main.map((c) => `<ul class="menu-list">${day[c].map(itemHtml).join('')}</ul>`).join('')
        : '<p class="meta">No lunch today (weekend or holiday).</p>';
    }).catch(() => { const el = $('#mp-menu'); if (el) el.innerHTML = '<p class="meta">Couldn’t load the menu right now.</p>'; });
  }
  history.replaceState(null, '', '#' + encodeURIComponent(id));
  return true;
}
function closePanel(flyOut = true) {
  if (!selected && panel.hidden) return;
  selected = null;
  $$('.room.on', spots).forEach((el) => el.classList.remove('on'));
  panel.classList.remove('open');
  panel.hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
  if (flyOut) flyTo(fitCam());
}

// ── input: drag to pan, wheel / pinch to zoom, tap to select ──
const pointers = new Map();
let dragged = false;
let pinch = null;
const toUnits = (px, py) => {
  const { left, top, width } = size();
  const k = cam.w / width;
  return { x: cam.x + (px - left) * k, y: cam.y + (py - top) * k };
};
function zoomAt(px, py, f) {
  const { left, top, width } = size();
  const u = toUnits(px, py);
  const w = Math.min(Math.max(cam.w * f, 80), dims.width * 1.6);
  const k = w / width;
  cancelAnimationFrame(anim);
  cam = clamp({ w, x: u.x - (px - left) * k, y: u.y - (py - top) * k });
  apply();
}
svg.addEventListener('pointerdown', (e) => {
  svg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  dragged = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
  }
});
svg.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { ...prev, x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.d / d);
    pinch.d = d;
    dragged = true;
    return;
  }
  // A tap that wobbles a few pixels is still a tap
  if (!dragged && Math.hypot(cur.x - cur.sx, cur.y - cur.sy) < 5) return;
  const dx = cur.x - prev.x, dy = cur.y - prev.y;
  if (dx || dy) {
    dragged = true;
    cancelAnimationFrame(anim);
    const k = cam.w / size().width;
    cam = clamp({ ...cam, x: cam.x - dx * k, y: cam.y - dy * k });
    apply();
    stage.classList.add('dragging');
  }
});
const release = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  stage.classList.remove('dragging');
};
svg.addEventListener('pointerup', (e) => {
  const wasDrag = dragged;
  release(e);
  if (wasDrag) return;
  const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.room');
  if (hit) select(hit.dataset.id);
});
svg.addEventListener('pointercancel', release);
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0016));
}, { passive: false });
spots.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.room')) { e.preventDefault(); select(e.target.dataset.id); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
panel.addEventListener('click', (e) => {
  if (e.target.closest('.mp-close')) closePanel();
  const inset = e.target.closest('[data-inset]');
  if (inset) { closePanel(false); frame(map.insets[inset.dataset.inset], 1.15); }
});

// toolbar
const centre = () => { const r = size(); return [r.left + r.width / 2, r.top + r.height / 2]; };
$('#z-in').onclick = () => { const [x, y] = centre(); const t = { ...cam }; zoomAt(x, y, 1 / 1.5); const to = { ...cam }; cam = t; flyTo(to, 250); };
$('#z-out').onclick = () => { const [x, y] = centre(); const t = { ...cam }; zoomAt(x, y, 1.5); const to = { ...cam }; cam = t; flyTo(to, 250); };
$('#z-reset').onclick = () => { closePanel(false); flyTo(fitCam()); };
$('#room-ids').innerHTML = map.rooms.filter((r) => r.kind !== 'building')
  .map((r) => `<option value="${esc(r.id === r.label ? r.id : `${r.id} · ${r.label}`)}">`).join('');
$('#room-find').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = normRoom($('#room-q').value.split('·')[0]);
  const hit = roomById[q] || map.rooms.find((r) => normRoom(r.label).includes(q));
  if (hit) { select(hit.id); $('#room-q').blur(); } else $('#room-q').classList.add('invalid');
});
$('#room-q').addEventListener('input', () => $('#room-q').classList.remove('invalid'));
new ResizeObserver(() => { if (!selected) { cam = fitCam(); apply(); } else apply(); }).observe(stage);

// ── room list under the map ──
function drawList() {
  const ids = [...new Set([...Object.keys(byRoom), ...Object.keys(clubsByRoom)])].filter((id) => roomById[id]);
  const groups = {};
  for (const id of ids) (groups[roomById[id].buildingName] ??= []).push(id);
  $('#room-list').innerHTML = ids.length ? Object.entries(groups).sort().map(([b, list]) => `<div class="room-group">
      <h3>${esc(b)}</h3><div class="chips">${list.sort((a, c) => a.localeCompare(c, undefined, { numeric: true }))
        .map((id) => `<button type="button" class="chip" data-goto="${esc(id)}">${esc(id)} · ${esc([...(byRoom[id] || []).map((t) => t.teacher), ...(clubsByRoom[id] || []).map((c) => c.name)].join(', '))}</button>`).join('')}</div></div>`).join('')
    : '<div class="empty">No rooms have info yet. When students add a room number to a teacher section, it shows up on the map.</div>';
}
$('#room-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (!b) return;
  stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  select(b.dataset.goto);
});

// ── start ──
setMode('plan');
await loadRooms();
drawSpots();
drawList();
const start = decodeURIComponent(location.hash.slice(1));
if (start) select(normRoom(start)) || select(start);
s.onAuth(async () => { await loadRooms(); drawSpots(); drawList(); if (selected) panel.innerHTML = panelHtml(roomById[selected]); });
