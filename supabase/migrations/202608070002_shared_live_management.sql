-- Shared live management: richer members, normalized bazar items, and hardened roles.

alter table public.members
  add column phone text,
  add column join_date date not null default current_date;

update public.members
set email = 'legacy-' || id::text || '@invalid.local'
where email is null;

alter table public.members alter column email set not null;
alter table public.members
  add constraint members_phone_length check (phone is null or char_length(phone) <= 40);

drop policy "mess members read roster" on public.members;
create policy "mess members read roster" on public.members for select
using (mess_id = public.current_mess_id() and (active or public.is_admin()));

alter table public.bazar_entries
  add column buyer_member_id uuid references public.members(id) on delete restrict,
  add column note text not null default '';

-- Preserve existing records while moving item details to a normalized child table.
create table public.bazar_items (
  id uuid primary key default gen_random_uuid(),
  bazar_entry_id uuid not null references public.bazar_entries(id) on delete cascade,
  item_name text not null check (char_length(item_name) between 1 and 160),
  category text not null check (char_length(category) between 1 and 80),
  quantity numeric(12,3) check (quantity is null or quantity > 0),
  unit text check (unit is null or char_length(unit) <= 30),
  unit_price numeric(12,2) check (unit_price is null or unit_price >= 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bazar_items_entry_position_idx on public.bazar_items(bazar_entry_id, position);
alter table public.bazar_items enable row level security;

create policy "mess members read bazar items" on public.bazar_items for select
using (exists (
  select 1 from public.bazar_entries e
  where e.id = bazar_entry_id and e.mess_id = public.current_mess_id()
));
create policy "admins manage bazar items" on public.bazar_items for all
using (public.is_admin() and exists (
  select 1 from public.bazar_entries e
  where e.id = bazar_entry_id and e.mess_id = public.current_mess_id()
))
with check (public.is_admin() and exists (
  select 1 from public.bazar_entries e
  where e.id = bazar_entry_id and e.mess_id = public.current_mess_id()
));

insert into public.bazar_items (bazar_entry_id, item_name, category, total_price)
select id, coalesce(nullif(items, ''), 'Legacy bazar'), 'Other', amount
from public.bazar_entries;

update public.bazar_entries e
set buyer_member_id = m.id
from public.members m
where m.mess_id = e.mess_id and lower(m.name) = lower(e.buyer);

-- Child items are authoritative; amount remains for compatibility and reporting.
create function public.refresh_bazar_total() returns trigger
language plpgsql security definer set search_path = public
as $$
declare target_id uuid;
begin
  if tg_op = 'DELETE' then target_id := old.bazar_entry_id;
  else target_id := new.bazar_entry_id;
  end if;
  update public.bazar_entries
  set amount = coalesce((select sum(total_price) from public.bazar_items where bazar_entry_id = target_id), 0),
      updated_at = now()
  where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger refresh_bazar_total_after_items
after insert or update or delete on public.bazar_items
for each row execute function public.refresh_bazar_total();

-- Prevent any update/deactivation from leaving a mess with no active administrator.
create function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = public
as $$
declare remaining integer;
begin
  if old.role = 'admin' and old.active and
     (tg_op = 'DELETE' or new.role <> 'admin' or not new.active or new.mess_id <> old.mess_id) then
    select count(*) into remaining from public.members
    where mess_id = old.mess_id and role = 'admin' and active and id <> old.id;
    if remaining = 0 then
      raise exception 'A mess must always have at least one active admin'
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger protect_last_admin_before_member_change
before update or delete on public.members
for each row execute function public.protect_last_admin();

-- Atomic save API keeps an entry and all its items consistent.
create function public.save_bazar_entry(
  p_id uuid,
  p_entry_date date,
  p_buyer_member_id uuid,
  p_note text,
  p_items jsonb
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid;
  v_mess_id uuid := public.current_mess_id();
  v_item jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_entry_date is null or p_buyer_member_id is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Date, buyer, and at least one item are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.members where id = p_buyer_member_id and mess_id = v_mess_id) then
    raise exception 'Buyer must belong to this mess' using errcode = '23503';
  end if;

  if p_id is null then
    insert into public.bazar_entries (mess_id, entry_date, buyer, buyer_member_id, items, note, amount, created_by)
    values (v_mess_id, p_entry_date, (select name from public.members where id = p_buyer_member_id),
            p_buyer_member_id, '', coalesce(p_note, ''), 0, auth.uid()) returning id into v_id;
  else
    update public.bazar_entries
    set entry_date = p_entry_date, buyer_member_id = p_buyer_member_id,
        buyer = (select name from public.members where id = p_buyer_member_id),
        note = coalesce(p_note, ''), updated_at = now()
    where id = p_id and mess_id = v_mess_id returning id into v_id;
    if v_id is null then raise exception 'Bazar entry not found' using errcode = 'P0002'; end if;
    delete from public.bazar_items where bazar_entry_id = v_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.bazar_items (bazar_entry_id, item_name, category, quantity, unit, unit_price, total_price, position)
    values (v_id, trim(v_item->>'item_name'), trim(v_item->>'category'),
      nullif(v_item->>'quantity', '')::numeric, nullif(trim(v_item->>'unit'), ''),
      nullif(v_item->>'unit_price', '')::numeric, (v_item->>'total_price')::numeric,
      coalesce((v_item->>'position')::integer, 0));
  end loop;
  return v_id;
end;
$$;
revoke all on function public.save_bazar_entry(uuid,date,uuid,text,jsonb) from public;
grant execute on function public.save_bazar_entry(uuid,date,uuid,text,jsonb) to authenticated;

-- Realtime publication; duplicate_object makes this safe on projects where a table is already added.
do $$
declare table_name text;
begin
  foreach table_name in array array['members','meals','bazar_entries','bazar_items','deposits','utility_bills','utility_bill_members'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
