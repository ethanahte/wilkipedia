// Requests (Ethan 2026-10-20): students ask for what they need for a class, and others tap
// "Me too", so the people who make study guides can see what's wanted most. One module draws
// both the Requests page (requests/) and the short "Students are asking for" list on a class page.
// Data: store.requests / addRequest / voteRequest / setRequest / deleteRequest (migration 024).

import { $, $$, esc, root, courses, courseUrl, byline, ago, guard, toast, requireUser, popconfirm, openBountyEditor } from './ui.js';
import { REVIEWER_ROLES } from './store.js';

export const REQ_KINDS = [['guide', 'Study guide'], ['practice', 'Practice problems'], ['notes', 'Notes'],
  ['teacher', 'A teacher’s version'], ['overview', 'Class overview'], ['other', 'Something else']];
const KIND = Object.fromEntries(REQ_KINDS);
// asking for real tests or answer keys breaks Community rule 1; the form says so before it's sent
const TESTY = /\b(answer ?keys?|test answers|quiz answers|the (actual|real) (test|quiz|exam)|answers to the (test|quiz))\b/i;
const want = (r) => r.votes + 1;                   // the asker wants it too

let classes = null;
async function classList() {
  if (!classes) { const d = await courses(); classes = d; }
  return classes;
}

// One request, as an index row: the count and "Me too" on the left, the ask, then who and where
function row(r, s, names, { showClass = true } = {}) {
  const me = s.user(), mine = !!me && r.user_id === me.id, mod = REVIEWER_ROLES.includes(me?.role), admin = me?.role === 'admin';
  const where = r.course_slug ? `<a href="${courseUrl(r.course_slug)}">${esc(names[r.course_slug] || r.course_slug)}</a>` : 'Whole school';
  const acts = [];
  if (r.status === 'held' && mod) acts.push('<button class="linkish" data-rq="publish">Publish</button>');
  if (r.status === 'open' && (mine || mod)) acts.push('<button class="linkish" data-rq="done">Mark done…</button>');
  if (r.status === 'done' && (mine || mod)) acts.push('<button class="linkish" data-rq="reopen">Reopen</button>');
  if (r.status === 'open' && admin) acts.push('<button class="linkish" data-rq="bounty">Make it a bounty</button>');
  if (mod && r.status !== 'hidden' && !mine) acts.push('<button class="linkish danger-link" data-rq="hide">Hide</button>');
  if (mod && r.status === 'hidden') acts.push('<button class="linkish" data-rq="publish">Show again</button>');
  if (mine || mod) acts.push('<button class="linkish danger-link" data-rq="delete">Delete</button>');
  const state = r.status === 'held' ? '<span class="rq-state">Waiting for a reviewer</span>'
    : r.status === 'hidden' ? '<span class="rq-state bad">Hidden</span>'
    : r.status === 'done' ? '<span class="rq-state done">Done</span>' : '';
  const done = r.status === 'done' && (r.done_note || r.done_link)
    ? `<p class="rq-done">${r.done_note ? esc(r.done_note) : 'Made.'}${r.done_link ? ` <a href="${esc(r.done_link)}"${/^https?:/.test(r.done_link) ? ' target="_blank" rel="noopener nofollow"' : ''}>Open it →</a>` : ''}</p>` : '';
  return `<li class="rq-row${r.status === 'done' ? ' is-done' : ''}" data-rid="${r.id}">
    <div class="rq-want"><b>${want(r)}</b><span>${want(r) === 1 ? 'wants' : 'want'} this</span>
      ${r.status === 'open' ? (mine ? '<span class="rq-you">You asked</span>'
        : `<button type="button" class="rq-vote" data-rq="vote" aria-pressed="${r.voted}">${r.voted ? 'Me too ✓' : 'Me too'}</button>`) : ''}</div>
    <div class="rq-main"><p class="rq-body">${esc(r.body)}</p>
      <p class="rq-meta">${state}${esc(KIND[r.kind] || 'Request')}${showClass ? ` · ${where}` : ''}${r.teacher ? ` · ${esc(r.teacher)}’s class` : ''} · asked by ${byline(r.author, r.verified)} · ${ago(r.created_at)}${acts.length ? ` · ${acts.join(' · ')}` : ''}</p>
      ${done}</div></li>`;
}

