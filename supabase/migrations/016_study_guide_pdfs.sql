-- Migration 016: student-made study guides are uploaded as PDFs and kept here,
-- so they outlive the author's school account and never depend on Drive sharing.
-- Run once in Supabase → SQL Editor. (schema.sql already includes this for fresh setups.)
-- Back up first:  python3 tools/backup.py
--
--  • A private storage bucket, `guides`: PDFs only, 5 MB each.
--  • Uploads go to a folder named after the uploader: <user id>/<random>.pdf.
--  • Who can open a file: its uploader, reviewers, and everyone once a published
--    submission points at it (payload.pdf.path). So a guide that was sent back or
--    rejected can't be passed around as a link to our storage.
--  • A submission may only point at a file in its own author's folder.
--
-- Nothing is removed and no rows change. Files are never deleted by this; a PDF
-- whose submission was withdrawn just stays private to its uploader and reviewers.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guides', 'guides', false, 5242880, array['application/pdf']);

create policy "upload guides to your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'guides' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "published guides are public, own and reviewers see all" on storage.objects for select
  using (bucket_id = 'guides' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_reviewer()
    or exists (select 1 from public.submissions s
                where s.status = 'approved' and s.payload -> 'pdf' ->> 'path' = objects.name)));

create function public.check_submission_pdf() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.payload ? 'pdf' and (tg_op = 'INSERT' or new.payload -> 'pdf' is distinct from old.payload -> 'pdf') then
    if coalesce(new.payload -> 'pdf' ->> 'path', '') !~ ('^' || new.user_id::text || '/[0-9a-f-]{36}\.pdf$') then
      raise exception 'That PDF isn''t one you uploaded';
    end if;
  end if;
  return new;
end $$;

create trigger submissions_pdf before insert or update on public.submissions
  for each row execute function public.check_submission_pdf();

commit;
