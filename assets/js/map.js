// The campus map. Works like the BountyBoard orrery: tap a room and the camera
// flies in to frame it on the left while a panel slides in on the right with
// who teaches there, what, and when. Esc, ✕ or "Whole campus" flies back out.
//
// The camera IS the SVG viewBox, and the plan itself is vector (walls, fills,
// icons and words from data/map-plan.json, traced off the school's campus map
// by tools/trace_map.py), so everything stays crisp at any zoom.
// Room boxes come from data/map.json (traced off the same map);
// `mode` is always 'plan' now (an aerial photo view was tried and removed).
// room contents come from approved teacher sections whose "room" field matches.

import { initHeader, courses, dataUrl, slugify, $, $$, esc, courseUrl, root, normRoom, collectSchedules, scheduleBlock, courseMatcher, classLinker } from './ui.js';
import { todaysLunch, sortedCats, itemHtml } from './menu.js';

const s = await initHeader();
const svg = $('#map-svg');
const planEl = $('#plan');
const labelsEl = $('#map-labels');
const spots = $('#hotspots');
const stage = $('#map-stage');
const panel = $('#map-panel');

const [map, plan, data, index] = await Promise.all([
  fetch(dataUrl('data/map.json')).then((r) => r.json()),
  fetch(dataUrl('data/map-plan.json')).then((r) => r.json()),
  courses(),
  fetch(dataUrl('data/search.json')).then((r) => r.json()),
]);
const course = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
const teacherSlug = Object.fromEntries(index.filter((x) => x.t === 't').map((x) => [x.n, x.s]));
const roomById = Object.fromEntries(map.rooms.map((r) => [r.id, r]));


// A class name typed into a schedule links to its page when it matches one
const matchCourse = courseMatcher(data.courses);
const classLink = classLinker(data.courses);

