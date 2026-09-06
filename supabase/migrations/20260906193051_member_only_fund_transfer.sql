begin;

create table if not exists public.member_fund_transfers (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  transfer_date date not null,
  from_purpose text not null,
  to_purpose text not null,
  amount numeric not null check (amount > 0),
  source_allocations jsonb not null default '[]'::jsonb,
  destination_deposit_id uuid references public.deposits(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  undone_by uuid references auth.users(id),
  undone_at timestamptz,
  check (from_purpose in ('Bazar','Gas','Current','WiFi','Bua','Water','Other')),
  check (to_purpose in ('Bazar','Gas','Current','WiFi','Bua','Water','Other')),
  check ((from_purpose='Bazar' and to_purpose<>'Bazar') or (from_purpose<>'Bazar' and to_purpose='Bazar'))
);

create index if not exists member_fund_transfers_mess_date_idx on public.member_fund_transfers(mess_id,transfer_date desc,created_at desc);
create index if not exists member_fund_transfers_member_idx on public.member_fund_transfers(member_id,transfer_date desc);
create index if not exists member_fund_transfers_destination_idx on public.member_fund_transfers(destination_deposit_id) where undone_at is null;

alter table public.member_fund_transfers enable row level security;
revoke all on public.member_fund_transfers from public,anon,authenticated;
grant select on public.member_fund_transfers to authenticated;

drop policy if exists "members read member fund transfers" on public.member_fund_transfers;
create policy "members read member fund transfers" on public.member_fund_transfers for select to authenticated using (mess_id=(select public.current_mess_id()));

create or replace function public.create_member_fund_transfer(p_member_id uuid,p_transfer_date date,p_from_purpose text,p_to_purpose text,p_amount numeric)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare
  v_mess_id uuid;v_month_start date;v_month_end date;v_today date:=(now() at time zone 'Asia/Dhaka')::date;v_available numeric:=0;v_remaining numeric;v_take numeric;v_row public.deposits%rowtype;v_allocations jsonb:='[]'::jsonb;v_destination_id uuid;v_transfer_id uuid;v_member_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  select m.mess_id into v_mess_id from public.current_member() m where m.role='admin';
  if v_mess_id is null then raise exception 'Only an active mess admin can transfer member funds';end if;
  if p_transfer_date is null then raise exception 'Transfer date is required';end if;
  if p_transfer_date>v_today then raise exception 'Future fund transfers are not allowed';end if;
  if p_amount is null or p_amount<=0 then raise exception 'Transfer amount must be greater than zero';end if;
  if p_from_purpose not in ('Bazar','Gas','Current','WiFi','Bua','Water','Other') or p_to_purpose not in ('Bazar','Gas','Current','WiFi','Bua','Water','Other') or not ((p_from_purpose='Bazar' and p_to_purpose<>'Bazar') or (p_from_purpose<>'Bazar' and p_to_purpose='Bazar')) then raise exception 'Choose Bazar on one side and a Utility category on the other';end if;
  select name into v_member_name from public.members where id=p_member_id and mess_id=v_mess_id and deleted_at is null;
  if v_member_name is null then raise exception 'Member not found in the current workspace';end if;
  v_month_start:=date_trunc('month',p_transfer_date::timestamp)::date;v_month_end:=(v_month_start+interval '1 month')::date;
  if exists(select 1 from public.monthly_food_controls c where c.mess_id=v_mess_id and c.month_start=v_month_start and c.active_finalization_id is not null) then raise exception 'Bazar is finalized for this month. Reopen it before transferring member funds';end if;
  if exists(select 1 from public.monthly_utility_controls c where c.mess_id=v_mess_id and c.month_start=v_month_start and c.active_finalization_id is not null) then raise exception 'Utility is finalized for this month. Reopen it before transferring member funds';end if;
  select coalesce(sum(d.amount),0) into v_available from public.deposits d where d.mess_id=v_mess_id and d.member_id=p_member_id and d.purpose=p_from_purpose and d.deposit_date>=v_month_start and d.deposit_date<v_month_end and not exists(select 1 from public.member_fund_transfers t where t.destination_deposit_id=d.id and t.undone_at is null);
  if v_available+0.004<p_amount then raise exception 'Only % is available in % for this member',round(v_available,2),p_from_purpose;end if;
  v_remaining:=p_amount;
  for v_row in select d.* from public.deposits d where d.mess_id=v_mess_id and d.member_id=p_member_id and d.purpose=p_from_purpose and d.deposit_date>=v_month_start and d.deposit_date<v_month_end and not exists(select 1 from public.member_fund_transfers t where t.destination_deposit_id=d.id and t.undone_at is null) order by d.deposit_date desc,d.created_at desc,d.id for update loop
    exit when v_remaining<=0.004;v_take:=least(v_remaining,v_row.amount);
    v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('source_deposit_id',v_row.id,'deposit_date',v_row.deposit_date,'purpose',v_row.purpose,'deducted',v_take,'amount_before',v_row.amount));
    if v_take>=v_row.amount-0.004 then delete from public.deposits where id=v_row.id;else update public.deposits set amount=amount-v_take,updated_at=now() where id=v_row.id;end if;
    v_remaining:=v_remaining-v_take;
  end loop;
  if v_remaining>0.004 then raise exception 'Unable to allocate the requested transfer amount';end if;
  insert into public.deposits(mess_id,member_id,deposit_date,amount,note,created_by,purpose) values(v_mess_id,p_member_id,p_transfer_date,p_amount,case when p_from_purpose='Bazar' then 'Fund transfer: Bazar to '||p_to_purpose else 'Fund transfer: '||p_from_purpose||' to Bazar' end,auth.uid(),p_to_purpose) returning id into v_destination_id;
  insert into public.member_fund_transfers(mess_id,member_id,transfer_date,from_purpose,to_purpose,amount,source_allocations,destination_deposit_id,created_by) values(v_mess_id,p_member_id,p_transfer_date,p_from_purpose,p_to_purpose,p_amount,v_allocations,v_destination_id,auth.uid()) returning id into v_transfer_id;
  insert into public.activity_logs(mess_id,actor_id,action,entity_type,entity_id,metadata) values(v_mess_id,auth.uid(),'member_fund_transfer','member_fund_transfer',v_transfer_id::text,jsonb_build_object('member_id',p_member_id,'member_name',v_member_name,'from',p_from_purpose,'to',p_to_purpose,'amount',p_amount,'date',p_transfer_date));
  return jsonb_build_object('ok',true,'transfer_id',v_transfer_id,'member_id',p_member_id,'member_name',v_member_name,'from_purpose',p_from_purpose,'to_purpose',p_to_purpose,'amount',p_amount,'destination_deposit_id',v_destination_id);
