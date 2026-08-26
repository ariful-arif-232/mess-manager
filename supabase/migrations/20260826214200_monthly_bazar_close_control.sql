-- Monthly Bazar close + optional Meal stop control.
-- A selected close date is the first blocked date. Example: close from Aug 27 => Aug 26 is the last allowed Bazar day.

create table if not exists public.monthly_food_controls (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  month_start date not null,
  bazar_closed_from date,
  meal_stop_from date,
  closed_by uuid,
  closed_at timestamptz,
  reopened_by uuid,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_food_controls_mess_month_key unique (mess_id, month_start),
  constraint monthly_food_controls_month_start_check
    check (month_start = date_trunc('month', month_start::timestamp)::date),
  constraint monthly_food_controls_bazar_month_check
    check (bazar_closed_from is null or date_trunc('month', bazar_closed_from::timestamp)::date = month_start),
  constraint monthly_food_controls_meal_month_check
    check (meal_stop_from is null or date_trunc('month', meal_stop_from::timestamp)::date = month_start),
  constraint monthly_food_controls_meal_requires_close_check
    check (meal_stop_from is null or (bazar_closed_from is not null and meal_stop_from = bazar_closed_from))
);

create index if not exists monthly_food_controls_mess_month_idx
  on public.monthly_food_controls (mess_id, month_start);

alter table public.monthly_food_controls enable row level security;

revoke all on table public.monthly_food_controls from anon;
revoke all on table public.monthly_food_controls from authenticated;
grant select, insert, update, delete on table public.monthly_food_controls to authenticated;

create policy "mess members read monthly food controls"
on public.monthly_food_controls
for select
to authenticated
using (mess_id = (select public.current_mess_id()));

create policy "admins manage monthly food controls"
on public.monthly_food_controls
for all
to authenticated
using (
  mess_id = (select public.current_mess_id())
  and (select public.is_admin())
)
with check (
  mess_id = (select public.current_mess_id())
  and (select public.is_admin())
);

create or replace function public.enforce_bazar_month_control()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_closed_from date;
begin
  select control.bazar_closed_from
    into v_closed_from
  from public.monthly_food_controls control
  where control.mess_id = new.mess_id
    and control.month_start = date_trunc('month', new.entry_date::timestamp)::date
  limit 1;

  if v_closed_from is not null and new.entry_date >= v_closed_from then
    raise exception 'Bazar is closed from %. Reopen this month before saving a Bazar entry on or after that date.', v_closed_from;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_bazar_month_control() from public;
revoke all on function public.enforce_bazar_month_control() from anon;
revoke all on function public.enforce_bazar_month_control() from authenticated;

drop trigger if exists enforce_bazar_month_control_trigger on public.bazar_entries;
create trigger enforce_bazar_month_control_trigger
before insert or update of mess_id, entry_date
on public.bazar_entries
for each row
execute function public.enforce_bazar_month_control();

create or replace function public.enforce_meal_month_control()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_stop_from date;
begin
  if not new.enabled then
    return new;
  end if;

  select control.meal_stop_from
    into v_stop_from
  from public.monthly_food_controls control
  where control.mess_id = new.mess_id
    and control.month_start = date_trunc('month', new.meal_date::timestamp)::date
  limit 1;

  if v_stop_from is not null and new.meal_date >= v_stop_from then
    raise exception 'Meal count is stopped from %. Reopen this month before enabling meals on or after that date.', v_stop_from;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_meal_month_control() from public;
revoke all on function public.enforce_meal_month_control() from anon;
revoke all on function public.enforce_meal_month_control() from authenticated;

drop trigger if exists enforce_meal_month_control_trigger on public.meals;
create trigger enforce_meal_month_control_trigger
before insert or update of mess_id, meal_date, enabled
on public.meals
for each row
execute function public.enforce_meal_month_control();

