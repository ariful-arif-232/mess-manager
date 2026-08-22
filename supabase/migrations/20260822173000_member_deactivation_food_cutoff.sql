-- Member deactivation with food-cost cutoff history.
-- A cutoff is inclusive for bazar cost on cutoff_date, while the target member's
-- meal is disabled from cutoff_date onward. Later-dated bazar no longer changes
-- the member's locked food portion.

create table public.member_food_cutoffs (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  cutoff_date date not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index member_food_cutoffs_mess_date_idx
  on public.member_food_cutoffs (mess_id, cutoff_date);
create index member_food_cutoffs_member_date_idx
  on public.member_food_cutoffs (member_id, cutoff_date);

alter table public.member_food_cutoffs enable row level security;

create policy "mess members read food cutoffs"
on public.member_food_cutoffs
for select
to authenticated
using (mess_id = (select public.current_mess_id()));

revoke all on table public.member_food_cutoffs from anon;
revoke all on table public.member_food_cutoffs from authenticated;
grant select on table public.member_food_cutoffs to authenticated;

create or replace function public.deactivate_mess_member(
  p_member_id uuid,
  p_cutoff_date date default current_date
)
returns jsonb
language plpgsql
security definer
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

  -- The member does not eat from the cutoff date onward.
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

  if v_target.user_id is not null then
    delete from public.user_workspace_selections
    where user_id = v_target.user_id
      and member_id = v_target.id;
  end if;

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
security definer
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
