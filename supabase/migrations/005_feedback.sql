-- Migration 005: a feedback box for ideas, bug reports and feature requests.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
-- Anyone can send feedback, signed in or not. Only reviewers and admins can
-- read it, and only they can change its status.

begin;

create table public.feedback (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('idea', 'bug', 'feature', 'other')),
  message    text not null check (char_length(message) between 3 and 2000),
  page       text check (char_length(page) <= 300),
  name       text check (char_length(name) <= 60),
  user_id    uuid default auth.uid() references public.profiles on delete set null,
  status     text not null default 'new' check (status in ('new', 'planned', 'done', 'closed')),
  created_at timestamptz not null default now()
);

create function public.on_feedback_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.status := 'new';
  new.created_at := now();
  return new;
end $$;

create trigger feedback_insert before insert on public.feedback
  for each row execute function public.on_feedback_insert();

alter table public.feedback enable row level security;
create policy "anyone can send feedback" on public.feedback for insert to anon, authenticated with check (true);
create policy "reviewers read feedback" on public.feedback for select using (public.is_reviewer());
create policy "reviewers update feedback" on public.feedback for update using (public.is_reviewer());
create policy "reviewers delete feedback" on public.feedback for delete using (public.is_reviewer());

commit;
