// Every page that isn't a course page, the bounty board, the submit form or the
// review desk. Each page names itself in its #page-data block.

import { safeUrl, popconfirm, confirmSkips, resetConfirms, toast, showResult, lessMotion, initHeader, courses, dataUrl, placeOf, slugify, drafts, openEditor, suggestLink, $, $$, esc, badge, byline, prose, fmtDate, ago, guard, courseUrl, roleLabel, root,
         avatarHtml, AVATARS, AVATAR_COLORS, themePref, setThemePref,
         CLASS_COLORS, classColorOf, classPref, applyClassTheme, classChip, getPref, setPref, paintAnnouncements, collectSchedules, scheduleBlock, classLinker,
         cookiePrefs, setCookiePrefs, storedKeys, storeGroup } from './ui.js';
import { KINDS, GUIDE, staleness, schoolYear } from './forms.js';
import { MODE, SIZE_POINTS, REVIEWER_ROLES, canEditOwn } from './store.js';

const which = JSON.parse($('#page-data')?.textContent || '{}').page;

// The Settings page's theme and class-colour pickers
const classNote = (me) => `${me?.grad_year ? `Class of ${me.grad_year}’s colour is ${CLASS_COLORS[classColorOf(me.grad_year)]}.` : 'Set your class year in your profile and “My class” uses your class colour.'}
  It shows as a small accent (your picture’s ring and class chip). The site itself stays Wilcox gold.`;
function wireAppearance(s) {
  $('#class-seg').onclick = (e) => {
    const b = e.target.closest('[data-class-pref]');
    if (!b) return;
    applyClassTheme(s.user(), b.dataset.classPref);
    $$('#class-seg [data-class-pref]').forEach((x) => x.setAttribute('aria-checked', x === b));
  };
  $('#theme-seg').onclick = (e) => {
    const b = e.target.closest('[data-theme-pref]');
    if (!b) return;
    setThemePref(b.dataset.themePref, b);
    $$('#theme-seg [data-theme-pref]').forEach((x) => x.setAttribute('aria-checked', x === b));
  };
}
const s = await initHeader();

import { search, attach, addLive, groupedHtml } from './search.js';
import { mountBellStrip, loadBell, fullHtml, dayPlan, nextSchoolDay, clock } from './bell.js';

// ── subject lists: light up classes that have content ──
// A dot on the row says it (no "Not written yet" on every row). The subject index and the head
// count how many classes in each subject have student info.
async function markContent() {
  const has = await s.contentIndex();
  $$('.course-row').forEach((li) => {
    const on = has.has(li.dataset.slug);
    li.classList.toggle('is-empty', !on);
    $('.status', li).textContent = '';
    $('a', li).title = on ? 'Students have written about this class' : 'Nobody has written about this class yet';
  });
  const rows = $$('.course-row');
  const n = rows.filter((li) => !li.classList.contains('is-empty')).length;
  if ($('#cl-written')) $('#cl-written').textContent = n ? `${n} ${n === 1 ? 'has' : 'have'} student info so far.` : 'Nobody has written about any of them yet.';
  $$('.cl-subj').forEach((a) => {
    const list = $$('.course-row', $(`#d-${a.dataset.dept}`));
    const w = list.filter((li) => !li.classList.contains('is-empty')).length;
    $('.w', a).textContent = w ? ` · ${w} written` : '';
    $('.c-bar i', a).style.width = `${list.length ? Math.round((w / list.length) * 100) : 0}%`;
  });
}

