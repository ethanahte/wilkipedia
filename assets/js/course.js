// A course page. The static HTML (tools/build.py) carries the catalog facts and
// the teacher list; everything students contributed is fetched and drawn here.

import { initHeader, requireUser, drafts, $, esc, byline, avatarHtml, prose, safeUrl, fmtDate, ago, guard, toast, root } from './ui.js';
import { KINDS, staleness } from './forms.js';
import { REVIEWER_ROLES } from './store.js';

const page = JSON.parse($('#page-data').textContent);
const s = await initHeader();
const submitUrl = (kind, teacher) =>
  `${root}submit/?course=${page.slug}&kind=${kind}${teacher ? `&teacher=${encodeURIComponent(teacher)}` : ''}`;

const PROMPTS = ['General', 'What surprised you?', 'How much time did it take each week?',
                 'Advice for next year’s students?', 'Who should (or shouldn’t) take it?'];

function meta(sub, target) {
  const stale = staleness(sub);
  return `${stale ? `<div class="stale">${esc(stale)}</div>` : ''}
    <div class="meta">By ${byline(sub.author, sub.verified)} · checked ${fmtDate(sub.reviewed_at)}
      ${sub.payload.school_year ? ` · ${esc(sub.payload.school_year)}` : ''}
      · <button class="linkish" data-report="${esc(target)}">Report outdated</button></div>`;
}

function fieldList(kind, payload, skip = []) {
  const facts = KINDS[kind].fields
    .filter((f) => payload[f.key] && !skip.includes(f.key) && f.key !== 'school_year')
    .map((f) => {
      const v = payload[f.key];
      const body = f.type === 'url'
        ? (safeUrl(v) ? `<a href="${esc(safeUrl(v))}" target="_blank" rel="noopener nofollow">Open link ↗</a>` : esc(v))
        : f.type === 'textarea' ? prose(v) : esc(v);
      return `<div class="fact"><div class="label">${esc(f.label)}</div><div class="v">${body}</div></div>`;
    }).join('');
  return facts ? `<div class="kv-grid">${facts}</div>` : '';
}

function empty(text, kind, teacher, cta = 'Add it') {
  return `<div class="empty-card"><p>${esc(text)}</p><a class="btn small" href="${submitUrl(kind, teacher)}">${esc(cta)}</a></div>`;
}

const initial = (name) => esc(name.trim().split(/\s+/).pop().charAt(0).toUpperCase());

