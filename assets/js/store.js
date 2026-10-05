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
//   Announcement {id, kind ('school' | 'site'), message, link, ends_on, active, created_at}
//   Submission {id, user_id, author, verified, avatar, color, bounty_id, course_slug, kind, teacher, payload,
//               status ('pending' | 'approved' | 'changes' | 'rejected' | 'withdrawn' | 'merged'),
//               review_note, reviewed_at, created_at, replaces (the live submission an update is for),
//               edit_note (a suggested edit's note), original (pending() only: that live submission, with its author)}
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
// Authors can edit, withdraw and update their own work once migration 014 has
// added submissions.replaces; until then the buttons stay hidden
export const canEditOwn = (x) => MODE === 'demo' || (!!x && 'replaces' in x);

// A study guide PDF: 5 MB at most (the bucket enforces it too), and really a PDF
export const PDF_MAX = 5 * 1024 * 1024;
async function checkPdf(file) {
  if (!file || !file.size) throw new Error('Choose a PDF file.');
  if (file.size > PDF_MAX) throw new Error(`That PDF is ${(file.size / 1048576).toFixed(1)} MB. The limit is 5 MB: in Google Docs, File → Download → PDF usually makes a small one.`);
  const head = await file.slice(0, 5).text();
  if (head !== '%PDF-') throw new Error('That file isn’t a PDF. In Google Docs use File → Download → PDF Document.');
}
const pdfInfo = (path, file) => ({ path, name: String(file.name || 'study-guide.pdf').replace(/[^\w .()\-]+/g, '').slice(0, 120) || 'study-guide.pdf', size: file.size });

// Mirrors on_comment_insert() in schema.sql: personal accounts are always reviewed.
export const postsInstantly = (u) => REVIEWER_ROLES.includes(u.role) || (u.role === 'trusted' && !!u.school);
const FORMER = 'Former student';

// The profile columns a user may edit (see the column grant in schema.sql).
// The Terms of Service version everyone must agree to before posting (terms/).
// Bump together with terms_current() in supabase (migration 012) when the Terms
// change in a way that matters: everyone is asked again.
export const TERMS_VERSION = 1;
export const PROFILE_FIELDS = ['display_name', 'avatar', 'avatar_color', 'grad_year', 'show_on_leaderboard'];
const toUser = (p) => ({ id: p.id, name: p.display_name, role: p.role, school: !!p.school_verified,
                         avatar: p.avatar ?? null, color: p.avatar_color || 'green',
                         grad_year: p.grad_year ?? null, show_on_leaderboard: p.show_on_leaderboard !== false,
                         // null: the database has no Terms columns yet (migration 012 not run), so nobody is asked
                         terms: 'terms_version' in p ? (p.terms_version ?? 0) : ('terms' in p ? p.terms : null) });

let pending = null;
export function store() {
  if (!pending) pending = MODE === 'live' ? live() : demo();
  return pending;
}