// The ask form. `course` pre-picks a class (and hides the picker on a class page).
function formHtml(data, course, fixed) {
  const opts = data.departments.map((d) => `<optgroup label="${esc(d.name)}">${data.courses.filter((c) => c.department === d.slug)
    .map((c) => `<option value="${c.slug}"${c.slug === course ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
  return `<form class="rq-form" id="rq-form">
    <div class="rq-grid">
      ${fixed ? `<input type="hidden" name="course" value="${esc(course)}">` : `<label class="rq-f"><span>Class</span><select name="course" aria-label="Class" required>
        <option value="">Pick a class…</option><option value="__school"${course === '__school' ? ' selected' : ''}>Whole school (SAT, general)</option>${opts}</select></label>`}
      <label class="rq-f"><span>What kind</span><select name="kind" aria-label="What kind">${REQ_KINDS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
    </div>
    <label class="rq-f rq-f-wide"><span>What do you need?</span>
      <input name="body" maxlength="300" required placeholder="e.g. A study guide for chapter 9, cellular respiration"></label>
    <p class="hint">One thing per request. No real tests, quizzes or answer keys: ask for practice instead.</p>
    <p class="rq-warn" id="rq-warn" hidden>That sounds like a real test or answer key, which Wilkipedia can’t share. Ask for practice problems or a study guide instead.</p>
    <div class="rq-send"><button class="btn">Post request</button></div>
  </form>`;
}

// Mount the Requests UI into `el`.
//   course: a class slug to limit to that class (class page); undefined for the whole site
//   compact: the class-page version (top few, a link to the full page)
export async function mountRequests(el, s, { course, compact = false } = {}) {
  const data = await classList();
  const names = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
  const pre = new URLSearchParams(location.search).get('course') || '';
  let view = 'wanted', q = '', list = [];

  const load = async () => {
    list = await s.requests(course === undefined ? {} : { course }).catch((e) => { toast(e.message, 'bad'); return []; });
    paint();
  };
  const sorted = () => {
    const open = list.filter((r) => r.status === 'open');
    if (view === 'done') return list.filter((r) => r.status === 'done').sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
    if (view === 'new') return list.filter((r) => r.status !== 'done');
    return open.sort((a, b) => want(b) - want(a) || b.created_at.localeCompare(a.created_at))
      .concat(list.filter((r) => ['held', 'hidden'].includes(r.status)));
  };
  const paint = () => {
    if (list === null) {                              // migration 024 not run yet
      if (compact) { const sec = el.closest('.c-sec'); if (sec) sec.hidden = true; const t = document.querySelector('#c-toc [data-sec="requests"]'); if (t) t.hidden = true; return; }
      el.innerHTML = '<p class="empty-line">Requests are almost ready: they turn on once the database is updated.</p>';
      return;
    }
    const open = list.filter((r) => r.status === 'open').length;
    if (compact) {
      const top = list.filter((r) => r.status === 'open').sort((a, b) => want(b) - want(a)).slice(0, 4);
      const n = document.querySelector('#c-toc [data-sec="requests"] .n'); if (n) n.textContent = open || '—';
      el.innerHTML = `${top.length ? `<ol class="rq-list">${top.map((r) => row(r, s, names, { showClass: false })).join('')}</ol>` : '<p class="meta">Nobody has asked for anything for this class yet.</p>'}
        <p class="rq-more"><a class="add-link" href="${root}requests/?course=${encodeURIComponent(course)}#ask">Ask for something →</a>${open > top.length ? ` <a href="${root}requests/?course=${encodeURIComponent(course)}">All ${open} requests</a>` : ''}</p>`;
      return;
    }
    const rows = sorted().filter((r) => !q || `${r.body} ${names[r.course_slug] || 'whole school'} ${KIND[r.kind]} ${r.teacher || ''}`.toLowerCase().includes(q));
    const doneN = list.filter((r) => r.status === 'done').length;
    $('#rq-list', el).innerHTML = rows.length ? rows.map((r) => row(r, s, names)).join('')
      : `<li class="rq-empty">${q ? 'Nothing matches that.' : view === 'done' ? 'Nothing done yet.' : 'No requests yet. Be the first to ask.'}</li>`;
    $('#rq-count', el).textContent = `${open} open · ${doneN} done`;
    $$('#rq-tabs .vtab', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === view)));
  };

  if (!compact) {
    el.innerHTML = `<section class="rq-ask" id="ask"><h2>Ask for something</h2>
        <div id="rq-ask-body"></div></section>
      <section class="rq-board"><div class="rq-bar"><div class="vtabs" id="rq-tabs" role="group" aria-label="Show">
          <button type="button" class="vtab" data-v="wanted" aria-pressed="true">Most wanted</button>
          <button type="button" class="vtab" data-v="new" aria-pressed="false">Newest</button>
          <button type="button" class="vtab" data-v="done" aria-pressed="false">Done</button></div>
        <span class="rq-count meta" id="rq-count"></span>
        <input type="search" id="rq-q" placeholder="Filter by class or words" aria-label="Filter requests"></div>
        <ol class="rq-list" id="rq-list"><li class="rq-empty">Loading…</li></ol></section>`;
    const askBody = $('#rq-ask-body', el);
    const drawAsk = () => {
      askBody.innerHTML = s.user() ? formHtml(data, pre, false)
        : '<p class="meta">Sign in to ask. Reading never needs an account.</p><p><button class="btn js-rq-signin">Sign in to ask</button></p>';
      wireForm();
    };
    const wireForm = () => {
      const f = $('#rq-form', el);
      if (!f) return;
      f.body.addEventListener('input', () => { $('#rq-warn', el).hidden = !TESTY.test(f.body.value); });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (TESTY.test(f.body.value)) { $('#rq-warn', el).hidden = false; return; }
        if (!f.course.value) { toast('Pick a class first (or “Whole school”).', 'warn'); return; }
        const status = await guard(() => s.addRequest({ course_slug: f.course.value === '__school' ? null : f.course.value, kind: f.kind.value, body: f.body.value.trim() }));
        if (!status) return;
        toast(status === 'held' ? 'Sent. A reviewer checks requests from personal accounts before they show.' : 'Posted. Others can say “Me too” now.', 'good');
        f.body.value = '';
        view = 'new'; await load();
      });
    };
    el.addEventListener('click', async (e) => { if (e.target.closest('.js-rq-signin')) { await requireUser(s, 'to ask for something'); drawAsk(); load(); } });
    $('#rq-tabs', el).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { view = b.dataset.v; paint(); } });
    $('#rq-q', el).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); paint(); });
    s.onAuth?.(() => { drawAsk(); load(); });
    drawAsk();
    if (pre && names[pre]) { q = names[pre].toLowerCase(); $('#rq-q', el).value = names[pre]; }
    if (location.hash === '#ask') setTimeout(() => $('#rq-form input[name="body"]', el)?.focus(), 300);
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rq]');
    if (!b) return;
    const rid = Number(b.closest('[data-rid]').dataset.rid), r = list.find((x) => x.id === rid), act = b.dataset.rq;
    if (act === 'vote') {
      if (!(await requireUser(s, 'to say “Me too”'))) return;
      if (await guard(() => s.voteRequest(rid, !r.voted))) load();
      return;
    }
    if (act === 'done') {
      const link = prompt('Where is it? Paste a link to the study guide or class page (optional).', '');
      if (link === null) return;
      const note = prompt('A short note for everyone who asked (optional), e.g. “Ethan made one for chapters 9 and 10.”', '');
      if (note === null) return;
      const clean = link.trim() && /^(https?:\/\/|\/|courses\/|guides\/)/.test(link.trim()) ? link.trim().slice(0, 500) : null;
      if (await guard(() => s.setRequest(rid, { status: 'done', done_link: clean, done_note: note.trim().slice(0, 300) || null }), 'Marked done. Everyone who asked is told.')) load();
      return;
    }
    if (act === 'reopen' && await guard(() => s.setRequest(rid, { status: 'open' }), 'Reopened.')) return load();
    if (act === 'publish' && await guard(() => s.setRequest(rid, { status: 'open' }), 'Published.')) return load();
    if (act === 'hide' && await guard(() => s.setRequest(rid, { status: 'hidden' }), 'Hidden.')) return load();
    if (act === 'delete') {
      if (!(await popconfirm(b, { title: 'Delete this request?', text: 'Its “Me too”s go with it.', key: 'request-delete' }))) return;
      if (await guard(() => s.deleteRequest(rid), 'Deleted.')) load();
      return;
    }
    if (act === 'bounty') {
      openBountyEditor(s, null, data.courses, () => toast('Bounty posted.', 'good'), {
        title: r.body.slice(0, 80), course_slug: r.course_slug, teacher: r.teacher || '',
        track: r.kind === 'teacher' ? 'Teacher sections' : r.kind === 'guide' ? 'Study guides' : 'Resources',
        kind: r.kind === 'teacher' ? 'teacher_section' : r.kind === 'overview' ? 'course_overview' : 'resource',
        done_means: `Fills this request: “${r.body.slice(0, 200)}”`, you_get: `${want(r)} students asked for this.` });
    }
  });

  await load();
}