async function draw() {
  const subs = await s.approved({ course_slug: page.slug });
  const latest = (kind, pred = () => true) => subs.find((x) => x.kind === kind && pred(x));

  // Overview
  const ov = latest('course_overview');
  const stat = (label, v) => (v ? `<div class="stat"><span class="label">${label}</span><b>${esc(v)}</b></div>` : '');
  $('#overview').innerHTML = ov
    ? `<div class="stat-grid">${stat('Time outside class', ov.payload.workload)}${stat('Difficulty', ov.payload.difficulty)}${stat('AP exam', ov.payload.ap_exam)}</div>
       <blockquote class="quote">${prose(ov.payload.summary)}</blockquote>
       ${fieldList('course_overview', ov.payload, ['summary', 'workload', 'difficulty', 'ap_exam'])}
       ${meta(ov, 'overview')}
       <a class="edit" href="${submitUrl('course_overview')}">Suggest an update</a>`
    : empty('No student overview yet. Took this class? Tell next year’s students what it’s really like.', 'course_overview', null, 'Write the overview');

  // Teachers: directory list first, then anyone who only appears in submissions
  const names = [...page.teachers];
  for (const x of subs) if (x.kind === 'teacher_section' && x.teacher && !names.includes(x.teacher)) names.push(x.teacher);
  const sections = names.map((t) => [t, latest('teacher_section', (x) => x.teacher === t)]);
  const tLink = (t) => (page.teacherSlugs?.[t] ? `<a href="${root}teachers/${page.teacherSlugs[t]}/">${esc(t)}</a>` : esc(t));
  $('#teachers').innerHTML = names.length ? sections.map(([t, sec]) => `
    <article class="teacher ${sec ? '' : 'is-empty'}" id="t-${esc(t.toLowerCase().replace(/\W+/g, '-'))}">
      <header class="t-head"><span class="t-av" aria-hidden="true">${initial(t)}</span>
        <div><h3>${tLink(t)}</h3>${sec?.payload.room ? `<a class="meta" href="${root}map/#${encodeURIComponent(sec.payload.room.toUpperCase().replace(/^ROOM\s*/, '').replace(/[\s-]+/g, ''))}">Room ${esc(sec.payload.room)} · on the map</a>` : ''}</div></header>
      ${sec ? fieldList('teacher_section', sec.payload, ['room', 'source']) + meta(sec, `teacher:${t}`)
              + `<a class="edit" href="${submitUrl('teacher_section', t)}">Suggest an update</a>`
            : `<p class="meta">Nobody has described this teacher’s version yet.</p><a class="btn small ghost" href="${submitUrl('teacher_section', t)}">Fill it in</a>`}
    </article>`).join('')
    : empty('We don’t know who teaches this yet.', 'teacher_section', null, 'Add a teacher');

  const filled = sections.filter(([, sec]) => sec);
  $('#compare').hidden = filled.length < 2;
  if (filled.length >= 2) {
    const rows = [['test_style', 'Tests'], ['grading', 'Grading'], ['homework', 'Homework'], ['retakes', 'Retakes']];
    $('#compare-table').innerHTML = `<thead><tr><th></th>${filled.map(([t]) => `<th>${esc(t)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([k, l]) => `<tr><th>${l}</th>${filled.map(([, sec]) =>
        `<td>${esc(sec.payload[k] || '—')}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }

  // Resources
  const res = subs.filter((x) => x.kind === 'resource');
  $('#resources').innerHTML = res.length ? `<div class="res-list">${res.map((r) => {
    const u = safeUrl(r.payload.url);
    return `<${u ? `a href="${esc(u)}" target="_blank" rel="noopener nofollow"` : 'div'} class="res-card">
      <span class="tag">${esc(r.payload.type)}</span><b>${esc(r.payload.title)}</b>
      ${r.payload.note ? `<span class="note-line">${esc(r.payload.note)}</span>` : ''}
      <span class="meta">Shared by ${byline(r.author, r.verified)}</span>${u ? '<span class="arrow" aria-hidden="true">↗</span>' : ''}</${u ? 'a' : 'div'}>`;
  }).join('')}</div><a class="edit" href="${submitUrl('resource')}">Share another</a>`
    : empty('No resources yet. Made a study guide or found a great video?', 'resource', null, 'Share one');

  // Tips
  const tips = subs.filter((x) => x.kind === 'tip');
  $('#tips').innerHTML = tips.length ? `<div class="tip-list">${tips.map((t) => `<figure class="tip-card">${prose(t.payload.text)}
      <figcaption class="meta">${byline(t.author, t.verified)}${t.teacher ? ` · ${esc(t.teacher)}’s class` : ''}</figcaption></figure>`).join('')}</div>
      <a class="edit" href="${submitUrl('tip')}">Add a tip</a>`
    : empty('No tips yet. What do you wish you’d known on day one?', 'tip', null, 'Add the first tip');

  // Summer homework
  const sh = subs.filter((x) => x.kind === 'summer_hw');
  $('#summer').innerHTML = sh.length ? sh.map((x) => `<div class="summer-item">
      <h4>${x.teacher ? esc(x.teacher) : 'All sections'} <span class="tag">${esc(x.payload.school_year)}</span></h4>
      ${fieldList('summer_hw', x.payload)}${meta(x, `summer:${x.teacher || ''}`)}</div>`).join('')
    : empty('No summer homework reported for this class.', 'summer_hw', null, 'Report summer homework');
}

// ── comments ──
async function drawComments() {
  const me = s.user();
  const mod = me && REVIEWER_ROLES.includes(me.role);
  const all = await s.comments(page.slug);
  const top = all.filter((c) => !c.parent_id).reverse();
  const one = (c, reply = false) => `
    <div class="comment ${reply ? 'reply' : ''}" data-id="${c.id}">
      <div class="c-head">${avatarHtml(c)}<b>${esc(c.author)}</b>${byline('', c.verified)} <span class="meta">${ago(c.created_at)}</span>
        ${c.prompt && c.prompt !== 'General' ? `<span class="tag">${esc(c.prompt)}</span>` : ''}
        ${c.status === 'held' ? '<span class="tag warn">Waiting for approval</span>' : ''}
        ${c.status === 'hidden' ? '<span class="tag warn">Hidden (reported)</span>' : ''}</div>
      <div class="c-body">${prose(c.body)}</div>
      <div class="c-actions">
        <button class="linkish" data-like="${c.id}" aria-pressed="${c.liked}">${c.liked ? '♥' : '♡'} ${c.likes || ''}</button>
        ${reply ? '' : `<button class="linkish" data-reply="${c.id}">Reply</button>`}
        ${me && (me.id === c.user_id || mod) ? `<button class="linkish" data-del="${c.id}">Delete</button>` : ''}
        ${me && me.id !== c.user_id ? `<button class="linkish" data-flag="${c.id}">Report</button>` : ''}
      </div>
      ${reply ? '' : all.filter((r) => r.parent_id === c.id).map((r) => one(r, true)).join('')}
    </div>`;
  $('#comment-list').innerHTML = top.length ? top.map((c) => one(c)).join('')
    : '<div class="empty">No comments yet. Be the first to share what this class is like.</div>';
}

$('#comment-prompt').innerHTML = PROMPTS.map((p) => `<option>${esc(p)}</option>`).join('');
drafts.bind($('#comment-body'), `comment:${page.slug}`);

$('#comment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = $('#comment-body').value.trim();
  if (!body) return;
  if (!(await requireUser(s, 'to comment'))) return;
  const parent_id = Number($('#comment-form').dataset.parent) || null;
  const ok = await guard(() => s.addComment({ course_slug: page.slug, body, parent_id,
                                              prompt: parent_id ? null : $('#comment-prompt').value }));
  if (!ok) return;
  $('#comment-body').value = '';
  drafts.clear(`comment:${page.slug}`);
  delete $('#comment-form').dataset.parent;
  $('#replying').hidden = true;
  const mine = (await s.comments(page.slug)).filter((c) => c.user_id === s.user().id).pop();
  toast(mine?.status === 'held' ? 'Thanks! Your comment will appear after a reviewer approves it.' : 'Posted.');
  drawComments();
});

