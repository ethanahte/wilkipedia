// The home page's pathways map: every class in the course catalog, laid out like
// a transit map. Rows are subjects; a class the catalog links to another by a
// prerequisite sits in a column for how far along its chain it is, and one it
// links to nothing (all of English, for one) is a hollow station in a row below,
// in grade order, with no line: nothing here is invented. Point at a class and its whole path lights
// up (what leads to it, and what it leads to), a tip beside it quotes its
// prerequisite, and the catalog's own wording sits underneath; click and the
// map flies into the class page.
//
// Data: data/pathways.json, built by tools/pathways.py from catalog.json.
// Nothing here is inferred: the info bar always quotes the catalog.

import { esc, dataUrl, courseUrl, lessMotion } from './ui.js';

const LANES = [['english', 'English'], ['math', 'Math'], ['science', 'Science'], ['social-science', 'Social science'],
               ['world-language', 'World language'], ['visual-performing-arts', 'Arts'], ['practical-arts', 'Practical arts'],
               ['physical-education', 'PE'], ['electives', 'Electives'], ['svcte', 'SVCTE']];
const W = 1000, GUTTER = 104, TOP = 34, ROW = 27, LANE_PAD = 14;
const HINT = 'Point at a class to see what leads to it and where it goes. Grey lines are prerequisites quoted from the course catalog; gold lines only show which year or level comes next, not a prerequisite; a hollow station is a class linked to no other.';

// Short names for the map only (the info bar and class pages use full names)
const SHORT = {
  'Honors Algebra 2 with PreCalculus and Trigonometry': 'H. Algebra 2 / PreCalc', 'PreCalculus and Trigonometry': 'PreCalc & Trig',
  'PreCalculus and Trigonometry Honors': 'H. PreCalc & Trig', 'Chemistry in the Earth System': 'Chemistry',
  'Honors Chemistry in the Earth System': 'Honors Chemistry', 'Biology of the Living Earth': 'Biology', 'Physics in the Universe': 'Physics',
  'AP Japanese Language and Culture': 'AP Japanese', 'AP Spanish Language & Culture': 'AP Spanish Lang.',
  'AP Spanish Literature & Culture': 'AP Spanish Lit.', 'Physical Education Core 9': 'PE Core 9', 'Course II Physical Education': 'PE Course II',
  'Unified Physical Education': 'Unified PE', 'Principles of Financial Literacy': 'Financial Literacy',
  'AP Computer Science Principles': 'AP CS Principles', 'AP Computer Science A': 'AP CS A', 'Exploring Computer Science': 'Exploring CS',
  'Anatomy and Physiology': 'Anatomy & Physiology', 'Honors Human Physiology': 'H. Human Physiology',
  'AP English Language and Composition': 'AP English Lang.', 'AP English Literature and Composition': 'AP English Lit.',
  'CSU Expository Reading and Writing': 'CSU ERWC', 'EL Beginning-Grammar/Vocabulary/Reading': 'EL Beginning Grammar', 'AP US Government & Politics': 'AP US Gov. & Politics',
  'Heating, Ventilation, & Air Conditional (HVAC)': 'HVAC', 'Medical Science/ Health Careers': 'Medical Science',
  'Mobile App Design and Computer Coding': 'Mobile App Design', 'Fire Science/First Responder': 'Fire Science',
  'Spanish for Native Speakers 1': 'Spanish Native Sp. 1', 'Spanish for Native Speakers 2': 'Spanish Native Sp. 2',
  'Marketing, Sales & Service': 'Marketing & Sales', 'Physical Education Athletics': 'PE Athletics',
};
const short = (n) => SHORT[n] || n.replace(/^ROP /, '').replace(/Fashion Design & Marketing/, 'Fashion Design').replace(/ and /g, ' & ');

// Where a hollow station's grades start, for ordering them: "11-12" → 11
const firstGrade = (n) => +(String(n.grades || '').match(/\d+/)?.[0] || 99);
// then the special programmes grouped after the regular classes: BSC, PRT, EL
const programme = (n) => ({ BSC: 1, PRT: 2, EL: 3 })[n.name.split(' ')[0]] || 0;
const labelW = (n) => 11 + short(n.name).length * 5.8 + 26;      // circle, label, gap

