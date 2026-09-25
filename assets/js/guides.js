// Study guides as a graph, modelled on Obsidian's graph view and built from the
// lieflat-charts "Force Graph, Dense" template (ECharts force layout, dark card,
// hover focuses neighbours). Every dot is a real record: a study guide someone
// shared, or a class.
//
// How dots connect:
//   guide → its class      the class works like an Obsidian folder/tag hub
//   guide ↔ guide          they share meaningful words in their titles or
//                          "what it's good for" notes (see keywords())
//   class ↔ class          a prerequisite link from the course catalog
//                          (data/pathways.json, same as the home page map)
// Classes with no guides yet are dim, like Obsidian's unresolved notes.

import { initHeader, $, esc, courses, dataUrl, courseUrl, safeUrl, root, lessMotion } from './ui.js';

const s = await initHeader();
const OPTS_KEY = 'wilkipedia-graph';
const C = { bg: '#1e1e1e', node: '#a8a8a8', guide: '#dcddde', hub: '#dcddde', empty: '#4a4a4a', line: '#3f3f3f', accent: '#f5c400', text: '#dcddde' };

// Words that say nothing about the topic (so they never create a link)
const STOP = new Set(`a an the and or of for to in on at by with from into over under about as is are was were be been it its this that these those
  you your we our they their i me my he she his her them us all any each every both more most other some such no not only own same so than too very can will just
  also there here what which who whom when where why how do does did done doing have has had having make made makes using use used
  study guide guides notes note review reviews reviewing practice test tests quiz quizzes exam exams final finals midterm unit units chapter chapters ch sec section sections
  part parts sheet sheets packet answer answers key keys flashcard flashcards quizlet video videos lesson lessons class classes course ap honors semester
  worksheet worksheets summary outline prep complete full best good great help helps helpful covers cover covering includes including everything things thing
  interactive built slides slide warm warmups warm-ups problems problem example examples question questions hidden labeled textbook lecture lectures data set sets
  same numbers line up come comes which usually hardest facts one two three four five first second new way`.split(/\s+/));
