-- Allow one browser PushSubscription endpoint to receive messages from every
-- active mess workspace that belongs to the signed-in user.

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;

create unique index if not exists push_subscriptions_member_endpoint_uidx
  on public.push_subscriptions(member_id, endpoint);

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
  v_member record;
  v_id uuid;
  v_first_id uuid;
  v_conflict boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
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

  select exists(
    select 1
    from public.push_subscriptions ps
    where ps.endpoint = p_endpoint
      and (ps.p256dh <> p_p256dh or ps.auth <> p_auth)
  ) into v_conflict;

  if v_conflict then
    raise exception 'Push subscription key mismatch';
  end if;

  delete from public.push_subscriptions ps
  where ps.endpoint = p_endpoint
    and ps.p256dh = p_p256dh
    and ps.auth = p_auth
    and not exists (
      select 1
      from public.members owned
      where owned.id = ps.member_id
        and owned.user_id = auth.uid()
    );

  for v_member in
    select m.id, m.mess_id
    from public.members m
    where m.user_id = auth.uid()
      and m.active = true
      and m.deleted_at is null
  loop
    insert into public.push_subscriptions (
      mess_id, member_id, endpoint, p256dh, auth, user_agent
    ) values (
      v_member.mess_id, v_member.id, p_endpoint, p_p256dh, p_auth, p_user_agent
    )
    on conflict (member_id, endpoint) do update
      set mess_id = excluded.mess_id,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          user_agent = excluded.user_agent,
          updated_at = now()
    returning id into v_id;

    if v_first_id is null then
      v_first_id := v_id;
    end if;
  end loop;

  if v_first_id is null then
    raise exception 'Active mess membership required';
  end if;

  return v_first_id;
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
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.push_subscriptions ps
  where ps.endpoint = trim(coalesce(p_endpoint, ''))
    and exists (
      select 1
      from public.members m
      where m.id = ps.member_id
        and m.user_id = auth.uid()
    );

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.remove_push_subscription(text) to authenticated;
