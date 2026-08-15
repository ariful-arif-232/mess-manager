-- Web Push support for Mess Chat.
-- This migration is additive: it does not change existing chat, member, meal,
-- bazar, deposit, utility, schedule, settlement, auth, or realtime behavior.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null,
  member_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_member_mess_fk
    foreign key (member_id, mess_id)
    references public.members(id, mess_id)
    on delete cascade
);

create index push_subscriptions_mess_member_idx
  on public.push_subscriptions(mess_id, member_id);

alter table public.push_subscriptions enable row level security;

-- Browser roles never read or write raw endpoint/key rows directly.
-- The only browser access is through the security-definer RPCs below, which
-- derive member/mess identity from auth.uid().
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default ''
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid;
  v_mess_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.id, m.mess_id
    into v_member_id, v_mess_id
    from public.members m
   where m.user_id = auth.uid()
     and m.active = true
   limit 1;

  if v_member_id is null then
    raise exception 'Active mess membership required';
  end if;

  p_endpoint := trim(coalesce(p_endpoint, ''));
  p_p256dh := trim(coalesce(p_p256dh, ''));
  p_auth := trim(coalesce(p_auth, ''));
  p_user_agent := left(coalesce(p_user_agent, ''), 1000);

  if p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) > 4000 then
    raise exception 'Invalid push endpoint';
  end if;
  if char_length(p_p256dh) not between 20 and 512 then
    raise exception 'Invalid push key';
  end if;
  if char_length(p_auth) not between 8 and 512 then
    raise exception 'Invalid push auth key';
  end if;

  -- A push endpoint identifies one browser profile. Reassigning the endpoint
  -- on sign-in prevents a previous account on the same browser receiving chat.
  delete from public.push_subscriptions where endpoint = p_endpoint;

  insert into public.push_subscriptions (
    mess_id, member_id, endpoint, p256dh, auth, user_agent
  ) values (
    v_mess_id, v_member_id, p_endpoint, p_p256dh, p_auth, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create or replace function public.remove_push_subscription(
  p_endpoint text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid;
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.id
    into v_member_id
    from public.members m
   where m.user_id = auth.uid()
     and m.active = true
   limit 1;

  if v_member_id is null then
    raise exception 'Active mess membership required';
  end if;

  delete from public.push_subscriptions
   where member_id = v_member_id
     and endpoint = trim(coalesce(p_endpoint, ''));

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- Keeps one sender/browser from dispatching the same message repeatedly.
create table public.chat_push_dispatches (
  message_id uuid primary key references public.mess_messages(id) on delete cascade,
  dispatched_at timestamptz not null default now()
);

alter table public.chat_push_dispatches enable row level security;
revoke all on public.chat_push_dispatches from anon, authenticated;
grant all on public.chat_push_dispatches to service_role;

-- VAPID signing material is generated server-side by the Edge Function.
-- RLS is enabled and browser roles receive no privileges or policies.
create table public.push_vapid_config (
  id boolean primary key default true check (id = true),
  public_key text not null,
  private_key text not null,
  subject text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_vapid_config enable row level security;
revoke all on public.push_vapid_config from anon, authenticated;
grant all on public.push_vapid_config to service_role;

comment on table public.push_subscriptions is
  'Per-device Web Push subscriptions for Mess Chat; raw rows are service-role only.';
comment on table public.chat_push_dispatches is
  'Server-only idempotency records for chat push fanout.';
comment on table public.push_vapid_config is
  'Server-only VAPID signing keys; private_key is never exposed to browser clients.';
