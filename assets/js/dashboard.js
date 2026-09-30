// The Dashboard: one page for everything around your work (Ethan, 2026-09-28/29). It started
// as the Inbox and took in the review desk, so it's more than notifications.
//
//   You      Updates (every notification, by day), My work (everything you sent in, with its
//            state and next step), Conversations (one thread per post / feedback / report,
//            between whoever sent it in and the review team; not a chat between students)
//   Review   reviewers and admins: To review (overview + the queue), Comments, Reports,
//            Feedback, Published (reviewdesk.js draws these)
//   Site     Announcements, Bounties (admins edit, reviewers see), People (admins only)
//
// Routes live in the hash: #updates #work #threads #thread/<subject> #review #comments #reports
// #feedback(-planned|-done) #published(-off) #announcements #bounties #people #person/<id> #edit-<submission id>.
// Old /inbox/ and /review/ addresses forward here.

import { popconfirm, initHeader, setNoteCount, courses, placeOf, openEditor, linkPdfs, $, $$, esc, byline, prose, ago, fmtDate,
         guard, courseUrl, roleLabel, avatarHtml, root } from './ui.js';
import { KINDS } from './forms.js';
import { REVIEWER_ROLES, canEditOwn } from './store.js';
import { deskTab } from './reviewdesk.js';

const s = await initHeader();
const data = await courses();
const cname = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
const app = $('#dash-app');

const STATUS = { pending: 'In review', changes: 'Sent back', approved: 'Published', rejected: 'Not accepted', withdrawn: 'Withdrawn', merged: 'Update published' };
const FB = { new: 'Received', planned: 'Planned', done: 'Done', closed: 'Closed' };
const FB_KIND = { idea: 'Idea', bug: 'Bug', feature: 'Feature', other: 'Other' };
const isTeam = () => REVIEWER_ROLES.includes(s.user()?.role);
const isAdmin = () => s.user()?.role === 'admin';
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const summary = (x) => { const p = x.payload || {}; return p.title || p.name || p.summary || p.text || p.test_style || p.what || ''; };
const what = (x) => `${KINDS[x.kind]?.label || 'Post'}${x.replaces ? ' (update)' : ''}`;
const threadHref = (subject) => `#thread/${subject}`;

// ── notifications: what kind of thing happened ──
// Rows from before migration 017 have no kind; their wording tells.
function kindOf(n) {
  if (n.kind) return n.kind;
  const m = n.message || '';
  return /published|approved|live now/.test(m) ? 'published' : /asked for changes/.test(m) ? 'sent_back'
    : /edited/.test(m) ? 'edited' : /unpublished/.test(m) ? 'unpublished' : /wasn.t accepted/.test(m) ? 'not_accepted' : 'other';
}
const GROUP = {
  published: 'posts', sent_back: 'posts', not_accepted: 'posts', unpublished: 'posts', edited: 'posts', resubmitted: 'posts',
  reply: 'talk', message: 'talk', comment_live: 'comments', comment_hidden: 'comments', feedback: 'feedback', report: 'feedback',
  role: 'account', other: 'posts',
};
const ICON = { published: ['good', '✓'], sent_back: ['back', '↩'], not_accepted: ['bad', '✕'], unpublished: ['bad', '⤓'], edited: ['', '✎'],
  resubmitted: ['back', '↻'], reply: ['talk', '💬'], message: ['talk', '✉'], comment_live: ['good', '✓'], comment_hidden: ['bad', '⊘'],
  feedback: ['good', '💡'], report: ['good', '⚑'], role: ['', '★'], other: ['', '•'] };
const FILTERS = [['all', 'All'], ['unread', 'Unread'], ['posts', 'Your posts'], ['talk', 'Replies & messages'], ['comments', 'Comments'],
  ['feedback', 'Feedback & reports']];

// Where a notification goes: its conversation if it has one, else its link
const noteHref = (n) => (n.subject && /^(submission|feedback|report):/.test(n.subject) && GROUP[kindOf(n)] !== 'comments' && kindOf(n) !== 'reply'
  ? threadHref(n.subject) : n.link ? (/^https?:/.test(n.link) ? n.link : root + n.link) : null);

function dayLabel(iso) {
  const d = new Date(iso), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? d.toLocaleDateString(undefined, { weekday: 'long' }) : fmtDate(iso);
}

// ── the menu ──
const SECTIONS = () => [
  ['You', [['updates', 'Updates'], ['work', 'My work'], ['threads', 'Conversations']]],
  ...(isTeam() ? [['Review', [['review', 'To review'], ['comments', 'Comments'], ['reports', 'Reports'], ['feedback', 'Feedback'], ['published', 'Published']]]] : []),
  ...(isTeam() ? [['Site', [['announcements', 'Announcements'], ['bounties', 'Bounties'], ...(isAdmin() ? [['people', 'People']] : [])]]] : []),
];
const DESK = { review: 'submissions', comments: 'comments', reports: 'reports', feedback: 'feedback', published: 'published', announcements: 'announcements', bounties: 'bounties' };

