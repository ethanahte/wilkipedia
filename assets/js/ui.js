// Shared DOM helpers: escaping, the header's sign-in slot, toasts, and the
// form renderer used by the submit page and the course page's quick-add.

import { store, MODE, REVIEWER_ROLES, TERMS_VERSION, canEditOwn, PDF_MAX } from './store.js';
import { KINDS, optionsOf, PERIODS, parseSchedule, schoolYear } from './forms.js';
import { AVATAR_LINES } from './avatar-art.js';

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

// ── toasts (轻提示) ──
// Short messages that stack at the bottom of the screen and go away on their own.
//   toast('Saved.')                          plain; kinds: 'good' (success), 'bad' (error), 'warn', 'info'
//   toast('Deleted.', 'good', { action: { label: 'Undo', run: () => … } })
//   toast.good / .bad / .warn / .info (msg, opts)
//   const t = toast.loading('Uploading…'); … t.done('Uploaded.') or t.fail('It didn’t upload.')
// opts: duration (ms, 0 = stay), id (a toast with the same id is replaced, not stacked), action.
// The same message twice in a row counts up (×2) instead of stacking. Hovering or focusing
// one pauses it. Errors are announced at once to screen readers; the rest politely.
const TOAST_ICON = { good: '✓', bad: '✕', warn: '!', info: 'i', load: '' };
const TOAST_KIND = { success: 'good', error: 'bad', ok: 'good' };
function toastHost() {
  let h = $('#toasts');
  if (!h) {
    h = document.createElement('div'); h.id = 'toasts'; h.className = 'toasts';
    h.innerHTML = '<div class="toasts-polite" aria-live="polite"></div><div class="toasts-urgent" aria-live="assertive"></div>';
    document.body.append(h);
  }
  return h;
}
export function toast(msg, kind = '', opts = {}) {
  kind = TOAST_KIND[kind] || kind || 'info';
  const host = toastHost(), lane = $(kind === 'bad' ? '.toasts-urgent' : '.toasts-polite', host);
  const all = () => $$('.toast', host);
  // the same thing again: count it on the one already showing
  const same = opts.id ? all().find((t) => t.dataset.id === opts.id) : all().find((t) => t.dataset.msg === msg && t.dataset.kind === kind && !t.classList.contains('out'));
  if (same && !opts.id) { const n = Number(same.dataset.n || 1) + 1; same.dataset.n = n; $('.toast-n', same).textContent = `×${n}`; same.restart(); return same.api; }
  if (same) same.remove();
  const t = document.createElement('div');
  t.className = `toast ${kind}`; t.dataset.msg = msg; t.dataset.kind = kind; if (opts.id) t.dataset.id = opts.id;
  t.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  t.innerHTML = `<span class="toast-ic" aria-hidden="true">${TOAST_ICON[kind] ?? ''}</span><span class="toast-msg"></span><span class="toast-n"></span>
    ${opts.action ? '<button type="button" class="toast-act"></button>' : ''}<button type="button" class="toast-x" aria-label="Dismiss">✕</button>`;
  $('.toast-msg', t).textContent = msg;
  if (opts.action) { const b = $('.toast-act', t); b.textContent = opts.action.label; b.onclick = () => { close(); opts.action.run?.(); }; }
  let timer = 0, left = opts.duration ?? (kind === 'bad' ? 6500 : kind === 'load' ? 0 : opts.action ? 6000 : 3600), started = 0;
  const close = () => { clearTimeout(timer); t.classList.add('out'); setTimeout(() => t.remove(), 220); };
  const run = () => { if (!left) return; started = Date.now(); clearTimeout(timer); timer = setTimeout(close, left); };
  const pause = () => { if (!left || !started) return; clearTimeout(timer); left = Math.max(1200, left - (Date.now() - started)); started = 0; };
  t.restart = () => { left = opts.duration ?? 3600; run(); };
  $('.toast-x', t).onclick = close;
  t.addEventListener('mouseenter', pause); t.addEventListener('mouseleave', run);
  t.addEventListener('focusin', pause); t.addEventListener('focusout', run);
  lane.append(t);
  while (all().filter((x) => !x.classList.contains('out')).length > 3) all().find((x) => !x.classList.contains('out')).remove();   // oldest go first
  requestAnimationFrame(() => t.classList.add('in'));
  run();
  // a loading toast turns into its result
  const settle = (k, m) => { t.className = `toast ${k} in`; t.dataset.kind = k; t.setAttribute('role', k === 'bad' ? 'alert' : 'status');
    $('.toast-ic', t).textContent = TOAST_ICON[k]; $('.toast-msg', t).textContent = m; left = k === 'bad' ? 6500 : 3000; run(); };
  // progress(0..1): a bar and a percentage inside the toast (uploads)
  const progress = (f) => {
    let bar = $('.toast-bar', t);
    if (!bar) { t.insertAdjacentHTML('beforeend', '<span class="toast-bar" aria-hidden="true"><i></i></span>'); bar = $('.toast-bar', t); }
    const pct = Math.round(Math.min(1, Math.max(0, f)) * 100);
    $('i', bar).style.width = `${pct}%`;
    $('.toast-n', t).textContent = `${pct}%`;
  };
  t.api = { close, done: (m) => { $('.toast-bar', t)?.remove(); $('.toast-n', t).textContent = ''; settle('good', m); },
            fail: (m) => { $('.toast-bar', t)?.remove(); $('.toast-n', t).textContent = ''; settle('bad', m); }, progress, el: t };
  return t.api;
}
toast.good = (m, o) => toast(m, 'good', o);
toast.bad = (m, o) => toast(m, 'bad', o);
toast.warn = (m, o) => toast(m, 'warn', o);
toast.info = (m, o) => toast(m, 'info', o);
toast.loading = (m, o) => toast(m, 'load', { duration: 0, ...o });

// ── confirm bubbles (popconfirm) ──
// A small bubble next to the button that asks "Are you sure?", instead of the browser's
// OK/Cancel box. `key` offers "Don't ask me again" (kept in this browser; Settings → Pages →
// "Ask before deleting" brings them all back). Leave `key` out for anything big or permanent,
// so it always asks. Resolves to true (go ahead) or false.
//   if (!(await popconfirm(button, { title: 'Delete this comment?', ok: 'Delete', key: 'comment-delete' }))) return;
const NOASK = 'wilkipedia-noconfirm';
export const confirmSkips = () => { try { return JSON.parse(localStorage.getItem(NOASK)) || []; } catch { return []; } };
export const resetConfirms = () => { try { localStorage.removeItem(NOASK); } catch { /* storage blocked */ } };
let lastPress = null, lastPressAt = 0;                  // the button just pressed, when the caller can't say
document.addEventListener('pointerdown', (e) => { lastPress = e.target.closest?.('button, a, select, [role="button"]') || null; lastPressAt = Date.now(); }, true);
export function popconfirm(anchor, { title, text = '', ok = 'Delete', cancel = 'Cancel', danger = true, key = null } = {}) {
  if (key && confirmSkips().includes(key)) return Promise.resolve(true);
  document.querySelector('.popc')?.dispatchEvent(new Event('popc-cancel'));
  anchor = anchor?.isConnected ? anchor : lastPress?.isConnected ? lastPress : document.activeElement !== document.body ? document.activeElement : null;
  return new Promise((resolve) => {
    const el = document.createElement('div'), uid = `popc-${Date.now()}`;
    el.className = 'popc';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-labelledby', `${uid}-t`);
    if (text) el.setAttribute('aria-describedby', `${uid}-d`);
    el.innerHTML = `<span class="popc-arrow" aria-hidden="true"></span>
      <div class="popc-body"><span class="popc-ic ${danger ? 'danger' : ''}" aria-hidden="true">!</span>
        <div><b id="${uid}-t"></b>${text ? `<p id="${uid}-d"></p>` : ''}</div></div>
      ${key ? '<label class="popc-skip"><input type="checkbox"> Don’t ask me again</label>' : ''}
      <div class="popc-act"><button type="button" class="btn ghost small" data-no></button><button type="button" class="btn small ${danger ? 'go-danger' : ''}" data-yes></button></div>`;
    $('b', el).textContent = title;
    if (text) $('p', el).textContent = text;
    $('[data-no]', el).textContent = cancel;
    $('[data-yes]', el).textContent = ok;
    document.body.append(el);
    const place = () => {
      const w = el.offsetWidth, h = el.offsetHeight, r = anchor?.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) {                             // nothing to point at: the middle of the screen
        el.style.left = `${Math.max(8, (innerWidth - w) / 2) + scrollX}px`; el.style.top = `${Math.max(8, (innerHeight - h) / 2) + scrollY}px`;
        el.classList.add('free'); return;
      }
      const below = r.bottom + 10 + h <= innerHeight - 8 || r.top - 10 - h < 8;
      const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
      el.style.left = `${left + scrollX}px`;
      el.style.top = `${(below ? r.bottom + 10 : r.top - 10 - h) + scrollY}px`;
      el.classList.toggle('above', !below);
      $('.popc-arrow', el).style.left = `${Math.min(Math.max(14, r.left + r.width / 2 - left), w - 14)}px`;
    };
    place();
    requestAnimationFrame(() => el.classList.add('in'));
    const done = (v) => {
      if (v && key && $('.popc-skip input', el)?.checked) {
        try { localStorage.setItem(NOASK, JSON.stringify([...new Set([...confirmSkips(), key])])); } catch { /* storage blocked */ }
      }
      removeEventListener('resize', place); document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onOut, true);
      const hadFocus = el.contains(document.activeElement);
      el.remove();
      if (hadFocus && anchor?.isConnected) anchor.focus?.({ preventScroll: true });   // back where you were
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Tab') {                                           // keep Tab inside the bubble
        const f = $$('input, button', el), i = f.indexOf(document.activeElement);
        e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    const onOut = (e) => { if (!el.contains(e.target) && !anchor?.contains?.(e.target)) done(false); };
    addEventListener('resize', place);
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => document.addEventListener('pointerdown', onOut, true));
    el.addEventListener('popc-cancel', () => done(false));
    $('[data-no]', el).onclick = () => done(false);
    $('[data-yes]', el).onclick = () => done(true);
    $(danger ? '[data-no]' : '[data-yes]', el).focus({ preventScroll: true });   // Enter on a danger bubble never deletes by accident
  });
}

