// Shared DOM helpers: escaping, the header's sign-in slot, toasts, and the
// form renderer used by the submit page and the course page's quick-add.

import { store, MODE, REVIEWER_ROLES } from './store.js';
import { KINDS, optionsOf } from './forms.js';

export const root = document.body.dataset.root || './';
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Plain text with paragraphs and bare links, never HTML: every string a student
// typed goes through here.
export function prose(s) {
  return esc(s).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener nofollow ugc">$1</a>')}</p>`).join('');
}

export function safeUrl(u) {
  try { const url = new URL(u); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

export function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}
export function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso);
}

export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.className = 'show ' + kind;
  t.textContent = msg;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = ''), 3800);
}

// Runs fn, toasting any error. Resolves to fn's result (or true) on success and
// to undefined on failure, so callers can write `if (!(await guard(...))) return`.
export async function guard(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; }
  catch (e) { console.error(e); toast(e.message || 'Something went wrong.', 'bad'); return undefined; }
}

// Data files carry the build's content hash so a deploy is never half-cached.
const DATA_V = document.querySelector('meta[name="data-version"]')?.content;
export const dataUrl = (path) => root + path + (DATA_V ? `?v=${DATA_V}` : '');

let coursesCache;
export function courses() {
  coursesCache ??= fetch(dataUrl('data/courses.json')).then((r) => r.json());
  return coursesCache;
}

// The school-account badge: the account's email is @scusd.net. It says SCUSD,
// not Wilcox, because that's all an email address can prove.
export const badge = (verified) => (verified
  ? ' <span class="badge-school" title="Signed in with a Santa Clara Unified school account">SCUSD ✓</span>' : '');
export const byline = (name, verified) => esc(name) + badge(verified);

// ── profile pictures ──
// A fixed set of icons and colours: nothing to moderate, no photos of students.
// Keys must match the check constraints on profiles.avatar / avatar_color.
export const AVATARS = {
  fox: '🦊', panda: '🐼', tiger: '🐯', owl: '🦉', turtle: '🐢', octopus: '🐙', frog: '🐸',
  penguin: '🐧', cat: '🐱', dog: '🐶', koala: '🐨', bee: '🐝', bolt: '⚡', rocket: '🚀',
  books: '📚', flask: '🧪', palette: '🎨', music: '🎵', ball: '🏀', star: '⭐',
};
export const AVATAR_COLORS = {
  green: '#2f7a57', blue: '#3a6bb0', purple: '#7a5bb5', red: '#b8504a',
  orange: '#c7772a', teal: '#2a8582', pink: '#b85888', gray: '#6f746c',
};
// Accepts a User ({avatar, color, name}) or a row ({avatar, color, author}).
export function avatarHtml(p, size = 'sm') {
  const label = p.name ?? p.author ?? p.display_name ?? '?';
  const glyph = AVATARS[p.avatar] || esc(label.trim().charAt(0).toUpperCase() || '?');
  const bg = AVATAR_COLORS[p.color ?? p.avatar_color] || AVATAR_COLORS.gray;
  return `<span class="avatar av-${size}${AVATARS[p.avatar] ? ' has-icon' : ''}" style="--av:${bg}" aria-hidden="true">${glyph}</span>`;
}

// ── night mode ──
// "system" follows the device; an explicit choice is remembered per browser.
// tools/build.py puts a tiny script in <head> that applies it before first paint.
const THEME_KEY = 'wilkipedia-theme';
export function themePref() {
  try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; }
}
export function setThemePref(pref) {
  try { pref === 'system' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, pref); }
  catch { /* storage blocked: still applies for this page */ }
  if (pref === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
  paintThemeToggle();
}
const isDark = () => (document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches);
const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';
function paintThemeToggle() {
  const b = $('#theme-toggle');
  if (!b) return;
  const dark = isDark();
  b.innerHTML = dark ? SUN : MOON;
  b.setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to night mode');
  b.title = b.getAttribute('aria-label');
}

