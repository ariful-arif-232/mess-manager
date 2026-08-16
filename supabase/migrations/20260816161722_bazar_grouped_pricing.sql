-- Preserve grouped fresh-market pricing so Add/Edit Bazar does not split one total
-- across many vegetable rows. Existing rows remain valid as legacy standard rows.

alter table public.bazar_items
  add column if not exists pricing_mode text not null default 'standard',
  add column if not exists group_items jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bazar_items_pricing_mode_check'
      and conrelid = 'public.bazar_items'::regclass
  ) then
    alter table public.bazar_items
      add constraint bazar_items_pricing_mode_check
      check (pricing_mode in ('standard','fresh_group','fresh_individual'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bazar_items_group_items_check'
      and conrelid = 'public.bazar_items'::regclass
  ) then
    alter table public.bazar_items
      add constraint bazar_items_group_items_check
      check (group_items is null or jsonb_typeof(group_items) = 'array');
  end if;
end $$;

create or replace function public.save_bazar_entry(
  p_entry_id uuid,
  p_entry_date date,
  p_buyer_member_id uuid,
  p_note text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_entry_id uuid;
  v_mess_id uuid;
  v_buyer_name text;
  v_item_names text;
begin
  select member.mess_id
    into v_mess_id
  from public.current_member() member
  where member.role = 'admin';

  if v_mess_id is null then
    raise exception 'Only an active mess admin can save bazar entries';
  end if;
  if p_entry_date is null then
    raise exception 'Bazar date is required';
  end if;
  if char_length(coalesce(p_note,'')) > 2000 then
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
      item_name text,
      category text,
      quantity numeric,
      unit text,
      unit_price numeric,
      total numeric,
      pricing_mode text,
      group_items jsonb
    )
    where item.item_name is null
       or char_length(trim(item.item_name)) not between 1 and 160
       or item.category is null
       or char_length(trim(item.category)) not between 1 and 80
       or item.quantity is null
       or item.quantity <= 0
       or item.unit is null
       or char_length(trim(item.unit)) not between 1 and 40
       or coalesce(item.total, round(item.unit_price * item.quantity, 2)) is null
       or coalesce(item.total, round(item.unit_price * item.quantity, 2)) < 0
       or coalesce(nullif(trim(item.pricing_mode), ''), 'standard') not in ('standard','fresh_group','fresh_individual')
       or (
         coalesce(nullif(trim(item.pricing_mode), ''), 'standard') = 'fresh_group'
         and (
           item.group_items is null
           or jsonb_typeof(item.group_items) <> 'array'
           or jsonb_array_length(item.group_items) = 0
         )
       )
  ) then
    raise exception 'One or more bazar items are invalid';
  end if;

  select string_agg(trim(item.item_name), ', ')
    into v_item_names
  from jsonb_to_recordset(p_items) as item(item_name text);

  if p_entry_id is null then
    insert into public.bazar_entries(mess_id,entry_date,buyer_member_id,buyer,note,items,amount,created_by)
    values(v_mess_id,p_entry_date,p_buyer_member_id,v_buyer_name,coalesce(p_note,''),v_item_names,0,auth.uid())
    returning id into v_entry_id;
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
           note = coalesce(p_note,''),
           items = v_item_names,
           updated_at = now()
     where id = v_entry_id;

    delete from public.bazar_items where bazar_entry_id = v_entry_id;
  end if;

  insert into public.bazar_items(
    bazar_entry_id,
    item_name,
    category,
    quantity,
    unit,
    unit_price,
    entered_total,
    pricing_mode,
    group_items
  )
  select v_entry_id,
         trim(item.item_name),
         trim(item.category),
         item.quantity,
         trim(item.unit),
         coalesce(item.unit_price, item.total / item.quantity),
         coalesce(item.total, round(item.unit_price * item.quantity, 2)),
         coalesce(nullif(trim(item.pricing_mode), ''), 'standard'),
         item.group_items
  from jsonb_to_recordset(p_items) as item(
    item_name text,
    category text,
    quantity numeric,
    unit text,
    unit_price numeric,
    total numeric,
    pricing_mode text,
    group_items jsonb
  );

  return v_entry_id;
end;
$$;
