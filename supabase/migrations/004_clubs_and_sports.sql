-- Migration 004: students can write about clubs and sports teams.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
-- Club and sport submissions have no course: course_slug stays null and the
-- club/team name lives in payload->>'name'. Nothing else about review changes.

begin;

alter table public.submissions drop constraint submissions_kind_check;
alter table public.submissions add constraint submissions_kind_check check (kind in
  ('course_overview', 'teacher_section', 'resource', 'tip', 'summer_hw', 'school_info', 'club', 'sport'));

commit;
