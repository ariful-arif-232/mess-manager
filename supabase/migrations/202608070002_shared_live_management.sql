-- Shared live-management features. The initial migration is already deployed;
-- keep all upgrades in this ordered follow-up migration.

alter table public.members
  add column phone text,
  add column join_date date not null default current_date;

alter table public.bazar_entries
  add column buyer_member_id uuid,
  add column note text not null default '';

alter table public.members add constraint members_id_mess_unique unique (id, mess_id);
alter table public.bazar_entries add constraint bazar_buyer_same_mess_fk
  foreign key (buyer_member_id, mess_id) references public.members(id, mess_id) on delete restrict;
alter table public.meals add constraint meals_member_same_mess_fk
  foreign key (member_id, mess_id) references public.members(id, mess_id) on delete cascade;
alter table public.deposits add constraint deposits_member_same_mess_fk
  foreign key (member_id, mess_id) references public.members(id, mess_id) on delete restrict;
alter table public.monthly_settlements add constraint settlements_member_same_mess_fk
  foreign key (member_id, mess_id) references public.members(id, mess_id) on delete restrict;

create table public.bazar_items (
  id uuid primary key default gen_random_uuid(),
  bazar_entry_id uuid not null references public.bazar_entries(id) on delete cascade,
  item_name text not null check (char_length(trim(item_name)) between 1 and 160),
  category text not null default 'Other' check (char_length(trim(category)) between 1 and 80),
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
  if tg_op = 'UPDATE' and old.bazar_entry_id <> new.bazar_entry_id then
    update public.bazar_entries
       set amount = coalesce((select sum(total) from public.bazar_items where bazar_entry_id = old.bazar_entry_id), 0),
           updated_at = now()
     where id = old.bazar_entry_id;
  end if;
  target_id := case when tg_op = 'DELETE' then old.bazar_entry_id else new.bazar_entry_id end;
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

-- The entry amount is derived data. Do not allow a client to override it.
create function public.enforce_bazar_entry_total() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.amount := coalesce((
    select sum(total) from public.bazar_items where bazar_entry_id = new.id
  ), 0);
  return new;
end;
$$;

create trigger bazar_entries_enforce_total_insert
before insert on public.bazar_entries
for each row execute function public.enforce_bazar_entry_total();

create trigger bazar_entries_enforce_total_update
before update of amount on public.bazar_entries
for each row execute function public.enforce_bazar_entry_total();

-- A bill share must point to a member of the bill's mess.
create function public.enforce_bill_member_same_mess() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.utility_bills bill
    join public.members member on member.id = new.member_id
    where bill.id = new.utility_bill_id and bill.mess_id = member.mess_id
  ) then
    raise exception 'Bill member must belong to the same mess';
  end if;
  return new;
end;
$$;

create trigger utility_bill_members_same_mess
before insert or update on public.utility_bill_members
for each row execute function public.enforce_bill_member_same_mess();

-- Create or replace a complete bazar sheet atomically. The authenticated
-- member's mess is derived on the server; callers cannot choose a mess.
create function public.save_bazar_entry(
  p_entry_id uuid,
  p_entry_date date,
  p_buyer_member_id uuid,
  p_note text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry_id uuid;
  v_mess_id uuid;
  v_buyer_name text;
  v_item_names text;
begin
  select member.mess_id
    into v_mess_id
    from public.members member
   where member.user_id = auth.uid()
     and member.active
     and member.role = 'admin';

  if v_mess_id is null then
    raise exception 'Only an active mess admin can save bazar entries';
  end if;
  if p_entry_date is null then
    raise exception 'Bazar date is required';
  end if;
  if char_length(coalesce(p_note, '')) > 2000 then
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
      from jsonb_to_recordset(p_items) as item(
        item_name text, category text, quantity numeric, unit text, unit_price numeric
      )
     where item.item_name is null
        or char_length(trim(item.item_name)) not between 1 and 160
        or item.category is null
        or char_length(trim(item.category)) not between 1 and 80
        or item.quantity is null
        or item.quantity <= 0
        or item.unit is null
        or char_length(trim(item.unit)) not between 1 and 40
        or item.unit_price is null
        or item.unit_price < 0
  ) then
    raise exception 'One or more bazar items are invalid';
  end if;

  select string_agg(trim(item.item_name), ', ')
    into v_item_names
    from jsonb_to_recordset(p_items) as item(
      item_name text, category text, quantity numeric, unit text, unit_price numeric
    );

  if p_entry_id is null then
    insert into public.bazar_entries (
      mess_id, entry_date, buyer_member_id, buyer, note, items, amount, created_by
    ) values (
      v_mess_id, p_entry_date, p_buyer_member_id, v_buyer_name,
      coalesce(p_note, ''), v_item_names, 0, auth.uid()
    ) returning id into v_entry_id;
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
           note = coalesce(p_note, ''),
           items = v_item_names,
           updated_at = now()
     where id = v_entry_id;
    delete from public.bazar_items where bazar_entry_id = v_entry_id;
  end if;

  insert into public.bazar_items (
    bazar_entry_id, item_name, category, quantity, unit, unit_price
  )
  select v_entry_id, trim(item.item_name), trim(item.category),
         item.quantity, trim(item.unit), item.unit_price
    from jsonb_to_recordset(p_items) as item(
      item_name text, category text, quantity numeric, unit text, unit_price numeric
    );

  return v_entry_id;
end;
$$;

revoke all on function public.save_bazar_entry(uuid, date, uuid, text, jsonb) from public;
revoke all on function public.save_bazar_entry(uuid, date, uuid, text, jsonb) from anon;
grant execute on function public.save_bazar_entry(uuid, date, uuid, text, jsonb) to authenticated;

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

drop policy if exists "members write logs" on public.activity_logs;
create policy "admins write logs" on public.activity_logs for insert
with check (
  mess_id = public.current_mess_id()
  and actor_id = auth.uid()
  and public.is_admin()
);

-- Reject role/status changes that would leave a mess without an active admin.
create function public.protect_last_active_admin() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Serialize last-admin changes within a mess so concurrent demotions cannot
  -- both pass the existence check.
  perform pg_advisory_xact_lock(hashtextextended(old.mess_id::text, 0));
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
