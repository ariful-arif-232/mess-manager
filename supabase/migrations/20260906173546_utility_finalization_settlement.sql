-- Utility monthly finalization mirrors the existing Bazar finalization workflow.
-- It snapshots Utility allocation, locks Utility Bill/Deposit edits, supports settlement,
-- PIN-protected reopen, and audited Undo Settlement & Reopen.

begin;

create table if not exists mm_secure.utility_finalizations (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  month_start date not null,
  final_day date not null,
  utility_bill numeric not null default 0,
  utility_deposit numeric not null default 0,
  utility_fund numeric not null default 0,
  utility_due numeric not null default 0,
  utility_advance numeric not null default 0,
  member_count integer not null default 0,
  status text not null default 'active' check (status in ('active','settled','reopened')),
  finalized_by uuid not null references auth.users(id),
  finalized_at timestamptz not null default now(),
  settled_at timestamptz,
  reopened_by uuid references auth.users(id),
  reopened_at timestamptz
);
create index if not exists utility_finalizations_mess_month_idx on mm_secure.utility_finalizations(mess_id,month_start,finalized_at desc);

create table if not exists mm_secure.utility_finalization_members (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references mm_secure.utility_finalizations(id) on delete cascade,
  mess_id uuid not null references public.messes(id) on delete cascade,
  month_start date not null,
  member_id uuid not null references public.members(id),
  member_name text not null,
  utility_bill numeric not null default 0,
  utility_deposit numeric not null default 0,
  utility_balance numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(finalization_id,member_id)
);
create index if not exists utility_finalization_members_member_idx on mm_secure.utility_finalization_members(member_id);
create index if not exists utility_finalization_members_mess_idx on mm_secure.utility_finalization_members(mess_id,month_start);

