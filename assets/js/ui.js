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

let coursesCache;
export function courses() {
  coursesCache ??= fetch(root + 'data/courses.json').then((r) => r.json());
  return coursesCache;
}

// The school-account badge: the account's email is @scusd.net. It says SCUSD,
// not Wilcox, because that's all an email address can prove.
export const badge = (verified) => (verified
  ? ' <span class="badge-school" title="Signed in with a Santa Clara Unified school account">SCUSD ✓</span>' : '');
export const byline = (name, verified) => esc(name) + badge(verified);

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
  const s = await store();
  const paint = (u) => {
    if (!slot) return;
    slot.innerHTML = u
      ? `${REVIEWER_ROLES.includes(u.role) ? `<a href="${root}review/" class="nav-review">Review</a>` : ''}
         <a href="${root}account/" class="who" title="Your account">${esc(u.name)}</a>`
      : `<button class="btn small" id="signin">Sign in</button>`;
    $('#signin', slot)?.addEventListener('click', () => guard(() => s.signIn()));
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

// ── forms ──
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
      input = `<input id="${id}" name="${f.key}" type="${f.type === 'url' ? 'url' : 'text'}" value="${esc(val)}" ${f.required ? 'required' : ''} ${f.type === 'url' ? 'placeholder="https://…"' : ''}>`;
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
