-- Allow one verified Supabase identity to belong to multiple Mess Manager workspaces.
-- Access remains scoped to exactly one selected membership at a time, so existing
-- current_mess_id()/RLS policies continue to isolate every workspace.

alter table public.members drop constraint if exists members_user_id_key;

create unique index if not exists members_user_mess_unique
  on public.members(user_id, mess_id)
  where user_id is not null and deleted_at is null;

create table if not exists public.user_workspace_selections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.user_workspace_selections enable row level security;
revoke all on table public.user_workspace_selections from public, anon, authenticated;

-- Every account had at most one linked member before this migration, so preserve
-- the currently active workspace as its initial selection.
insert into public.user_workspace_selections(user_id, member_id)
select m.user_id, m.id
from public.members m
where m.user_id is not null
  and m.active
  and m.deleted_at is null
on conflict (user_id) do update
set member_id = excluded.member_id,
    updated_at = now();

create or replace function public.sync_my_workspace_memberships()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_linked integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select lower(btrim(u.email))
    into v_email
  from auth.users u
  where u.id = v_uid
    and u.email is not null
    and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    raise exception 'A verified email address is required';
  end if;

  -- A verified email may appear on rosters in several different messes. Link
  -- every unclaimed matching profile, while never creating two identities for
  -- the same user inside one workspace.
  update public.members m
     set user_id = v_uid,
         updated_at = now()
   where m.user_id is null
     and m.active
     and m.deleted_at is null
     and m.email is not null
     and lower(btrim(m.email)) = v_email
     and not exists (
       select 1
       from public.members existing
       where existing.user_id = v_uid
         and existing.mess_id = m.mess_id
         and existing.deleted_at is null
     );

  get diagnostics v_linked = row_count;

  -- Drop a stale selection when that membership was removed/deactivated.
  delete from public.user_workspace_selections s
  where s.user_id = v_uid
    and not exists (
      select 1
      from public.members m
      where m.id = s.member_id
        and m.user_id = v_uid
        and m.active
        and m.deleted_at is null
    );

  return v_linked;
end;
$$;

revoke all on function public.sync_my_workspace_memberships() from public, anon, authenticated;