create or replace function public.close_month_bazar(
  p_month date,
  p_closed_from date,
  p_stop_meals boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_mess_id uuid;
  v_admin_member_id uuid;
  v_month_start date;
  v_month_end date;
  v_existing_close date;
  v_conflicting_bazar integer := 0;
  v_meals_disabled integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select member.mess_id, member.id
    into v_mess_id, v_admin_member_id
  from public.current_member() member
  where member.role = 'admin';

  if v_mess_id is null then
    raise exception 'Only an active mess admin can close Bazar';
  end if;
  if p_month is null or p_closed_from is null then
    raise exception 'Month and close date are required';
  end if;

  v_month_start := date_trunc('month', p_month::timestamp)::date;
  v_month_end := (v_month_start + interval '1 month')::date;

  if p_closed_from < v_month_start or p_closed_from >= v_month_end then
    raise exception 'Close date must be inside the selected month';
  end if;

  select control.bazar_closed_from
    into v_existing_close
  from public.monthly_food_controls control
  where control.mess_id = v_mess_id
    and control.month_start = v_month_start
  for update;

  if v_existing_close is not null then
    raise exception 'Bazar is already closed from %. Reopen it before choosing another close date.', v_existing_close;
  end if;

  select count(*)::integer
    into v_conflicting_bazar
  from public.bazar_entries entry
  where entry.mess_id = v_mess_id
    and entry.entry_date >= p_closed_from
    and entry.entry_date < v_month_end;

  if v_conflicting_bazar > 0 then
    raise exception 'There are % Bazar entries on or after %. Edit or delete those entries before closing Bazar from this date.', v_conflicting_bazar, p_closed_from;
  end if;

  if coalesce(p_stop_meals, false) then
    update public.meals
       set enabled = false,
           updated_at = now()
     where mess_id = v_mess_id
       and meal_date >= p_closed_from
       and meal_date < v_month_end
       and enabled = true;
    get diagnostics v_meals_disabled = row_count;
  end if;

  insert into public.monthly_food_controls (
    mess_id,
    month_start,
    bazar_closed_from,
    meal_stop_from,
    closed_by,
    closed_at,
    reopened_by,
    reopened_at,
    updated_at
  ) values (
    v_mess_id,
    v_month_start,
    p_closed_from,
    case when coalesce(p_stop_meals, false) then p_closed_from else null end,
    auth.uid(),
    now(),
    null,
    null,
    now()
  )
  on conflict (mess_id, month_start) do update
    set bazar_closed_from = excluded.bazar_closed_from,
        meal_stop_from = excluded.meal_stop_from,
        closed_by = excluded.closed_by,
        closed_at = excluded.closed_at,
        reopened_by = null,
        reopened_at = null,
        updated_at = now();

  insert into public.activity_logs (mess_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    v_mess_id,
    auth.uid(),
    'close_bazar',
    'monthly_food_control',
    v_month_start::text,
    jsonb_build_object(
      'month', v_month_start,
      'bazar_closed_from', p_closed_from,
      'last_bazar_day', p_closed_from - 1,
      'stop_meals', coalesce(p_stop_meals, false),
      'meal_stop_from', case when coalesce(p_stop_meals, false) then p_closed_from else null end,
      'meals_disabled', v_meals_disabled
    )
  );

  return jsonb_build_object(
    'ok', true,
    'month', v_month_start,
    'bazar_closed_from', p_closed_from,
    'last_bazar_day', p_closed_from - 1,
    'stop_meals', coalesce(p_stop_meals, false),
    'meal_stop_from', case when coalesce(p_stop_meals, false) then p_closed_from else null end,
    'meals_disabled', v_meals_disabled
  );
end;
$function$;

revoke all on function public.close_month_bazar(date, date, boolean) from public;
revoke all on function public.close_month_bazar(date, date, boolean) from anon;
grant execute on function public.close_month_bazar(date, date, boolean) to authenticated;

create or replace function public.reopen_month_bazar(p_month date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_mess_id uuid;
  v_month_start date;
  v_previous_close date;
  v_previous_meal_stop date;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select member.mess_id
    into v_mess_id
  from public.current_member() member
  where member.role = 'admin';

  if v_mess_id is null then
    raise exception 'Only an active mess admin can reopen Bazar';
  end if;
  if p_month is null then
    raise exception 'Month is required';
  end if;

  v_month_start := date_trunc('month', p_month::timestamp)::date;

  select control.bazar_closed_from, control.meal_stop_from
    into v_previous_close, v_previous_meal_stop
  from public.monthly_food_controls control
  where control.mess_id = v_mess_id
    and control.month_start = v_month_start
  for update;

  if v_previous_close is null then
    raise exception 'Bazar is not currently closed for this month';
  end if;

  update public.monthly_food_controls
     set bazar_closed_from = null,
         meal_stop_from = null,
         reopened_by = auth.uid(),
         reopened_at = now(),
         updated_at = now()
   where mess_id = v_mess_id
     and month_start = v_month_start;

  insert into public.activity_logs (mess_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    v_mess_id,
    auth.uid(),
    'reopen_bazar',
    'monthly_food_control',
    v_month_start::text,
    jsonb_build_object(
      'month', v_month_start,
      'previous_bazar_closed_from', v_previous_close,
      'previous_meal_stop_from', v_previous_meal_stop,
      'meals_auto_enabled', false
    )
  );

  return jsonb_build_object(
    'ok', true,
    'month', v_month_start,
    'previous_bazar_closed_from', v_previous_close,
    'previous_meal_stop_from', v_previous_meal_stop,
    'meals_auto_enabled', false
  );
end;
$function$;

revoke all on function public.reopen_month_bazar(date) from public;
revoke all on function public.reopen_month_bazar(date) from anon;
grant execute on function public.reopen_month_bazar(date) to authenticated;

-- Keep workspace reset complete: the monthly close state is workspace data too.
create or replace function public.reset_current_mess(p_confirmation text, p_admin_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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

  delete from public.monthly_food_controls where mess_id = v_mess_id;
  get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
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
        select 1
        from public.members remaining
        where remaining.user_id = u.id
          and remaining.active
          and remaining.deleted_at is null
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
$function$;

-- Add the control table to Realtime so all installed clients see Close/Reopen immediately.
do $block$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'monthly_food_controls'
     ) then
    alter publication supabase_realtime add table public.monthly_food_controls;
  end if;
end;
$block$;
