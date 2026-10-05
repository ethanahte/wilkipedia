-- Migration 020: reviewers can add or replace the PDF on someone else's study guide
-- (Ethan, 2026-10-04: adding the PDF versions of the AP Macro Unit 1 and 2 guides, which were links).
-- Run once in Supabase → SQL Editor, after a backup (python3 tools/backup.py).
-- Changes one check only: no table, row or column is dropped.
--
-- A PDF is uploaded to the uploader's own folder (<their id>/<random>.pdf). Until now a post could
-- only point at a file in its AUTHOR's folder, so a reviewer's edit that added a PDF was refused.
-- Now a post may also point at a file in the folder of the reviewer saving it. Everyone else is
-- held to their own files, as before. (Published PDFs are readable by the path in the post,
-- whichever folder it's in, so the file shows for everyone once it's on a live post.)

create or replace function public.check_submission_pdf() returns trigger
language plpgsql set search_path = public as $$
declare
  p text := coalesce(new.payload -> 'pdf' ->> 'path', '');
  shape text := '/[0-9a-f-]{36}\.pdf$';
begin
  if new.payload ? 'pdf' and (tg_op = 'INSERT' or new.payload -> 'pdf' is distinct from old.payload -> 'pdf') then
    if not (p ~ ('^' || coalesce(new.user_id::text, '-') || shape)
            or (public.is_reviewer() and p ~ ('^' || coalesce(auth.uid()::text, '-') || shape))) then
      raise exception 'That PDF isn''t one you uploaded';
    end if;
  end if;
  return new;
end $$;

-- Undo: put back the author-only check
--   create or replace function public.check_submission_pdf() returns trigger
--   language plpgsql set search_path = public as $u$
--   begin
--     if new.payload ? 'pdf' and (tg_op = 'INSERT' or new.payload -> 'pdf' is distinct from old.payload -> 'pdf') then
--       if coalesce(new.payload -> 'pdf' ->> 'path', '') !~ ('^' || new.user_id::text || '/[0-9a-f-]{36}\.pdf$') then
--         raise exception 'That PDF isn''t one you uploaded';
--       end if;
--     end if;
--     return new;
--   end $u$;