create table if not exists mm_secure.utility_finalize_pins (
  finalization_id uuid primary key references mm_secure.utility_finalizations(id) on delete cascade,
  mess_id uuid not null references public.messes(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists utility_finalize_pins_mess_idx on mm_secure.utility_finalize_pins(mess_id);

create table if not exists mm_secure.utility_settlement_transactions (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references mm_secure.utility_finalizations(id) on delete cascade,
  mess_id uuid not null references public.messes(id) on delete cascade,
  member_id uuid not null references public.members(id),
  direction text not null check (direction in ('collect','refund')),
  amount numeric not null check (amount>0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text
);
create index if not exists utility_settlement_finalization_idx on mm_secure.utility_settlement_transactions(finalization_id,voided_at);
create index if not exists utility_settlement_member_idx on mm_secure.utility_settlement_transactions(member_id,finalization_id);
create index if not exists utility_settlement_mess_idx on mm_secure.utility_settlement_transactions(mess_id,finalization_id);

create table if not exists public.monthly_utility_controls (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  month_start date not null,
  active_finalization_id uuid references mm_secure.utility_finalizations(id),
  finalized_by uuid references auth.users(id),
  finalized_at timestamptz,
  reopened_by uuid references auth.users(id),
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mess_id,month_start),
  check(month_start=date_trunc('month',month_start::timestamp)::date)
);
create index if not exists monthly_utility_controls_mess_month_idx on public.monthly_utility_controls(mess_id,month_start);
alter table public.monthly_utility_controls enable row level security;
revoke all on table public.monthly_utility_controls from public,anon;
grant select,insert,update,delete on table public.monthly_utility_controls to authenticated;

drop policy if exists "members read utility controls" on public.monthly_utility_controls;
create policy "members read utility controls" on public.monthly_utility_controls for select to authenticated using(mess_id=(select public.current_mess_id()));
drop policy if exists "admins insert utility controls" on public.monthly_utility_controls;
create policy "admins insert utility controls" on public.monthly_utility_controls for insert to authenticated with check(mess_id=(select public.current_mess_id()) and (select public.is_admin()));
drop policy if exists "admins update utility controls" on public.monthly_utility_controls;
create policy "admins update utility controls" on public.monthly_utility_controls for update to authenticated using(mess_id=(select public.current_mess_id()) and (select public.is_admin())) with check(mess_id=(select public.current_mess_id()) and (select public.is_admin()));
drop policy if exists "admins delete utility controls" on public.monthly_utility_controls;
create policy "admins delete utility controls" on public.monthly_utility_controls for delete to authenticated using(mess_id=(select public.current_mess_id()) and (select public.is_admin()));

grant usage on schema mm_secure to authenticated;
grant select,insert,update on mm_secure.utility_finalizations to authenticated;
grant select,insert on mm_secure.utility_finalization_members to authenticated;
grant select,insert,update,delete on mm_secure.utility_finalize_pins to authenticated;
grant select,insert,update on mm_secure.utility_settlement_transactions to authenticated;

create or replace function public.get_utility_month_ledger(p_month date,p_until date default null)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare
  v_mess_id uuid;v_month_start date;v_month_end date;v_until date;v_type text;v_label text;
  v_shared_total numeric;v_fixed_total numeric;v_actual_total numeric;v_remainder numeric;v_shared_each numeric;
  v_fixed_ids uuid[];v_shared_ids uuid[];v_member_id uuid;v_member_name text;v_amount numeric;v_rec record;
  v_member_bills jsonb:='{}'::jsonb;v_categories jsonb:='[]'::jsonb;v_category_members jsonb;v_members jsonb:='[]'::jsonb;
  v_total_actual numeric:=0;v_total_allocated numeric:=0;v_total_deposit numeric:=0;v_total_due numeric:=0;v_total_advance numeric:=0;
  v_member_bill numeric;v_member_deposit numeric;v_balance numeric;v_member_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_mess_id:=public.current_mess_id();if v_mess_id is null then return jsonb_build_object('ok',true,'available',false);end if;
  if p_month is null then raise exception 'Month is required';end if;
  v_month_start:=date_trunc('month',p_month::timestamp)::date;v_month_end:=(v_month_start+interval '1 month')::date;v_until:=coalesce(p_until,v_month_end-1);
  if v_until<v_month_start or v_until>=v_month_end then raise exception 'Utility ledger date must be inside the selected month';end if;

  for v_type,v_label in select * from(values('Gas','Gas'),('Current','Current'),('WiFi','WiFi'),('Bua','Bua Bill'),('Water','Water'),('Other','Other'))as t(type_key,label) loop
    select coalesce(sum(b.amount),0) into v_shared_total from public.utility_bills b
    where b.mess_id=v_mess_id and b.bill_date>=v_month_start and b.bill_date<=v_until and lower(coalesce(b.bill_mode,'shared'))<>'fixed'
    and(case when lower(trim(b.bill_type))='gas' then 'Gas' when lower(trim(b.bill_type)) in('current','electricity','electric') then 'Current' when lower(trim(b.bill_type)) in('wifi','wi-fi','internet') then 'WiFi' when lower(trim(b.bill_type)) in('bua','bua bill','maid') then 'Bua' when lower(trim(b.bill_type))='water' then 'Water' else 'Other' end)=v_type;
    v_fixed_ids:=array[]::uuid[];v_fixed_total:=0;v_category_members:='[]'::jsonb;
    for v_rec in
      select bm.member_id,max(m.name) member_name,coalesce(sum(b.amount),0) amount from public.utility_bills b
      join public.utility_bill_members bm on bm.utility_bill_id=b.id join public.members m on m.id=bm.member_id and m.mess_id=b.mess_id
      where b.mess_id=v_mess_id and b.bill_date>=v_month_start and b.bill_date<=v_until and lower(coalesce(b.bill_mode,'shared'))='fixed'
      and(case when lower(trim(b.bill_type))='gas' then 'Gas' when lower(trim(b.bill_type)) in('current','electricity','electric') then 'Current' when lower(trim(b.bill_type)) in('wifi','wi-fi','internet') then 'WiFi' when lower(trim(b.bill_type)) in('bua','bua bill','maid') then 'Bua' when lower(trim(b.bill_type))='water' then 'Water' else 'Other' end)=v_type group by bm.member_id
    loop
      v_member_id:=v_rec.member_id;v_member_name:=v_rec.member_name;v_amount:=v_rec.amount;v_fixed_ids:=array_append(v_fixed_ids,v_member_id);v_fixed_total:=v_fixed_total+v_amount;
      v_member_bills:=jsonb_set(v_member_bills,array[v_member_id::text],to_jsonb(coalesce((v_member_bills->>v_member_id::text)::numeric,0)+v_amount),true);
      v_category_members:=v_category_members||jsonb_build_array(jsonb_build_object('member_id',v_member_id,'member_name',v_member_name,'mode','fixed','charge',v_amount));
    end loop;
    select coalesce(array_agg(distinct bm.member_id),array[]::uuid[]) into v_shared_ids from public.utility_bills b join public.utility_bill_members bm on bm.utility_bill_id=b.id
    where b.mess_id=v_mess_id and b.bill_date>=v_month_start and b.bill_date<=v_until and lower(coalesce(b.bill_mode,'shared'))<>'fixed'
    and(case when lower(trim(b.bill_type))='gas' then 'Gas' when lower(trim(b.bill_type)) in('current','electricity','electric') then 'Current' when lower(trim(b.bill_type)) in('wifi','wi-fi','internet') then 'WiFi' when lower(trim(b.bill_type)) in('bua','bua bill','maid') then 'Bua' when lower(trim(b.bill_type))='water' then 'Water' else 'Other' end)=v_type and not(bm.member_id=any(v_fixed_ids));
    v_actual_total:=greatest(v_shared_total,v_fixed_total);v_remainder:=greatest(0,v_actual_total-v_fixed_total);v_shared_each:=case when cardinality(v_shared_ids)>0 then v_remainder/cardinality(v_shared_ids) else 0 end;
    if cardinality(v_shared_ids)>0 then foreach v_member_id in array v_shared_ids loop
      select m.name into v_member_name from public.members m where m.id=v_member_id and m.mess_id=v_mess_id;
      v_member_bills:=jsonb_set(v_member_bills,array[v_member_id::text],to_jsonb(coalesce((v_member_bills->>v_member_id::text)::numeric,0)+v_shared_each),true);
      v_category_members:=v_category_members||jsonb_build_array(jsonb_build_object('member_id',v_member_id,'member_name',v_member_name,'mode','shared','charge',v_shared_each));
    end loop;end if;
    v_total_actual:=v_total_actual+v_actual_total;
    v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key',v_type,'label',v_label,'shared_total',v_shared_total,'fixed_total',v_fixed_total,'actual_total',v_actual_total,'remainder',v_remainder,'shared_each',v_shared_each,'fixed_member_count',cardinality(v_fixed_ids),'shared_member_count',cardinality(v_shared_ids),'members',v_category_members));
  end loop;

  for v_rec in select m.id,m.name,m.active from public.members m where m.mess_id=v_mess_id and m.deleted_at is null order by m.created_at,m.id loop
    v_member_id:=v_rec.id;v_member_bill:=coalesce((v_member_bills->>v_member_id::text)::numeric,0);
    select coalesce(sum(d.amount),0) into v_member_deposit from public.deposits d where d.mess_id=v_mess_id and d.member_id=v_member_id and d.deposit_date>=v_month_start and d.deposit_date<=v_until and coalesce(d.purpose,'Bazar')<>'Bazar';
    if v_rec.active or v_member_bill>0.0001 or v_member_deposit>0.0001 then
      v_balance:=v_member_deposit-v_member_bill;v_total_allocated:=v_total_allocated+v_member_bill;v_total_deposit:=v_total_deposit+v_member_deposit;v_total_due:=v_total_due+greatest(0,-v_balance);v_total_advance:=v_total_advance+greatest(0,v_balance);v_member_count:=v_member_count+1;
      v_members:=v_members||jsonb_build_array(jsonb_build_object('member_id',v_member_id,'member_name',v_rec.name,'utility_bill',v_member_bill,'utility_deposit',v_member_deposit,'utility_balance',v_balance));
    end if;
  end loop;
  return jsonb_build_object('ok',true,'available',true,'month_start',v_month_start,'until_date',v_until,'utility_bill',v_total_actual,'utility_deposit',v_total_deposit,'utility_fund',v_total_deposit-v_total_actual,'utility_due',v_total_due,'utility_advance',v_total_advance,'member_count',v_member_count,'allocated_total',v_total_allocated,'allocation_difference',v_total_allocated-v_total_actual,'categories',v_categories,'members',v_members);
end;$function$;

create or replace function public.check_utility_finalization_conflicts(p_month date,p_final_day date)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_mess_id uuid;v_month_start date;v_month_end date;v_bills integer:=0;v_deposits integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;select m.mess_id into v_mess_id from public.current_member() m where m.role='admin';if v_mess_id is null then raise exception 'Only an active mess admin can finalize Utility';end if;
  v_month_start:=date_trunc('month',p_month::timestamp)::date;v_month_end:=(v_month_start+interval '1 month')::date;
  select count(*)::int into v_bills from public.utility_bills where mess_id=v_mess_id and bill_date>p_final_day and bill_date<v_month_end;
  select count(*)::int into v_deposits from public.deposits where mess_id=v_mess_id and coalesce(purpose,'Bazar')<>'Bazar' and deposit_date>p_final_day and deposit_date<v_month_end;
  return jsonb_build_object('ok',true,'bill_conflicts',v_bills,'deposit_conflicts',v_deposits,'can_finalize',(v_bills=0 and v_deposits=0));
end;$function$;

create or replace function public.preview_utility_finalization(p_month date,p_final_day date)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_mess_id uuid;v_month_start date;v_month_end date;v_today date;v_ledger jsonb;v_conflicts jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;select m.mess_id into v_mess_id from public.current_member() m where m.role='admin';if v_mess_id is null then raise exception 'Only an active mess admin can finalize Utility';end if;
  if p_month is null or p_final_day is null then raise exception 'Month and final day are required';end if;v_month_start:=date_trunc('month',p_month::timestamp)::date;v_month_end:=(v_month_start+interval '1 month')::date;v_today:=(now() at time zone 'Asia/Dhaka')::date;
  if p_final_day<v_month_start or p_final_day>=v_month_end then raise exception 'Final day must be inside the selected month';end if;if p_final_day>v_today then raise exception 'Future date cannot be finalized';end if;
  v_ledger:=public.get_utility_month_ledger(v_month_start,p_final_day);v_conflicts:=public.check_utility_finalization_conflicts(v_month_start,p_final_day);
  return v_ledger||jsonb_build_object('can_finalize',coalesce((v_conflicts->>'can_finalize')::boolean,false) and abs(coalesce((v_ledger->>'allocation_difference')::numeric,0))<0.01,'bill_conflicts',coalesce((v_conflicts->>'bill_conflicts')::int,0),'deposit_conflicts',coalesce((v_conflicts->>'deposit_conflicts')::int,0));
end;$function$;

create or replace function public.get_utility_settlement_summary(p_month date)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_mess_id uuid;v_month_start date;v_final mm_secure.utility_finalizations%rowtype;v_members jsonb:='[]'::jsonb;v_row record;v_collected numeric;v_refunded numeric;v_out numeric;v_total_collected numeric:=0;v_total_refunded numeric:=0;v_remaining_due numeric:=0;v_remaining_advance numeric:=0;v_tx_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;v_mess_id:=public.current_mess_id();if v_mess_id is null then return jsonb_build_object('ok',true,'active',false);end if;v_month_start:=date_trunc('month',p_month::timestamp)::date;
  select f.* into v_final from public.monthly_utility_controls c join mm_secure.utility_finalizations f on f.id=c.active_finalization_id where c.mess_id=v_mess_id and c.month_start=v_month_start limit 1;if v_final.id is null then return jsonb_build_object('ok',true,'active',false);end if;
  select count(*)::int,coalesce(sum(amount) filter(where direction='collect'),0),coalesce(sum(amount) filter(where direction='refund'),0) into v_tx_count,v_total_collected,v_total_refunded from mm_secure.utility_settlement_transactions where finalization_id=v_final.id and voided_at is null;
  for v_row in select * from mm_secure.utility_finalization_members where finalization_id=v_final.id order by created_at,id loop
    select coalesce(sum(amount) filter(where direction='collect'),0),coalesce(sum(amount) filter(where direction='refund'),0) into v_collected,v_refunded from mm_secure.utility_settlement_transactions where finalization_id=v_final.id and member_id=v_row.member_id and voided_at is null;
    v_out:=case when v_row.utility_balance<0 then least(0,v_row.utility_balance+v_collected) when v_row.utility_balance>0 then greatest(0,v_row.utility_balance-v_refunded) else 0 end;
    v_remaining_due:=v_remaining_due+greatest(0,-v_out);v_remaining_advance:=v_remaining_advance+greatest(0,v_out);
    v_members:=v_members||jsonb_build_array(jsonb_build_object('member_id',v_row.member_id,'member_name',v_row.member_name,'utility_bill',v_row.utility_bill,'utility_deposit',v_row.utility_deposit,'original_balance',v_row.utility_balance,'outstanding_balance',v_out,'collected',v_collected,'refunded',v_refunded));
  end loop;
  return jsonb_build_object('ok',true,'active',true,'finalization_id',v_final.id,'status',v_final.status,'final_day',v_final.final_day,'finalized_at',v_final.finalized_at,'utility_bill',v_final.utility_bill,'utility_deposit',v_final.utility_deposit,'original_fund',v_final.utility_fund,'current_fund',v_final.utility_fund+v_total_collected-v_total_refunded,'original_due',v_final.utility_due,'original_advance',v_final.utility_advance,'outstanding_due',v_remaining_due,'outstanding_advance',v_remaining_advance,'collected',v_total_collected,'refunded',v_total_refunded,'settlement_started',(v_tx_count>0),'transaction_count',v_tx_count,'member_count',v_final.member_count,'members',v_members);
end;$function$;

create or replace function public.finalize_month_utility(p_month date,p_final_day date,p_pin text)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_mess_id uuid;v_month_start date;v_existing uuid;v_preview jsonb;v_item jsonb;v_final_id uuid:=gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;select m.mess_id into v_mess_id from public.current_member() m where m.role='admin';if v_mess_id is null then raise exception 'Only an active mess admin can finalize Utility';end if;if p_pin is null or p_pin!~'^[0-9]{4}$' then raise exception 'Reopen PIN must be exactly 4 digits';end if;
  v_month_start:=date_trunc('month',p_month::timestamp)::date;select active_finalization_id into v_existing from public.monthly_utility_controls where mess_id=v_mess_id and month_start=v_month_start for update;if v_existing is not null then raise exception 'Utility is already finalized for this month';end if;
  v_preview:=public.preview_utility_finalization(v_month_start,p_final_day);if not coalesce((v_preview->>'can_finalize')::boolean,false) then raise exception 'Utility finalization check failed. Resolve later bills/deposits or allocation mismatch first.';end if;
  insert into mm_secure.utility_finalizations(id,mess_id,month_start,final_day,utility_bill,utility_deposit,utility_fund,utility_due,utility_advance,member_count,status,finalized_by) values(v_final_id,v_mess_id,v_month_start,p_final_day,(v_preview->>'utility_bill')::numeric,(v_preview->>'utility_deposit')::numeric,(v_preview->>'utility_fund')::numeric,(v_preview->>'utility_due')::numeric,(v_preview->>'utility_advance')::numeric,(v_preview->>'member_count')::int,'active',auth.uid());
  for v_item in select value from jsonb_array_elements(v_preview->'members') loop insert into mm_secure.utility_finalization_members(finalization_id,mess_id,month_start,member_id,member_name,utility_bill,utility_deposit,utility_balance) values(v_final_id,v_mess_id,v_month_start,(v_item->>'member_id')::uuid,v_item->>'member_name',(v_item->>'utility_bill')::numeric,(v_item->>'utility_deposit')::numeric,(v_item->>'utility_balance')::numeric);end loop;
  insert into mm_secure.utility_finalize_pins(finalization_id,mess_id,pin_hash) values(v_final_id,v_mess_id,extensions.crypt(p_pin,extensions.gen_salt('bf',10)));
  insert into public.monthly_utility_controls(mess_id,month_start,active_finalization_id,finalized_by,finalized_at,reopened_by,reopened_at,updated_at) values(v_mess_id,v_month_start,v_final_id,auth.uid(),now(),null,null,now()) on conflict(mess_id,month_start) do update set active_finalization_id=excluded.active_finalization_id,finalized_by=excluded.finalized_by,finalized_at=excluded.finalized_at,reopened_by=null,reopened_at=null,updated_at=now();
  insert into public.activity_logs(mess_id,actor_id,action,entity_type,entity_id,metadata) values(v_mess_id,auth.uid(),'finalize_utility','utility_finalization',v_final_id::text,jsonb_build_object('month',v_month_start,'final_day',p_final_day,'utility_bill',v_preview->'utility_bill','utility_fund',v_preview->'utility_fund','utility_due',v_preview->'utility_due','utility_advance',v_preview->'utility_advance','member_count',v_preview->'member_count'));
  return public.get_utility_settlement_summary(v_month_start);
end;$function$;

create or replace function public.record_utility_settlement(p_month date,p_member_id uuid,p_action text,p_amount numeric default null)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_mess_id uuid;v_month_start date;v_final_id uuid;v_balance numeric;v_paid numeric;v_remaining numeric;v_amount numeric;v_dir text;v_summary jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;select m.mess_id into v_mess_id from public.current_member() m where m.role='admin';if v_mess_id is null then raise exception 'Only an active mess admin can settle Utility';end if;v_month_start:=date_trunc('month',p_month::timestamp)::date;
  select active_finalization_id into v_final_id from public.monthly_utility_controls where mess_id=v_mess_id and month_start=v_month_start for update;if v_final_id is null then raise exception 'Finalize Utility first';end if;if not exists(select 1 from mm_secure.utility_finalizations where id=v_final_id and status in('active','settled')) then raise exception 'Utility finalization is not active';end if;
  select utility_balance into v_balance from mm_secure.utility_finalization_members where finalization_id=v_final_id and member_id=p_member_id;if v_balance is null then raise exception 'Member is not in this Utility finalization';end if;
  if v_balance<0 then v_dir:='collect';if lower(coalesce(p_action,'')) not in('collect','received') then raise exception 'This member has Utility Due';end if;select coalesce(sum(amount),0) into v_paid from mm_secure.utility_settlement_transactions where finalization_id=v_final_id and member_id=p_member_id and direction='collect' and voided_at is null;v_remaining:=greatest(0,-v_balance-v_paid);
  elsif v_balance>0 then v_dir:='refund';if lower(coalesce(p_action,'')) not in('refund','paid') then raise exception 'This member has Utility Advance';end if;select coalesce(sum(amount),0) into v_paid from mm_secure.utility_settlement_transactions where finalization_id=v_final_id and member_id=p_member_id and direction='refund' and voided_at is null;v_remaining:=greatest(0,v_balance-v_paid);else raise exception 'This member is already settled';end if;
  if v_remaining<0.005 then raise exception 'This member is already settled';end if;v_amount:=coalesce(p_amount,v_remaining);if v_amount<=0 or v_amount>v_remaining+0.004 then raise exception 'Settlement amount exceeds outstanding balance';end if;
  insert into mm_secure.utility_settlement_transactions(finalization_id,mess_id,member_id,direction,amount,created_by) values(v_final_id,v_mess_id,p_member_id,v_dir,v_amount,auth.uid());
  v_summary:=public.get_utility_settlement_summary(v_month_start);if abs(coalesce((v_summary->>'current_fund')::numeric,0))<0.005 and coalesce((v_summary->>'outstanding_due')::numeric,0)<0.005 and coalesce((v_summary->>'outstanding_advance')::numeric,0)<0.005 then update mm_secure.utility_finalizations set status='settled',settled_at=now() where id=v_final_id and status='active';end if;
  update public.monthly_utility_controls set updated_at=now() where mess_id=v_mess_id and month_start=v_month_start;
  insert into public.activity_logs(mess_id,actor_id,action,entity_type,entity_id,metadata) values(v_mess_id,auth.uid(),case when v_dir='collect' then 'collect_utility_due' else 'refund_utility_advance' end,'utility_settlement',p_member_id::text,jsonb_build_object('finalization_id',v_final_id,'amount',v_amount,'direction',v_dir));return public.get_utility_settlement_summary(v_month_start);
end;$function$;

create or replace function public.reopen_finalized_utility(p_month date,p_pin text)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_mess_id uuid;v_month_start date;v_final_id uuid;v_pin mm_secure.utility_finalize_pins%rowtype;v_tx integer;v_attempts integer;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;select m.mess_id into v_mess_id from public.current_member() m where m.role='admin';if v_mess_id is null then raise exception 'Only an active mess admin can reopen finalized Utility';end if;v_month_start:=date_trunc('month',p_month::timestamp)::date;
  select active_finalization_id into v_final_id from public.monthly_utility_controls where mess_id=v_mess_id and month_start=v_month_start for update;if v_final_id is null then return jsonb_build_object('ok',false,'error','NOT_FINALIZED','message','Utility is not finalized for this month');end if;
  select count(*)::int into v_tx from mm_secure.utility_settlement_transactions where finalization_id=v_final_id and voided_at is null;if v_tx>0 then return jsonb_build_object('ok',false,'error','SETTLEMENT_STARTED','message','Settlement has started. Use Undo Settlement & Reopen if the recorded cash movement was accidental.');end if;
  select * into v_pin from mm_secure.utility_finalize_pins where finalization_id=v_final_id for update;if v_pin.finalization_id is null then return jsonb_build_object('ok',false,'error','PIN_MISSING','message','Reopen PIN is unavailable');end if;if v_pin.locked_until is not null and v_pin.locked_until>now() then return jsonb_build_object('ok',false,'error','PIN_LOCKED','message','Too many wrong PIN attempts. Try again later.','locked_until',v_pin.locked_until);end if;
  if p_pin is null or extensions.crypt(p_pin,v_pin.pin_hash)<>v_pin.pin_hash then v_attempts:=v_pin.failed_attempts+1;update mm_secure.utility_finalize_pins set failed_attempts=v_attempts,locked_until=case when v_attempts>=5 then now()+interval '15 minutes' else null end,updated_at=now() where finalization_id=v_final_id;return jsonb_build_object('ok',false,'error',case when v_attempts>=5 then 'PIN_LOCKED' else 'INVALID_PIN' end,'message',case when v_attempts>=5 then 'Too many wrong PIN attempts. Locked for 15 minutes.' else 'Wrong reopen PIN' end,'attempts_left',greatest(0,5-v_attempts));end if;
  update mm_secure.utility_finalizations set status='reopened',reopened_by=auth.uid(),reopened_at=now() where id=v_final_id;update public.monthly_utility_controls set active_finalization_id=null,reopened_by=auth.uid(),reopened_at=now(),updated_at=now() where mess_id=v_mess_id and month_start=v_month_start;delete from mm_secure.utility_finalize_pins where finalization_id=v_final_id;
  insert into public.activity_logs(mess_id,actor_id,action,entity_type,entity_id,metadata) values(v_mess_id,auth.uid(),'reopen_finalized_utility','utility_finalization',v_final_id::text,jsonb_build_object('month',v_month_start,'restored_live_state',true));return jsonb_build_object('ok',true,'active',false,'reopened',true,'month_start',v_month_start);
end;$function$;

create or replace function public.undo_utility_settlement_and_reopen(p_month date,p_pin text)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_mess_id uuid;v_month_start date;v_final_id uuid;v_pin mm_secure.utility_finalize_pins%rowtype;v_attempts integer;v_tx_count integer:=0;v_collected numeric:=0;v_refunded numeric:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;select m.mess_id into v_mess_id from public.current_member() m where m.role='admin';if v_mess_id is null then raise exception 'Only an active mess admin can undo settlement and reopen Utility';end if;v_month_start:=date_trunc('month',p_month::timestamp)::date;
  select active_finalization_id into v_final_id from public.monthly_utility_controls where mess_id=v_mess_id and month_start=v_month_start for update;if v_final_id is null then return jsonb_build_object('ok',false,'error','NOT_FINALIZED','message','Utility is not finalized for this month');end if;select * into v_pin from mm_secure.utility_finalize_pins where finalization_id=v_final_id for update;if v_pin.finalization_id is null then return jsonb_build_object('ok',false,'error','PIN_MISSING','message','Reopen PIN is unavailable');end if;
  if v_pin.locked_until is not null and v_pin.locked_until>now() then return jsonb_build_object('ok',false,'error','PIN_LOCKED','message','Too many wrong PIN attempts. Try again later.','locked_until',v_pin.locked_until);end if;
  if p_pin is null or extensions.crypt(p_pin,v_pin.pin_hash)<>v_pin.pin_hash then v_attempts:=v_pin.failed_attempts+1;update mm_secure.utility_finalize_pins set failed_attempts=v_attempts,locked_until=case when v_attempts>=5 then now()+interval '15 minutes' else null end,updated_at=now() where finalization_id=v_final_id;return jsonb_build_object('ok',false,'error',case when v_attempts>=5 then 'PIN_LOCKED' else 'INVALID_PIN' end,'message',case when v_attempts>=5 then 'Too many wrong PIN attempts. Locked for 15 minutes.' else 'Wrong reopen PIN' end,'attempts_left',greatest(0,5-v_attempts));end if;
  select count(*)::int,coalesce(sum(amount) filter(where direction='collect'),0),coalesce(sum(amount) filter(where direction='refund'),0) into v_tx_count,v_collected,v_refunded from mm_secure.utility_settlement_transactions where finalization_id=v_final_id and voided_at is null;
  if v_tx_count=0 then return public.reopen_finalized_utility(v_month_start,p_pin);end if;
  update mm_secure.utility_settlement_transactions set voided_at=now(),voided_by=auth.uid(),void_reason='Voided by admin before reopening finalized Utility' where finalization_id=v_final_id and voided_at is null;
  update mm_secure.utility_finalizations set status='reopened',settled_at=null,reopened_by=auth.uid(),reopened_at=now() where id=v_final_id;update public.monthly_utility_controls set active_finalization_id=null,reopened_by=auth.uid(),reopened_at=now(),updated_at=now() where mess_id=v_mess_id and month_start=v_month_start;delete from mm_secure.utility_finalize_pins where finalization_id=v_final_id;
  insert into public.activity_logs(mess_id,actor_id,action,entity_type,entity_id,metadata) values(v_mess_id,auth.uid(),'undo_utility_settlement_reopen','utility_finalization',v_final_id::text,jsonb_build_object('month',v_month_start,'voided_transactions',v_tx_count,'voided_collected',v_collected,'voided_refunded',v_refunded,'restored_live_state',true));
  return jsonb_build_object('ok',true,'active',false,'reopened',true,'settlement_undone',true,'voided_transactions',v_tx_count,'voided_collected',v_collected,'voided_refunded',v_refunded,'month_start',v_month_start);
end;$function$;

create or replace function public.enforce_finalized_utility_lock()
returns trigger language plpgsql security invoker set search_path=''
as $function$
declare v_old jsonb;v_new jsonb;v_old_mess uuid;v_new_mess uuid;v_old_date date;v_new_date date;v_old_purpose text;v_new_purpose text;v_bill uuid;
begin
  if tg_op<>'INSERT' then v_old:=to_jsonb(old);if tg_table_name='utility_bill_members' then v_bill:=nullif(v_old->>'utility_bill_id','')::uuid;select b.mess_id,b.bill_date into v_old_mess,v_old_date from public.utility_bills b where b.id=v_bill;else v_old_mess:=nullif(v_old->>'mess_id','')::uuid;v_old_date:=case when tg_table_name='utility_bills' then nullif(v_old->>'bill_date','')::date when tg_table_name='deposits' then nullif(v_old->>'deposit_date','')::date else null end;v_old_purpose:=v_old->>'purpose';end if;end if;
  if tg_op<>'DELETE' then v_new:=to_jsonb(new);if tg_table_name='utility_bill_members' then v_bill:=nullif(v_new->>'utility_bill_id','')::uuid;select b.mess_id,b.bill_date into v_new_mess,v_new_date from public.utility_bills b where b.id=v_bill;else v_new_mess:=nullif(v_new->>'mess_id','')::uuid;v_new_date:=case when tg_table_name='utility_bills' then nullif(v_new->>'bill_date','')::date when tg_table_name='deposits' then nullif(v_new->>'deposit_date','')::date else null end;v_new_purpose:=v_new->>'purpose';end if;end if;
  if tg_table_name='deposits' then if tg_op='INSERT' and coalesce(v_new_purpose,'Bazar')='Bazar' then return new;end if;if tg_op='DELETE' and coalesce(v_old_purpose,'Bazar')='Bazar' then return old;end if;if tg_op='UPDATE' and coalesce(v_old_purpose,'Bazar')='Bazar' and coalesce(v_new_purpose,'Bazar')='Bazar' then return new;end if;end if;
  if v_old_mess is not null and v_old_date is not null and exists(select 1 from public.monthly_utility_controls c where c.mess_id=v_old_mess and c.month_start=date_trunc('month',v_old_date::timestamp)::date and c.active_finalization_id is not null) then raise exception 'Utility is finalized for this month. Reopen with the PIN before changing Utility Bill or Utility Deposit data.';end if;
  if v_new_mess is not null and v_new_date is not null and exists(select 1 from public.monthly_utility_controls c where c.mess_id=v_new_mess and c.month_start=date_trunc('month',v_new_date::timestamp)::date and c.active_finalization_id is not null) then raise exception 'Utility is finalized for this month. Reopen with the PIN before changing Utility Bill or Utility Deposit data.';end if;
  if tg_op='DELETE' then return old;end if;return new;
end;$function$;

drop trigger if exists enforce_finalized_utility_lock_bills on public.utility_bills;create trigger enforce_finalized_utility_lock_bills before insert or update or delete on public.utility_bills for each row execute function public.enforce_finalized_utility_lock();
drop trigger if exists enforce_finalized_utility_lock_members on public.utility_bill_members;create trigger enforce_finalized_utility_lock_members before insert or update or delete on public.utility_bill_members for each row execute function public.enforce_finalized_utility_lock();
drop trigger if exists enforce_finalized_utility_lock_deposits on public.deposits;create trigger enforce_finalized_utility_lock_deposits before insert or update or delete on public.deposits for each row execute function public.enforce_finalized_utility_lock();

revoke all on function public.get_utility_month_ledger(date,date) from public,anon;grant execute on function public.get_utility_month_ledger(date,date) to authenticated;
revoke all on function public.check_utility_finalization_conflicts(date,date) from public,anon;grant execute on function public.check_utility_finalization_conflicts(date,date) to authenticated;
revoke all on function public.preview_utility_finalization(date,date) from public,anon;grant execute on function public.preview_utility_finalization(date,date) to authenticated;
revoke all on function public.get_utility_settlement_summary(date) from public,anon;grant execute on function public.get_utility_settlement_summary(date) to authenticated;
revoke all on function public.finalize_month_utility(date,date,text) from public,anon;grant execute on function public.finalize_month_utility(date,date,text) to authenticated;
revoke all on function public.record_utility_settlement(date,uuid,text,numeric) from public,anon;grant execute on function public.record_utility_settlement(date,uuid,text,numeric) to authenticated;
revoke all on function public.reopen_finalized_utility(date,text) from public,anon;grant execute on function public.reopen_finalized_utility(date,text) to authenticated;
revoke all on function public.undo_utility_settlement_and_reopen(date,text) from public,anon;grant execute on function public.undo_utility_settlement_and_reopen(date,text) to authenticated;
revoke all on function public.enforce_finalized_utility_lock() from public,anon,authenticated;

commit;