export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Where a submission lives, as [label, url]: its class page, a club/team card, or School info.
export function placeOf(x, courseName = {}) {
  if (x.kind === 'club') return [x.payload?.name || 'Club', `${root}clubs/#${slugify(x.payload?.name)}`];
  if (x.kind === 'sport') return [x.payload?.name || 'Sports team', `${root}sports/#${slugify(x.payload?.name)}`];
  if (x.course_slug) return [courseName[x.course_slug] || x.course_slug, `${root}courses/${x.course_slug}/`];
  return ['School info', `${root}school/`];
}

// ── class colours ──
// Each graduating class keeps one colour for four years; the colours rotate, so
// the incoming freshmen inherit the graduating seniors' colour
// (Class of 2027 blue, 2028 green, 2029 yellow, 2030 purple, 2031 blue again).
export const CLASS_COLORS = { blue: 'Blue', green: 'Green', yellow: 'Yellow', purple: 'Purple' };
const ROTATION = ['blue', 'green', 'yellow', 'purple'];
// A small chip in that class's colour, e.g. "’27"
export const classChip = (year, long = false) => (year
  ? ` <span class="class-chip c-${ROTATION[(((year - 2027) % 4) + 4) % 4]}" title="Class of ${year}">${long ? `Class of ${year}` : `’${String(year).slice(2)}`}</span>` : '');
export const classColorOf = (year) => (year ? ROTATION[(((year - 2027) % 4) + 4) % 4] : null);

// Your class colour (a small accent only): 'auto' follows your class year,
// 'gold' is plain Wilcox gold, or pick any class colour. Stored per browser; THEME_BOOT applies the
// resolved value (wilkipedia-class-applied) before first paint.
const CLASS_KEY = 'wilkipedia-class';
export function classPref() { try { return localStorage.getItem(CLASS_KEY) || 'auto'; } catch { return 'auto'; } }
export function applyClassTheme(user, pref = classPref()) {
  try { pref === 'auto' ? localStorage.removeItem(CLASS_KEY) : localStorage.setItem(CLASS_KEY, pref); } catch { /* ignore */ }
  const resolved = pref === 'auto' ? classColorOf(user?.grad_year) : pref === 'gold' ? null : pref;
  if (resolved) document.documentElement.dataset.class = resolved;
  else delete document.documentElement.dataset.class;
  try { resolved ? localStorage.setItem(CLASS_KEY + '-applied', resolved) : localStorage.removeItem(CLASS_KEY + '-applied'); } catch { /* ignore */ }
}

export const courseUrl = (slug) => `${root}courses/${slug}/`;
export const roleLabel = (r) => ({ contributor: 'Contributor', trusted: 'Trusted', reviewer: 'Reviewer', admin: 'Founder' }[r] || r);

