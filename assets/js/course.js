// A course page. The static HTML (tools/build.py) carries the catalog facts and
// the teacher list; everything students contributed is fetched and drawn here.

import { initHeader, requireUser, openEditor, suggestLink, linkPdfs, courses, $, esc, byline, prose, safeUrl, fmtDate, guard, root } from './ui.js';
import { KINDS, staleness } from './forms.js';
import { mountComments } from './comments.js';
import { REVIEWER_ROLES } from './store.js';

const page = JSON.parse($('#page-data').textContent);
const s = await initHeader();
import('./palette.js').then((m) => m.rememberClass(page.slug, page.name));   // for the palette's "Recently opened"
const submitUrl = (kind, teacher) =>
  `${root}submit/?course=${page.slug}&kind=${kind}${teacher ? `&teacher=${encodeURIComponent(teacher)}` : ''}`;

const PROMPTS = ['General', 'What surprised you?', 'How much time did it take each week?',
                 'Advice for next year’s students?', 'Who should (or shouldn’t) take it?'];

// Reviewers get an Unpublish link on everything students wrote
const isMod = () => REVIEWER_ROLES.includes(s.user()?.role);
let subsById = {};
const unpub = (sub) => (isMod() ? ` · <button class="linkish" data-edit="${sub.id}">Edit</button> · <button class="linkish danger-link" data-unpub="${sub.id}">Unpublish</button>` : suggestLink(s, sub));
// edited_by is the author when their own update was approved (migration 014)
const edited = (sub) => (sub.edited_at ? ` · <span class="edited-mark">${sub.edited_by && sub.edited_by === sub.user_id ? 'updated' : 'edited by a reviewer'} ${fmtDate(sub.edited_at)}</span>` : '');

function meta(sub, target) {
  const stale = staleness(sub);
  return `${stale ? `<p class="stale">${esc(stale)}</p>` : ''}
    <div class="meta">By ${byline(sub.author, sub.verified)} · checked ${fmtDate(sub.reviewed_at)}
      ${sub.payload.school_year ? ` · ${esc(sub.payload.school_year)}` : ''}
      ${edited(sub)} · <button class="linkish" data-report="${esc(target)}">Report outdated</button>${unpub(sub)}</div>`;
}

function fieldList(kind, payload, skip = []) {
  const facts = KINDS[kind].fields
    .filter((f) => payload[f.key] && !skip.includes(f.key) && f.key !== 'school_year' && !f.reviewOnly)   // review-only files stay off the page
    .map((f) => {
      const v = payload[f.key];
      const body = f.type === 'url'
        ? (safeUrl(v) ? `<a href="${esc(safeUrl(v))}" target="_blank" rel="noopener nofollow">Open link ↗</a>` : esc(v))
        : f.type === 'textarea' ? prose(v) : esc(v);
      return `<div><dt>${esc(f.label)}</dt><dd>${body}</dd></div>`;
    }).join('');
  return facts ? `<dl class="flist">${facts}</dl>` : '';
}

// What's not written yet goes in one "Help finish this page" block instead of a stack of empty sections
const TODO = {
  overview: ['course_overview', 'Write the overview', 'What the class is really like, the time it takes and how hard it is.'],
  resources: ['resource', 'Share a study guide', 'A guide you made, or a video or site that helped.'],
  tips: ['tip', 'Add a tip', 'What you wish you’d known on day one.'],
  summer: ['summer_hw', 'Report summer homework', 'If the class has any, what it is and when it’s due.'],
};
// A choice from an ordered list (time outside class, difficulty) drawn as a small scale
function scale(kind, key, v) {
  const opts = KINDS[kind].fields.find((f) => f.key === key)?.options || [];
  const at = opts.indexOf(v);
  if (at < 0) return v ? `<span>${esc(v)}</span>` : '';
  return `<span class="c-scale" role="img" aria-label="${esc(v)}, ${at + 1} of ${opts.length}">${opts.map((_, i) => `<i class="${i <= at ? 'on' : ''}"></i>`).join('')}</span><span>${esc(v)}</span>`;
}
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

