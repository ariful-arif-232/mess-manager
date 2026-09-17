-- Live Google Sheet sync for the monthly Bazar / Khawa & Taka workbook.
--
-- The app already computes those two sheets correctly on the client (the
-- same calcMonth()/utilityLedger() logic the Dashboard and Settlement pages
-- use), so this does not reimplement that math in SQL — a member's browser
-- pushes the already-correct rendered rows here whenever it has fresh data
-- for the current real-world month, and a Google Apps Script the admin
-- pastes into their own Sheet pulls the latest snapshot on every open.
--
-- Mirrors the chat-push service's shape: a per-mess opaque token
-- (public.messes.sheet_sync_token) plays the same role as
-- chat_push_server_config.webhook_token, and this table is service-role
-- only (RLS enabled, no policies) exactly like push_subscriptions and
-- chat_push_dispatches — the mess-sheet edge function is the only writer,
-- using the SUPABASE_SERVICE_ROLE_KEY, after checking the caller's Supabase
-- session (for the browser-side push/get-token actions) or the token (for
-- the token-only pull action an Apps Script call makes with no user login).

alter table public.messes
  add column if not exists sheet_sync_token text;

create unique index if not exists messes_sheet_sync_token_key
  on public.messes (sheet_sync_token)
  where sheet_sync_token is not null;

create table if not exists public.mess_sheet_snapshots (
  mess_id uuid primary key references public.messes(id) on delete cascade,
  month date not null,
  bazar jsonb not null default '[]'::jsonb,
  khawa jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mess_sheet_snapshots enable row level security;
revoke all on public.mess_sheet_snapshots from public, anon, authenticated;
grant all on public.mess_sheet_snapshots to service_role;