function layout(data) {
  const levels = Math.max(...data.nodes.filter((n) => n.linked).map((n) => n.level)) + 1;
  const colW = (W - GUTTER - 20) / levels;
  const byDept = new Map(LANES.map(([d]) => [d, []]));
  for (const n of data.nodes) (byDept.get(n.dept) || byDept.set(n.dept, []).get(n.dept)).push(n);
  const parents = {};
  for (const e of data.edges) (parents[e.to] ||= []).push(e.from);
  const lanes = [];
  let y = TOP;
  const pos = {};
  for (const [dept, label] of LANES) {
    const list = byDept.get(dept);
    if (!list?.length) continue;
    const cols = Array.from({ length: levels }, () => []);
    list.filter((n) => n.linked).forEach((n) => cols[n.level].push(n));
    // Order each column by where its parents sit, so lines cross less
    cols.forEach((col, lv) => {
      if (lv === 0) col.sort((a, b) => a.name.localeCompare(b.name));
      else col.sort((a, b) => avgY(a) - avgY(b));
      col.forEach((n, i) => { pos[n.slug] = { x: GUTTER + colW * lv + 10, y: y + LANE_PAD + ROW * i + ROW / 2 }; });
    });
    function avgY(n) { const ps = (parents[n.slug] || []).map((p) => pos[p]?.y ?? 0); return ps.length ? ps.reduce((a, b) => a + b) / ps.length : 0; }
    // the classes it links to nothing, flowed in rows under the columns, in grade order
    const top = Math.max(0, ...cols.map((c) => c.length));
    const solo = list.filter((n) => !n.linked).sort((a, b) => programme(a) - programme(b) || firstGrade(a) - firstGrade(b) || a.name.localeCompare(b.name));
    let row = top, x = GUTTER + 10;
    for (const n of solo) {
      const w = labelW(n);
      if (x + w > W && x > GUTTER + 10) { row += 1; x = GUTTER + 10; }
      pos[n.slug] = { x, y: y + LANE_PAD + ROW * row + ROW / 2 };
      x += w;
    }
    const rows = solo.length ? row + 1 : top;
    const h = LANE_PAD * 2 + ROW * Math.max(1, rows);
    lanes.push({ dept, label, y, h });
    y += h;
  }
  return { lanes, pos, height: y + 10, levels, colW };
}

