-- Internal account transfers move cash between Bazar and Utility without changing member deposits or bills.

begin;

create table if not exists public.fund_transfers (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  transfer_date date not null,
  from_account text not null check(from_account in('Bazar','Utility')),
  to_account text not null check(to_account in('Bazar','Utility')),
  amount numeric not null check(amount>0),
  note text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check(from_account<>to_account)
);
create index if not exists fund_transfers_mess_date_idx on public.fund_transfers(mess_id,transfer_date desc,created_at desc);
alter table public.fund_transfers enable row level security;
revoke all on table public.fund_transfers from public,anon;
grant select,insert,delete on table public.fund_transfers to authenticated;

drop policy if exists "members read fund transfers" on public.fund_transfers;
create policy "members read fund transfers" on public.fund_transfers for select to authenticated using(mess_id=(select public.current_mess_id()));
drop policy if exists "admins create fund transfers" on public.fund_transfers;
create policy "admins create fund transfers" on public.fund_transfers for insert to authenticated with check(mess_id=(select public.current_mess_id()) and created_by=(select auth.uid()) and (select public.is_admin()));
drop policy if exists "admins delete fund transfers" on public.fund_transfers;
create policy "admins delete fund transfers" on public.fund_transfers for delete to authenticated using(mess_id=(select public.current_mess_id()) and (select public.is_admin()));

create or replace function public.get_fund_transfer_summary(p_month date)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare
  v_mess_id uuid;v_month_start date;v_month_end date;v_bazar_live numeric:=0;v_utility_live numeric:=0;v_bazar_base numeric:=0;v_utility_base numeric:=0;
  v_bazar_summary jsonb;v_utility_summary jsonb;v_utility_ledger jsonb;v_utility_to_bazar numeric:=0;v_bazar_to_utility numeric:=0;v_bazar_net numeric:=0;v_utility_net numeric:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;v_mess_id:=public.current_mess_id();if v_mess_id is null then return jsonb_build_object('ok',true,'available',false);end if;if p_month is null then raise exception 'Month is required';end if;
  v_month_start:=date_trunc('month',p_month::timestamp)::date;v_month_end:=(v_month_start+interval '1 month')::date;
  select coalesce(sum(d.amount),0) into v_bazar_live from public.deposits d where d.mess_id=v_mess_id and d.purpose='Bazar' and d.deposit_date>=v_month_start and d.deposit_date<v_month_end;
  v_bazar_live:=v_bazar_live-coalesce((select sum(b.amount) from public.bazar_entries b where b.mess_id=v_mess_id and b.entry_date>=v_month_start and b.entry_date<v_month_end),0);
  v_utility_ledger:=public.get_utility_month_ledger(v_month_start,v_month_end-1);v_utility_live:=coalesce((v_utility_ledger->>'utility_fund')::numeric,0);v_bazar_base:=v_bazar_live;v_utility_base:=v_utility_live;
  if exists(select 1 from public.monthly_food_controls c where c.mess_id=v_mess_id and c.month_start=v_month_start and c.active_finalization_id is not null) then v_bazar_summary:=public.get_bazar_settlement_summary(v_month_start);if coalesce((v_bazar_summary->>'active')::boolean,false) then v_bazar_base:=coalesce((v_bazar_summary->>'current_fund')::numeric,v_bazar_live);end if;end if;
  if exists(select 1 from public.monthly_utility_controls c where c.mess_id=v_mess_id and c.month_start=v_month_start and c.active_finalization_id is not null) then v_utility_summary:=public.get_utility_settlement_summary(v_month_start);if coalesce((v_utility_summary->>'active')::boolean,false) then v_utility_base:=coalesce((v_utility_summary->>'current_fund')::numeric,v_utility_live);end if;end if;
  select coalesce(sum(t.amount) filter(where t.from_account='Utility' and t.to_account='Bazar'),0),coalesce(sum(t.amount) filter(where t.from_account='Bazar' and t.to_account='Utility'),0) into v_utility_to_bazar,v_bazar_to_utility from public.fund_transfers t where t.mess_id=v_mess_id and t.transfer_date>=v_month_start and t.transfer_date<v_month_end;
  v_bazar_net:=v_utility_to_bazar-v_bazar_to_utility;v_utility_net:=-v_bazar_net;
  return jsonb_build_object('ok',true,'available',true,'month_start',v_month_start,'bazar_ledger_fund',v_bazar_live,'utility_ledger_fund',v_utility_live,'bazar_settlement_fund',v_bazar_base,'utility_settlement_fund',v_utility_base,'utility_to_bazar',v_utility_to_bazar,'bazar_to_utility',v_bazar_to_utility,'bazar_transfer_net',v_bazar_net,'utility_transfer_net',v_utility_net,'bazar_current_fund',v_bazar_base+v_bazar_net,'utility_current_fund',v_utility_base+v_utility_net,'combined_current_fund',v_bazar_base+v_utility_base);