$('#cancel-reply').addEventListener('click', () => {
  delete $('#comment-form').dataset.parent;
  $('#replying').hidden = true;
});

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.report) {
    if (!(await requireUser(s, 'to report outdated info'))) return;
    const note = prompt('What looks out of date? (optional)') ;
    if (note === null) return;
    await guard(() => s.report({ kind: 'outdated', course_slug: page.slug, target: t.dataset.report, note: note || null }),
                'Thanks. A reviewer will check it.');
  } else if (t.dataset.like) {
    if (!(await requireUser(s, 'to like comments'))) return;
    const id = Number(t.dataset.like);
    await guard(() => (t.getAttribute('aria-pressed') === 'true' ? s.unlike(id) : s.like(id)));
    drawComments();
  } else if (t.dataset.reply) {
    $('#comment-form').dataset.parent = t.dataset.reply;
    $('#replying').hidden = false;
    $('#comment-body').focus();
  } else if (t.dataset.del) {
    if (!confirm('Delete this comment?')) return;
    await guard(() => s.deleteComment(Number(t.dataset.del)), 'Deleted.');
    drawComments();
  } else if (t.dataset.flag) {
    const note = prompt('Why should a reviewer look at this comment?');
    if (note === null) return;
    await guard(() => s.report({ kind: 'inappropriate', course_slug: page.slug,
                                 target: `comment:${t.dataset.flag}`, note: note || null }),
                'Reported. It is hidden until a reviewer checks it.');
    drawComments();
  }
});

s.onAuth(() => { draw(); drawComments(); });
await Promise.all([draw(), drawComments()]);
