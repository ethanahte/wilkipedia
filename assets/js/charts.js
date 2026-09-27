// The two charts kept from the old "By the numbers" page (retired: Ethan asked
// what the rest were for). Each is a lieflat-charts template with real Wilcox data.
//   mountArcMatrix()  which subjects meet each UC/CSU a–g letter   (All classes page)
//   mountCascade(s)   classes per subject, gold = students wrote it (Contribute page)
// Helpers (el/txt/tip/rnd/obsReveal) are from lieflat-charts' mono-tokens.js.

import { $, courses, courseUrl } from './ui.js';

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

const SHORT = { english: 'ENG', math: 'MATH', 'social-science': 'SOC', science: 'SCI', 'world-language': 'LANG', 'physical-education': 'PE',
                'visual-performing-arts': 'ARTS', 'practical-arts': 'CTE', electives: 'ELEC', svcte: 'SVC' };

// How much of Wilcox is written: one dot per class, gold once students have written about it
export async function mountCascade(s) {
  const [data, has] = await Promise.all([courses(), s.contentIndex().catch(() => new Set())]);
  const dept = Object.fromEntries(data.departments.map((d) => [d.slug, d.name]));
  const subj = data.departments.map((d) => ({ slug: d.slug, list: data.courses.filter((c) => c.department === d.slug) }))
    .filter((d) => d.list.length).sort((a, b) => a.list.length - b.list.length);
  const written = data.courses.filter((c) => has.has(c.slug)).length;
  if ($('#h-cascade')) $('#h-cascade').textContent = written
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
}

// Where each UC/CSU a–g requirement can be met, by subject
export async function mountArcMatrix() {
  const data = await courses();
  const dept = Object.fromEntries(data.departments.map((d) => [d.slug, d.name]));
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
}
