-- Migration 019: the SAT page (Ethan, 2026-10-02: "so people can also use it to post, and study SAT").
-- Run once in Supabase → SQL Editor, after a backup (python3 tools/backup.py).
-- Adds only: no table, row or column is dropped, and every existing post keeps working.
--
-- 1. A new kind of submission, 'sat' (an SAT post: a tip, how someone studied, their own notes as
--    a PDF, or a link). It belongs to no class (course_slug is null), like school_info.
-- 2. The SAT page's discussion is an ordinary comment thread with course_slug = 'sat', so it
--    needs no new table. Notifications about those comments now link to sat/, not courses/sat/.

-- 1. Allow kind = 'sat' (the check is widened: every kind allowed before is still allowed)
alter table public.submissions drop constraint if exists submissions_kind_check;
alter table public.submissions add constraint submissions_kind_check check (kind in
  ('course_overview', 'teacher_section', 'resource', 'tip', 'summer_hw', 'school_info',
   'club', 'sport', 'room_schedule', 'sat'));

-- Where a submission lives, for notification links
create or replace function public.submission_link(s public.submissions) returns text
language sql immutable as $$
  select case
    when s.kind = 'club'  then 'clubs/'
    when s.kind = 'sport' then 'sports/'
    when s.kind = 'sat'   then 'sat/#p-' || s.id
    when s.course_slug is not null then 'courses/' || s.course_slug || '/'
    else 'school/' end
$$;

create or replace function public.kind_label(k text) returns text
language sql immutable as $$
  select case k
    when 'course_overview' then 'course overview' when 'teacher_section' then 'teacher section'
    when 'resource' then 'resource' when 'tip' then 'tip' when 'summer_hw' then 'summer homework info'
    when 'school_info' then 'school info article' when 'club' then 'club info' when 'sport' then 'team info'
    when 'sat' then 'SAT post'
    else 'submission' end
$$;

-- 2. Where a comment thread lives: a class page, or a page with its own thread (THREADS in ui.js)
create or replace function public.comment_link(slug text) returns text
language sql immutable as $$
  select case slug when 'sat' then 'sat/#comments' else 'courses/' || slug || '/#comments' end
$$;

create or replace function public.on_comment_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  parent_author uuid;
  who text;
begin
  -- it just became visible to everyone
  if new.status = 'visible' and (tg_op = 'INSERT' or old.status <> 'visible') then
    if tg_op = 'UPDATE' and public.is_reviewer() then
      perform public.notify(new.user_id, 'comment_live', 'comment:' || new.id,
        'Your comment was approved and is live now.', public.comment_link(new.course_slug));
    end if;
    if new.parent_id is not null then
      select user_id into parent_author from public.comments where id = new.parent_id;
      if parent_author is distinct from new.user_id then
        select display_name into who from public.profiles where id = new.user_id;
        perform public.notify(parent_author, 'reply', 'comment:' || new.id,
          format('%s replied to your comment: %s', coalesce(who, 'Someone'), left(new.body, 140)),
          public.comment_link(new.course_slug));
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'hidden' and old.status = 'visible' and public.is_reviewer() then
    perform public.notify(new.user_id, 'comment_hidden', 'comment:' || new.id,
      'A reviewer hid one of your comments. It broke a rule, or someone reported it and a reviewer agreed.', 'inbox/#work');
  end if;
  return new;
end $$;

-- Check: this should list 'sat' among the allowed kinds:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'submissions_kind_check';
--
-- Undo (only once no 'sat' posts exist): put the old check back, without 'sat'.
--   alter table public.submissions drop constraint submissions_kind_check;
--   alter table public.submissions add constraint submissions_kind_check check (kind in
--     ('course_overview', 'teacher_section', 'resource', 'tip', 'summer_hw', 'school_info',
--      'club', 'sport', 'room_schedule'));