// Runs fn, toasting any error. Resolves to fn's result (or true) on success and
// to undefined on failure, so callers can write `if (!(await guard(...))) return`.
// ── the busy bar ──
// A thin gold line across the top of the screen while something is being saved or sent.
// It creeps towards the end while you wait and snaps full when done. Several at once share it.
// guard() shows it for anything slower than a moment; busy(fn) does the same for other work.
let busyN = 0, busyTimer = 0, busyAt = 0;
function busyBar() {
  let b = $('#busybar');
  if (!b) { b = document.createElement('div'); b.id = 'busybar'; b.setAttribute('role', 'progressbar'); b.setAttribute('aria-label', 'Working'); b.innerHTML = '<i></i>'; document.body.append(b); }
  return b;
}
export const progress = {
  start() {
    if (busyN++) return;
    const b = busyBar(), i = $('i', b);
    busyAt = 0.08; b.className = 'on'; i.style.width = '8%';
    clearInterval(busyTimer);
    busyTimer = setInterval(() => { busyAt += (0.9 - busyAt) * 0.08; i.style.width = `${busyAt * 100}%`; }, 250);   // never quite gets there
  },
  done() {
    if (!busyN || --busyN) return;
    clearInterval(busyTimer);
    const b = busyBar(); $('i', b).style.width = '100%'; b.className = 'on end';
    setTimeout(() => { if (!busyN) { b.className = ''; $('i', b).style.width = '0'; } }, 380);
  },
};
// busy(fn): while fn runs (if it's slower than a moment, so quick things don't flicker), the
// button you just pressed pulses its outline ring and can't be pressed again. With no button to
// point at (a keyboard shortcut, something in the background), the busy bar shows instead.
const pressedButton = () => {
  const b = lastPress && Date.now() - lastPressAt < 1500 ? lastPress : document.activeElement;
  return b?.isConnected && b.matches?.('button, .btn, [role="button"], input[type="submit"]') ? b : null;
};
export async function busy(fn) {
  const btn = pressedButton();
  let on = false;
  const t = setTimeout(() => {
    on = true;
    if (btn) { btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); } else progress.start();
  }, 180);
  try { return await fn(); }
  finally {
    clearTimeout(t);
    if (on) { if (btn) { btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); } else progress.done(); }
  }
}

export async function guard(fn, okMsg) {
  try { const r = await busy(fn); if (okMsg) toast(okMsg, 'good'); return r ?? true; }
  catch (e) {
    console.error(e);
    const offline = !navigator.onLine || /failed to fetch|networkerror|load failed/i.test(e.message || '');
    toast(offline ? 'You’re offline, so that didn’t save. Try again when you’re back online.' : e.message || 'Something went wrong.', 'bad');
    return undefined;
  }
}

// Losing the connection gets a toast that stays until it's back
addEventListener('offline', () => toast('You’re offline. Reading still works; saving waits until you’re back.', 'warn', { id: 'net', duration: 0 }));
addEventListener('online', () => { if ($('#toasts .toast[data-id="net"]')) toast('Back online.', 'good', { id: 'net' }); });

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
// On live work: the author (not a reviewer, who has Edit) can send a change for review
// "Suggest an edit" on a live post, for everyone not on the review team (they have Edit, which also
// suggests when the post isn't theirs). Signed-out readers are asked to sign in when they click it.
export const suggestLink = (st, sub) => (canEditOwn(sub) && sub.status === 'approved' && !REVIEWER_ROLES.includes(st.user()?.role)
  ? ` · <button class="linkish" data-suggest="${sub.id}">Suggest an edit</button>` : '');

// ── profile pictures ──
// A fixed set of icons and colours: nothing to moderate, no photos of students.
// Keys must match the check constraints on profiles.avatar / avatar_color.
export const AVATARS = {
  fox: '🦊', panda: '🐼', owl: '🦉', turtle: '🐢', octopus: '🐙', frog: '🐸', penguin: '🐧',
  cat: '🐱', dog: '🐶', koala: '🐨', bee: '🐝', bolt: '⚡', rocket: '🚀', books: '📚',
  flask: '🧪', palette: '🎨', music: '🎵', star: '⭐', rose: '🌹', bulb: '💡', bird: '🐦',
};
// Retired from the picker (nobody had them): tiger, ball. The database still accepts
// them, and a profile that has one shows the member's initial instead.
export const AVATAR_COLORS = {
  green: '#2f7a57', blue: '#3a6bb0', purple: '#7a5bb5', red: '#b8504a',
  orange: '#c7772a', teal: '#2a8582', pink: '#b85888', gray: '#6f746c',
};
// Accepts a User ({avatar, color, name}) or a row ({avatar, color, author}).
// An icon carries both looks: the one-line drawing (default) and the emoji, and
// html[data-avatars] (Settings → Appearance) decides which one shows.
// The red count on the header's Dashboard bell (0 hides it)
export function setNoteCount(n) {
  const b = $('.auth .bell-n'), bell = $('.auth .inbox-btn'), m = $('.auth [data-n="notes"]');
  if (m) { m.textContent = n > 99 ? '99+' : n || ''; m.hidden = !n; }
  if (!b) return;
  b.hidden = !n;
  b.textContent = n > 9 ? '9+' : n || '';
  bell.title = n ? `Dashboard · ${n} new` : 'Dashboard';
  bell.setAttribute('aria-label', bell.title);
}

