-- Migration 011: admins can edit the calendar.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
-- The Calendar page's events come from files (data/calendar.json, from the
-- school's official activities calendar, and data/calendar-extra.json). This
-- table holds the admins' changes on top of them:
--  • a row with `replaces` null is a new event;
--  • a row with `replaces` = a file event's id edits that event, or hides it
--    (hidden = true). Keyed by id, so a re-import of the files keeps the edits.
-- Everyone reads every row (a hide has to be seen to take effect); only admins write.

begin;

create table public.calendar_events (
  id         bigint generated always as identity primary key,
  replaces   text unique check (replaces is null or char_length(replaces) <= 120),
  hidden     boolean not null default false,
  start_on   date,
  end_on     date,
  title      text check (title is null or char_length(title) between 2 and 140),
  time_note  text check (time_note is null or char_length(time_note) <= 60),
  place      text check (place is null or char_length(place) <= 80),
  cat        text check (cat is null or cat in ('off', 'milestone', 'tests', 'sports', 'family', 'arts', 'spirit', 'schedule', 'school')),
  created_by uuid default auth.uid() references public.profiles on delete set null,
  updated_at timestamptz not null default now(),
  -- a new event needs the basics; an edit/hide of a file event may leave them to the file
  check (replaces is not null or (start_on is not null and title is not null and cat is not null)),
  check (end_on is null or start_on is null or end_on >= start_on)
);

alter table public.calendar_events enable row level security;
create policy "calendar edits are public" on public.calendar_events for select using (true);
create policy "admins add calendar events" on public.calendar_events for insert with check (public.is_admin());
create policy "admins edit calendar events" on public.calendar_events for update using (public.is_admin());
create policy "admins delete calendar events" on public.calendar_events for delete using (public.is_admin());

commit;
