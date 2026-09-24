// The reviewer desk: pending submissions, held comments, reports, and posting
// bounties. The page is visible to anyone, but the database only answers these
// queries for reviewers (see is_reviewer() in supabase/schema.sql).

import { initHeader, courses, $, $$, esc, byline, prose, safeUrl, ago, guard, courseUrl } from './ui.js';
import { KINDS } from './forms.js';
import { REVIEWER_ROLES } from './store.js';

const s = await initHeader();
const data = await courses();
const bySlug = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
const courseName = (slug) => bySlug[slug]?.name || slug || 'School-wide';
let tab = location.hash.slice(1) || 'submissions';

function payloadHtml(kind, p) {
  return KINDS[kind].fields.filter((f) => p[f.key]).map((f) => {
    const v = p[f.key];
    const body = f.type === 'url' ? (safeUrl(v) ? `<a href="${esc(safeUrl(v))}" target="_blank" rel="noopener">${esc(v)}</a>` : `<span class="bad">${esc(v)}</span>`)
      : f.type === 'textarea' ? prose(v) : esc(v);
    return `<div class="kv"><div class="k">${esc(f.label)}</div><div class="v">${body}</div></div>`;
  }).join('');
}

const tabs = {
  async submissions() {
    const list = await s.pending();
    return list.length ? list.map((x) => `
      <article class="card review" data-id="${x.id}">
        <div class="r-head"><span class="tag">${esc(KINDS[x.kind].label)}</span>
          ${x.course_slug ? `<a href="${courseUrl(x.course_slug)}" target="_blank">${esc(courseName(x.course_slug))}</a>` : 'School-wide'}
          ${x.teacher ? ` · ${esc(x.teacher)}` : ''}
          ${x.bounty_id ? ` · <span class="tag">${esc(x.bounty_id)}</span>` : ''}
          <span class="meta">by ${byline(x.author, x.verified)} · ${ago(x.created_at)}</span></div>
        ${payloadHtml(x.kind, x.payload)}
        <div class="checklist meta">Check: facts have a source · no real test questions or answer keys · nothing personal about a teacher · links work</div>
        <div class="r-actions">
          <button class="btn" data-act="approved">Approve</button>
          <button class="btn ghost" data-act="changes">Needs changes…</button>
          <button class="btn ghost danger" data-act="rejected">Reject…</button>
        </div>
      </article>`).join('') : '<div class="empty">Nothing waiting. Nice.</div>';
  },
  async comments() {
    const list = await s.heldComments();
    return list.length ? list.map((c) => `
      <article class="card review" data-cid="${c.id}">
        <div class="r-head"><a href="${courseUrl(c.course_slug)}#comments" target="_blank">${esc(courseName(c.course_slug))}</a>
          <span class="tag ${c.status === 'hidden' ? 'warn' : ''}">${c.status === 'hidden' ? 'Reported' : c.verified ? 'New member' : 'Personal account'}</span>
          <span class="meta">by ${byline(c.author, c.verified)} · ${ago(c.created_at)}</span></div>
        ${c.prompt && c.prompt !== 'General' ? `<div class="meta">${esc(c.prompt)}</div>` : ''}
        ${prose(c.body)}
        <div class="r-actions">
          <button class="btn" data-cact="visible">Publish</button>
          <button class="btn ghost danger" data-cact="delete">Delete</button>
        </div>
      </article>`).join('') : '<div class="empty">No comments waiting.</div>';
  },
  async reports() {
    const list = await s.reports();
    return list.length ? list.map((r) => `
      <article class="card review" data-rid="${r.id}">
        <div class="r-head"><span class="tag ${r.kind === 'inappropriate' ? 'warn' : ''}">${esc(r.kind)}</span>
          ${r.course_slug ? `<a href="${courseUrl(r.course_slug)}" target="_blank">${esc(courseName(r.course_slug))}</a>` : ''}
          · <code>${esc(r.target)}</code>
          <span class="meta">by ${esc(r.author)} · ${ago(r.created_at)}</span></div>
        ${r.note ? prose(r.note) : '<p class="meta">No note.</p>'}
        <div class="r-actions">
          ${r.kind === 'outdated' ? `<button class="btn ghost" data-tobounty="${r.id}">Turn into a bounty</button>` : ''}
          <button class="btn" data-resolve="${r.id}">Mark resolved</button>
        </div>
      </article>`).join('') : '<div class="empty">No open reports.</div>';
  },
  async bounties() {
    const list = await s.bounties();
    return `<form id="bounty-form" class="card">
        <h3>Post a bounty</h3>
        <div class="grid2">
          <div class="field"><label>ID</label><input name="id" required placeholder="SCI-04" pattern="[A-Z]{2,5}-\\d{1,3}"></div>
          <div class="field"><label>Track</label><select name="track">${['Course pages', 'Teacher sections', 'Study guides', 'Resources', 'Summer homework', 'School info', 'Fix outdated'].map((t) => `<option>${t}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Title</label><input name="title" required placeholder="Complete the AP Chemistry page"></div>
        <div class="grid2">
          <div class="field"><label>Course (optional)</label><input name="course" list="course-list" placeholder="Type to search…"></div>
          <div class="field"><label>Teacher (optional)</label><input name="teacher"></div>
        </div>
        <div class="grid3">
          <div class="field"><label>Suggested kind</label><select name="kind"><option value="">Any</option>${Object.entries(KINDS).map(([k, d]) => `<option value="${k}">${esc(d.label)}</option>`).join('')}</select></div>
          <div class="field"><label>Size</label><select name="size"><option value="S">S · ~30 min · 10 pts</option><option value="M" selected>M · ~2 hrs · 30 pts</option><option value="L">L · ~5+ hrs · 60 pts</option></select></div>
          <div class="field"><label>Priority</label><select name="priority">${[5, 4, 3, 2, 1].map((n) => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>You get</label><textarea name="you_get" rows="2" placeholder="The page template and anything we already know."></textarea></div>
        <div class="field"><label>Done means</label><textarea name="done_means" rows="2" required placeholder="Overview + a teacher section with a syllabus source + 3 tips."></textarea></div>
        <button class="btn">Post bounty</button>
      </form>
      <datalist id="course-list">${data.courses.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
      <h3>All bounties</h3>
      <table class="plain"><tbody>${list.map((b) => `<tr><td><code>${esc(b.id)}</code></td><td>${esc(b.title)}</td>
        <td>${b.claims.map((c) => esc(c.name)).join(', ') || '<span class="meta">unclaimed</span>'}</td>
        <td><button class="linkish" data-bstatus="${esc(b.id)}" data-to="${b.status === 'open' ? 'closed' : 'open'}">${b.status === 'open' ? 'Close' : 'Reopen'}</button></td></tr>`).join('')}</tbody></table>`;
  },
};

async function draw() {
  const me = s.user();
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tab === tab));
  if (!me || !REVIEWER_ROLES.includes(me.role)) {
    $('#panel').innerHTML = `<div class="empty">This page is for reviewers. ${me ? 'Your account isn’t a reviewer yet.' : 'Sign in first.'}</div>`;
    return;
  }
  $('#panel').innerHTML = await guard(() => tabs[tab]()) || '';
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; history.replaceState(null, '', '#' + tab); return draw(); }
  const card = t.closest('[data-id]');
  if (t.dataset.act && card) {
    let note = null;
    if (t.dataset.act !== 'approved') {
      note = prompt(t.dataset.act === 'changes' ? 'What should they fix? (they will see this)' : 'Why is this rejected? (they will see this)');
      if (note === null) return;
    }
    await guard(() => s.review(Number(card.dataset.id), t.dataset.act, note),
                t.dataset.act === 'approved' ? 'Approved and published.' : 'Sent back with your note.');
    return draw();
  }
  const cc = t.closest('[data-cid]');
  if (t.dataset.cact && cc) {
    const id = Number(cc.dataset.cid);
    if (t.dataset.cact === 'delete' && !confirm('Delete this comment for good?')) return;
    await guard(() => (t.dataset.cact === 'delete' ? s.deleteComment(id) : s.moderateComment(id, 'visible')));
    return draw();
  }
  if (t.dataset.resolve) { await guard(() => s.resolveReport(Number(t.dataset.resolve)), 'Resolved.'); return draw(); }
  if (t.dataset.tobounty) {
    tab = 'bounties'; await draw();
    const f = $('#bounty-form');
    f.track.value = 'Fix outdated'; f.size.value = 'S';
    f.title.value = 'Update outdated info';
    f.title.focus();
    return;
  }
  if (t.dataset.bstatus) { await guard(() => s.setBountyStatus(t.dataset.bstatus, t.dataset.to)); return draw(); }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'bounty-form') return;
  e.preventDefault();
  const f = e.target;
  const name = f.course.value.trim().toLowerCase();
  const course = data.courses.find((c) => c.name.toLowerCase() === name);
  if (name && !course) return alert('Pick the course from the list, or leave it blank.');
  const ok = await guard(() => s.postBounty({
    id: f.id.value.trim().toUpperCase(), title: f.title.value.trim(), track: f.track.value,
    course_slug: course?.slug || null, teacher: f.teacher.value.trim() || null, kind: f.kind.value || null,
    size: f.size.value, priority: Number(f.priority.value),
    you_get: f.you_get.value.trim() || null, done_means: f.done_means.value.trim(),
  }), 'Bounty posted.');
  if (ok) draw();
});

s.onAuth(draw);
draw();