export function avatarHtml(p, size = 'sm') {
  const label = p.name ?? p.author ?? p.display_name ?? '?';
  const glyph = AVATARS[p.avatar]
    ? `${AVATAR_LINES[p.avatar] ? `<svg class="av-line" viewBox="0 0 64 64"><path pathLength="1" d="${AVATAR_LINES[p.avatar]}"/></svg>` : ''}<span class="av-emoji">${AVATARS[p.avatar]}</span>`
    : esc(label.trim().charAt(0).toUpperCase() || '?');
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
// ── reader settings (saved in this browser; the Settings page controls them) ──
// Each is stored as localStorage 'wilkipedia-<name>' and mirrored on
// html[data-<name>] so CSS can react. THEME_BOOT in build.py applies them before
// first paint. Defaults are stored as "nothing", so a reset is just removal.
export const PREF_DEFAULTS = { text: 'normal', motion: 'system', bell: 'on', fab: 'on', avatars: 'lines', homebg: 'pano' };
export function getPref(name) {
  try { return localStorage.getItem('wilkipedia-' + name) || PREF_DEFAULTS[name]; } catch { return PREF_DEFAULTS[name]; }
}
export function setPref(name, v) {
  const d = document.documentElement.dataset;
  try { v === PREF_DEFAULTS[name] ? localStorage.removeItem('wilkipedia-' + name) : localStorage.setItem('wilkipedia-' + name, v); } catch { /* storage blocked */ }
  if (v === PREF_DEFAULTS[name]) delete d[name]; else d[name] = v;
}
// ── cookie settings ──
// No ads, analytics or tracking cookies. What the site keeps in this browser is
// in three groups; STORAGE_GATE in build.py sorts the keys (window.wkStoreCat)
// and drops writes to a group that's switched off. 'need' can't be switched off.
const COOKIES = 'wilkipedia-cookies';
export function cookiePrefs() {
  try { return { prefs: true, history: true, ...JSON.parse(localStorage.getItem(COOKIES)) }; }
  catch { return { prefs: true, history: true }; }
}
export const storeGroup = (k) => (window.wkStoreCat ? window.wkStoreCat(k) : 'need');
export const storedKeys = (group) => { try { return Object.keys(localStorage).filter((k) => !group || storeGroup(k) === group); } catch { return []; } };
// Switching a group off also deletes what it had saved. Switching settings back
// on saves what this page is using now, so nothing jumps on the next page.
export function setCookiePrefs(patch) {
  const was = cookiePrefs();
  const next = { ...was, ...patch, seen: 1 };
  try { localStorage.setItem(COOKIES, JSON.stringify(next)); } catch { return next; }
  for (const g of ['prefs', 'history']) if (next[g] === false) storedKeys(g).forEach((k) => localStorage.removeItem(k));
  if (next.prefs && !was.prefs) {
    const d = document.documentElement.dataset;
    if (d.theme) localStorage.setItem(THEME_KEY, d.theme);
    for (const k of Object.keys(PREF_DEFAULTS)) if (d[k]) setPref(k, d[k]);
  }
  return next;
}
// A one-time note at the bottom of the page. Not a consent wall: there's
// nothing to consent to, so it only says what's saved and where to change it.
function paintCookieNotice() {
  if (cookiePrefs().seen || $('#settings') || $('.cookie-note')) return;
  try { localStorage.setItem('wilkipedia-cookies-test', '1'); localStorage.removeItem('wilkipedia-cookies-test'); }
  catch { return; }                                  // storage blocked: nothing is saved anyway
  const n = document.createElement('div');
  n.className = 'cookie-note';
  n.setAttribute('role', 'region');
  n.setAttribute('aria-label', 'Cookies');
  n.innerHTML = `<p><b>No tracking here.</b> Wilkipedia has no ads, analytics or tracking cookies. Your browser only keeps your settings, like night mode and text size, so they stick.</p>
    <div class="acts"><a class="btn ghost small" href="${root}settings/#cookies">Cookie settings</a><button type="button" class="btn small">OK</button></div>`;
  n.querySelector('button').onclick = () => { setCookiePrefs({}); n.remove(); };
  document.body.append(n);
}

// Less motion: the reader's choice here, or else their device setting
export const lessMotion = () => {
  const m = getPref('motion');
  return m === 'reduce' || (m === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);
};

// `from` (optional): the button that was clicked. The new theme then grows out
// of it in a circle (View Transitions). Browsers without it, and readers who ask
// for reduced motion, get the instant switch.
//
// Clicking again before a circle finishes (Ethan: "波纹 when you click fast") starts a new one
// straight away without the old one snapping to the end. A new transition always begins from the
// last whole theme, so its clip starts as exactly what was on screen: every band the old circle
// had drawn stays put, and the new circle grows from the centre across them, like ripples in water.
// The screen is described by distance from the centre: `bands` are the radii where the theme flips
// and `outer` says whether the far corners already show the new theme.
const RIPPLE_MS = 650;
const rippleEase = (t) => 1 - Math.pow(1 - t, 3);
let ripple = null;                    // { x, y, R, t0, bands, outer } while a circle is growing
let vtCount = 0;
function rippleClip({ x, y }, bands, outer) {
  const W = innerWidth, H = innerHeight;
  const circle = (r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const d = (outer ? `M-1 -1H${W + 1}V${H + 1}H-1Z` : '') + bands.filter((r) => r > 0).map(circle).join('');
  return `path(evenodd, '${d || 'M0 0Z'}')`;
}
// the region inside radius r, joined with a fixed region {bands, outer}
function withDisc(r, bands, outer) {
  const out = bands.filter((b) => b > r);
  // inside the disc everything is the new theme; just past it, the fixed region decides
  const insideJustPast = outer !== (out.length % 2 === 1);
  if (!insideJustPast) out.unshift(r);
  return { bands: out, outer };
}
export function setThemePref(pref, from) {
  try { pref === 'system' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, pref); }
  catch { /* storage blocked: still applies for this page */ }
  const apply = () => {
    if (pref === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = pref;
    paintThemeToggle();
  };
  if (!from || !document.startViewTransition || lessMotion()) { ripple = null; return apply(); }
  const now = performance.now();
  const r = from.getBoundingClientRect();
  const W = innerWidth, H = innerHeight;
  let x = r.left + r.width / 2, y = r.top + r.height / 2;
  // what the new theme covers at the start: nothing, or (mid-ripple) everything the last one didn't
  let fixed = { bands: [], outer: false };
  if (ripple && now - ripple.t0 < RIPPLE_MS) {
    ({ x, y } = ripple);                                   // keep one centre so the rings stay concentric
    const shown = withDisc(rippleEase((now - ripple.t0) / RIPPLE_MS) * ripple.R, ripple.bands, ripple.outer);
    fixed = { bands: shown.bands, outer: !shown.outer };
  }
  const R = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 2;
  const me = ripple = { x, y, R, t0: now, bands: fixed.bands, outer: fixed.outer };
  const frames = Array.from({ length: 49 }, (_, i) => {
    const k = withDisc(rippleEase(i / 48) * R, fixed.bands, fixed.outer);
    return { clipPath: rippleClip(me, k.bands, k.outer) };
  });
  frames[frames.length - 1] = { clipPath: 'none' };
  document.documentElement.classList.add('theme-vt');
  vtCount++;
  const t = document.startViewTransition(apply);
  t.finished.finally(() => {
    if (--vtCount === 0) document.documentElement.classList.remove('theme-vt');
    if (ripple === me) ripple = null;
  });
  t.ready.then(() => {
    document.documentElement.animate(frames,
      { duration: RIPPLE_MS, easing: 'linear', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
}
const isDark = () => (document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches);
const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';
// Night mode is the sun/moon button in the header (#theme-toggle; CSS picks the icon). Any
// [data-act="theme"] button elsewhere shows the mode it switches to.
function paintThemeToggle() {
  const dark = isDark();
  const b = $('#theme-toggle');
  if (b) { b.setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to night mode'); b.title = dark ? 'Day mode' : 'Night mode'; }
  $$('[data-act="theme"]').forEach((x) => { x.innerHTML = `${dark ? SUN : MOON}<span>${dark ? 'Day mode' : 'Night mode'}</span>`; });
}

// ── room schedules ──
// "Room b-204" / "b204" / "B 204" all mean B204
export const normRoom = (v) => String(v || '').toUpperCase().replace(/^ROOM\s*/, '').replace(/[\s-]+/g, '');

// Class names a schedule may use: the catalog name, plus the everyday names in
// data/course-nicknames.json (`call`, `also`) that Ethan has confirmed. Nothing
// else is guessed: any other text stays unlinked.
const normName = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
// Typed name → class. A 'shared' everyday name is shown only (BSC Biology shows
// as "Biology", but typing "Biology" means Biology of the Living Earth).
export function courseNames(list) {
  const m = new Map();
  for (const c of list) for (const n of [c.name, c.shared ? null : c.call, ...(c.also || []), ...(c.sections || [])]) if (n) m.set(normName(n), c);
  return m;
}
export function courseMatcher(list) {
  const m = courseNames(list);
  return (name) => m.get(normName(name))?.slug || null;
}
// A class name as a link, shown by what students call it ("Biology"), with the
// catalog name on hover
export function classLinker(list) {
  const m = courseNames(list);
  return (name) => {
    const c = m.get(normName(name));
    // a section (Chamber Orchestra) keeps its own name; it links to the course it's listed under
    const section = c?.sections?.find((x) => normName(x) === normName(name));
    if (section) return `<a href="${courseUrl(c.slug)}" title="Listed in the catalog as ${esc(c.name)}">${esc(section)}</a>`;
    return c ? `<a href="${courseUrl(c.slug)}"${c.call ? ` title="${esc(c.name)}"` : ''}>${esc(c.call || c.name)}</a>` : esc(name);
  };
}
// A period with no class: "No class" is saved; these words typed in a Period box mean the same
const NO_CLASS_WORDS = ['no class', 'none', 'free', 'off', 'empty', 'n/a', 'na', '-', '—', 'nothing'];
const NO_CLASS = new RegExp(`^(${NO_CLASS_WORDS.map((w) => w.replace(/[/\\-]/g, '\\$&')).join('|')})$`, 'i');

// The Period boxes' suggestions: suggestions.periods (catalog names, the
// teacher's first) shown by everyday name where there is one
function periodOptions() {
  const m = courseNames(suggestions.courses || []);
  return ['<option value="Prep">', '<option value="No class">', ...(suggestions.periods || []).map((n) => {
    const c = m.get(normName(n));
    if (c?.sections?.some((x) => normName(x) === normName(n))) return `<option value="${esc(n)}">Listed as ${esc(c.name)}</option>`;
    return c?.call && !c.shared ? `<option value="${esc(c.call)}">${esc(c.name)}</option>` : `<option value="${esc(n)}">`;
  })].join('');
}
export function refreshPeriodOptions() { const dl = $('#dl-periods'); if (dl) dl.innerHTML = periodOptions(); }

// One teacher's schedules, newest year first: [{year, periods} | {year, text}].
// Shows this school year's (or the newest, labelled as older), with the rest
// under "Past years". `link(name)` turns a class name into a link where it can.
export function scheduleBlock(list, { add = '', link = (x) => esc(x), rooms = false } = {}) {
  if (!list.length) return `<p class="meta">No schedule yet.${add ? ` <a href="${add}">Add it</a>` : ''}</p>`;
  const now = schoolYear(0);
  const table = (x) => (x.periods
    ? `<ol class="periods">${PERIODS.map((n) => `<li><span class="pn">P${n}</span>${x.periods[n]
      ? (/^prep$/i.test(x.periods[n]) || NO_CLASS.test(x.periods[n]) ? `<span class="meta">${esc(x.periods[n])}</span>` : link(x.periods[n]))
      : '<span class="meta">—</span>'}</li>`).join('')}</ol>`
    : `<p>${esc(x.text)}</p>`);
  const [first, ...past] = list;
  const old = first.year !== now;
  return `<div class="sched">
      <div class="sched-head"><b>${esc(first.year || 'Undated')} schedule</b>${rooms && first.room ? `<span class="meta">Room ${esc(first.room)}</span>` : ''}${old ? `<span class="tag warn">Not this year’s</span>` : ''}</div>
      ${table(first)}
      ${old && add ? `<p class="meta">This is from ${esc(first.year || 'an earlier year')}. Know the ${esc(now)} schedule? <a href="${add}">Add it</a></p>` : ''}
      ${past.length ? `<details class="sched-past"><summary>Past years (${past.length})</summary>${past.map((x) =>
        `<div class="sched-head"><b>${esc(x.year || 'Undated')}</b>${rooms && x.room ? `<span class="meta">Room ${esc(x.room)}</span>` : ''}</div>${table(x)}`).join('')}</details>` : ''}
    </div>`;
}

// Approved room_schedule submissions plus the free-text schedules in older
// teacher sections, grouped as {teacher: {rooms: Set, list: [{year, periods|text}]}},
// one entry per teacher per year (the newest wins), newest year first.
export function collectSchedules(schedules, sections = []) {
  const by = {};
  const put = (teacher, room, year, entry) => {
    const t = (by[teacher] ??= { rooms: new Set(), list: [] });
    if (room) t.rooms.add(normRoom(room));
    if (!entry || t.list.some((x) => x.year === year)) return;
    t.list.push({ year, room: normRoom(room), ...entry });
  };
  for (const x of schedules) if (x.teacher) put(x.teacher, x.payload.room, x.payload.school_year, { periods: x.payload.periods || {} });
  for (const x of sections) {
    if (!x.teacher) continue;
    const text = x.payload.schedule;
    put(x.teacher, x.payload.room, x.payload.school_year, text ? (parseSchedule(text) ? { periods: parseSchedule(text) } : { text }) : null);
  }
  for (const t of Object.values(by)) t.list.sort((a, b) => String(b.year || '').localeCompare(String(a.year || '')));
  return by;
}

// Teachers are listed by last name (Jonathan). The surname is the last word, skipping Jr/Sr/II/III/IV,
// except where the school's own pages show a two-part one: the AVID page lists "Velia Gandara".
// tools/build.py has the same rule for the Teachers page.
const SURNAMES = { 'Velia Gandara Solis': 'Gandara Solis' };
export const surname = (name) => SURNAMES[name]
  || String(name || '').trim().split(/\s+/).filter((w, i, a) => !(i && i === a.length - 1 && /^(jr|sr|ii|iii|iv)\.?$/i.test(w))).pop() || '';
export const byLastName = (a, b) => surname(a).localeCompare(surname(b)) || String(a).localeCompare(String(b));
export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Where a submission lives, as [label, url]: its class page, a club/team card, or School info.
export function placeOf(x, courseName = {}) {
  if (x.kind === 'room_schedule') return [`Room ${x.payload?.room || '?'}`, `${root}map/#${encodeURIComponent(normRoom(x.payload?.room))}`];
  if (x.kind === 'club') return [x.payload?.name || 'Club', `${root}clubs/#${slugify(x.payload?.name)}`];
  if (x.kind === 'sport') return [x.payload?.name || 'Sports team', `${root}sports/#${slugify(x.payload?.name)}`];
  if (x.kind === 'sat') return ['SAT', `${root}sat/#p-${x.id}`];
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

// Pages that aren't classes but have a comment thread (comments.course_slug): [name, path]
export const THREADS = { sat: ['SAT', 'sat/'] };
export const courseUrl = (slug) => `${root}${THREADS[slug]?.[1] || `courses/${slug}/`}`;
export const roleLabel = (r) => ({ contributor: 'Contributor', trusted: 'Trusted', reviewer: 'Reviewer', admin: 'Founder' }[r] || r);

// ── Terms of Service ──
// A signed-in member who hasn't agreed to the current Terms (a new sign-up, or
// the Terms changed) gets this before anything else. It can't be closed: agree,
// or sign out. The database enforces the same (require_terms in migration 012),
// so this is the friendly half. The Terms, rules and Privacy pages stay readable.
function termsGate(s, u) {
  const need = !!u && u.terms != null && u.terms < TERMS_VERSION;
  const open = $('#terms-gate');
  if (!need || /\/(terms|rules|privacy)\/$/.test(location.pathname)) { open?.remove(); document.documentElement.classList.remove('gated'); return; }
  if (open) return;
  const again = u.terms > 0;
  const wrap = document.createElement('div');
  wrap.className = 'modal terms-gate';
  wrap.id = 'terms-gate';
  wrap.innerHTML = `<form class="modal-card" role="dialog" aria-modal="true" aria-labelledby="tg-title">
      <h2 id="tg-title">${again ? 'We updated the Terms' : `Welcome to Wilkipedia, ${esc(u.name)}`}</h2>
      <p>${again ? 'Please read and agree to the new Terms of Service to keep posting.' : 'One step before you start. The short version:'}</p>
      <ul class="tg-list">
        <li><b>About the class, not the person.</b> Nothing mean or personal about teachers or students, and no teacher ratings.</li>
        <li><b>No real tests, quizzes or answer keys.</b> Don't use Wilkipedia to cheat.</li>
        <li><b>Only post what's true and yours to share.</b> Reviewers check everything before it's published.</li>
        <li><b>Your email stays private.</b> Your first name shows next to your work, which can stay on the site after you leave.</li>
      </ul>
      <label class="tg-ok"><input type="checkbox" id="tg-check"> <span>I'm at least 13, and I agree to the <a href="${root}terms/" target="_blank" rel="noopener">Terms of Service</a> and the <a href="${root}rules/" target="_blank" rel="noopener">Community rules</a>.</span></label>
      <div class="tg-acts"><button type="button" class="btn ghost" id="tg-out">Sign out</button>
        <button class="btn" id="tg-agree" disabled>Agree and continue</button></div>
      <p class="meta">Also see how we handle your data: <a href="${root}privacy/" target="_blank" rel="noopener">Privacy</a>.</p>
    </form>`;
  const check = $('#tg-check', wrap), agree = $('#tg-agree', wrap);
  check.onchange = () => { agree.disabled = !check.checked; };
  $('#tg-out', wrap).onclick = () => guard(() => s.signOut());
  $('form', wrap).onsubmit = async (e) => {
    e.preventDefault();
    if (!check.checked) return;
    agree.disabled = true;
    if (!(await guard(() => s.acceptTerms()))) { agree.disabled = false; return; }
    import('./tour.js').then((m) => m.startTour(u.name));   // first sign-in: show them around
  };
  document.body.append(wrap);
  document.documentElement.classList.add('gated');
  check.focus();
}

// ── header ──
export async function initHeader() {
  const slot = $('#auth');
  if (MODE === 'demo' && !$('.demo-banner')) {
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.innerHTML = `<b>Demo mode.</b> Supabase isn't connected yet, so claims, submissions and comments are saved only in this browser. <a href="${root}account/">Details</a>`;
    document.body.prepend(b);
  }
  paintCookieNotice();
  // Language picker (Google Translate loads only once a language is chosen)
  import('./translate.js').then((m) => m.initTranslate());

  // Night mode toggle
  paintThemeToggle();
  $('#theme-toggle')?.addEventListener('click', (e) => setThemePref(isDark() ? 'light' : 'dark', e.currentTarget));
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
  paintAnnouncements(s);

  // Search palette (⌘K). The header box and the phone search button open it.
  const pal = import('./palette.js').then((m) => { m.init(s); return m; });
  const hs = $('.hsearch');
  if (hs) {
    $('.hs-k', hs).textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
    hs.addEventListener('click', (e) => { e.preventDefault(); pal.then((m) => m.open()); });
  }
  $('.search-btn')?.addEventListener('click', (e) => { e.preventDefault(); pal.then((m) => m.open()); });
  wireHeader();
  import('./combo.js').then((m) => m.init());                  // every dropdown can be typed in
  import('./peek.js').then((m) => m.init(s));
  pageTransitions();
  // Any "Sign in" button outside the header (home panel, bounty gate…)
  document.addEventListener('click', (e) => {
    if (e.target.closest('.js-signin')) guard(() => s.signIn());
  });
  const paint = async (u) => {
    // .members-only / .guests-only sections switch on this class (style.css)
    document.body.classList.toggle('signed-in', !!u);
    if (u) applyClassTheme(u);
    if (slot) {
      const isTeam = REVIEWER_ROLES.includes(u?.role);
      // Signed in: the Dashboard bell, and your picture, which opens the account menu
      slot.innerHTML = u
        ? `<a href="${root}dashboard/" class="icon-btn inbox-btn" title="Dashboard" aria-label="Dashboard"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg><span class="who-n bell-n" hidden></span></a>
           <div class="acct"><button type="button" class="who" aria-haspopup="menu" aria-expanded="false" aria-label="Your account menu"><span class="who-av">${avatarHtml(u)}<span class="who-dot" hidden></span></span><span class="who-name">${esc(u.name)}</span><svg class="who-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
             <div class="acct-menu" role="menu" hidden>
               <div class="acct-head">${avatarHtml(u, 'md')}<div><b>${esc(u.name)}</b><span class="meta">${esc(roleLabel(u.role))}</span></div></div>
               <a role="menuitem" href="${root}dashboard/">Dashboard<span class="acct-n" data-n="notes" hidden></span></a>
               ${isTeam ? `<a role="menuitem" href="${root}dashboard/#review">Review queue<span class="acct-n gold" data-n="review" hidden></span></a>` : ''}
               <hr><a role="menuitem" href="${root}account/">Profile</a><a role="menuitem" href="${root}settings/">Settings</a>
               <hr>
               <button type="button" role="menuitem" data-signout>Sign out</button></div></div>`
        : `<button class="btn small" id="signin">Sign in</button>`;
      // a welcome once you're back from signing in (Google's page comes in between, so remember it for this tab)
      $('#signin', slot)?.addEventListener('click', () => { try { sessionStorage.setItem('wilkipedia-hello', '1'); } catch { /* ignore */ } guard(() => s.signIn()); });
      try { if (u && sessionStorage.getItem('wilkipedia-hello')) { sessionStorage.removeItem('wilkipedia-hello'); toast(`Signed in as ${u.name}.`, 'good'); } } catch { /* ignore */ }
      $('[data-signout]', slot)?.addEventListener('click', () => guard(() => s.signOut(), 'Signed out.'));
      paintThemeToggle();
      // what's waiting for the review team shows on the menu and as a dot on your picture
      if (u && isTeam) s.pending().then((l) => { const b = $('[data-n="review"]', slot); if (b) { b.textContent = l.length || ''; b.hidden = !l.length; } $('.who-dot', slot).hidden = !l.length; }).catch(() => {});
    }
    // Unread notifications show as a red count on the Dashboard bell next to your picture.
    if (u && s.unreadCount) s.unreadCount().then(setNoteCount).catch(() => {});
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
  termsGate(s, s.user());
  s.onAuth((u) => termsGate(s, u));
  return s;
}

// ── the header: account menu, phone drawer, scrolling ──
function wireHeader() {
  const header = $('#site-header'), drawer = $('#drawer');
  // Account menu (your picture): opens on click, closes on a click outside or Escape
  document.addEventListener('click', (e) => {
    const who = e.target.closest('.acct .who');
    const menu = $('.acct-menu');
    if (who) { const open = menu.hidden; menu.hidden = !open; who.setAttribute('aria-expanded', open); if (open) $('a, button', menu)?.focus({ preventScroll: true }); return; }
    if (menu && !menu.hidden && !e.target.closest('.acct-menu')) { menu.hidden = true; $('.acct .who')?.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', (e) => {
    const menu = $('.acct-menu');
    if (!menu || menu.hidden) return;
    if (e.key === 'Escape') { menu.hidden = true; $('.acct .who').setAttribute('aria-expanded', 'false'); $('.acct .who').focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = $$('[role="menuitem"]', menu), i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  });
  // Phone drawer (☰): every page, grouped like the More menu
  if (drawer) {
    const btn = $('#menu-btn');
    const set = (open) => {
      if (open) { drawer.hidden = false; requestAnimationFrame(() => drawer.classList.add('open')); $('.drawer-x', drawer).focus(); }
      else { drawer.classList.remove('open'); setTimeout(() => { drawer.hidden = true; }, 220); btn?.focus(); }
      btn?.setAttribute('aria-expanded', open);
      document.documentElement.classList.toggle('drawer-open', open);
    };
    btn?.addEventListener('click', () => set(true));
    drawer.addEventListener('click', (e) => { if (e.target === drawer || e.target.closest('.drawer-x')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) set(false); });
  }
  // Language and night mode buttons, wherever they are (More menu, account menu, drawer)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act="theme"], [data-act="lang"]');
    if (!a) return;
    if (a.dataset.act === 'theme') { setThemePref(isDark() ? 'light' : 'dark', a); paintThemeToggle(); return; }
    e.stopPropagation();
    $$('details.more[open]').forEach((d) => { d.open = false; });
    $('.acct-menu') && ($('.acct-menu').hidden = true);
    if (!drawer?.hidden) $('.drawer-x', drawer)?.click();
    $('#lang-btn')?.click();                                    // translate.js opens its language panel
  });
  // A shadow once the page scrolls under the header; on phones it slides away while you
  // scroll down and comes back as soon as you scroll up
  if (header) {
    let last = scrollY, ticking = false;
    addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = scrollY;
        header.classList.toggle('scrolled', y > 4);
        const phone = innerWidth <= 760, menuOpen = !$('.acct-menu')?.hidden;
        header.classList.toggle('tucked', phone && !menuOpen && y > 120 && y > last + 4);
        if (y < last - 4 || y < 120) header.classList.remove('tucked');
        last = y; ticking = false;
      });
    }, { passive: true });
  }
}

// ── announcement bar ──
// Live announcements sit under the header on every page. Closing one hides it
// in this browser only (a per-reader convenience); admins manage them on
// Dashboard → Announcements.
const DISMISSED = 'wilkipedia-dismissed-announcements';
const dismissed = () => { try { return JSON.parse(localStorage.getItem(DISMISSED)) || []; } catch { return []; } };
export const ANNOUNCE_KINDS = { school: 'School news', site: 'Wilkipedia' };
// A link is either a full http(s) URL or a path on this site ("/summer/")
export const announceHref = (link) => (!link ? null : link.startsWith('/') ? root + link.replace(/^\/+/, '') : safeUrl(link));
export async function paintAnnouncements(s) {
  const bar = $('#announce');
  if (!bar || !s.announcements) return;
  let list = [];
  try { list = await s.announcements(); } catch { return; }   // no table yet, or offline: no bar
  const hidden = new Set(dismissed());
  list = list.filter((a) => !hidden.has(String(a.id))).slice(0, 3);
  bar.hidden = !list.length;
  bar.innerHTML = list.map((a) => {
    const href = announceHref(a.link);
    const ext = href && /^https?:/.test(a.link);
    return `<div class="ann ann-${a.kind}" data-ann="${a.id}"><div class="wrap ann-in">
      <span class="ann-kind">${ANNOUNCE_KINDS[a.kind] || 'News'}</span>
      <p class="ann-msg">${esc(a.message)}${href ? ` <a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>Learn more${ext ? ' ↗' : ' →'}</a>` : ''}</p>
      <button type="button" class="ann-x" aria-label="Hide this announcement">✕</button></div></div>`;
  }).join('');
  bar.onclick = (e) => {
    const x = e.target.closest('.ann-x');
    if (!x) return;
    const row = x.closest('[data-ann]');
    try { localStorage.setItem(DISMISSED, JSON.stringify([...dismissed(), row.dataset.ann].slice(-50))); } catch { /* storage blocked */ }
    row.remove();
    bar.hidden = !bar.children.length;
  };
}

// ── page transitions (cross-document View Transitions, Chrome/Edge) ──
// Pages cross-fade instead of blinking, and a class name you click (in a list,
// the palette or the pathways map) glides into that class page's title. The
// CSS opts in with @view-transition; this names the clicked element just
// before the old page is captured, and skips it all under Reduce motion.
function pageTransitions() {
  let clicked = null;
  document.addEventListener('click', (e) => { clicked = e.target.closest?.('a[href]') || null; }, true);
  addEventListener('pageswap', (e) => {
    if (!e.viewTransition) return;
    if (lessMotion()) { e.viewTransition.skipTransition(); return; }
    const to = e.activation?.entry?.url || '';
    if (clicked && /\/courses\/[^/]+\/?$/.test(new URL(to, location.href).pathname)) {
      const name = clicked.querySelector('text, .c-name, .r-main b, b') || clicked;
      name.style.viewTransitionName = 'class-title';
    }
  });
  addEventListener('pagereveal', (e) => { if (e.viewTransition && lessMotion()) e.viewTransition.skipTransition(); });
  addEventListener('pageshow', () => { document.querySelectorAll('[style*="view-transition-name"]').forEach((x) => { x.style.viewTransitionName = ''; }); });
}

// Resolves once a user exists, prompting sign-in if needed.
export async function requireUser(s, why = 'to do that') {
  if (s.user()) return s.user();
  toast(`Sign in ${why}.`);
  await s.signIn();
  return s.user();
}

// What an edit changed, in words, for the note the author gets: "Added a PDF version; changed the title"
export function describeEdit(kind, before, after, files = {}) {
  const out = [];
  for (const f of KINDS[kind]?.fields || []) {
    const k = f.key, label = f.label.replace(/\s*\(.*\)\s*$/, '').replace(/[?:]$/, '').toLowerCase();
    if (f.type === 'pdf') {
      if (files[k]) out.push(before[k]?.path ? 'replaced the PDF' : 'added a PDF version');
      else if (before[k]?.path && !after[k]) out.push('removed the PDF');
      continue;
    }
    const a = JSON.stringify(before[k] ?? ''), b = JSON.stringify(after[k] ?? '');
    if (a === b) continue;
    // a question-style label ("Who made it?", "What it is good for") reads better quoted
    const what = /\?\s*$/.test(f.label) || /^(what|who|how|which|when|where|why)\b/i.test(f.label)
      ? `“${f.label.replace(/\s*\?\s*$/, '')}”` : `the ${label}`;
    out.push(!before[k] ? `added ${what}` : !after[k] ? `removed ${what}` : `changed ${what}`);
  }
  const s = out.join('; ');
  return s ? s[0].toUpperCase() + s.slice(1) + '.' : '';
}

// ── editing posts ──
// Opens the post's own form, filled in. What saving does depends on who you are and whose post it is
// (Ethan 2026-10-04: anyone can suggest an edit, the review team approves it, the author is told):
//   own        your post, waiting or sent back: edit it (a sent-back one goes back to the reviewers);
//              live: your change waits for review (a reviewer's own live post saves straight away)
//   suggest    someone else's live post, for everyone including reviewers: the edit and a note
//              (written for you from what changed) wait in the review queue; someone else approves
//              it, and the author is notified when it goes live (on_status_notify, migration 021)
//   direct     a reviewer fixing someone else's work that's still waiting for review, with a note
// `mode` is kept for the callers: 'author' from "Suggest an edit", 'reviewer' from "Edit".
export async function openEditor(store, sub, onSaved, mode = 'reviewer') {
  if (!store.user() && !(await requireUser(store, 'to suggest an edit'))) return;
  const me = store.user(), team = REVIEWER_ROLES.includes(me.role);
  const what = (KINDS[sub.kind]?.label || 'submission').toLowerCase();
  const mine = !!sub.user_id && sub.user_id === me.id;
  const live = sub.status === 'approved';
  const how = mine ? (live && team ? 'own-now' : 'own') : live ? 'suggest' : team ? 'direct' : null;
  if (!how) { toast('Only the review team can change work that’s waiting for review.', 'bad'); return; }
  const by = esc(sub.author || 'a former student');
  const [title, blurb, button] = {
    'own-now': [`Edit your ${esc(what)}`, 'You’re on the review team, so your change to your own post goes live right away. The old version is kept.', 'Save changes'],
    own: live ? [`Suggest a change to your ${esc(what)}`, 'Your live version stays on the site until a reviewer approves the change.', 'Send for review']
      : sub.status === 'changes' ? [`Fix your ${esc(what)}`, `A reviewer asked: “${esc(sub.review_note || 'for changes')}”. Saving sends it back to the reviewers.`, 'Resubmit']
      : [`Edit your ${esc(what)}`, 'It’s still waiting for review, so reviewers will see the new version.', 'Save changes'],
    suggest: [`Suggest an edit`, `To ${by}’s ${esc(what)}. ${team ? 'Another reviewer or an admin' : 'A reviewer'} checks it before it goes live, and ${by} gets a notification when it does. The live version stays until then.`, 'Send for review'],
    direct: [`Edit ${esc(KINDS[sub.kind]?.label || 'submission')}`, `By ${by}, waiting for review. They’ll get a notice with the note below, and the old version is kept.`, 'Save changes'],
  }[how];
  const noteBox = how === 'suggest' || how === 'direct';
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<form class="modal-card" role="dialog" aria-modal="true" aria-labelledby="ed-title">
      <div class="lang-top"><div><h2 id="ed-title">${title}</h2>
        <p class="meta">${blurb}</p></div>
        <button type="button" class="icon-btn lang-x" data-close aria-label="Close">✕</button></div>
      <div id="ed-fields"></div>
      ${noteBox ? `<div class="field"><label for="ed-note">${how === 'suggest' ? 'What did you change?' : 'Note for the author'} <span class="req">*</span></label>
        <div class="hint">Written for you from what you change. Add why if it helps${how === 'suggest' ? `: reviewers and ${by} see it` : ', e.g. “Fixed a typo in the grading weights”'}.</div>
        <input id="ed-note" maxlength="500" required></div>` : ''}
      <p class="error" id="ed-err" hidden></p>
      <div class="r-actions"><button class="btn">${button}</button><button type="button" class="btn ghost" data-close>Cancel</button></div>
    </form>`;
  document.body.append(wrap);
  if (KINDS[sub.kind]?.fields.some((f) => f.type === 'periods') && !suggestions.periods?.length) {
    suggestions.courses = (await courses()).courses;
    suggestions.periods = suggestions.courses.flatMap((c) => [c.name, ...(c.sections || [])]);
  }
  const fields = renderFields($('#ed-fields', wrap), sub.kind, sub.payload || {});
  const close = () => wrap.remove();
  const changes = () => describeEdit(sub.kind, sub.payload || {}, fields.values(), fields.files());
  // The note writes itself from what changed ("Added a PDF version.") until you type your own
  const noteEl = $('#ed-note', wrap);
  let typed = false;
  if (noteEl) {
    noteEl.addEventListener('input', () => { typed = !!noteEl.value.trim(); });
    const autoNote = () => { if (!typed) noteEl.value = changes(); };
    $('#ed-fields', wrap).addEventListener('input', autoNote);
    $('#ed-fields', wrap).addEventListener('change', autoNote);
  }
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  $('form', wrap).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = (m) => { $('#ed-err', wrap).textContent = m; $('#ed-err', wrap).hidden = false; };
    const missing = fields.check();
    if (missing) return err(missing);
    const payload = { ...sub.payload, ...fields.values() };
    const files = Object.keys(fields.files()).length;
    if (sub.status !== 'changes' && !files && JSON.stringify(payload) === JSON.stringify(sub.payload)) return err('You haven’t changed anything yet.');
    const note = noteEl ? noteEl.value.trim() : changes() || 'Updated by the author';
    if (noteBox && !note) return err('Please say what you changed.');
    const review = how === 'suggest' || (how === 'own' && (live || sub.status === 'changes'));
    // a new PDF goes up first, into your own folder (migrations 020 and 021 let the post point at it)
    const ok = await guard(async () => {
      await withUploads(store, fields, payload);
      try {
        if (how === 'suggest' || (how === 'own' && live)) return await store.proposeUpdate(sub, payload, how === 'suggest' ? note : null);
        if (how === 'own') return await store.editOwn(sub.id, payload);
        return await store.editSubmission(sub.id, payload, note);
      } catch (x) { throw /isn.t one you uploaded/.test(x.message) ? new Error('Adding a PDF here needs migrations 020 and 021 run in Supabase first.') : x; }
    }, review ? null : how === 'direct' ? 'Saved. The author has been notified.' : 'Saved.');
    if (!ok) return;
    close(); onSaved?.();
    // anything that waits for review gets a clear answer, then back to where you were
    if (review) {
      showResult(null, { status: 'good',
        title: how === 'suggest' ? 'Your edit is with the reviewers' : live ? 'Your change is with the reviewers' : 'Resubmitted. It’s back with the reviewers.',
        text: how === 'suggest' ? `The live version stays as it is until ${team ? 'another reviewer or an admin' : 'a reviewer'} approves your edit. You’ll get a notification either way, and ${by} gets one when it goes live.`
          : live ? 'Your live version stays on the site until a reviewer approves the change. You’ll get a notification either way.'
          : 'You’ll get a notification when they’ve looked again. If you want to explain what you changed, write to them in the conversation.',
        actions: [{ label: 'Back to the page', primary: true }, { label: 'Track it in your Dashboard', href: `${root}dashboard/#work` }] });
    }
  });
  $('#ed-fields input, #ed-fields textarea, #ed-fields select', wrap)?.focus();
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
export const fileSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);

// `files`: {key: File} to put back into PDF pickers when the form is drawn again
export function renderFields(el, kind, preset = {}, files = {}) {
  const def = KINDS[kind];
  // A legacy field only appears when editing something that already has it
  const fields = def.fields.filter((f) => !f.legacy || preset[f.key]);
  // A study guide shared as a link before PDFs existed keeps its link, and needs no PDF
  const legacyLink = fields.some((f) => f.type === 'pdf') && preset.url && !preset.pdf;
  el.innerHTML = fields.map((f) => {
    const id = `f-${f.key}`;
    const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
    const val = preset[f.key] ?? '';
    let input;
    if (f.type === 'courses') {
      input = `<div class="courses-in" id="${id}-box"><div class="cin-chips"></div>
        <input id="${id}" name="${f.key}" list="dl-${f.key}" autocomplete="off" placeholder="Type a class name, then pick it">
        <datalist id="dl-${f.key}"></datalist></div>`;
    } else if (f.type === 'pdf') {
      const cur = val && typeof val === 'object' && val.path ? val : null;
      input = `<div class="pdf-in">${cur ? `<div class="pdf-cur">📄 <a data-pdf="${esc(cur.path)}" href="#" aria-disabled="true" target="_blank" rel="noopener">${esc(cur.name)}</a>
          <span class="meta">${fileSize(cur.size)}</span></div>` : ''}
        <input id="${id}" name="${f.key}" type="file" accept="application/pdf,.pdf">${cur ? '<div class="hint">Choose a file only to replace this one.</div>' : ''}</div>`;
    } else if (f.type === 'periods') {
      const cur = val && typeof val === 'object' ? val : {};
      input = `<div class="periods-in" id="${id}" role="group" aria-label="${esc(f.label)}">${PERIODS.map((n) =>
        `<label${NO_CLASS.test(cur[n] || '') ? ' class="is-none"' : ''}><span>Period ${n}</span><input name="${f.key}.${n}" value="${esc(cur[n] || '')}" list="dl-periods" maxlength="60" autocomplete="off" placeholder="—">`
        + `<button type="button" class="pi-none" data-none="${f.key}.${n}" aria-pressed="${NO_CLASS.test(cur[n] || '')}" title="No class this period">No class</button></label>`).join('')}</div>
        <datalist id="dl-periods">${periodOptions()}</datalist>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" name="${f.key}" rows="4" ${f.max ? `maxlength="${f.max}"` : ''} ${f.required ? 'required' : ''}>${esc(val)}</textarea>`;
    } else if (f.type === 'select') {
      input = `<select id="${id}" name="${f.key}" ${f.required ? 'required' : ''}>
        <option value="">Choose…</option>
        ${optionsOf(f).map((o) => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>`;
    } else {
      const list = f.suggest && suggestions[f.suggest] ? `list="dl-${f.key}"` : '';
      input = `<input id="${id}" name="${f.key}" type="${f.type === 'url' ? 'url' : 'text'}" value="${esc(val)}" ${list} autocomplete="off" ${f.max ? `maxlength="${f.max}"` : ''} ${f.required ? 'required' : ''} ${f.type === 'url' ? 'placeholder="https://…"' : ''}>`
        + (list ? `<datalist id="dl-${f.key}">${suggestions[f.suggest].map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
    }
    return `<div class="field" data-f="${f.key}"><label for="${id}"><span class="lbl">${esc(f.label)}</span>${req}</label>
      <div class="hint"${f.hint ? '' : ' hidden'}>${esc(f.hint || '')}</div>${input}</div>`;
  }).join('');
  // Fields that depend on another one (`when`: only then; `whenAlt`: then optional, relabelled)
  const valueOf = (k) => $(`[name="${k}"]`, el)?.value;
  const on = (w) => !!w && valueOf(w[0]) === w[1];
  const curPdf = (f) => (preset[f.key] && typeof preset[f.key] === 'object' && preset[f.key].path ? preset[f.key] : null);
  const chosen = (f) => $(`[name="${f.key}"]`, el)?.files?.[0] || null;
  const shown = (f) => !f.when || on(f.when);
  const needed = (f) => {
    if (!shown(f)) return false;
    if (f.type === 'pdf') return f.required && !legacyLink;
    if (on(f.whenAlt)) return legacyLink && !fields.some((g) => g.type === 'pdf' && chosen(g));
    return f.required;
  };
  const apply = () => {
    for (const f of fields) {
      const box = $(`[data-f="${f.key}"]`, el);
      box.hidden = !shown(f);
      if (!f.whenAlt) continue;
      // a link-only guide getting its PDF: from now on the link is the optional live version
      const alt = on(f.whenAlt) && (!legacyLink || fields.some((g) => g.type === 'pdf' && chosen(g)));
      $('.lbl', box).textContent = alt ? f.whenAlt[2] : f.label;
      $('.req', box)?.toggleAttribute('hidden', alt);
      const h = $('.hint', box); h.textContent = alt ? f.whenAlt[3] : f.hint || ''; h.hidden = !h.textContent;
      $(`[name="${f.key}"]`, el).required = !alt && !!f.required;
    }
  };
  // Class pickers: chosen classes are chips (click one to take it off); names come from the catalog
  const picked = {};
  let catalog = [];
  const nameOf = (slug) => catalog.find((c) => c.slug === slug)?.name || slug;
  const findClass = (text) => { const t = text.trim().toLowerCase(); return t && catalog.find((c) => c.name.toLowerCase() === t || (c.call || '').toLowerCase() === t); };
  const paintChips = (f) => {
    $(`#f-${f.key}-box .cin-chips`, el).innerHTML = picked[f.key].map((slug) =>
      `<button type="button" class="chip" aria-pressed="true" data-slug="${esc(slug)}" aria-label="Remove ${esc(nameOf(slug))}">${esc(nameOf(slug))} <span aria-hidden="true">✕</span></button>`).join('');
    $(`[name="${f.key}"]`, el).disabled = picked[f.key].length >= (f.max || 3);
  };
  const addTyped = (f) => {
    const input = $(`[name="${f.key}"]`, el), c = findClass(input.value);
    if (!c) return false;
    if (!picked[f.key].includes(c.slug) && picked[f.key].length < (f.max || 3)) picked[f.key].push(c.slug);
    input.value = '';
    paintChips(f);
    return true;
  };
  for (const f of fields.filter((x) => x.type === 'courses')) {
    picked[f.key] = Array.isArray(preset[f.key]) ? [...preset[f.key]] : [];
    const input = $(`[name="${f.key}"]`, el);
    input.addEventListener('change', () => addTyped(f));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(f); } });
    $(`#f-${f.key}-box .cin-chips`, el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-slug]'); if (!b) return;
      picked[f.key] = picked[f.key].filter((x) => x !== b.dataset.slug);
      paintChips(f); input.dispatchEvent(new Event('input', { bubbles: true }));   // so drafts notice
    });
    paintChips(f);
  }
  if (fields.some((f) => f.type === 'courses')) courses().then((d) => {
    catalog = d.courses;
    for (const f of fields.filter((x) => x.type === 'courses')) {
      $(`#dl-${f.key}`, el).innerHTML = catalog.map((c) => `<option value="${esc(c.name)}">`).join('');
      paintChips(f);
    }
  });
  for (const [k, file] of Object.entries(files)) {
    const input = $(`[name="${k}"][type="file"]`, el);
    if (input && file) { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; }
  }
  el.addEventListener('change', (e) => { if (e.target.type === 'file' || fields.some((f) => (f.when || f.whenAlt)?.[0] === e.target.name)) apply(); });
  // Period boxes: "No class" fills in (or clears) that period, so an empty period can be said out loud
  const paintNone = (input) => {
    const on = NO_CLASS.test(input.value.trim());
    input.closest('label').classList.toggle('is-none', on);
    input.nextElementSibling?.setAttribute('aria-pressed', on);
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-none]'); if (!b) return;
    e.preventDefault();
    const input = $(`[name="${b.dataset.none}"]`, el);
    input.value = NO_CLASS.test(input.value.trim()) ? '' : 'No class';
    input.classList.remove('invalid');
    paintNone(input);
    input.dispatchEvent(new Event('input', { bubbles: true }));   // so drafts notice
  });
  el.addEventListener('input', (e) => { if (e.target.matches?.('.periods-in input')) paintNone(e.target); });
  apply();
  linkPdfs(el);
  // Period boxes take a class's catalog name or an approved everyday name, or
  // "Prep", and save the catalog name. A section (Chamber Orchestra) is its own
  // class, so it keeps its own name.
  const canon = () => {
    const m = new Map([['prep', 'Prep'], ...NO_CLASS_WORDS.map((w) => [w, 'No class']), ...(suggestions.periods || []).map((n) => [n.toLowerCase(), n])]);
    for (const [k, c] of courseNames(suggestions.courses || [])) m.set(k, c.sections?.find((x) => normName(x) === k) || c.name);
    return m;
  };
  const periodsOf = (f) => {
    const c = canon();
    return Object.fromEntries(PERIODS.map((n) => [n, $(`[name="${f.key}.${n}"]`, el).value.trim().replace(/\s+/g, ' ')])
      .filter(([, v]) => v).map(([n, v]) => [n, c.get(v.toLowerCase()) || v]));
  };
  return {
    values() {
      const out = {};
      for (const f of fields) {
        if (!shown(f)) continue;
        if (f.type === 'pdf') { if (curPdf(f)) out[f.key] = curPdf(f); continue; }   // a new file is uploaded on submit
        if (f.type === 'courses') { if (picked[f.key].length) out[f.key] = [...picked[f.key]]; continue; }
        if (f.type === 'periods') { const v = periodsOf(f); if (Object.keys(v).length) out[f.key] = v; continue; }
        const v = $(`[name="${f.key}"]`, el).value.trim();
        if (v) out[f.key] = v;
      }
      return out;
    },
    // New PDFs picked in this form, {key: File}: upload them with withUploads() before saving
    files() {
      return Object.fromEntries(fields.filter((f) => f.type === 'pdf' && shown(f) && chosen(f)).map((f) => [f.key, chosen(f)]));
    },
    check() {
      for (const f of fields) {
        if (!shown(f)) continue;
        if (f.type === 'courses') {
          const input = $(`[name="${f.key}"]`, el);
          const bad = input.value.trim() && !addTyped(f) ? `Pick “${input.value.trim()}” from the class list, or clear it.` : null;
          input.classList.toggle('invalid', !!bad);
          if (bad) { input.focus(); return bad; }
          continue;
        }
        if (f.type === 'pdf') {
          const input = $(`[name="${f.key}"]`, el), file = chosen(f);
          const bad = file && file.size > PDF_MAX ? `That PDF is ${fileSize(file.size)}. The limit is 5 MB.`
            : file && !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf' ? 'Choose a PDF file (File → Download → PDF in Google Docs).'
            : needed(f) && !file && !curPdf(f) ? 'Upload the study guide as a PDF.' : null;
          input.classList.toggle('invalid', !!bad);
          if (bad) { input.focus(); return bad; }
          continue;
        }
        if (f.type === 'periods') {
          const vals = periodsOf(f);
          const bad = f.required && !Object.keys(vals).length;
          $(`#f-${f.key}`, el).classList.toggle('invalid', bad);
          if (bad) { $(`[name="${f.key}.1"]`, el).focus(); return 'Fill in at least one period.'; }
          const names = suggestions.periods || [];
          $$(`#f-${f.key} input`, el).forEach((i) => i.classList.remove('invalid'));
          if (!names.length) continue;                    // catalog not loaded: nothing to check against
          const c = canon();
          for (const [n, v] of Object.entries(vals)) {
            if (c.has(v.toLowerCase())) continue;
            const input = $(`[name="${f.key}.${n}"]`, el);
            input.classList.add('invalid');
            input.focus();
            const words = v.toLowerCase().split(/\s+/);
            const near = (suggestions.courses || []).filter((x) => words.every((w) => `${x.name} ${x.call || ''}`.toLowerCase().includes(w)))
              .slice(0, 3).map((x) => x.call || x.name);
            return `Period ${n}: “${v}” isn’t a full class name. Pick it from the list${near.length ? ` (maybe ${near.join(' or ')}?)` : ''}, type Prep, or press No class.`;
          }
          continue;
        }
        const input = $(`[name="${f.key}"]`, el);
        const v = input.value.trim();
        const bad = (needed(f) && !v) || (f.type === 'url' && v && !safeUrl(v));
        input.classList.toggle('invalid', bad);
        if (bad) { input.focus(); return f.type === 'url' && v ? `“${f.label}” needs to be a full link starting with https://` : `“${f.label}” is required.`; }
      }
      return null;
    },
  };
}

