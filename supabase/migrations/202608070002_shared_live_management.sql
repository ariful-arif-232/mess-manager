-- Shared live-management features. The initial migration is already deployed;
-- keep all upgrades in this ordered follow-up migration.

alter table public.members
  add column phone text,
  add column join_date date not null default current_date;

alter table public.bazar_entries
  add column buyer_member_id uuid;

alter table public.members add constraint members_id_mess_unique unique (id, mess_id);
alter table public.bazar_entries add constraint bazar_buyer_same_mess_fk
  foreign key (buyer_member_id, mess_id) references public.members(id, mess_id) on delete restrict;

create table public.bazar_items (
  id uuid primary key default gen_random_uuid(),
  bazar_entry_id uuid not null references public.bazar_entries(id) on delete cascade,
  item_name text not null check (char_length(trim(item_name)) between 1 and 160),
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null check (char_length(trim(unit)) between 1 and 40),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now()
);

create index bazar_items_entry_idx on public.bazar_items(bazar_entry_id);
alter table public.bazar_items enable row level security;

-- Preserve existing bazar data as one normalized item per entry.
insert into public.bazar_items (bazar_entry_id, item_name, quantity, unit, unit_price)
select id, coalesce(nullif(trim(items), ''), 'Bazar'), 1, 'lot', amount
from public.bazar_entries;

create function public.sync_bazar_entry_total() returns trigger
language plpgsql security definer set search_path = public
as $$
declare target_id uuid;
begin
  target_id := coalesce(new.bazar_entry_id, old.bazar_entry_id);
  update public.bazar_entries
     set amount = coalesce((select sum(total) from public.bazar_items where bazar_entry_id = target_id), 0),
         updated_at = now()
   where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger bazar_items_sync_total
after insert or update or delete on public.bazar_items
for each row execute function public.sync_bazar_entry_total();

create policy "mess members read bazar items" on public.bazar_items for select
using (exists (
  select 1 from public.bazar_entries entry
  where entry.id = bazar_entry_id and entry.mess_id = public.current_mess_id()
));
create policy "admins manage bazar items" on public.bazar_items for all
using (public.is_admin() and exists (
  select 1 from public.bazar_entries entry
  where entry.id = bazar_entry_id and entry.mess_id = public.current_mess_id()
))
with check (public.is_admin() and exists (
  select 1 from public.bazar_entries entry
  where entry.id = bazar_entry_id and entry.mess_id = public.current_mess_id()
));

-- All shared writes, including daily meals, are admin-only.
drop policy if exists "admins or owner insert meals" on public.meals;
drop policy if exists "admins or owner update meals" on public.meals;
create policy "admins insert meals" on public.meals for insert
with check (mess_id = public.current_mess_id() and public.is_admin());
create policy "admins update meals" on public.meals for update
using (mess_id = public.current_mess_id() and public.is_admin())
with check (mess_id = public.current_mess_id() and public.is_admin());

-- Reject role/status changes that would leave a mess without an active admin.
create function public.protect_last_active_admin() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.active and old.role = 'admin' and not exists (
       select 1 from public.members
       where mess_id = old.mess_id and id <> old.id and active and role = 'admin'
     ) and (tg_op = 'DELETE' or (tg_op = 'UPDATE' and (not new.active or new.role <> 'admin'))) then
    raise exception 'A mess must retain at least one active admin';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger members_protect_last_admin_update
before update of active, role on public.members
for each row execute function public.protect_last_active_admin();

create trigger members_protect_last_admin_delete
before delete on public.members
for each row execute function public.protect_last_active_admin();

-- Supabase Realtime emits changes for every shared module.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'members', 'meals', 'bazar_entries', 'bazar_items', 'deposits',
    'utility_bills', 'utility_bill_members', 'bazar_schedules',
    'monthly_settlements'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
