-- Secure Web Push support for Mess Chat.
-- VAPID secrets stay in server environment, not database.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "members manage own push subscriptions"
on public.push_subscriptions
for all
using (
  member_id in (
    select id from public.members where user_id = auth.uid() and active = true
  )
)
with check (
  member_id in (
    select id from public.members where user_id = auth.uid() and active = true
  )
);

create index if not exists push_subscriptions_mess_idx
on public.push_subscriptions(mess_id);

alter table public.push_subscriptions
add column if not exists updated_at timestamptz not null default now();