// ── result pages ──
// One clear answer after something big (sent a post, sent feedback, resubmitted): a large
// icon, what happened, what happens next, and where to go. In a container (it replaces what's
// there) or, with no container, as a full-screen sheet over the page.
//   showResult(null, { status: 'good', title: 'Sent for review', text: '…',
//                      actions: [{ label: 'Back to the page', primary: true }, { label: 'Open your Dashboard', href: root + 'dashboard/' }] })
// status: good | bad | warn | info. An action is a link (href), a function (run), or neither
// (it just closes the sheet). Resolves when the sheet closes.
const RESULT_ICON = { good: '✓', bad: '✕', warn: '!', info: 'i' };
export function showResult(container, { status = 'good', title, text = '', note = '', actions = [] } = {}) {
  const sheet = !container;
  const wrap = document.createElement('div');
  wrap.className = `result-page ${status}${sheet ? ' result-sheet' : ''}`;   // not `result`: that's a search suggestion
  if (sheet) { wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); }
  wrap.setAttribute('aria-labelledby', 'result-t');
  wrap.innerHTML = `<div class="result-card"><div class="result-ic" aria-hidden="true">${RESULT_ICON[status] || '✓'}</div>
      <h2 id="result-t"></h2>${text ? '<p class="result-text"></p>' : ''}${note ? '<p class="result-note meta"></p>' : ''}
      <div class="result-act">${actions.map((a, i) => a.href
        ? `<a class="btn ${a.primary ? '' : 'ghost'}" data-i="${i}" href="${esc(a.href)}">${esc(a.label)}</a>`
        : `<button type="button" class="btn ${a.primary ? '' : 'ghost'}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;
  $('h2', wrap).textContent = title;
  if (text) $('.result-text', wrap).textContent = text;
  if (note) $('.result-note', wrap).textContent = note;
  return new Promise((resolve) => {
    const close = () => { if (sheet) { wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', onKey); } resolve(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const a = actions[Number(b.dataset.i)];
      if (a.href) return;                                     // a real link: let it go
      if (a.run) a.run();
      if (sheet || a.close !== false) close();
    });
    if (sheet) { document.body.append(wrap); document.addEventListener('keydown', onKey); requestAnimationFrame(() => wrap.classList.add('in')); }
    else { container.replaceChildren(wrap); container.hidden = false; }
    ($('.result-act .btn', wrap) || wrap).focus?.({ preventScroll: !sheet });
  });
}