let unread = 0;
const badge = (k, n) => { const b = $(`[data-tab="${k}"] .ib-n`, app); if (b) { b.textContent = n > 99 ? '99+' : n || ''; b.hidden = !n; } };
async function refreshCount() {
  try { unread = await s.unreadCount(); } catch { unread = 0; }
  setNoteCount(unread);
  badge('updates', unread);
}
// What's waiting for the review team, on the menu
async function refreshTeamCounts() {
  if (!isTeam()) return;
  const n = (p) => p.then((l) => l.length).catch(() => 0);
  const [rev, com, rep, fb] = await Promise.all([n(s.pending()), n(s.heldComments()), n(s.reports()),
    s.feedbackList().then((l) => l.filter((f) => f.status === 'new').length).catch(() => 0)]);
  badge('review', rev); badge('comments', com); badge('reports', rep); badge('feedback', fb);
}

function frame() {
  const me = s.user();
  return `<div class="db-layout">
    <aside class="db-side">
      <div class="ib-me">${avatarHtml(me, 'md')}<div><b>${esc(me.name)}</b><div class="meta">${esc(roleLabel(me.role))}</div></div></div>
      <nav class="db-nav" aria-label="Dashboard">${SECTIONS().map(([group, items]) => `<div class="db-group"><div class="db-gh">${group}</div>
        ${items.map(([k, l]) => `<a data-tab="${k}" href="#${k}">${l}<span class="ib-n" hidden></span></a>`).join('')}</div>`).join('')}</nav>
    </aside>
    <div class="ib-panel" id="ib-panel"><div class="meta">Loading…</div></div></div>`;
}