create or replace function public.list_my_workspaces()
returns table (
  member_id uuid,
  mess_id uuid,
  mess_name text,
  member_name text,
  role text,
  selected boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_only_member uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.sync_my_workspace_memberships();

  select count(*), min(m.id)
    into v_count, v_only_member
  from public.members m
  where m.user_id = v_uid
    and m.active
    and m.deleted_at is null;

  if v_count = 1 then
    insert into public.user_workspace_selections(user_id, member_id)
    values(v_uid, v_only_member)
    on conflict (user_id) do update
      set member_id = excluded.member_id,
          updated_at = now();
  end if;

  return query
  select m.id,
         m.mess_id,
         ms.name,
         m.name,
         m.role,
         coalesce(s.member_id = m.id, false)
  from public.members m
  join public.messes ms on ms.id = m.mess_id
  left join public.user_workspace_selections s on s.user_id = v_uid
  where m.user_id = v_uid
    and m.active
    and m.deleted_at is null
  order by coalesce(s.member_id = m.id, false) desc,
           case when m.role = 'admin' then 0 else 1 end,
           lower(ms.name),
           m.id;
end;
$$;

revoke all on function public.list_my_workspaces() from public, anon;
grant execute on function public.list_my_workspaces() to authenticated;

create or replace function public.select_workspace(p_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_mess_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.sync_my_workspace_memberships();

  select m.mess_id
    into v_mess_id
  from public.members m
  where m.id = p_member_id
    and m.user_id = v_uid
    and m.active
    and m.deleted_at is null;

  if v_mess_id is null then
    raise exception 'Workspace membership is not available for this account';
  end if;

  insert into public.user_workspace_selections(user_id, member_id)
  values(v_uid, p_member_id)
  on conflict (user_id) do update
    set member_id = excluded.member_id,
        updated_at = now();

  return v_mess_id;
end;
$$;

revoke all on function public.select_workspace(uuid) from public, anon;
grant execute on function public.select_workspace(uuid) to authenticated;

create or replace function public.clear_workspace_selection()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  delete from public.user_workspace_selections where user_id = auth.uid();
  return true;
end;
$$;

revoke all on function public.clear_workspace_selection() from public, anon;
grant execute on function public.clear_workspace_selection() to authenticated;

create or replace function public.current_member()
returns public.members
language sql
stable
security definer
set search_path = 'public'
as $$
  with active_memberships as materialized (
    select m.*
    from public.members m
    where m.user_id = auth.uid()
      and m.active
      and m.deleted_at is null
  ),
  selected_membership as (
    select m.*
    from active_memberships m
    join public.user_workspace_selections s
      on s.user_id = auth.uid()
     and s.member_id = m.id
  ),
  membership_count as (
    select count(*)::integer as n from active_memberships
  )
  select s.* from selected_membership s
  union all
  select m.*
  from active_memberships m, membership_count c
  where c.n = 1
    and not exists (select 1 from selected_membership)
  limit 1
$$;

create or replace function public.current_mess_id()
returns uuid
language sql
stable
security definer
set search_path = 'public'
as $$
  select mess_id from public.current_member()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce((select role = 'admin' from public.current_member()), false)
$$;

create or replace function public.claim_member_by_email()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  perform public.sync_my_workspace_memberships();

  select count(*)
    into v_count
  from public.members m
  where m.user_id = v_uid
    and m.active
    and m.deleted_at is null;

  if v_count = 0 then
    raise exception 'No active mess member is registered for this email';
  end if;

  if v_count = 1 then
    select m.id into v_member_id
    from public.members m
    where m.user_id = v_uid
      and m.active
      and m.deleted_at is null
    limit 1;

    perform public.select_workspace(v_member_id);
    return v_member_id;
  end if;

  -- Multiple memberships are valid. Keep an existing selection if there is one;
  -- otherwise the client will ask the user which workspace to open.
  select s.member_id
    into v_member_id
  from public.user_workspace_selections s
  join public.members m on m.id = s.member_id
  where s.user_id = v_uid
    and m.user_id = v_uid
    and m.active
    and m.deleted_at is null;

  return v_member_id;
end;
$$;

revoke all on function public.claim_member_by_email() from public, anon;
grant execute on function public.claim_member_by_email() to authenticated;

create or replace function public.create_admin_workspace(
  p_name text,
  p_mess_name text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_mess_id uuid;
  v_member_id uuid;
  v_email_members integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select lower(btrim(u.email))
    into v_email
  from auth.users u
  where u.id = v_uid
    and u.email is not null
    and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    raise exception 'A verified email address is required';
  end if;

  if nullif(btrim(coalesce(p_email, '')), '') is not null
     and lower(btrim(p_email)) <> v_email then
    raise exception 'Email must match the verified account';
  end if;

  perform public.sync_my_workspace_memberships();

  -- Never create another workspace merely because this identity belongs to more
  -- than one roster. Existing verified memberships always win.
  select coalesce(
           public.current_mess_id(),
           (
             select m.mess_id
             from public.members m
             where m.user_id = v_uid
               and m.active
               and m.deleted_at is null
             order by case when m.role = 'admin' then 0 else 1 end, m.created_at, m.id
             limit 1
           )
         )
    into v_mess_id;

  if v_mess_id is not null then
    return v_mess_id;
  end if;

  select count(*)
    into v_email_members
  from public.members m
  where m.active
    and m.deleted_at is null
    and m.email is not null
    and lower(btrim(m.email)) = v_email;

  if v_email_members > 0 then
    raise exception 'This email is already registered in a mess; sign in to the existing workspace';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null
     or nullif(btrim(coalesce(p_mess_name, '')), '') is null then
    raise exception 'Name and mess name are required';
  end if;

  insert into public.messes(name)
  values (btrim(p_mess_name))
  returning id into v_mess_id;

  insert into public.members(mess_id, user_id, name, email, role, active)
  values (v_mess_id, v_uid, btrim(p_name), v_email, 'admin', true)
  returning id into v_member_id;

  insert into public.user_workspace_selections(user_id, member_id)
  values(v_uid, v_member_id)
  on conflict (user_id) do update
    set member_id = excluded.member_id,
        updated_at = now();

  return v_mess_id;
end;
$$;

revoke all on function public.create_admin_workspace(text, text, text) from public, anon;
grant execute on function public.create_admin_workspace(text, text, text) to authenticated;

create or replace function public.save_bazar_entry(
  p_entry_id uuid,
  p_entry_date date,
  p_buyer_member_id uuid,
  p_note text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_entry_id uuid;
  v_mess_id uuid;
  v_buyer_name text;
  v_item_names text;
begin
  select member.mess_id
    into v_mess_id
  from public.current_member() member
  where member.role = 'admin';

  if v_mess_id is null then
    raise exception 'Only an active mess admin can save bazar entries';
  end if;
  if p_entry_date is null then
    raise exception 'Bazar date is required';
  end if;
  if char_length(coalesce(p_note,'')) > 2000 then
    raise exception 'Bazar note must be 2000 characters or fewer';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one bazar item is required';
  end if;

  select member.name
    into v_buyer_name
  from public.members member
  where member.id = p_buyer_member_id
    and member.mess_id = v_mess_id;

  if v_buyer_name is null then
    raise exception 'Buyer must belong to the current mess';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(item_name text,category text,quantity numeric,unit text,unit_price numeric,total numeric)
    where item.item_name is null
       or char_length(trim(item.item_name)) not between 1 and 160
       or item.category is null
       or char_length(trim(item.category)) not between 1 and 80
       or item.quantity is null
       or item.quantity <= 0
       or item.unit is null
       or char_length(trim(item.unit)) not between 1 and 40
       or coalesce(item.total,round(item.unit_price*item.quantity,2)) is null
       or coalesce(item.total,round(item.unit_price*item.quantity,2)) < 0
  ) then
    raise exception 'One or more bazar items are invalid';
  end if;

  select string_agg(trim(item.item_name),', ')
    into v_item_names
  from jsonb_to_recordset(p_items) as item(item_name text);

  if p_entry_id is null then
    insert into public.bazar_entries(mess_id,entry_date,buyer_member_id,buyer,note,items,amount,created_by)
    values(v_mess_id,p_entry_date,p_buyer_member_id,v_buyer_name,coalesce(p_note,''),v_item_names,0,auth.uid())
    returning id into v_entry_id;
  else
    select entry.id
      into v_entry_id
    from public.bazar_entries entry
    where entry.id = p_entry_id
      and entry.mess_id = v_mess_id
    for update;

    if v_entry_id is null then
      raise exception 'Bazar entry was not found in the current mess';
    end if;

    update public.bazar_entries
       set entry_date = p_entry_date,
           buyer_member_id = p_buyer_member_id,
           buyer = v_buyer_name,
           note = coalesce(p_note,''),
           items = v_item_names,
           updated_at = now()
     where id = v_entry_id;

    delete from public.bazar_items where bazar_entry_id = v_entry_id;
  end if;

  insert into public.bazar_items(bazar_entry_id,item_name,category,quantity,unit,unit_price,entered_total)
  select v_entry_id,
         trim(item.item_name),
         trim(item.category),
         item.quantity,
         trim(item.unit),
         coalesce(item.unit_price,item.total/item.quantity),
         coalesce(item.total,round(item.unit_price*item.quantity,2))
  from jsonb_to_recordset(p_items) as item(item_name text,category text,quantity numeric,unit text,unit_price numeric,total numeric);

  return v_entry_id;
end;
$$;

create or replace function public.delete_mess_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mess_id uuid;
  v_admin_member_id uuid;
  v_target public.members%rowtype;
  v_other_admins integer;
begin
  select m.mess_id, m.id
    into v_mess_id, v_admin_member_id
  from public.current_member() m
  where m.role = 'admin';

  if v_mess_id is null then
    raise exception 'Only an active mess admin can delete members';
  end if;

  select * into v_target
  from public.members
  where id = p_member_id
    and mess_id = v_mess_id
    and deleted_at is null;

  if v_target.id is null then
    raise exception 'Member not found';
  end if;
  if v_target.id = v_admin_member_id then
    raise exception 'You cannot delete your own admin account';
  end if;

  if v_target.role = 'admin' then
    select count(*) into v_other_admins
    from public.members
    where mess_id = v_mess_id
      and role = 'admin'
      and active
      and deleted_at is null
      and id <> v_target.id;
    if v_other_admins < 1 then
      raise exception 'At least one active admin must remain';
    end if;
  end if;

  update public.members
     set active = false,
         deleted_at = now()
   where id = v_target.id;

  if v_target.user_id is not null then
    delete from public.user_workspace_selections
    where user_id = v_target.user_id
      and member_id = v_target.id;
  end if;

  insert into public.activity_logs(mess_id, actor_id, action, entity_type, entity_id, metadata)
  values(v_mess_id, auth.uid(), 'delete_member', 'member', v_target.id::text,
    jsonb_build_object('name', v_target.name, 'email', v_target.email, 'preserved_history', true));

  return jsonb_build_object('ok', true, 'member_id', v_target.id, 'member_name', v_target.name, 'preserved_history', true);
end;
$$;

create or replace function public.reset_current_mess(p_confirmation text, p_admin_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mess_id uuid;
  v_admin_member_id uuid;
  v_email text;
  v_session_created_at timestamptz;
  v_removed_user_ids uuid[] := '{}'::uuid[];
  v_deleted bigint := 0;
  v_deleted_members bigint := 0;
  v_deleted_auth_users bigint := 0;
  v_count bigint;
begin
  if p_confirmation is distinct from 'RESET' then
    raise exception 'Type RESET to confirm';
  end if;

  select m.mess_id, m.id, lower(u.email), s.created_at
    into v_mess_id, v_admin_member_id, v_email, v_session_created_at
  from public.current_member() m
  join auth.users u on u.id = m.user_id
  join auth.sessions s on s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  where m.role = 'admin'
    and u.email_confirmed_at is not null;

  if v_mess_id is null then
    raise exception 'Only a verified active mess admin can reset this workspace';
  end if;
  if v_email is distinct from lower(trim(p_admin_email)) then
    raise exception 'Admin email does not match the verified account';
  end if;
  if v_session_created_at < now() - interval '5 minutes' then
    raise exception 'Security OTP expired. Request a new OTP';
  end if;

  select coalesce(array_agg(distinct user_id) filter (where user_id is not null), '{}'::uuid[])
    into v_removed_user_ids
  from public.members
  where mess_id = v_mess_id
    and id <> v_admin_member_id;

  delete from public.mess_notices where mess_id = v_mess_id;
  get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.mess_messages where mess_id = v_mess_id;
  get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.monthly_settlements where mess_id = v_mess_id;
  get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.utility_bills where mess_id = v_mess_id;
  get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.bazar_schedules where mess_id = v_mess_id;
  get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.bazar_entries where mess_id = v_mess_id;
  get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.deposits where mess_id = v_mess_id;
  get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.meals where mess_id = v_mess_id;
  get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.activity_logs where mess_id = v_mess_id;
  get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;

  delete from public.members
  where mess_id = v_mess_id
    and id <> v_admin_member_id;
  get diagnostics v_deleted_members = row_count;
  v_deleted := v_deleted + v_deleted_members;

  if cardinality(v_removed_user_ids) > 0 then
    delete from auth.users u
    where u.id = any(v_removed_user_ids)
      and u.id <> auth.uid()
      and not exists (
        select 1 from public.members remaining where remaining.user_id = u.id
      );
    get diagnostics v_deleted_auth_users = row_count;
  end if;

  insert into public.activity_logs(mess_id, actor_id, action, entity_type, metadata)
  values(
    v_mess_id,
    auth.uid(),
    'reset',
    'workspace',
    jsonb_build_object(
      'deleted_records', v_deleted,
      'deleted_members', v_deleted_members,
      'deleted_auth_users', v_deleted_auth_users,
      'verified_email', v_email
    )
  );

  return jsonb_build_object(
    'ok', true,
    'deleted_records', v_deleted,
    'deleted_members', v_deleted_members,
    'deleted_auth_users', v_deleted_auth_users
  );
end;
$$;

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default ''::text
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_member_id uuid;
  v_mess_id uuid;
  v_id uuid;
  v_existing record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.id, m.mess_id
    into v_member_id, v_mess_id
  from public.current_member() m;

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

  select ps.id, ps.p256dh, ps.auth
    into v_existing
  from public.push_subscriptions ps
  where ps.endpoint = p_endpoint
  limit 1;

  if v_existing.id is not null then
    if v_existing.p256dh <> p_p256dh or v_existing.auth <> p_auth then
      raise exception 'Push subscription key mismatch';
    end if;

    update public.push_subscriptions
       set mess_id = v_mess_id,
           member_id = v_member_id,
           user_agent = p_user_agent,
           updated_at = now()
     where id = v_existing.id
     returning id into v_id;

    return v_id;
  end if;

  insert into public.push_subscriptions(mess_id, member_id, endpoint, p256dh, auth, user_agent)
  values(v_mess_id, v_member_id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_member_id uuid;
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.id into v_member_id from public.current_member() m;

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

create or replace function public.update_my_avatar(p_avatar_url text)
returns text
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_url text;
  v_required text;
  v_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_required := '/storage/v1/object/public/member-avatars/' || auth.uid()::text || '/';
  if p_avatar_url is null
     or length(trim(p_avatar_url)) > 2048
     or position(v_required in trim(p_avatar_url)) = 0 then
    raise exception 'Invalid avatar URL';
  end if;

  select m.id into v_member_id from public.current_member() m;
  if v_member_id is null then
    raise exception 'Active member profile not found';
  end if;

  update public.members
     set avatar_url = trim(p_avatar_url),
         updated_at = now()
   where id = v_member_id
   returning avatar_url into v_url;

  return v_url;
end;
$$;

-- The notice policies previously used an arbitrary LIMIT 1 membership for a user.
-- Point them at the explicitly selected membership instead.
alter policy "admins insert notices" on public.mess_notices
  with check (
    (mess_id = public.current_mess_id())
    and public.is_admin()
    and created_by = (select cm.id from public.current_member() cm)
    and (
      target_member_id is null
      or exists (
        select 1 from public.members m
        where m.id = mess_notices.target_member_id
          and m.mess_id = public.current_mess_id()
      )
    )
  );

alter policy "mess members read notices" on public.mess_notices
  using (
    (mess_id = public.current_mess_id())
    and (
      target_member_id is null
      or target_member_id = (select cm.id from public.current_member() cm)
    )
  );
