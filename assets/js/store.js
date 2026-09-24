// The data layer. Every page talks to `await store()` and never to Supabase
// directly, so the same pages run against two back ends:
//
//   live — Supabase (config.js filled in). Rules enforced by supabase/schema.sql.
//   demo — localStorage in this browser only. Mirrors the live rules so the
//          whole flow (claim → submit → review → publish) can be tried before
//          the database exists.
//
// Every method returns plain objects in the shapes documented below.
//   User       {id, name, role, school, avatar, color, grad_year, show_on_leaderboard}
//              school = signed in with an @scusd.net account
//   Bounty     {id, title, track, course_slug, teacher, size, priority (5 = rank S … 1 = D),
//               you_get, done_means, due_on, status ('open' | 'done' | 'closed'), closed_at,
//               created_at, claims: [{user_id, name, expires_at}]}
//   Work       {bounty_id, user_id, author, reviewed_at}   approved submissions made for a bounty
//   Submission {id, user_id, author, verified, avatar, color, bounty_id, course_slug, kind, teacher, payload,
//               status, review_note, reviewed_at, created_at}
//   Comment    {id, course_slug, user_id, author, verified, avatar, color, parent_id, prompt, body, status,
//               created_at, likes, liked}
//   Report     {id, kind, course_slug, target, note, author, resolved, created_at}
//   Leader     {id, display_name, role, points, semester_points, approved, school_verified,
//               avatar, avatar_color, grad_year}
//
// `author` is "Former student" when the account behind a contribution was deleted.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const MODE = SUPABASE_URL && SUPABASE_KEY ? 'live' : 'demo';
export const SIZE_POINTS = { S: 10, M: 30, L: 60 };
export const REVIEWER_ROLES = ['reviewer', 'admin'];
export const TRUSTED_ROLES = ['trusted', 'reviewer', 'admin'];

// Mirrors on_comment_insert() in schema.sql: personal accounts are always reviewed.
export const postsInstantly = (u) => REVIEWER_ROLES.includes(u.role) || (u.role === 'trusted' && !!u.school);
const FORMER = 'Former student';

// The profile columns a user may edit (see the column grant in schema.sql).
export const PROFILE_FIELDS = ['display_name', 'avatar', 'avatar_color', 'grad_year', 'show_on_leaderboard'];
const toUser = (p) => ({ id: p.id, name: p.display_name, role: p.role, school: !!p.school_verified,
                         avatar: p.avatar ?? null, color: p.avatar_color || 'green',
                         grad_year: p.grad_year ?? null, show_on_leaderboard: p.show_on_leaderboard !== false });

let pending = null;
export function store() {
  if (!pending) pending = MODE === 'live' ? live() : demo();
  return pending;
}

const now = () => new Date().toISOString();
const active = (c) => new Date(c.expires_at) > new Date();

