-- Secure Web Push support for Mess Chat.
-- Push endpoints are scoped to the authenticated member and mess. The VAPID
-- private key is kept in a server-only table with no client-readable policy.

create table if not exists public.push_vapid_config (
  id boolean primary key default true check (id),
  public_key text not null,
  private_key text not null,
  subject text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_vapid_config enable row level security;

insert into public.push_vapid_config (id, public_key, private_key, subject