// Upload the PDFs picked in a form (see files()) and put where they went into the payload
export async function withUploads(st, form, payload) {
  for (const [k, file] of Object.entries(form.files?.() || {})) {
    const t = toast.loading(`Uploading ${file.name}`);
    t.progress(0);
    try { payload[k] = await st.uploadPdf(file, (f) => t.progress(f)); t.done('Uploaded.'); }
    catch (e) { t.close(); throw e; }
  }
  return payload;
}

// Point every <a data-pdf="path"> under el at a short-lived link to that file. A file this
// viewer may not open (or that's missing) stays a dead link with a note.
export async function linkPdfs(el, st = null) {
  const links = $$('a[data-pdf]', el);
  if (!links.length) return;
  if (!el.dataset.pdfWired) {
    el.dataset.pdfWired = '1';
    el.addEventListener('click', (e) => { if (e.target.closest('a[data-pdf][aria-disabled="true"]')) e.preventDefault(); });
  }
  let urls = {};
  try { urls = await (st || await store()).pdfUrls([...new Set(links.map((a) => a.dataset.pdf))]); } catch { /* leave them dead */ }
  for (const a of links) {
    const u = urls[a.dataset.pdf];
    if (u) { a.href = u; a.setAttribute('aria-disabled', 'false'); a.removeAttribute('title'); }
    else a.title = 'This PDF isn’t available right now';
  }
}
