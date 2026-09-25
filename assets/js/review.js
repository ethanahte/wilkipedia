// The reviewer desk: pending submissions, held comments, reports, and posting
// bounties. The page is visible to anyone, but the database only answers these
// queries for reviewers (see is_reviewer() in supabase/schema.sql).

import { initHeader, courses, placeOf, openEditor, openBountyEditor, $, $$, esc, byline, prose, safeUrl, ago, guard, courseUrl, fmtDate, paintAnnouncements, announceHref, ANNOUNCE_KINDS } from './ui.js';
import { KINDS } from './forms.js';
import { REVIEWER_ROLES } from './store.js';

const s = await initHeader();
const data = await courses();
const bySlug = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
const courseName = (slug) => bySlug[slug]?.name || slug || 'School-wide';
let tab = (location.hash.slice(1) || 'submissions').replace('published-off', 'published');
window.addEventListener('hashchange', () => { tab = location.hash.slice(1).replace('published-off', 'published') || 'submissions'; draw(); });

function payloadHtml(kind, p) {
  return KINDS[kind].fields.filter((f) => p[f.key]).map((f) => {
    const v = p[f.key];
    const body = f.type === 'url' ? (safeUrl(v) ? `<a href="${esc(safeUrl(v))}" target="_blank" rel="noopener">${esc(v)}</a>` : `<span class="bad">${esc(v)}</span>`)
      : f.type === 'textarea' ? prose(v) : esc(v);
    return `<div class="kv"><div class="k">${esc(f.label)}</div><div class="v">${body}</div></div>`;
  }).join('');
}

