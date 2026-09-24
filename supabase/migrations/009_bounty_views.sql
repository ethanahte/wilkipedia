-- Migration 009: what the Agenda and Ledger views need.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
--  • due_on: an optional deadline, which is what the Agenda lays out day by day.
--  • 'done': a bounty can now be finished, not only closed. The Ledger keeps
--    the two apart: done = completed, closed = withdrawn.
--  • closed_at: stamped automatically when a bounty leaves the board, and
--    cleared if it is reposted. The Ledger is sorted by it.
-- Rank S–D is shown from the existing priority column (5 = S … 1 = D).

begin;

alter table public.bounties
  add column due_on    date,
  add column closed_at timestamptz;

alter table public.bounties drop constraint bounties_status_check;
alter table public.bounties add constraint bounties_status_check
  check (status in ('open', 'done', 'closed'));

create function public.on_bounty_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.closed_at := case when new.status = 'open' then null else now() end;
  end if;
  return new;
end $$;

create trigger bounties_status before update of status on public.bounties
  for each row execute function public.on_bounty_status();

commit;
