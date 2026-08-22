-- Harden deactivation/activation RPCs so they run with caller privileges and RLS.

create policy "admins insert food cutoffs"
on public.member_food_cutoffs
for insert
to authenticated
with check (
  mess_id = (select public.current_mess_id())
  and created_by = (select auth.uid())
  and (select public.is_admin())
  and exists (
    select 1
    from public.members m
    where m.id = member_id
      and m.mess_id = (select public.current_mess_id())
      and m.deleted_at is null
  )
);

grant insert on table public.member_food_cutoffs to authenticated;

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
      'food_history_preserved', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'member_id', v_target.id,
    'member_name', v_target.name,
    'cutoff_date', p_cutoff_date,
    'meals_disabled', v_meals_disabled
  );
end;
$function$;

create or replace function public.activate_mess_member(p_member_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_mess_id uuid;
  v_target public.members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.mess_id
    into v_mess_id
  from public.current_member() m
  where m.role = 'admin';

  if v_mess_id is null then
    raise exception 'Only an active mess admin can activate members';
  end if;

  select * into v_target
  from public.members
  where id = p_member_id
    and mess_id = v_mess_id
    and deleted_at is null;

  if v_target.id is null then
    raise exception 'Member not found';
  end if;
  if v_target.active then
    raise exception 'Member is already active';
  end if;

  update public.members
     set active = true,
         updated_at = now()
   where id = v_target.id;

  insert into public.activity_logs(mess_id, actor_id, action, entity_type, entity_id, metadata)
  values(
    v_mess_id,
    auth.uid(),
    'activate_member',
    'member',
    v_target.id::text,
    jsonb_build_object(
      'name', v_target.name,
      'previous_food_cutoffs_preserved', true,
      'meals_auto_enabled', false
    )
  );

  return jsonb_build_object(
    'ok', true,
    'member_id', v_target.id,
    'member_name', v_target.name
  );
end;
$function$;

revoke all on function public.deactivate_mess_member(uuid, date) from public;
revoke all on function public.deactivate_mess_member(uuid, date) from anon;
grant execute on function public.deactivate_mess_member(uuid, date) to authenticated;

revoke all on function public.activate_mess_member(uuid) from public;
revoke all on function public.activate_mess_member(uuid) from anon;
grant execute on function public.activate_mess_member(uuid) to authenticated;
