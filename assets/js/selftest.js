// Feature tests (Jonathan's idea: "features can be bugtested efficiently to ensure the website runs
// as intended"). Dashboard → Manage → Feature tests, admins only.
//
//   Automatic checks   every page and data file loads, the database answers, PDFs open, search and
//                      the bell schedule work, the browser can run the 3D campus. All READ-ONLY:
//                      running them never creates a post, a notification or anything anyone sees.
//   Button tests       a "Try it" button for each interactive piece (toasts, confirm, result page,
//                      loading ring, dropdown, night mode), checking itself where it can.
//   Manual checklist   the flows that would write real data, ticked by hand, with the date.
//
// "Copy report" puts the lot on the clipboard to send to whoever is fixing things.

import { toast, popconfirm, showResult, guard, busy, setThemePref, root, esc, courses, dataUrl } from './ui.js';
import { MODE } from './store.js';

const MANUAL_KEY = 'wilkipedia-selftest-manual';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isDark = () => (document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);

// ── the automatic checks: [group, name, fn]. fn returns a short detail string, or throws.
// A returned string starting with "warn:" is shown as a warning, not a failure.
function checks(s) {
  const page = (path, marker) => async () => {
    const r = await fetch(root + path, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    if (marker && !html.includes(marker)) throw new Error(`loaded, but “${marker}” is missing`);
    return `${Math.round(html.length / 1024)} KB`;
  };
  const json = (path, test) => async () => {
    const r = await fetch(dataUrl(path), { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return test(d);
  };
  const count = (x) => (Array.isArray(x) ? x.length : Object.keys(x || {}).length);
  const team = ['reviewer', 'admin'].includes(s.user()?.role);
  return [
    ['Pages', 'Home', page('', 'id="home-q"')],
    ['Pages', 'All classes', page('subjects/', 'id="by-subject"')],
    ['Pages', 'A class page (AP Biology)', page('courses/ap-biology/', 'course.js')],
    ['Pages', 'Teachers', page('teachers/', '<h1')],
    ['Pages', 'Study guides', page('guides/', 'id="gv-chart"')],
    ['Pages', 'Campus map', page('map/', '<h1')],
    ['Pages', '3D campus', page('campus/', 'main.js')],
    ['Pages', 'Bell schedule', page('bell/', '<h1')],
    ['Pages', 'Calendar', page('calendar/', '<h1')],
    ['Pages', 'Cafeteria menu', page('menu/', '<h1')],
    ['Pages', 'Clubs', page('clubs/', '<h1')],
    ['Pages', 'Sports', page('sports/', '<h1')],
    ['Pages', 'Bounty board', page('bounties/', '<h1')],
    ['Pages', 'Contribute form', page('submit/', 'id="kinds"')],
    ['Pages', 'Send feedback', page('feedback/', '<h1')],
    ['Pages', 'Settings', page('settings/', 'id="settings"')],
    ['Pages', 'Community rules', page('rules/', 'No shortcuts around the work')],
    ['Pages', 'Terms, Privacy, Credits', async () => { for (const p of ['terms/', 'privacy/', 'credits/']) await page(p, '<h1')(); return '3 pages'; }],
    ['Data', 'Classes and teachers', json('data/courses.json', (d) => {
      const n = (d.courses || []).length; if (n < 100) throw new Error(`only ${n} classes`);
      return `${n} classes · ${(d.departments || []).length} subjects`; })],
    ['Data', 'Bell schedule', json('data/bell.json', (d) => `${count(d.schedules || d.days || d)} entries`)],
    ['Data', 'Calendar', json('data/calendar.json', (d) => `${count(d.events || d)} events`)],
    ['Data', 'Clubs and sports', json('data/activities.json', (d) => `${(d.clubs || []).length} clubs · ${(d.sports || []).length} teams`)],
    ['Data', 'Campus map', json('data/map.json', (d) => `${count(d.rooms || d.buildings || d)} items`)],
    ['Data', 'Search index', json('data/search.json', (d) => `${count(d)} entries`)],
    ['Database', 'Connection mode', async () => (MODE === 'live' ? 'live (Supabase)' : 'warn:demo mode: this browser only, not the real database')],
    ['Database', 'Signed in', async () => { const u = s.user(); if (!u) throw new Error('not signed in'); return `${u.name} · ${u.role}`; }],
    ['Database', 'Published posts', async () => `${(await s.approved()).length} live`],
    ['Database', 'Bounties', async () => `${(await s.bounties()).length} bounties`],
    ['Database', 'Announcements', async () => `${(await s.announcements()).length} showing`],
    ['Database', 'Your notifications', async () => `${(await s.inboxNotes()).length} notifications`],
    ...(team ? [
      ['Database', 'Review queue', async () => `${(await s.pending()).length} waiting`],
      ['Database', 'Feedback', async () => `${(await s.feedbackList()).length} items`],
      ['Database', 'Members', async () => `${(await s.people()).length} members`],
    ] : []),
    ['Database', 'Study-guide PDFs open', async () => {
      const g = (await s.approved({ kind: 'resource' })).find((x) => x.payload?.pdf?.path);
      if (!g) return 'warn:no PDF study guide is published yet, nothing to test';
      const urls = await s.pdfUrls([g.payload.pdf.path]);
      const u = urls[g.payload.pdf.path];
      if (!u) throw new Error('no link came back for a published PDF');
      if (MODE !== 'live') return 'link made (demo)';
      const r = await fetch(u, { method: 'HEAD' });
      if (!r.ok) throw new Error(`the link answered HTTP ${r.status}`);
      return `“${g.payload.title.slice(0, 40)}” opens`;
    }],
    ['Features', 'Search finds a class', async () => {
      const { search } = await import('./search.js');
      const r = await search('ap biology', 10);
      if (!r.some((x) => /ap-biology/.test(x.u || ''))) throw new Error('“ap biology” didn’t find AP Biology');
      return `${r.length} results`;
    }],
    ['Features', 'Bell schedule for today', async () => {
      const { loadBell, dayPlan, nextSchoolDay } = await import('./bell.js');
      const bell = await loadBell();
      const plan = dayPlan(bell, new Date());
      if (plan?.periods?.length) return `${plan.label || plan.key}: ${plan.periods.length} periods`;
      if (plan?.adjusted) return `adjusted schedule today: ${plan.adjusted}`;
      const next = nextSchoolDay(bell, new Date());
      return next ? `no school today (${plan?.off || 'off'}); the next school day is found` : 'warn:no school day found ahead';
    }],
    ['Features', 'Class list has teachers', async () => {
      const d = await courses();
      const n = d.courses.filter((c) => (c.teachers || []).length).length;
      if (!n) throw new Error('no class has a teacher');
      return `${n} classes with teachers`;
    }],
    ['Browser', 'WebGL (3D campus, home background)', async () => {
      const c = document.createElement('canvas');
      if (!(c.getContext('webgl2') || c.getContext('webgl'))) throw new Error('this browser can’t draw 3D');
      return c.getContext('webgl2') ? 'WebGL 2' : 'WebGL 1';
    }],
    ['Browser', 'Saved settings (localStorage)', async () => {
      localStorage.setItem('wilkipedia-selftest-probe', '1'); const ok = localStorage.getItem('wilkipedia-selftest-probe') === '1';
      localStorage.removeItem('wilkipedia-selftest-probe'); if (!ok) throw new Error('can’t save settings'); return 'works';
    }],
    ['Browser', 'Night-mode ripple (View Transitions)', async () => (document.startViewTransition ? 'supported' : 'warn:not supported: night mode switches without the ripple')],
    ['Browser', 'Online', async () => (navigator.onLine ? 'online' : 'warn:offline')],
  ];
}

// ── button tests: each shows the real component; `auto` checks it appeared ──
const BUTTONS = [
  ['toast', 'Toasts', 'Shows the four kinds of toast (good, info, warn, bad). At most 3 stay on screen at once.', async () => {
    const seen = new Set();                                  // each kind should appear (the site keeps at most 3 up)
    const watch = new MutationObserver(() => document.querySelectorAll('.toast').forEach((t) => seen.add(t.dataset.kind)));
    watch.observe(document.body, { childList: true, subtree: true });
    toast('Good: it worked.', 'good'); await sleep(150); toast('Info: something to know.'); await sleep(150);
    toast('Warn: check this.', 'warn'); await sleep(150); toast('Bad: this is what an error looks like.', 'bad');
    await sleep(300); watch.disconnect();
    const missing = ['good', 'info', 'warn', 'bad'].filter((k) => !seen.has(k));
    if (missing.length) throw new Error(`didn’t appear: ${missing.join(', ')}`);
  }],
  ['loading', 'Progress toast', 'A loading toast that fills up, like a PDF upload.', async () => {
    const t = toast.loading('Uploading test.pdf'); for (let i = 1; i <= 10; i++) { t.progress(i / 10); await sleep(120); } t.done('Uploaded.');
  }],
  ['confirm', 'Confirm pop-up', 'The “Are you sure?” pop-up used before deleting. Answer it to finish the test.', async (btn) => {
    const yes = await popconfirm(btn, { title: 'Delete this test item?', text: 'Nothing is really deleted.', ok: 'Delete', key: null });
    toast(yes ? 'You chose Delete.' : 'You chose Cancel.', 'good');
  }],
  ['result', 'Result page', 'The full-screen “done” page after sending something.', async () => {
    await showResult(null, { status: 'good', title: 'Test finished', text: 'This is the result page. Nothing was sent.', actions: [{ label: 'Back to the tests', primary: true }] });
  }],
  ['busy', 'Loading ring', 'A button that pulses while it waits (1.5 s).', async (btn) => {
    const seen = guard(() => sleep(1500), 'Finished waiting.');
    await sleep(400); const ring = btn.classList.contains('is-loading');
    await seen; if (!ring) throw new Error('the button didn’t show the loading ring');
  }],
  ['bar', 'Top progress bar', 'The thin bar at the top for work without a button.', async () => { await busy(() => sleep(1200)); }],
  ['theme', 'Night mode ripple', 'Switches night mode twice, fast, to show overlapping ripples.', async (btn) => {
    const start = isDark() ? 'dark' : 'light', other = start === 'dark' ? 'light' : 'dark';
    setThemePref(other, btn); await sleep(250); setThemePref(start, btn); await sleep(900);
    if ((isDark() ? 'dark' : 'light') !== start) throw new Error('night mode didn’t come back');
  }],
  ['combo', 'Type-to-search dropdown', 'A dropdown you can type in. Try typing “bio”.', async (btn) => {
    const host = btn.closest('.st-btn').querySelector('.st-demo');
    host.innerHTML = '<select aria-label="Test dropdown"><option>AP Biology</option><option>AP Chemistry</option><option>Biology of the Living Earth</option></select>';
    await sleep(300); if (!host.querySelector('.combo-in')) throw new Error('the dropdown wasn’t turned into a searchable one');
  }],
];

const MANUAL = [
  ['signin', 'Sign in and out', 'Sign out from the account menu, sign back in with Google.'],
  ['post', 'Post something, then remove it', 'Post a tip on a class, approve it in Review → Posts, check the class page, then unpublish it.'],
  ['pdf', 'Upload a PDF study guide', 'Share a small test PDF, open it from Review → Posts, then reject it.'],
  ['sendback', 'Send back and resubmit', 'Send a post back with a note; as the author, “Make changes” and resubmit.'],
  ['reply', 'Reply to feedback', 'Open Feedback → Reply…, send a message, check the sender sees it.'],
  ['bell', 'Bell and calendar on a school day', 'The home “Right now” card shows the current period.'],
  ['campus', '3D campus', 'Walk, fly, open the map, turn on rain and sound.'],
  ['phone', 'On a phone', 'Menu drawer, search, a class page and the Dashboard on a real phone.'],
  ['lang', 'Another language', 'Switch to a language in Settings, then back to English.'],
];

export async function testsTab(panel, s) {
  let manual = {};
  try { manual = JSON.parse(localStorage.getItem(MANUAL_KEY)) || {}; } catch { /* none yet */ }
  const list = checks(s);
  const results = new Map();          // name → { state, detail, ms }
  const btnRes = new Map();
  const icon = { pass: '✓', fail: '✕', warn: '!', run: '…', idle: '' };
  const groups = [...new Set(list.map(([g]) => g))];

  const summary = () => {
    const v = [...results.values()];
    const n = (st) => v.filter((r) => r.state === st).length;
    return v.length ? `${n('pass')} passed · ${n('warn')} warnings · ${n('fail')} failed` : 'Not run yet';
  };
  const draw = () => {
    panel.innerHTML = `<div class="st-head">
        <div><h2 class="st-h">Feature tests</h2><p class="meta">Automatic checks are read-only: running them never posts, notifies or changes anything. ${MODE === 'live' ? '' : '<b>Demo mode</b>: this checks this browser’s copy, not the real site.'}</p></div>
        <div class="st-actions"><button type="button" class="btn" data-run>Run all checks</button><button type="button" class="btn ghost" data-copy>Copy report</button></div></div>
      <p class="st-sum" id="st-sum">${summary()}</p>
      ${groups.map((g) => `<section class="st-sec"><h3 class="st-gh">${esc(g)}</h3><ul class="st-list">${list.filter(([gg]) => gg === g).map(([, name]) => {
        const r = results.get(name) || { state: 'idle' };
        return `<li class="st-row ${r.state}"><span class="st-ic" aria-hidden="true">${icon[r.state]}</span><span class="st-name">${esc(name)}</span>
          <span class="st-detail">${r.detail ? esc(r.detail) : ''}</span><span class="st-ms">${r.ms != null ? `${r.ms} ms` : ''}</span>
          <button type="button" class="linkish" data-one="${esc(name)}">Run</button></li>`; }).join('')}</ul></section>`).join('')}
      <section class="st-sec"><h3 class="st-gh">Buttons and pop-ups</h3><div class="st-btns">${BUTTONS.map(([k, name, desc]) => {
        const r = btnRes.get(k);
        return `<div class="st-btn ${r?.state || ''}"><div><b>${esc(name)}</b><p class="meta">${esc(desc)}</p>${r?.detail ? `<p class="st-err">${esc(r.detail)}</p>` : ''}<div class="st-demo"></div></div>
          <button type="button" class="btn ghost small" data-try="${k}">${r?.state === 'pass' ? '✓ Works' : r?.state === 'fail' ? '✕ Try again' : 'Try it'}</button></div>`; }).join('')}</div></section>
      <section class="st-sec"><h3 class="st-gh">By hand</h3><p class="meta">These write real data, so they’re checked by hand. Tick one when it works; the date is saved in this browser.</p>
        <ul class="st-manual">${MANUAL.map(([k, name, how]) => `<li><label><input type="checkbox" data-man="${k}" ${manual[k] ? 'checked' : ''}>
          <span><b>${esc(name)}</b><span class="meta">${esc(how)}${manual[k] ? ` · checked ${esc(manual[k])}` : ''}</span></span></label></li>`).join('')}</ul></section>`;
  };
  async function runOne(name) {
    const c = list.find(([, n]) => n === name); if (!c) return;
    results.set(name, { state: 'run' }); draw();
    const t0 = performance.now();
    try {
      const d = String(await Promise.race([c[2](), sleep(15000).then(() => { throw new Error('timed out after 15 s'); })]) ?? '');
      results.set(name, { state: d.startsWith('warn:') ? 'warn' : 'pass', detail: d.replace(/^warn:/, ''), ms: Math.round(performance.now() - t0) });
    } catch (e) {
      results.set(name, { state: 'fail', detail: String(e?.message || e), ms: Math.round(performance.now() - t0) });
    }
  }
  async function runAll(btn) {
    btn.disabled = true;
    for (const [, name] of list) { await runOne(name); draw(); }
    const fails = [...results.values()].filter((r) => r.state === 'fail').length;
    toast(fails ? `${fails} check${fails === 1 ? '' : 's'} failed.` : 'Every check passed.', fails ? 'bad' : 'good');
  }
  const report = () => {
    const lines = [`Wilkipedia feature tests · ${new Date().toLocaleString()} · ${MODE} · ${navigator.userAgent.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/)?.[0] || ''}`, summary(), ''];
    for (const g of groups) {
      lines.push(g);
      for (const [gg, name] of list) if (gg === g) { const r = results.get(name); lines.push(`  ${r ? icon[r.state] || '·' : '·'} ${name}${r?.detail ? `: ${r.detail}` : ''}`); }
    }
    lines.push('', 'Buttons');
    for (const [k, name] of BUTTONS) { const r = btnRes.get(k); lines.push(`  ${r ? icon[r.state] : '·'} ${name}${r?.detail ? `: ${r.detail}` : ''}`); }
    lines.push('', 'By hand');
    for (const [k, name] of MANUAL) lines.push(`  ${manual[k] ? '✓' : '·'} ${name}${manual[k] ? ` (${manual[k]})` : ''}`);
    return lines.join('\n');
  };

  draw();
  panel.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if ('run' in t.dataset) return runAll(t);
    if (t.dataset.one) { await runOne(t.dataset.one); return draw(); }
    if ('copy' in t.dataset) {
      try { await navigator.clipboard.writeText(report()); toast('Report copied. Paste it anywhere.', 'good'); }
      catch { toast('Couldn’t copy. Select the page text instead.', 'warn'); }
      return;
    }
    const k = t.dataset.try;
    if (k) {
      const b = BUTTONS.find(([key]) => key === k);
      try { await b[3](t); btnRes.set(k, { state: 'pass' }); } catch (err) { btnRes.set(k, { state: 'fail', detail: String(err?.message || err) }); }
      // update just this card, so a demo inside it (the dropdown) stays usable
      const card = t.closest('.st-btn'), r = btnRes.get(k);
      card.classList.remove('pass', 'fail'); card.classList.add(r.state);
      card.querySelector('.st-err')?.remove();
      if (r.detail) card.querySelector('.meta').insertAdjacentHTML('afterend', `<p class="st-err">${esc(r.detail)}</p>`);
      t.textContent = r.state === 'pass' ? '✓ Works' : '✕ Try again';
    }
  };
  panel.onchange = (e) => {
    const c = e.target.closest('[data-man]'); if (!c) return;
    if (c.checked) manual[c.dataset.man] = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); else delete manual[c.dataset.man];
    try { localStorage.setItem(MANUAL_KEY, JSON.stringify(manual)); } catch { /* storage blocked */ }
    draw();
  };
}
