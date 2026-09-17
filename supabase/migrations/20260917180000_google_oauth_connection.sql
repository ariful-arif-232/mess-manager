-- Replaces the service-account approach (which cannot create Drive files at
-- all off a Workspace domain — see mess-sheet/index.ts) with a real Google
-- account's own OAuth connection: a single row holding whichever admin's
-- "Connect Google Drive" refresh token is currently in effect.
create table if not exists public.app_google_connection (
  id boolean primary key default true check (id),
  refresh_token text not null,
  connected_email text,
  connected_at timestamptz not null default now()
);

alter table public.app_google_connection enable row level security;
revoke all on public.app_google_connection from public, anon, authenticated;
grant all on public.app_google_connection to service_role;