const stem = (w) => w.replace(/ies$/, 'y').replace(/(?<=[a-z]{3})s$/, '');
function keywords(text) {
  const out = new Set();
  const t = String(text || '').toLowerCase();
  for (const m of t.matchAll(/\b(?:unit|chapter|ch|section|sec)\.?\s*(\d+[a-z]?)/g)) out.add(`#${m[1]}`);   // "Ch. 6", "Unit 2"
  for (const w of t.replace(/[’']/g, '').split(/[^a-z0-9]+/)) {
    if (w.length < 3 || /^\d/.test(w) || STOP.has(w)) continue;
    const st = stem(w);
    if (!STOP.has(st)) out.add(st);
  }
  return out;
}

const [data, pw, guides] = await Promise.all([courses(), fetch(dataUrl('data/pathways.json')).then((r) => r.json()).catch(() => ({ edges: [] })),
                                              s.approved({ kind: 'resource' }).catch(() => [])]);
const bySlug = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
const dept = Object.fromEntries(data.departments.map((d) => [d.slug, d.name]));

let opts = { orphans: true, prereq: true, words: true, labels: 1.4, size: 1, thick: 1, repel: 60, link: 40, gravity: .08 };
try { Object.assign(opts, JSON.parse(localStorage.getItem(OPTS_KEY)) || {}); } catch { /* storage blocked */ }
const save = () => { try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch { /* ignore */ } };

// ── build the graph ──
function graph(filter = '') {
  const q = filter.trim().toLowerCase();
  const G = guides.map((g) => ({ ...g, words: keywords(g.payload.title), note: keywords(g.payload.note),
                                 hit: !q || `${g.payload.title} ${g.payload.note || ''} ${bySlug[g.course_slug]?.name || ''}`.toLowerCase().includes(q) }));
  const withGuides = new Set(G.map((g) => g.course_slug));
  const prereqLinks = pw.edges.filter((e) => bySlug[e.from] && bySlug[e.to]);
  const linked = new Set(prereqLinks.flatMap((e) => [e.from, e.to]));
  const nodes = [], links = [], deg = {};
  const bump = (id) => { deg[id] = (deg[id] || 0) + 1; };

  // classes (hubs); classes without guides are "unresolved": dim, hollow
  for (const c of data.courses) {
    if (!withGuides.has(c.slug) && !(opts.orphans && linked.has(c.slug))) continue;
    nodes.push({ id: 'c:' + c.slug, kind: 'class', slug: c.slug, name: c.name, has: withGuides.has(c.slug),
                 hit: !q || c.name.toLowerCase().includes(q) });
  }
  const shown = new Set(nodes.map((n) => n.id));
  if (opts.prereq) for (const e of prereqLinks) {
    const a = 'c:' + e.from, b = 'c:' + e.to;
    if (shown.has(a) && shown.has(b)) { links.push({ source: a, target: b, kind: 'prereq' }); bump(a); bump(b); }
  }
  G.forEach((g, i) => {
    const id = 'g:' + i;
    nodes.push({ id, kind: 'guide', g, name: g.payload.title, hit: g.hit });
    links.push({ source: id, target: 'c:' + g.course_slug, kind: 'class' }); bump(id); bump('c:' + g.course_slug);
  });
  // guide ↔ guide: a shared title word counts 2, a shared note word 1; chapter
  // numbers ("#6") only count inside the same class
  if (opts.words) {
    const cand = [];
    for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
      const a = G[i], b = G[j], same = a.course_slug === b.course_slug, shared = new Set();
      let score = 0;
      for (const w of a.words) if (b.words.has(w) && (same || !w.startsWith('#'))) { score += 2; shared.add(w); }
      for (const w of a.note) if ((b.note.has(w) || b.words.has(w)) && !shared.has(w) && (same || !w.startsWith('#'))) { score += 1; shared.add(w); }
      for (const w of a.words) if (b.note.has(w) && !shared.has(w) && (same || !w.startsWith('#'))) { score += 1; shared.add(w); }
      if (score >= 2) cand.push({ i, j, score, shared: [...shared].map((w) => (w.startsWith('#') ? `unit/ch. ${w.slice(1)}` : w)) });
    }
    const per = {};
    cand.sort((x, y) => y.score - x.score).forEach((c) => {
      if ((per[c.i] || 0) >= 6 || (per[c.j] || 0) >= 6) return;            // keep it a web, not a hairball
      per[c.i] = (per[c.i] || 0) + 1; per[c.j] = (per[c.j] || 0) + 1;
      links.push({ source: 'g:' + c.i, target: 'g:' + c.j, kind: 'words', shared: c.shared, score: c.score });
      bump('g:' + c.i); bump('g:' + c.j);
    });
  }
  return { nodes, links, deg, G };
}

// ── draw (ECharts force graph, from the lieflat big-force template) ──
let chart, current;
function loadECharts() {
  if (window.echarts) return Promise.resolve();
  return new Promise((ok, bad) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';
    sc.onload = ok; sc.onerror = bad;
    document.head.append(sc);
  });
}

function option() {
  const { nodes, links, deg } = current;
  const zoomLabels = (chart?.getOption()?.series?.[0]?.zoom || 1) >= opts.labels;
  return {
    backgroundColor: C.bg,
    animationDuration: lessMotion() ? 0 : 400,
    tooltip: { backgroundColor: '#2a2a2a', borderColor: '#3a3a3a', textStyle: { color: C.text, fontSize: 12 }, padding: [8, 12],
      formatter: (p) => {
        if (p.dataType === 'edge') {
          const l = p.data;
          return l.kind === 'words' ? `Shared words: ${esc(l.shared.join(', '))}` : l.kind === 'prereq' ? 'Prerequisite (course catalog)' : '';
        }
        const n = p.data;
        return n.kind === 'guide' ? `${esc(n.title)}<br><span style="opacity:.6">${esc(bySlug[n.g.course_slug]?.name || '')}</span>`
          : `${esc(n.title)}<br><span style="opacity:.6">${n.has ? `${current.G.filter((g) => g.course_slug === n.slug).length} study guide(s)` : 'No study guides yet'}</span>`;
      } },
    series: [{
      type: 'graph', layout: 'force', roam: true, draggable: true, zoom: chart?.getOption()?.series?.[0]?.zoom || 1,
      force: { repulsion: opts.repel, edgeLength: [opts.link * .5, opts.link * 1.4], gravity: opts.gravity, friction: .18, layoutAnimation: !lessMotion() },
      left: 10, right: 10, top: 10, bottom: 10,
      data: nodes.map((n) => {
        const d = deg[n.id] || 0;
        const guide = n.kind === 'guide';
        const size = (guide ? 7 + Math.sqrt(d) * 3.2 : n.has ? 9 + Math.sqrt(d) * 2.4 : 4 + Math.sqrt(d) * 1.2) * opts.size;
        return { ...n, name: n.id, title: n.name, symbolSize: size,   // ECharts links by name, so name = unique id
          itemStyle: { color: n.has === false ? C.empty : guide ? C.guide : C.node, opacity: n.hit ? 1 : .15,
                       borderColor: guide ? C.bg : undefined, borderWidth: guide ? 1 : 0 },
          label: { show: guide || n.has ? zoomLabels || guide : zoomLabels && opts.labels < 1.2, position: 'bottom', distance: 4,
                   color: n.has === false ? '#777' : C.text, fontSize: guide ? 11 : 10, fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                   width: 150, overflow: 'truncate', formatter: (p) => p.data.title } };
      }),
      links: links.map((l) => ({ ...l, lineStyle: { color: l.kind === 'words' ? '#6b6b6b' : C.line, width: (l.kind === 'words' ? .8 + l.score * .25 : .8) * opts.thick,
                                                     opacity: l.kind === 'prereq' ? .55 : .8, type: l.kind === 'prereq' ? [3, 3] : 'solid' } })),
      emphasis: { focus: 'adjacency', scale: 1.15, itemStyle: { color: C.accent }, lineStyle: { color: C.accent, opacity: .9, width: 1.6 },
                  label: { show: true, color: '#fff' } },
      blur: { itemStyle: { opacity: .12 }, lineStyle: { opacity: .04 }, label: { show: false } },
    }],
  };
}

