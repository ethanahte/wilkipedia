-- Migration 007: reviewers can edit published work, and authors get notified.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
--
--  • edit_submission(id, payload, note): reviewers only. Saves the old version
--    in submission_edits, updates the submission, and notifies the author.
--  • notifications: one row per message to a user. Users read and mark their
--    own; they are created only by the functions/triggers below.
--  • Authors are also notified when their work is published, sent back for
--    changes, rejected or unpublished.

begin;

alter table public.submissions
  add column edited_at timestamptz,
  add column edited_by uuid references public.profiles on delete set null;

create table public.submission_edits (
  id            bigint generated always as identity primary key,
  submission_id bigint not null references public.submissions on delete cascade,
  editor_id     uuid references public.profiles on delete set null,
  old_payload   jsonb not null,
  new_payload   jsonb not null,
  note          text not null check (char_length(note) between 1 and 500),
  created_at    timestamptz not null default now()
);
alter table public.submission_edits enable row level security;
create policy "author and reviewers read edits" on public.submission_edits for select
  using (public.is_reviewer()
         or exists (select 1 from public.submissions s where s.id = submission_id and s.user_id = auth.uid()));

create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  message    text not null,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, read);
alter table public.notifications enable row level security;
create policy "read your own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark your own as read" on public.notifications for update using (user_id = auth.uid());
create policy "delete your own notifications" on public.notifications for delete using (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;

-- Where a submission lives, for notification links (paths relative to the site root)
create function public.submission_link(s public.submissions) returns text
language sql immutable as $$
  select case
    when s.kind = 'club'  then 'clubs/'
    when s.kind = 'sport' then 'sports/'
    when s.course_slug is not null then 'courses/' || s.course_slug || '/'
    else 'school/' end
$$;

create function public.kind_label(k text) returns text
language sql immutable as $$
  select case k
    when 'course_overview' then 'course overview' when 'teacher_section' then 'teacher section'
    when 'resource' then 'resource' when 'tip' then 'tip' when 'summer_hw' then 'summer homework info'
    when 'school_info' then 'school info article' when 'club' then 'club info' when 'sport' then 'team info'
    else 'submission' end
$$;

create function public.edit_submission(p_id bigint, p_payload jsonb, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.submissions;
  editor text;
begin
  if not public.is_reviewer() then raise exception 'Only reviewers can edit other people''s work'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Say what you changed and why'; end if;
  select * into s from public.submissions where id = p_id for update;
  if not found then raise exception 'That submission no longer exists'; end if;

  insert into public.submission_edits (submission_id, editor_id, old_payload, new_payload, note)
  values (p_id, auth.uid(), s.payload, p_payload, btrim(p_note));
  update public.submissions set payload = p_payload, edited_at = now(), edited_by = auth.uid() where id = p_id;

  if s.user_id is not null and s.user_id <> auth.uid() then
    select display_name into editor from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, message, link)
    values (s.user_id, format('%s (reviewer) edited your %s. Reason: %s', coalesce(editor, 'A reviewer'),
                              public.kind_label(s.kind), btrim(p_note)), public.submission_link(s));
  end if;
end $$;
grant execute on function public.edit_submission(bigint, jsonb, text) to authenticated;

-- Tell authors when a reviewer changes the status of their work
create function public.on_status_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.user_id is not null and new.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000') then
    insert into public.notifications (user_id, message, link)
    values (new.user_id,
      case
        when new.status = 'approved' then format('Your %s was published. Thank you!', public.kind_label(new.kind))
        when new.status = 'changes'  then format('A reviewer asked for changes to your %s: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
        when old.status = 'approved' then format('Your %s was unpublished. Reason: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
        else format('Your %s wasn''t accepted. Reason: %s', public.kind_label(new.kind), coalesce(new.review_note, ''))
      end,
      case when new.status = 'approved' then public.submission_link(new) else 'account/' end);
  end if;
  return new;
end $$;

create trigger submissions_notify after update of status on public.submissions
  for each row execute function public.on_status_notify();

commit;
