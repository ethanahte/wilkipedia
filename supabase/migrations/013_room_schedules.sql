-- Migration 013: room schedules, one teacher's periods for one school year.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
-- Only widens the list of allowed kinds (like migration 004). No rows change,
-- and nothing is removed: the constraint is swapped for a longer list that
-- still includes every existing kind.
-- A room_schedule has no course: course_slug stays null, `teacher` names the
-- teacher, and the payload holds school_year, room, periods {"1": "Civics", …}
-- and an optional source. A new school year is a new row, so past years stay.

begin;

alter table public.submissions drop constraint submissions_kind_check;
alter table public.submissions add constraint submissions_kind_check check (kind in
  ('course_overview', 'teacher_section', 'resource', 'tip', 'summer_hw', 'school_info', 'club', 'sport',
   'room_schedule'));

commit;