// ── Updates ──
let filter = 'all';
async function updates(panel) {
  const notes = await s.inboxNotes();
  const show = notes.filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : GROUP[kindOf(n)] === filter));
  const groups = [];
  for (const n of show) { const d = dayLabel(n.created_at); if (!groups.length || groups.at(-1)[0] !== d) groups.push([d, []]); groups.at(-1)[1].push(n); }
  panel.innerHTML = `<div class="ib-bar"><div class="chips" role="group" aria-label="Show">${FILTERS.map(([k, l]) =>
      `<button type="button" class="chip" data-filter="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}</div>
      ${notes.some((n) => !n.read) ? '<button type="button" class="btn ghost small" data-allread>Mark all as read</button>' : ''}</div>
    ${groups.length ? groups.map(([d, list]) => `<h3 class="ib-day">${esc(d)}</h3><ul class="ib-feed">${list.map((n) => {
      const k = kindOf(n), [cls, ic] = ICON[k] || ICON.other, href = noteHref(n);
      return `<li class="ib-note ${n.read ? '' : 'unread'} ${cls}" data-nid="${n.id}"><span class="ib-ic" aria-hidden="true">${ic}</span>
        <div class="ib-body">${href ? `<a href="${esc(href)}" data-open>${esc(n.message)}</a>` : `<span>${esc(n.message)}</span>`}
          <div class="meta">${n.actorName ? `${esc(n.actorName)} · ` : ''}${ago(n.created_at)}</div></div>
        ${n.read ? '' : '<button type="button" class="ib-dot" data-read title="Mark as read" aria-label="Mark as read"></button>'}</li>`;
    }).join('')}</ul>`).join('')
    : `<div class="empty">${filter === 'all' ? 'Nothing yet. When your work is reviewed, someone replies to you, or your feedback is handled, it shows up here.' : 'Nothing here.'}</div>`}`;
  panel.onclick = async (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; return updates(panel); }
    if (e.target.closest('[data-allread]')) { if (await guard(() => s.markAllRead())) { await refreshCount(); updates(panel); } return; }
    const li = e.target.closest('[data-nid]');
    if (!li || !li.classList.contains('unread')) return;
    if (e.target.closest('[data-read]') || e.target.closest('[data-open]')) {
      li.classList.remove('unread'); $('[data-read]', li)?.remove();
      s.markRead([Number(li.dataset.nid)]).then(refreshCount);
    }
  };
}

// ── My work ──
let workFilter = 'all';
async function work(panel) {
  const [mine, comments, feedback, reports, msgs] = await Promise.all([s.mySubmissions(), s.myComments(), s.myFeedback(), s.myReports(), s.recentMessages()]);
  const talk = {};                                                   // subject → [messages]
  for (const m of msgs) (talk[m.subject] ||= []).push(m);
  const waitingUpdate = new Set(mine.filter((x) => x.replaces && ['pending', 'changes'].includes(x.status)).map((x) => x.replaces));
  const bucket = (x) => (x.status === 'changes' ? 'todo' : x.status === 'pending' ? 'review' : ['approved', 'merged'].includes(x.status) ? 'live' : 'other');
  const counts = { todo: 0, review: 0, live: 0, other: 0 };
  mine.forEach((x) => counts[bucket(x)]++);
  // what needs you first, then what's in review, then the rest, newest first within each
  const rank = { todo: 0, review: 1, live: 2, other: 3 };
  const posts = mine.filter((x) => workFilter === 'all' || bucket(x) === workFilter)
    .sort((a, b) => rank[bucket(a)] - rank[bucket(b)] || new Date(b.created_at) - new Date(a.created_at));

  // Sent in → In review → Published, with sent back / not accepted / withdrawn off to the side
  const track = (x) => {
    const at = { pending: 1, changes: 1, approved: 2, merged: 2 }[x.status] ?? -1;
    const side = { changes: 'Sent back', rejected: 'Not accepted', withdrawn: 'Withdrawn' }[x.status];
    return `<ol class="ib-track ${side ? 'off' : ''}" aria-label="Progress">${['Sent in', 'In review', 'Published'].map((l, i) =>
      `<li class="${i < at || (i === at && !side) ? 'done' : ''} ${i === at && at < 2 ? 'now' : ''}">${i === 1 && side ? side : l}</li>`).join('')}</ol>`;
  };
  const actions = (x) => {
    const btn = (act, text, cls = '') => `<button type="button" class="btn ${cls === 'primary' ? '' : 'ghost'} small ${cls}" data-own="${act}">${text}</button>`;
    const thread = talk['submission:' + x.id]?.length;
    const out = [`<a class="btn ghost small" href="${threadHref('submission:' + x.id)}">${thread ? `Conversation (${thread})` : 'Ask the reviewers'}</a>`];
    if (canEditOwn(x)) {
      if (x.status === 'pending') out.unshift(btn('edit', 'Edit'), btn('withdraw', 'Withdraw', 'danger'));
      if (x.status === 'changes') out.unshift(btn('edit', 'Make changes and resubmit', 'primary'), btn('withdraw', 'Withdraw', 'danger'));
      if (x.status === 'approved') out.unshift(waitingUpdate.has(x.id) ? '<span class="meta">Your change is waiting for review.</span>' : btn('edit', 'Suggest a change'));
    }
    if (['approved', 'merged'].includes(x.status)) out.push(`<a class="btn ghost small" href="${placeOf(x, cname)[1]}">View live</a>`);
    return `<div class="r-actions">${out.join('')}</div>`;
  };
  const lastNote = (x) => {
    const t = (talk['submission:' + x.id] || []).find((m) => m.kind !== 'note' || m.team);
    const note = t?.body || x.review_note;
    return note && x.status !== 'approved' ? `<div class="ib-quote"><span class="meta">${t ? `${esc(t.author)} · ${ago(t.created_at)}` : 'Reviewer'}</span>${prose(note)}</div>` : '';
  };
  const cstat = { held: ['Waiting for approval', 'warn'], visible: ['Live', 'good'], hidden: ['Hidden', 'bad'] };

  panel.innerHTML = `
    <section class="ib-sec"><div class="ib-sec-h"><h2>Posts</h2><a class="btn small" href="${root}submit/">+ New post</a></div>
      ${mine.length ? `<div class="chips ib-chips" role="group" aria-label="Show">${[['all', 'All', mine.length], ['todo', 'Needs you', counts.todo],
        ['review', 'In review', counts.review], ['live', 'Published', counts.live], ['other', 'Other', counts.other]].map(([k, l, n]) =>
        `<button type="button" class="chip ${k === 'todo' && n ? 'hot' : ''}" data-wf="${k}" aria-pressed="${workFilter === k}">${l} <span class="meta">${n}</span></button>`).join('')}</div>` : ''}
      ${posts.length ? `<ul class="ib-work" id="ib-posts">${posts.map((x) => `<li class="ib-card st-${x.status}" data-sid="${x.id}">
          <div class="ib-card-h"><span class="tag">${esc(what(x))}</span><a href="${placeOf(x, cname)[1]}">${esc(placeOf(x, cname)[0])}</a>${x.teacher ? ` · ${esc(x.teacher)}` : ''}
            <span class="meta">${ago(x.created_at)}</span></div>
          ${summary(x) ? `<b class="ib-title">${esc(summary(x).slice(0, 140))}</b>` : ''}
          ${track(x)}${lastNote(x)}${actions(x)}</li>`).join('')}</ul>`
        : `<div class="empty">${mine.length ? 'Nothing here.' : `You haven’t sent anything in yet. <a href="${root}bounties/">Find a bounty</a> or <a href="${root}submit/">share something</a>.`}</div>`}
    </section>
    <section class="ib-sec"><h2>Comments</h2>
      ${comments.length ? `<ul class="ib-list">${comments.map((c) => `<li><span class="tag ${cstat[c.status]?.[1] || ''}">${cstat[c.status]?.[0] || esc(c.status)}</span>
          <a href="${courseUrl(c.course_slug)}#comments">${esc(cname[c.course_slug] || c.course_slug)}</a>${c.parent_id ? ' <span class="meta">(reply)</span>' : ''}
          <span class="ib-snip">${esc(c.body.slice(0, 120))}${c.body.length > 120 ? '…' : ''}</span><span class="meta">${ago(c.created_at)}</span></li>`).join('')}</ul>`
        : '<p class="meta">No comments yet. Class pages have a comment box at the bottom.</p>'}
    </section>
    <section class="ib-sec"><h2>Feedback</h2>
      ${feedback.length ? `<ul class="ib-list">${feedback.map((f) => `<li><span class="tag ${f.status === 'done' ? 'good' : ''}">${FB[f.status] || esc(f.status)}</span>
          <span class="meta">${FB_KIND[f.kind] || ''}</span><span class="ib-snip">${esc(f.message.slice(0, 120))}${f.message.length > 120 ? '…' : ''}</span>
          <a href="${threadHref('feedback:' + f.id)}">${talk['feedback:' + f.id]?.length ? `Conversation (${talk['feedback:' + f.id].length})` : 'Add more'}</a>
          <span class="meta">${ago(f.created_at)}</span></li>`).join('')}</ul>`
        : `<p class="meta">Feedback you send while signed in shows up here with what happened to it. <a href="${root}feedback/">Send feedback</a></p>`}
    </section>
    <section class="ib-sec"><h2>Reports</h2>
      ${reports.length ? `<ul class="ib-list">${reports.map((r) => `<li><span class="tag ${r.resolved ? 'good' : 'warn'}">${r.resolved ? 'Handled' : 'Open'}</span>
          <span class="meta">${r.kind === 'outdated' ? 'Out of date' : 'Inappropriate'}</span>
          <span class="ib-snip">${r.course_slug ? esc(cname[r.course_slug] || r.course_slug) : 'School info'}${r.note ? `: ${esc(r.note.slice(0, 100))}` : ''}</span>
          <a href="${threadHref('report:' + r.id)}">${talk['report:' + r.id]?.length ? `Conversation (${talk['report:' + r.id].length})` : 'Add more'}</a>
          <span class="meta">${ago(r.created_at)}</span></li>`).join('')}</ul>`
        : '<p class="meta">Nothing reported. Every page has a “Report” link for anything wrong or out of date.</p>'}
    </section>`;
  panel.onclick = async (e) => {
    const f = e.target.closest('[data-wf]');
    if (f) { workFilter = f.dataset.wf; return work(panel); }
    const b = e.target.closest('[data-own]');
    const x = b && mine.find((y) => String(y.id) === b.closest('[data-sid]').dataset.sid);
    if (!x) return;
    if (b.dataset.own === 'edit') return openEditor(s, x, () => work(panel), 'author');
    if (!(await popconfirm(b, { title: 'Withdraw this post?', text: 'Reviewers won’t see it and it won’t be published. This can’t be undone.', ok: 'Withdraw' }))) return;
    if (await guard(() => s.withdraw(x.id), 'Withdrawn.')) work(panel);
  };
}

// ── Conversations ──
let threadFilter = 'all', threadQ = '';
const infoCache = new Map();
const info = (subject) => { if (!infoCache.has(subject)) infoCache.set(subject, s.subjectInfo(subject).catch(() => null)); return infoCache.get(subject); };
function subjectTitle(subject, x) {
  const [type] = subject.split(':');
  if (!x) return type === 'submission' ? 'A post' : type === 'feedback' ? 'Feedback' : 'A report';
  if (type === 'submission') return `${what(x)} · ${placeOf(x, cname)[0]}${summary(x) ? `: ${summary(x).slice(0, 70)}` : ''}`;
  if (type === 'feedback') return `${FB_KIND[x.kind] || 'Feedback'}: ${x.message.slice(0, 80)}`;
  return `Report · ${x.course_slug ? cname[x.course_slug] || x.course_slug : 'School info'}${x.note ? `: ${x.note.slice(0, 60)}` : ''}`;
}
async function threads(panel) {
  const msgs = await s.recentMessages();
  const by = new Map();
  for (const m of msgs) { if (!by.has(m.subject)) by.set(m.subject, []); by.get(m.subject).push(m); }   // newest first
  const rows = [...by.entries()].filter(([subj]) => threadFilter === 'all' || subj.startsWith(threadFilter + ':')).slice(0, 80);
  const infos = await Promise.all(rows.map(([subj]) => info(subj)));
  const me = s.user().id, team = isTeam();
  const list = rows.map(([subj, ms], i) => ({ subj, ms, x: infos[i], last: ms[0] }))
    .filter((r) => !threadQ || `${subjectTitle(r.subj, r.x)} ${r.x?.author || ''} ${r.ms.map((m) => m.body).join(' ')}`.toLowerCase().includes(threadQ));
  panel.innerHTML = `<div class="ib-bar">
      <div class="chips" role="group" aria-label="Show">${[['all', 'All'], ['submission', 'Posts'], ['feedback', 'Feedback'], ['report', 'Reports']].map(([k, l]) =>
        `<button type="button" class="chip" data-tf="${k}" aria-pressed="${threadFilter === k}">${l}</button>`).join('')}</div>
      ${team ? `<input type="search" id="ib-tq" placeholder="Search by person or words" value="${esc(threadQ)}" aria-label="Search conversations">` : ''}</div>
    ${team ? '<p class="meta">You see every conversation on the site: reviewers and admins answer them together.</p>' : ''}
    ${list.length ? `<ul class="ib-threads">${list.map(({ subj, ms, x, last }) => {
      const waiting = !last.team && last.kind === 'note' && last.user_id !== me;   // the other side spoke last
      return `<li><a class="ib-thread ${waiting && team ? 'waiting' : ''}" href="${threadHref(subj)}">
        <span class="ib-t-title">${esc(subjectTitle(subj, x))}</span>
        <span class="ib-t-last">${esc(last.author)}${last.team ? ' <span class="tag team">Review team</span>' : ''}: ${esc(last.body.slice(0, 120))}</span>
        <span class="meta">${plural(ms.length, 'message')} · ${ago(last.created_at)}${team && x?.author ? ` · from ${esc(x.author)}` : ''}${waiting && team ? ' · <b>waiting for a reply</b>' : ''}</span></a></li>`;
    }).join('')}</ul>`
    : `<div class="empty">No conversations yet. ${team ? '' : 'Open one from any of your posts, feedback or reports in <a href="#work">My work</a>, to ask the review team something.'}</div>`}`;
  panel.onclick = (e) => { const f = e.target.closest('[data-tf]'); if (f) { threadFilter = f.dataset.tf; threads(panel); } };
  $('#ib-tq', panel)?.addEventListener('input', (e) => { threadQ = e.target.value.trim().toLowerCase(); clearTimeout(threads.t); threads.t = setTimeout(() => threads(panel).then(() => { const q = $('#ib-tq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }), 250); });
}

// Ways to start a reply to someone's feedback (Ethan: ask what they meant, or say kindly why not)
const STARTERS = [
  ['clarify', 'Ask what they mean', 'Thanks for sending this! Could you tell us a bit more about what you mean? For example, which page it was on and what you expected to happen. …'],
  ['cant', 'Explain why not', 'Thanks for the idea, we really appreciate it. We talked it over and can’t do this one for now, because … If you have another idea, please send it our way.'],
  ['planned', 'Say it’s planned', 'Thanks, this is a great idea! We’ve added it to our list and will let you know here when it’s done. …'],
  ['thanks', 'Just say thanks', 'Thank you for taking the time to send this. …'],
];

async function thread(panel, subject) {
  if (!/^(submission|feedback|report):\d+$/.test(subject)) { panel.innerHTML = '<div class="empty">That conversation doesn’t exist.</div>'; return; }
  const [x, ms] = await Promise.all([s.subjectInfo(subject), s.thread(subject)]);
  if (!x) { panel.innerHTML = '<div class="empty">You can’t see this one: it isn’t yours, or it was removed.</div>'; return; }
  s.markSubjectRead(subject).then(refreshCount);
  const [type] = subject.split(':'), me = s.user(), mine = x.user_id === me.id, team = isTeam();
  const head = type === 'submission'
    ? `<div class="ib-card-h"><span class="tag">${esc(what(x))}</span><a href="${placeOf(x, cname)[1]}">${esc(placeOf(x, cname)[0])}</a>
        <span class="tag st-${x.status}">${STATUS[x.status] || esc(x.status)}</span></div>
       ${summary(x) ? `<b class="ib-title">${esc(summary(x).slice(0, 160))}</b>` : ''}`
    : type === 'feedback'
      ? `<div class="ib-card-h"><span class="tag">${FB_KIND[x.kind] || 'Feedback'}</span><span class="tag">${FB[x.status] || esc(x.status)}</span>${x.page ? `<code>${esc(x.page)}</code>` : ''}</div>${prose(x.message)}`
      : `<div class="ib-card-h"><span class="tag">${x.kind === 'outdated' ? 'Out of date' : 'Inappropriate'}</span><span class="tag">${x.resolved ? 'Handled' : 'Open'}</span>
          ${x.course_slug ? `<a href="${courseUrl(x.course_slug)}">${esc(cname[x.course_slug] || x.course_slug)}</a>` : ''} <code>${esc(x.target)}</code></div>${x.note ? prose(x.note) : ''}`;
  const who = mine ? 'You' : esc(x.author || 'Former student');
  const started = `<li class="ib-msg sys"><span class="ib-ic" aria-hidden="true">⤴</span><div><b>${who}</b> sent this in <span class="meta">· ${ago(x.created_at)}</span></div></li>`;
  const DEC = { approved: ['good', 'Published it'], merged: ['good', 'Approved the update'], changes: ['back', 'Sent it back'], rejected: ['bad', 'Didn’t accept it'], pending: ['back', 'Resubmitted'] };
  const item = (m) => {
    const name = m.user_id === me.id ? 'You' : esc(m.author);
    if (m.kind === 'decision') { const [cls, verb] = DEC[m.status] || ['', m.status];
      return `<li class="ib-msg sys ${cls}"><span class="ib-ic" aria-hidden="true">${cls === 'good' ? '✓' : cls === 'bad' ? '✕' : '↩'}</span>
        <div><b>${name}</b> ${verb.toLowerCase()} <span class="meta">· ${ago(m.created_at)}</span>${m.body && !/^(Published\.|Update approved\.|No note\.|Made the changes and resubmitted\.)$/.test(m.body) ? prose(m.body) : ''}</div></li>`; }
    if (m.kind === 'edit') return `<li class="ib-msg sys"><span class="ib-ic" aria-hidden="true">✎</span><div><b>${name}</b> edited it <span class="meta">· ${ago(m.created_at)}</span>${prose(m.body)}</div></li>`;
    return `<li class="ib-msg ${m.user_id === me.id ? 'me' : ''} ${m.team ? 'team' : ''}">${avatarHtml(m)}<div class="ib-bubble">
      <div><b>${name}</b>${m.team ? ' <span class="tag team">Review team</span>' : ''} <span class="meta">· ${ago(m.created_at)}</span></div>${prose(m.body)}</div></li>`;
  };
  const canWrite = mine || team;
  panel.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#updates">Dashboard</a> / <a href="#threads">Conversations</a></nav>
    <article class="ib-card ib-subject">${head}
      <div class="r-actions">${type === 'submission' && mine && canEditOwn(x) && x.status === 'changes' ? '<button type="button" class="btn small" data-fix>Make changes and resubmit</button>' : ''}
        ${team && type === 'submission' && x.status === 'pending' ? '<a class="btn ghost small" href="#review">Review it in To review</a>' : ''}
        ${team && !mine && x.user_id && isAdmin() ? `<a class="btn ghost small" href="#person/${x.user_id}">All of ${esc(x.author)}’s activity</a>` : ''}</div></article>
    <ol class="ib-timeline">${started}${ms.map(item).join('')}</ol>
    ${canWrite ? `<form class="ib-compose" id="ib-compose">
        <label for="ib-body" class="flabel">${mine ? 'Write to the review team' : `Write to ${esc(x.author || 'the author')}`}</label>
        ${team && !mine && type === 'feedback' ? `<div class="chips ib-starters" role="group" aria-label="Start with">${STARTERS.map(([k, l]) =>
          `<button type="button" class="chip" data-starter="${k}">${l}</button>`).join('')}</div>` : ''}
        <textarea id="ib-body" rows="3" maxlength="2000" required placeholder="${mine ? 'Ask what a note meant, explain a choice, or add something they should know.' : 'They’ll get a notification. Be kind and specific.'}"></textarea>
        <div class="r-actions"><button class="btn">Send</button><span class="meta">${mine ? 'Only you and the review team can read this.' : 'The author and the review team can read this.'}</span></div></form>` : ''}`;
  $('[data-fix]', panel)?.addEventListener('click', () => openEditor(s, x, () => thread(panel, subject), 'author'));
  // a starter fills the box and selects the "…" to type over
  $('.ib-starters', panel)?.addEventListener('click', (e) => {
    const k = e.target.closest('[data-starter]')?.dataset.starter;
    if (!k) return;
    const box = $('#ib-body', panel), text = STARTERS.find(([key]) => key === k)[2];
    box.value = text; box.focus();
    const at = text.indexOf('…');
    if (at >= 0) box.setSelectionRange(at, at + 1);
  });
  $('#ib-compose', panel)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = $('#ib-body', panel).value.trim();
    if (!body) return;
    const btn = $('#ib-compose .btn', panel); btn.disabled = true;
    if (await guard(() => s.sendMessage(subject, body), 'Sent.')) thread(panel, subject); else btn.disabled = false;
  });
  linkPdfs(panel, s);
}