// ── clubs & sports ──
// The official list (data/activities.json, from the Wilcox website) plus what
// students have written, matched by name. Student-added clubs show up too.
async function activities(kind) {
  const [acts, subs] = await Promise.all([
    fetch(dataUrl('data/activities.json')).then((r) => (r.ok ? r.json() : { clubs: [], sports: [] })).catch(() => ({ clubs: [], sports: [] })),
    s.approved({ kind }),
  ]);
  const official = (kind === 'club' ? acts.clubs : acts.sports) || [];
  const byName = {};
  for (const o of official) byName[slugify(o.name)] = { ...o, info: null };
  for (const x of subs) {                     // newest first: first one wins
    const k = slugify(x.payload.name);
    if (!k) continue;
    byName[k] ??= { name: x.payload.name, category: 'Added by students', season: null, levels: [], coaches: [], url: null };
    byName[k].info ??= x;
  }
  const items = Object.entries(byName).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  const groupOf = (o) => (kind === 'club' ? o.category || 'Other' : o.season || 'Season not listed');
  const order = kind === 'club' ? null : ['Fall', 'Winter', 'Spring', 'Season not listed'];
  const groups = [...new Set(items.map(([, o]) => groupOf(o)))].sort((a, b) =>
    order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b));
  if (acts.sources?.length) $('#act-source').innerHTML = `Official list from the <a href="${esc(acts.sources[0])}" target="_blank" rel="noopener">Wilcox website ↗</a>. Details are written by students.`;

  const field = (label, v, cls = '') => (v ? `<div class="fact ${cls}"><div class="label">${label}</div><div class="v">${prose(v)}</div>
    ${cls === 'desc' && v.length > 220 ? '<button type="button" class="linkish more-btn">Show more</button>' : ''}</div>` : '');
  // One class's details: what students wrote, else the official list's
  const details = ([k, o]) => {
    const p = o.info?.payload || {};
    const room = p.room ? p.room.toUpperCase().replace(/^ROOM\s*/, '').replace(/[\s-]+/g, '') : null;
    const add = `${root}submit/?kind=${kind}&name=${encodeURIComponent(o.name)}`;
    const body = kind === 'club'
      ? field('What they do', p.what || o.description, 'desc') + field('Meets', p.meets || o.meets)
        + (room ? `<div class="fact"><div class="label">Room</div><div class="v"><a href="${root}map/#${esc(room)}">${esc(p.room)} · on the map</a></div></div>` : '')
        + field('Advisor', p.advisor || o.advisor) + field('How to join', p.join)
      : field('Levels', o.levels?.join(', ')) + field('Tryouts', p.tryouts) + field('Practice', p.practice) + field('What it’s like', p.experience) + field('Tips', p.tips)
        + (o.coaches?.length ? field('Coach' + (o.coaches.length > 1 ? 'es' : ''), o.coaches.join(', ')) : '');
    const link = safeLink(p.link) || o.url;
    return `${body ? `<div class="kv-grid one">${body}</div>` : '<p class="meta">No details yet.</p>'}
      <footer>${o.info ? `<span class="meta">Updated by ${byline(o.info.author, o.info.verified)} · ${esc(p.school_year || '')}${REVIEWER_ROLES.includes(s.user()?.role) ? ` · <button class="linkish" data-edit="${o.info.id}">Edit</button> · <button class="linkish danger-link" data-unpub="${o.info.id}">Unpublish</button>` : suggestLink(s, o.info)}</span>` : ''}
        <span class="act-links">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener nofollow">Page ↗</a>` : ''}
        <a href="${add}">${o.info ? 'Update' : 'Add info'}</a></span></footer>`;
  };
  // Meeting days, read from the "meets" text (whole words: "monthly" is not Monday)
  const DAYS = [['Mon', /\bmon(day)?s?\b/i], ['Tue', /\btues?(day)?s?\b/i], ['Wed', /\bwed(nesday)?s?\b/i], ['Thu', /\bthu(rs?(day)?)?s?\b/i], ['Fri', /\bfri(day)?s?\b/i]];
  const daysOf = (o) => DAYS.filter(([, re]) => re.test(o.info?.payload?.meets || o.meets || '')).map(([d]) => d);
  // Team levels, short: Varsity → V, JV, Frosh-Soph → FS, Frosh → F
  const LEVEL = { Varsity: ['V', 'Varsity'], JV: ['JV', 'Junior varsity'], 'Frosh-Soph': ['FS', 'Frosh-soph'], Frosh: ['F', 'Frosh'], 'JV/Fresh': ['JV/F', 'JV and frosh'] };
  const row = ([k, o]) => {
    const tail = kind === 'club'
      ? `<span class="ai-days">${daysOf(o).join(' · ')}</span>`
      : `<span class="ai-levels">${(o.levels || []).map((l) => `<abbr title="${esc((LEVEL[l] || [l, l])[1])}">${esc((LEVEL[l] || [l])[0])}</abbr>`).join('')}</span>`;
    return `<details class="ai-row" id="${esc(k)}" data-group="${esc(groupOf(o))}" data-days="${daysOf(o).join(' ')}" data-name="${esc(o.name.toLowerCase())}">
      <summary><i class="ai-dot${o.info ? ' has' : ''}"></i><span class="ai-name">${esc(o.name)}</span>${tail}</summary>
      <div class="ai-body">${details([k, o])}</div></details>`;
  };
  const byGroup = (grp) => items.filter(([, o]) => groupOf(o) === grp);
  // Clubs: groups by size, biggest first; sports: by season
  if (kind === 'club') groups.sort((a, b) => byGroup(b).length - byGroup(a).length || a.localeCompare(b));
  $('#act-list').innerHTML = !items.length ? `<div class="empty">Nothing listed yet. <a href="${root}submit/?kind=${kind}">Add the first one</a>.</div>`
    : `<div class="${kind === 'club' ? 'ai-cols' : 'sp-board'}">${groups.map((grp) => `<section class="ai-group" data-group="${esc(grp)}">
        <h2>${esc(grp)} <span class="ai-count">${byGroup(grp).length}</span></h2>
        ${kind === 'sport' ? `<div class="sp-ticks" aria-hidden="true">${byGroup(grp).map(() => '<i></i>').join('')}</div>` : ''}
        ${byGroup(grp).map(row).join('')}</section>`).join('')}</div><div class="empty" id="act-none" hidden>No matches.</div>`;

  // Clubs: the field, one dot per club, gathered by what kind of club it is (Lupi L6 Cluster Field)
  if (kind === 'club' && items.length) {
    // five across on a wide screen, three on a phone (so the labels stay readable)
    const narrow = $('#act-viz').clientWidth < 640, W = narrow ? 600 : 1000, R = 7.4, GAP = 19;
    const per = narrow ? 3 : Math.ceil(groups.length / 2), cw = W / per, rows = Math.ceil(groups.length / per);
    let svg = '';
    groups.forEach((grp, gi) => {
      const list = byGroup(grp), cx = cw * (gi % per) + cw / 2, cy = 100 + Math.floor(gi / per) * 190;
      list.forEach(([k, o], i) => {                               // a sunflower: tight, even, no overlaps
        const r = GAP * 0.62 * Math.sqrt(i + 0.5), a = i * 2.39996;
        svg += `<a class="cf-dot${o.info ? ' has' : ''}" href="#${esc(k)}" data-k="${esc(k)}" data-name="${esc(o.name)}" aria-label="${esc(o.name)}"><circle cx="${(cx + r * Math.cos(a)).toFixed(1)}" cy="${(cy + r * Math.sin(a)).toFixed(1)}" r="${R}"/></a>`;
      });
      svg += `<g class="cf-label" data-g="${esc(grp)}" role="button" tabindex="0"><text x="${cx}" y="${cy + 82}" text-anchor="middle">${esc(grp)}</text>
        <text class="n" x="${cx}" y="${cy + 99}" text-anchor="middle">${list.length} club${list.length === 1 ? '' : 's'}</text></g>`;
    });
    $('#act-viz').innerHTML = `<svg class="cf-svg" viewBox="0 0 ${W} ${rows * 190 + 20}" role="group" aria-label="Every club as a dot, gathered by kind">${svg}</svg>
      <p class="cf-key"><i></i> a club <i class="has"></i> students have written about it · point at a dot for its name, click to open it</p>`;
    $('#act-viz').addEventListener('click', (e) => {
      const d = e.target.closest('.cf-dot');
      if (d) { e.preventDefault(); openItem(d.dataset.k); return; }
      const l = e.target.closest('.cf-label');
      if (l) pick(l.dataset.g);
    });
    // the club's name, the moment the pointer (or keyboard focus) reaches its dot
    const tip = document.createElement('div');
    tip.className = 'cf-tip';
    tip.setAttribute('aria-hidden', 'true');
    document.body.append(tip);
    const showTip = (d) => {
      if (!d) { tip.classList.remove('on'); return; }
      tip.textContent = d.dataset.name;
      const r = d.getBoundingClientRect();
      const half = tip.offsetWidth / 2;                      // keep it on screen near the edges
      tip.style.left = `${Math.min(Math.max(r.left + r.width / 2, half + 8), innerWidth - half - 8)}px`; tip.style.top = `${r.top - 8}px`;
      tip.classList.add('on');
    };
    $('#act-viz').addEventListener('pointerover', (e) => showTip(e.target.closest('.cf-dot')));
    $('#act-viz').addEventListener('pointerleave', () => showTip(null));
    $('#act-viz').addEventListener('focusin', (e) => showTip(e.target.closest('.cf-dot')));
    $('#act-viz').addEventListener('focusout', () => showTip(null));
    addEventListener('scroll', () => showTip(null), { passive: true });
    $('#act-viz').addEventListener('keydown', (e) => { const l = e.target.closest('.cf-label'); if (l && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(l.dataset.g); } });
  }

  const draw = () => {
    const q = $('#act-q').value.trim().toLowerCase();
    const g = $('#act-filter [aria-pressed="true"]')?.dataset.g || 'all';
    const d = $('#act-days [aria-pressed="true"]')?.dataset.d || 'all';
    let shown = 0;
    for (const el of $$('#act-list .ai-row')) {
      const ok = (g === 'all' || el.dataset.group === g) && (!q || el.dataset.name.includes(q))
        && (d === 'all' || (d === 'none' ? !el.dataset.days : el.dataset.days.split(' ').includes(d)));
      el.hidden = !ok; shown += ok;
    }
    for (const sec of $$('#act-list .ai-group')) sec.hidden = !sec.querySelector('.ai-row:not([hidden])');
    for (const dot of $$('#act-viz .cf-dot')) dot.classList.toggle('off', !!document.getElementById(dot.dataset.k)?.hidden);
    const none = $('#act-none'); if (none) none.hidden = shown > 0;
  };
  const pick = (grp) => { $$('#act-filter .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.g === grp)); draw(); $('#act-list').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  function openItem(k) {
    const el = document.getElementById(k);
    if (!el) return;
    if (el.hidden) { $('#act-q').value = ''; $$('#act-filter .chip, #act-days .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.g === 'all' || c.dataset.d === 'all')); draw(); }
    el.open = true; el.classList.add('flash'); el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    history.replaceState(null, '', `#${k}`);
  }
  $('#act-filter').innerHTML = `<button class="chip" data-g="all" aria-pressed="true">All</button>`
    + groups.map((grp) => `<button class="chip" data-g="${esc(grp)}" aria-pressed="false">${esc(grp)}</button>`).join('');
  if (kind === 'club') $('#act-days').innerHTML = '<span class="meta">Meets on</span><button class="chip" data-d="all" aria-pressed="true">Any day</button>'
    + DAYS.map(([d]) => `<button class="chip" data-d="${d}" aria-pressed="false">${d}</button>`).join('') + '<button class="chip" data-d="none" aria-pressed="false">Not listed</button>';
  $('#act-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    $$('#act-filter .chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
    draw();
  });
  $('#act-days')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    $$('#act-days .chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
    draw();
  });
  $('#act-q').addEventListener('input', draw);
  $('#act-list').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { openEditor(s, subs.find((x) => String(x.id) === ed.dataset.edit), () => location.reload()); return; }
    const sg = e.target.closest('[data-suggest]');
    if (sg) { openEditor(s, subs.find((x) => String(x.id) === sg.dataset.suggest), null, 'author'); return; }
    const u = e.target.closest('[data-unpub]');
    if (u) {
      const note = prompt('Unpublish this info? It stays saved and can be republished from Dashboard → Published.\n\nReason (the author will see this):');
      if (note === null) return;
      if (await guard(() => s.review(Number(u.dataset.unpub), 'rejected', note || 'Unpublished by a reviewer'), 'Unpublished.')) location.reload();
      return;
    }
    const b = e.target.closest('.more-btn');
    if (!b) return;
    const open = b.closest('.fact').classList.toggle('open');
    b.textContent = open ? 'Show less' : 'Show more';
  });
  draw();
  const hashed = location.hash && decodeURIComponent(location.hash.slice(1));
  if (hashed && document.getElementById(hashed)) openItem(hashed);
}
const safeLink = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