// ── room contents from approved teacher sections and room schedules ──
let byRoom = {};
let clubsByRoom = {};
async function loadRooms() {
  const [sections, clubs, schedules] = await Promise.all([s.approved({ kind: 'teacher_section' }), s.approved({ kind: 'club' }),
    s.approved({ kind: 'room_schedule' })]);
  byRoom = {};
  clubsByRoom = {};
  for (const c of clubs) {
    const id = normRoom(c.payload.room);
    if (!id || !c.payload.name) continue;
    const list = (clubsByRoom[id] ??= []);
    if (!list.some((x) => x.name === c.payload.name)) list.push({ name: c.payload.name, meets: c.payload.meets });
  }
  const sched = collectSchedules(schedules, sections);
  const entry = (id, teacher) => {
    const list = (byRoom[id] ??= []);
    let t = list.find((y) => y.teacher === teacher);
    // only this room's schedules: a teacher who moved rooms has older years elsewhere
    if (!t) list.push(t = { teacher, courses: [], schedules: (sched[teacher]?.list || []).filter((x) => x.room === id) });
    return t;
  };
  for (const x of sections) {
    const id = normRoom(x.payload.room);
    if (!id || !x.teacher) continue;
    const t = entry(id, x.teacher);
    if (x.course_slug && !t.courses.includes(x.course_slug)) t.courses.push(x.course_slug);
  }
  for (const [teacher, v] of Object.entries(sched)) {
    for (const id of v.rooms) {
      if (!id) continue;
      const t = entry(id, teacher);
      // classes named in this room's newest schedule count as taught here
      for (const name of Object.values(t.schedules[0]?.periods || {})) {
        const slug = matchCourse(name);
        if (slug && !t.courses.includes(slug)) t.courses.push(slug);
      }
    }
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
// The plan: building fills, the creek, thin room walls, thick outside walls,
// then the official map's symbols and words. Room names come from map.json.
const SYMBOLS = `<defs>
  <pattern id="mp-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="mp-dot"/></pattern>
  <symbol id="mp-restroom" viewBox="-12 -12 24 24"><rect x="-11" y="-11" width="22" height="22" rx="5" style="fill:var(--gold)"/>
    <g style="fill:#111;stroke:#111;stroke-width:1.3;stroke-linecap:round"><circle cx="-4.6" cy="-6" r="1.9"/><path d="M-4.6 -3.2l3 7.2h-6z"/>
    <path d="M-5.9 4v4M-3.3 4v4"/><circle cx="4.6" cy="-6" r="1.9"/><path d="M2.7 -3.2h3.8v6.4h-3.8zM3.6 3.2v4.8M5.6 3.2v4.8"/></g>
    <path d="M0 -8v16" style="stroke:rgba(0,0,0,.35);stroke-width:.8"/></symbol>
  <symbol id="mp-stairs" viewBox="-12 -12 24 24"><path d="M-9 8h5v-5h5v-5h5v-5h4" style="fill:none;stroke:var(--mp-thick);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"/></symbol>
  <symbol id="mp-elevator" viewBox="-12 -12 24 24"><rect x="-8" y="-9" width="16" height="18" rx="2.5" style="fill:none;stroke:var(--mp-thick);stroke-width:1.8"/>
    <path d="M-2.5 -1.5l2.5-3.5 2.5 3.5zM-2.5 1.5l2.5 3.5 2.5-3.5z" style="fill:var(--mp-thick)"/></symbol>
</defs>`;   // (inline styles: page CSS doesn't reach inside <use> copies, but custom properties do)
function drawPlan() {
  const icon = (id, list, size) => list.map(([x, y]) => `<use href="#mp-${id}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"/>`).join('');
  planEl.innerHTML = `${SYMBOLS}
    <rect x="-2000" y="-2000" width="${dims.width + 4000}" height="${dims.height + 4000}" fill="url(#mp-dots)"/>
    <path class="mp-water" d="${plan.water}"/>
    <path class="mp-fill" d="${plan.fill}"/>
    <path class="mp-thin" d="${plan.thin}"/>
    <path class="mp-thick" d="${plan.thick}"/>
    <path class="mp-slant" d="${plan.slants}"/>
    ${icon('restroom', plan.icons.restroom, 15)}${icon('stairs', plan.icons.stairs, 15)}${icon('elevator', plan.icons.elevator, 13)}
    <g class="mp-north" transform="translate(235 112)"><path d="M0 -44L9 18L0 10L-9 18Z"/><text y="-54">N</text></g>`;
  // words the official map prints outside any room box
  const inRoom = (x, y) => map.rooms.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  const words = plan.labels.filter((l) => !inRoom(l.x, l.y)).map((l) => l.s === 'creek'
    ? `<text class="pl pl-creek" transform="translate(${l.x} ${l.y}) rotate(-90)">${esc(l.t)}</text>`
    : `<text class="pl pl-${l.s}" x="${l.x}" y="${l.y}">${esc(l.t)}</text>`).join('');
  labelsEl.innerHTML = words + map.rooms.map(roomLabel).join('');
}
// A room's name, sized to its box; tall narrow boxes read sideways, like the official map.
function roomLabel(r) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const t = r.kind === 'building' ? r.label.replace(/^Classroom /, '') : r.label;
  const big = r.kind === 'place' || r.kind === 'building';
  const side = r.kind === 'classroom' && r.h > r.w * 1.5 && r.w < 34;
  const [len, room] = side ? [r.h, r.w] : [r.w, r.h];
  const words = t.split(' ');
  // one line if it fits, else two (split at the middle word)
  const one = Math.min(big ? 13 : 10.5, (len - 5) / (t.length * 0.58), room * 0.46);
  let lines = [t], fs = one;
  if (words.length > 1 && one < (big ? 9 : 7)) {
    const k = Math.ceil(words.length / 2);
    const two = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
    const f2 = Math.min(big ? 13 : 10.5, (len - 5) / (Math.max(...two.map((x) => x.length)) * 0.58), room * 0.3);
    if (f2 > one) { lines = two; fs = f2; }
  }
  fs = Math.max(4.5, fs);
  const tr = side ? ` transform="rotate(-90 ${cx} ${cy})"` : '';
  const y0 = cy - ((lines.length - 1) * fs * 1.1) / 2;
  return `<text class="rl${big ? ' rl-big' : ''} k-${r.kind}" x="${cx}" y="${y0}" font-size="${fs.toFixed(1)}"${tr}>${lines
    .map((l, i) => `<tspan x="${cx}" dy="${i ? fs * 1.1 : 0}">${esc(l)}</tspan>`).join('')}</text>`;
}
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
  drawPlan();
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
  const add = (teacher) => `${root}submit/?kind=room_schedule&room=${encodeURIComponent(r.id)}${teacher ? `&teacher=${encodeURIComponent(teacher)}` : ''}`;
  if (!list.length && clubs.length) return head + clubHtml;
  if (!list.length) {
    return `${head}<div class="mp-empty">
      <p>${r.kind === 'classroom' ? 'Nobody has added who teaches here yet.' : r.kind === 'office' ? 'An office, not a classroom.' : 'A shared space, not a classroom.'}</p>
      ${r.kind === 'classroom' ? `<p><a class="btn" href="${add()}">Add the teacher and schedule</a></p>
      <p class="meta">Pick the teacher and fill in what they teach each period.</p>` : ''}</div>`;
  }
  return `${head}${list.map((t) => `<section class="mp-teacher">
      <h3>${teacherSlug[t.teacher] ? `<a href="${root}teachers/${teacherSlug[t.teacher]}/">${esc(t.teacher)}</a>` : esc(t.teacher)}</h3>
      ${(() => {
        // The schedule already names its classes; list only the ones it doesn't
        const shown = new Set(Object.values(t.schedules[0]?.periods || {}).map(matchCourse).filter(Boolean));
        const rest = t.courses.filter((slug) => !shown.has(slug));
        return rest.length ? `${shown.size ? '<div class="label mp-also">Also teaches</div>' : ''}<ul class="course-list compact">${rest.map((slug) => {
        const c = course[slug];
        return c ? `<li class="course-row"><a href="${courseUrl(slug)}"><span class="c-name">${esc(c.name)}</span>
          <span class="c-meta">${c.grades ? `Grades ${esc(c.grades)}` : ''}</span></a><span class="c-badges">${badges(c)}</span></li>` : '';
      }).join('')}</ul>` : '';
      })()}
      ${scheduleBlock(t.schedules, { add: add(t.teacher), link: classLink })}
    </section>`).join('')}${clubHtml}
    <p class="meta mp-foot">Wrong, missing or a new school year? <a href="${add()}">Add a schedule for this room</a></p>`;
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
