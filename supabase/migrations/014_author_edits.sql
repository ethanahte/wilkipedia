-- Migration 014: authors can edit, resubmit, withdraw and update their own work.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
-- Back up first:  python3 tools/backup.py
--
--  • edit_own_submission(id, payload): the author changes a submission that is
--    still waiting for review ('pending') or was sent back ('changes'). A sent-back
--    one goes back into the review queue. The old version is kept in
--    submission_edits, and the reviewer's last note stays so the next reviewer
--    can see what was asked.
--  • withdraw_submission(id): the author takes back a 'pending' or 'changes'
--    submission. Its status becomes 'withdrawn'. The row is kept, not deleted.
--  • Updating live work: the author submits a new row with `replaces` = the id
--    of their published submission. The live one stays up while the update
--    waits. When a reviewer approves the update, its text is copied onto the
--    live submission (the old text is kept in submission_edits) and the update
--    row becomes 'merged'. So links, points and the page never show two copies.
--    If the original was unpublished in the meantime, the update is simply
--    published as it is.
--
-- Nothing is removed and no rows change. The status constraint is swapped for a
-- longer list that still includes every existing status (like migrations 004
-- and 013 did for kinds). The two trigger functions are replaced with versions
-- that do everything the old ones did, plus the above.

begin;

alter table public.submissions drop constraint submissions_status_check;
alter table public.submissions add constraint submissions_status_check
  check (status in ('pending', 'approved', 'changes', 'rejected', 'withdrawn', 'merged'));

alter table public.submissions add column replaces bigint references public.submissions on delete set null;
create index on public.submissions (replaces);

-- An update must point at the author's own published work, copies where that
-- work lives, and there is one waiting update per published submission at a time.
create function public.on_submission_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  orig public.submissions;
begin
  if new.replaces is not null then
    select * into orig from public.submissions where id = new.replaces;
    if not found or orig.user_id is distinct from auth.uid() or orig.status <> 'approved' then
      raise exception 'You can only send an update for your own published work';
    end if;
    if exists (select 1 from public.submissions
                where replaces = new.replaces and status in ('pending', 'changes')) then
      raise exception 'You already have an update waiting for review. Edit that one instead.';
    end if;
    new.kind := orig.kind;
    new.course_slug := orig.course_slug;
    new.teacher := orig.teacher;
    new.bounty_id := null;
  end if;
  return new;
end $$;

create trigger submissions_replaces before insert on public.submissions
  for each row execute function public.on_submission_insert();

-- Stamp the reviewer, merge an approved update into the live submission, and
-- promote a contributor to trusted after 3 approvals. Author actions
-- (resubmitting, withdrawing) don't stamp a reviewer.
create or replace function public.on_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  orig public.submissions;
begin
  if new.status = 'approved' and old.status <> 'approved' and new.replaces is not null then
    select * into orig from public.submissions where id = new.replaces for update;
    if found and orig.status = 'approved' then
      insert into public.submission_edits (submission_id, editor_id, old_payload, new_payload, note)
      values (orig.id, auth.uid(), orig.payload, new.payload,
              format('Update from the author (submission %s), approved by a reviewer', new.id));
      update public.submissions
         set payload = new.payload, edited_at = now(), edited_by = orig.user_id,
             reviewed_by = auth.uid(), reviewed_at = now()
       where id = orig.id;
      new.status := 'merged';
    end if;
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'changes', 'rejected', 'merged') then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    update public.profiles set role = 'trusted'
     where id = new.user_id and role = 'contributor'
       and (select count(*) from public.submissions
             where user_id = new.user_id and status = 'approved') >= 2;  -- this one makes 3
  end if;
  return new;
end $$;

-- Tell authors when a reviewer changes the status of their work
create or replace function public.on_status_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.user_id is not null and new.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000') then
    insert into public.notifications (user_id, message, link)
    values (new.user_id,
      case
        when new.status = 'merged'   then format('Your update to your %s was approved and is live now. Thank you!', public.kind_label(new.kind))
        when new.status = 'approved' then format('Your %s was published. Thank you!', public.kind_label(new.kind))
        when new.status = 'changes'  then format('A reviewer asked for changes to your %s: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
        when old.status = 'approved' then format('Your %s was unpublished. Reason: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
        when new.replaces is not null then format('Your update to your %s wasn''t accepted, so the live version stays as it was. Reason: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
        else format('Your %s wasn''t accepted. Reason: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
      end,
      case when new.status in ('approved', 'merged') then public.submission_link(new) else 'account/' end);
  end if;
  return new;
end $$;

create function public.edit_own_submission(p_id bigint, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.submissions;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Nothing to save'; end if;
  select * into s from public.submissions where id = p_id for update;
  if not found or s.user_id is distinct from auth.uid() then raise exception 'You can only edit your own submissions'; end if;
  if s.status not in ('pending', 'changes') then
    raise exception 'Only work that is waiting for review or was sent back can be edited';
  end if;
  insert into public.submission_edits (submission_id, editor_id, old_payload, new_payload, note)
  values (p_id, auth.uid(), s.payload, p_payload,
          case when s.status = 'changes' then 'Author made the changes and resubmitted' else 'Author edited before review' end);
  -- edited_at/edited_by stay as they are: they mark changes made after publishing
  update public.submissions set payload = p_payload, status = 'pending' where id = p_id;
end $$;
grant execute on function public.edit_own_submission(bigint, jsonb) to authenticated;

create function public.withdraw_submission(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.submissions;
begin
  select * into s from public.submissions where id = p_id for update;
  if not found or s.user_id is distinct from auth.uid() then raise exception 'You can only withdraw your own submissions'; end if;
  if s.status not in ('pending', 'changes') then
    raise exception 'Only work that is waiting for review or was sent back can be withdrawn';
  end if;
  update public.submissions set status = 'withdrawn' where id = p_id;
end $$;
grant execute on function public.withdraw_submission(bigint) to authenticated;

commit;
