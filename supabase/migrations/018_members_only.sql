-- Migration 018: lists of students are for signed-in members (Ethan, 2026-10-01: "so random people
-- that find this web will not have easy access to it").
-- Run once in Supabase → SQL Editor, after a backup (python3 tools/backup.py).
-- Changes permissions only: no table, row or column is dropped. To undo, re-grant (see the bottom).
--
-- What signed-out visitors can still read: published work, and on it the author's display name,
-- picture and SCUSD ✓ badge (the byline). That's what public pages need.
-- What now needs sign-in: the leaderboard, the names on feedback credits, and every other profile
-- field (class year, role, join date, leaderboard choice).

-- 1. The leaderboard and feedback credits: signed-in members only
revoke select on public.leaderboard from anon;
revoke select on public.feedback_credits from anon;

-- 2. Profiles: signed-out visitors see only what a byline shows. (Row access is unchanged: the
--    "profiles are public" policy still lets bylines work; the columns are what's narrowed.)
revoke select on public.profiles from anon;
grant select (id, display_name, school_verified, avatar, avatar_color) on public.profiles to anon;

-- Check: signed out (anon), these should fail with "permission denied":
--   select * from public.leaderboard;
--   select grad_year from public.profiles;
-- and this should still work:
--   select display_name, avatar from public.profiles limit 1;
--
-- Undo:
--   grant select on public.leaderboard, public.feedback_credits, public.profiles to anon;