// ───────────────────────────── live ─────────────────────────────
async function live() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const listeners = new Set();
  let me = null;

  async function loadMe(session) {
    if (!session) { me = null; return; }
    const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    me = toUser(data || { id: session.user.id, display_name: 'New member', role: 'contributor' });
  }
  const { data: { session } } = await sb.auth.getSession();
  await loadMe(session);
  // supabase-js deadlocks if the auth callback awaits another query directly.
  // Supabase re-announces the session whenever the tab regains focus or the
  // token refreshes. Only tell pages when the user really changed; otherwise
  // they'd redraw and wipe whatever someone was typing.
  sb.auth.onAuthStateChange((_event, s) => {
    setTimeout(async () => {
      const before = JSON.stringify(me);
      await loadMe(s);
      if (JSON.stringify(me) !== before) listeners.forEach((f) => f(me));
    }, 0);
  });

  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const withAuthor = (r) => ({ ...r, author: r.profiles?.display_name ?? FORMER,
                                verified: !!r.profiles?.school_verified, avatar: r.profiles?.avatar ?? null,
                                color: r.profiles?.avatar_color ?? 'gray', profiles: undefined });
  // Name the foreign key in every embed: comments and profiles are also linked
  // through comment_likes, and an unnamed embed is then ambiguous (HTTP 300).
  const WHO = 'display_name, school_verified, avatar, avatar_color';
  const SUB = `*, profiles!submissions_user_id_fkey(${WHO})`;

  return {
    mode: 'live',
    user: () => me,
    onAuth: (f) => listeners.add(f),
    async signIn() {
      ok(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } }));
    },
    async signOut() { await sb.auth.signOut(); },
    async updateProfile(fields) {
      const row = Object.fromEntries(Object.entries(fields).filter(([k]) => PROFILE_FIELDS.includes(k)));
      const data = ok(await sb.from('profiles').update(row).eq('id', me.id).select('*').single());
      me = toUser(data);
      listeners.forEach((f) => f(me));
    },

    async bounties() {
      const rows = ok(await sb.from('bounties')
        .select('*, claims(user_id, expires_at, profiles(display_name))')
        .order('priority', { ascending: false }).order('id'));
      return rows.map((b) => ({
        ...b,
        claims: b.claims.filter(active)
          .map((c) => ({ user_id: c.user_id, name: c.profiles?.display_name, expires_at: c.expires_at })),
      }));
    },
    async claim(bounty_id) { ok(await sb.from('claims').insert({ bounty_id })); },
    async unclaim(bounty_id) {
      ok(await sb.from('claims').delete().eq('bounty_id', bounty_id).eq('user_id', me.id));
    },
    async postBounty(b) { ok(await sb.from('bounties').insert(b)); },
    async setBountyStatus(id, status) { ok(await sb.from('bounties').update({ status }).eq('id', id)); },
    async updateBounty(id, fields) { ok(await sb.from('bounties').update(fields).eq('id', id)); },
    // Who finished what: approved submissions made for a bounty (the Ledger)
    async bountyWork() {
      return ok(await sb.from('submissions')
        .select('bounty_id, user_id, reviewed_at, profiles!submissions_user_id_fkey(display_name)')
        .eq('status', 'approved').not('bounty_id', 'is', null))
        .map((r) => ({ bounty_id: r.bounty_id, user_id: r.user_id, reviewed_at: r.reviewed_at,
                       author: r.profiles?.display_name ?? FORMER }));
    },

    async submit(s) { ok(await sb.from('submissions').insert({ ...s, user_id: me.id })); },
    async mySubmissions() {
      return ok(await sb.from('submissions').select(SUB).eq('user_id', me.id)
        .order('created_at', { ascending: false })).map(withAuthor);
    },
    async approved({ course_slug, kind } = {}) {
      let q = sb.from('submissions').select(SUB).eq('status', 'approved');
      if (course_slug) q = q.eq('course_slug', course_slug);
      if (kind) q = q.eq('kind', kind);
      return ok(await q.order('reviewed_at', { ascending: false })).map(withAuthor);
    },
    async recent(limit = 6) {
      return ok(await sb.from('submissions').select(SUB).eq('status', 'approved')
        .order('reviewed_at', { ascending: false }).limit(limit)).map(withAuthor);
    },
    async contentIndex() {
      const rows = ok(await sb.from('submissions').select('course_slug').eq('status', 'approved'));
      return new Set(rows.map((r) => r.course_slug).filter(Boolean));
    },
    async pending() {
      return ok(await sb.from('submissions').select(SUB).eq('status', 'pending')
        .order('created_at')).map(withAuthor);
    },
    async byStatus(status) {
      return ok(await sb.from('submissions').select(SUB).eq('status', status)
        .order('reviewed_at', { ascending: false }).limit(500)).map(withAuthor);
    },
    async review(id, status, review_note = null) {
      ok(await sb.from('submissions').update({ status, review_note }).eq('id', id));
    },

    async comments(course_slug) {
      const rows = ok(await sb.from('comments')
        .select(`*, profiles!comments_user_id_fkey(${WHO}), comment_likes(user_id)`)
        .eq('course_slug', course_slug).order('created_at'));
      return rows.map((c) => ({
        ...withAuthor(c),
        likes: c.comment_likes.length,
        liked: !!me && c.comment_likes.some((l) => l.user_id === me.id),
        comment_likes: undefined,
      }));
    },
    async addComment(c) { ok(await sb.from('comments').insert(c)); },
    async like(id) { ok(await sb.from('comment_likes').insert({ comment_id: id })); },
    async unlike(id) {
      ok(await sb.from('comment_likes').delete().eq('comment_id', id).eq('user_id', me.id));
    },
    async deleteComment(id) { ok(await sb.from('comments').delete().eq('id', id)); },
    async heldComments() {
      return ok(await sb.from('comments').select(`*, profiles!comments_user_id_fkey(${WHO})`)
        .in('status', ['held', 'hidden']).order('created_at')).map(withAuthor);
    },
    async moderateComment(id, status) { ok(await sb.from('comments').update({ status }).eq('id', id)); },

    async report(r) { ok(await sb.from('reports').insert(r)); },
    async reports() {
      return ok(await sb.from('reports').select('*, profiles(display_name)')
        .eq('resolved', false).order('created_at')).map(withAuthor);
    },
    async resolveReport(id) { ok(await sb.from('reports').update({ resolved: true }).eq('id', id)); },

    async leaderboard() {
      return ok(await sb.from('leaderboard').select('*').order('points', { ascending: false }).limit(50));
    },

    // Reviewer edits (the database saves the old version and notifies the author)
    async editSubmission(id, payload, note) {
      ok(await sb.rpc('edit_submission', { p_id: id, p_payload: payload, p_note: note }));
    },
    async notifications() {
      if (!me) return [];
      const { data, error } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
      return error ? [] : data;                 // before migration 007: none
    },
    async unreadCount() {
      if (!me) return 0;
      const { count, error } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false);
      return error ? 0 : count;
    },
    async markAllRead() { if (me) await sb.from('notifications').update({ read: true }).eq('read', false); },

    // Feedback box: anyone can send; reviewers read and triage
    async sendFeedback(f) { ok(await sb.from('feedback').insert(f)); },
    async feedbackList() {
      return ok(await sb.from('feedback').select('*').order('created_at', { ascending: false }).limit(200));
    },
    async setFeedbackStatus(id, status) { ok(await sb.from('feedback').update({ status }).eq('id', id)); },
    // Credits page: reviewers/admins, and names people left on feedback marked done
    async team() {
      return ok(await sb.from('profiles').select('id, display_name, role, avatar, avatar_color, school_verified, grad_year')
        .in('role', ['reviewer', 'admin']).order('created_at'));
    },
    async feedbackCredits() {
      const { data, error } = await sb.from('feedback_credits').select('*').order('helped', { ascending: false });
      return error ? [] : data;          // before migration 006, just show none
    },
    async deleteFeedback(id) { ok(await sb.from('feedback').delete().eq('id', id)); },
  };
}