// The hero search suggests real things to look for (class and club names from our own data),
// one after another, while the box is empty and not being typed in
async function heroExamples(input) {
  if (!input || lessMotion()) return;
  const [data, acts] = await Promise.all([courses(), fetch(dataUrl('data/activities.json')).then((r) => r.json()).catch(() => ({}))]);
  const pick = (list, n) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, x]) => x);
  const ex = pick([...pick(data.courses.map((c) => c.name), 5), ...pick((acts.clubs || []).map((c) => c.name), 2), 'Bell schedule'], 8);
  let i = 0;
  setInterval(() => {
    if (document.activeElement === input || input.value) return;
    input.placeholder = `Try “${ex[i++ % ex.length]}”`;
  }, 3200);
}

// Home: the study guides, the main thing on the site (Ethan). A class finder (to that class's
// guides), then the newest guides, each opening the guide itself.
async function homeGuides(data, name) {
  const box = $('#home-guides');
  if (!box) return;
  const bySlug = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
  $('#hg-classes').innerHTML = data.courses.map((c) => `<option value="${esc(c.name)}">`).join('');
  $('#hg-find').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#hg-class').value.trim().toLowerCase();
    if (!v) return $('#hg-class').focus();
    const c = data.courses.find((x) => x.name.toLowerCase() === v) || data.courses.find((x) => x.name.toLowerCase().includes(v));
    if (c) location.href = `${courseUrl(c.slug)}#s-resources`;
    else toast(`No class called “${$('#hg-class').value.trim()}”. Pick one from the list.`, 'warn');
  });
  const all = await s.approved({ kind: 'resource' }).catch(() => []);
  const every = all.filter((g) => g.payload?.type === GUIDE || g.payload?.pdf);
  const classesOf = (g) => [g.course_slug, ...(g.payload.also || [])].filter((c) => bySlug[c]);
  const nClasses = new Set(every.flatMap(classesOf)).size;
  $('#hg-count').textContent = every.length
    ? `${every.length} guide${every.length === 1 ? '' : 's'} for ${nClasses} class${nClasses === 1 ? '' : 'es'} so far` : '';
  const guides = every.slice(0, 5);
  if (!guides.length) {
    box.innerHTML = '<li class="hg-empty">No study guides yet. <a href="submit/?kind=resource">Be the first to share one</a>.</li>';
    return;
  }
  const links = await s.pdfUrls(guides.map((g) => g.payload.pdf?.path).filter(Boolean)).catch(() => ({}));
  box.innerHTML = guides.map((g) => {
    const u = (g.payload.pdf?.path && links[g.payload.pdf.path]) || safeUrl(g.payload.url);
    const where = classesOf(g).map((c) => name[c]).join(' · ') || 'Study guide';
    const inner = `<span class="hg-title">${esc(g.payload.title)}</span>
        <span class="hg-meta"><span class="hg-class">${esc(where)}</span><span>${esc(g.payload.author || g.author)}${g.payload.pdf ? ' · PDF' : ''}</span></span>
        <span class="hg-go" aria-hidden="true">↗</span>`;
    return `<li>${u ? `<a class="hg-row" href="${esc(u)}" target="_blank" rel="noopener nofollow">${inner}</a>`
      : `<a class="hg-row" href="${courseUrl(classesOf(g)[0] || '')}#s-resources">${inner}</a>`}</li>`;
  }).join('');
}