// ── To review: an overview, then the queue itself (reviewdesk.js) ──
async function review(panel) {
  const [held, reports, feedback, msgs] = await Promise.all([s.heldComments().catch(() => []), s.reports().catch(() => []),
    s.feedbackList().catch(() => []), s.recentMessages()]);
  const fresh = feedback.filter((f) => f.status === 'new');
  const last = new Map();
  for (const m of msgs) if (!last.has(m.subject)) last.set(m.subject, m);
  const waiting = [...last.values()].filter((m) => !m.team && m.kind === 'note');   // the author spoke last
  const tile = (n, label, href) => `<a class="ib-tile ${n ? 'hot' : ''}" href="${href}"><b>${n}</b><span>${label}</span></a>`;
  panel.innerHTML = `<div class="ib-tiles">
      ${tile(waiting.length, 'waiting for a reply', '#threads')}
      ${tile(held.length, `comment${held.length === 1 ? '' : 's'} to approve`, '#comments')}
      ${tile(reports.length, `open report${reports.length === 1 ? '' : 's'}`, '#reports')}
      ${tile(fresh.length, 'new feedback', '#feedback')}</div>
    ${waiting.length ? `<section class="ib-sec"><h2>Waiting for a reply</h2><ul class="ib-threads">${waiting.map((m) => `<li><a class="ib-thread waiting" href="${threadHref(m.subject)}">
        <span class="ib-t-last"><b>${esc(m.author)}</b>: ${esc(m.body.slice(0, 140))}</span><span class="meta">${ago(m.created_at)}</span></a></li>`).join('')}</ul></section>` : ''}
    <h2 class="db-h">Posts waiting for review</h2><div id="db-desk"><div class="meta">Loading…</div></div>`;
  await deskTab($('#db-desk', panel), s, 'submissions', () => { refreshTeamCounts(); return route(); });
}

