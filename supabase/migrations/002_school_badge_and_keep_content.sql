-- Migration 002: school-account badge + content that outlives accounts.
-- Run once in Supabase → SQL Editor on a database created from the ORIGINAL
-- schema.sql. (schema.sql already includes these changes for fresh setups.)
--
-- 1. profiles.school_verified: true when the Google account is @scusd.net.
--    Shown as a badge. Users can't set it themselves (they may only update
--    display_name, see the column grant in schema.sql).
-- 2. Deleting an account no longer deletes what that person wrote: their
--    submissions and comments stay, credited to "Former student".
-- 3. Comments from personal (non-school) accounts always wait for review,
--    unless the author is a reviewer or admin.

begin;

-- 1 ── badge
alter table public.profiles add column school_verified boolean not null default false;

update public.profiles p set school_verified = true
  from auth.users u
 where u.id = p.id and lower(u.email) like '%@scusd.net';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, school_verified)
  values (new.id,
          left(coalesce(
            nullif(split_part(new.raw_user_meta_data->>'full_name', ' ', 1), ''),
            split_part(new.email, '@', 1)), 40),
          lower(coalesce(new.email, '')) like '%@scusd.net');
  return new;
end $$;

-- 2 ── keep content when an account is deleted
alter table public.submissions alter column user_id drop not null;
alter table public.submissions drop constraint submissions_user_id_fkey,
  add constraint submissions_user_id_fkey foreign key (user_id)
      references public.profiles on delete set null;
alter table public.submissions drop constraint submissions_reviewed_by_fkey,
  add constraint submissions_reviewed_by_fkey foreign key (reviewed_by)
      references public.profiles on delete set null;

alter table public.comments alter column user_id drop not null;
alter table public.comments drop constraint comments_user_id_fkey,
  add constraint comments_user_id_fkey foreign key (user_id)
      references public.profiles on delete set null;

-- 3 ── personal accounts' comments are always reviewed
create or replace function public.on_comment_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text;
  school boolean;
begin
  select role, school_verified into r, school from public.profiles where id = auth.uid();
  new.user_id := auth.uid();
  new.created_at := now();
  new.status := case
    when r in ('reviewer', 'admin') then 'visible'
    when r = 'trusted' and school then 'visible'
    else 'held' end;
  return new;
end $$;

-- Leaderboard carries the badge too (new column goes last, as
-- `create or replace view` requires).
create or replace view public.leaderboard as
with pts as (
  select distinct on (s.user_id, coalesce(s.bounty_id, s.id::text))
         s.user_id, s.reviewed_at,
         case b.size when 'S' then 10 when 'M' then 30 when 'L' then 60 else 5 end as points
    from public.submissions s left join public.bounties b on b.id = s.bounty_id
   where s.status = 'approved'
   order by s.user_id, coalesce(s.bounty_id, s.id::text), s.reviewed_at
), subs as (
  select user_id, count(*)::int as approved
    from public.submissions where status = 'approved' group by user_id
)
select p.id, p.display_name, p.role,
       sum(pts.points)::int as points,
       coalesce(sum(pts.points) filter (where pts.reviewed_at >=
         date_trunc('year', now()) + case when extract(month from now()) >= 8
                                          then interval '7 months' else interval '0' end), 0)::int
         as semester_points,
       max(subs.approved) as approved,
       p.school_verified
  from public.profiles p
  join pts on pts.user_id = p.id
  join subs on subs.user_id = p.id
 group by p.id;

commit;
