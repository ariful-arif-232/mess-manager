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
         m.role::text,
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
