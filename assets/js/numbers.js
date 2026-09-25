// "By the numbers": five charts about Wilcox, each built from a lieflat-charts
// gallery template (Lupi editorial / basics families) with its SVG skeleton,
// unit encoding and reveal timing kept, and the data swapped for real
// Wilcox data. Every dot, tick and rung is one real record you can hover.
//
//   1  L2 Dot Cascade (dark)   classes per subject; gold = students wrote it
//   2  L4 Arc Matrix           which subjects meet each UC/CSU a–g letter
//   3  F5 Tick Rows (wide)     classes open to each grade; gold = AP
//   4  F1 Rung Bars            which weekday clubs meet, shaded by how often
//   5  L3 Barcode Lollipop     every fall-semester day, height = time at school
//
// Colour: Mono ladder + one hero, Wilcox gold (the site's brand colour, per the
// skill's custom-palette rule). Ladder values come from CSS so night mode works.
// Helpers (el/txt/tip/rnd/obsReveal) are from lieflat-charts' mono-tokens.js.

import { initHeader, $, courses, dataUrl, courseUrl, root, slugify } from './ui.js';
import { loadBell, dayPlan, clock } from './bell.js';

const s = await initHeader();

// ── mono-tokens helpers ──
const NS = 'http://www.w3.org/2000/svg';
const el = (p, t, a) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); p.appendChild(n); return n; };
const txt = (p, a, str) => { const n = el(p, 'text', a); n.textContent = str; return n; };
const tip = (n, str) => { const t = document.createElementNS(NS, 'title'); t.textContent = str; n.appendChild(t); };
const rnd = (i, k) => Math.abs(((i * 73856093) ^ (k * 19349663)) % 1000) / 1000;
const link = (n, href) => { n.style.cursor = 'pointer'; n.addEventListener('click', (e) => { e.stopPropagation(); location.href = href; }); };
function obsReveal(id, fn) {
  const n = document.getElementById(id);
  const go = () => { n.innerHTML = ''; fn(n); };
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { go(); io.disconnect(); } }, { threshold: 0.3 });
  io.observe(n);
  n.addEventListener('click', go);              // click the chart to replay it
  redraw.push(go);
}
const redraw = [];
let C;                                           // colour roles, read from CSS
const readColours = () => {
  const cs = getComputedStyle(document.documentElement), v = (k) => cs.getPropertyValue(k).trim();
  C = { INK: v('--ch1'), L2: v('--ch2'), L3: v('--ch3'), L4: v('--ch4'), MUTED: v('--muted'), GRID: v('--rule'), HERO: v('--accent'), PAPER: '#F0EFEB' };
};
readColours();
// Night mode flips the ladder: redraw (without replaying from blank) on theme change
new MutationObserver(() => { readColours(); redraw.forEach((f) => f()); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

const [data, has, activities, bell] = await Promise.all([
  courses(), s.contentIndex().catch(() => new Set()),
  fetch(dataUrl('data/activities.json')).then((r) => r.json()), loadBell()]);
const dept = Object.fromEntries(data.departments.map((d) => [d.slug, d.name]));
const SHORT = { english: 'ENG', math: 'MATH', 'social-science': 'SOC', science: 'SCI', 'world-language': 'LANG', 'physical-education': 'PE',
                'visual-performing-arts': 'ARTS', 'practical-arts': 'CTE', electives: 'ELEC', svcte: 'SVC' };

// ════ 1 · dot cascade on dark (L2) · how much of Wilcox is written ════
(() => {
  const subj = data.departments.map((d) => ({ slug: d.slug, list: data.courses.filter((c) => c.department === d.slug) }))
    .filter((d) => d.list.length).sort((a, b) => a.list.length - b.list.length);
  const written = data.courses.filter((c) => has.has(c.slug)).length;
  $('#h-cascade').textContent = written
    ? `${written} of ${data.courses.length} classes have student info so far`
    : `All ${data.courses.length} classes are still waiting for their first write-up`;
  obsReveal('cascade', (sv) => {
    const n = subj.length, x = (i) => 40 + i * (330 / (n - 1)), base = (i) => 282 - i * 7.5, step = 7.4;
    el(sv, 'line', { x1: x(0) - 10, y1: base(0) + 4, x2: x(n - 1) + 10, y2: base(n - 1) + 4, stroke: '#4A4944', 'stroke-width': 1, 'stroke-dasharray': '2 4', class: 'fade' });
    subj.forEach((d, i) => {
      const bx = x(i), by = base(i);
      // written classes first, so gold fills each column from the bottom
      const list = [...d.list].sort((a, b) => has.has(b.slug) - has.has(a.slug) || a.name.localeCompare(b.name));
      list.forEach((c, k) => {
        const w = has.has(c.slug);
        const dot = el(sv, 'circle', { cx: bx, cy: by - 12 - k * step, r: w ? 2.8 : 2.2, fill: w ? '#f5c400' : '#6A6963',
          class: 'pop', style: `animation-delay:${i * 0.05 + k * 0.02}s` });
        tip(dot, `${c.name} — ${w ? 'students have written about it' : 'not written yet'}`);
        link(dot, courseUrl(c.slug));
      });
      const topY = by - 12 - list.length * step;
      const top = el(sv, 'circle', { cx: bx, cy: topY, r: 4.6, fill: C.PAPER, class: 'pop', style: `animation-delay:${i * 0.05 + list.length * 0.02}s` });
      const wn = list.filter((c) => has.has(c.slug)).length;
      tip(top, `${dept[d.slug]} — ${list.length} classes, ${wn} written`);
      txt(sv, { x: bx, y: topY - 10, 'font-size': 9, 'font-weight': 700, fill: C.PAPER, 'text-anchor': 'middle', class: 'fade', style: `animation-delay:${0.2 + i * 0.05}s` }, list.length);
      txt(sv, { x: bx, y: by + 12, 'font-size': 7, 'font-weight': 600, fill: '#8F8E88', 'text-anchor': 'end', transform: `rotate(-90 ${bx} ${by + 12})`,
                class: 'fade', style: `animation-delay:${0.1 + i * 0.05}s` }, SHORT[d.slug] || d.slug.slice(0, 4).toUpperCase());
    });
  });
})();

// ════ 3 · arc bubble matrix (L4) · a–g letters by subject ════
(() => {
  const LET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', '—'];
  const NAME = { A: 'History', B: 'English', C: 'Math', D: 'Science', E: 'Language', F: 'Arts', G: 'Elective', '—': 'None' };
  // The catalog writes these loosely ("D/G", "D for 3rd year or higher"); a
  // pending approval is not counted as a–g yet.
  const letters = (u) => {
    if (!u || /none|pending/i.test(u)) return ['—'];
    const m = [...new Set(u.toUpperCase().match(/\b[A-G]\b/g) || [])];
    return m.length ? m : ['—'];
  };
  const rows = data.departments.filter((d) => data.courses.some((c) => c.department === d.slug));
  const cell = {};
  for (const c of data.courses) for (const l of letters(c.ucCsu)) (cell[`${c.department}|${l}`] ||= []).push(c);
  obsReveal('arcmatrix', (sv) => {
    const rowY = (i) => 80 + i * 28, colX = (j) => 116 + j * 38, dy = (j) => -14 * Math.sin(Math.PI * j / (LET.length - 1));
    const all = rows.flatMap((d, i) => LET.map((l, j) => [(cell[`${d.slug}|${l}`] || []).length, i, j]));
    const top = all.sort((a, b) => b[0] - a[0]).slice(0, 4).map((d) => d[1] * 100 + d[2]);
    rows.forEach((d, i) => {
      const path = 'M' + LET.map((_, j) => `${colX(j)} ${rowY(i) + dy(j)}`).join(' L ');
      el(sv, 'path', { d: path, fill: 'none', stroke: C.GRID, 'stroke-width': 1, pathLength: 1, class: 'draw', style: `animation-delay:${i * 0.08}s` });
      txt(sv, { x: 104, y: rowY(i) + 3, 'font-size': 8, 'font-weight': 600, fill: C.MUTED, 'text-anchor': 'end', class: 'fade', style: `animation-delay:${i * 0.08}s` },
        dept[d.slug].replace(' (off-campus)', ''));
      LET.forEach((l, j) => {
        const x = colX(j), y = rowY(i) + dy(j), list = cell[`${d.slug}|${l}`] || [], vv = list.length;
        if (!vv) { el(sv, 'circle', { cx: x, cy: y, r: 0.9, fill: C.L4, class: 'pop', style: `animation-delay:${0.2 + i * 0.08 + j * 0.02}s` }); return; }
        const fill = l === '—' ? C.L3 : vv >= 10 ? C.INK : vv >= 4 ? C.L2 : C.L3;
        const dot = el(sv, 'circle', { cx: x, cy: y, r: Math.sqrt(vv) * 2.1, fill, class: 'pop', style: `animation-delay:${0.2 + i * 0.08 + j * 0.02}s` });
        tip(dot, `${dept[d.slug]} · ${l === '—' ? 'doesn’t count toward a–g' : `a–g "${l}" (${NAME[l]})`} — ${vv} class${vv === 1 ? '' : 'es'}:\n${list.slice(0, 10).map((c) => c.name).join('\n')}${vv > 10 ? `\n…and ${vv - 10} more` : ''}`);
        if (top.includes(i * 100 + j)) txt(sv, { x, y: y - Math.sqrt(vv) * 2.1 - 4, 'font-size': 7, 'font-weight': 800, fill: C.INK, 'text-anchor': 'middle', class: 'fade', style: 'animation-delay:.6s' }, vv);
      });
    });
    LET.forEach((l, j) => {
      const x = colX(j), y = 80 + dy(j) - 38;
      txt(sv, { x, y, 'font-size': 9, 'font-weight': 800, fill: l === '—' ? C.MUTED : C.INK, 'text-anchor': 'middle', class: 'fade', style: `animation-delay:${j * 0.03}s` }, l);
      txt(sv, { x, y: y + 9 + (j % 2) * 7, 'font-size': 6.5,   // staggered so neighbours never touch
                'font-weight': 600, fill: C.MUTED, 'text-anchor': 'middle', class: 'fade', style: `animation-delay:${j * 0.03}s` }, NAME[l].toUpperCase());
    });
  });
})();

// ════ C1 · tick rows (F5) · classes open to each grade ════
(() => {
  const gradesOf = (g) => {                        // "9-12", "10 -12", "9 (Class of 2027) and 11-12 …"
    const out = new Set();
    for (const m of String(g || '').matchAll(/(\d{1,2})\s*-\s*(\d{1,2})|\b(9|10|11|12)\b/g)) {
      if (m[1]) for (let k = +m[1]; k <= +m[2]; k++) out.add(k); else out.add(+m[3]);
    }
    return [...out].filter((k) => k >= 9 && k <= 12);
  };
  const G = [9, 10, 11, 12].map((g) => {
    const list = data.courses.filter((c) => gradesOf(c.grades).includes(g));
    return { g, list: [...list.filter((c) => !c.name.startsWith('AP ')), ...list.filter((c) => c.name.startsWith('AP '))] };
  });
  const max = Math.max(...G.map((r) => r.list.length));
  $('#h-grades').textContent = `A 9th grader can take ${G[0].list.length} classes; a senior can take ${G[3].list.length}`;
  obsReveal('tickrows', (sv) => {
    const y0 = (i) => 44 + i * 48, X0 = 96, PX = Math.min(6.9, 660 / max);
    G.forEach(({ g, list }, i) => {
      const y = y0(i);
      txt(sv, { x: 86, y: y + 3, 'font-size': 8, 'font-weight': 700, fill: C.MUTED, 'text-anchor': 'end', 'letter-spacing': '.08em', class: 'fade', style: `animation-delay:${i * 0.08}s` }, `GRADE ${g}`);
      el(sv, 'line', { x1: X0, y1: y + 9, x2: X0 + max * PX, y2: y + 9, stroke: C.GRID, 'stroke-width': 0.6, class: 'fade', style: `animation-delay:${i * 0.08}s` });
      list.forEach((c, k) => {
        const x = X0 + k * PX + PX / 2, h = 9 + rnd(k + 1, i + 2) * 6, ap = c.name.startsWith('AP ');
        const t = el(sv, 'line', { x1: x, y1: y + 9, x2: x, y2: y + 9 - h, stroke: ap ? C.HERO : C.INK, 'stroke-width': ap ? 1.6 : 0.9,
          opacity: ap ? 1 : 0.55 + rnd(k + 3, i + 5) * 0.45, class: 'fade', style: `animation-delay:${i * 0.08 + k * 0.004}s` });
        // a wider invisible twin line is the hover target (big-threads rule)
        const hit = el(sv, 'line', { x1: x, y1: y + 12, x2: x, y2: y - 8, stroke: 'transparent', 'stroke-width': PX });
        tip(hit, `${c.name} · grades ${c.grades}`);
        link(hit, courseUrl(c.slug));
        if (k % 5 === 4) el(sv, 'circle', { cx: x, cy: y + 13, r: 0.8, fill: C.L3, class: 'fade', style: `animation-delay:${i * 0.08 + k * 0.004}s` });
        void t;
      });
      const ap = list.filter((c) => c.name.startsWith('AP ')).length;
      txt(sv, { x: X0 + list.length * PX + 10, y: y + 4, 'font-size': 11, 'font-weight': 800, fill: C.INK, class: 'fade', style: `animation-delay:${0.4 + i * 0.08}s` }, list.length);
      if (ap) txt(sv, { x: X0 + list.length * PX + 10 + String(list.length).length * 7 + 6, y: y + 4, 'font-size': 8, 'font-weight': 700, fill: C.HERO, class: 'fade', style: `animation-delay:${0.45 + i * 0.08}s` }, `${ap} AP`);
    });
    txt(sv, { x: 420, y: 238, 'font-size': 7, 'font-weight': 600, fill: C.L3, 'text-anchor': 'middle', 'letter-spacing': '.12em', class: 'fade', style: 'animation-delay:.9s' },
      'ONE TICK = ONE CLASS YOU CAN TAKE · GOLD = AP · DOT MARKS EVERY FIFTH');
  });
})();

// ════ B1 · rung bars (F1) · the weekday clubs meet ════
(() => {
  const DAYS = [['MON', /\bmon(day)?s?\b/i], ['TUE', /\btue(s|sday)?s?\b/i], ['WED', /\bwed(nesday)?s?\b/i], ['THU', /\bthu(rs|rsday)?s?\b/i], ['FRI', /\bfri(day)?s?\b/i]];
  const freq = (m) => (/every day|weekly|every (mon|tue|wed|thu|fri)|every friday|mondays and/i.test(m) ? 0
    : /biweekly|bi-weekly|every other|every two|twice a month/i.test(m) ? 1 : /month|bimonthly|\b(1st|2nd|3rd|first|second|third|last)\b/i.test(m) ? 2 : 3);
  const FREQ = ['every week', 'every two weeks', 'once a month', 'how often isn’t listed'];
  const cols = DAYS.map(([d]) => ({ d, list: [] }));
  let noDay = 0;
  for (const c of activities.clubs) {
    const m = c.meets || '';
    const every = /every day/i.test(m);
    const hit = DAYS.map(([, re], i) => (every || re.test(m) ? i : -1)).filter((i) => i >= 0);
    if (!hit.length) { noDay++; continue; }
    for (const i of hit) cols[i].list.push({ ...c, f: freq(m) });
  }
  cols.forEach((col) => col.list.sort((a, b) => a.f - b.f));
  const best = [...cols].sort((a, b) => b.list.length - a.list.length)[0];
  const long = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday' };
  $('#h-clubs').textContent = `${long[best.d]} is the busiest club day`;
  $('#n-clubs').textContent = `${noDay} of ${activities.clubs.length} clubs don’t list a set day. A club that names two possible days counts on both.`;
  obsReveal('rungs', (sv) => {
    const x0 = (i) => 72 + i * 64, base = 262, step = Math.min(7.2, 220 / Math.max(...cols.map((c) => c.list.length))), HW = 16;
    cols.forEach(({ d, list }, i) => {
      const x = x0(i);
      list.forEach((c, k) => {
        const y = base - k * step, w = HW - 1.5 + rnd(k + 1, i + 2) * 3;
        const r = el(sv, 'line', { x1: x - w, y1: y, x2: x + w, y2: y, stroke: [C.INK, C.L2, C.L3, C.L4][c.f], 'stroke-width': 2.2,
          class: 'fade', style: `animation-delay:${i * 0.08 + k * 0.02}s` });
        const hit = el(sv, 'rect', { x: x - HW - 2, y: y - step / 2, width: HW * 2 + 4, height: step, fill: 'transparent' });
        tip(hit, `${c.name} — ${c.meets}`);
        link(hit, `${root}clubs/#${slugify(c.name)}`);
        if (k % 5 === 4) el(sv, 'circle', { cx: x + HW + 4.5, cy: y, r: 0.8, fill: C.L3, class: 'fade', style: `animation-delay:${i * 0.08 + k * 0.02}s` });
        void r;
      });
      const topY = base - (list.length - 1) * step;
      txt(sv, { x, y: topY - 10, 'font-size': 11, 'font-weight': 800, fill: C.INK, 'text-anchor': 'middle', class: 'fade', style: `animation-delay:${0.4 + i * 0.08}s` }, list.length);
      txt(sv, { x, y: base + 18, 'font-size': 7.5, 'font-weight': 700, fill: C.MUTED, 'text-anchor': 'middle', 'letter-spacing': '.08em', class: 'fade', style: `animation-delay:${i * 0.08}s` }, d);
    });
    el(sv, 'line', { x1: 36, y1: base + 4, x2: 364, y2: base + 4, stroke: C.GRID, 'stroke-width': 0.8, class: 'fade' });
    FREQ.forEach((f, k) => {
      const lx = 40 + k * 84;
      el(sv, 'line', { x1: lx, y1: 300, x2: lx + 12, y2: 300, stroke: [C.INK, C.L2, C.L3, C.L4][k], 'stroke-width': 2.2, class: 'fade' });
      txt(sv, { x: lx + 16, y: 302.5, 'font-size': 6.8, 'font-weight': 600, fill: C.MUTED, class: 'fade' }, f);
    });
  });
})();

// ════ 2 · barcode lollipop (L3) · the fall semester, day by day ════
(() => {
  const start = new Date(2026, 7, 11), end = new Date(2026, 11, 18);   // the dates bell.json covers
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const plans = days.map((d) => ({ d, p: dayPlan(bell, d) }));
  const endOf = (p) => (p.periods ? p.periods[p.periods.length - 1][2] : null);
  const offRuns = [];                                  // school days off in a row → a label
  plans.forEach(({ d, p }, i) => {
    const wk = d.getDay() > 0 && d.getDay() < 6;
    if (wk && p.off && p.off !== 'Weekend') {
      const last = offRuns[offRuns.length - 1];
      if (last && last.reason === p.off && i - last.to <= 3) last.to = i; else offRuns.push({ reason: p.off, from: i, to: i });
    }
  });
  const finals = plans.map((x, i) => (x.p.key?.startsWith('finals') ? i : -1)).filter((i) => i >= 0);
  const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  obsReveal('barcode', (sv) => {
    const N = days.length, X = (i) => 20 + i * (736 / (N - 1)), T = (m) => 252 - (m - 8 * 60 - 45) * 0.43;   // height ∝ time at school
    // time guides: 1, 2, 3, 4 pm (furniture, no data)
    for (const h of [13, 14, 15, 16]) {
      el(sv, 'line', { x1: 14, y1: T(h * 60), x2: 762, y2: T(h * 60), stroke: C.GRID, 'stroke-width': 0.5, 'stroke-dasharray': '1 4', class: 'fade' });
      txt(sv, { x: 770, y: T(h * 60) + 2.5, 'font-size': 6.5, 'font-weight': 600, fill: C.MUTED, class: 'fade' }, `${h - 12} PM`);
    }
    plans.forEach(({ d }, i) => el(sv, 'line', { x1: X(i), y1: 8, x2: X(i), y2: 258, stroke: C.GRID, 'stroke-width': 0.6, opacity: 0.6, class: 'fade', style: `animation-delay:${i * 0.003}s` }));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    plans.forEach(({ d, p }, i) => {
      const x = X(i), wk = d.getDay() > 0 && d.getDay() < 6, e = endOf(p);
      let dot;
      if (e && wk) {
        const y = T(mins(e)), short = mins(e) < 14 * 60;
        el(sv, 'line', { x1: x, y1: y, x2: x, y2: 256, stroke: C.INK, 'stroke-width': 1.1, class: 'fade', style: `animation-delay:${0.3 + i * 0.006}s` });
        dot = el(sv, 'circle', { cx: x, cy: y, r: short ? 3.8 : 2.4, fill: short ? C.HERO : C.INK, class: 'pop', style: `animation-delay:${0.3 + i * 0.006}s` });
        tip(dot, `${fmt(d)} — ${p.label || 'School day'}, out at ${clock(e)}`);
      } else if (p.adjusted && wk) {
        dot = el(sv, 'circle', { cx: x, cy: 244, r: 2.6, fill: 'none', stroke: C.INK, 'stroke-width': 1, 'stroke-dasharray': '1.5 1.5', class: 'pop', style: `animation-delay:${0.3 + i * 0.006}s` });
        tip(dot, `${fmt(d)} — ${p.adjusted} (the school hasn’t published the times)`);
      } else {
        dot = el(sv, 'circle', { cx: x, cy: 256, r: wk ? 2.4 : 1, fill: wk ? 'none' : C.L4, stroke: wk ? C.INK : 'none', 'stroke-width': 1, class: 'pop', style: `animation-delay:${0.3 + i * 0.006}s` });
        tip(dot, `${fmt(d)} — ${wk ? `no school · ${p.off}` : 'weekend'}`);
      }
      if (+d === +today) {
        el(sv, 'line', { x1: x, y1: 4, x2: x, y2: 262, stroke: C.HERO, 'stroke-width': 1.4, class: 'fade' });
        txt(sv, { x, y: 2, 'font-size': 7, 'font-weight': 800, fill: C.HERO, 'text-anchor': 'middle', class: 'fade' }, 'TODAY');
      }
    });
    // marginalia: breaks and finals, from the data
    offRuns.filter((r) => r.to > r.from || /break|holiday/i.test(r.reason)).forEach((r, k) => {
      const x = (X(r.from) + X(r.to)) / 2;
      txt(sv, { x, y: 226 - (k % 2) * 12, 'font-size': 7, 'font-style': 'italic', fill: C.MUTED, 'text-anchor': 'middle', class: 'fade', style: 'animation-delay:1s' }, r.reason.toLowerCase());
    });
    if (finals.length) {
      const x = X(finals[0]) - 4, y = T(13 * 60 + 5) - 14;
      txt(sv, { x, y, 'font-size': 7, 'font-style': 'italic', fill: C.MUTED, 'text-anchor': 'end', class: 'fade', style: 'animation-delay:1.1s' }, 'finals: out by 1:05 →');
    }
    ['AUG', 'SEP', 'OCT', 'NOV', 'DEC'].forEach((m, k) => {
      const i = plans.findIndex(({ d }) => d.getMonth() === 7 + k);
      if (i >= 0) txt(sv, { x: X(i), y: 276, 'font-size': 8, 'font-weight': 600, fill: C.MUTED, 'letter-spacing': '.12em', class: 'fade' }, m);
    });
  });
})();
