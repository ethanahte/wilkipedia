-- Migration 006: public credits for people whose feedback helped.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
-- Feedback itself stays private to reviewers. This view exposes only the NAME
-- people chose to leave ("so we can thank you") on feedback a reviewer marked
-- done, and how many such messages they sent. No message text, no page, no ids.

create view public.feedback_credits as
select name, count(*)::int as helped
  from public.feedback
 where status = 'done' and name is not null and btrim(name) <> ''
 group by name;

grant select on public.feedback_credits to anon, authenticated;
