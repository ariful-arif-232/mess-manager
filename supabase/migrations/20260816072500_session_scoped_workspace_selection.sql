-- Scope workspace selection to the current Supabase auth session so the same
-- account can safely use different workspaces on different devices at once.

alter table public.user_workspace_selections
  add column if not exists session_id uuid;

delete from public.user_workspace_selections;

alter table public.user_workspace_selections
  alter column session_id set not null;

alter table public.user_workspace_selections
  drop constraint if exists user_workspace_selections_pkey;

alter table public.user_workspace_selections
  add constraint user_workspace_selections_pkey primary key (session_id);

alter table public.user_workspace_selections
  add constraint user_workspace_selections_session_id_fkey
  foreign key (session_id) references auth.sessions(id) on delete cascade;

create index if not exists user_workspace_selections_user_idx
  on public.user_workspace_selections(user_id);

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
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_count integer;
  v_only_member uuid;
begin
  if v_uid is null or v_session_id is null then
    raise exception 'Authentication session required';
  end if;

  perform public.sync_my_workspace_memberships();

  select count(*)
    into v_count
  from public.members m
  where m.user_id = v_uid
    and m.active
    and m.deleted_at is null;

  if v_count = 1 then
    select m.id
      into v_only_member
    from public.members m
    where m.user_id = v_uid
      and m.active
      and m.deleted_at is null
    limit 1;

    insert into public.user_workspace_selections(session_id, user_id, member_id)
    values(v_session_id, v_uid, v_only_member)
    on conflict (session_id) do update
      set user_id = excluded.user_id,
          member_id = excluded.member_id,
          updated_at = now();
  end if;

  return query
  select m.id,
         m.mess_id,
         ms.name,
         m.name,
         m.role::text,
         coalesce(s.member_id = m.id, false)
  from public.members m
  join public.messes ms on ms.id = m.mess_id
  left join public.user_workspace_selections s
    on s.session_id = v_session_id
   and s.user_id = v_uid
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
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_mess_id uuid;
begin
  if v_uid is null or v_session_id is null then
    raise exception 'Authentication session required';
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

  insert into public.user_workspace_selections(session_id, user_id, member_id)
  values(v_session_id, v_uid, p_member_id)
  on conflict (session_id) do update
    set user_id = excluded.user_id,
        member_id = excluded.member_id,
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
declare
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if auth.uid() is null or v_session_id is null then
    return false;
  end if;
  delete from public.user_workspace_selections
  where session_id = v_session_id
    and user_id = auth.uid();
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
      on s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
     and s.user_id = auth.uid()
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

create or replace function public.claim_member_by_email()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_member_id uuid;
  v_count integer;
begin
  if v_uid is null or v_session_id is null then
    raise exception 'Authentication session required';
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

  select s.member_id
    into v_member_id
  from public.user_workspace_selections s
  join public.members m on m.id = s.member_id
  where s.session_id = v_session_id
    and s.user_id = v_uid
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
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_email text;
  v_mess_id uuid;
  v_member_id uuid;
  v_email_members integer;
begin
  if v_uid is null or v_session_id is null then
    raise exception 'Authentication session required';
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

  select coalesce(
           public.current_mess_id(),
           (
             select m.mess_id
             from public.members m
             where m.user_id = v_uid
               and m.active
               and m.deleted_at is null
             order by case when m.role = 'admin' then 0 else 1 end, m.id
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

  insert into public.user_workspace_selections(session_id, user_id, member_id)
  values(v_session_id, v_uid, v_member_id)
  on conflict (session_id) do update
    set user_id = excluded.user_id,
        member_id = excluded.member_id,
        updated_at = now();

  return v_mess_id;
end;
$$;

revoke all on function public.create_admin_workspace(text, text, text) from public, anon;
grant execute on function public.create_admin_workspace(text, text, text) to authenticated;
