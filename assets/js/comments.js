// A comment thread: the class pages' Comments and the SAT page's discussion (comments.course_slug
// is the class's slug, or a key of THREADS in ui.js). Expects the markup build.py writes:
// #comment-form (#replying, #cancel-reply, #comment-prompt, #comment-body) and #comment-list.
// The same rules everywhere: new members' comments wait for a reviewer (on_comment_insert).

import { popconfirm, requireUser, drafts, $, esc, byline, avatarHtml, prose, ago, guard, toast } from './ui.js';
import { REVIEWER_ROLES } from './store.js';

// `onCount(n)` gets the number of visible comments after each draw
export function mountComments(s, { slug, prompts, empty, onCount = () => {} }) {
  const form = $('#comment-form'), list = $('#comment-list');

  async function draw() {
    const me = s.user();
    const mod = me && REVIEWER_ROLES.includes(me.role);
    const all = await s.comments(slug);
    const top = all.filter((c) => !c.parent_id).reverse();
    const one = (c, reply = false) => `
      <div class="comment ${reply ? 'reply' : ''}" data-id="${c.id}">
        <div class="c-head">${avatarHtml(c)}<b>${esc(c.author)}</b>${byline('', c.verified)} <span class="meta">${ago(c.created_at)}</span>
          ${c.prompt && c.prompt !== 'General' ? `<span class="tag">${esc(c.prompt)}</span>` : ''}
          ${c.status === 'held' ? '<span class="tag warn">Waiting for approval</span>' : ''}
          ${c.status === 'hidden' ? '<span class="tag warn">Hidden (reported)</span>' : ''}</div>
        <div class="c-body">${prose(c.body)}</div>
        <div class="c-actions">
          <button class="linkish" data-like="${c.id}" aria-pressed="${c.liked}">${c.liked ? '♥' : '♡'} ${c.likes || ''}</button>
          ${reply ? '' : `<button class="linkish" data-reply="${c.id}">Reply</button>`}
          ${me && (me.id === c.user_id || mod) ? `<button class="linkish" data-del="${c.id}">Delete</button>` : ''}
          ${me && me.id !== c.user_id ? `<button class="linkish" data-flag="${c.id}">Report</button>` : ''}
        </div>
        ${reply ? '' : all.filter((r) => r.parent_id === c.id).map((r) => one(r, true)).join('')}
      </div>`;
    list.innerHTML = top.length ? top.map((c) => one(c)).join('') : `<div class="empty">${esc(empty)}</div>`;
    onCount(all.filter((c) => c.status === 'visible' || !c.status).length);
  }

  $('#comment-prompt').innerHTML = prompts.map((p) => `<option>${esc(p)}</option>`).join('');
  drafts.bind($('#comment-body'), `comment:${slug}`);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = $('#comment-body').value.trim();
    if (!body) return;
    if (!(await requireUser(s, 'to comment'))) return;
    const parent_id = Number(form.dataset.parent) || null;
    const ok = await guard(() => s.addComment({ course_slug: slug, body, parent_id,
                                                prompt: parent_id ? null : $('#comment-prompt').value }));
    if (!ok) return;
    $('#comment-body').value = '';
    drafts.clear(`comment:${slug}`);
    delete form.dataset.parent;
    $('#replying').hidden = true;
    const mine = (await s.comments(slug)).filter((c) => c.user_id === s.user().id).pop();
    toast(mine?.status === 'held' ? 'Thanks! Your comment will appear after a reviewer approves it.' : 'Posted.', 'good');
    draw();
  });

  $('#cancel-reply').addEventListener('click', () => {
    delete form.dataset.parent;
    $('#replying').hidden = true;
  });

  list.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.like) {
      if (!(await requireUser(s, 'to like comments'))) return;
      const id = Number(t.dataset.like);
      await guard(() => (t.getAttribute('aria-pressed') === 'true' ? s.unlike(id) : s.like(id)));
      draw();
    } else if (t.dataset.reply) {
      form.dataset.parent = t.dataset.reply;
      $('#replying').hidden = false;
      $('#comment-body').focus();
    } else if (t.dataset.del) {
      if (!(await popconfirm(t, { title: 'Delete this comment?', ok: 'Delete', key: 'comment-delete' }))) return;
      await guard(() => s.deleteComment(Number(t.dataset.del)), 'Deleted.');
      draw();
    } else if (t.dataset.flag) {
      const note = prompt('Why should a reviewer look at this comment?');
      if (note === null) return;
      await guard(() => s.report({ kind: 'inappropriate', course_slug: slug,
                                   target: `comment:${t.dataset.flag}`, note: note || null }),
                  'Reported. It is hidden until a reviewer checks it.');
      draw();
    }
  });

  return { draw };
}
