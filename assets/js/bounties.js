// The bounty board, laid out like Ethan's BountyBoard app, rebuilt for a team:
//
//   Board   Posted and Claimed columns; a card opens in place to its brief
//           ("You get" / "Done means").
//   Agenda  a rolling horizon: Overdue, Today, the next days, Later, Someday,
//           with a five-week density strip across the top.
//   Ledger  the team's record: stats, then every completed or withdrawn bounty.
//   Orrery  the board as a star system (orrery.js).
//
// Rank runs S (critical) to D (whenever), stored as priority 5…1. Effort is
// the size: S ~30 min, M ~2 hrs, L ~5+ hrs, which is also what it pays.
// Only the review team sees this page; only admins post, edit, complete and close.

import { initHeader, requireUser, courses, openBountyEditor, $, $$, esc, guard, fmtDate, courseUrl, root, RANKS, rankOf } from './ui.js';
import { SIZE_POINTS, REVIEWER_ROLES } from './store.js';
import { createOrrery, hash01 } from './orrery.js';

const s = await initHeader();
const courseList = (await courses()).courses;
const courseName = Object.fromEntries(courseList.map((c) => [c.slug, c.name]));

const EFFORT = { S: { mins: 30, label: '~30 min' }, M: { mins: 120, label: '~2 hrs' }, L: { mins: 300, label: '~5+ hrs' } };
const TRACK_COLORS = { 'Course pages': '#5b8fc7', 'Teacher sections': '#b07cc6', 'Study guides': '#d08a3c', 'Resources': '#4fa38a',
                       'Summer homework': '#d4b030', 'School info': '#c7646a', 'Clubs & sports': '#7a9e3f', 'Fix outdated': '#8b8f99' };
const SPARE = ['#5f9ea0', '#c0788f', '#9a86c8', '#b8894a'];
const trackColor = (t) => TRACK_COLORS[t] || SPARE[Math.floor(hash01(t) * SPARE.length)];
const VIEWS = ['board', 'agenda', 'ledger', 'orrery'];
const VIEW_KEY = 'wilkipedia-bounty-view';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STRIP_DAYS = 35;

