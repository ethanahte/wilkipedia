-- Migration 012: Terms of Service.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
-- Everyone agrees to the Terms (terms/) before they can post. The agreement is
-- stored as the version they agreed to, so changing the Terms in a way that
-- matters means bumping the version: terms_current() below AND TERMS_VERSION in
-- assets/js/store.js. Everyone is then asked again on their next visit.
-- Until someone agrees they can still read, sign out and send feedback; the
-- trigger stops them posting, claiming, commenting, liking or reporting.

begin;

alter table public.profiles
  add column terms_version int,
  add column terms_accepted_at timestamptz;

create function public.terms_current() returns int
language sql immutable as $$ select 1 $$;

-- The only way to set the columns above: the server stamps the time.
create function public.accept_terms(v int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if v is distinct from public.terms_current() then
    raise exception 'The Terms have changed since this page loaded. Reload and try again.';
  end if;
  update public.profiles set terms_version = v, terms_accepted_at = now() where id = auth.uid();
end $$;
revoke all on function public.accept_terms(int) from public, anon;
grant execute on function public.accept_terms(int) to authenticated;

create function public.require_terms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not exists (
    select 1 from public.profiles where id = auth.uid() and terms_version >= public.terms_current()
  ) then
    raise exception 'Please agree to the Terms of Service first. Reload the page to see them.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger require_terms before insert on public.submissions   for each row execute function public.require_terms();
create trigger require_terms before insert on public.claims        for each row execute function public.require_terms();
create trigger require_terms before insert on public.comments      for each row execute function public.require_terms();
create trigger require_terms before insert on public.comment_likes for each row execute function public.require_terms();
create trigger require_terms before insert on public.reports       for each row execute function public.require_terms();

commit;