let pubList = [];
const tabs = {
  async submissions() {
    const list = await s.pending();
    return list.length ? list.map((x) => `
      <article class="card review" data-id="${x.id}">
        <div class="r-head"><span class="tag">${esc(KINDS[x.kind].label)}</span>
          ${(([w, h]) => `<a href="${h}" target="_blank">${esc(w)}</a>`)(placeOf(x, Object.fromEntries(data.courses.map((c) => [c.slug, c.name]))))}
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
  async published() {
    const showOff = location.hash === '#published-off';
    const list = await s.byStatus(showOff ? 'rejected' : 'approved');
    pubList = list;
    const names = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
    const summary = (x) => { const p = x.payload || {}; return p.title || p.summary || p.text || p.test_style || p.what || p.name || ''; };
    return `<div class="list-tools"><input id="pub-q" type="search" placeholder="Filter by class, teacher, author or text" aria-label="Filter">
        <div class="chips"><a class="chip" href="#published" aria-pressed="${!showOff}">Live on the site (${showOff ? '…' : list.length})</a>
        <a class="chip" href="#published-off" aria-pressed="${showOff}">Unpublished / rejected</a></div></div>
      ${list.length ? list.map((x) => `
      <article class="card review pub-row" data-id="${x.id}" data-hay="${esc(`${placeOf(x, names)[0]} ${x.teacher || ''} ${x.author} ${JSON.stringify(x.payload)}`.toLowerCase())}">
        <div class="r-head"><span class="tag">${esc(KINDS[x.kind]?.label || x.kind)}</span>
          ${(([w, h]) => `<a href="${h}" target="_blank">${esc(w)}</a>`)(placeOf(x, names))}
          ${x.teacher ? ` · ${esc(x.teacher)}` : ''}
          <span class="meta">by ${byline(x.author, x.verified)} · ${ago(x.reviewed_at || x.created_at)}</span></div>
        <p class="pub-sum">${esc(summary(x).slice(0, 220))}${summary(x).length > 220 ? '…' : ''}</p>
        ${x.review_note ? `<p class="meta">Note: ${esc(x.review_note)}</p>` : ''}
        <div class="r-actions">${showOff
          ? '<button class="btn ghost small" data-act="approved">Republish</button>'
          : '<button class="btn ghost small" data-editpub>Edit…</button><button class="btn ghost danger small" data-act="rejected">Unpublish…</button>'}</div>
      </article>`).join('') : `<div class="empty">${showOff ? 'Nothing unpublished.' : 'Nothing published yet.'}</div>`}`;
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
          ${r.kind === 'outdated' && s.user()?.role === 'admin' ? `<button class="btn ghost" data-tobounty="${r.id}">Turn into a bounty</button>` : ''}
          <button class="btn" data-resolve="${r.id}">Mark resolved</button>
        </div>
      </article>`).join('') : '<div class="empty">No open reports.</div>';
  },
  async feedback() {
    const list = await s.feedbackList();
    const label = { idea: '💡 Idea', bug: '🐞 Bug', feature: '✨ Feature', other: '💬 Other' };
    return list.length ? list.map((f) => `
      <article class="card review fb-${f.status}" data-fid="${f.id}">
        <div class="r-head"><span class="tag">${label[f.kind] || esc(f.kind)}</span>
          <span class="tag ${f.status === 'new' ? 'warn' : ''}">${esc(f.status)}</span>
          ${f.page ? `<code>${esc(f.page)}</code>` : ''}
          <span class="meta">${f.name ? `from ${esc(f.name)} · ` : ''}${ago(f.created_at)}</span></div>
        ${prose(f.message)}
        <div class="r-actions">${['new', 'planned', 'done', 'closed'].filter((x) => x !== f.status)
          .map((x) => `<button class="btn ghost small" data-fstatus="${x}">Mark ${x}</button>`).join('')}
          <button class="btn ghost danger small" data-fdel>Delete</button></div>
      </article>`).join('') : '<div class="empty">No feedback yet.</div>';
  },
  async announcements() {
    const isAdmin = s.user()?.role === 'admin';
    if (!isAdmin) {
      const live = await s.announcements();
      return `<p class="meta">Only admins post announcements. These are showing on the site right now:</p>
        <div class="ann-list">${live.map((a) => `<article class="card"><div><b>${ANNOUNCE_KINDS[a.kind]}</b> · ${esc(a.message)}</div></article>`).join('') || '<div class="empty">No announcements right now.</div>'}</div>`;
    }
    const list = await s.allAnnouncements();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const state = (a) => (!a.active ? 'Hidden' : a.ends_on && new Date(a.ends_on + 'T00:00') < today ? 'Ended' : 'Showing');
    return `<form class="ann-form card" id="ann-form">
        <h2 style="margin:0">Post an announcement</h2>
        <p class="meta" style="margin:0">It shows in a bar under the header on every page, for everyone. Keep it short and only post what you can source.</p>
        <div class="grid2">
          <div class="field"><label for="an-kind">About</label><select id="an-kind" name="kind"><option value="school">School news (Wilcox)</option><option value="site">Wilkipedia news</option></select></div>
          <div class="field"><label for="an-end">Stop showing after (optional)</label><input id="an-end" name="ends_on" type="date"></div>
        </div>
        <div class="field"><label for="an-msg">Message <span class="meta" id="an-count">0 / 280</span></label><textarea id="an-msg" name="message" rows="2" maxlength="280" required placeholder="e.g. AP exam registration closes Friday. See your counselor."></textarea></div>
        <div class="field"><label for="an-link">Link (optional)</label><input id="an-link" name="link" placeholder="https://… or a page on this site like /summer/"></div>
        <input type="hidden" name="id" value="">
        <div class="r-actions"><button class="btn" id="an-save">Post announcement</button><button type="button" class="btn ghost" id="an-cancel" hidden>Cancel editing</button></div>
      </form>
      <h2 class="label-h">All announcements</h2>
      <div class="ann-list">${list.map((a) => `<article class="card ${a.active ? '' : 'off'}" data-aid="${a.id}">
          <div style="flex:1;min-width:240px"><div><span class="tag">${ANNOUNCE_KINDS[a.kind]}</span> <b>${state(a)}</b>
            <span class="meta">· posted ${fmtDate(a.created_at)}${a.ends_on ? ` · until ${fmtDate(a.ends_on + 'T00:00')}` : ''}</span></div>
            <p style="margin:6px 0 0">${esc(a.message)}${a.link ? ` <span class="meta">→ ${esc(a.link)}</span>` : ''}</p></div>
          <div class="r-actions"><button class="btn ghost small" data-aedit>Edit</button>
            <button class="btn ghost small" data-atoggle>${a.active ? 'Hide' : 'Show'}</button>
            <button class="btn ghost danger small" data-adel>Delete</button></div>
        </article>`).join('') || '<div class="empty">No announcements yet.</div>'}</div>`;
  },
  async bounties() {
    const list = await s.bounties();
    const isAdmin = s.user()?.role === 'admin';
    return `${isAdmin ? '<p><button class="btn" data-newbounty>+ Post a bounty</button></p>' : '<p class="meta">Only admins can post or edit bounties.</p>'}
      <table class="plain"><tbody>${list.map((b) => `<tr><td><code>${esc(b.id)}</code></td><td>${esc(b.title)}
          ${b.status === 'closed' ? ' <span class="tag">withdrawn</span>' : b.status === 'done' ? ' <span class="tag">completed</span>' : ''}</td>
        <td>${b.claims.map((c) => esc(c.name)).join(', ') || '<span class="meta">unclaimed</span>'}</td>
        <td>${isAdmin ? `<button class="linkish" data-editb="${esc(b.id)}">Edit</button> · <button class="linkish" data-bstatus="${esc(b.id)}" data-to="${b.status === 'open' ? 'closed' : 'open'}">${b.status === 'open' ? 'Close' : 'Repost'}</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
  },
};

async function draw() {
  const me = s.user();
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tab === tab));
  if (!me || !REVIEWER_ROLES.includes(me.role)) {
    $('#panel').innerHTML = `<div class="empty">This page is for reviewers. ${me ? 'Your account isn’t a reviewer yet.' : 'Sign in first.'}</div>`;
    return;
  }
  $('#panel').innerHTML = await guard(() => (tabs[tab] || tabs.submissions)()) || '';
  wireAnnounceForm();
  $('#pub-q')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.pub-row').forEach((r) => (r.hidden = q && !r.dataset.hay.includes(q)));
  });
}

let annList = [];
function wireAnnounceForm() {
  const f = $('#ann-form');
  if (!f) return;
  s.allAnnouncements().then((l) => { annList = l; }).catch(() => {});
  const count = () => { $('#an-count').textContent = `${f.message.value.length} / 280`; };
  f.message.addEventListener('input', count);
  $('#an-cancel').addEventListener('click', () => draw());
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const link = f.link.value.trim();
    if (link && !link.startsWith('/') && !safeUrl(link)) return alert('The link must start with https:// or with / for a page on this site.');
    const fields = { kind: f.kind.value, message: f.message.value.trim(), link: link || null, ends_on: f.ends_on.value || null };
    if (fields.message.length < 3) return alert('Write the announcement first.');
    const ok = f.id.value
      ? await guard(() => s.updateAnnouncement(Number(f.id.value), fields), 'Announcement saved.')
      : await guard(() => s.postAnnouncement(fields), 'Announcement posted. It’s live now.');
    if (ok) { await draw(); paintAnnouncements(s); }
  });
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  const ac = t.closest('[data-aid]');
  if (ac) {
    const aid = Number(ac.dataset.aid);
    const a = annList.find((x) => x.id === aid) || (await s.allAnnouncements()).find((x) => x.id === aid);
    if ('aedit' in t.dataset && a) {
      const f = $('#ann-form');
      f.kind.value = a.kind; f.message.value = a.message; f.link.value = a.link || ''; f.ends_on.value = a.ends_on || ''; f.id.value = a.id;
      f.message.dispatchEvent(new Event('input'));
      $('#an-save').textContent = 'Save changes'; $('#an-cancel').hidden = false;
      f.scrollIntoView({ behavior: 'smooth' }); f.message.focus();
      return;
    }
    if ('atoggle' in t.dataset && a) { await guard(() => s.updateAnnouncement(aid, { active: !a.active }), a.active ? 'Hidden from the site.' : 'Showing again.'); }
    if ('adel' in t.dataset) { if (!confirm('Delete this announcement for good?')) return; await guard(() => s.deleteAnnouncement(aid), 'Deleted.'); }
    await draw(); paintAnnouncements(s); return;
  }
  if (t.dataset.tab) { tab = t.dataset.tab; history.replaceState(null, '', '#' + tab); return draw(); }
  const card = t.closest('[data-id]');
  if ('editpub' in t.dataset && card) { openEditor(s, pubList.find((x) => String(x.id) === card.dataset.id), draw); return; }
  if (t.dataset.act && card) {
    let note = null;
    if (t.dataset.act !== 'approved') {
      note = prompt(t.dataset.act === 'changes' ? 'What should they fix? (they will see this)'
        : tab === 'published' ? 'Why is this being unpublished? (the author will see this)' : 'Why is this rejected? (they will see this)');
      if (note === null) return;
    }
    await guard(() => s.review(Number(card.dataset.id), t.dataset.act, note),
                t.dataset.act === 'approved' ? 'Published.' : tab === 'published' ? 'Unpublished.' : 'Sent back with your note.');
    return draw();
  }
  const cc = t.closest('[data-cid]');
  if (t.dataset.cact && cc) {
    const id = Number(cc.dataset.cid);
    if (t.dataset.cact === 'delete' && !confirm('Delete this comment for good?')) return;
    await guard(() => (t.dataset.cact === 'delete' ? s.deleteComment(id) : s.moderateComment(id, 'visible')));
    return draw();
  }
  const fc = t.closest('[data-fid]');
  if (fc && t.dataset.fstatus) { await guard(() => s.setFeedbackStatus(Number(fc.dataset.fid), t.dataset.fstatus)); return draw(); }
  if (fc && 'fdel' in t.dataset) { if (!confirm('Delete this feedback?')) return; await guard(() => s.deleteFeedback(Number(fc.dataset.fid))); return draw(); }
  if (t.dataset.resolve) { await guard(() => s.resolveReport(Number(t.dataset.resolve)), 'Resolved.'); return draw(); }
  if (t.dataset.tobounty) {
    const r = (await s.reports()).find((x) => String(x.id) === t.dataset.tobounty);
    // a new bounty, pre-filled from the report (id stays empty for the admin to pick)
    openBountyEditor(s, null, data.courses, draw);
    const f = $('#bounty-form');
    f.track.value = 'Fix outdated'; f.size.value = 'S'; f.title.value = 'Update outdated info';
    if (r?.course_slug) f.course.value = data.courses.find((c) => c.slug === r.course_slug)?.name || '';
    if (r?.note) f.done_means.value = `Check and update: ${r.note}`;
    return;
  }
  if ('newbounty' in t.dataset) { openBountyEditor(s, null, data.courses, draw); return; }
  if (t.dataset.editb) { const b = (await s.bounties()).find((x) => x.id === t.dataset.editb); openBountyEditor(s, b, data.courses, draw); return; }
  if (t.dataset.bstatus) { await guard(() => s.setBountyStatus(t.dataset.bstatus, t.dataset.to)); return draw(); }
});



s.onAuth(draw);
draw();
