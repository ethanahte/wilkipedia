-- Migration 008: the bounty board belongs to the review team.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
--  • Only admins post, edit, close or delete bounties.
--  • Only reviewers and admins can see bounties and claims, or claim one.
--  • Everyone else can still contribute; they just don't see the board.
-- The leaderboard view still counts bounty points (views run as their owner).

begin;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

drop policy "bounties are public" on public.bounties;
drop policy "reviewers post bounties" on public.bounties;
drop policy "reviewers edit bounties" on public.bounties;
create policy "review team sees bounties" on public.bounties for select using (public.is_reviewer());
create policy "admins post bounties" on public.bounties for insert with check (public.is_admin());
create policy "admins edit bounties" on public.bounties for update using (public.is_admin());
create policy "admins delete bounties" on public.bounties for delete using (public.is_admin());

drop policy "claims are public" on public.claims;
drop policy "claim for yourself" on public.claims;
create policy "review team sees claims" on public.claims for select using (public.is_reviewer());
create policy "review team claims" on public.claims for insert
  with check (user_id = auth.uid() and public.is_reviewer()
              and exists (select 1 from public.bounties b where b.id = bounty_id and b.status = 'open'));

commit;
