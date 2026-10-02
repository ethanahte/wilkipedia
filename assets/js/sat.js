// The SAT page (sat/, built by build_sat in build.py). The static HTML has the facts; this adds:
//   Next      a dark panel: the next test date with a countdown ring, the year's dates on a line,
//             the next date you can still register for, scores on the way, and the PSAT/SAT days
//             on the school calendar. All from the page data (data/sat.json + calendar.json).
//   Timer     a practice timer with the real module timings, and your pace question by question.
//   Posts     students' SAT posts (kind 'sat'), filtered by section.
//   Thread    the page's comments (course_slug 'sat'), the same code as a class page's.
// Nothing here is invented: dates and timings come from College Board via the page data.

import { $, $$, esc, prose, byline, fmtDate, root, guard, openEditor, suggestLink, linkPdfs, safeUrl, slugify, lessMotion, toast } from './ui.js';
import { SAT_TYPES, SAT_SECTIONS, SAT_PLAN, SAT_NOTES, SAT_LINK } from './forms.js';
import { REVIEWER_ROLES } from './store.js';
import { mountComments } from './comments.js';

const data = JSON.parse($('#page-data').textContent);

// Dates are days, not instants: compare them at noon so time zones and DST never shift a day
const day = (iso) => new Date(`${iso}T12:00:00`);
const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const daysTo = (iso) => Math.round((day(iso) - today()) / 864e5);
const short = (iso) => day(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const long = (iso) => day(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const inDays = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

export function mountSat(s) {
  paintNext();
  markDates();
  mountTimer($('#sat-timer'));
  posts(s);
  const thread = mountComments(s, { slug: 'sat', prompts: ['General', 'Question', 'Reading and Writing', 'Math', 'Signing up', 'Test day'],
    empty: 'No questions yet. Ask one, or share what worked for you.' });
  thread.draw();
  s.onAuth(thread.draw);
}

// ── the next test ──
function paintNext() {
  const box = $('#sat-next'), dates = data.dates;
  const i = dates.findIndex((x) => daysTo(x.test) >= 0);
  box.hidden = false;
  if (i < 0) {
    box.innerHTML = `<div class="sn-main"><p class="c-kicker">Next SAT</p><p class="sn-big">Dates for next year aren’t posted here yet</p>
      <p class="sn-sub">College Board lists them on its <a href="${esc(data.register)}" target="_blank" rel="noopener">dates and deadlines page ↗</a>.</p></div>`;
    return;
  }
  const next = dates[i], n = daysTo(next.test);
  // the ring fills over the time since the last test (or since a month before the first)
  const from = i ? day(dates[i - 1].test) : new Date(day(next.test) - 35 * 864e5);
  const p = Math.min(1, Math.max(0, (today() - from) / (day(next.test) - from)));
  const R = 84, C = 2 * Math.PI * R;
  const regLeft = daysTo(next.register);
  const sub = n === 0 ? `Test day. Bring your charged device with Bluebook set up, your admission ticket, a physical photo ID and pencils. <a href="${esc(data.bring)}" target="_blank" rel="noopener">The full list ↗</a>`
    : regLeft >= 0 ? `Register by <b>${short(next.register)}</b> (${inDays(regLeft)}). Scores come out ${short(next.scores)}.`
    : `${n === 1 ? 'Tomorrow' : `${n} days away`}. Registration closed ${short(next.register)}; scores come out ${short(next.scores)}.`;

  // other things worth knowing right now
  const facts = [];
  const open = dates.find((x) => daysTo(x.register) >= 0);
  if (open && open !== next) facts.push(['Still open', `${short(open.test)}`, `Register by ${short(open.register)} · ${inDays(daysTo(open.register))}`]);
  const waiting = dates.filter((x) => daysTo(x.test) < 0 && daysTo(x.scores) >= 0).at(-1);
  if (waiting) facts.push(['Scores on the way', `${short(waiting.scores)}`, `For the ${short(waiting.test).replace(/^\w+, /, '')} test · ${inDays(daysTo(waiting.scores))}`]);
  const here = data.school.find((x) => daysTo(x.date) >= 0);
  if (here) facts.push([`${here.title} at Wilcox`, short(here.date), [here.time, inDays(daysTo(here.date))].filter(Boolean).join(' · ')]);

  // the school year's test dates on one line, with today's needle
  const t0 = day(dates[0].test) - 30 * 864e5, t1 = +day(dates.at(-1).test) + 20 * 864e5;
  const at = (d) => (((d - t0) / (t1 - t0)) * 100).toFixed(2);
  const now = today();
  const line = `<div class="sn-line" aria-hidden="true"><i class="sn-past" style="width:${Math.max(0, Math.min(100, at(now)))}%"></i>
    ${dates.map((x, k) => `<span class="sn-dot ${k < i ? 'gone' : k === i ? 'on' : ''}" style="left:${at(day(x.test))}%"><em>${day(x.test).toLocaleDateString('en-US', { month: 'short' })}</em></span>`).join('')}
    ${now > t0 && now < t1 ? `<span class="sn-now" style="left:${at(now)}%"></span>` : ''}</div>`;

  box.innerHTML = `<div class="sn-main"><p class="c-kicker">Next SAT</p><p class="sn-big">${esc(long(next.test))}</p>
      <p class="sn-sub">${sub}</p>${line}</div>
    <div class="sn-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="sn-ring-bg" cx="100" cy="100" r="${R}"/>
      <circle class="sn-ring-fg" cx="100" cy="100" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p)).toFixed(1)}"/></svg>
      <p class="sn-count">${n === 0 ? '<b>Today</b>' : `<b>${n}</b><small>day${n === 1 ? '' : 's'} to go</small>`}</p></div>
    ${facts.length ? `<div class="sn-facts">${facts.map(([k, v, d]) => `<div><p class="sn-k">${esc(k)}</p><p class="sn-v">${esc(v)}</p><p class="sn-d">${esc(d)}</p></div>`).join('')}</div>` : ''}`;
}

// The dates list: what's gone, and the next one
function markDates() {
  const lis = $$('.sat-dates .sd');
  const next = lis.find((li) => daysTo(li.dataset.test) >= 0);
  for (const li of lis) {
    li.classList.toggle('past', daysTo(li.dataset.test) < 0);
    li.classList.toggle('next', li === next);
    if (li === next) li.insertAdjacentHTML('beforeend', `<span class="sd-in">${esc(inDays(daysTo(li.dataset.test)))}</span>`);
  }
  for (const li of $$('#sat-school li')) li.classList.toggle('past', daysTo(li.dataset.date) < 0);
}

// ── practice timer ──
// A module's time spread evenly over its questions is the pace College Board quotes
// (Reading and Writing: 1 minute 11 seconds a question). The gold cells are the questions you've
// marked done; the needle is where the clock says you should be.
const MODES = [
  { id: 'rw', label: 'Reading and Writing', seq: ['rw1'] },
  { id: 'math', label: 'Math', seq: ['m1'] },
  { id: 'full', label: 'Whole test', seq: ['rw1', 'rw2', 'break', 'm1', 'm2'] },
];
// "32 min", or for the whole test "134 min + 10 min break"
const minsOf = (m) => { const ps = m.seq.map((k) => data.parts.find((x) => x.id === k)); const brk = ps.filter((x) => x.section === 'break').reduce((a, x) => a + x.minutes, 0);
  return `${ps.reduce((a, x) => a + x.minutes, 0) - brk} min${brk ? ` + ${brk} min break` : ''}`; };
const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const perQ = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s` : `${Math.round(sec)} s`);

function mountTimer(box) {
  const parts = Object.fromEntries(data.parts.map((x) => [x.id, x]));
  const title0 = document.title;
  let mode = MODES[0], idx = 0, acc = 0, since = 0, done = 0, tick = 0, finished = false;
  const part = () => parts[mode.seq[idx]];
  const total = () => part().minutes * 60e3;
  const elapsed = () => Math.min(total(), acc + (since ? performance.now() - since : 0));
  const running = () => !!since;

  box.innerHTML = `<div class="st-modes" role="group" aria-label="What to time">${MODES.map((m) => `<button type="button" data-mode="${m.id}">${esc(m.label)}<span>${minsOf(m)}</span></button>`).join('')}</div>
    <div class="st-face">
      <div class="st-top"><p class="st-what"></p><p class="st-step"></p></div>
      <p class="st-time" role="timer" aria-live="off"></p>
      <div class="st-track"><div class="st-cells"></div><i class="st-needle"></i></div>
      <p class="st-pace" aria-live="polite"></p>
      <div class="st-btns">
        <button type="button" class="btn st-go"></button>
        <button type="button" class="btn ghost st-q">Question done <kbd>→</kbd></button>
        <button type="button" class="linkish st-undo">Undo</button>
        <button type="button" class="linkish st-next" hidden>Skip to the next part</button>
        <button type="button" class="linkish st-reset">Reset</button>
      </div>
      <p class="st-keys meta">Keys: <kbd>Space</kbd> start or pause · <kbd>→</kbd> question done · <kbd>←</kbd> undo</p>
    </div>`;

  const paint = () => {
    const p = part(), el = elapsed(), left = total() - el, q = p.questions || 0;
    $('.st-what', box).textContent = p.section === 'break' ? 'Break' : `${p.label} · Module ${p.module}`;
    $('.st-step', box).textContent = mode.seq.length > 1 ? `Part ${idx + 1} of ${mode.seq.length}` : `${p.minutes} minutes${q ? ` · ${q} questions` : ''}`;
    $('.st-time', box).textContent = mmss(left);
    box.classList.toggle('is-running', running());
    box.classList.toggle('is-break', p.section === 'break');
    box.classList.toggle('is-low', running() && left < 5 * 60e3 && p.section !== 'break');
    box.classList.toggle('is-over', finished);
    $('.st-go', box).textContent = finished ? 'Start again' : running() ? 'Pause' : el ? 'Resume' : 'Start';
    $('.st-q', box).hidden = $('.st-undo', box).hidden = !q;
    $('.st-next', box).hidden = mode.seq.length < 2 || idx >= mode.seq.length - 1;
    $('.st-track', box).hidden = !q;
    $('.st-needle', box).style.left = `${((el / total()) * 100).toFixed(2)}%`;
    $$('.st-cells i', box).forEach((c, k) => c.classList.toggle('on', k < done));
    const pace = (p.minutes * 60) / (q || 1);
    if (!q) $('.st-pace', box).textContent = finished ? 'Time.' : 'Bluebook gives you 10 minutes between the sections. Stand up, drink some water.';
    else if (finished) $('.st-pace', box).textContent = `Time. You finished ${done} of ${q} questions.`;
    else if (!el) $('.st-pace', box).textContent = `About ${perQ(pace)} a question. Press “Question done” after each one to see your pace.`;
    else {
      const due = el / 1000 / pace, diff = Math.round(done - due);
      $('.st-pace', box).textContent = `${done} of ${q} done · ${diff > 0 ? `${diff} ahead of pace` : diff < 0 ? `${-diff} behind pace` : 'right on pace'} · about ${perQ(pace)} each`;
    }
    document.title = running() ? `${mmss(left)} · ${$('.st-what', box).textContent}` : title0;
  };
  const cells = () => { $('.st-cells', box).innerHTML = Array.from({ length: part().questions || 0 }, () => '<i></i>').join(''); };
  const stop = () => { if (since) acc += performance.now() - since; since = 0; clearInterval(tick); };
  const loop = () => {
    if (elapsed() >= total()) {
      stop(); acc = total();
      if (mode.id === 'full' && idx < mode.seq.length - 1) { advance(true, true); return; }
      finished = true;
      toast('Time.', 'good');
    }
    paint();
  };
  const start = () => { if (finished) reset(); since = performance.now(); clearInterval(tick); tick = setInterval(loop, 250); paint(); };
  const advance = (keepRunning, auto = false) => {
    stop(); idx++; acc = 0; done = 0; finished = false; cells();
    if (auto) toast(`Time. Now: ${part().section === 'break' ? 'the break' : `${part().label}, module ${part().module}`}`, 'good');
    if (keepRunning) start(); else paint();
  };
  const reset = () => { stop(); idx = 0; acc = 0; done = 0; finished = false; cells(); paint(); };
  const pick = (id) => {
    mode = MODES.find((m) => m.id === id) || MODES[0];
    $$('.st-modes button', box).forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode.id));
    reset();
  };
  const mark = (d) => { const q = part().questions || 0; if (!q || finished) return; done = Math.max(0, Math.min(q, done + d)); paint(); };

  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mode) pick(b.dataset.mode);
    else if (b.classList.contains('st-go')) running() ? (stop(), paint()) : start();
    else if (b.classList.contains('st-q')) mark(1);
    else if (b.classList.contains('st-undo')) mark(-1);
    else if (b.classList.contains('st-next')) advance(running());
    else if (b.classList.contains('st-reset')) reset();
  });
  // Keys work while the timer is on screen and you aren't typing
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable], dialog')) return;
    const r = box.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    if (e.key === ' ' && !e.target.closest?.('button, a')) { e.preventDefault(); running() ? (stop(), paint()) : start(); }
    else if (e.key === 'ArrowRight' || e.key === 'n') { e.preventDefault(); mark(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); mark(-1); }
  });
  if (lessMotion()) box.classList.add('still');
  pick('rw');
}

// ── students' posts ──
const PROMPT = {
  Tip: 'One thing that made a difference, on either section or on test day.',
  [SAT_PLAN]: 'What you did, for how long, and what you’d do differently.',
  [SAT_NOTES]: 'Notes you made yourself: grammar rules, formulas, a Desmos cheat sheet.',
  [SAT_LINK]: 'A free resource that helped, and what it’s good for.',
};

async function posts(s) {
  const box = $('#sat-posts');
  let list = [], filter = '';
  const draw = async () => {
    list = await s.approved({ kind: 'sat' });
    const mod = REVIEWER_ROLES.includes(s.user()?.role);
    const count = (sec) => list.filter((x) => !sec || x.payload.section === sec).length;
    const card = (x) => {
      const p = x.payload, url = safeUrl(p.url), long = String(p.text || '').length > 520;
      return `<article class="sx" id="p-${x.id}" data-sec="${esc(p.section)}">
        <p class="sx-k"><span class="sx-type t-${slugify(p.type)}">${esc(p.type)}</span><span>${esc(p.section)}</span></p>
        <h3>${esc(p.title)}</h3>
        ${p.score ? `<p class="sx-score">${esc(p.score)}</p>` : ''}
        <div class="sx-text${long ? ' long' : ''}">${prose(p.text)}</div>
        ${long ? '<button type="button" class="linkish sx-more" aria-expanded="false">Read more</button>' : ''}
        ${url ? `<a class="sx-link" href="${esc(url)}" target="_blank" rel="noopener nofollow">Open the link <span>${esc(new URL(url).hostname.replace(/^www\./, ''))} ↗</span></a>` : ''}
        ${p.pdf?.path ? `<a class="sx-link" data-pdf="${esc(p.pdf.path)}" href="#" aria-disabled="true" target="_blank" rel="noopener">Open the notes <span>PDF ↗</span></a>` : ''}
        <p class="meta">By ${byline(x.author, x.verified)} · ${fmtDate(x.reviewed_at)}${mod ? ` · <button class="linkish" data-edit="${x.id}">Edit</button> · <button class="linkish danger-link" data-unpub="${x.id}">Unpublish</button>` : suggestLink(s, x)}</p></article>`;
    };
    const todo = `<div class="c-todo-grid">${SAT_TYPES.map((t) => `<a class="c-todo-item" href="${root}submit/?kind=sat&type=${encodeURIComponent(t)}"><b>${esc(t)}</b><span>${esc(PROMPT[t])}</span><i aria-hidden="true">→</i></a>`).join('')}</div>`;
    if (!list.length) {
      box.innerHTML = `<p class="empty-line">Nothing yet. Took the SAT or PSAT? Share what worked: it takes a few minutes, and a reviewer checks it first.</p>${todo}`;
      return;
    }
    const shown = list.filter((x) => !filter || x.payload.section === filter);
    box.innerHTML = `<div class="vtabs sx-filter" role="group" aria-label="Show">${['', ...SAT_SECTIONS].filter((sec) => !sec || count(sec)).map((sec) =>
        `<button type="button" class="vtab" data-sec="${esc(sec)}" aria-pressed="${sec === filter}">${esc(sec || 'All')}<span>${count(sec)}</span></button>`).join('')}</div>
      <div class="sx-grid">${shown.map(card).join('') || '<p class="empty-line">Nothing for this part yet.</p>'}</div>
      <details class="sx-write"><summary>Write one</summary>${todo}</details>`;
    linkPdfs(box, s);
    const hit = location.hash.startsWith('#p-') && document.getElementById(location.hash.slice(1));
    if (hit && !draw.jumped) { draw.jumped = true; hit.classList.add('flash'); hit.scrollIntoView({ block: 'center', behavior: lessMotion() ? 'auto' : 'smooth' }); }
  };
  box.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-sec]:is(button)');
    if (f) { filter = f.dataset.sec; draw(); return; }
    const more = e.target.closest('.sx-more');
    if (more) { const open = more.getAttribute('aria-expanded') !== 'true'; more.previousElementSibling.classList.toggle('open', open); more.setAttribute('aria-expanded', open); more.textContent = open ? 'Show less' : 'Read more'; return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openEditor(s, list.find((x) => String(x.id) === ed.dataset.edit), draw); return; }
    const sg = e.target.closest('[data-suggest]');
    if (sg) { openEditor(s, list.find((x) => String(x.id) === sg.dataset.suggest), null, 'author'); return; }
    const u = e.target.closest('[data-unpub]');
    if (!u) return;
    const note = prompt('Unpublish this post? It stays saved and can be republished from Dashboard → Published.\n\nReason (the author will see this):');
    if (note === null) return;
    if (await guard(() => s.review(Number(u.dataset.unpub), 'rejected', note || 'Unpublished by a reviewer'), 'Unpublished.')) draw();
  });
  s.onAuth(draw);
  await draw();
}