// ── header ──
export async function initHeader() {
  const slot = $('#auth');
  if (MODE === 'demo' && !$('.demo-banner')) {
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.innerHTML = `<b>Demo mode.</b> Supabase isn't connected yet, so claims, submissions and comments are saved only in this browser. <a href="${root}account/">Details</a>`;
    document.body.prepend(b);
  }
  // Language picker (Google Translate loads only once a language is chosen)
  import('./translate.js').then((m) => m.initTranslate());

  // Night mode toggle
  paintThemeToggle();
  $('#theme-toggle')?.addEventListener('click', () => setThemePref(isDark() ? 'light' : 'dark'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintThemeToggle);

  // "More" menu: close it when clicking anywhere else or pressing Escape
  document.addEventListener('click', (e) => {
    $$('details.more[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('details.more[open]').forEach((d) => { d.open = false; d.querySelector('summary').focus(); });
  });

  const s = await store();
  const tab = $('#bounty-tab');

  // Header search: live suggestions on every page (loaded on first focus)
  const hs = $('.hsearch input');
  if (hs) hs.addEventListener('focus', () => {
    import('./search.js').then(({ attach, addLive }) => {
      attach(hs, $('.hsearch .results-pop'));
      addLive(s);
      hs.dispatchEvent(new Event('input'));
    });
  }, { once: true });
  // Any "Sign in" button outside the header (home panel, bounty gate…)
  document.addEventListener('click', (e) => {
    if (e.target.closest('.js-signin')) guard(() => s.signIn());
  });
  const paint = async (u) => {
    // .members-only / .guests-only sections switch on this class (style.css)
    document.body.classList.toggle('signed-in', !!u);
    if (u) applyClassTheme(u);
    if (slot) {
      slot.innerHTML = u
        ? `${REVIEWER_ROLES.includes(u.role) ? `<a href="${root}review/" class="nav-review">Review</a>` : ''}
           <a href="${root}account/#notifications" class="note-bell" hidden title="Notifications" aria-label="Notifications">
             <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg><span class="n"></span></a>
           <a href="${root}account/" class="who" title="Your account">${avatarHtml(u)}<span class="who-name">${esc(u.name)}</span></a>`
        : `<button class="btn small" id="signin">Sign in</button>`;
      $('#signin', slot)?.addEventListener('click', () => guard(() => s.signIn()));
    }
    // Unread notifications (edits, published, unpublished…)
    if (u && s.unreadCount) {
      s.unreadCount().then((n) => {
        const b = $('.note-bell', slot);
        if (!b) return;
        b.hidden = !n;
        $('.n', b).textContent = n > 9 ? '9+' : n;
      }).catch(() => {});
    }
    // The bounty board belongs to the review team: its button only appears for them.
    const team = !!u && REVIEWER_ROLES.includes(u.role);
    document.body.classList.toggle('is-team', team);
    if (tab) {
      tab.hidden = !team;
      if (team) {
        try {
          const open = (await s.bounties()).filter((b) => b.status === 'open' && !b.claims.length).length;
          $('.n', tab).textContent = open || '';
        } catch { /* the tab still works without a count */ }
      }
    }
  };
  paint(s.user());
  s.onAuth(paint);
  return s;
}

// Resolves once a user exists, prompting sign-in if needed.
export async function requireUser(s, why = 'to do that') {
  if (s.user()) return s.user();
  toast(`Sign in ${why}.`);
  await s.signIn();
  return s.user();
}

// ── reviewer editing ──
// Opens the submission's own form, filled in, plus a required reason. Saving
// keeps the old version and notifies the author (edit_submission in schema.sql).
export function openEditor(store, sub, onSaved) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<form class="modal-card" role="dialog" aria-modal="true" aria-labelledby="ed-title">
      <div class="lang-top"><div><h2 id="ed-title">Edit ${esc(KINDS[sub.kind]?.label || 'submission')}</h2>
        <p class="meta">By ${esc(sub.author)}. They’ll get a notice with your reason, and the old version is kept.</p></div>
        <button type="button" class="icon-btn lang-x" data-close aria-label="Close">✕</button></div>
      <div id="ed-fields"></div>
      <div class="field"><label for="ed-note">What did you change, and why? <span class="req">*</span></label>
        <div class="hint">The author sees this, e.g. “Fixed a typo in the grading weights”.</div>
        <input id="ed-note" maxlength="500" required></div>
      <p class="error" id="ed-err" hidden></p>
      <div class="r-actions"><button class="btn">Save changes</button><button type="button" class="btn ghost" data-close>Cancel</button></div>
    </form>`;
  document.body.append(wrap);
  const fields = renderFields($('#ed-fields', wrap), sub.kind, sub.payload || {});
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  $('form', wrap).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = (m) => { $('#ed-err', wrap).textContent = m; $('#ed-err', wrap).hidden = false; };
    const missing = fields.check();
    if (missing) return err(missing);
    const note = $('#ed-note', wrap).value.trim();
    if (!note) return err('Please say what you changed and why.');
    const ok = await guard(() => store.editSubmission(sub.id, { ...sub.payload, ...fields.values() }, note), 'Saved. The author has been notified.');
    if (ok) { close(); onSaved?.(); }
  });
  $('#ed-note', wrap).focus();
}

// ── bounty editor (admins) ──
// One dialog for posting a new bounty (b = null) and editing an existing one.
export const BOUNTY_TRACKS = ['Course pages', 'Teacher sections', 'Study guides', 'Resources', 'Summer homework', 'School info', 'Clubs & sports', 'Fix outdated'];
// Rank is urgency and reads S (critical) to D (whenever), the BountyBoard scale.
// It is stored as the priority column: 5 = S … 1 = D.
export const RANKS = { S: { p: 5, label: 'critical' }, A: { p: 4, label: 'high' }, B: { p: 3, label: 'normal' },
                       C: { p: 2, label: 'low' }, D: { p: 1, label: 'whenever' } };
export const rankOf = (priority) => ['D', 'C', 'B', 'A', 'S'][Math.min(5, Math.max(1, priority || 3)) - 1];

export function openBountyEditor(store, b, courseList, onSaved, preset = {}) {
  const isNew = !b;
  b ??= { id: '', title: '', track: 'Course pages', course_slug: null, teacher: '', kind: null, size: 'M', priority: 3, you_get: '', done_means: '', due_on: null, ...preset };
  const courseName = courseList.find((c) => c.slug === b.course_slug)?.name || '';
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<form class="modal-card" role="dialog" aria-modal="true" aria-labelledby="bt-title" id="bounty-form">
      <div class="lang-top"><h2 id="bt-title">${isNew ? 'Post a bounty' : `Edit ${esc(b.id)}`}</h2>
        <button type="button" class="icon-btn lang-x" data-close aria-label="Close">✕</button></div>
      <div class="grid2">
        <div class="field"><label for="bt-id">ID</label><input id="bt-id" name="id" required placeholder="SCI-04" pattern="[A-Za-z]{2,5}-\\d{1,3}" value="${esc(b.id)}" ${isNew ? '' : 'disabled'}></div>
        <div class="field"><label for="bt-track">Track</label><select id="bt-track" name="track">${BOUNTY_TRACKS.map((t) => `<option ${t === b.track ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="bt-t">Title</label><input id="bt-t" name="title" required value="${esc(b.title)}" placeholder="Complete the AP Chemistry page"></div>
      <div class="grid2">
        <div class="field"><label for="bt-c">Class (optional)</label><input id="bt-c" name="course" list="bt-courses" value="${esc(courseName)}" placeholder="Type to search…">
          <datalist id="bt-courses">${courseList.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></div>
        <div class="field"><label for="bt-te">Teacher (optional)</label><input id="bt-te" name="teacher" value="${esc(b.teacher || '')}"></div>
      </div>
      <div class="grid3">
        <div class="field"><label for="bt-k">Suggested kind</label><select id="bt-k" name="kind"><option value="">Any</option>${Object.entries(KINDS).map(([k, d]) => `<option value="${k}" ${k === b.kind ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></div>
        <div class="field"><label for="bt-s">Size</label><select id="bt-s" name="size">${[['S', '~30 min · 10 pts'], ['M', '~2 hrs · 30 pts'], ['L', '~5+ hrs · 60 pts']].map(([v, l]) => `<option value="${v}" ${v === b.size ? 'selected' : ''}>${v} · ${l}</option>`).join('')}</select></div>
        <div class="field"><label for="bt-p">Rank</label><select id="bt-p" name="priority">${Object.entries(RANKS).map(([r, d]) => `<option value="${d.p}" ${d.p === b.priority ? 'selected' : ''}>${r} · ${d.label}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="bt-due">Due (optional)</label><input id="bt-due" name="due_on" type="date" value="${esc(b.due_on || '')}">
        <p class="meta">Dated bounties show up on the Agenda. Leave it blank for “someday”.</p></div>
      <div class="field"><label for="bt-g">You get</label><textarea id="bt-g" name="you_get" rows="2">${esc(b.you_get || '')}</textarea></div>
      <div class="field"><label for="bt-d">Done means</label><textarea id="bt-d" name="done_means" rows="2" required>${esc(b.done_means || '')}</textarea></div>
      <p class="error" id="bt-err" hidden></p>
      <div class="r-actions"><button class="btn">${isNew ? 'Post bounty' : 'Save changes'}</button><button type="button" class="btn ghost" data-close>Cancel</button></div>
    </form>`;
  document.body.append(wrap);
  const f = $('form', wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = (m) => { $('#bt-err', wrap).textContent = m; $('#bt-err', wrap).hidden = false; };
    const name = f.course.value.trim().toLowerCase();
    const course = courseList.find((c) => c.name.toLowerCase() === name);
    if (name && !course) return err('Pick the class from the list, or leave it blank.');
    if (!f.title.value.trim() || !f.done_means.value.trim()) return err('Title and “Done means” are required.');
    const fields = { title: f.title.value.trim(), track: f.track.value, course_slug: course?.slug || null,
      teacher: f.teacher.value.trim() || null, kind: f.kind.value || null, size: f.size.value, priority: Number(f.priority.value),
      you_get: f.you_get.value.trim() || null, done_means: f.done_means.value.trim(), due_on: f.due_on.value || null };
    const ok = isNew
      ? await guard(() => store.postBounty({ id: f.id.value.trim().toUpperCase(), ...fields }), 'Bounty posted.')
      : await guard(() => store.updateBounty(b.id, fields), 'Bounty saved.');
    if (ok) { close(); onSaved?.(); }
  });
  (isNew ? $('#bt-id', wrap) : $('#bt-t', wrap)).focus();
}

// ── drafts ──
// Text in progress is saved to this browser as you type, so switching tabs,
// refreshing or closing by accident never loses it. Cleared on submit.
const DRAFT = 'wilkipedia-draft:';
export const drafts = {
  get(key) { try { return JSON.parse(localStorage.getItem(DRAFT + key)); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(DRAFT + key, JSON.stringify(v)); } catch { /* storage blocked */ } },
  clear(key) { try { localStorage.removeItem(DRAFT + key); } catch { /* ignore */ } },
  // Keep one text box's value (e.g. a comment) across visits
  bind(el, key) {
    if (!el) return;
    const saved = this.get(key);
    if (saved && !el.value) el.value = saved;
    el.addEventListener('input', () => (el.value.trim() ? this.set(key, el.value) : this.clear(key)));
  },
};

// ── forms ──
// Named suggestion lists for fields with `suggest` (e.g. club names), filled by
// the page before it renders a form.
export const suggestions = {};
// Renders KINDS[kind] into `el`. Returns {values(), check()}; check() marks and
// returns the first missing required field.
export function renderFields(el, kind, preset = {}) {
  const def = KINDS[kind];
  el.innerHTML = def.fields.map((f) => {
    const id = `f-${f.key}`;
    const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
    const val = preset[f.key] ?? '';
    let input;
    if (f.type === 'textarea') {
      input = `<textarea id="${id}" name="${f.key}" rows="4" ${f.max ? `maxlength="${f.max}"` : ''} ${f.required ? 'required' : ''}>${esc(val)}</textarea>`;
    } else if (f.type === 'select') {
      input = `<select id="${id}" name="${f.key}" ${f.required ? 'required' : ''}>
        <option value="">Choose…</option>
        ${optionsOf(f).map((o) => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>`;
    } else {
      const list = f.suggest && suggestions[f.suggest] ? `list="dl-${f.key}"` : '';
      input = `<input id="${id}" name="${f.key}" type="${f.type === 'url' ? 'url' : 'text'}" value="${esc(val)}" ${list} autocomplete="off" ${f.required ? 'required' : ''} ${f.type === 'url' ? 'placeholder="https://…"' : ''}>`
        + (list ? `<datalist id="dl-${f.key}">${suggestions[f.suggest].map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
    }
    return `<div class="field"><label for="${id}">${esc(f.label)}${req}</label>
      ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}${input}</div>`;
  }).join('');
  return {
    values() {
      const out = {};
      for (const f of def.fields) {
        const v = $(`[name="${f.key}"]`, el).value.trim();
        if (v) out[f.key] = v;
      }
      return out;
    },
    check() {
      for (const f of def.fields) {
        const input = $(`[name="${f.key}"]`, el);
        const v = input.value.trim();
        const bad = (f.required && !v) || (f.type === 'url' && v && !safeUrl(v));
        input.classList.toggle('invalid', bad);
        if (bad) { input.focus(); return f.type === 'url' && v ? `“${f.label}” needs to be a full link starting with https://` : `“${f.label}” is required.`; }
      }
      return null;
    },
  };
}
