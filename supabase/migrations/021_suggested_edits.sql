-- Migration 021: suggested edits (Ethan, 2026-10-04: "now anyone can edit, can you add a review
-- process … and also send a notification to the original author when other people edit it").
-- Run once in Supabase → SQL Editor, after a backup (python3 tools/backup.py). Run 020 first.
-- Adds one column and replaces five functions. No table, row or column is dropped.
--
-- How it works now:
--   • Any signed-in member can suggest an edit to any live post. A suggestion is a submission with
--     `replaces` = the live post and user_id = whoever suggested it, plus their note in `edit_note`.
--     Reviewers and admins edit live posts the same way. One waiting edit per post at a time.
--   • Nothing changes on the site until someone on the review team approves it, and nobody can
--     approve their own suggestion. Approving copies it onto the live post (the old version is kept
--     in submission_edits), as authors' own updates already did.
--   • When it goes live, the post's author gets a notification saying who changed what.
--   • Reviewers can still edit work that is waiting for review, and their own posts, directly.

-- 1. The suggester's note ("Added a PDF version.")
alter table public.submissions add column if not exists edit_note text
  check (edit_note is null or char_length(edit_note) <= 500);

-- 2. Anyone may suggest an edit to a live post, one waiting edit per post
create or replace function public.on_submission_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  orig public.submissions;
  waiting public.submissions;
begin
  if new.replaces is not null then
    select * into orig from public.submissions where id = new.replaces;
    if not found or orig.status <> 'approved' then
      raise exception 'You can only suggest an edit to something that''s on the site';
    end if;
    select * into waiting from public.submissions
     where replaces = new.replaces and status in ('pending', 'changes') limit 1;
    if found then
      if waiting.user_id = auth.uid() then
        raise exception 'You already have an edit to this waiting for review. Change that one instead (Dashboard → Your work).';
      end if;
      raise exception 'Someone else''s edit to this is waiting for review. Try again once a reviewer has looked at it.';
    end if;
    new.kind := orig.kind;
    new.course_slug := orig.course_slug;
    new.teacher := orig.teacher;
    new.bounty_id := null;
  end if;
  return new;
end $$;

-- 3. Approving: never your own suggestion; the suggester is the editor of record
create or replace function public.on_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  orig public.submissions;
  who text;
begin
  if new.status = 'approved' and old.status <> 'approved' and new.replaces is not null then
    if new.user_id = auth.uid() then
      raise exception 'You can''t approve your own edit. Another reviewer or an admin has to.';
    end if;
    select * into orig from public.submissions where id = new.replaces for update;
    if found and orig.status = 'approved' then
      select display_name into who from public.profiles where id = new.user_id;
      insert into public.submission_edits (submission_id, editor_id, old_payload, new_payload, note)
      values (orig.id, new.user_id, orig.payload, new.payload, left(
        case when new.user_id is not distinct from orig.user_id
             then format('Update from the author (submission %s), approved by a reviewer', new.id)
             else format('Edit by %s (submission %s), approved by a reviewer: %s', coalesce(who, 'a member'), new.id,
                         coalesce(nullif(btrim(new.edit_note), ''), 'no note')) end, 500));
      update public.submissions
         set payload = new.payload, edited_at = now(), edited_by = new.user_id,
             reviewed_by = auth.uid(), reviewed_at = now()
       where id = orig.id;
      new.status := 'merged';
    end if;
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'changes', 'rejected', 'merged') then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    update public.profiles set role = 'trusted'
     where id = new.user_id and role = 'contributor'
       and (select count(*) from public.submissions
             where user_id = new.user_id and status = 'approved') >= 2;  -- this one makes 3
  end if;
  return new;
end $$;