export async function mount(el, s) {
  if (!el) return;
  const data = await (await fetch(dataUrl('data/pathways.json'))).json();
  const { lanes, pos, height, levels, colW } = layout(data);
  const bySlug = Object.fromEntries(data.nodes.map((n) => [n.slug, n]));
  const out = {}, into = {};
  const kindOf = {};                              // "from>to" → 'pre' (catalog prerequisite), 'sequence' or 'exit'
  for (const e of data.edges) kindOf[`${e.from}>${e.to}`] = e.kind || 'pre';
  const outOf = (slug, kind) => (out[slug] || []).filter((t) => kindOf[`${slug}>${t}`] === kind);
  const exits = {};                               // EL Advanced and the classes it leads out into
  for (const e of data.edges) { (out[e.from] ||= []).push(e.to); (into[e.to] ||= []).push(e.from); if (e.kind === 'exit') exits[e.from] = exits[e.to] = true; }
  const walk = (start, next) => { const seen = new Set(); const q = [start]; while (q.length) for (const n of next[q.shift()] || []) if (!seen.has(n)) { seen.add(n); q.push(n); } return seen; };

  // Lines leave a station after its name, so they never strike through a label
  // (label widths are measured once the SVG is on the page).
  const labelEnd = {};
  const edgePath = (a, b) => {
    const p = pos[a], q = pos[b];
    // two classes in the same column (AP Psych is an 11th- and a 12th-grade option):
    // a small bow out to the left of the stations
    if (bySlug[a].level === bySlug[b].level && Math.abs(q.x - p.x) < 1) {
      const bow = 16 + Math.abs(q.y - p.y) * 0.15;
      return `M${p.x - 7},${p.y} C${p.x - bow},${p.y} ${q.x - bow},${q.y} ${q.x - 7},${q.y}`;
    }
    const x2 = q.x - 7;
    const x1 = labelEnd[a] && labelEnd[a] < x2 - 14 ? labelEnd[a] : p.x + 6;
    const dx = Math.max(24, (x2 - x1) * 0.5);
    // Skipping a step along the same row: arc over the station in between
    if (Math.abs(q.y - p.y) < 1 && bySlug[b].level - bySlug[a].level > 1) {
      return `M${x1},${p.y} C${x1 + dx * 0.6},${p.y - 16} ${x2 - dx * 0.6},${q.y - 16} ${x2},${q.y}`;
    }
    return `M${x1},${p.y} C${x1 + dx},${p.y} ${x2 - dx},${q.y} ${x2},${q.y}`;
  };
  const laneOf = (slug) => bySlug[slug].dept;
  const svg = `<svg class="pw-svg" viewBox="0 0 ${W} ${height}" role="group" aria-label="Class pathways">
    ${lanes.map((l, i) => `<g class="pw-lane"><line x1="0" x2="${W}" y1="${l.y}" y2="${l.y}"/>${i === lanes.length - 1 ? `<line x1="0" x2="${W}" y1="${l.y + l.h}" y2="${l.y + l.h}"/>` : ''}
      <text x="0" y="${l.y + 22}">${esc(l.label)}</text></g>`).join('')}
    ${Array.from({ length: levels }, (_, i) => `<text class="pw-col" x="${GUTTER + colW * i + 4}" y="18">${i === 0 ? 'Where it starts' : `Step ${i + 1}`}</text>`).join('')}
    <g class="pw-edges">${data.edges.map((e) => `<path class="pw-edge${laneOf(e.from) !== laneOf(e.to) ? ' far' : ''}${e.kind === 'sequence' ? ' seq' : e.kind === 'exit' ? ' seq exit' : ''}" data-from="${e.from}" data-to="${e.to}" style="--lv:${bySlug[e.from].level}" d="${edgePath(e.from, e.to)}" pathLength="1"/>`).join('')}</g>
    <g class="pw-nodes">${data.nodes.map((n) => `<a class="pw-node${n.linked ? '' : ' solo'}" href="${courseUrl(n.slug)}" data-slug="${n.slug}" style="--lv:${n.level}"
        transform="translate(${pos[n.slug].x} ${pos[n.slug].y})" aria-label="${esc(n.name)}${n.prereq ? `. Prerequisite: ${esc(n.prereq)}` : ''}">
        <circle r="5.5"/><text x="11" y="4">${esc(short(n.name))}</text></a>`).join('')}</g>
  </svg>`;

  el.innerHTML = `<div class="pw-scroll">${svg}</div>
    <div class="pw-info" aria-live="polite"><p class="pw-hint">${HINT}</p></div>`;
  const root = $('.pw-svg', el), info = $('.pw-info', el);
  for (const a of root.querySelectorAll('.pw-node')) {
    const w = a.querySelector('text').getComputedTextLength();
    labelEnd[a.dataset.slug] = pos[a.dataset.slug].x + 11 + w + 5;
  }
  for (const p of root.querySelectorAll('.pw-edge')) p.setAttribute('d', edgePath(p.dataset.from, p.dataset.to));

  // Classes students have written about glow gold
  s.contentIndex?.().then((has) => {
    for (const a of root.querySelectorAll('.pw-node')) a.classList.toggle('has', has.has(a.dataset.slug));
  }).catch(() => {});

  // The tip beside the class you're pointing at: its prerequisite, word for word.
  // Fixed to the page (not inside the scrolling map) so it's never clipped.
  const tip = document.createElement('div');
  tip.className = 'pw-tip';
  tip.setAttribute('aria-hidden', 'true');   // the info bar below already reads it out
  document.body.append(tip);
  function showTip(a) {
    if (!a) { tip.classList.remove('on'); return; }
    const n = bySlug[a.dataset.slug];
    const none = !n.prereq || /^none\.?$/i.test(n.prereq.trim());   // the catalog sometimes just says "None"
    tip.innerHTML = `<b>${esc(n.name)}</b>${none
      ? `<span class="pw-tip-k">${n.prereq ? 'No prerequisite' : 'No prerequisite listed'}</span>`
      : `<span class="pw-tip-k">Prerequisite</span>“${esc(n.prereq)}”`}`;
    const r = a.querySelector('circle').getBoundingClientRect(), gap = 10;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left - 12, y = r.top - th - gap;
    if (y < 8) y = r.bottom + gap;                                   // no room above: go below
    x = Math.max(8, Math.min(x, innerWidth - tw - 8));
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
    tip.classList.add('on');
  }
  addEventListener('scroll', () => showTip(null), { passive: true });
  $('.pw-scroll', el).addEventListener('scroll', () => showTip(null), { passive: true });

  let pinned = null;
  const names = (list) => list.map((x) => `<a href="${courseUrl(x)}">${esc(bySlug[x].name)}</a>`).join(', ');
  function focus(slug) {
    root.classList.toggle('focusing', !!slug);
    const up = slug ? walk(slug, into) : new Set(), down = slug ? walk(slug, out) : new Set();
    for (const a of root.querySelectorAll('.pw-node')) {
      const k = a.dataset.slug;
      a.classList.toggle('on', k === slug);
      a.classList.toggle('near', up.has(k) || down.has(k));
    }
    for (const p of root.querySelectorAll('.pw-edge')) {
      const { from, to } = p.dataset;
      const lit = slug && ((to === slug || up.has(to)) && (from === slug || up.has(from)) || (from === slug || down.has(from)) && (to === slug || down.has(to)));
      p.classList.toggle('lit', !!lit);
    }
    if (!slug) { info.innerHTML = `<p class="pw-hint">${HINT}</p>`; return; }
    const n = bySlug[slug];
    info.innerHTML = `<div class="pw-card">
      <div><a class="pw-name" href="${courseUrl(slug)}">${esc(n.name)}</a>${n.grades ? `<span class="meta"> · grades ${esc(n.grades)}</span>` : ''}</div>
      ${n.prereq ? `<p><span class="pw-k">Catalog prerequisite</span> “${esc(n.prereq)}”</p>` : '<p><span class="pw-k">Catalog prerequisite</span> none listed</p>'}
      ${outOf(slug, 'pre').length ? `<p><span class="pw-k">Leads to</span> ${names(outOf(slug, 'pre'))}</p>` : ''}
      ${outOf(slug, 'sequence').length ? `<p><span class="pw-k">Next year or level</span> ${names(outOf(slug, 'sequence'))}</p>` : ''}
      ${exits[slug] ? '<p><span class="pw-k">Leaving EL</span> Finish EL Advanced to move into the English class for your grade.</p>' : ''}
      <a class="add-link" href="${courseUrl(slug)}">Open the class page →</a></div>`;
  }

  // Fly into the class, then go there (the page transition takes it from here)
  function fly(a) {
    const href = a.getAttribute('href');
    if (lessMotion()) { location.href = href; return; }
    const p = pos[a.dataset.slug];
    const from = root.viewBox.baseVal, to = { x: p.x - 60, y: p.y - 34, w: 120, h: 68 };
    const start = { x: from.x, y: from.y, w: from.width, h: from.height };
    root.classList.add('flying');
    const t0 = performance.now(), D = 520;
    setTimeout(() => { location.href = href; }, D + 250);   // go even if animation frames are held back
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    (function step(now) {
      const k = ease(Math.min(1, (now - t0) / D));
      root.setAttribute('viewBox', ['x', 'y', 'w', 'h'].map((q) => start[q] + (to[q] - start[q]) * k).join(' '));
      if (k < 1) requestAnimationFrame(step); else location.href = href;
    })(t0);
  }

  const touch = matchMedia('(hover: none)').matches;
  root.addEventListener('pointerover', (e) => { const a = e.target.closest('.pw-node'); if (a && !touch) { focus(a.dataset.slug); showTip(a); } });
  root.addEventListener('pointerout', (e) => { if (!touch && e.target.closest('.pw-node') && !e.relatedTarget?.closest?.('.pw-node')) showTip(null); });
  root.addEventListener('pointerleave', () => { if (!touch) { focus(pinned); showTip(null); } });
  root.addEventListener('focusin', (e) => { const a = e.target.closest('.pw-node'); if (a) { focus(a.dataset.slug); showTip(a); } });
  root.addEventListener('focusout', () => showTip(null));
  root.addEventListener('click', (e) => {
    const a = e.target.closest('.pw-node');
    if (!a) { pinned = null; focus(null); showTip(null); return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;                  // new tab: let the browser do it
    e.preventDefault();
    if (touch && pinned !== a.dataset.slug) { pinned = a.dataset.slug; focus(pinned); showTip(a); return; }   // tap once to look, twice to go
    showTip(null);
    fly(a);
  });

  // Draw the lines in when the map first scrolls into view
  if (lessMotion() || !('IntersectionObserver' in window)) root.classList.add('in');
  else new IntersectionObserver((es, io) => { if (es.some((x) => x.isIntersecting)) { root.classList.add('in'); io.disconnect(); } }, { threshold: 0.25 }).observe(root);

  // Coming back with the Back button: undo the zoom
  addEventListener('pageshow', (e) => { if (e.persisted) { root.setAttribute('viewBox', `0 0 ${W} ${height}`); root.classList.remove('flying'); } });
}

function $(sel, el) { return el.querySelector(sel); }