end;$function$;

create or replace function public.enforce_fund_transfer_balance()
returns trigger language plpgsql security invoker set search_path=''
as $function$
declare v_summary jsonb;v_source numeric;v_destination numeric;v_today date:=(now() at time zone 'Asia/Dhaka')::date;
begin
  if tg_op='UPDATE' then raise exception 'Fund transfers cannot be edited. Delete the incorrect transfer and create a new one.';end if;
  if tg_op='INSERT' then
    if auth.uid() is null then raise exception 'Authentication required';end if;if new.mess_id is distinct from public.current_mess_id() or not public.is_admin() then raise exception 'Only the current mess admin can transfer funds';end if;if new.created_by is distinct from auth.uid() then raise exception 'Transfer creator must match the signed-in admin';end if;if new.transfer_date>v_today then raise exception 'Future fund transfers are not allowed';end if;if new.from_account=new.to_account then raise exception 'Source and destination funds must be different';end if;
    v_summary:=public.get_fund_transfer_summary(new.transfer_date);v_source:=case when new.from_account='Bazar' then coalesce((v_summary->>'bazar_current_fund')::numeric,0) else coalesce((v_summary->>'utility_current_fund')::numeric,0) end;if v_source+0.004<new.amount then raise exception 'Insufficient % fund. Available: %',new.from_account,round(v_source,2);end if;return new;
  end if;
  if tg_op='DELETE' then
    if auth.uid() is null then raise exception 'Authentication required';end if;if old.mess_id is distinct from public.current_mess_id() or not public.is_admin() then raise exception 'Only the current mess admin can delete fund transfers';end if;
    v_summary:=public.get_fund_transfer_summary(old.transfer_date);v_destination:=case when old.to_account='Bazar' then coalesce((v_summary->>'bazar_current_fund')::numeric,0) else coalesce((v_summary->>'utility_current_fund')::numeric,0) end;if v_destination+0.004<old.amount then raise exception 'Cannot reverse this transfer because the destination fund no longer has enough balance';end if;return old;
  end if;return null;
end;$function$;

create or replace function public.audit_fund_transfer()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
  if tg_op='INSERT' then insert into public.activity_logs(mess_id,actor_id,action,entity_type,entity_id,metadata) values(new.mess_id,auth.uid(),'fund_transfer','fund_transfer',new.id::text,jsonb_build_object('from',new.from_account,'to',new.to_account,'amount',new.amount,'date',new.transfer_date,'note',new.note));return new;end if;
  insert into public.activity_logs(mess_id,actor_id,action,entity_type,entity_id,metadata) values(old.mess_id,auth.uid(),'delete_fund_transfer','fund_transfer',old.id::text,jsonb_build_object('from',old.from_account,'to',old.to_account,'amount',old.amount,'date',old.transfer_date));return old;
end;$function$;

drop trigger if exists fund_transfer_balance_guard on public.fund_transfers;
create trigger fund_transfer_balance_guard before insert or update or delete on public.fund_transfers for each row execute function public.enforce_fund_transfer_balance();
drop trigger if exists fund_transfer_audit on public.fund_transfers;
create trigger fund_transfer_audit after insert or delete on public.fund_transfers for each row execute function public.audit_fund_transfer();

revoke all on function public.get_fund_transfer_summary(date) from public,anon;grant execute on function public.get_fund_transfer_summary(date) to authenticated;
revoke all on function public.enforce_fund_transfer_balance() from public,anon,authenticated;
revoke all on function public.audit_fund_transfer() from public,anon,authenticated;

commit;
