// Every page that isn't a course page, the bounty board, the submit form or the
// review desk. Each page names itself in its #page-data block.

import { initHeader, courses, dataUrl, placeOf, slugify, $, $$, esc, badge, byline, prose, fmtDate, ago, guard, courseUrl, roleLabel, root,
         avatarHtml, AVATARS, AVATAR_COLORS, themePref, setThemePref,
         CLASS_COLORS, classColorOf, classPref, applyClassTheme, classChip } from './ui.js';
import { KINDS, staleness } from './forms.js';
import { MODE, SIZE_POINTS, REVIEWER_ROLES } from './store.js';

const which = JSON.parse($('#page-data')?.textContent || '{}').page;
const s = await initHeader();

import { search, attach, addLive, groupedHtml } from './search.js';
import { mountBellStrip, loadBell, fullHtml } from './bell.js';

// ── subject lists: light up classes that have content ──
async function markContent() {
  const has = await s.contentIndex();
  $$('.course-row').forEach((li) => {
    const on = has.has(li.dataset.slug);
    li.classList.toggle('is-empty', !on);
    $('.status', li).textContent = on ? '' : 'Not written yet';
  });
}

// ── clubs & sports ──
// The official list (data/activities.json, from the Wilcox website) plus what
// students have written, matched by name. Student-added clubs show up too.
async function activities(kind) {
  const [acts, subs] = await Promise.all([
    fetch(dataUrl('data/activities.json')).then((r) => (r.ok ? r.json() : { clubs: [], sports: [] })).catch(() => ({ clubs: [], sports: [] })),
    s.approved({ kind }),
  ]);
  const official = (kind === 'club' ? acts.clubs : acts.sports) || [];
  const byName = {};
  for (const o of official) byName[slugify(o.name)] = { ...o, info: null };
  for (const x of subs) {                     // newest first: first one wins
    const k = slugify(x.payload.name);
    if (!k) continue;
    byName[k] ??= { name: x.payload.name, category: 'Added by students', season: null, levels: [], coaches: [], url: null };
    byName[k].info ??= x;
  }
  const items = Object.entries(byName).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  const groupOf = (o) => (kind === 'club' ? o.category || 'Other' : o.season || 'Season not listed');
  const order = kind === 'club' ? null : ['Fall', 'Winter', 'Spring', 'Season not listed'];
  const groups = [...new Set(items.map(([, o]) => groupOf(o)))].sort((a, b) =>
    order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b));
  if (acts.sources?.length) $('#act-source').innerHTML = `Official list from the <a href="${esc(acts.sources[0])}" target="_blank" rel="noopener">Wilcox website ↗</a>. Details are written by students.`;

  const field = (label, v, cls = '') => (v ? `<div class="fact ${cls}"><div class="label">${label}</div><div class="v">${prose(v)}</div>
    ${cls === 'desc' && v.length > 220 ? '<button type="button" class="linkish more-btn">Show more</button>' : ''}</div>` : '');
  const card = ([k, o]) => {
    const p = o.info?.payload || {};
    const room = p.room ? p.room.toUpperCase().replace(/^ROOM\s*/, '').replace(/[\s-]+/g, '') : null;
    const add = `${root}submit/?kind=${kind}&name=${encodeURIComponent(o.name)}`;
    const body = kind === 'club'
      ? field('What they do', p.what || o.description, 'desc') + field('Meets', p.meets || o.meets)
        + (room ? `<div class="fact"><div class="label">Room</div><div class="v"><a href="${root}map/#${esc(room)}">${esc(p.room)} · on the map</a></div></div>` : '')
        + field('Advisor', p.advisor || o.advisor) + field('How to join', p.join)
      : field('Tryouts', p.tryouts) + field('Practice', p.practice) + field('What it’s like', p.experience) + field('Tips', p.tips)
        + (o.coaches?.length ? field('Coach' + (o.coaches.length > 1 ? 'es' : ''), o.coaches.join(', ')) : '');
    const link = safeLink(p.link) || o.url;
    return `<article class="act-card" id="${esc(k)}" data-group="${esc(groupOf(o))}" data-name="${esc(o.name.toLowerCase())}">
      <header><h3>${esc(o.name)}</h3>${kind === 'sport' && o.levels?.length ? o.levels.map((l) => `<span class="tag">${esc(l)}</span>`).join('') : ''}</header>
      ${body ? `<div class="kv-grid one">${body}</div>` : '<p class="meta">No details yet.</p>'}
      <footer>${o.info ? `<span class="meta">Updated by ${byline(o.info.author, o.info.verified)} · ${esc(p.school_year || '')}</span>` : ''}
        <span class="act-links">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener nofollow">Page ↗</a>` : ''}
        <a href="${add}">${o.info ? 'Update' : 'Add info'}</a></span></footer>
    </article>`;
  };
  const draw = () => {
    const q = $('#act-q').value.trim().toLowerCase();
    const g = $('#act-filter [aria-pressed="true"]')?.dataset.g || 'all';
    const vis = items.filter(([, o]) => (g === 'all' || groupOf(o) === g) && (!q || o.name.toLowerCase().includes(q)));
    $('#act-list').innerHTML = !items.length ? `<div class="empty">Nothing listed yet. <a href="${root}submit/?kind=${kind}">Add the first one</a>.</div>`
      : kind === 'club' ? (vis.length ? `<div class="act-grid">${vis.map(card).join('')}</div>` : '<div class="empty">No matches.</div>')
        : groups.map((grp) => { const list = vis.filter(([, o]) => groupOf(o) === grp);
            return list.length ? `<section class="season"><h2>${esc(grp)}</h2><div class="act-grid">${list.map(card).join('')}</div></section>` : ''; }).join('')
          || '<div class="empty">No matches.</div>';
  };
  $('#act-filter').innerHTML = `<button class="chip" data-g="all" aria-pressed="true">All</button>`
    + groups.map((grp) => `<button class="chip" data-g="${esc(grp)}" aria-pressed="false">${esc(grp)}</button>`).join('');
  $('#act-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    $$('#act-filter .chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
    draw();
  });
  $('#act-q').addEventListener('input', draw);
  $('#act-list').addEventListener('click', (e) => {
    const b = e.target.closest('.more-btn');
    if (!b) return;
    const open = b.closest('.fact').classList.toggle('open');
    b.textContent = open ? 'Show less' : 'Show more';
  });
  draw();
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) { target.classList.add('flash'); target.scrollIntoView({ block: 'center' }); }
}
const safeLink = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

const pages = {
  async home() {
    mountBellStrip($('#bell'));
    attach($('#home-q'), $('#home-results'));
    addLive(s);
    const [recent, data] = await Promise.all([s.recent(6), courses()]);
    const name = Object.fromEntries(data.courses.map((c) => [c.slug, c.name]));
    $('#home-recent').innerHTML = recent.map((x) => { const [where, href] = placeOf(x, name); return `<a href="${href}">
      ${esc(KINDS[x.kind].label)}${x.teacher ? ` · ${esc(x.teacher)}` : ''}: <b>${esc(where)}</b>
      <span class="meta">by ${byline(x.author, x.verified)} · ${ago(x.reviewed_at)}</span></a>`; }).join('')
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
    const input = $('#search-q');
    input.value = new URLSearchParams(location.search).get('q') || '';
    let seq = 0;
    const run = async () => {
      const my = ++seq;
      const q = input.value.trim();
      const r = q ? await search(q, 80) : [];
      if (my !== seq) return;
      history.replaceState(null, '', q ? `?q=${encodeURIComponent(q)}` : location.pathname);
      $('#search-results').innerHTML = !q ? '<p class="meta">Try a class (“apush”), a teacher, a club, a sport, a room (“B204”), or anything students wrote about.</p>'
        : r.length ? `<p class="meta">${r.length} result${r.length === 1 ? '' : 's'}</p>${groupedHtml(r, q)}`
        : `<div class="empty">Nothing matches “${esc(q)}”. Try fewer words, or check the spelling.</div>`;
    };
    input.addEventListener('input', run);
    $('#search-q').form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    await run();          // static index first, so results appear at once
    await addLive(s);     // then include what students have written
    run();
  },


  async leaderboard() {
    const rows = await s.leaderboard();
    let key = 'points';
    const draw = () => {
      const sorted = [...rows].sort((a, b) => b[key] - a[key]).filter((r) => r[key] > 0);
      $('#board').innerHTML = sorted.map((r) => `<li><span class="who">${avatarHtml(r)} ${byline(r.display_name, r.school_verified)}
        ${r.role !== 'contributor' ? `<span class="tag">${esc(roleLabel(r.role))}</span>` : ''}
        ${classChip(r.grad_year)}</span>
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
    const I = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const TOPIC_ICONS = {
      'Bell schedule': I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
      'Counselor appointments': I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M9 15l2 2 4-4"/>'),
      'Passes & attendance': I('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2z"/><path d="M13 6v12" stroke-dasharray="2 2"/>'),
      'Tech & accounts': I('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20M9 16v4M15 16v4"/>'),
      'Clubs & activities': I('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z"/>'),
      'Getting around': I('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
      Other: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    };
    const icon = (t) => `<span class="topic-ico" aria-hidden="true">${TOPIC_ICONS[t] || TOPIC_ICONS.Other}</span>`;
    const list = await s.approved({ kind: 'school_info' });
    const by = {};
    for (const x of list) (by[x.payload.topic] ??= []).push(x);
    const order = KINDS.school_info.fields[0].options.filter((t) => t !== 'Bell schedule' || by[t]);
    $('#school-list').innerHTML = order.map((topic) => `<section class="card topic"><h2>${icon(topic)}${esc(topic)}</h2>
      ${(by[topic] || []).map((x) => {
        const stale = staleness(x);
        return `<article><h3>${icon(topic)}${esc(x.payload.title)}</h3>${prose(x.payload.text)}
          ${stale ? `<div class="stale">${esc(stale)}</div>` : ''}
          <div class="meta">By ${byline(x.author, x.verified)} · checked ${fmtDate(x.reviewed_at)}${x.payload.source ? ` · Source: ${esc(x.payload.source)}` : ''}</div></article>`;
      }).join('') || `<div class="empty">Nothing here yet. <a href="${root}bounties/">Check the bounties</a> or <a href="${root}submit/?kind=school_info">add it</a>.</div>`}
    </section>`).join('');
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
        <h3>Class colour</h3>
        <div class="seg swatch-seg" id="class-seg" role="radiogroup" aria-label="Colour theme">${[['auto', me?.grad_year ? `My class (${CLASS_COLORS[classColorOf(me.grad_year)]})` : 'My class'], ['gold', 'Wilcox gold'],
          ...Object.entries(CLASS_COLORS).map(([k, v]) => [k, v])]
          .map(([v, l]) => `<button type="button" role="radio" aria-checked="${classPref() === v}" data-class-pref="${v}"><span class="sw sw-${v === 'auto' ? classColorOf(me?.grad_year) || 'gold' : v}"></span>${esc(l)}</button>`).join('')}</div>
        <p class="meta">${me?.grad_year ? `Class of ${me.grad_year}’s colour is ${CLASS_COLORS[classColorOf(me.grad_year)]}.` : 'Set your class year in your profile and “My class” uses your class colour.'}
          It shows as a small accent (your picture’s ring and class chip). The site itself stays Wilcox gold.
          Class colours: 2027 Blue · 2028 Green · 2029 Yellow · 2030 Purple.</p>
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
                <div class="meta">${esc(roleLabel(me.role))}${classChip(me.grad_year, true)}</div></div></div>
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
            · ${(([w, h]) => `<a href="${h}">${esc(w)}</a>`)(placeOf(x, name))}
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
      $('#class-seg').onclick = (e) => {
        const b = e.target.closest('[data-class-pref]');
        if (!b) return;
        applyClassTheme(s.user(), b.dataset.classPref);
        $$('#class-seg [data-class-pref]').forEach((x) => x.setAttribute('aria-checked', x === b));
      };
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

  clubs() { return activities('club'); },
  sports() { return activities('sport'); },

  feedback() {
    const hints = { idea: 'What would make Wilkipedia better?', bug: 'What happened, and what did you expect? Which device and browser?',
                    feature: 'What should it do, and who would use it?', other: 'Anything on your mind.' };
    let kind = 'idea';
    $('#fb-kind').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kind]');
      if (!b) return;
      kind = b.dataset.kind;
      $$('#fb-kind [data-kind]').forEach((x) => x.setAttribute('aria-checked', x === b));
      $('#fb-hint').textContent = hints[kind];
    });
    const ref = document.referrer && new URL(document.referrer).origin === location.origin ? new URL(document.referrer).pathname : '';
    if (ref && !ref.includes('/feedback')) $('#fb-page').value = ref;
    $('#fb-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = $('#fb-msg').value.trim();
      if (message.length < 3) { $('#fb-error').textContent = 'Please write a little more.'; $('#fb-error').hidden = false; return; }
      $('#fb-error').hidden = true;
      const ok = await guard(() => s.sendFeedback({ kind, message, page: $('#fb-page').value.trim() || null,
                                                     name: $('#fb-name').value.trim() || s.user()?.name || null }));
      if (!ok) return;
      $('#fb-form').hidden = true;
      $('#fb-done').hidden = false;
    });
    $('#fb-again').onclick = () => { $('#fb-form').reset(); $('#fb-form').hidden = false; $('#fb-done').hidden = true; };
  },

  async credits() {
    const person = (p, sub) => `<div class="person">${avatarHtml(p, 'md')}<div><b>${esc(p.display_name ?? p.name)}</b>${badge(p.school_verified)}${classChip(p.grad_year)}
      <span class="meta">${sub}</span></div></div>`;
    const [team, lb, fb] = await Promise.all([s.team().catch(() => []), s.leaderboard().catch(() => []), s.feedbackCredits().catch(() => [])]);
    const founders = ['Ethan', 'Ethan Liu', 'Jonathan', 'Jonathan Lee'];
    const others = team.filter((p) => p.role === 'reviewer' || !founders.includes(p.display_name));
    $('#cr-team').innerHTML = others.map((p) => person(p, esc(roleLabel(p.role)))).join('')
      || '<p class="meta">Just the founders so far. Want to help review? Ask Ethan.</p>';
    $('#cr-contrib').innerHTML = lb.map((p) => person(p, `${p.approved} contribution${p.approved === 1 ? '' : 's'} · ${p.points} pts`)).join('')
      || '<p class="meta">Be the first: <a href="../bounties/">claim a bounty</a> or <a href="../submit/">add something</a>.</p>';
    $('#cr-feedback').innerHTML = fb.map((f) => `<div class="person"><span class="avatar av-md" style="--av:#6f746c">${esc(f.name.trim().charAt(0).toUpperCase())}</span>
      <div><b>${esc(f.name)}</b><span class="meta">${f.helped} idea${f.helped === 1 ? '' : 's'} or fix${f.helped === 1 ? '' : 'es'} used</span></div></div>`).join('')
      || '<p class="meta">No one yet. Your idea could be first.</p>';
  },

  async bell() {
    mountBellStrip($('#bell'), { expandable: false });
    $('#bell-full').innerHTML = fullHtml(await loadBell());
  },

  static() {},
};

await pages[which]?.();