// ── dates: due_on is a plain calendar day, compared in local time ──
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYMD = (x) => { const [y, m, d] = x.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const daysUntil = (x) => Math.round((parseYMD(x) - parseYMD(today())) / 864e5);
function dayLabel(x) {
  const n = daysUntil(x);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  const d = parseYMD(x), yr = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}${yr}`;
}
function dueLabel(x) {
  if (!x) return '';
  const n = daysUntil(x);
  if (n < 0) return `overdue ${-n}d · ${dayLabel(x)}`;
  if (n <= 1) return `due ${dayLabel(x).toLowerCase()}`;
  return `due ${dayLabel(x)}${n <= 7 ? ` · in ${n}d` : ''}`;
}
const fmtMins = (m) => (m < 60 ? `${m}m` : `${+(m / 60).toFixed(m % 60 ? 1 : 0)}h`);

// ── state ──
let view = (() => {
  const q = new URLSearchParams(location.search).get('view');
  if (VIEWS.includes(q)) return q;
  if (location.hash) return 'board';
  try { return VIEWS.includes(localStorage.getItem(VIEW_KEY)) ? localStorage.getItem(VIEW_KEY) : 'board'; } catch { return 'board'; }
})();
const filters = { track: 'All', state: 'all', fits: 'any', q: '' };
const expanded = new Set(location.hash ? [decodeURIComponent(location.hash.slice(1))] : []);
let all = [];          // every bounty, normalised
let work = [];         // approved submissions made for a bounty
let me = null, team = false, isAdmin = false;
let orrery = null;

function normalise(b) {
  const rank = rankOf(b.priority);
  const effort = EFFORT[b.size] || EFFORT.M;
  const doneBy = [...new Set(work.filter((w) => w.bounty_id === b.id).map((w) => w.author))];
  const links = [];
  if (b.course_slug) links.push([courseUrl(b.course_slug), courseName[b.course_slug] || b.course_slug]);
  return {
    ...b, rank, mins: effort.mins, effort: effort.label, points: SIZE_POINTS[b.size] ?? 0,
    trackColor: trackColor(b.track),
    trackHtml: `<span class="tdot" style="--tc:${trackColor(b.track)}"><i></i>${esc(b.track)}</span>`,
    claims: b.claims.map((c) => ({ ...c, mine: c.user_id === me?.id })),
    mine: b.claims.some((c) => c.user_id === me?.id),
    daysLeft: b.status === 'open' && b.due_on ? daysUntil(b.due_on) : null,
    dueLabel: b.due_on ? dueLabel(b.due_on) : '',
    postedLabel: fmtDate(b.created_at),
    closedLabel: b.closed_at ? fmtDate(b.closed_at) : '',
    doneBy, links,
  };
}

function matches(t) {
  if (filters.track !== 'All' && t.track !== filters.track) return false;
  if (filters.state === 'open' && t.claims.length) return false;
  if (filters.state === 'claimed' && !t.claims.length) return false;
  if (filters.state === 'mine' && !t.mine) return false;
  if (filters.fits !== 'any' && t.mins > Number(filters.fits)) return false;
  if (filters.q) {
    const hay = `${t.id} ${t.title} ${t.track} ${t.teacher || ''} ${courseName[t.course_slug] || ''} ${t.you_get || ''} ${t.done_means || ''}`.toLowerCase();
    if (!filters.q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}
const live = () => all.filter((t) => t.status === 'open');
const byUrgency = (a, b) => RANKS[b.rank].p - RANKS[a.rank].p
  || (a.due_on || '9999').localeCompare(b.due_on || '9999') || a.id.localeCompare(b.id);
const activeFilters = () => filters.track !== 'All' || filters.state !== 'all' || filters.fits !== 'any' || filters.q;

// ── shared bits ──
const prioDots = (rank) => [1, 2, 3, 4, 5].map((i) => `<i class="${i <= RANKS[rank].p ? 'on' : ''}"></i>`).join('');
const rankTag = (t) => `<span class="rk" style="--rankc:var(--rk-${t.rank})" title="Rank ${t.rank}: ${RANKS[t.rank].label}">${t.rank}</span>`;
const dueCls = (t) => (t.daysLeft === null ? '' : t.daysLeft < 0 ? 'due-over' : t.daysLeft <= 1 ? 'due-today' : t.daysLeft <= 3 ? 'due-soon' : '');

function actionsFor(t) {
  const a = [];
  if (t.status === 'open') {
    if (t.mine) a.push({ act: 'submit', label: 'Submit work', go: true }, { act: 'unclaim', label: 'Drop claim' });
    else a.push({ act: 'claim', label: 'Claim', go: true });
    if (isAdmin) a.push({ act: 'done', label: 'Complete' }, { act: 'edit', label: 'Edit' }, { act: 'close', label: 'Withdraw' });
  } else if (isAdmin) {
    a.push({ act: 'repost', label: 'Repost' }, { act: 'edit', label: 'Edit' });
  }
  return a;
}
const actionButtons = (t, sm = '') => actionsFor(t).map((a) =>
  `<button type="button" class="btn ${a.go ? '' : 'ghost'} ${sm}" data-act="${a.act}" data-id="${esc(t.id)}">${esc(a.label)}</button>`).join('');

// ── Board ──
function card(t) {
  const open = expanded.has(t.id);
  const facts = [`<span class="mono">${esc(t.id)}</span>`];
  if (t.due_on) facts.push(`<span class="${dueCls(t)}">${esc(t.dueLabel)}</span>`);
  if (t.claims.length) facts.push(`<span>${t.mine ? 'you' + (t.claims.length > 1 ? ` + ${t.claims.length - 1}` : '') : esc(t.claims.map((c) => c.name).join(', '))}</span>`);
  const myClaim = t.claims.find((c) => c.mine);
  return `<article class="bcard ${open ? 'open' : ''} ${t.daysLeft !== null && t.daysLeft < 0 ? 'overdue' : ''}" id="${esc(t.id)}" style="--rankc:var(--rk-${t.rank})">
    <button type="button" class="bc-row" data-toggle="${esc(t.id)}" aria-expanded="${open}">
      <span class="bc-left"><span class="bc-title">${esc(t.title)}</span>
        <span class="bc-facts">${facts.join('<span class="sep">·</span>')}</span></span>
      <span class="bc-right"><span class="bc-prio" title="Rank ${t.rank}: ${RANKS[t.rank].label}"><span class="pdots">${prioDots(t.rank)}</span><span class="lbl">${t.rank} · ${RANKS[t.rank].label}</span></span>
        <span class="bc-est">◷ ${esc(t.effort)} · ${t.points} pts</span></span>
    </button>
    <div class="bc-bottom">${t.trackHtml}${t.teacher ? `<span class="meta">${esc(t.teacher)}</span>` : ''}</div>
    ${open ? `<div class="bc-detail">
      ${t.course_slug ? `<p class="b-line"><b>Page:</b> <a href="${courseUrl(t.course_slug)}">${esc(courseName[t.course_slug] || t.course_slug)}</a>${t.teacher ? ` · ${esc(t.teacher)}` : ''}</p>` : ''}
      ${t.you_get ? `<p class="b-line"><b>You get:</b> ${esc(t.you_get)}</p>` : ''}
      ${t.done_means ? `<p class="b-line"><b>Done means:</b> ${esc(t.done_means)}</p>` : ''}
      <p class="meta">Posted ${esc(t.postedLabel)}${myClaim ? ` · your claim expires ${fmtDate(myClaim.expires_at)}` : ''}
        ${t.claims.length > 1 || (t.claims.length && !t.mine) ? ` · working on it: ${esc(t.claims.map((c) => c.name).join(', '))}` : ''}</p>
      <div class="b-actions">${actionButtons(t)}</div>
    </div>` : ''}
  </article>`;
}
function renderBoard() {
  const pool = live().filter(matches).sort(byUrgency);
  const posted = pool.filter((t) => !t.claims.length), claimed = pool.filter((t) => t.claims.length);
  const empty = (m) => `<div class="bb-empty">${activeFilters() ? 'Nothing matches these filters.' : m}</div>`;
  $('#view-board').innerHTML = `<div class="bb-cols">
    <div class="bb-col"><div class="bb-colhead"><h2>Posted</h2><span>${posted.length}</span></div>
      ${posted.map(card).join('') || empty('Every bounty has someone on it.')}</div>
    <div class="bb-col"><div class="bb-colhead"><h2>Claimed</h2><span>${claimed.length}</span></div>
      ${claimed.map(card).join('') || empty('Nothing claimed yet. Take one from Posted.')}</div>
  </div>`;
}

// ── Agenda ──
function agendaRow(t) {
  const meta = [t.trackHtml, esc(t.effort)];
  if (t.claims.length) meta.push(t.mine ? 'you' : esc(t.claims.map((c) => c.name).join(', ')));
  const quick = t.mine ? { act: 'submit', label: 'Submit work' } : { act: 'claim', label: 'Claim' };
  return `<div class="ag-row ${t.claims.length ? 'claimed' : ''}" data-open="${esc(t.id)}" tabindex="0" style="--rankc:var(--rk-${t.rank})">
    ${rankTag(t)}<span class="ag-title">${esc(t.title)}</span>
    <span class="ag-meta">${meta.map((m) => `<span>${m}</span>`).join('')}</span>
    <span class="ag-acts"><button type="button" class="btn small ${t.mine ? '' : 'ghost'}" data-act="${quick.act}" data-id="${esc(t.id)}">${quick.label}</button></span>
  </div>`;
}
function agendaSection(id, title, list, cls = '', addDate = '') {
  if (!list.length && !addDate) return '';
  return `<section class="ag-sec ${cls}" id="${id}">
    <div class="ag-head"><h2>${esc(title)}</h2><span class="n">${list.length} · ${fmtMins(list.reduce((a, t) => a + t.mins, 0))}</span>
      ${addDate && isAdmin ? `<button type="button" class="ag-add" data-newon="${addDate}" title="Post a bounty due ${esc(title)}" aria-label="Post a bounty due ${esc(title)}">＋</button>` : ''}</div>
    ${list.map(agendaRow).join('')}
  </section>`;
}
function renderAgenda() {
  const pool = live().filter(matches);
  const overdue = [], someday = [], later = [], byDay = new Map();
  for (const t of pool) {
    if (!t.due_on) { someday.push(t); continue; }
    const n = daysUntil(t.due_on);
    if (n < 0) overdue.push(t);
    else if (n > 45) later.push(t);
    else (byDay.get(t.due_on) || byDay.set(t.due_on, []).get(t.due_on)).push(t);
  }
  overdue.sort((a, b) => a.due_on.localeCompare(b.due_on) || byUrgency(a, b));
  later.sort((a, b) => a.due_on.localeCompare(b.due_on));
  someday.sort(byUrgency);
  for (const l of byDay.values()) l.sort(byUrgency);

  // Density strip: the shape of the next five weeks
  const t0 = parseYMD(today());
  const days = [];
  let peak = 1;
  for (let i = 0; i < STRIP_DAYS; i++) {
    const d = new Date(t0); d.setDate(d.getDate() + i);
    const key = ymd(d), c = (byDay.get(key) || []).length;
    peak = Math.max(peak, c);
    days.push({ key, c, day: d.getDate(), mark: d.getDay() === 1 || d.getDate() === 1 });
  }
  const strip = `<div class="ag-strip" aria-label="Bounties due over the next five weeks">${days.map((d, i) =>
    `<button type="button" class="ag-bar ${d.c ? 'has' : ''} ${i === 0 ? 'today' : ''}" data-jump="${d.key}" style="--h:${(d.c / peak).toFixed(3)}"
      title="${dayLabel(d.key)}: ${d.c ? `${d.c} due` : 'nothing due'}"><i></i><b>${d.mark || i === 0 ? d.day : ''}</b></button>`).join('')}</div>`;

  const body = [
    agendaSection('ag-overdue', 'Overdue', overdue, 'late'),
    ...[...byDay.keys()].sort().map((d) => agendaSection('ag' + d, dayLabel(d), byDay.get(d), daysUntil(d) === 0 ? 'now' : '', d)),
    agendaSection('ag-later', 'Later', later),
    agendaSection('ag-someday', 'Someday · no date', someday),
  ].join('');
  $('#view-agenda').innerHTML = strip + (body || `<div class="bb-empty">${activeFilters() ? 'Nothing matches these filters.' : 'Nothing on the board.'}</div>`);
}

// ── Ledger ──
function renderLedger() {
  const open = live();
  const monthAgo = Date.now() - 30 * 864e5;
  const done = all.filter((t) => t.status === 'done');
  // Points actually paid: a bounty pays once per person, when their work is approved
  const paid = new Map();
  for (const w of work) {
    const b = all.find((x) => x.id === w.bounty_id);
    if (b) paid.set(`${w.user_id}|${w.bounty_id}`, { pts: b.points, at: w.reviewed_at });
  }
  const pts = [...paid.values()];
  const stat = (n, l, cls = '') => `<div class="lstat"><div class="n ${cls}">${n}</div><div class="l">${l}</div></div>`;
  const overdueN = open.filter((t) => t.daysLeft !== null && t.daysLeft < 0).length;

  const closed = all.filter((t) => t.status !== 'open' && matches(t))
    .sort((a, b) => (b.closed_at || '').localeCompare(a.closed_at || ''));
  const groups = new Map();
  for (const t of closed) {
    const k = t.closed_at ? ymd(new Date(t.closed_at)) : 'earlier';
    (groups.get(k) || groups.set(k, []).get(k)).push(t);
  }
  $('#view-ledger').innerHTML = `
    <div class="lstats">
      ${stat(open.length, 'On the board')}
      ${stat(open.filter((t) => t.claims.length).length, 'Being worked on')}
      ${stat(overdueN, 'Overdue', overdueN ? 'bad' : 'dim')}
      ${stat(done.filter((t) => t.closed_at && new Date(t.closed_at) > monthAgo).length, 'Completed · 30 days')}
      ${stat(done.length, 'Completed · all time')}
      ${stat(pts.reduce((a, p) => a + p.pts, 0), 'Points paid out')}
    </div>
    ${closed.length ? [...groups.entries()].map(([d, list]) => `
      <div class="ldate">${d === 'earlier' ? 'Earlier' : d === today() ? 'Today' : esc(dayLabel(d))}</div>
      <div class="ledger">${list.map((t) => `
        <div class="lrow ${t.status}">
          ${rankTag(t)}
          <span class="t">${esc(t.title)} <span class="mono meta">${esc(t.id)}</span>
            ${t.doneBy.length ? `<span class="by">by ${esc(t.doneBy.join(', '))}</span>` : ''}</span>
          ${t.status === 'done' ? `<span class="pill">completed · ${t.points} pts</span>` : '<span class="pill off">withdrawn</span>'}
          ${isAdmin ? `<button type="button" class="btn ghost small" data-act="repost" data-id="${esc(t.id)}">Repost</button>` : ''}
        </div>`).join('')}</div>`).join('')
    : `<div class="bb-empty">${activeFilters() ? 'Nothing matches these filters.' : 'No finished bounties yet. They land here when an admin marks one complete.'}</div>`}`;
}

// ── Orrery ──
function renderOrrery() {
  if (!orrery) {
    orrery = createOrrery({
      wrap: $('#view-orrery .orr-wrap'),
      actions: actionsFor,
      onAction: (act, id) => act_(act, id, true),
      canDrag: () => isAdmin,
      onRerank: async (id, rank) => {
        const ok = await guard(() => s.updateBounty(id, { priority: RANKS[rank].p }), `Re-ranked to ${rank}: ${RANKS[rank].label}.`);
        if (ok) await load();
        return ok;
      },
    });
  }
  $('#orr-hint').textContent = (isAdmin ? 'Drag a body to another ring to re-rank it · ' : '')
    + 'Click a body to open it · drag space to orbit · shift-drag to pan · scroll to zoom · double-click to recentre';
  orrery.setItems(all.filter((t) => t.status === 'done' || (t.status === 'open' && matches(t))));
}

// ── drawing ──
function renderTools() {
  const tracks = ['All', ...new Set(all.map((b) => b.track))];
  $('#track-filter').innerHTML = tracks.map((t) => `<button type="button" class="chip" aria-pressed="${filters.track === t}" data-track="${esc(t)}">${t === 'All' ? 'All tracks'
    : `<span class="tdot" style="--tc:${trackColor(t)}"><i></i></span>${esc(t)}`}</button>`).join('');
  $$('[data-state]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.state === filters.state)));
  const shown = live().filter(matches).length;
  $('#count').textContent = `${shown} of ${live().length} open bounties shown`;
}
function render() {
  $$('.bb-views [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  $('.bb-tools').classList.toggle('on-orrery', view === 'orrery');
  $('.bb-tools').classList.toggle('on-ledger', view === 'ledger');
  renderTools();
  ({ board: renderBoard, agenda: renderAgenda, ledger: renderLedger, orrery: renderOrrery })[view]();
  if (view === 'orrery') orrery.show(); else orrery?.hide();
}
function setView(v) {
  if (!VIEWS.includes(v) || v === view) return;
  view = v;
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ }
  render();
}

async function load() {
  me = s.user();
  team = !!me && REVIEWER_ROLES.includes(me.role);     // the board belongs to the review team
  isAdmin = me?.role === 'admin';
  $('#gate').hidden = team;
  $('#gate-text').textContent = me ? 'The bounty board is for the Wilkipedia review team.' : 'Sign in to see the bounty board.';
  $('#gate-signin').hidden = !!me;
  $('#members').hidden = !team;
  $('#admin-bar').hidden = !isAdmin;
  if (!team) { orrery?.hide(); return; }
  const [list, w] = await Promise.all([s.bounties(), s.bountyWork().catch(() => [])]);
  work = w;
  all = list.map(normalise);
  render();
}

// ── actions ──
async function act_(act, id, fromOrrery = false) {
  const t = all.find((b) => b.id === id);
  if (!t && act !== 'post') return;
  if (act === 'claim') {
    if (!(await requireUser(s, 'to claim a bounty'))) return;
    if (await guard(() => s.claim(id), 'Claimed. You have 14 days to submit.')) await load();
  } else if (act === 'unclaim') {
    if (await guard(() => s.unclaim(id), 'Claim dropped.')) await load();
  } else if (act === 'submit') {
    location.href = `${root}submit/?bounty=${encodeURIComponent(id)}`;
  } else if (act === 'edit') {
    openBountyEditor(s, all.find((b) => b.id === id), courseList, load);
  } else if (act === 'done') {
    const who = t.doneBy.length ? ` Credited so far: ${t.doneBy.join(', ')}.` : ' No approved work is linked to it yet.';
    if (!confirm(`Mark ${id} complete? It moves to the Ledger (and the Orrery's belt).${who}`)) return;
    if (await guard(() => s.setBountyStatus(id, 'done'), `${id} completed.`)) { if (fromOrrery) orrery.focus(null); await load(); }
  } else if (act === 'close') {
    if (!confirm(`Withdraw ${id}? It leaves the board and is listed as withdrawn in the Ledger.`)) return;
    if (await guard(() => s.setBountyStatus(id, 'closed'), `${id} withdrawn.`)) { if (fromOrrery) orrery.focus(null); await load(); }
  } else if (act === 'repost') {
    if (await guard(() => s.setBountyStatus(id, 'open'), `${id} is back on the board.`)) { if (fromOrrery) orrery.focus(null); await load(); }
  }
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-open]');
  if (!t || t.closest('.orr-wrap')) return;
  if (t.dataset.view) return setView(t.dataset.view);
  if (t.dataset.act) { e.stopPropagation(); return act_(t.dataset.act, t.dataset.id); }
  if (t.dataset.toggle) {
    const id = t.dataset.toggle;
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    return renderBoard();
  }
  if (t.dataset.open) {                     // an agenda row opens the bounty on the Board
    expanded.add(t.dataset.open); setView('board');
    return document.getElementById(t.dataset.open)?.scrollIntoView({ block: 'center' });
  }
  if (t.dataset.track) { filters.track = t.dataset.track; return render(); }
  if (t.dataset.state) { filters.state = t.dataset.state; return render(); }
  if (t.dataset.jump) {
    const sec = document.getElementById('ag' + t.dataset.jump);
    if (sec) sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else if (isAdmin) openBountyEditor(s, null, courseList, load, { due_on: t.dataset.jump });
    return;
  }
  if (t.dataset.newon) return openBountyEditor(s, null, courseList, load, { due_on: t.dataset.newon });
  if (t.id === 'post-bounty') return openBountyEditor(s, null, courseList, load);
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || $('.modal') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Enter' && e.target.dataset?.open) { e.target.click(); return; }
  if (!team) return;
  if (e.key >= '1' && e.key <= '4') setView(VIEWS[Number(e.key) - 1]);
  else if (e.key === '/') { e.preventDefault(); $('#bb-q').focus(); }
  else if ((e.key === 'n' || e.key === 'N') && isAdmin) openBountyEditor(s, null, courseList, load);
});
$('#bb-q').addEventListener('input', (e) => { filters.q = e.target.value.trim().toLowerCase(); render(); });
$('#fits').addEventListener('change', (e) => { filters.fits = e.target.value; render(); });

s.onAuth(load);
await load();
if (location.hash && view === 'board') document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'center' });
