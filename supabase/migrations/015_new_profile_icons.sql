-- Migration 015: three new profile icons: rose, bulb (light bulb) and bird.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
-- Back up first:  python3 tools/backup.py
--
-- Only widens the list of allowed icons (like migrations 004 and 013 did for
-- kinds). No rows change and nothing is removed: the check is swapped for a
-- longer list that still includes every existing icon. tiger and ball are gone
-- from the picker (nobody had them) but stay allowed here.

begin;

alter table public.profiles drop constraint profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (avatar in
  ('fox', 'panda', 'tiger', 'owl', 'turtle', 'octopus', 'frog', 'penguin', 'cat', 'dog', 'koala', 'bee',
   'bolt', 'rocket', 'books', 'flask', 'palette', 'music', 'ball', 'star', 'rose', 'bulb', 'bird'));

commit;