let teacherTab = null, lastSubs = null;
async function draw(reuse = false) {             // reuse: just redraw (switching a tab), don't fetch again
  const subs = reuse && lastSubs ? lastSubs : await s.approved({ course_slug: page.slug });
  lastSubs = subs;
  subsById = Object.fromEntries(subs.map((x) => [x.id, x]));
  const latest = (kind, pred = () => true) => subs.find((x) => x.kind === kind && pred(x));

  // ── What students say ──
  const ov = latest('course_overview');
  const stat = (label, html) => (html ? `<div><dt>${label}</dt><dd>${html}</dd></div>` : '');
  $('#overview').innerHTML = ov
    ? `<blockquote class="pull">${prose(ov.payload.summary)}</blockquote>
       <dl class="c-gauges">${stat('Time outside class', scale('course_overview', 'workload', ov.payload.workload))}
         ${stat('Difficulty', scale('course_overview', 'difficulty', ov.payload.difficulty))}${stat('AP exam', ov.payload.ap_exam && esc(ov.payload.ap_exam))}</dl>
       ${fieldList('course_overview', ov.payload, ['summary', 'workload', 'difficulty', 'ap_exam'])}
       ${meta(ov, 'overview')}
       <a class="edit" href="${submitUrl('course_overview')}">Suggest an update</a>` : '';

  // ── Teachers: the directory's list first, then anyone who only appears in submissions ──
  const names = [...page.teachers];
  for (const x of subs) if (x.kind === 'teacher_section' && x.teacher && !names.includes(x.teacher)) names.push(x.teacher);
  const sections = names.map((t) => [t, latest('teacher_section', (x) => x.teacher === t)]);
  const tLink = (t) => (page.teacherSlugs?.[t] ? `<a href="${root}teachers/${page.teacherSlugs[t]}/">${esc(t)}</a>` : esc(t));
  const written = sections.filter(([, sec]) => sec), unwritten = sections.filter(([, sec]) => !sec);
  const room = (sec) => (sec.payload.room ? `<a class="t-room" href="${root}map/#${encodeURIComponent(sec.payload.room.toUpperCase().replace(/^ROOM\s*/, '').replace(/[\s-]+/g, ''))}">Room ${esc(sec.payload.room)} · on the map</a>` : '');
  // with tabs the name is already on the tab, so the card leads with the room and the teacher's page
  const card = ([t, sec]) => `<article class="teacher">
      <header class="t-head">${written.length >= 2 ? (page.teacherSlugs?.[t] ? `<a class="t-page" href="${root}teachers/${page.teacherSlugs[t]}/">${esc(t)}’s teacher page →</a>` : '') : `<h3>${tLink(t)}</h3>`}${room(sec)}</header>
      ${fieldList('teacher_section', sec.payload, ['room', 'source']) + meta(sec, `teacher:${t}`)}
      <a class="edit" href="${submitUrl('teacher_section', t)}">Suggest an update</a></article>`;
  // Several written: one at a time, with tabs, and a Compare tab to see them side by side
  const COMPARE = [['test_style', 'Tests'], ['grading', 'Grading'], ['homework', 'Homework'], ['late_policy', 'Late work'], ['retakes', 'Retakes']];
  if (!written.some(([t]) => t === teacherTab) && teacherTab !== '__compare') teacherTab = written[0]?.[0] ?? null;
  if (written.length < 2 && teacherTab === '__compare') teacherTab = written[0]?.[0] ?? null;
  const compare = () => {
    const rows = COMPARE.filter(([k]) => written.some(([, sec]) => sec.payload[k]));
    return `<div class="scroll-x"><table class="compare"><thead><tr><th></th>${written.map(([t]) => `<th scope="col">${esc(t)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([k, l]) => `<tr><th scope="row">${l}</th>${written.map(([, sec]) => `<td>${sec.payload[k] ? prose(sec.payload[k]) : '<span class="meta">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  const tabs = written.length >= 2 ? `<div class="vtabs t-tabs" role="tablist" aria-label="Teachers">${written.map(([t]) =>
      `<button type="button" class="vtab" role="tab" data-ttab="${esc(t)}" aria-selected="${teacherTab === t}">${esc(t)}</button>`).join('')}
      <button type="button" class="vtab" role="tab" data-ttab="__compare" aria-selected="${teacherTab === '__compare'}">Compare</button></div>` : '';
  const shown = teacherTab === '__compare' ? compare() : written.filter(([t]) => t === teacherTab).map(card).join('');
  $('#teachers').innerHTML = !names.length
    ? `<p class="empty-line">We don’t know who teaches this yet. <a class="add-link" href="${submitUrl('teacher_section')}">Add a teacher →</a></p>`
    : `${tabs}${shown}
      ${unwritten.length ? `<div class="t-missing">${written.length ? '<p class="t-missing-h">Not written yet</p>' : '<p class="empty-line">Nobody has described a teacher’s version yet. Took it? Pick your teacher:</p>'}
        <ul>${unwritten.map(([t]) => `<li><span>${tLink(t)}</span><a class="add-link" href="${submitUrl('teacher_section', t)}">Fill it in →</a></li>`).join('')}</ul></div>` : ''}`;

  // ── Study guides and resources ──
  const res = subs.filter((x) => x.kind === 'resource');
  // A guide shared across classes says which others it's for
  const classNames = res.some((r) => r.payload.also?.length) ? Object.fromEntries((await courses()).courses.map((c) => [c.slug, c.name])) : {};
  const alsoFor = (r) => { const o = [r.course_slug, ...(r.payload.also || [])].filter((x) => x && x !== page.slug);
    return o.length ? ` · Also for ${o.map((x) => esc(classNames[x] || x)).join(', ')}` : ''; };
  // Filter tabs when resources are tied to more than one teacher
  const resTeachers = [...new Set(res.map((r) => r.teacher).filter(Boolean))];
  const resFilter = resTeachers.length >= 2 || (resTeachers.length === 1 && res.some((r) => !r.teacher))
    ? `<div class="vtabs res-filter" role="group" aria-label="Show">${['All', ...resTeachers].map((t, i) =>
        `<button type="button" class="vtab" data-res-t="${i ? esc(t) : ''}" aria-pressed="${!i}">${i ? `${esc(t)}’s class` : 'All'}</button>`).join('')}</div>` : '';
  $('#resources').innerHTML = res.length ? `${resFilter}<div class="res-list">${res.map((r) => {
    const u = safeUrl(r.payload.url);
    const by = `<span class="meta">${r.payload.author
        ? `By <b>${esc(r.payload.author)}</b> · shared by ${byline(r.author, r.verified)}`
        : `Made by ${byline(r.author, r.verified)}`}${alsoFor(r)}${unpub(r)}</span>`;
    const tags = `<span class="res-tags"><span class="tag">${esc(r.payload.type)}</span>${r.payload.pdf?.path ? '<span class="tag">PDF</span>' : ''}${r.teacher ? `<span class="tag teacher-tag">For ${esc(r.teacher)}’s class</span>` : ''}</span>`;
    // An uploaded study guide: the card opens the PDF, and a link to its live version sits beside it
    if (r.payload.pdf?.path) {
      return `<div class="res-card has-pdf" data-teacher="${esc(r.teacher || '')}">${tags}
        <a class="res-main" data-pdf="${esc(r.payload.pdf.path)}" href="#" aria-disabled="true" target="_blank" rel="noopener"><b>${esc(r.payload.title)}</b></a>
        ${r.payload.note ? `<span class="note-line">${esc(r.payload.note)}</span>` : ''}
        ${by}${u ? `<a class="res-alt" href="${esc(u)}" target="_blank" rel="noopener nofollow">Live version ↗</a>` : ''}
        <span class="arrow" aria-hidden="true">↗</span></div>`;
    }
    return `<${u ? `a href="${esc(u)}" target="_blank" rel="noopener nofollow"` : 'div'} class="res-card" data-teacher="${esc(r.teacher || '')}">${tags}<b>${esc(r.payload.title)}</b>
      ${r.payload.note ? `<span class="note-line">${esc(r.payload.note)}</span>` : ''}${by}${u ? '<span class="arrow" aria-hidden="true">↗</span>' : ''}</${u ? 'a' : 'div'}>`;
  }).join('')}</div><a class="edit" href="${submitUrl('resource')}">Share another</a>` : '';
  linkPdfs($('#resources'), s);

  // ── Tips ──
  const tips = subs.filter((x) => x.kind === 'tip');
  $('#tips').innerHTML = tips.length ? `<div class="tip-list">${tips.map((t) => `<figure class="tip-card">${prose(t.payload.text)}
      <figcaption class="meta">${byline(t.author, t.verified)}${t.teacher ? ` · ${esc(t.teacher)}’s class` : ''}${unpub(t)}</figcaption></figure>`).join('')}</div>
      <a class="edit" href="${submitUrl('tip')}">Add a tip</a>` : '';

  // ── Summer homework ──
  const sh = subs.filter((x) => x.kind === 'summer_hw');
  $('#summer').innerHTML = sh.length ? sh.map((x) => `<div class="summer-item">
      <h4>${x.teacher ? esc(x.teacher) : 'All sections'} <span class="tag">${esc(x.payload.school_year)}</span></h4>
      ${fieldList('summer_hw', x.payload)}${meta(x, `summer:${x.teacher || ''}`)}</div>`).join('') : '';

  // ── empty parts fold into "Help finish this page"; the side index counts what's there ──
  const have = { overview: !!ov, resources: res.length, tips: tips.length, summer: sh.length };
  const missing = Object.keys(TODO).filter((k) => !have[k]);
  for (const k of Object.keys(TODO)) $(`#s-${k}`).hidden = !have[k];
  $('#s-todo').hidden = !missing.length;
  $('#todo').innerHTML = missing.map((k) => { const [kind, title, line] = TODO[k];
    return `<a class="c-todo-item" href="${submitUrl(kind)}"><b>${title}</b><span>${line}</span><i aria-hidden="true">→</i></a>`; }).join('');
  const count = (k, text, done) => { const a = $(`#c-toc [data-sec="${k}"]`); if (!a) return;
    $('.n', a).textContent = text; a.classList.toggle('empty', !done); a.href = done || k === 'teachers' ? `#s-${k}` : '#s-todo'; };
  count('overview', ov ? '✓' : '—', !!ov);
  count('teachers', names.length ? `${written.length}/${names.length}` : '—', true);
  count('resources', res.length || '—', res.length);
  count('tips', tips.length || '—', tips.length);
  count('summer', sh.length || '—', sh.length);
  // how much of the page is written: the overview, the teachers (each counts a share), guides and tips
  const parts = [ov ? 1 : 0, names.length ? written.length / names.length : 0, res.length ? 1 : 0, tips.length ? 1 : 0];
  const pct = Math.round((parts.reduce((x, y) => x + y, 0) / parts.length) * 100);
  $('#c-progress').hidden = false;
  $('#c-progress').innerHTML = `<p><b>${pct}%</b> written</p><span class="c-bar" role="img" aria-label="${pct}% of this page is written"><i style="width:${pct}%"></i></span>
    <p class="meta">${pct >= 100 ? 'Every part has something. Keep it current.' : `${missing.length ? `${plural(missing.length, 'part')} still empty. ` : ''}<a href="#s-todo">Help finish it</a>`}</p>`;
  if (pct >= 100 || !missing.length) $('#c-progress a')?.remove();
  spy();
}

// The side index marks the section you're reading
function spy() {
  const secs = [...document.querySelectorAll('.c-main > .c-sec:not([hidden])')];
  const mark = () => {
    const at = innerHeight + scrollY >= document.documentElement.scrollHeight - 4 ? secs.at(-1)
      : secs.filter((x) => x.getBoundingClientRect().top < 160).at(-1) || secs[0];
    document.querySelectorAll('#c-toc a').forEach((a) => a.toggleAttribute('aria-current', a.getAttribute('href') === `#${at?.id}`));
  };
  spy.mark = mark;
  mark();
}
addEventListener('scroll', () => spy.mark?.(), { passive: true });

// ── comments ──
const comments = mountComments(s, { slug: page.slug, prompts: PROMPTS,
  empty: 'No comments yet. Be the first to share what this class is like.',
  onCount: (n) => { const el = $('#c-toc [data-sec="comments"] .n'); if (el) el.textContent = n || '—'; } });
const drawComments = comments.draw;

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.ttab) { teacherTab = t.dataset.ttab; draw(true); return; }
  if ('resT' in t.dataset) {
    const want = t.dataset.resT;
    document.querySelectorAll('.res-filter .vtab').forEach((c) => c.setAttribute('aria-pressed', c === t));
    // "All" shows everything; a teacher shows theirs plus guides for any teacher
    document.querySelectorAll('.res-card').forEach((c) => (c.hidden = !!want && !!c.dataset.teacher && c.dataset.teacher !== want));
    return;
  }
  if (t.dataset.edit) {
    e.preventDefault();
    openEditor(s, subsById[t.dataset.edit], draw);
    return;
  }
  if (t.dataset.suggest) {
    e.preventDefault();                       // it may sit inside a resource link
    if (await requireUser(s, 'to suggest a change')) openEditor(s, subsById[t.dataset.suggest], null, 'author');
    return;
  }
  if (t.dataset.unpub) {
    e.preventDefault();                       // it may sit inside a resource link
    const note = prompt('Unpublish this? It comes off the page but stays saved (you can republish it from Dashboard → Published).\n\nReason (the author will see this):');
    if (note === null) return;
    if (await guard(() => s.review(Number(t.dataset.unpub), 'rejected', note || 'Unpublished by a reviewer'), 'Unpublished.')) draw();
    return;
  }
  if (t.dataset.report) {
    if (!(await requireUser(s, 'to report outdated info'))) return;
    const note = prompt('What looks out of date? (optional)') ;
    if (note === null) return;
    await guard(() => s.report({ kind: 'outdated', course_slug: page.slug, target: t.dataset.report, note: note || null }),
                'Thanks. A reviewer will check it.');
  }
});

s.onAuth(() => { draw(); drawComments(); });
await Promise.all([draw(), drawComments()]);
