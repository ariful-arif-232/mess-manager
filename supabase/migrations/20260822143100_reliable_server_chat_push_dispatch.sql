-- Dispatch chat push notifications from the database after a message insert.
-- This makes delivery independent of the sender keeping the browser/PWA alive.

create table if not exists public.chat_push_server_config (
  id boolean primary key default true check (id = true),
  webhook_token text not null check (char_length(webhook_token) between 32 and 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_push_server_config enable row level security;
revoke all on public.chat_push_server_config from public, anon, authenticated;
grant all on public.chat_push_server_config to service_role;

insert into public.chat_push_server_config (id, webhook_token)
values (true, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

create or replace function public.dispatch_chat_push_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  select c.webhook_token
    into v_token
    from public.chat_push_server_config c
   where c.id = true;

  if v_token is null then
    raise warning 'Chat push server token is unavailable';
    return new;
  end if;

  select net.http_post(
    url := 'https://xcggmwzmhlkvgwqgbwwu.supabase.co/functions/v1/chat-push',
    body := jsonb_build_object(
      'action', 'dispatch-webhook',
      'message_id', new.id,
      'webhook_token', v_token
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 20000
  ) into v_request_id;

  return new;
exception when others then
  raise warning 'Unable to enqueue chat push for message %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.dispatch_chat_push_after_insert() from public, anon, authenticated;

drop trigger if exists mess_messages_server_push on public.mess_messages;
create trigger mess_messages_server_push
after insert on public.mess_messages
for each row execute function public.dispatch_chat_push_after_insert();