function draw(replay = false) {
  current = graph($('#gv-q').value);
  if (replay) chart.clear();
  chart.setOption(option(), true);
  const guidesN = current.G.length, wordLinks = current.links.filter((l) => l.kind === 'words').length;
  $('#gv-count').textContent = `${guidesN} study guide${guidesN === 1 ? '' : 's'} · ${current.nodes.length - guidesN} classes · ${wordLinks} keyword link${wordLinks === 1 ? '' : 's'}`;
}

// Obsidian-style settings: Filters / Display / Forces, plus Animate
function panel() {
  const sl = (k, label, min, max, step) => `<label class="gv-sl"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${opts[k]}"></label>`;
  const tg = (k, label) => `<label class="gv-tg"><span>${label}</span><span class="tgl"><input type="checkbox" data-k="${k}" ${opts[k] ? 'checked' : ''}><span aria-hidden="true"></span></span></label>`;
  $('#gv-panel').innerHTML = `
    <details open><summary>Filters</summary>${tg('orphans', 'Classes without guides')}${tg('prereq', 'Prerequisite links')}${tg('words', 'Keyword links')}</details>
    <details><summary>Display</summary>${sl('labels', 'Text fade threshold', .4, 3, .1)}${sl('size', 'Node size', .5, 2, .1)}${sl('thick', 'Link thickness', .5, 3, .1)}</details>
    <details><summary>Forces</summary>${sl('gravity', 'Center force', 0, .4, .01)}${sl('repel', 'Repel force', 10, 200, 5)}${sl('link', 'Link distance', 10, 120, 5)}</details>
    <button type="button" class="gv-animate" id="gv-animate">Animate</button>`;
}

// Click: a card with the real thing behind the dot
function info(n) {
  const card = $('#gv-info');
  if (!n) { card.hidden = true; return; }
  if (n.kind === 'guide') {
    const g = n.g, u = safeUrl(g.payload.url), c = bySlug[g.course_slug];
    const near = current.links.filter((l) => l.kind === 'words' && (l.source === n.id || l.target === n.id))
      .map((l) => current.nodes.find((x) => x.id === (l.source === n.id ? l.target : l.source)));
    card.innerHTML = `<button type="button" class="gv-x" aria-label="Close">✕</button>
      <div class="gv-k">${esc(g.payload.type)}</div><h3>${esc(g.payload.title)}</h3>
      <p class="gv-m"><a href="${courseUrl(g.course_slug)}">${esc(c?.name || '')}</a>${g.teacher ? ` · ${esc(g.teacher)}’s class` : ''}</p>
      ${g.payload.note ? `<p>${esc(g.payload.note)}</p>` : ''}
      <p class="gv-m">${g.payload.author ? `Made by ${esc(g.payload.author)} · shared by ${esc(g.author)}` : `Made by ${esc(g.author)}`}</p>
      ${near.length ? `<p class="gv-m">Connected to: ${near.map((x) => esc(x.name)).join(' · ')}</p>` : ''}
      ${u ? `<a class="gv-open" href="${esc(u)}" target="_blank" rel="noopener nofollow">Open study guide ↗</a>` : ''}`;
  } else {
    const list = current.G.filter((g) => g.course_slug === n.slug);
    card.innerHTML = `<button type="button" class="gv-x" aria-label="Close">✕</button>
      <div class="gv-k">${esc(dept[bySlug[n.slug]?.department] || 'Class')}</div><h3>${esc(n.title || n.name)}</h3>
      <p class="gv-m">${list.length ? `${list.length} study guide${list.length === 1 ? '' : 's'}` : 'No study guides yet.'}</p>
      <a class="gv-open" href="${list.length ? courseUrl(n.slug) + '#s-resources' : `${root}submit/?course=${n.slug}&kind=resource`}">${list.length ? 'Open the class page →' : 'Share the first one →'}</a>`;
  }
  card.hidden = false;
}