const pages = {
  async home() {
    heroExamples($('#home-q'));
    if (getPref('homebg') === 'pano') import('./pano.js').then((m) => m.mountPano(root));   // the turning quad behind the page
    import('./homemotion.js').then((m) => m.mountHomeMotion());           // scroll on to see only the background; edges bounce
    mountBellStrip($('#bell'));
    import('./menu.js').then((m) => m.mountNextMeal($('#next-meal')));
    attach($('#home-q'), $('#home-results'));
    addLive(s);
    const [recent, data] = await Promise.all([s.recent(4), courses()]);
    const name = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
    homeGuides(data, name);
    $('#home-recent').innerHTML = recent.map((x) => { const [where, href] = placeOf(x, name); return `<a href="${href}">
      ${esc(KINDS[x.kind].label)}${x.teacher ? ` · ${esc(x.teacher)}` : ''}: <b>${esc(where)}</b>
      <span class="meta">by ${byline(x.author, x.verified)} · ${ago(x.reviewed_at)}</span></a>`; }).join('')
      || '<div class="meta">Nothing yet. The first pages are being written now.</div>';
  },

  async subject() {
    if ($('#arcmatrix')) import('./charts.js').then((m) => m.mountArcMatrix());
    // the class map is drawn only when its fold is first opened
    $('#pw-fold')?.addEventListener('toggle', (e) => { if (e.target.open && !e.target.dataset.on) { e.target.dataset.on = '1'; import('./pathways.js').then((m) => m.mount($('#pathways'), s)); } });
    if (location.hash === '#pw-fold' && $('#pw-fold')) $('#pw-fold').open = true;
    if (location.hash === '#ag' && $('#ag')) $('#ag').open = true;       // from the old By the numbers link
    await markContent();
    const state = { f: 'all', sort: 'subject', q: '' };
    const rows = $$('.course-row');
    const flat = $('#flat');
    const shown = (li) => (state.f === 'has' ? !li.classList.contains('is-empty')
      : state.f === 'ap' ? li.dataset.kind.includes('ap')
      : state.f === 'honors' ? li.dataset.kind.includes('honors') : true)
      && (!state.q || state.q.split(/\s+/).every((w) => li.dataset.hay.includes(w)));
    const GRADE = { 9: 'Open to 9th graders', 10: 'From 10th grade', 11: 'From 11th grade', 12: '12th grade', '': 'Grade not listed' };

    function apply() {
      rows.forEach((li) => (li.hidden = !shown(li)));
      const any = rows.some((li) => !li.hidden);
      $('#cl-none').hidden = any;
      // Subject view: the rows stay where the page put them
      if (!flat || state.sort === 'subject') {
        if (flat) { flat.hidden = true; $('#by-subject').hidden = false; }
        $$('.dept-block').forEach((d) => (d.hidden = !$$('.course-row', d).some((li) => !li.hidden)));
        return;
      }
      // A–Z and by-grade views: copies of the visible rows, regrouped
      const vis = rows.filter((li) => !li.hidden).sort((a, b) => a.dataset.name.localeCompare(b.dataset.name));
      const groups = {};
      for (const li of vis) {
        const key = state.sort === 'az' ? (/[a-z]/i.test(li.dataset.name[0]) ? li.dataset.name[0].toUpperCase() : '#') : li.dataset.grade;
        (groups[key] ??= []).push(li);
      }
      const keys = Object.keys(groups).sort((a, b) => (state.sort === 'grade' ? (Number(a) || 99) - (Number(b) || 99) : a.localeCompare(b)));
      flat.innerHTML = keys.map((k) => `<section class="dept-block"><header class="cl-dh"><h2>${esc(state.sort === 'grade' ? GRADE[k] ?? `Grade ${k}` : k)}</h2>
          <span class="cl-dn">${groups[k].length}</span></header><ul class="course-list"></ul></section>`).join('');
      $$('.course-list', flat).forEach((ul, i) => groups[keys[i]].forEach((li) => ul.append(li.cloneNode(true))));
      $('#by-subject').hidden = true;
      flat.hidden = false;
    }
    $('#filter')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      $$('#filter [data-f]').forEach((c) => c.setAttribute('aria-pressed', c === b));
      state.f = b.dataset.f;
      apply();
    });
    $('#sort')?.addEventListener('change', (e) => { state.sort = e.target.value; apply(); });
    $('#cl-q')?.addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); apply(); });
    $('#cl-clear')?.addEventListener('click', () => { $('#cl-q').value = ''; state.q = ''; apply(); $('#cl-q').focus(); });
    // the subject index jumps to its section, even when a search had hidden it
    $('.cl-index')?.addEventListener('click', (e) => {
      const a = e.target.closest('.cl-subj'); if (!a) return;
      if (state.sort !== 'subject' || state.q || state.f !== 'all') {
        $('#cl-q').value = ''; Object.assign(state, { f: 'all', sort: 'subject', q: '' });
        $('#sort').value = 'subject'; $$('#filter [data-f]').forEach((c) => c.setAttribute('aria-pressed', c.dataset.f === 'all'));
        apply();
      }
    });
  },

  async search() {
    const input = $('#search-q');
    input.value = new URLSearchParams(location.search).get('q') || '';
    let seq = 0;
    const run = async () => {
      const my = ++seq;
      const q = input.value.trim();
      const r = q ? await search(q, 80) : [];
      if (my !== seq) return;
      history.replaceState(null, '', q ? `?q=${encodeURIComponent(q)}` : location.pathname);
      $('#search-results').innerHTML = !q ? '<p class="meta">Try a class (“apush”), a teacher, a club, a sport, a room (“B204”), or anything students wrote about.</p>'
        : r.length ? `<p class="meta">${r.length} result${r.length === 1 ? '' : 's'}</p>${groupedHtml(r, q)}`
        : `<div class="empty">Nothing matches “${esc(q)}”. Try fewer words, or check the spelling.</div>`;
    };
    input.addEventListener('input', run);
    $('#search-q').form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    await run();          // static index first, so results appear at once
    await addLive(s);     // then include what students have written
    run();
  },


  async leaderboard() {
    const rows = await s.leaderboard();
    let key = 'points';
    const draw = () => {
      const sorted = [...rows].sort((a, b) => b[key] - a[key]).filter((r) => r[key] > 0);
      $('#board').innerHTML = sorted.map((r) => `<li><span class="who">${avatarHtml(r)} ${byline(r.display_name, r.school_verified)}
        ${r.role !== 'contributor' ? `<span class="tag">${esc(roleLabel(r.role))}</span>` : ''}
        ${classChip(r.grad_year)}</span>
        <span class="meta">${r.approved} approved</span><b>${r[key]}</b></li>`).join('')
        || '<li class="empty">No points yet. <a href="../bounties/">Claim the first bounty</a>.</li>';
    };
    $$('[data-lb]').forEach((b) => b.addEventListener('click', () => {
      key = b.dataset.lb;
      $$('[data-lb]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      draw();
    }));
    draw();
  },

  async summer() {
    const [list, data] = await Promise.all([s.approved({ kind: 'summer_hw' }), courses()]);
    const name = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
    const by = {};
    for (const x of list) (by[x.course_slug] ??= []).push(x);
    $('#summer-list').innerHTML = Object.keys(by).length ? Object.entries(by)
      .sort(([a], [b]) => (name[a] || a).localeCompare(name[b] || b))
      .map(([slug, xs]) => `<section class="card"><h2><a href="${courseUrl(slug)}#s-summer">${esc(name[slug] || slug)}</a></h2>
        ${xs.map((x) => `<div class="summer-item"><h4>${x.teacher ? esc(x.teacher) : 'All sections'} <span class="tag">${esc(x.payload.school_year)}</span></h4>
          <div class="kv"><div class="k">What</div><div class="v">${prose(x.payload.what)}</div></div>
          <div class="kv"><div class="k">Where</div><div class="v">${esc(x.payload.where)}</div></div>
          <div class="kv"><div class="k">Due</div><div class="v">${esc(x.payload.due)}</div></div></div>`).join('')}</section>`).join('')
      : '<div class="empty">No summer homework has been reported yet.</div>';
  },

  async school() {
    const I = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const TOPIC_ICONS = {
      'Bell schedule': I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
      'Counselor appointments': I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M9 15l2 2 4-4"/>'),
      'Passes & attendance': I('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2z"/><path d="M13 6v12" stroke-dasharray="2 2"/>'),
      'Tech & accounts': I('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20M9 16v4M15 16v4"/>'),
      'Clubs & activities': I('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z"/>'),
      'Getting around': I('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
      Other: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    };
    const icon = (t) => `<span class="topic-ico" aria-hidden="true">${TOPIC_ICONS[t] || TOPIC_ICONS.Other}</span>`;
    const list = await s.approved({ kind: 'school_info' });
    const by = {};
    for (const x of list) (by[x.payload.topic] ??= []).push(x);
    const order = KINDS.school_info.fields[0].options.filter((t) => t !== 'Bell schedule' || by[t]);
    $('#school-list').innerHTML = order.map((topic) => `<section class="card topic"><h2>${icon(topic)}${esc(topic)}</h2>
      ${(by[topic] || []).map((x) => {
        const stale = staleness(x);
        return `<article><h3>${icon(topic)}${esc(x.payload.title)}</h3>${prose(x.payload.text)}
          ${stale ? `<div class="stale">${esc(stale)}</div>` : ''}
          <div class="meta">By ${byline(x.author, x.verified)} · checked ${fmtDate(x.reviewed_at)}${x.payload.source ? ` · Source: ${esc(x.payload.source)}` : ''}${REVIEWER_ROLES.includes(s.user()?.role) ? ` · <button class="linkish" data-edit="${x.id}">Edit</button> · <button class="linkish danger-link" data-unpub="${x.id}">Unpublish</button>` : suggestLink(s, x)}</div></article>`;
      }).join('') || `<div class="empty">Nothing here yet. <a href="${root}bounties/">Check the bounties</a> or <a href="${root}submit/?kind=school_info">add it</a>.</div>`}
    </section>`).join('');
    $('#school-list').addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit]');
      if (ed) { openEditor(s, list.find((x) => String(x.id) === ed.dataset.edit), () => location.reload()); return; }
      const sg = e.target.closest('[data-suggest]');
      if (sg) { openEditor(s, list.find((x) => String(x.id) === sg.dataset.suggest), null, 'author'); return; }
      const u = e.target.closest('[data-unpub]');
      if (!u) return;
      const note = prompt('Unpublish this article? It stays saved and can be republished from Dashboard → Published.\n\nReason (the author will see this):');
      if (note === null) return;
      if (await guard(() => s.review(Number(u.dataset.unpub), 'rejected', note || 'Unpublished by a reviewer'), 'Unpublished.')) location.reload();
    });
  },

  async account() {
    const label = { pending: 'Waiting for review', approved: 'Published', changes: 'Needs changes', rejected: 'Not accepted',
                    withdrawn: 'Withdrawn', merged: 'Update published' };
    const thisYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => thisYear - 1 + i);
    const draw = async () => {
      const me = s.user();
      const demoTools = MODE === 'demo' ? `<section class="card"><h2>Demo mode</h2>
        <p>Supabase isn’t connected, so everything here lives only in this browser.</p>
        ${me ? `<p><label>Try the site as: <select id="demo-role">${['contributor', 'trusted', 'reviewer', 'admin'].map((r) =>
          `<option value="${r}" ${me.role === r ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" id="demo-school" ${me.school ? 'checked' : ''}> Pretend this is a school account</label></p>` : ''}
        <p><button class="btn ghost danger" id="demo-reset">Erase demo data</button></p></section>` : '';
      // Appearance and the Dashboard used to be repeated here: they live in Settings and the menu
      const elsewhere = `<p class="meta acct-else">Night mode, text size, language and the rest are in <a href="${root}settings/">Settings</a>.${me ? ` Your notifications and posts are in your <a href="${root}dashboard/">Dashboard</a>.` : ''}</p>`;
      if (!me) {
        $('#account').innerHTML = `<p>Sign in to claim bounties, submit work and comment. Reading never needs an account.</p>
          <p><button class="btn js-signin">Sign in${MODE === 'live' ? ' with Google' : ''}</button></p>${elsewhere}${demoTools}`;
      } else {
        $('#account').innerHTML = `
          <section class="card profile">
            <div class="profile-head">${avatarHtml(me, 'lg')}
              <div><b class="profile-name">${esc(me.name)}</b>${badge(me.school)}
                <div class="meta">${esc(roleLabel(me.role))}${classChip(me.grad_year, true)}</div></div></div>
            <p class="meta">${me.school
              ? 'You signed in with your school account, so your work shows the SCUSD ✓ badge.'
              : `You signed in with a personal account.${REVIEWER_ROLES.includes(me.role) ? '' : ' Your comments always go to a reviewer first.'} Sign in with your @scusd.net school account to get the SCUSD ✓ badge.`}</p>
          </section>

          <form id="profile-form" class="card">
            <h2>Profile</h2>
            <div class="field"><label for="dn">Display name</label>
              <div class="hint">Shown on everything you write. Your first name, or a name people know you by.</div>
              <input id="dn" value="${esc(me.name)}" maxlength="40" required></div>
            <div class="field"><span class="flabel">Profile picture</span>
              <div class="hint">Pick an icon and a colour. Photos aren’t allowed, to keep everyone’s privacy. ${getPref('avatars') === 'emoji'
                ? 'You’re seeing the emoji icons. <a href="' + root + 'settings/#appearance">Switch to the one-line drawings</a>.'
                : 'Each icon is drawn in one continuous line. Prefer the original emoji? <a href="' + root + 'settings/#appearance">Switch in Settings</a>.'}</div>
              <div class="av-grid" id="av-grid" role="radiogroup" aria-label="Profile icon">
                <button type="button" role="radio" data-av="" aria-checked="${!me.avatar}" title="Your initial">${avatarHtml({ ...me, avatar: null }, 'md')}</button>
                ${Object.keys(AVATARS).map((k) => `<button type="button" role="radio" data-av="${k}" aria-checked="${me.avatar === k}" title="${k}">${avatarHtml({ ...me, avatar: k }, 'md')}</button>`).join('')}
              </div>
              <div class="swatches" id="swatches" role="radiogroup" aria-label="Colour">${Object.entries(AVATAR_COLORS).map(([k, hex]) =>
                `<button type="button" role="radio" data-color="${k}" aria-checked="${me.color === k}" title="${k}" style="--sw:${hex}"></button>`).join('')}</div>
            </div>
            <div class="field"><label for="gy">Class of</label>
              <select id="gy"><option value="">Prefer not to say</option>${years.map((y) =>
                `<option ${me.grad_year === y ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
            <label class="check"><input type="checkbox" id="lb" ${me.show_on_leaderboard ? 'checked' : ''}> Show me on the leaderboard</label>
            <button class="btn">Save profile</button>
          </form>

          <section class="card"><h2>Account</h2>
            <p><button type="button" class="btn ghost" id="signout">Sign out</button></p>
            <p class="meta">To delete your account, ask a Wilkipedia admin. See <a href="${root}privacy/">Privacy</a> for what that removes.</p>
          </section>
          ${elsewhere}
          ${demoTools}`;

        // live preview while picking
        const pick = { avatar: me.avatar, color: me.color };
        const repaint = () => {
          $$('#av-grid [data-av]').forEach((b) => {
            b.setAttribute('aria-checked', (b.dataset.av || null) === pick.avatar);
            b.innerHTML = avatarHtml({ name: $('#dn').value || me.name, avatar: b.dataset.av || null, color: pick.color }, 'md');
          });
          $$('#swatches [data-color]').forEach((b) => b.setAttribute('aria-checked', b.dataset.color === pick.color));
          $('.profile-head .avatar').outerHTML = avatarHtml({ name: me.name, ...pick }, 'lg');
          $('.profile-head .avatar').classList.add('draw');        // the new icon draws itself
        };
        $('#av-grid').onclick = (e) => { const b = e.target.closest('[data-av]'); if (b) { pick.avatar = b.dataset.av || null; repaint(); } };
        $('#swatches').onclick = (e) => { const b = e.target.closest('[data-color]'); if (b) { pick.color = b.dataset.color; repaint(); } };
        $('#profile-form').onsubmit = (e) => {
          e.preventDefault();
          const dn = $('#dn').value.trim();
          if (!dn) return;
          guard(() => s.updateProfile({ display_name: dn, avatar: pick.avatar, avatar_color: pick.color,
                                        grad_year: Number($('#gy').value) || null,
                                        show_on_leaderboard: $('#lb').checked }), 'Profile saved.');
        };
        $('#signout').onclick = () => guard(() => s.signOut());
        // Old links (#notifications, #my-subs, #edit-<id>) now belong to the Dashboard
        const old = /^#(notifications|my-subs|edit-(\d+))$/.exec(location.hash);
        if (old) location.replace(`${root}dashboard/${old[2] ? `#edit-${old[2]}` : old[1] === 'my-subs' ? '#work' : ''}`);
        $('#demo-role')?.addEventListener('change', (e) => guard(() => s.setDemoRole(e.target.value), 'Role switched.'));
        $('#demo-school')?.addEventListener('change', (e) => guard(() => s.setDemoSchool(e.target.checked)));
      }
      $('#demo-reset')?.addEventListener('click', async () => {
        if (!(await popconfirm($('#demo-reset'), { title: 'Erase all demo data?', text: 'Claims, submissions and comments in this browser.', ok: 'Erase' }))) return;
        await s.resetDemo(); location.reload();
      });
    };
    s.onAuth(draw);
    draw();
  },

  // Every setting in one place. The originals stay where they are (header
  // toggles, Account, the Orrery's Display menu); this page reads and writes the
  // same stored values, so they always agree.
  async settings() {
    const { LANGS, currentLang, setLanguage } = await import('./translate.js');
    const DRAFT = 'wilkipedia-draft:';
    const ls = {
      get(k, d = null) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
      del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
      keys() { try { return Object.keys(localStorage); } catch { return []; } },
      json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    };
    const ORR = 'wilkipedia-orrery';
    const orrOpts = () => ({ motion: !lessMotionNow(), labels: true, belt: true, photo: true, ...ls.json(ORR, {}) });
    const lessMotionNow = () => getPref('motion') === 'reduce' || (getPref('motion') === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);

    const seg = (id, label, cur, opts) => `<div class="seg" id="${id}" role="radiogroup" aria-label="${label}">${opts.map(([v, l]) =>
      `<button type="button" role="radio" aria-checked="${cur === v}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const tgl = (id, label, on) => `<span class="tgl"><input type="checkbox" id="${id}" aria-label="${esc(label)}" ${on ? 'checked' : ''}><span aria-hidden="true"></span></span>`;
    const row = (title, hint, control, wide = false) => `<div class="set-row${wide ? ' wide' : ''}"><div class="set-l"><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</div><div class="set-c">${control}</div></div>`;
    const sec = (id, title, rows, note = '', n = 1) => `<section class="set-sec" id="${id}"><header class="set-sh"><span class="set-no" aria-hidden="true">${String(n).padStart(2, '0')}</span>
      <h2>${title}</h2>${SEC_SUB[id] ? `<p>${SEC_SUB[id]}</p>` : ''}</header><div class="set-list">${rows}</div>${note ? `<p class="set-note">${note}</p>` : ''}</section>`;
    const SEC_SUB = {
      appearance: 'How Wilkipedia looks on this device.', language: 'The language for menus, buttons and pages.',
      pages: 'What shows up around the site.', account: 'How you appear to everyone else.',
      bounties: 'For the review team: how the bounty board opens.', cookies: 'What this site keeps in your browser. No ads, no analytics, no tracking.',
      device: 'Drafts in progress, and a fresh start.',
    };
    // Picture choices: a small preview above each label. attr is the data attribute the wiring reads.
    const tiles = (id, label, cur, opts, attr = 'data-v', cls = '') => `<div class="set-tiles ${cls}" id="${id}" role="radiogroup" aria-label="${label}">${opts.map(([v, l, pv]) =>
      `<button type="button" role="radio" aria-checked="${cur === v}" ${attr}="${v}"><span class="pv" aria-hidden="true">${pv}</span><span class="pv-l">${l}</span></button>`).join('')}</div>`;
    const page_ = (m) => `<span class="pv-page pv-${m}"><i class="pv-bar"></i><i class="pv-h"></i><i class="pv-t"></i><i class="pv-t s"></i><i class="pv-c"></i><i class="pv-c"></i></span>`;
    const themeTiles = () => tiles('theme-seg', 'Theme', themePref(), [
      ['system', 'Match my device', `${page_('day')}${page_('night pv-half')}`], ['light', 'Day', page_('day')], ['dark', 'Night', page_('night')]], 'data-theme-pref');
    const sizeTiles = () => tiles('set-text', 'Text size', getPref('text'), [['normal', 'Default', '<b class="pv-aa">Aa</b>'], ['large', 'Large', '<b class="pv-aa l">Aa</b>'], ['larger', 'Larger', '<b class="pv-aa xl">Aa</b>']], 'data-v', 'small');
    const bgTiles = () => tiles('set-homebg', 'Home page background', getPref('homebg'), [
      ['pano', 'The quad, turning', '<span class="pv-img pv-pano"></span>'], ['paint', 'Painting', '<span class="pv-img pv-paint"></span>'], ['plain', 'Plain', page_('plain')]]);
    const avTiles = (me) => {
      const who = me?.avatar && AVATARS[me.avatar] ? [{ name: me.name, avatar: me.avatar, color: me.avatar_color }] : [];
      const trio = [...who, { name: 'a', avatar: 'owl', color: 'blue' }, { name: 'b', avatar: 'fox', color: 'orange' }, { name: 'c', avatar: 'panda', color: 'green' }].slice(0, 3);
      const row_ = trio.map((p) => avatarHtml(p, 'md')).join('');
      return tiles('set-avatars', 'Profile pictures', getPref('avatars'), [['lines', 'Line drawings', `<span class="pv-av pv-lines">${row_}</span>`], ['emoji', 'Emoji', `<span class="pv-av pv-emoji">${row_}</span>`]], 'data-v', 'small');
    };
    const classSwatches = (me) => `<div class="set-swatches" id="class-seg" role="radiogroup" aria-label="Colour theme">${[['auto', me?.grad_year ? `My class · ${CLASS_COLORS[classColorOf(me.grad_year)]}` : 'My class'], ['gold', 'Wilcox gold'],
      ...Object.entries(CLASS_COLORS)].map(([v, l]) => `<button type="button" role="radio" aria-checked="${classPref() === v}" data-class-pref="${v}"><span class="sw sw-${v === 'auto' ? classColorOf(me?.grad_year) || 'gold' : v}"></span>${esc(l)}</button>`).join('')}</div>`;

    const draw = () => {
      const me = s.user();
      const team = !!me && REVIEWER_ROLES.includes(me.role);
      const drafts_ = ls.keys().filter((k) => k.startsWith(DRAFT)).length;
      const closed = ls.json('wilkipedia-dismissed-announcements', []).length;
      const skips = confirmSkips().length;
      const o = orrOpts();
      const sections = [
        ['appearance', 'Appearance', [
          row('Theme', 'Day, night, or follow your device. The moon button in the header does the same.', themeTiles(), true),
          row('Class colour', classNote(me), classSwatches(me), true),
          row('Text size', 'Makes all text on the site bigger.', sizeTiles(), true),
          row('Profile pictures', 'How everyone’s profile icons look to you: one-line drawings, or the original emoji.', avTiles(me), true),
          row('Motion', 'Turn off animations like the night-mode circle and the moving planets.', seg('set-motion', 'Motion', getPref('motion'), [['system', 'Match my device'], ['reduce', 'Reduce'], ['full', 'Full']])),
        ].join('')],
        ['language', 'Language', row('Language', 'Menus and buttons use our own translations. Everything else is translated by Google.',
          `<select id="set-lang" class="set-select">${LANGS.map(([code, native, english]) => `<option value="${code}" ${code === currentLang() ? 'selected' : ''}>${esc(native)}${native !== english ? ` · ${esc(english)}` : ''}</option>`).join('')}</select>`)],
        ['pages', 'Pages', [
          row('Home page background', 'What’s behind the home page: the quad turning slowly all the way round, the painting of the courtyard, or nothing (plain).',
            bgTiles(), true),
          row('Bell schedule on the home page', 'Today’s periods at the top of the home page. The full schedule is always under More.', tgl('set-bell', 'Bell schedule on the home page', getPref('bell') === 'on')),
          row('Contribute button', 'The round + button in the corner of every page. You can still contribute from the More menu or your account.', tgl('set-fab', 'Contribute button', getPref('fab') === 'on')),
          row('Tour of the site', 'The speech bubbles from your first sign-in that show where everything is.',
            '<button type="button" class="btn ghost small" id="set-tour">Start the tour</button>'),
          row('Ask before deleting', skips ? `You turned off ${skips} “Are you sure?” question${skips === 1 ? '' : 's'} with “Don’t ask me again”. Bring them back to be asked every time.`
            : 'Delete and withdraw buttons ask “Are you sure?” first. Some let you tick “Don’t ask me again”; this brings those back.',
            `<button type="button" class="btn ghost small" id="set-ask" ${skips ? '' : 'disabled'}>Ask me again</button>`),
          row('Closed announcements', closed ? `You closed ${closed} announcement${closed === 1 ? '' : 's'}. Bring them back if they’re still running.` : 'Announcements you close with ✕ stay hidden in this browser.',
            `<button type="button" class="btn ghost small" id="set-ann" ${closed ? '' : 'disabled'}>Show them again</button>`),
        ].join('')],
      ];
      if (me) sections.push(['account', 'Your profile', [
        row('Name, picture, class year and leaderboard', 'Saved to your account, so they follow you to every device.', `<a class="btn ghost small" href="${root}account/">Edit profile</a>`),
      ].join('')]);
      if (team) sections.push(['bounties', 'Bounty board', [
        row('Open the board on', 'The view the bounty page starts with.', seg('set-bview', 'Bounty board view', ls.get('wilkipedia-bounty-view', 'board'), [['board', 'Board'], ['agenda', 'Agenda'], ['ledger', 'Ledger'], ['orrery', 'Orrery']])),
        row('Orrery: motion', 'Planets orbit the sun.', tgl('set-o-motion', 'Orrery motion', o.motion)),
        row('Orrery: labels', 'Bounty names under the planets.', tgl('set-o-labels', 'Orrery labels', o.labels)),
        row('Orrery: completed belt', 'Finished bounties as rocks between rings B and C.', tgl('set-o-belt', 'Orrery completed belt', o.belt)),
        row('Orrery: photo sky', 'The real Milky Way photo (1.2 MB). Off uses a drawn sky.', tgl('set-o-photo', 'Orrery photo sky', o.photo)),
      ].join('')]);
      const cp = cookiePrefs();
      const gt = currentLang() !== 'en';
      const saved = [...storedKeys().filter((k) => /^(sb-|wilkipedia|wilcox)/.test(k)).map((k) => [keyLabel(k), storeGroup(k), k]),
        ...(gt ? [['Google Translate language', 'google', 'googtrans (cookie)']] : [])];
      sections.push(['cookies', 'Cookies & storage', [
        row('Needed to work', 'Keeps you signed in and remembers your choices below. Wilkipedia has no ads, analytics or tracking cookies.',
          '<span class="set-pill">Always on</span>'),
        row('Remember my settings', 'Night mode, text size, class colour, closed announcements, the 3D campus view and the rest of this page. Off: changes last until you leave the page.',
          tgl('set-c-prefs', 'Remember my settings', cp.prefs)),
        row('Remember recent classes and drafts', 'Classes you opened lately come first in search, and forms or comments you start are kept until you send them.',
          tgl('set-c-history', 'Remember recent classes and drafts', cp.history)),
        row('Google Translate', gt ? 'On. Google translates the page’s text and keeps a cookie with your language. Google’s own cookie rules apply while it’s on.'
          : 'Off. It only turns on when you pick a language, and then Google keeps a cookie with your choice.',
          gt ? '<button type="button" class="btn ghost small" id="set-c-gt">Turn off</button>' : '<span class="set-pill off">Off</span>'),
        row('What’s saved right now', saved.length ? `${saved.length} item${saved.length === 1 ? '' : 's'} in this browser.` : 'Nothing. This browser has no Wilkipedia data.',
          saved.length ? `<details class="set-keys"><summary>Show the list</summary><ul>${saved.map(([label, g, k]) =>
            `<li><span>${esc(label)}</span><code translate="no">${esc(k)}</code><em class="g-${g}">${GROUP[g] || 'Other'}</em></li>`).join('')}</ul></details>` : '', true),
        row('Delete everything', 'Removes every setting, draft and choice this site saved in this browser, and turns translation off. You stay signed in.',
          '<button type="button" class="btn ghost danger small" id="set-c-clear">Delete</button>'),
      ].join(''), `Everything here stays in this browser. See the <a href="${root}privacy/">Privacy page</a>.`]);
      sections.push(['device', 'Saved on this device', [
        row('Unsent drafts', drafts_ ? `${drafts_} half-written form${drafts_ === 1 ? '' : 's'} or comment${drafts_ === 1 ? '' : 's'}, saved so you don’t lose them.` : 'Nothing saved. Forms and comments you start are kept here until you send them.',
          `<button type="button" class="btn ghost small" id="set-drafts" ${drafts_ ? '' : 'disabled'}>Delete drafts</button>`),
        row('Reset all settings', 'Theme, text size, motion, language, class colour and the rest go back to normal. Your account and drafts are kept.',
          '<button type="button" class="btn ghost danger small" id="set-reset">Reset</button>'),
      ].join('')]);

      $('#set-toc').innerHTML = `<ol>${sections.map(([id, title], i) => `<li><a href="#${id}" data-sec="${id}"><span class="set-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${title}</a></li>`).join('')}</ol>`;
      $('#settings').innerHTML = sections.map(([id, title, rows, note], i) => sec(id, title, rows, note, i + 1)).join('');
      spy();
      if (!cp.prefs) $('#settings').insertAdjacentHTML('afterbegin', '<p class="set-warn"><b>Remember my settings is off</b>, so changes here last only until you leave this page. <a href="#cookies">Change</a></p>');
      wireAppearance(s);

      const savedToast = () => toast(cp.prefs ? 'Saved.' : 'Changed for this visit. Remember my settings is off.', 'good', { id: 'set-saved', duration: 2600 });
      const segWire = (id, fn) => { $('#' + id)?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        fn(b.dataset.v); savedToast();
        $$(`#${id} [data-v]`).forEach((x) => x.setAttribute('aria-checked', x === b));
      }); };
      segWire('set-text', (v) => setPref('text', v));
      segWire('set-motion', (v) => setPref('motion', v));
      segWire('set-avatars', (v) => setPref('avatars', v));
      segWire('set-homebg', (v) => setPref('homebg', v));
      segWire('set-bview', (v) => ls.set('wilkipedia-bounty-view', v));
      $('#set-lang').onchange = (e) => setLanguage(e.target.value);
      $('#set-bell').onchange = (e) => { setPref('bell', e.target.checked ? 'on' : 'off'); savedToast(); };
      $('#set-fab').onchange = (e) => { setPref('fab', e.target.checked ? 'on' : 'off'); savedToast(); };
      $('#set-tour').onclick = () => { scrollTo(0, 0); import('./tour.js').then((m) => m.startTour(s.user()?.name)); };
      $('#set-ann').onclick = () => { ls.del('wilkipedia-dismissed-announcements'); paintAnnouncements(s); toast('Closed announcements will show again.', 'good'); draw(); };
      $('#set-ask').onclick = () => { resetConfirms(); toast('You’ll be asked before deleting again.', 'good'); draw(); };
      for (const k of ['motion', 'labels', 'belt', 'photo']) {
        $(`#set-o-${k}`)?.addEventListener('change', (e) => { ls.set(ORR, JSON.stringify({ ...orrOpts(), [k]: e.target.checked })); savedToast(); });
      }
      $('#set-c-prefs').onchange = (e) => { setCookiePrefs({ prefs: e.target.checked }); draw(); };
      $('#set-c-history').onchange = (e) => { setCookiePrefs({ history: e.target.checked }); draw(); };
      $('#set-c-gt')?.addEventListener('click', () => setLanguage('en'));
      $('#set-c-clear').onclick = async (e) => {
        if (!(await popconfirm(e.currentTarget, { title: 'Delete everything saved here?', text: 'Every setting, draft and choice in this browser. You stay signed in.' }))) return;
        storedKeys().filter((k) => storeGroup(k) !== 'need' || k === 'wilkipedia-cookies').forEach(ls.del);
        if (gt) setLanguage('en'); else location.reload();
      };
      $('#set-drafts').onclick = async (e) => {
        if (!(await popconfirm(e.currentTarget, { title: 'Delete every unsent draft?', text: 'Half-written forms and comments in this browser.' }))) return;
        ls.keys().filter((k) => k.startsWith(DRAFT)).forEach(ls.del);
        toast('Drafts deleted.', 'good');
        draw();
      };
      $('#set-reset').onclick = async (e) => {
        if (!(await popconfirm(e.currentTarget, { title: 'Reset every setting?', text: 'Theme, text size, language and the rest go back to normal.', ok: 'Reset' }))) return;
        ['wilkipedia-theme', 'wilkipedia-class', 'wilkipedia-class-applied', 'wilkipedia-dismissed-announcements',
         'wilkipedia-orrery', 'wilkipedia-bounty-view', 'wilkipedia-noconfirm', ...Object.keys(PREF_KEYS)].forEach(ls.del);
        if (currentLang() !== 'en') setLanguage('en'); else location.reload();
      };
    };
    const GROUP = { need: 'Always', prefs: 'Settings', history: 'History', google: 'Google' };
    const NAMES = {
      'wilkipedia-cookies': 'Your cookie choices', 'wilkipedia-theme': 'Night mode', 'wilkipedia-class': 'Class colour',
      'wilkipedia-class-applied': 'Class colour', 'wilkipedia-text': 'Text size', 'wilkipedia-motion': 'Motion',
      'wilkipedia-bell': 'Bell schedule on the home page', 'wilkipedia-fab': 'Contribute button', 'wilkipedia-homebg': 'Home page background',
      'wilkipedia-dismissed-announcements': 'Closed announcements', 'wilkipedia-bounty-view': 'Bounty board view',
      'wilkipedia-orrery': 'Orrery display', 'wilkipedia-graph': 'Study-guide graph display', 'wilkipedia-noconfirm': '“Don’t ask me again” choices',
      'wilkipedia-recent-classes': 'Recently opened classes', 'wilcox-campus-quality': '3D campus quality',
      'wilcox-campus-sky2': '3D campus time and weather', 'wilcox-campus-sky': '3D campus time and weather (old)', 'wilcox-campus-style': '3D campus style',
    };
    const keyLabel = (k) => (k.startsWith('sb-') ? 'Sign-in token' : k.startsWith(DRAFT) ? 'Unsent draft'
      : k.startsWith('wilkipedia-demo') ? 'Demo-mode data' : NAMES[k] || k);
    const PREF_KEYS = { 'wilkipedia-text': 1, 'wilkipedia-motion': 1, 'wilkipedia-bell': 1, 'wilkipedia-fab': 1, 'wilkipedia-homebg': 1 };
    // The index on the left marks the section you're reading: the last one whose heading has
    // passed the top, or the last section once you reach the bottom (a short one never gets there).
    let lock = 0;
    let shown = '';
    const mark = (id) => {
      $$('#set-toc [data-sec]').forEach((a) => (a.dataset.sec === id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
      const toc = $('#set-toc'), a = $(`#set-toc [data-sec="${id}"]`);
      if (a && id !== shown && toc.scrollWidth > toc.clientWidth) toc.scrollTo({ left: a.offsetLeft - 16, behavior: lessMotion() ? 'auto' : 'smooth' });   // phones: the strip follows
      shown = id;
    };
    const current = () => {
      if (Date.now() < lock) return;
      const secs = $$('.set-sec');
      if (!secs.length) return;
      const bottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      mark((bottom ? secs.at(-1) : secs.filter((x) => x.getBoundingClientRect().top < 140).at(-1) || secs[0]).id);
    };
    const spy = () => {
      $('#set-toc').onclick = (e) => { const a = e.target.closest('[data-sec]'); if (a) { lock = Date.now() + 900; mark(a.dataset.sec); } };
      location.hash ? mark(location.hash.slice(1)) : current();
    };
    addEventListener('scroll', current, { passive: true });
    s.onAuth(draw);
    draw();
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  },

  clubs() { return activities('club'); },
  sports() { return activities('sport'); },

  feedback() {
    const hints = { idea: 'What would make Wilkipedia better?', bug: 'What happened, and what did you expect? Which device and browser?',
                    feature: 'What should it do, and who would use it?', other: 'Anything on your mind.' };
    let kind = 'idea';
    $('#fb-kind').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kind]');
      if (!b) return;
      kind = b.dataset.kind;
      $$('#fb-kind [data-kind]').forEach((x) => x.setAttribute('aria-checked', x === b));
      $('#fb-hint').textContent = hints[kind];
    });
    drafts.bind($('#fb-msg'), 'feedback');
    const ref = document.referrer && new URL(document.referrer).origin === location.origin ? new URL(document.referrer).pathname : '';
    if (ref && !ref.includes('/feedback')) $('#fb-page').value = ref;
    $('#fb-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = $('#fb-msg').value.trim();
      if (message.length < 3) { $('#fb-error').textContent = 'Please write a little more.'; $('#fb-error').hidden = false; return; }
      $('#fb-error').hidden = true;
      const ok = await guard(() => s.sendFeedback({ kind, message, page: $('#fb-page').value.trim() || null,
                                                     name: $('#fb-name').value.trim() || s.user()?.name || null }));
      if (!ok) return;
      drafts.clear('feedback');
      $('#fb-form').hidden = true;
      const from = $('#fb-page').value.trim();
      showResult($('#fb-done'), { status: 'good', title: 'Thanks! We got it.',
        text: s.user() ? 'The team reads every message. When it’s planned or done, you’ll get a notification, and you can add to it in your Dashboard.'
          : 'The team reads every message. Sign in next time and you can follow what happens to it.',
        actions: [from && from.startsWith('/') ? { label: 'Back to the page you were on', href: from, primary: true } : { label: 'Back to the home page', href: root, primary: true },
          ...(s.user() ? [{ label: 'Follow it in your Dashboard', href: `${root}dashboard/#work` }] : []),
          { label: 'Send more feedback', run: () => { $('#fb-form').reset(); $('#fb-form').hidden = false; $('#fb-done').hidden = true; } }] });
    });
  },

  async credits() {
    const person = (p, sub) => `<div class="person">${avatarHtml(p, 'md')}<div><b>${esc(p.display_name ?? p.name)}</b>${badge(p.school_verified)}${classChip(p.grad_year)}
      <span class="meta">${sub}</span></div></div>`;
    const [team, lb, fb] = await Promise.all([s.team().catch(() => []), s.leaderboard().catch(() => []), s.feedbackCredits().catch(() => [])]);
    const founders = ['Ethan', 'Ethan Liu', 'Jonathan', 'Jonathan Lee'];
    const others = team.filter((p) => p.role === 'reviewer' || !founders.includes(p.display_name));
    $('#cr-team').innerHTML = others.map((p) => person(p, esc(roleLabel(p.role)))).join('')
      || '<p class="meta">Just the founders so far. Want to help review? Ask Ethan.</p>';
    $('#cr-contrib').innerHTML = lb.map((p) => person(p, `${p.approved} contribution${p.approved === 1 ? '' : 's'} · ${p.points} pts`)).join('')
      || '<p class="meta">Be the first: <a href="../bounties/">claim a bounty</a> or <a href="../submit/">add something</a>.</p>';
    $('#cr-feedback').innerHTML = fb.map((f) => `<div class="person"><span class="avatar av-md" style="--av:#6f746c">${esc(f.name.trim().charAt(0).toUpperCase())}</span>
      <div><b>${esc(f.name)}</b><span class="meta">${f.helped} idea${f.helped === 1 ? '' : 's'} or fix${f.helped === 1 ? '' : 'es'} used</span></div></div>`).join('')
      || '<p class="meta">No one yet. Your idea could be first.</p>';
  },

  async bell() {
    (await import('./bell.js')).mountBellPage();
  },

  // The teachers list: by subject, with a find box
  teachers() {
    const items = $$('#tl-groups li');
    $('#tl-q').addEventListener('input', (e) => {
      const words = e.target.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      items.forEach((li) => (li.hidden = !words.every((w) => li.dataset.hay.includes(w))));
      $$('.tl-group').forEach((g) => (g.hidden = !$$('li', g).some((li) => !li.hidden)));
      $('#cl-none').hidden = items.some((li) => !li.hidden);
    });
  },

  // A teacher's page (redesigned 2026-10-01): what students wrote about each of their classes,
  // their room and schedule, "Today" (the schedule over today's bell schedule) and student posts
  async teacher() {
    const app = $('#t-app');
    const name = app.dataset.teacher, slugs = app.dataset.courses.split(',').filter(Boolean);
    const [subs, scheds, data, bell] = await Promise.all([s.approved(), s.approved({ kind: 'room_schedule' }), courses(), loadBell().catch(() => null)]);
    const cname = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
    const mine = subs.filter((x) => x.teacher === name);
    const secs = mine.filter((x) => x.kind === 'teacher_section');

    // each class card says whether students wrote about this teacher's version
    let written = 0;
    $$('.tc-card').forEach((li) => {
      const sec = secs.find((x) => x.course_slug === li.dataset.slug);
      if (sec) written++;
      li.classList.toggle('tc-written', !!sec);           // (not .done: that's a site-wide padding class)
      const line = sec && (sec.payload.test_style || sec.payload.homework || sec.payload.grading || '');
      $('[data-state]', li).innerHTML = sec ? `<em>Students wrote about it</em>${line ? `<span class="tc-quote">“${esc(line.length > 110 ? line.slice(0, 108).trimEnd() + '…' : line)}”</span>` : ''}`
        : '<em class="no">Not written yet</em>';
    });
    $('#t-written').textContent = slugs.length ? `${written} of ${slugs.length}` : '—';

    // room and schedule
    const list = collectSchedules(scheds.filter((x) => x.teacher === name), secs)[name]?.list || [];
    const add = `${root}submit/?kind=room_schedule&teacher=${encodeURIComponent(name)}`;
    const room = list[0]?.room || secs.find((x) => x.payload.room)?.payload.room;
    const link = classLinker(data.courses);
    $('#t-where').innerHTML = room ? `Room <b>${esc(room)}</b> · <a href="${root}map/#${encodeURIComponent(room)}">on the map →</a>` : `Room not added yet · <a href="${add}">add it</a>`;
    $('#t-sched').innerHTML = scheduleBlock(list, { add, link, rooms: true })
      + (list.length ? `<p class="meta">${room ? `<a href="${root}map/#${encodeURIComponent(room)}">See room ${esc(room)} on the map</a> · ` : ''}<a href="${add}">Add or update a schedule</a></p>` : '');

    // Today: this year's schedule laid over today's bell schedule, with the current period marked
    const sched = list[0]?.periods && list[0].year === schoolYear(0) ? list[0].periods : null;
    if (sched && bell) {
      const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
      const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      let plan = dayPlan(bell, now), when = 'Today', day = now;
      if (!plan.periods) { [day, plan] = nextSchoolDay(bell, now); when = day ? day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : null; }
      if (plan?.periods && when) {
        const isToday = when === 'Today';
        const rows = plan.periods.map(([label, a, b]) => {
          const n = /\b([1-7])(?:st|nd|rd|th)?\b/.exec(label)?.[1];          // "1st Period" or "Period 1"
          const what = n ? sched[n] : null;
          const quiet = !n || !what || /^(prep|no class|free|none|-|—)$/i.test(what);
          const state = isToday && m >= mins(a) && m < mins(b) ? 'now' : isToday && m >= mins(b) ? 'past' : '';
          return `<li class="${quiet ? 'quiet' : ''} ${state}"><span class="tt-time">${clock(a)}</span><span class="tt-p">${n ? `P${n}` : esc(label)}</span>
            <span class="tt-what">${n ? (what ? (quiet ? esc(what) : link(what)) : '<span class="meta">—</span>') : ''}</span>${state === 'now' ? '<span class="tt-now">Now</span>' : ''}</li>`;
        }).join('');
        $('#t-today').innerHTML = `<header class="tt-h"><h2>${esc(when)}</h2><p class="sec-sub">${esc(plan.label)}${room ? ` · Room ${esc(room)}` : ''}. From the ${esc(list[0].year)} room schedule and the school’s bell schedule.</p></header><ol class="tt-list">${rows}</ol>`;
        $('#t-today').hidden = false;
      }
    }

    // from students: tips, study guides and summer homework tied to this teacher
    const KIND_L = { tip: 'Tip', resource: 'Study guide', summer_hw: 'Summer homework' };
    const posts = mine.filter((x) => KIND_L[x.kind]);
    $('#t-students').hidden = !posts.length;
    $('#t-students-list').innerHTML = `<ul class="t-posts">${posts.map((x) => {
      const p = x.payload, sec = { tip: 's-tips', resource: 's-resources', summer_hw: 's-summer' }[x.kind];
      const text = x.kind === 'tip' ? p.text : x.kind === 'resource' ? p.title : p.assignment || p.what || p.details || 'Summer homework';
      return `<li><a href="${courseUrl(x.course_slug)}#${sec}"><span class="c-kicker">${KIND_L[x.kind]} · ${esc(cname[x.course_slug] || '')}</span>
        <span class="tp-text">${esc(String(text || '').slice(0, 180))}</span><span class="meta">${byline(x.author, x.verified)}</span></a></li>`;
    }).join('')}</ul>`;
  },

  // Teacher pages: their room and period schedule, this year's first
  async static() {
    const box = $('#t-sched');
    if (!box) return;
    const name = box.dataset.teacher;
    const [scheds, secs, data] = await Promise.all([s.approved({ kind: 'room_schedule' }), s.approved({ kind: 'teacher_section' }), courses()]);
    const link = classLinker(data.courses);
    const list = collectSchedules(scheds.filter((x) => x.teacher === name), secs.filter((x) => x.teacher === name))[name]?.list || [];
    const add = `${root}submit/?kind=room_schedule&teacher=${encodeURIComponent(name)}`;
    box.innerHTML = scheduleBlock(list, { add, link, rooms: true })
      + (list.length ? `<p class="meta">${list[0].room ? `<a href="${root}map/#${encodeURIComponent(list[0].room)}">See room ${esc(list[0].room)} on the map</a> · ` : ''}<a href="${add}">Add or update a schedule</a></p>` : '');
  },
};

await pages[which]?.();