const now = () => new Date().toISOString();
// Today as YYYY-MM-DD in the reader's time zone (announcement end dates are plain days)
const localYMD = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  // Before migration 014 is run, say so instead of a database error
  const ok014 = (r) => {
    if (r.error && /edit_own_submission|withdraw_submission|replaces|schema cache/.test(r.error.message)) {
      throw new Error('Editing your own work needs migration 014 run in Supabase first.');
    }
    return ok(r);
  };
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
    async acceptTerms() {
      ok(await sb.rpc('accept_terms', { v: TERMS_VERSION }));
      me = { ...me, terms: TERMS_VERSION };
      listeners.forEach((f) => f(me));
    },
    async updateProfile(fields) {
      const row = Object.fromEntries(Object.entries(fields).filter(([k]) => PROFILE_FIELDS.includes(k)));
      const res = await sb.from('profiles').update(row).eq('id', me.id).select('*').single();
      if (res.error && /avatar_check/.test(res.error.message)) {         // before migration 015
        throw new Error('The rose, light bulb and bird icons need migration 015 run in Supabase first.');
      }
      const data = ok(res);
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

    // The announcement bar. Everyone reads the live ones; admins read and manage all.
    async announcements() {
      const today = localYMD();
      return ok(await sb.from('announcements').select('id, kind, message, link, ends_on, active, created_at')
        .eq('active', true).order('created_at', { ascending: false }).limit(6))
        .filter((a) => !a.ends_on || a.ends_on >= today);
    },
    async allAnnouncements() {
      return ok(await sb.from('announcements').select('*').order('created_at', { ascending: false }));
    },
    async postAnnouncement(a) { ok(await sb.from('announcements').insert(a)); },
    async updateAnnouncement(id, fields) { ok(await sb.from('announcements').update(fields).eq('id', id)); },
    async deleteAnnouncement(id) { ok(await sb.from('announcements').delete().eq('id', id)); },

    // Calendar edits: admins' changes on top of the calendar files (migration 011).
    async calendarEdits() { return ok(await sb.from('calendar_events').select('*')); },
    async saveCalendarEvent(row) {
      const fields = { ...row, updated_at: new Date().toISOString() };
      delete fields.id;
      if (row.id) return ok(await sb.from('calendar_events').update(fields).eq('id', row.id));
      if (row.replaces) return ok(await sb.from('calendar_events').upsert(fields, { onConflict: 'replaces' }));
      return ok(await sb.from('calendar_events').insert(fields));
    },
    async deleteCalendarEvent(id) { ok(await sb.from('calendar_events').delete().eq('id', id)); },

    async submit(s) { ok(await sb.from('submissions').insert({ ...s, user_id: me.id })); },
    async mySubmissions() {
      return ok(await sb.from('submissions').select(SUB).eq('user_id', me.id)
        .order('created_at', { ascending: false })).map(withAuthor);
    },
    async approved({ course_slug, kind } = {}) {
      let q = sb.from('submissions').select(SUB).eq('status', 'approved');
      // a class's own work, plus guides shared into it from another class (payload.also)
      if (course_slug) q = q.or(`course_slug.eq.${course_slug},payload->also.cs.["${course_slug}"]`);
      if (kind) q = q.eq('kind', kind);
      return ok(await q.order('reviewed_at', { ascending: false })).map(withAuthor);
    },
    async recent(limit = 6) {
      return ok(await sb.from('submissions').select(SUB).eq('status', 'approved')
        .order('reviewed_at', { ascending: false }).limit(limit)).map(withAuthor);
    },
    async contentIndex() {
      const rows = ok(await sb.from('submissions').select('course_slug, also:payload->also').eq('status', 'approved'));
      return new Set(rows.flatMap((r) => [r.course_slug, ...(Array.isArray(r.also) ? r.also : [])]).filter(Boolean));
    },
    async pending() {
      const list = ok(await sb.from('submissions').select(SUB).eq('status', 'pending')
        .order('created_at')).map(withAuthor);
      // An update is shown against the live version it would replace
      const ids = [...new Set(list.map((x) => x.replaces).filter(Boolean))];
      const orig = ids.length ? ok(await sb.from('submissions').select(SUB).in('id', ids)).map(withAuthor) : [];
      const byId = Object.fromEntries(orig.map((o) => [o.id, o]));
      return list.map((x) => (x.replaces ? { ...x, original: byId[x.replaces] ?? null } : x));
    },
    async byStatus(status) {
      return ok(await sb.from('submissions').select(SUB).eq('status', status)
        .order('reviewed_at', { ascending: false }).limit(500)).map(withAuthor);
    },
    async review(id, status, review_note = null) {
      ok(await sb.from('submissions').update({ status, review_note }).eq('id', id));
    },

    // Authors' own work (migration 014). Edit or withdraw it while it isn't live;
    // live work gets an update that waits for review, and approving it copies the
    // update onto the live submission (on_review() in schema.sql).
    async editOwn(id, payload) { ok014(await sb.rpc('edit_own_submission', { p_id: id, p_payload: payload })); },
    // Study guide PDFs (migration 016): a private bucket. A file opens for its uploader and
    // reviewers, and for everyone once the submission pointing at it is published.
    // Sent with XMLHttpRequest rather than supabase-js, because only XHR reports upload progress
    // (onProgress gets 0..1). Same request supabase-js would make.
    async uploadPdf(file, onProgress) {
      await checkPdf(file);
      const path = `${me.id}/${crypto.randomUUID()}.pdf`;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error('Sign in again to upload.');
      await new Promise((ok, bad) => {
        const x = new XMLHttpRequest();
        x.open('POST', `${SUPABASE_URL}/storage/v1/object/guides/${path}`);
        x.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        x.setRequestHeader('apikey', SUPABASE_KEY);
        x.setRequestHeader('Content-Type', 'application/pdf');
        x.setRequestHeader('x-upsert', 'false');
        x.setRequestHeader('cache-control', '3600');
        x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
        x.onload = () => {
          if (x.status >= 200 && x.status < 300) { onProgress?.(1); return ok(); }
          let msg = x.statusText; try { const j = JSON.parse(x.responseText); msg = j.message || j.error || msg; } catch { /* not JSON */ }
          bad(new Error(/bucket not found/i.test(msg) ? 'PDF uploads need migration 016 run in Supabase first.' : `Upload failed: ${msg}`));
        };
        x.onerror = () => bad(new Error('Upload failed: check your connection and try again.'));
        x.send(file);
      });
      return pdfInfo(path, file);
    },
    // → { path: signed link } for the files this viewer may open (others are left out)
    async pdfUrls(paths) {
      if (!paths.length) return {};
      const { data } = await sb.storage.from('guides').createSignedUrls(paths, 6 * 3600);
      return Object.fromEntries((data || []).filter((x) => x.signedUrl && !x.error).map((x) => [x.path, x.signedUrl]));
    },
    async withdraw(id) { ok014(await sb.rpc('withdraw_submission', { p_id: id })); },
    // A suggested edit to live work, the author's own or (migration 021) anyone's: it waits for
    // review, and approving it copies it onto the live post (on_review() in schema.sql)
    async proposeUpdate(orig, payload, note = null) {
      const { error } = await sb.from('submissions').insert({ user_id: me.id, kind: orig.kind, course_slug: orig.course_slug,
        teacher: orig.teacher, payload, replaces: orig.id, ...(note ? { edit_note: note.slice(0, 500) } : {}) });
      if (error && /edit_note/.test(error.message)) throw new Error('Suggesting edits needs migration 021 run in Supabase first.');
      ok014({ error });
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

    // ── the Inbox (migration 017) ──
    // Before 017 the new columns and tables don't exist: say so, and fall back quietly
    async inboxReady() { const r = await sb.from('messages').select('id').limit(1); return !r.error; },
    async inboxNotes(limit = 200) {
      if (!me) return [];
      const r = await sb.from('notifications').select(`*, actor:profiles!notifications_actor_id_fkey(${WHO})`)
        .order('created_at', { ascending: false }).limit(limit);
      if (!r.error) return r.data.map((n) => ({ ...n, actorName: n.actor?.display_name ?? null, actor: undefined }));
      const old = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit);
      return old.error ? [] : old.data;
    },
    async markRead(ids) { if (me && ids.length) await sb.from('notifications').update({ read: true }).in('id', ids); },
    async markSubjectRead(subject) { if (me) await sb.from('notifications').update({ read: true }).eq('subject', subject).eq('read', false); },
    async myComments() {
      if (!me) return [];
      return ok(await sb.from('comments').select('id, course_slug, parent_id, body, status, created_at')
        .eq('user_id', me.id).order('created_at', { ascending: false }).limit(100));
    },
    async myFeedback() {
      if (!me) return [];
      const r = await sb.from('feedback').select('*').eq('user_id', me.id).order('created_at', { ascending: false });
      return r.error ? [] : r.data;
    },
    async myReports() {
      if (!me) return [];
      const r = await sb.from('reports').select('*').eq('user_id', me.id).order('created_at', { ascending: false });
      return r.error ? [] : r.data;
    },
    // One conversation, oldest first. `team`: the writer was a reviewer or admin.
    async thread(subject) {
      const r = await sb.from('messages').select(`*, profiles!messages_user_id_fkey(${WHO}, role)`).eq('subject', subject).order('created_at');
      if (r.error) return [];
      return r.data.map((m) => ({ ...withAuthor(m), team: REVIEWER_ROLES.includes(m.profiles?.role) }));
    },
    async sendMessage(subject, body) { ok(await sb.from('messages').insert({ subject, body })); },
    // The latest messages this viewer may read (theirs, or everything for the team), newest first
    async recentMessages(limit = 500) {
      const r = await sb.from('messages').select(`id, subject, kind, status, body, created_at, user_id, profiles!messages_user_id_fkey(${WHO}, role)`)
        .order('created_at', { ascending: false }).limit(limit);
      if (r.error) return [];
      return r.data.map((m) => ({ ...withAuthor(m), team: REVIEWER_ROLES.includes(m.profiles?.role) }));
    },
    // What a conversation is about
    async subjectInfo(subject) {
      const [type, sid] = subject.split(':'), idn = Number(sid);
      if (type === 'submission') { const r = await sb.from('submissions').select(SUB).eq('id', idn).maybeSingle(); return r.data ? { type, ...withAuthor(r.data) } : null; }
      if (type === 'feedback') { const r = await sb.from('feedback').select('*, profiles(display_name)').eq('id', idn).maybeSingle(); return r.data ? { type, ...withAuthor(r.data) } : null; }
      if (type === 'report') { const r = await sb.from('reports').select('*, profiles(display_name)').eq('id', idn).maybeSingle(); return r.data ? { type, ...withAuthor(r.data) } : null; }
      return null;
    },
    // Admins: every member, and everything one of them has done
    async people() {
      return ok(await sb.from('profiles').select('id, display_name, role, school_verified, grad_year, avatar, avatar_color, created_at')
        .order('created_at', { ascending: false }));
    },
    async personActivity(uid) {
      const [subs, comments, reports, feedback] = await Promise.all([
        sb.from('submissions').select(SUB).eq('user_id', uid).order('created_at', { ascending: false }),
        sb.from('comments').select('id, course_slug, body, status, created_at').eq('user_id', uid).order('created_at', { ascending: false }),
        sb.from('reports').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        sb.from('feedback').select('*').eq('user_id', uid).order('created_at', { ascending: false })]);
      return { subs: (subs.data || []).map(withAuthor), comments: comments.data || [], reports: reports.data || [], feedback: feedback.data || [] };
    },
    async setRole(uid, role) { ok(await sb.rpc('set_role', { p_user: uid, p_role: role })); },
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
                          avatar: null, color: 'green', grad_year: null, show_on_leaderboard: true, terms: 0 };
      db.me = uid; save();
      listeners.forEach((f) => f(me()));
    },
    async signOut() { db.me = null; save(); listeners.forEach((f) => f(null)); },
    async acceptTerms() { need().terms = TERMS_VERSION; save(); listeners.forEach((f) => f(me())); },
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
    async announcements() {
      const today = localYMD();
      return (db.announcements ?? []).filter((a) => a.active && (!a.ends_on || a.ends_on >= today)).slice(0, 6);
    },
    async allAnnouncements() { admin(); return db.announcements ?? []; },
    async postAnnouncement(a) { admin(); (db.announcements ??= []).unshift({ id: id(), active: true, created_at: now(), ...a }); save(); },
    async updateAnnouncement(aid, fields) { admin(); Object.assign(db.announcements.find((a) => a.id === aid), fields); save(); },
    async deleteAnnouncement(aid) { admin(); db.announcements = db.announcements.filter((a) => a.id !== aid); save(); },
    async calendarEdits() { return db.calendar ?? []; },
    async saveCalendarEvent(row) {
      admin();
      const list = (db.calendar ??= []);
      const cur = row.id ? list.find((x) => x.id === row.id) : row.replaces ? list.find((x) => x.replaces === row.replaces) : null;
      if (cur) Object.assign(cur, row, { id: cur.id, updated_at: now() });
      else list.push({ hidden: false, ...row, id: id(), updated_at: now() });
      save();
    },
    async deleteCalendarEvent(cid) { admin(); db.calendar = (db.calendar ?? []).filter((x) => x.id !== cid); save(); },
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
        && (!course_slug || s.course_slug === course_slug || (s.payload?.also || []).includes(course_slug)) && (!kind || s.kind === kind))
        .sort(byReviewed).map(sub);
    },
    async recent(limit = 6) {
      return db.submissions.filter((s) => s.status === 'approved').sort(byReviewed).slice(0, limit).map(sub);
    },
    async contentIndex() {
      return new Set(db.submissions.filter((s) => s.status === 'approved')
        .flatMap((s) => [s.course_slug, ...(s.payload?.also || [])]).filter(Boolean));
    },
    async pending() {
      reviewer();
      return db.submissions.filter((s) => s.status === 'pending')
        .map((s) => { const o = s.replaces && db.submissions.find((x) => x.id === s.replaces); return { ...sub(s), ...(s.replaces ? { original: o ? sub(o) : null } : {}) }; });
    },
    async byStatus(status) { reviewer(); return db.submissions.filter((s) => s.status === status).sort(byReviewed).map(sub); },
    async review(sid, status, review_note = null) {
      const u = reviewer();
      const s = db.submissions.find((x) => x.id === sid);
      const wasApproved = s.status === 'approved';
      // Approving an update copies it onto the live submission (mirrors on_review())
      if (status === 'approved' && !wasApproved && s.replaces && s.user_id === u.id) throw new Error('You can’t approve your own edit. Another reviewer or an admin has to.');
      const orig = status === 'approved' && !wasApproved && s.replaces
        && db.submissions.find((x) => x.id === s.replaces && x.status === 'approved');
      const theirs = s.replaces && db.submissions.find((x) => x.id === s.replaces)?.user_id !== s.user_id;
      if (orig) {
        Object.assign(orig, { payload: s.payload, edited_at: now(), edited_by: s.user_id, reviewed_by: u.id, reviewed_at: now() });
        status = 'merged';
        if (theirs && orig.user_id) (db.notes ??= []).unshift({ id: id(), user_id: orig.user_id, read: false, created_at: now(), link: 'account/',
          message: `${db.users[s.user_id]?.name || 'A member'} edited your ${orig.kind.replace('_', ' ')}, and a reviewer approved it. ${s.edit_note || ''} The old version is kept.` });
      }
      if (s.status !== status && s.user_id && s.user_id !== u.id) {
        const what = s.kind.replace('_', ' ');
        (db.notes ??= []).unshift({ id: id(), user_id: s.user_id, read: false, created_at: now(), link: 'account/',
          message: status === 'merged' ? `Your ${theirs ? `edit to the ${what}` : `update to your ${what}`} was approved and is live now. Thank you!`
            : status === 'approved' ? `Your ${what} was published. Thank you!` : status === 'changes'
            ? `A reviewer asked for changes to your ${what}: ${review_note || ''}` : wasApproved
            ? `Your ${what} was unpublished. Reason: ${review_note || ''}` : s.replaces
            ? `Your update to your ${what} wasn’t accepted, so the live version stays as it was. Reason: ${review_note || ''}`
            : `Your ${what} wasn’t accepted. Reason: ${review_note || ''}` });
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

    // Mirrors edit_own_submission(), withdraw_submission() and on_submission_insert()
    async uploadPdf(file, onProgress) {
      const u = need();
      await checkPdf(file);
      if (file.size > 2 * 1024 * 1024) throw new Error('In demo mode a PDF can be up to 2 MB (this browser keeps it).');
      const path = `${u.id}/${crypto.randomUUID()}.pdf`;
      db.files ??= {};
      db.files[path] = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad;
        r.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); }; r.readAsDataURL(file); });
      save();
      return pdfInfo(path, file);
    },
    async pdfUrls(paths) {
      const out = {};
      for (const p of paths) if (db.files?.[p]) out[p] = URL.createObjectURL(await (await fetch(db.files[p])).blob());
      return out;
    },
    async editOwn(sid, payload) {
      const u = need();
      const x = db.submissions.find((y) => y.id === sid);
      if (!x || x.user_id !== u.id) throw new Error('You can only edit your own submissions');
      if (!['pending', 'changes'].includes(x.status)) throw new Error('Only work that is waiting for review or was sent back can be edited');
      Object.assign(x, { payload, status: 'pending' });
      save();
    },
    async withdraw(sid) {
      const u = need();
      const x = db.submissions.find((y) => y.id === sid);
      if (!x || x.user_id !== u.id) throw new Error('You can only withdraw your own submissions');
      if (!['pending', 'changes'].includes(x.status)) throw new Error('Only work that is waiting for review or was sent back can be withdrawn');
      x.status = 'withdrawn';
      save();
    },
    async proposeUpdate(orig, payload, note = null) {
      const u = need();
      const o = db.submissions.find((y) => y.id === orig.id);
      if (!o || o.status !== 'approved') throw new Error('You can only suggest an edit to something that’s on the site');
      const waiting = db.submissions.find((y) => y.replaces === o.id && ['pending', 'changes'].includes(y.status));
      if (waiting) throw new Error(waiting.user_id === u.id ? 'You already have an edit to this waiting for review. Change that one instead (Dashboard → Your work).'
        : 'Someone else’s edit to this is waiting for review. Try again once a reviewer has looked at it.');
      db.submissions.push({ id: id(), user_id: u.id, status: 'pending', review_note: null, reviewed_at: null, created_at: now(),
                            bounty_id: null, kind: o.kind, course_slug: o.course_slug, teacher: o.teacher, payload, replaces: o.id, edit_note: note || null });
      save();
    },
    async editSubmission(sid, payload, note) {
      const u = reviewer();
      if (!note?.trim()) throw new Error('Say what you changed and why');
      const x = db.submissions.find((y) => y.id === sid);
      if (x.status === 'approved' && x.user_id !== u.id) throw new Error('Edits to someone else’s live post go to review now: suggest the edit instead.');
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
    // the Inbox, in this browser only
    async inboxReady() { return true; },
    async inboxNotes() { return (db.notes ?? []).filter((n) => n.user_id === db.me); },
    async markRead(ids) { (db.notes ?? []).forEach((n) => { if (ids.includes(n.id)) n.read = true; }); save(); },
    async markSubjectRead(subject) { (db.notes ?? []).forEach((n) => { if (n.user_id === db.me && n.subject === subject) n.read = true; }); save(); },
    async myComments() { return db.comments.filter((c) => c.user_id === db.me).reverse(); },
    async myFeedback() { return (db.feedback ?? []).filter((f) => f.user_id === db.me); },
    async myReports() { return db.reports.filter((r) => r.user_id === db.me).reverse(); },
    async thread(subject) {
      return (db.messages ?? []).filter((m) => m.subject === subject)
        .map((m) => ({ ...m, ...who(m.user_id), team: REVIEWER_ROLES.includes(db.users[m.user_id]?.role) }));
    },
    async sendMessage(subject, body) {
      const u = need();
      (db.messages ??= []).push({ id: id(), subject, kind: 'note', status: null, body: body.trim(), user_id: u.id, created_at: now() });
      save();
    },
    async recentMessages() {
      const u = db.users[db.me], team = u && REVIEWER_ROLES.includes(u.role);
      const own = (subj) => { const [t, x] = subj.split(':'); const list = { submission: db.submissions, feedback: db.feedback ?? [], report: db.reports }[t] || [];
        return list.find((y) => String(y.id) === x)?.user_id === db.me; };
      return (db.messages ?? []).filter((m) => team || own(m.subject)).slice().reverse()
        .map((m) => ({ ...m, ...who(m.user_id), team: REVIEWER_ROLES.includes(db.users[m.user_id]?.role) }));
    },
    async subjectInfo(subject) {
      const [type, x] = subject.split(':');
      const row = ({ submission: db.submissions, feedback: db.feedback ?? [], report: db.reports }[type] || []).find((y) => String(y.id) === x);
      return row ? { type, ...(type === 'submission' ? sub(row) : { ...row, ...who(row.user_id) }) } : null;
    },
    async people() {
      return Object.values(db.users).map((u) => ({ id: u.id, display_name: u.name, role: u.role, school_verified: u.school, grad_year: u.grad_year,
        avatar: u.avatar, avatar_color: u.color, created_at: u.created_at || now() }));
    },
    async personActivity(uid) {
      return { subs: db.submissions.filter((x) => x.user_id === uid).map(sub), comments: db.comments.filter((c) => c.user_id === uid),
               reports: db.reports.filter((r) => r.user_id === uid), feedback: (db.feedback ?? []).filter((f) => f.user_id === uid) };
    },
    async setRole(uid, role) {
      const me = db.users[db.me];
      if (me?.role !== 'admin') throw new Error('Only admins change roles');
      if (uid === db.me) throw new Error('You can’t change your own role');
      db.users[uid].role = role; save();
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
