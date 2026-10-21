-- Migration 024: Requests (Ethan, 2026-10-20: "a request section where students could request
-- resources and people can see it, so people know what people need").
-- Run once in Supabase → SQL Editor, after a backup (python3 tools/backup.py).
-- Adds two tables, their policies and three triggers. Nothing is dropped or changed.
--
-- A request is one short line ("A study guide for AP Bio chapter 9") for a class, or for the whole
-- school when course_slug is null. Others add "Me too" (request_votes); the list sorts by how many
-- people want it. When someone makes it, a reviewer (or the asker) marks it done with a link, and
-- the asker and everyone who said "Me too" are notified.
--
-- Moderation follows comments, a little lighter: the review team and school accounts post straight
-- away; personal accounts wait for a reviewer ('held'). Reviewers can hide a request ('hidden').
-- No asking for tests or answer keys (Community rules); the form says so and reviewers hide them.

create table public.requests (
  id          bigint generated always as identity primary key,
  course_slug text,                                   -- null: the whole school (SAT, general)
  teacher     text,
  kind        text not null check (kind in ('guide', 'practice', 'notes', 'teacher', 'overview', 'other')),
  body        text not null check (char_length(btrim(body)) between 3 and 300),
  user_id     uuid default auth.uid() references public.profiles on delete set null,
  status      text not null default 'held' check (status in ('held', 'open', 'done', 'hidden')),
  done_note   text check (done_note is null or char_length(done_note) <= 300),
  done_link   text check (done_link is null or char_length(done_link) <= 500),
  done_by     uuid references public.profiles on delete set null,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.requests (course_slug, status);
create index on public.requests (status, created_at desc);

create table public.request_votes (
  request_id bigint not null references public.requests on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

-- Who posts instantly, and a cap of 10 new requests a day per person
create function public.on_request_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text;
  school boolean;
begin
  select role, school_verified into r, school from public.profiles where id = auth.uid();
  if (select count(*) from public.requests where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s 10 requests today. Try again tomorrow.';
  end if;
  new.user_id := auth.uid();
  new.created_at := now();
  new.body := btrim(new.body);
  new.done_note := null; new.done_link := null; new.done_by := null; new.done_at := null;
  new.status := case when r in ('reviewer', 'admin') or school then 'open' else 'held' end;
  return new;
end $$;
create trigger requests_insert before insert on public.requests
  for each row execute function public.on_request_insert();

-- The asker may only mark their own open request done (or reopen it); everything else is the
-- review team's. Marking done stamps who and when.
create function public.on_request_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_reviewer() then
    if new.user_id is distinct from auth.uid()
       or new.body is distinct from old.body or new.kind is distinct from old.kind
       or new.course_slug is distinct from old.course_slug or new.teacher is distinct from old.teacher
       or not ((old.status = 'open' and new.status = 'done') or (old.status = 'done' and new.status = 'open')) then
      raise exception 'Only the review team can change that.';
    end if;
  end if;
  if new.status = 'done' and old.status <> 'done' then
    new.done_by := auth.uid(); new.done_at := now();
  elsif new.status = 'open' and old.status = 'done' then
    new.done_by := null; new.done_at := null; new.done_note := null; new.done_link := null;
  end if;
  return new;
end $$;
create trigger requests_update before update on public.requests
  for each row execute function public.on_request_update();

-- Tell the asker and everyone who said "Me too" when it's done
create function public.on_request_done() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v uuid;
  msg text;
begin
  if new.status = 'done' and old.status <> 'done' then
    msg := format('Something you asked for is here: “%s”%s', left(new.body, 120),
                  case when new.done_note is not null then ' · ' || left(new.done_note, 120) else '' end);
    perform public.notify(new.user_id, 'request', 'request:' || new.id, msg, coalesce(new.done_link, 'requests/'));
    for v in select user_id from public.request_votes where request_id = new.id and user_id is distinct from new.user_id loop
      perform public.notify(v, 'request', 'request:' || new.id, msg, coalesce(new.done_link, 'requests/'));
    end loop;
  end if;
  return new;
end $$;
create trigger requests_done after update on public.requests
  for each row execute function public.on_request_done();

alter table public.requests enable row level security;
create policy "open and done requests are public" on public.requests for select
  using (status in ('open', 'done') or user_id = auth.uid() or public.is_reviewer());
create policy "members ask" on public.requests for insert with check (auth.uid() is not null);
create policy "asker or reviewers update" on public.requests for update
  using (user_id = auth.uid() or public.is_reviewer());
create policy "asker or reviewers delete" on public.requests for delete
  using (user_id = auth.uid() or public.is_reviewer());

alter table public.request_votes enable row level security;
create policy "votes are public" on public.request_votes for select using (true);
create policy "vote as yourself" on public.request_votes for insert with check (user_id = auth.uid());
create policy "take back your own vote" on public.request_votes for delete using (user_id = auth.uid());

-- Posting and voting need the current Terms, like comments and likes
create trigger require_terms before insert on public.requests for each row execute function public.require_terms();
create trigger require_terms before insert on public.request_votes for each row execute function public.require_terms();

grant select on public.requests, public.request_votes to anon, authenticated;
grant insert, update, delete on public.requests to authenticated;
grant insert, delete on public.request_votes to authenticated;