end;$function$;

create or replace function public.undo_member_fund_transfer(p_transfer_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_mess_id uuid;v_transfer public.member_fund_transfers%rowtype;v_item jsonb;v_member_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  select m.mess_id into v_mess_id from public.current_member() m where m.role='admin';if v_mess_id is null then raise exception 'Only an active mess admin can undo member fund transfers';end if;
  select * into v_transfer from public.member_fund_transfers where id=p_transfer_id and mess_id=v_mess_id for update;
  if v_transfer.id is null then raise exception 'Fund transfer not found';end if;if v_transfer.undone_at is not null then raise exception 'This fund transfer is already undone';end if;
  if exists(select 1 from public.monthly_food_controls c where c.mess_id=v_mess_id and c.month_start=date_trunc('month',v_transfer.transfer_date::timestamp)::date and c.active_finalization_id is not null) then raise exception 'Bazar is finalized for this month. Reopen it before undoing this transfer';end if;
  if exists(select 1 from public.monthly_utility_controls c where c.mess_id=v_mess_id and c.month_start=date_trunc('month',v_transfer.transfer_date::timestamp)::date and c.active_finalization_id is not null) then raise exception 'Utility is finalized for this month. Reopen it before undoing this transfer';end if;
  perform set_config('mm.member_transfer_internal','on',true);delete from public.deposits where id=v_transfer.destination_deposit_id;if not found then raise exception 'The transfer destination deposit is missing';end if;
  for v_item in select value from jsonb_array_elements(v_transfer.source_allocations) loop insert into public.deposits(mess_id,member_id,deposit_date,amount,note,created_by,purpose) values(v_transfer.mess_id,v_transfer.member_id,(v_item->>'deposit_date')::date,(v_item->>'deducted')::numeric,'Restored from Fund Transfer undo',auth.uid(),v_item->>'purpose');end loop;
  update public.member_fund_transfers set undone_by=auth.uid(),undone_at=now() where id=v_transfer.id;select name into v_member_name from public.members where id=v_transfer.member_id;
  insert into public.activity_logs(mess_id,actor_id,action,entity_type,entity_id,metadata) values(v_mess_id,auth.uid(),'undo_member_fund_transfer','member_fund_transfer',v_transfer.id::text,jsonb_build_object('member_id',v_transfer.member_id,'member_name',v_member_name,'from',v_transfer.from_purpose,'to',v_transfer.to_purpose,'amount',v_transfer.amount,'date',v_transfer.transfer_date));
  return jsonb_build_object('ok',true,'transfer_id',v_transfer.id,'undone',true,'member_id',v_transfer.member_id,'from_purpose',v_transfer.from_purpose,'to_purpose',v_transfer.to_purpose,'amount',v_transfer.amount);
end;$function$;

create or replace function public.protect_active_transfer_destination() returns trigger language plpgsql security invoker set search_path='' as $function$ begin if current_setting('mm.member_transfer_internal',true)='on' then return coalesce(new,old);end if;if exists(select 1 from public.member_fund_transfers t where t.destination_deposit_id=old.id and t.undone_at is null) then raise exception 'This deposit was created by Fund Transfer. Undo the transfer first.';end if;return coalesce(new,old);end;$function$;
drop trigger if exists protect_active_transfer_destination on public.deposits;create trigger protect_active_transfer_destination before update or delete on public.deposits for each row execute function public.protect_active_transfer_destination();
revoke all on function public.create_member_fund_transfer(uuid,date,text,text,numeric) from public,anon;grant execute on function public.create_member_fund_transfer(uuid,date,text,text,numeric) to authenticated;
revoke all on function public.undo_member_fund_transfer(uuid) from public,anon;grant execute on function public.undo_member_fund_transfer(uuid) to authenticated;
revoke all on function public.protect_active_transfer_destination() from public,anon,authenticated;
drop trigger if exists fund_transfer_balance_guard on public.fund_transfers;revoke insert,update,delete on public.fund_transfers from authenticated;

do $migration$
declare v_transfer public.fund_transfers%rowtype;v_source public.deposits%rowtype;v_count integer;v_destination_id uuid;v_new_transfer_id uuid;
begin
  for v_transfer in select * from public.fund_transfers where from_account='Utility' and to_account='Bazar' order by created_at,id loop
    select count(*) into v_count from public.deposits d where d.mess_id=v_transfer.mess_id and d.purpose in ('Gas','Current','WiFi','Bua','Water','Other') and d.amount=v_transfer.amount and d.deposit_date>=date_trunc('month',v_transfer.transfer_date::timestamp)::date and d.deposit_date<(date_trunc('month',v_transfer.transfer_date::timestamp)+interval '1 month')::date;
    if v_count=1 then
      select d.* into v_source from public.deposits d where d.mess_id=v_transfer.mess_id and d.purpose in ('Gas','Current','WiFi','Bua','Water','Other') and d.amount=v_transfer.amount and d.deposit_date>=date_trunc('month',v_transfer.transfer_date::timestamp)::date and d.deposit_date<(date_trunc('month',v_transfer.transfer_date::timestamp)+interval '1 month')::date limit 1;
      delete from public.deposits where id=v_source.id;
      insert into public.deposits(mess_id,member_id,deposit_date,amount,note,created_by,purpose,created_at,updated_at) values(v_transfer.mess_id,v_source.member_id,v_transfer.transfer_date,v_transfer.amount,'Fund transfer: '||v_source.purpose||' to Bazar',v_transfer.created_by,'Bazar',v_transfer.created_at,v_transfer.created_at) returning id into v_destination_id;
      insert into public.member_fund_transfers(mess_id,member_id,transfer_date,from_purpose,to_purpose,amount,source_allocations,destination_deposit_id,created_by,created_at) values(v_transfer.mess_id,v_source.member_id,v_transfer.transfer_date,v_source.purpose,'Bazar',v_transfer.amount,jsonb_build_array(jsonb_build_object('source_deposit_id',v_source.id,'deposit_date',v_source.deposit_date,'purpose',v_source.purpose,'deducted',v_source.amount,'amount_before',v_source.amount)),v_destination_id,v_transfer.created_by,v_transfer.created_at) returning id into v_new_transfer_id;
      delete from public.fund_transfers where id=v_transfer.id;
    end if;
  end loop;
end;$migration$;

create or replace function public.get_fund_transfer_summary(p_month date) returns jsonb language plpgsql security invoker set search_path='' as $function$
declare v_mess_id uuid;v_month_start date;v_month_end date;v_bazar numeric:=0;v_utility numeric:=0;v_utility_ledger jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;v_mess_id:=public.current_mess_id();if v_mess_id is null then return jsonb_build_object('ok',true,'available',false);end if;v_month_start:=date_trunc('month',p_month::timestamp)::date;v_month_end:=(v_month_start+interval '1 month')::date;
  select coalesce(sum(d.amount),0)-coalesce((select sum(b.amount) from public.bazar_entries b where b.mess_id=v_mess_id and b.entry_date>=v_month_start and b.entry_date<v_month_end),0) into v_bazar from public.deposits d where d.mess_id=v_mess_id and d.purpose='Bazar' and d.deposit_date>=v_month_start and d.deposit_date<v_month_end;
  v_utility_ledger:=public.get_utility_month_ledger(v_month_start,v_month_end-1);v_utility:=coalesce((v_utility_ledger->>'utility_fund')::numeric,0);
  return jsonb_build_object('ok',true,'available',true,'month_start',v_month_start,'bazar_ledger_fund',v_bazar,'utility_ledger_fund',v_utility,'bazar_settlement_fund',v_bazar,'utility_settlement_fund',v_utility,'utility_to_bazar',0,'bazar_to_utility',0,'bazar_transfer_net',0,'utility_transfer_net',0,'bazar_current_fund',v_bazar,'utility_current_fund',v_utility,'combined_current_fund',v_bazar+v_utility);
end;$function$;

do $realtime$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='member_fund_transfers') then alter publication supabase_realtime add table public.member_fund_transfers;end if;end;$realtime$;

commit;