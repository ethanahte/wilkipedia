-- Migration 022: admins may approve their own suggested edits (Ethan, 2026-10-19: he added the
-- syllabus PDF to a post and couldn't approve it, because since migration 021 nobody can approve
-- their own edit, and he is the admin who reviews). Reviewers still can't approve their own.
-- Run once in Supabase → SQL Editor, after a backup (python3 tools/backup.py). Run 021 first.
-- Replaces one function. No table, row or column is dropped.

create or replace function public.on_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  orig public.submissions;
  who text;
begin
  if new.status = 'approved' and old.status <> 'approved' and new.replaces is not null then
    if new.user_id = auth.uid() and not public.is_admin() then
      raise exception 'You can''t approve your own edit. Another reviewer or an admin has to.';
    end if;
    select * into orig from public.submissions where id = new.replaces for update;
    if found and orig.status = 'approved' then
      select display_name into who from public.profiles where id = new.user_id;
      insert into public.submission_edits (submission_id, editor_id, old_payload, new_payload, note)
      values (orig.id, new.user_id, orig.payload, new.payload, left(
        case when new.user_id is not distinct from orig.user_id
             then format('Update from the author (submission %s), approved by a reviewer', new.id)
             else format('Edit by %s (submission %s), approved by a reviewer: %s', coalesce(who, 'a member'), new.id,
                         coalesce(nullif(btrim(new.edit_note), ''), 'no note')) end, 500));
      update public.submissions
         set payload = new.payload, edited_at = now(), edited_by = new.user_id,
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

-- Undo: re-run on_review() from migration 021 (the same function without "and not public.is_admin()").
