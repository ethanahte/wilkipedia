// The bounty board. Layout follows the Open Reality board: a stat row, filters,
// then one line per bounty that expands in place to its brief
// ("You get" / "Done means", the BountyBoard app's format).

import { initHeader, requireUser, courses, openBountyEditor, $, esc, guard, fmtDate, courseUrl, root } from './ui.js';
import { SIZE_POINTS, REVIEWER_ROLES } from './store.js';

const s = await initHeader();
const courseList = (await courses()).courses;
const courseName = Object.fromEntries(courseList.map((c) => [c.slug, c.name]));
let all = [];
const SIZE_TIME = { S: '~30 min', M: '~2 hrs', L: '~5+ hrs' };
const filters = { track: 'All', state: 'all' };
let open = new Set(location.hash ? [decodeURIComponent(location.hash.slice(1))] : []);

const dots = (n) => '●'.repeat(n) + '<span class="off">' + '●'.repeat(5 - n) + '</span>';

async function draw() {
  const me = s.user();
  // The board belongs to the review team; admins run it.
  const team = !!me && REVIEWER_ROLES.includes(me.role);
  const isAdmin = me?.role === 'admin';
  $('#gate').hidden = team;
  $('#gate-text').textContent = me ? 'The bounty board is for the Wilkipedia review team.' : 'Sign in to see the bounty board.';
  $('#gate-signin').hidden = !!me;
  $('#members').hidden = !team;
  $('#admin-bar').hidden = !isAdmin;
  if (!team) { $('#board').innerHTML = ''; return; }
  all = (await s.bounties()).filter((b) => b.status === 'open');
  const tracks = ['All', ...new Set(all.map((b) => b.track))];
  $('#stats').innerHTML = `
    <div><b>${all.length}</b><span>open bounties</span></div>
    <div><b>${all.filter((b) => !b.claims.length).length}</b><span>unclaimed</span></div>
    <div><b>${all.reduce((n, b) => n + SIZE_POINTS[b.size], 0)}</b><span>points on the board</span></div>`;
  $('#track-filter').innerHTML = tracks.map((t) =>
    `<button class="chip" aria-pressed="${filters.track === t}" data-track="${esc(t)}">${esc(t)}</button>`).join('');

  const shown = all.filter((b) => (filters.track === 'All' || b.track === filters.track)
    && (filters.state === 'all' || (filters.state === 'open' ? !b.claims.length : b.claims.length)));
  $('#count').textContent = `${shown.length} of ${all.length} shown`;

  $('#board').innerHTML = shown.map((b) => {
    const mine = me && b.claims.some((c) => c.user_id === me.id);
    const expanded = open.has(b.id);
    return `<article class="bounty ${expanded ? 'open' : ''}" id="${esc(b.id)}">
      <button class="b-row" data-toggle="${esc(b.id)}" aria-expanded="${expanded}">
        <span class="b-id">${esc(b.id)}</span>
        <span class="b-title">${esc(b.title)}
          <span class="b-sub">${esc(b.track)}${b.claims.length
            ? ` · claimed by ${b.claims.map((c) => esc(c.name)).join(', ')}` : ''}</span></span>
        <span class="b-size">${b.size} · ${SIZE_TIME[b.size]}<span class="dots" title="Priority ${b.priority} of 5">${dots(b.priority)}</span></span>
      </button>
      <div class="b-brief" ${expanded ? '' : 'hidden'}>
        ${b.course_slug ? `<p><b>Page:</b> <a href="${courseUrl(b.course_slug)}">${esc(courseName[b.course_slug] || b.course_slug)}</a>${b.teacher ? ` · ${esc(b.teacher)}` : ''}</p>` : ''}
        ${b.you_get ? `<p><b>You get:</b> ${esc(b.you_get)}</p>` : ''}
        ${b.done_means ? `<p><b>Done means:</b> ${esc(b.done_means)}</p>` : ''}
        <p class="meta">Worth ${SIZE_POINTS[b.size]} points · posted ${fmtDate(b.created_at)}
          ${mine ? ` · your claim expires ${fmtDate(b.claims.find((c) => c.user_id === me.id).expires_at)}` : ''}</p>
        <div class="b-actions">
          ${isAdmin ? `<button class="btn ghost" data-edit-bounty="${esc(b.id)}">Edit</button><button class="btn ghost danger" data-close-bounty="${esc(b.id)}">Close</button>` : ''}
          ${mine
            ? `<a class="btn" href="${root}submit/?bounty=${encodeURIComponent(b.id)}">Submit work</a>
               <button class="btn ghost" data-unclaim="${esc(b.id)}">Drop claim</button>`
            : `<button class="btn" data-claim="${esc(b.id)}">Claim</button>`}
        </div>
      </div>
    </article>`;
  }).join('') || '<div class="empty">Nothing matches these filters.</div>';
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.toggle) {
    const id = t.dataset.toggle;
    open.has(id) ? open.delete(id) : open.add(id);
    draw();
  } else if (t.dataset.track) {
    filters.track = t.dataset.track; draw();
  } else if (t.dataset.state) {
    filters.state = t.dataset.state;
    document.querySelectorAll('[data-state]').forEach((b) => b.setAttribute('aria-pressed', b === t));
    draw();
  } else if (t.dataset.editBounty) {
    openBountyEditor(s, all.find((b) => b.id === t.dataset.editBounty), courseList, draw);
  } else if (t.dataset.closeBounty) {
    if (confirm(`Close ${t.dataset.closeBounty}? It leaves the board but stays in Review → Bounties.`)) {
      if (await guard(() => s.setBountyStatus(t.dataset.closeBounty, 'closed'), 'Bounty closed.')) draw();
    }
  } else if (t.id === 'post-bounty') {
    openBountyEditor(s, null, courseList, draw);
  } else if (t.dataset.claim) {
    if (!(await requireUser(s, 'to claim a bounty'))) return;
    if (await guard(() => s.claim(t.dataset.claim), 'Claimed. You have 14 days to submit.')) draw();
  } else if (t.dataset.unclaim) {
    if (await guard(() => s.unclaim(t.dataset.unclaim), 'Claim dropped.')) draw();
  }
});

s.onAuth(draw);
await draw();
if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
