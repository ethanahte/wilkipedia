-- Migration 017: the Inbox. One place for everything that happens to your work, and a
-- conversation on each thing you sent in (a post, a piece of feedback, a report).
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
-- Back up first:  python3 tools/backup.py
--
--  • notifications gain `kind` (what happened), `subject` (what it's about, e.g.
--    'submission:12') and `actor_id` (who did it), so the Inbox can group and filter.
--    Old rows keep working: they just have no kind.
--  • messages: one conversation per subject ('submission:<id>', 'feedback:<id>',
--    'report:<id>'), between whoever sent it in and the review team. Not a chat
--    between students: students talk to each other in public class-page comments.
--    Reviewer decisions and edits are written into the conversation too, so each post
--    keeps its whole history (kind 'decision' / 'edit'; people can only write 'note').
--  • New notifications: a reply to your comment, your comment approved or hidden by a
--    reviewer, your feedback planned/done/closed, your report handled, a new message
--    in your conversation, your role changed, and (for the reviewer who asked) a
--    sent-back post resubmitted.
--  • You can now read your own feedback and reports (to see what happened to them).
--  • set_role(): admins change someone's role from the Inbox (never their own).
--
-- Nothing is removed and no rows change. Two functions are replaced with versions that
-- do everything the old ones did, plus the above: edit_submission and on_status_notify.

begin;

alter table public.notifications
  add column kind     text,
  add column subject  text,
  add column actor_id uuid references public.profiles on delete set null;
create index on public.notifications (user_id, created_at desc);

