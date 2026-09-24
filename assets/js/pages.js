// Every page that isn't a course page, the bounty board, the submit form or the
// review desk. Each page names itself in its #page-data block.

import { initHeader, courses, $, $$, esc, badge, byline, prose, fmtDate, ago, guard, courseUrl, roleLabel, root,
         avatarHtml, AVATARS, AVATAR_COLORS, themePref, setThemePref } from './ui.js';
import { KINDS, staleness } from './forms.js';
import { MODE, SIZE_POINTS, REVIEWER_ROLES } from './store.js';

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
    const state = { f: 'all', sort: 'subject' };
    const rows = $$('.course-row');
    const flat = $('#flat');
    const shown = (li) => (state.f === 'has' ? !li.classList.contains('is-empty')
      : state.f === 'ap' ? li.dataset.kind.includes('ap')
      : state.f === 'honors' ? li.dataset.kind.includes('honors') : true);
    const GRADE = { 9: 'Open to 9th graders', 10: 'From 10th grade', 11: 'From 11th grade', 12: '12th grade', '': 'Grade not listed' };

    function apply() {
      rows.forEach((li) => (li.hidden = !shown(li)));
      // Subject view: the rows stay where the page put them
      if (!flat || state.sort === 'subject') {
        if (flat) { flat.hidden = true; $('#by-subject').hidden = false; }
        $$('.dept-block').forEach((d) => (d.hidden = !$$('.course-row', d).some((li) => !li.hidden)));
        return;
      }
      // A–Z and by-grade views: copies of the visible rows, regrouped
      const vis = rows.filter((li) => !li.hidden)
        .sort((a, b) => a.dataset.name.localeCompare(b.dataset.name));
      const groups = {};
      for (const li of vis) {
        const key = state.sort === 'az' ? (/[a-z]/i.test(li.dataset.name[0]) ? li.dataset.name[0].toUpperCase() : '#')
                                        : li.dataset.grade;
        (groups[key] ??= []).push(li);
      }
      const keys = Object.keys(groups).sort((a, b) =>
        state.sort === 'grade' ? (Number(a) || 99) - (Number(b) || 99) : a.localeCompare(b));
      flat.innerHTML = keys.map((k) => `<section class="dept-block"><h2>${esc(state.sort === 'grade' ? GRADE[k] ?? `Grade ${k}` : k)}
          <span class="meta">${groups[k].length}</span></h2><ul class="course-list"></ul></section>`).join('')
        || '<div class="empty">No classes match.</div>';
      $$('.course-list', flat).forEach((ul, i) => groups[keys[i]].forEach((li) => ul.append(li.cloneNode(true))));
      $('#by-subject').hidden = true;
      flat.hidden = false;
    }
    const chips = (id, key) => $(id)?.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      $$(`${id} .chip`).forEach((c) => c.setAttribute('aria-pressed', c === b));
      state[key] = b.dataset[key === 'f' ? 'f' : 'sort'];
      apply();
    });
    chips('#filter', 'f');
    chips('#sort', 'sort');
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
      $('#board').innerHTML = sorted.map((r) => `<li><span class="who">${avatarHtml(r)} ${byline(r.display_name, r.school_verified)}
        ${r.role !== 'contributor' ? `<span class="tag">${esc(roleLabel(r.role))}</span>` : ''}
        ${r.grad_year ? `<span class="meta">’${String(r.grad_year).slice(2)}</span>` : ''}</span>
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

  async map() {
    const [map, sections, data] = await Promise.all([
      fetch(root + 'data/map.json').then((r) => r.json()),
      s.approved({ kind: 'teacher_section' }),
      courses(),
    ]);
    const name = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
    // room → [{teacher, course}], from the room numbers in approved teacher sections
    const rooms = {};
    for (const x of sections) {
      const room = (x.payload.room || '').trim().toUpperCase();
      if (!room || !x.course_slug) continue;
      const list = rooms[room] ??= [];
      if (!list.some((y) => y.teacher === x.teacher && y.course === x.course_slug)) list.push({ teacher: x.teacher, course: x.course_slug });
    }
    const roomHtml = (id) => {
      const list = rooms[id.toUpperCase()] || [];
      const teachers = [...new Set(list.map((y) => y.teacher))];
      return `<h3>Room ${esc(id)}</h3>${teachers.length ? teachers.map((t) => `<p><b>${esc(t)}</b><br>${list.filter((y) => y.teacher === t)
        .map((y) => `<a href="${courseUrl(y.course)}">${esc(name[y.course] || y.course)}</a>`).join(' · ')}</p>`).join('')
        : '<p class="meta">Nobody has added this room yet.</p>'}`;
    };

    if (map.image) {
      $('#map-view').innerHTML = `<div class="map-wrap"><div class="map-canvas">
          <img src="${root}${esc(map.image)}" alt="${esc(map.alt || 'Campus map')}">
          ${map.rooms.map((r) => `<button class="pin ${rooms[r.id.toUpperCase()] ? 'has' : ''}" style="left:${Number(r.x)}%;top:${Number(r.y)}%"
            data-room="${esc(r.id)}" aria-label="Room ${esc(r.id)}">${esc(r.label || r.id)}</button>`).join('')}
        </div><aside class="map-panel" id="map-panel"><p class="meta">Tap a room to see who teaches there.</p></aside></div>`;
      $('#map-view').addEventListener('click', (e) => {
        const pin = e.target.closest('.pin');
        if (!pin) return;
        $$('.pin').forEach((p) => p.classList.toggle('on', p === pin));
        $('#map-panel').innerHTML = roomHtml(pin.dataset.room);
      });
    } else {
      $('#map-view').innerHTML = `<div class="card map-soon"><h2>The map is on its way</h2>
        <p>We’re drawing a campus map you can click on. Until then, the room list below shows who teaches where.</p></div>`;
    }
    const ids = Object.keys(rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    $('#room-list').innerHTML = ids.length ? `<div class="rooms">${ids.map((id) => `<div class="room">${roomHtml(id)}</div>`).join('')}</div>`
      : '<div class="empty">No rooms yet. Room numbers appear here once teacher sections include them.</div>';
  },

  async account() {
    const label = { pending: 'Waiting for review', approved: 'Published', changes: 'Needs changes', rejected: 'Not accepted' };
    const thisYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => thisYear - 1 + i);
    const draw = async () => {
      const me = s.user();
      const demoTools = MODE === 'demo' ? `<section class="card"><h2>Demo mode</h2>
        <p>Supabase isn’t connected, so everything here lives only in this browser.</p>
        ${me ? `<p><label>Try the site as: <select id="demo-role">${['contributor', 'trusted', 'reviewer', 'admin'].map((r) =>
          `<option value="${r}" ${me.role === r ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" id="demo-school" ${me.school ? 'checked' : ''}> Pretend this is a school account</label></p>` : ''}
        <p><button class="btn ghost danger" id="demo-reset">Erase demo data</button></p></section>` : '';
      const themeCard = `<section class="card"><h2>Appearance</h2>
        <div class="seg" id="theme-seg" role="radiogroup" aria-label="Theme">${[['system', 'Match my device'], ['light', 'Day'], ['dark', 'Night']]
          .map(([v, l]) => `<button type="button" role="radio" aria-checked="${themePref() === v}" data-theme-pref="${v}">${l}</button>`).join('')}</div>
        <p class="meta">Saved in this browser.</p></section>`;

      if (!me) {
        $('#account').innerHTML = `<p>Sign in to claim bounties, submit work and comment. Reading never needs an account.</p>
          <p><button class="btn js-signin">Sign in${MODE === 'live' ? ' with Google' : ''}</button></p>${themeCard}${demoTools}`;
      } else {
        const [mine, data] = await Promise.all([s.mySubmissions(), courses()]);
        const name = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
        $('#account').innerHTML = `
          <section class="card profile">
            <div class="profile-head">${avatarHtml(me, 'lg')}
              <div><b class="profile-name">${esc(me.name)}</b>${badge(me.school)}
                <div class="meta">${esc(roleLabel(me.role))}${me.grad_year ? ` · Class of ${me.grad_year}` : ''}</div></div></div>
            <p class="meta">${me.school
              ? 'You signed in with your school account, so your work shows the SCUSD ✓ badge.'
              : `You signed in with a personal account.${REVIEWER_ROLES.includes(me.role) ? '' : ' Your comments always go to a reviewer first.'} Sign in with your @scusd.net school account to get the SCUSD ✓ badge.`}</p>
          </section>

          <form id="profile-form" class="card">
            <h2>Profile</h2>
            <div class="field"><label for="dn">Display name</label>
              <div class="hint">Shown on everything you write. Your first name, or a name people know you by.</div>
              <input id="dn" value="${esc(me.name)}" maxlength="40" required></div>
            <div class="field"><span class="flabel">Profile picture</span>
              <div class="hint">Pick an icon and a colour. Photos aren’t allowed, to keep everyone’s privacy.</div>
              <div class="av-grid" id="av-grid" role="radiogroup" aria-label="Profile icon">
                <button type="button" role="radio" data-av="" aria-checked="${!me.avatar}" title="Your initial">${avatarHtml({ ...me, avatar: null }, 'md')}</button>
                ${Object.keys(AVATARS).map((k) => `<button type="button" role="radio" data-av="${k}" aria-checked="${me.avatar === k}" title="${k}">${avatarHtml({ ...me, avatar: k }, 'md')}</button>`).join('')}
              </div>
              <div class="swatches" id="swatches" role="radiogroup" aria-label="Colour">${Object.entries(AVATAR_COLORS).map(([k, hex]) =>
                `<button type="button" role="radio" data-color="${k}" aria-checked="${me.color === k}" title="${k}" style="--sw:${hex}"></button>`).join('')}</div>
            </div>
            <div class="field"><label for="gy">Class of</label>
              <select id="gy"><option value="">Prefer not to say</option>${years.map((y) =>
                `<option ${me.grad_year === y ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
            <label class="check"><input type="checkbox" id="lb" ${me.show_on_leaderboard ? 'checked' : ''}> Show me on the leaderboard</label>
            <button class="btn">Save profile</button>
          </form>

          ${themeCard}

          <section><h2>Your submissions</h2>${mine.length ? `<ul class="subs">${mine.map((x) => `<li>
            <span class="tag st-${x.status}">${label[x.status]}</span> ${esc(KINDS[x.kind].label)}${x.teacher ? ` · ${esc(x.teacher)}` : ''}
            · ${x.course_slug ? `<a href="${courseUrl(x.course_slug)}">${esc(name[x.course_slug] || x.course_slug)}</a>` : 'School info'}
            <span class="meta">${ago(x.created_at)}</span>
            ${x.review_note ? `<div class="note">Reviewer: ${esc(x.review_note)}</div>` : ''}</li>`).join('')}</ul>`
            : `<p class="meta">Nothing yet. <a href="${root}bounties/">Find a bounty</a>.</p>`}</section>

          <section class="card"><h2>Account</h2>
            <p><button type="button" class="btn ghost" id="signout">Sign out</button></p>
            <p class="meta">To delete your account, ask a Wilkipedia admin. See <a href="${root}privacy/">Privacy</a> for what that removes.</p>
          </section>
          ${demoTools}`;

        // live preview while picking
        const pick = { avatar: me.avatar, color: me.color };
        const repaint = () => {
          $$('#av-grid [data-av]').forEach((b) => {
            b.setAttribute('aria-checked', (b.dataset.av || null) === pick.avatar);
            b.innerHTML = avatarHtml({ name: $('#dn').value || me.name, avatar: b.dataset.av || null, color: pick.color }, 'md');
          });
          $$('#swatches [data-color]').forEach((b) => b.setAttribute('aria-checked', b.dataset.color === pick.color));
          $('.profile-head .avatar').outerHTML = avatarHtml({ name: me.name, ...pick }, 'lg');
        };
        $('#av-grid').onclick = (e) => { const b = e.target.closest('[data-av]'); if (b) { pick.avatar = b.dataset.av || null; repaint(); } };
        $('#swatches').onclick = (e) => { const b = e.target.closest('[data-color]'); if (b) { pick.color = b.dataset.color; repaint(); } };
        $('#profile-form').onsubmit = (e) => {
          e.preventDefault();
          const dn = $('#dn').value.trim();
          if (!dn) return;
          guard(() => s.updateProfile({ display_name: dn, avatar: pick.avatar, avatar_color: pick.color,
                                        grad_year: Number($('#gy').value) || null,
                                        show_on_leaderboard: $('#lb').checked }), 'Profile saved.');
        };
        $('#signout').onclick = () => guard(() => s.signOut());
        $('#demo-role')?.addEventListener('change', (e) => guard(() => s.setDemoRole(e.target.value), 'Role switched.'));
        $('#demo-school')?.addEventListener('change', (e) => guard(() => s.setDemoSchool(e.target.checked)));
      }
      $('#theme-seg').onclick = (e) => {
        const b = e.target.closest('[data-theme-pref]');
        if (!b) return;
        setThemePref(b.dataset.themePref);
        $$('#theme-seg [data-theme-pref]').forEach((x) => x.setAttribute('aria-checked', x === b));
      };
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
