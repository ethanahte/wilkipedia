// Every page that isn't a course page, the bounty board, the submit form or the
// review desk. Each page names itself in its #page-data block.

import { initHeader, courses, $, $$, esc, badge, byline, prose, fmtDate, ago, guard, courseUrl, roleLabel, root } from './ui.js';
import { KINDS, staleness } from './forms.js';
import { MODE, SIZE_POINTS } from './store.js';

const which = JSON.parse($('#page-data')?.textContent || '{}').page;
const s = await initHeader();

// ── search (home live results + search page) ──
let index;
async function search(q) {
  index ??= await fetch(root + 'data/search.json').then((r) => r.json());
  const terms = q.toLowerCase().replace(/\bap\b/g, 'ap').split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const alias = { chem: 'chemistry', calc: 'calculus', apush: 'ap us history', bio: 'biology', lit: 'literature',
                  lang: 'language', gov: 'government', econ: 'economics', stats: 'statistics', physio: 'physiology',
                  apes: 'ap environmental science', csa: 'computer science a', csp: 'computer science principles' };
  const expanded = terms.map((t) => alias[t] || t);   // an alias matches as a phrase
  return index.map((it) => {
    const name = it.n.toLowerCase();
    const hay = `${name} ${it.d.toLowerCase()} ${it.x.toLowerCase()}`;
    if (!expanded.every((t) => hay.includes(t))) return null;
    let score = expanded.filter((t) => name.includes(t)).length * 10;
    if (name.startsWith(expanded[0])) score += 5;
    if (it.t === 'c') score += 1;
    return { ...it, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.n.length - b.n.length).slice(0, 30);
}
const resultHtml = (r) => `<a class="result" href="${root}${r.t === 'c' ? 'courses' : 'teachers'}/${r.s}/">
  <b>${esc(r.n)}</b><span class="meta">${r.t === 'c' ? 'Class' : 'Teacher'} · ${esc(r.d)}</span></a>`;

// ── subject lists: light up classes that have content ──
async function markContent() {
  const has = await s.contentIndex();
  $$('.course-row').forEach((li) => {
    const on = has.has(li.dataset.slug);
    li.classList.toggle('is-empty', !on);
    $('.status', li).textContent = on ? '' : 'Not written yet';
  });
}

const pages = {
  async home() {
    const q = $('#home-q');
    q.addEventListener('input', async () => {
      const r = await search(q.value);
      $('#home-results').innerHTML = q.value.trim() ? (r.slice(0, 6).map(resultHtml).join('') || '<div class="meta">No matches.</div>') : '';
    });
    const b = (await s.bounties()).filter((x) => x.status === 'open').slice(0, 5);
    $('#home-bounties').innerHTML = b.map((x) => `<a href="${root}bounties/#${esc(x.id)}"><span class="b-id">${esc(x.id)}</span> ${esc(x.title)}
      <span class="meta">${x.size} · ${SIZE_POINTS[x.size]} pts${x.claims.length ? ' · claimed' : ''}</span></a>`).join('')
      || '<div class="meta">No open bounties right now.</div>';
    const [recent, data] = await Promise.all([s.recent(6), courses()]);
    const name = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
    $('#home-recent').innerHTML = recent.map((x) => `<a href="${x.course_slug ? courseUrl(x.course_slug) : root + 'school/'}">
      ${esc(KINDS[x.kind].label)}${x.teacher ? ` · ${esc(x.teacher)}` : ''}: <b>${esc(name[x.course_slug] || 'School info')}</b>
      <span class="meta">by ${byline(x.author, x.verified)} · ${ago(x.reviewed_at)}</span></a>`).join('')
      || '<div class="meta">Nothing yet. The first pages are being written now.</div>';
  },

  async subject() {
    await markContent();
    $('#filter')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      $$('#filter .chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
      const f = b.dataset.f;
      $$('.course-row').forEach((li) => {
        li.hidden = f === 'has' ? li.classList.contains('is-empty')
          : f === 'ap' ? !li.dataset.kind.includes('ap')
          : f === 'honors' ? !li.dataset.kind.includes('honors') : false;
      });
      $$('.dept-block').forEach((d) => (d.hidden = !$$('.course-row', d).some((li) => !li.hidden)));
    });
  },

  async search() {
    const q = new URLSearchParams(location.search).get('q') || '';
    const input = $('#search-q');
    input.value = q;
    const run = async () => {
      const r = await search(input.value);
      $('#search-results').innerHTML = input.value.trim()
        ? (r.map(resultHtml).join('') || `<div class="empty">No classes or teachers match “${esc(input.value)}”.</div>`) : '';
    };
    input.addEventListener('input', run);
    run();
  },

  async leaderboard() {
    const rows = await s.leaderboard();
    let key = 'points';
    const draw = () => {
      const sorted = [...rows].sort((a, b) => b[key] - a[key]).filter((r) => r[key] > 0);
      $('#board').innerHTML = sorted.map((r) => `<li><span class="who">${byline(r.display_name, r.school_verified)}
        ${r.role !== 'contributor' ? `<span class="tag">${esc(roleLabel(r.role))}</span>` : ''}</span>
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
    const list = await s.approved({ kind: 'school_info' });
    const by = {};
    for (const x of list) (by[x.payload.topic] ??= []).push(x);
    const order = KINDS.school_info.fields[0].options;
    $('#school-list').innerHTML = order.map((topic) => `<section class="card topic"><h2>${esc(topic)}</h2>
      ${(by[topic] || []).map((x) => {
        const stale = staleness(x);
        return `<article><h3>${esc(x.payload.title)}</h3>${prose(x.payload.text)}
          ${stale ? `<div class="stale">${esc(stale)}</div>` : ''}
          <div class="meta">By ${byline(x.author, x.verified)} · checked ${fmtDate(x.reviewed_at)}${x.payload.source ? ` · Source: ${esc(x.payload.source)}` : ''}</div></article>`;
      }).join('') || `<div class="empty">Nothing here yet. <a href="${root}bounties/">Check the bounties</a> or <a href="${root}submit/?kind=school_info">add it</a>.</div>`}
    </section>`).join('');
  },

  async account() {
    const draw = async () => {
      const me = s.user();
      const demoTools = MODE === 'demo' ? `<section class="card"><h2>Demo mode</h2>
        <p>Supabase isn’t connected, so everything here lives only in this browser. Once Ethan pastes the Supabase URL and key into <code>assets/js/config.js</code>, real Google sign-in and the shared database switch on.</p>
        ${me ? `<p><label>Try the site as: <select id="demo-role">${['contributor', 'trusted', 'reviewer', 'admin'].map((r) =>
          `<option value="${r}" ${me.role === r ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" id="demo-school" ${me.school ? 'checked' : ''}> Pretend this is a school account</label></p>` : ''}
        <p><button class="btn ghost danger" id="demo-reset">Erase demo data</button></p></section>` : '';
      if (!me) {
        $('#account').innerHTML = `<p>Sign in to claim bounties, submit work and comment. Reading never needs an account.</p>
          <p><button class="btn" id="acct-signin">Sign in${MODE === 'live' ? ' with Google' : ''}</button></p>${demoTools}`;
        $('#acct-signin').onclick = () => guard(() => s.signIn());
      } else {
        const mine = await s.mySubmissions();
        const [data] = await Promise.all([courses()]);
        const name = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
        const label = { pending: 'Waiting for review', approved: 'Published', changes: 'Needs changes', rejected: 'Not accepted' };
        $('#account').innerHTML = `<section class="card">
            <p><span class="tag">${esc(roleLabel(me.role))}</span>${badge(me.school)}</p>
            <p class="meta">${me.school
              ? 'You signed in with your school account, so your work shows the SCUSD ✓ badge.'
              : 'You signed in with a personal account. Your comments always go to a reviewer first. Sign in with your @scusd.net school account to get the SCUSD ✓ badge.'}</p>
            <form id="name-form" class="inline"><label for="dn">Display name</label>
              <input id="dn" value="${esc(me.name)}" maxlength="40" required><button class="btn small">Save</button></form>
            <p class="meta">Shown on your contributions and comments. Your first name, or a name people know you by.</p>
            <p><button class="btn ghost" id="signout">Sign out</button></p></section>
          <section><h2>Your submissions</h2>${mine.length ? `<ul class="subs">${mine.map((x) => `<li>
            <span class="tag st-${x.status}">${label[x.status]}</span> ${esc(KINDS[x.kind].label)}${x.teacher ? ` · ${esc(x.teacher)}` : ''}
            · ${x.course_slug ? `<a href="${courseUrl(x.course_slug)}">${esc(name[x.course_slug] || x.course_slug)}</a>` : 'School info'}
            <span class="meta">${ago(x.created_at)}</span>
            ${x.review_note ? `<div class="note">Reviewer: ${esc(x.review_note)}</div>` : ''}</li>`).join('')}</ul>`
            : `<p class="meta">Nothing yet. <a href="${root}bounties/">Find a bounty</a>.</p>`}</section>${demoTools}`;
        $('#signout').onclick = () => guard(() => s.signOut());
        $('#name-form').onsubmit = (e) => { e.preventDefault(); guard(() => s.updateName($('#dn').value.trim()), 'Saved.'); };
        $('#demo-role')?.addEventListener('change', (e) => guard(() => s.setDemoRole(e.target.value), 'Role switched.'));
        $('#demo-school')?.addEventListener('change', (e) => guard(() => s.setDemoSchool(e.target.checked)));
      }
      $('#demo-reset')?.addEventListener('click', async () => {
        if (!confirm('Erase all demo claims, submissions and comments in this browser?')) return;
        await s.resetDemo(); location.reload();
      });
    };
    s.onAuth(draw);
    draw();
  },

  static() {},
};

await pages[which]?.();
