-- Replaces the Apps-Script pull-token design with a real, auto-created Google
-- Sheet per mess: the edge function itself creates the Sheet (via a Google
-- service account) the first time it's needed and keeps writing to it
-- directly, so opening it is one tap and never requires anyone to paste a
-- script. sheet_sync_token served the old pull-based design only and is
-- retired along with it; nothing has used it yet.

drop index if exists public.messes_sheet_sync_token_key;
alter table public.messes drop column if exists sheet_sync_token;
alter table public.messes add column if not exists gsheet_id text;
