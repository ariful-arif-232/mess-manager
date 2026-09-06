-- Remove deactivated memberships from active workspace sessions while preserving
-- historical member/meal/deposit data for past monthly views.

grant delete on table public.user_workspace_selections to authenticated;

create index if not exists user_workspace_selections_member_idx
  on public.user_workspace_selections(member_id);

drop policy if exists "admins detach member workspace selections" on public.user_workspace_selections;
create policy "admins detach member workspace selections"
on public.user_workspace_selections
for delete
to authenticated
using (
  exists (
    select 1
    from public.current_member() cm
    join public.members target on target.id = user_workspace_selections.member_id
    where cm.role = 'admin'
      and cm.mess_id = target.mess_id
      and target.deleted_at is null
  )
);

create or replace function public.deactivate_mess_member(
  p_member_id uuid,
  p_cutoff_date date default current_date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_mess_id uuid;
  v_admin_member_id uuid;
  v_target public.members%rowtype;
  v_other_admins integer;
  v_meals_disabled integer := 0;
  v_workspace_sessions_detached integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.mess_id, m.id
    into v_mess_id, v_admin_member_id
  from public.current_member() m
  where m.role = 'admin';

  if v_mess_id is null then
    raise exception 'Only an active mess admin can deactivate members';
  end if;
  if p_cutoff_date is null then
    raise exception 'Cutoff date is required';
  end if;
  if p_cutoff_date > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Cutoff date cannot be in the future';
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
    raise exception 'You cannot deactivate your own admin account';
  end if;
  if not v_target.active then
    raise exception 'Member is already inactive';
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

  update public.meals
     set enabled = false
   where mess_id = v_mess_id
     and member_id = v_target.id
     and meal_date >= p_cutoff_date
     and enabled = true;
  get diagnostics v_meals_disabled = row_count;

  insert into public.member_food_cutoffs(mess_id, member_id, cutoff_date, created_by)
  values(v_mess_id, v_target.id, p_cutoff_date, auth.uid());

  delete from public.user_workspace_selections
   where member_id = v_target.id;
  get diagnostics v_workspace_sessions_detached = row_count;

  update public.members
     set active = false,
         updated_at = now()
   where id = v_target.id;

  insert into public.activity_logs(mess_id, actor_id, action, entity_type, entity_id, metadata)
  values(
    v_mess_id,
    auth.uid(),
    'deactivate_member',
    'member',
    v_target.id::text,
    jsonb_build_object(
      'name', v_target.name,
      'cutoff_date', p_cutoff_date,
      'meals_disabled', v_meals_disabled,
      'workspace_sessions_detached', v_workspace_sessions_detached,
      'food_history_preserved', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'member_id', v_target.id,
    'member_name', v_target.name,
    'cutoff_date', p_cutoff_date,
    'meals_disabled', v_meals_disabled,
    'workspace_sessions_detached', v_workspace_sessions_detached
  );
end;
$function$;

revoke all on function public.deactivate_mess_member(uuid, date) from public;
revoke all on function public.deactivate_mess_member(uuid, date) from anon;
grant execute on function public.deactivate_mess_member(uuid, date) to authenticated;

-- Clean up selections created before this migration for already inactive members.
delete from public.user_workspace_selections s
using public.members m
where m.id = s.member_id
  and (not m.active or m.deleted_at is not null);