// ── People (admins) ──
let peopleQ = '';
async function people(panel) {
  const list = await s.people();
  const shown = list.filter((p) => !peopleQ || p.display_name.toLowerCase().includes(peopleQ));
  const roles = ['contributor', 'trusted', 'reviewer', 'admin'];
  panel.innerHTML = `<div class="ib-bar"><input type="search" id="ib-pq" placeholder="Find a member" value="${esc(peopleQ)}" aria-label="Find a member">
      <span class="meta">${plural(list.length, 'member')} · ${list.filter((p) => REVIEWER_ROLES.includes(p.role)).length} on the review team</span></div>
    <ul class="ib-people">${shown.map((p) => `<li data-uid="${p.id}">${avatarHtml(p, 'md')}
        <a href="#person/${p.id}" class="ib-p-name"><b>${esc(p.display_name)}</b>${p.school_verified ? ' <span class="tag">SCUSD ✓</span>' : ''}</a>
        <span class="meta">${p.grad_year ? `Class of ${p.grad_year} · ` : ''}joined ${fmtDate(p.created_at)}</span>
        ${p.id === s.user().id ? `<span class="tag">${esc(roleLabel(p.role))} (you)</span>`
          : `<select data-role aria-label="Role for ${esc(p.display_name)}">${roles.map((r) => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${esc(roleLabel(r))}</option>`).join('')}</select>`}</li>`).join('')}</ul>`;
  $('#ib-pq', panel).addEventListener('input', (e) => { peopleQ = e.target.value.trim().toLowerCase(); clearTimeout(people.t); people.t = setTimeout(() => people(panel).then(() => { const q = $('#ib-pq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }), 200); });
  panel.onchange = async (e) => {
    const sel = e.target.closest('[data-role]'); if (!sel) return;
    const p = list.find((y) => y.id === sel.closest('[data-uid]').dataset.uid);
    if (!(await popconfirm(sel, { title: `Make ${p.display_name} a ${roleLabel(sel.value)}?`, text: 'They’ll get a notification.', ok: 'Change role', danger: false }))) { sel.value = p.role; return; }
    if (!(await guard(() => s.setRole(p.id, sel.value), 'Role changed.'))) sel.value = p.role;
  };
}

async function person(panel, uid) {
  const [list, act, msgs] = await Promise.all([s.people(), s.personActivity(uid), s.recentMessages()]);
  const p = list.find((y) => y.id === uid);
  if (!p) { panel.innerHTML = '<div class="empty">No such member.</div>'; return; }
  const subjects = new Set([...act.subs.map((x) => 'submission:' + x.id), ...act.feedback.map((f) => 'feedback:' + f.id), ...act.reports.map((r) => 'report:' + r.id)]);
  const convo = new Map();
  for (const m of msgs) if (subjects.has(m.subject)) (convo.get(m.subject) || convo.set(m.subject, []).get(m.subject)).push(m);
  const cstat = { held: 'Waiting', visible: 'Live', hidden: 'Hidden' };
  panel.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><a href="#updates">Dashboard</a> / <a href="#people">People</a></nav>
    <div class="ib-me big">${avatarHtml(p, 'lg')}<div><h2>${esc(p.display_name)}</h2>
      <div class="meta">${esc(roleLabel(p.role))}${p.school_verified ? ' · SCUSD ✓' : ''}${p.grad_year ? ` · Class of ${p.grad_year}` : ''} · joined ${fmtDate(p.created_at)}</div></div></div>
    <div class="ib-tiles small">${[[act.subs.length, 'posts'], [act.subs.filter((x) => x.status === 'approved').length, 'published'], [act.comments.length, 'comments'],
      [act.reports.length, 'reports'], [act.feedback.length, 'feedback'], [convo.size, 'conversations']].map(([n, l]) => `<div class="ib-tile"><b>${n}</b><span>${l}</span></div>`).join('')}</div>
    <section class="ib-sec"><h2>Conversations</h2>${convo.size ? `<ul class="ib-threads">${[...convo.entries()].map(([subj, ms]) => `<li><a class="ib-thread" href="${threadHref(subj)}">
        <span class="ib-t-last"><b>${esc(ms[0].author)}</b>: ${esc(ms[0].body.slice(0, 120))}</span><span class="meta">${plural(ms.length, 'message')} · ${ago(ms[0].created_at)}</span></a></li>`).join('')}</ul>`
      : '<p class="meta">None.</p>'}</section>
    <section class="ib-sec"><h2>Posts</h2>${act.subs.length ? `<ul class="ib-list">${act.subs.map((x) => `<li><span class="tag st-${x.status}">${STATUS[x.status] || esc(x.status)}</span>
        <span class="tag">${esc(what(x))}</span><a href="${placeOf(x, cname)[1]}">${esc(placeOf(x, cname)[0])}</a><span class="ib-snip">${esc(summary(x).slice(0, 80))}</span>
        <a href="${threadHref('submission:' + x.id)}">Conversation</a><span class="meta">${ago(x.created_at)}</span></li>`).join('')}</ul>` : '<p class="meta">None.</p>'}</section>
    <section class="ib-sec"><h2>Comments</h2>${act.comments.length ? `<ul class="ib-list">${act.comments.map((c) => `<li><span class="tag">${cstat[c.status] || esc(c.status)}</span>
        <a href="${courseUrl(c.course_slug)}#comments">${esc(cname[c.course_slug] || c.course_slug)}</a><span class="ib-snip">${esc(c.body.slice(0, 120))}</span><span class="meta">${ago(c.created_at)}</span></li>`).join('')}</ul>` : '<p class="meta">None.</p>'}</section>
    <section class="ib-sec"><h2>Reports and feedback</h2>${act.reports.length + act.feedback.length ? `<ul class="ib-list">${act.reports.map((r) => `<li><span class="tag">Report · ${r.resolved ? 'handled' : 'open'}</span>
        <span class="ib-snip">${esc((r.note || r.target).slice(0, 100))}</span><a href="${threadHref('report:' + r.id)}">Conversation</a><span class="meta">${ago(r.created_at)}</span></li>`).join('')}
        ${act.feedback.map((f) => `<li><span class="tag">Feedback · ${FB[f.status] || f.status}</span><span class="ib-snip">${esc(f.message.slice(0, 100))}</span>
        <a href="${threadHref('feedback:' + f.id)}">Conversation</a><span class="meta">${ago(f.created_at)}</span></li>`).join('')}</ul>` : '<p class="meta">None.</p>'}</section>`;
}

