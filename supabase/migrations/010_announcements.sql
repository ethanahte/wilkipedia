-- Migration 010: the announcement bar.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
--  • Admins post, edit, hide and delete announcements (Review → Announcements).
--  • Everyone, signed in or not, sees the live ones: shown, and not past their
--    end date (in Wilcox's time zone). They appear under the header on every page.
--  • kind 'school' = news about Wilcox; 'site' = news about Wilkipedia.

begin;

create table public.announcements (
  id         bigint generated always as identity primary key,
  kind       text not null default 'site' check (kind in ('school', 'site')),
  message    text not null check (char_length(message) between 3 and 280),
  link       text check (link is null or (char_length(link) <= 500 and link ~ '^(https?://|/)')),
  ends_on    date,
  active     boolean not null default true,
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;
create policy "live announcements are public" on public.announcements for select
  using ((active and (ends_on is null or ends_on >= (now() at time zone 'America/Los_Angeles')::date))
         or public.is_admin());
create policy "admins post announcements" on public.announcements for insert with check (public.is_admin());
create policy "admins edit announcements" on public.announcements for update using (public.is_admin());
create policy "admins delete announcements" on public.announcements for delete using (public.is_admin());

commit;
