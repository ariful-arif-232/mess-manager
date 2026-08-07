-- Follow-up for databases that already applied 202608070001_initial_schema.sql.
-- Active users may read shared data only for their own mess; writes remain governed
-- by the existing admin policies (apart from the intentionally personal meal action).

drop policy if exists "mess members read deposits" on public.deposits;
create policy "mess members read deposits"
  on public.deposits for select
  using (mess_id = public.current_mess_id());

drop policy if exists "mess members read bills" on public.utility_bills;
create policy "mess members read bills"
  on public.utility_bills for select
  using (mess_id = public.current_mess_id());

drop policy if exists "mess members read bill shares" on public.utility_bill_members;
create policy "mess members read bill shares"
  on public.utility_bill_members for select
  using (exists (
    select 1 from public.utility_bills b
    where b.id = utility_bill_id
      and b.mess_id = public.current_mess_id()
  ));

drop policy if exists "mess members read schedules" on public.bazar_schedules;
create policy "mess members read schedules"
  on public.bazar_schedules for select
  using (mess_id = public.current_mess_id());

drop policy if exists "members read own settlements" on public.monthly_settlements;
drop policy if exists "mess members read settlements" on public.monthly_settlements;
create policy "mess members read settlements"
  on public.monthly_settlements for select
  using (mess_id = public.current_mess_id());

-- Supabase Realtime still applies each table's SELECT RLS policy. Adding tables
-- conditionally makes this migration safe whether or not a table was published.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'members', 'meals', 'bazar_entries', 'deposits', 'utility_bills',
    'utility_bill_members', 'bazar_schedules', 'monthly_settlements'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