// ── routing ──
async function route() {
  const me = s.user();
  if (!me) {
    app.innerHTML = `<div class="empty"><p>Your Dashboard has everything about your work on Wilkipedia: what’s published, what a reviewer said, replies to your comments and what happened to your feedback.</p>
      <p><button class="btn js-signin">Sign in</button></p></div>`;
    return;
  }
  let h = decodeURIComponent(location.hash.slice(1)) || 'updates';
  h = { queue: 'review', submissions: 'review', notifications: 'updates' }[h] || h;          // older addresses
  const edit = /^edit-(\d+)$/.exec(h);
  if (edit) { history.replaceState(null, '', '#work'); h = 'work'; }
  const [tab, arg] = h.startsWith('thread/') ? ['threads', h.slice(7)] : h.startsWith('person/') ? ['people', h.slice(7)]
    : h === 'published-off' ? ['published', 'off'] : /^feedback-(planned|done)$/.test(h) ? ['feedback', h.slice(9)] : [h, null];
  const allowed = SECTIONS().flatMap(([, items]) => items.map(([k]) => k));
  const active = allowed.includes(tab) ? tab : 'updates';
  if (!$('.db-nav', app) || app.dataset.role !== me.role) { app.innerHTML = frame(); app.dataset.role = me.role; refreshTeamCounts(); }
  $$('[data-tab]', app).forEach((a) => (a.dataset.tab === active ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const panel = $('#ib-panel', app);
  panel.onclick = panel.onchange = null;
  panel.innerHTML = '<div class="meta">Loading…</div>';
  refreshCount();
  const redraw = () => { refreshTeamCounts(); return route(); };
  const run = { updates: () => updates(panel), work: () => work(panel), review: () => review(panel),
    threads: () => (arg ? thread(panel, arg) : threads(panel)), people: () => (arg ? person(panel, arg) : people(panel)) }[active]
    || (() => deskTab(panel, s, DESK[active], redraw));
  await guard(run);
  if (edit) {                                                         // "Make changes" from the home page
    const x = (await s.mySubmissions()).find((y) => String(y.id) === edit[1]);
    const li = x && $(`[data-sid="${x.id}"]`, panel);
    if (li) { li.scrollIntoView({ block: 'center' }); li.classList.add('flash'); }
    if (x && canEditOwn(x) && ['pending', 'changes'].includes(x.status)) openEditor(s, x, () => work(panel), 'author');
  }
}

if (s.user() && s.inboxReady && !(await s.inboxReady())) {
  app.insertAdjacentHTML('beforebegin', '<p class="note-bar">Conversations and the new kinds of notification need migration 017 run in Supabase. Updates and My work already work.</p>');
}
window.addEventListener('hashchange', route);
s.onAuth(route);
route();