-- One notification, skipped when there's nobody to tell or you'd be telling yourself
create function public.notify(p_user uuid, p_kind text, p_subject text, p_message text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  insert into public.notifications (user_id, kind, subject, message, link, actor_id)
  values (p_user, p_kind, p_subject, p_message, p_link, auth.uid());
end $$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- ───────── conversations ─────────
create table public.messages (
  id         bigint generated always as identity primary key,
  subject    text not null check (subject ~ '^(submission|feedback|report):[0-9]+$'),
  user_id    uuid default auth.uid() references public.profiles on delete set null,
  kind       text not null default 'note' check (kind in ('note', 'decision', 'edit')),
  status     text,                                   -- for a decision: the status it set
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.messages (subject, created_at);

-- Who sent a subject in (the other side of its conversation is the review team)
create function public.subject_owner(p text) returns uuid
language sql stable security definer set search_path = public as $$
  select case split_part(p, ':', 1)
    when 'submission' then (select user_id from public.submissions where id = split_part(p, ':', 2)::bigint)
    when 'feedback'   then (select user_id from public.feedback    where id = split_part(p, ':', 2)::bigint)
    when 'report'     then (select user_id from public.reports     where id = split_part(p, ':', 2)::bigint)
  end
$$;

alter table public.messages enable row level security;
create policy "the sender and the review team read a conversation" on public.messages for select
  using (public.is_reviewer() or public.subject_owner(subject) = auth.uid());
create policy "the sender and the review team write in it" on public.messages for insert
  with check (auth.uid() is not null and kind = 'note' and status is null
              and (public.is_reviewer() or public.subject_owner(subject) = auth.uid()));

create function public.on_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  new.body := btrim(new.body);
  return new;
end $$;
create trigger messages_insert before insert on public.messages
  for each row execute function public.on_message_insert();

-- A new note tells the other side: the team's note tells the sender; the sender's note
-- tells the team members who have spoken in this conversation (or reviewed the post)
create function public.on_message_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid := public.subject_owner(new.subject);
  who text;
  what text := case split_part(new.subject, ':', 1) when 'submission' then 'post' else split_part(new.subject, ':', 1) end;
  r uuid;
begin
  if new.kind <> 'note' then return new; end if;
  select display_name into who from public.profiles where id = new.user_id;
  if new.user_id is distinct from owner then
    perform public.notify(owner, 'message', new.subject,
      format('%s from the review team wrote about your %s: %s', coalesce(who, 'Someone'), what, left(new.body, 140)),
      'inbox/#thread/' || new.subject);
  else
    for r in
      select distinct m.user_id from public.messages m
       where m.subject = new.subject and m.user_id is distinct from owner and m.user_id is not null
      union
      select s.reviewed_by from public.submissions s
       where 'submission:' || s.id = new.subject and s.reviewed_by is not null
    loop
      perform public.notify(r, 'message', new.subject,
        format('%s replied about their %s: %s', coalesce(who, 'Someone'), what, left(new.body, 140)),
        'inbox/#thread/' || new.subject);
    end loop;
  end if;
  return new;
end $$;
create trigger messages_notify after insert on public.messages
  for each row execute function public.on_message_notify();

-- ───────── posts: decisions and edits go into the conversation ─────────
create or replace function public.edit_submission(p_id bigint, p_payload jsonb, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.submissions;
  editor text;
begin
  if not public.is_reviewer() then raise exception 'Only reviewers can edit other people''s work'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Say what you changed and why'; end if;
  select * into s from public.submissions where id = p_id for update;
  if not found then raise exception 'That submission no longer exists'; end if;

  insert into public.submission_edits (submission_id, editor_id, old_payload, new_payload, note)
  values (p_id, auth.uid(), s.payload, p_payload, btrim(p_note));
  update public.submissions set payload = p_payload, edited_at = now(), edited_by = auth.uid() where id = p_id;
  insert into public.messages (subject, kind, body) values ('submission:' || p_id, 'edit', left(btrim(p_note), 2000));

  if s.user_id is not null and s.user_id <> auth.uid() then
    select display_name into editor from public.profiles where id = auth.uid();
    perform public.notify(s.user_id, 'edited', 'submission:' || p_id,
      format('%s (reviewer) edited your %s. Reason: %s', coalesce(editor, 'A reviewer'), public.kind_label(s.kind), btrim(p_note)),
      public.submission_link(s));
  end if;
end $$;

create or replace function public.on_status_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  subj text := 'submission:' || new.id;
  author text;
begin
  if new.status is not distinct from old.status then return new; end if;
  -- the author sent a sent-back post in again: note it, and tell the reviewer who asked
  if old.status = 'changes' and new.status = 'pending' and auth.uid() = new.user_id then
    insert into public.messages (subject, kind, status, body) values (subj, 'decision', 'pending', 'Made the changes and resubmitted.');
    select display_name into author from public.profiles where id = new.user_id;
    perform public.notify(old.reviewed_by, 'resubmitted', subj,
      format('%s resubmitted the %s you sent back.', coalesce(author, 'The author'), public.kind_label(new.kind)), 'review/');
    return new;
  end if;
  if new.user_id is null or new.user_id = coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000') then return new; end if;
  if new.status in ('approved', 'merged', 'changes', 'rejected') then
    insert into public.messages (subject, kind, status, body)
    values (subj, 'decision', new.status, coalesce(nullif(btrim(new.review_note), ''),
      case new.status when 'approved' then 'Published.' when 'merged' then 'Update approved.' else 'No note.' end));
  end if;
  perform public.notify(new.user_id,
    case when new.status in ('approved', 'merged') then 'published' when new.status = 'changes' then 'sent_back'
         when old.status = 'approved' then 'unpublished' else 'not_accepted' end,
    subj,
    case
      when new.status = 'merged'   then format('Your update to your %s was approved and is live now. Thank you!', public.kind_label(new.kind))
      when new.status = 'approved' then format('Your %s was published. Thank you!', public.kind_label(new.kind))
      when new.status = 'changes'  then format('A reviewer asked for changes to your %s: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
      when old.status = 'approved' then format('Your %s was unpublished. Reason: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
      when new.replaces is not null then format('Your update to your %s wasn''t accepted, so the live version stays as it was. Reason: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
      else format('Your %s wasn''t accepted. Reason: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
    end,
    case when new.status in ('approved', 'merged') then public.submission_link(new) else 'inbox/#thread/' || subj end);
  return new;
end $$;

-- ───────── comments: replies, and a reviewer's decision ─────────
create function public.on_comment_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  parent_author uuid;
  who text;
begin
  -- it just became visible to everyone
  if new.status = 'visible' and (tg_op = 'INSERT' or old.status <> 'visible') then
    if tg_op = 'UPDATE' and public.is_reviewer() then
      perform public.notify(new.user_id, 'comment_live', 'comment:' || new.id,
        'Your comment was approved and is live on the class page.', 'courses/' || new.course_slug || '/#comments');
    end if;
    if new.parent_id is not null then
      select user_id into parent_author from public.comments where id = new.parent_id;
      if parent_author is distinct from new.user_id then
        select display_name into who from public.profiles where id = new.user_id;
        perform public.notify(parent_author, 'reply', 'comment:' || new.id,
          format('%s replied to your comment: %s', coalesce(who, 'Someone'), left(new.body, 140)),
          'courses/' || new.course_slug || '/#comments');
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'hidden' and old.status = 'visible' and public.is_reviewer() then
    perform public.notify(new.user_id, 'comment_hidden', 'comment:' || new.id,
      'A reviewer hid one of your comments. It broke a rule, or someone reported it and a reviewer agreed.', 'inbox/#work');
  end if;
  return new;
end $$;
create trigger comments_notify after insert or update of status on public.comments
  for each row execute function public.on_comment_notify();

-- ───────── feedback and reports: people see what happened to theirs ─────────
create policy "read your own feedback" on public.feedback for select using (user_id = auth.uid());
create policy "read your own reports" on public.reports for select using (user_id = auth.uid());

create function public.on_feedback_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('planned', 'done', 'closed') then
    perform public.notify(new.user_id, 'feedback', 'feedback:' || new.id,
      case new.status
        when 'planned' then format('Your feedback is planned: “%s”', left(new.message, 90))
        when 'done'    then format('Your feedback is done. Thank you! “%s”', left(new.message, 90))
        else format('Your feedback was closed: “%s”', left(new.message, 90)) end,
      'inbox/#thread/feedback:' || new.id);
  end if;
  return new;
end $$;
create trigger feedback_notify after update of status on public.feedback
  for each row execute function public.on_feedback_notify();

create function public.on_report_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.resolved and not old.resolved then
    perform public.notify(new.user_id, 'report', 'report:' || new.id,
      'Thanks. A reviewer looked at what you reported and handled it.', 'inbox/#thread/report:' || new.id);
  end if;
  return new;
end $$;
create trigger reports_notify after update of resolved on public.reports
  for each row execute function public.on_report_notify();

-- ───────── roles ─────────
create function public.set_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins change roles'; end if;
  if p_user = auth.uid() then raise exception 'You can''t change your own role'; end if;
  if p_role not in ('contributor', 'trusted', 'reviewer', 'admin') then raise exception 'Unknown role'; end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then raise exception 'No such member'; end if;
  perform public.notify(p_user, 'role', null,
    format('An admin changed your role to %s.', case p_role when 'contributor' then 'Contributor' when 'trusted' then 'Trusted contributor'
                                                            when 'reviewer' then 'Reviewer' else 'Admin' end), 'inbox/');
end $$;
revoke all on function public.set_role(uuid, text) from public, anon;
grant execute on function public.set_role(uuid, text) to authenticated;

commit;