// The accessible version: every guide, by class
function list() {
  const by = {};
  for (const g of guides) (by[g.course_slug] ||= []).push(g);
  $('#gv-list').innerHTML = Object.keys(by).length ? Object.entries(by).sort(([a], [b]) => (bySlug[a]?.name || '').localeCompare(bySlug[b]?.name || '')).map(([slug, gs]) => `
    <section class="gv-class"><h3><a href="${courseUrl(slug)}">${esc(bySlug[slug]?.name || slug)}</a></h3>
      ${gs.map((g) => { const u = safeUrl(g.payload.url); return `<a class="res-card" ${u ? `href="${esc(u)}" target="_blank" rel="noopener nofollow"` : ''}>
        <b>${esc(g.payload.title)}</b>${g.payload.note ? `<span class="note-line">${esc(g.payload.note.slice(0, 160))}${g.payload.note.length > 160 ? '…' : ''}</span>` : ''}
        <span class="meta">${esc(g.payload.author || g.author)}${g.teacher ? ` · ${esc(g.teacher)}’s class` : ''}</span>${u ? '<span class="arrow" aria-hidden="true">↗</span>' : ''}</a>`; }).join('')}
    </section>`).join('')
    : `<p class="empty-line">No study guides yet. Made one? <a class="add-link" href="${root}submit/?kind=resource">Share it →</a></p>`;
}

// ── wire up ──
list();
panel();
try { await loadECharts(); } catch {
  $('#gv-chart').innerHTML = '<p class="gv-fail">The graph couldn’t load (your network may block it). The list below has every study guide.</p>';
}
if (window.echarts) {
  chart = window.echarts.init($('#gv-chart'), null, { renderer: 'canvas' });
  draw();
  chart.on('click', (p) => { if (p.dataType === 'node') info(p.data); });
  chart.getZr().on('click', (e) => { if (!e.target) info(null); });
  chart.on('dblclick', (p) => {
    if (p.dataType !== 'node') return;
    const n = p.data;
    const u = n.kind === 'guide' ? safeUrl(n.g.payload.url) : courseUrl(n.slug);
    if (u) window.open(u, n.kind === 'guide' ? '_blank' : '_self', 'noopener');
  });
  // Labels fade in as you zoom, like Obsidian's text fade threshold
  let lastShow = null;
  chart.on('graphroam', () => {
    const z = chart.getOption().series[0].zoom || 1, show = z >= opts.labels;
    if (show !== lastShow) { lastShow = show; chart.setOption(option()); }
  });
  new ResizeObserver(() => chart.resize()).observe($('#gv-chart'));
}
$('#gv-q').addEventListener('input', () => chart && draw());
$('#gv-gear').addEventListener('click', () => { const p = $('#gv-panel'); p.hidden = !p.hidden; $('#gv-gear').setAttribute('aria-expanded', String(!p.hidden)); });
$('#gv-panel').addEventListener('input', (e) => {
  const k = e.target.dataset.k; if (!k) return;
  opts[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
  save();
  if (chart) draw(e.target.type === 'checkbox');
});
$('#gv-panel').addEventListener('click', (e) => { if (e.target.id === 'gv-animate' && chart) draw(true); });
$('#gv-info').addEventListener('click', (e) => { if (e.target.closest('.gv-x')) info(null); });