-- 4. Notifications: the suggester hears the decision; the post's author hears when it goes live
create or replace function public.on_status_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  subj text := 'submission:' || new.id;
  author text;
  orig public.submissions;
  theirs boolean := false;      -- an edit to someone else's post
  what text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.replaces is not null then
    select * into orig from public.submissions where id = new.replaces;
    theirs := found and orig.user_id is distinct from new.user_id;
  end if;
  -- the author sent a sent-back post in again: note it, and tell the reviewer who asked
  if old.status = 'changes' and new.status = 'pending' and auth.uid() = new.user_id then
    insert into public.messages (subject, kind, status, body) values (subj, 'decision', 'pending', 'Made the changes and resubmitted.');
    select display_name into author from public.profiles where id = new.user_id;
    perform public.notify(old.reviewed_by, 'resubmitted', subj,
      format('%s resubmitted the %s you sent back.', coalesce(author, 'The author'), public.kind_label(new.kind)), 'review/');
    return new;
  end if;
  -- someone else's edit to your post went live
  if new.status = 'merged' and theirs and orig.user_id is not null then
    select display_name into author from public.profiles where id = new.user_id;
    perform public.notify(orig.user_id, 'edited', 'submission:' || orig.id,
      format('%s edited your %s, and a reviewer approved it. %s The old version is kept.', coalesce(author, 'A member'),
             public.kind_label(new.kind), coalesce(nullif(btrim(new.edit_note), ''), '')),
      public.submission_link(orig));
  end if;
  if new.user_id is null or new.user_id = coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000') then return new; end if;
  if new.status in ('approved', 'merged', 'changes', 'rejected') then
    insert into public.messages (subject, kind, status, body)
    values (subj, 'decision', new.status, coalesce(nullif(btrim(new.review_note), ''),
      case new.status when 'approved' then 'Published.' when 'merged' then 'Update approved.' else 'No note.' end));
  end if;
  what := case when theirs then format('edit to the %s', public.kind_label(new.kind))
               else format('update to your %s', public.kind_label(new.kind)) end;
  perform public.notify(new.user_id,
    case when new.status in ('approved', 'merged') then 'published' when new.status = 'changes' then 'sent_back'
         when old.status = 'approved' then 'unpublished' else 'not_accepted' end,
    subj,
    case
      when new.status = 'merged'   then format('Your %s was approved and is live now. Thank you!', what)
      when new.status = 'approved' then format('Your %s was published. Thank you!', public.kind_label(new.kind))
      when new.status = 'changes'  then format('A reviewer asked for changes to your %s: %s',
                                               case when new.replaces is not null then what else public.kind_label(new.kind) end, coalesce(new.review_note, ''))
      when old.status = 'approved' then format('Your %s was unpublished. Reason: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
      when new.replaces is not null then format('Your %s wasn''t accepted, so the live version stays as it was. Reason: %s', what, coalesce(new.review_note, ''))
      else format('Your %s wasn''t accepted. Reason: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
    end,
    case when new.status in ('approved', 'merged') then public.submission_link(new) else 'inbox/#thread/' || subj end);
  return new;
end $$;

-- 5. Direct edits: work waiting for review, or your own post. Someone else's live post takes a
--    suggested edit, so another reviewer sees it first.
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
  if s.status = 'approved' and s.user_id is distinct from auth.uid() then
    raise exception 'Edits to someone else''s live post go to review now: suggest the edit instead.';
  end if;

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

-- 6. PDFs: a suggested edit can carry a PDF from the suggester's folder; approving it copies that
--    file onto the live post, so the live post may point at a file its waiting edit brought
create or replace function public.check_submission_pdf() returns trigger
language plpgsql set search_path = public as $$
declare
  p text := coalesce(new.payload -> 'pdf' ->> 'path', '');
  shape text := '/[0-9a-f-]{36}\.pdf$';
begin
  if new.payload ? 'pdf' and (tg_op = 'INSERT' or new.payload -> 'pdf' is distinct from old.payload -> 'pdf') then
    if not (p ~ ('^' || coalesce(new.user_id::text, '-') || shape)
            or (public.is_reviewer() and p ~ ('^' || coalesce(auth.uid()::text, '-') || shape))
            or (tg_op = 'UPDATE' and exists (select 1 from public.submissions u
                                              where u.replaces = new.id and u.payload -> 'pdf' ->> 'path' = p))) then
      raise exception 'That PDF isn''t one you uploaded';
    end if;
  end if;
  return new;
end $$;

-- Check: as a member, suggest an edit to someone else's post: it shows in the review queue, the
-- review desk won't let you approve your own, and once another reviewer approves it the author
-- gets "… edited your …".
--
-- Undo: re-run the function definitions from migrations 014, 017 and 020 (the column can stay).