// ───────────────────────────── demo ─────────────────────────────
async function demo() {
  const KEY = 'wilkipedia-demo-v1';
  const listeners = new Set();
  const blank = () => ({ me: null, users: {}, bounties: [], claims: [], submissions: [],
                         comments: [], likes: [], reports: [], feedback: [], notes: [], seq: 1, seeded: false });
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { db = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* private mode */ } };
  const id = () => db.seq++;
  const me = () => db.me && db.users[db.me];
  const name = (uid) => db.users[uid]?.name ?? FORMER;
  const verified = (uid) => !!db.users[uid]?.school;
  const who = (uid) => ({ author: name(uid), verified: verified(uid),
                          avatar: db.users[uid]?.avatar ?? null, color: db.users[uid]?.color ?? 'gray' });
  const need = () => { if (!me()) throw new Error('Sign in first.'); return me(); };
  const reviewer = () => { const u = need(); if (!REVIEWER_ROLES.includes(u.role)) throw new Error('Reviewers only.'); return u; };
  const admin = () => { const u = need(); if (u.role !== 'admin') throw new Error('Admins only.'); return u; };

  if (!db.seeded) {
    try {
      const root = document.body.dataset.root || './';
      const v = document.querySelector('meta[name="data-version"]')?.content;
      const seed = await (await fetch(root + 'data/seed-bounties.json' + (v ? `?v=${v}` : ''))).json();
      db.bounties = seed.map((b) => ({ status: 'open', created_at: now(), ...b }));
      db.seeded = true;
      save();
    } catch { /* offline: start with an empty board */ }
  }

  const sub = (s) => ({ ...s, ...who(s.user_id) });
  const byReviewed = (a, b) => (b.reviewed_at || '').localeCompare(a.reviewed_at || '');

  return {
    mode: 'demo',
    user: () => me() || null,
    onAuth: (f) => listeners.add(f),
    async signIn() {
      const n = prompt('Demo mode: pick a display name.\n(Real sign-in with Google turns on once Supabase is connected.)', 'Ethan');
      if (!n) return;
      const uid = 'demo-' + n.trim().toLowerCase().replace(/\W+/g, '-');
      db.users[uid] ??= { id: uid, name: n.trim().slice(0, 40), role: 'admin', school: false,
                          avatar: null, color: 'green', grad_year: null, show_on_leaderboard: true };
      db.me = uid; save();
      listeners.forEach((f) => f(me()));
    },
    async signOut() { db.me = null; save(); listeners.forEach((f) => f(null)); },
    async updateProfile(fields) {
      const u = need();
      const map = { display_name: 'name', avatar: 'avatar', avatar_color: 'color',
                    grad_year: 'grad_year', show_on_leaderboard: 'show_on_leaderboard' };
      for (const [k, v] of Object.entries(fields)) if (map[k]) u[map[k]] = v;
      save(); listeners.forEach((f) => f(me()));
    },
    // Demo only: lets you feel the site as a contributor, trusted user or reviewer.
    async setDemoRole(role) { need().role = role; save(); listeners.forEach((f) => f(me())); },
    async setDemoSchool(on) { need().school = on; save(); listeners.forEach((f) => f(me())); },
    async resetDemo() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },

    async bounties() {
      if (!REVIEWER_ROLES.includes(me()?.role)) return [];      // mirrors RLS: review team only
      return db.bounties
        .map((b) => ({ ...b, claims: db.claims.filter((c) => c.bounty_id === b.id && active(c))
          .map((c) => ({ user_id: c.user_id, name: name(c.user_id), expires_at: c.expires_at })) }))
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    },
    async claim(bounty_id) {
      const u = reviewer();
      const b = db.bounties.find((x) => x.id === bounty_id);
      if (!b || b.status !== 'open') throw new Error('That bounty is closed.');
      db.claims = db.claims.filter((c) => !(c.bounty_id === bounty_id && c.user_id === u.id));
      db.claims.push({ bounty_id, user_id: u.id, created_at: now(),
                       expires_at: new Date(Date.now() + 14 * 864e5).toISOString() });
      save();
    },
    async unclaim(bounty_id) {
      const u = need();
      db.claims = db.claims.filter((c) => !(c.bounty_id === bounty_id && c.user_id === u.id));
      save();
    },
    async postBounty(b) {
      admin();
      if (db.bounties.some((x) => x.id === b.id)) throw new Error(`Bounty ${b.id} already exists.`);
      db.bounties.push({ status: 'open', created_at: now(), ...b }); save();
    },
    async setBountyStatus(bid, status) {
      admin();
      const b = db.bounties.find((x) => x.id === bid);
      if (b.status !== status) b.closed_at = status === 'open' ? null : now();   // mirrors on_bounty_status()
      b.status = status; save();
    },
    async updateBounty(bid, fields) { admin(); Object.assign(db.bounties.find((b) => b.id === bid), fields); save(); },
    async bountyWork() {
      return db.submissions.filter((x) => x.status === 'approved' && x.bounty_id)
        .map((x) => ({ bounty_id: x.bounty_id, user_id: x.user_id, reviewed_at: x.reviewed_at, author: name(x.user_id) }));
    },

    async submit(s) {
      const u = need();
      db.submissions.push({ id: id(), user_id: u.id, status: 'pending', review_note: null,
                            reviewed_at: null, created_at: now(), bounty_id: null, teacher: null, ...s });
      save();
    },
    async mySubmissions() {
      const u = need();
      return db.submissions.filter((s) => s.user_id === u.id).reverse().map(sub);
    },
    async approved({ course_slug, kind } = {}) {
      return db.submissions.filter((s) => s.status === 'approved'
        && (!course_slug || s.course_slug === course_slug) && (!kind || s.kind === kind))
        .sort(byReviewed).map(sub);
    },
    async recent(limit = 6) {
      return db.submissions.filter((s) => s.status === 'approved').sort(byReviewed).slice(0, limit).map(sub);
    },
    async contentIndex() {
      return new Set(db.submissions.filter((s) => s.status === 'approved' && s.course_slug)
        .map((s) => s.course_slug));
    },
    async pending() { reviewer(); return db.submissions.filter((s) => s.status === 'pending').map(sub); },
    async byStatus(status) { reviewer(); return db.submissions.filter((s) => s.status === status).sort(byReviewed).map(sub); },
    async review(sid, status, review_note = null) {
      const u = reviewer();
      const s = db.submissions.find((x) => x.id === sid);
      const wasApproved = s.status === 'approved';
      if (s.status !== status && s.user_id && s.user_id !== u.id) {
        const what = s.kind.replace('_', ' ');
        (db.notes ??= []).unshift({ id: id(), user_id: s.user_id, read: false, created_at: now(), link: 'account/',
          message: status === 'approved' ? `Your ${what} was published. Thank you!` : status === 'changes'
            ? `A reviewer asked for changes to your ${what}: ${review_note || ''}` : wasApproved
            ? `Your ${what} was unpublished. Reason: ${review_note || ''}` : `Your ${what} wasn’t accepted. Reason: ${review_note || ''}` });
      }
      Object.assign(s, { status, review_note, reviewed_by: u.id, reviewed_at: now() });
      if (status === 'approved' && !wasApproved) {
        const author = db.users[s.user_id];
        const count = db.submissions.filter((x) => x.user_id === s.user_id && x.status === 'approved').length;
        if (author && author.role === 'contributor' && count >= 3) author.role = 'trusted';
      }
      save();
    },

    async comments(course_slug) {
      const mod = REVIEWER_ROLES.includes(me()?.role);
      return db.comments.filter((c) => c.course_slug === course_slug
          && (c.status === 'visible' || c.user_id === db.me || mod))
        .map((c) => ({ ...c, ...who(c.user_id),
                       likes: db.likes.filter((l) => l.comment_id === c.id).length,
                       liked: db.likes.some((l) => l.comment_id === c.id && l.user_id === db.me) }));
    },
    async addComment(c) {
      const u = need();
      db.comments.push({ id: id(), user_id: u.id, parent_id: null, prompt: null, created_at: now(), ...c,
                         status: postsInstantly(u) ? 'visible' : 'held' });
      save();
    },
    async like(cid) { const u = need(); db.likes.push({ comment_id: cid, user_id: u.id }); save(); },
    async unlike(cid) {
      const u = need();
      db.likes = db.likes.filter((l) => !(l.comment_id === cid && l.user_id === u.id)); save();
    },
    async deleteComment(cid) {
      const u = need();
      const c = db.comments.find((x) => x.id === cid);
      if (c.user_id !== u.id) reviewer();
      db.comments = db.comments.filter((x) => x.id !== cid && x.parent_id !== cid); save();
    },
    async heldComments() {
      reviewer();
      return db.comments.filter((c) => c.status !== 'visible')
        .map((c) => ({ ...c, ...who(c.user_id) }));
    },
    async moderateComment(cid, status) { reviewer(); db.comments.find((c) => c.id === cid).status = status; save(); },

    async report(r) {
      const u = need();
      db.reports.push({ id: id(), user_id: u.id, resolved: false, created_at: now(), note: null, ...r });
      if (r.kind === 'inappropriate' && r.target.startsWith('comment:')) {
        const c = db.comments.find((x) => x.id === Number(r.target.slice(8)));
        if (c && c.status === 'visible') c.status = 'hidden';
      }
      save();
    },
    async reports() {
      reviewer();
      return db.reports.filter((r) => !r.resolved).map((r) => ({ ...r, author: name(r.user_id) }));
    },
    async resolveReport(rid) { reviewer(); db.reports.find((r) => r.id === rid).resolved = true; save(); },

    async leaderboard() {
      const sem = new Date(); sem.setMonth(sem.getMonth() >= 7 ? 7 : 0, 1); sem.setHours(0, 0, 0, 0);
      const rows = {};
      const paid = new Set();
      const approved = db.submissions.filter((x) => x.status === 'approved')
        .sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
      for (const s of approved) {
        const u = db.users[s.user_id] || { id: s.user_id, name: '?', role: 'contributor' };
        if (u.show_on_leaderboard === false) continue;
        const r = rows[u.id] ??= { id: u.id, display_name: u.name, role: u.role, points: 0, semester_points: 0,
                                   approved: 0, school_verified: !!u.school, avatar: u.avatar ?? null,
                                   avatar_color: u.color ?? 'green', grad_year: u.grad_year ?? null };
        r.approved++;
        const key = `${s.user_id}|${s.bounty_id ?? 'x' + s.id}`;
        if (paid.has(key)) continue;          // a bounty pays once per person
        paid.add(key);
        const b = db.bounties.find((x) => x.id === s.bounty_id);
        const p = b ? SIZE_POINTS[b.size] : 5;
        r.points += p;
        if (new Date(s.reviewed_at) >= sem) r.semester_points += p;
      }
      return Object.values(rows).sort((a, b) => b.points - a.points);
    },

    async editSubmission(sid, payload, note) {
      const u = reviewer();
      if (!note?.trim()) throw new Error('Say what you changed and why');
      const x = db.submissions.find((y) => y.id === sid);
      Object.assign(x, { payload, edited_at: now(), edited_by: u.id });
      if (x.user_id && x.user_id !== u.id) {
        (db.notes ??= []).unshift({ id: id(), user_id: x.user_id, message: `${u.name} (reviewer) edited your ${x.kind.replace('_', ' ')}. Reason: ${note.trim()}`, link: 'account/', read: false, created_at: now() });
      }
      save();
    },
    async notifications() { return (db.notes ?? []).filter((n) => n.user_id === db.me); },
    async unreadCount() { return (db.notes ?? []).filter((n) => n.user_id === db.me && !n.read).length; },
    async markAllRead() { (db.notes ?? []).forEach((n) => { if (n.user_id === db.me) n.read = true; }); save(); },

    async sendFeedback(f) {
      (db.feedback ??= []).unshift({ id: id(), status: 'new', created_at: now(), user_id: db.me, ...f }); save();
    },
    async feedbackList() { reviewer(); return db.feedback ?? []; },
    async setFeedbackStatus(fid, status) { reviewer(); db.feedback.find((f) => f.id === fid).status = status; save(); },
    async deleteFeedback(fid) { reviewer(); db.feedback = db.feedback.filter((f) => f.id !== fid); save(); },
    async team() {
      return Object.values(db.users).filter((u) => REVIEWER_ROLES.includes(u.role))
        .map((u) => ({ id: u.id, display_name: u.name, role: u.role, avatar: u.avatar, avatar_color: u.color, school_verified: u.school, grad_year: u.grad_year }));
    },
    async feedbackCredits() {
      const by = {};
      for (const f of db.feedback ?? []) if (f.status === 'done' && f.name?.trim()) by[f.name] = (by[f.name] || 0) + 1;
      return Object.entries(by).map(([name, helped]) => ({ name, helped }));
    },
  };
}
