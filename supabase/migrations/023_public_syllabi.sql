-- Migration 023: syllabus PDFs are public (Ethan, 2026-10-19: "make it all ppl can see").
-- Run once in Supabase → SQL Editor, after a backup (python3 tools/backup.py). Run 020–022 first.
-- Adds one storage policy and replaces one function. Nothing is dropped.
--
-- Until now a syllabus PDF (teacher_section payload.syllabus_pdf) could be opened only by its uploader
-- and the review team. Now, like a study guide, it opens for everyone once the post it's on is published.
-- The upload form asks people to black out the teacher's email and phone first, and the review desk
-- reminds reviewers to check for them (the site doesn't publish teachers' contact details).

-- 1. Published syllabi are readable by anyone (the same rule study guides have, for the other key)
create policy "published syllabi are public" on storage.objects for select
  using (bucket_id = 'guides' and exists (select 1 from public.submissions s
          where s.status = 'approved' and s.payload -> 'syllabus_pdf' ->> 'path' = objects.name));

-- 2. Every PDF field must point at a file the post may use. Before, only payload.pdf was checked,
--    so payload.syllabus_pdf could name any file in the bucket; now that syllabi are public that
--    would let someone publish another person's private file. Same rules as migrations 020–021:
--    the author's folder, the folder of the reviewer saving it, or a file its suggested edit brought.
create or replace function public.check_submission_pdf() returns trigger
language plpgsql set search_path = public as $$
declare
  k text;
  p text;
  shape text := '/[0-9a-f-]{36}\.pdf$';
begin
  foreach k in array array['pdf', 'syllabus_pdf'] loop
    if new.payload ? k and (tg_op = 'INSERT' or new.payload -> k is distinct from old.payload -> k) then
      p := coalesce(new.payload -> k ->> 'path', '');
      if not (p ~ ('^' || coalesce(new.user_id::text, '-') || shape)
              or (public.is_reviewer() and p ~ ('^' || coalesce(auth.uid()::text, '-') || shape))
              or (tg_op = 'UPDATE' and exists (select 1 from public.submissions u
                                                where u.replaces = new.id and u.payload -> k ->> 'path' = p))) then
        raise exception 'That PDF isn''t one you uploaded';
      end if;
    end if;
  end loop;
  return new;
end $$;

-- Undo (syllabi private again; the stricter check can stay):
--   drop policy "published syllabi are public" on storage.objects;
