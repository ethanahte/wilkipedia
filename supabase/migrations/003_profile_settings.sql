-- Migration 003: profile settings.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
-- Profile pictures are chosen from a fixed set of icons and colours rather than
-- uploaded: nothing to moderate, and no photos of students on a public site.
-- The allowed keys below must match AVATARS / AVATAR_COLORS in assets/js/ui.js.

begin;

alter table public.profiles
  add column avatar text check (avatar in ('fox', 'panda', 'tiger', 'owl', 'turtle', 'octopus',
    'frog', 'penguin', 'cat', 'dog', 'koala', 'bee', 'bolt', 'rocket', 'books', 'flask',
    'palette', 'music', 'ball', 'star')),
  add column avatar_color text not null default 'green' check (avatar_color in
    ('green', 'blue', 'purple', 'red', 'orange', 'teal', 'pink', 'gray')),
  add column grad_year int check (grad_year between 2020 and 2040),
  add column show_on_leaderboard boolean not null default true;

-- Users may edit these columns of their own row and nothing else.
grant update (avatar, avatar_color, grad_year, show_on_leaderboard) on public.profiles to authenticated;

-- Leaderboard: respects the opt-out, and carries the picture. New columns go last.
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
       p.school_verified,
       p.avatar,
       p.avatar_color,
       p.grad_year
  from public.profiles p
  join pts on pts.user_id = p.id
  join subs on subs.user_id = p.id
 where p.show_on_leaderboard
 group by p.id;

commit;
