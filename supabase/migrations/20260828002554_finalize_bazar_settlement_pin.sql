-- Production migration applied on 2026-08-28.
-- Adds immutable Bazar finalization snapshots, member settlement snapshots,
-- settlement transactions, PIN-protected reopen, and finalized-month write locks.

create schema if not exists mm_secure;
revoke all on schema mm_secure from public, anon;
grant usage on schema mm_secure to authenticated;

create table if not exists mm_secure.bazar_finalizations (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  month_start date not null,
  final_day date not null,
  bazar_cost numeric not null default 0,
  food_deposit numeric not null default 0,
  bazar_fund numeric not null default 0,
  bazar_due numeric not null default 0,
  bazar_advance numeric not null default 0,
  meal_units numeric not null default 0,
  member_count integer not null default 0,
  status text not null default 'active' check (status in ('active','settled','reopened')),
  finalized_by uuid not null,
  finalized_at timestamptz not null default now(),
  settled_at timestamptz,
  reopened_by uuid,
  reopened_at timestamptz,
  constraint bazar_finalizations_month_check check (month_start=date_trunc('month',month_start::timestamp)::date),
  constraint bazar_finalizations_day_check check (date_trunc('month',final_day::timestamp)::date=month_start)
);
create index if not exists bazar_finalizations_mess_month_idx on mm_secure.bazar_finalizations(mess_id,month_start,finalized_at desc);
alter table mm_secure.bazar_finalizations enable row level security;
revoke all on mm_secure.bazar_finalizations from anon, authenticated;
grant select,insert,update on mm_secure.bazar_finalizations to authenticated;
create policy "members read bazar finalizations" on mm_secure.bazar_finalizations for select to authenticated using (mess_id=(select public.current_mess_id()));
create policy "admins insert bazar finalizations" on mm_secure.bazar_finalizations for insert to authenticated with check (mess_id=(select public.current_mess_id()) and finalized_by=(select auth.uid()) and (select public.is_admin()));
create policy "admins update bazar finalizations" on mm_secure.bazar_finalizations for update to authenticated using (mess_id=(select public.current_mess_id()) and (select public.is_admin())) with check (mess_id=(select public.current_mess_id()) and (select public.is_admin()));

create table if not exists mm_secure.bazar_finalization_members (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references mm_secure.bazar_finalizations(id) on delete cascade,
  mess_id uuid not null references public.messes(id) on delete cascade,
  month_start date not null,
  member_id uuid not null references public.members(id) on delete restrict,
  member_name text not null,
  meal_units numeric not null default 0,
  food_bill numeric not null default 0,
  food_deposit numeric not null default 0,
  bazar_balance numeric not null default 0,
  food_cutoff date,
  created_at timestamptz not null default now(),
  unique(finalization_id,member_id)
);
create index if not exists bazar_finalization_members_lookup_idx on mm_secure.bazar_finalization_members(finalization_id,member_id);
alter table mm_secure.bazar_finalization_members enable row level security;
revoke all on mm_secure.bazar_finalization_members from anon, authenticated;
grant select,insert on mm_secure.bazar_finalization_members to authenticated;
create policy "members read bazar finalization members" on mm_secure.bazar_finalization_members for select to authenticated using (mess_id=(select public.current_mess_id()));
create policy "admins insert bazar finalization members" on mm_secure.bazar_finalization_members for insert to authenticated with check (mess_id=(select public.current_mess_id()) and (select public.is_admin()));

create table if not exists mm_secure.bazar_settlement_transactions (
  id uuid primary key default gen_random_uuid(),
  finalization_id uuid not null references mm_secure.bazar_finalizations(id) on delete cascade,
  mess_id uuid not null references public.messes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  direction text not null check (direction in ('collect','refund')),
  amount numeric not null check (amount>0),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists bazar_settlement_tx_finalization_idx on mm_secure.bazar_settlement_transactions(finalization_id,member_id,created_at);
alter table mm_secure.bazar_settlement_transactions enable row level security;
revoke all on mm_secure.bazar_settlement_transactions from anon, authenticated;
grant select,insert on mm_secure.bazar_settlement_transactions to authenticated;
create policy "members read bazar settlement transactions" on mm_secure.bazar_settlement_transactions for select to authenticated using (mess_id=(select public.current_mess_id()));
create policy "admins insert bazar settlement transactions" on mm_secure.bazar_settlement_transactions for insert to authenticated with check (mess_id=(select public.current_mess_id()) and created_by=(select auth.uid()) and (select public.is_admin()));

create table if not exists mm_secure.bazar_finalize_pins (
  finalization_id uuid primary key references mm_secure.bazar_finalizations(id) on delete cascade,
  mess_id uuid not null references public.messes(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table mm_secure.bazar_finalize_pins enable row level security;
revoke all on mm_secure.bazar_finalize_pins from anon, authenticated;
grant select,insert,update,delete on mm_secure.bazar_finalize_pins to authenticated;
create policy "admins manage bazar finalize pins" on mm_secure.bazar_finalize_pins for all to authenticated using (mess_id=(select public.current_mess_id()) and (select public.is_admin())) with check (mess_id=(select public.current_mess_id()) and (select public.is_admin()));

alter table public.monthly_food_controls add column if not exists active_finalization_id uuid references mm_secure.bazar_finalizations(id) on delete set null;

create or replace function public.get_bazar_settlement_summary(p_month date)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_mess_id uuid; v_month_start date; v_final mm_secure.bazar_finalizations%rowtype; v_members jsonb:='[]'::jsonb; v_row record; v_collected numeric; v_refunded numeric; v_out numeric; v_total_collected numeric:=0; v_total_refunded numeric:=0; v_remaining_due numeric:=0; v_remaining_advance numeric:=0; v_tx_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_mess_id:=public.current_mess_id(); if v_mess_id is null then return jsonb_build_object('ok',true,'active',false); end if;
  v_month_start:=date_trunc('month',p_month::timestamp)::date;
  select f.* into v_final from public.monthly_food_controls c join mm_secure.bazar_finalizations f on f.id=c.active_finalization_id where c.mess_id=v_mess_id and c.month_start=v_month_start limit 1;
  if v_final.id is null then return jsonb_build_object('ok',true,'active',false); end if;
  select count(*)::int,coalesce(sum(amount) filter(where direction='collect'),0),coalesce(sum(amount) filter(where direction='refund'),0) into v_tx_count,v_total_collected,v_total_refunded from mm_secure.bazar_settlement_transactions where finalization_id=v_final.id;
  for v_row in select * from mm_secure.bazar_finalization_members where finalization_id=v_final.id order by created_at,id loop
    select coalesce(sum(amount) filter(where direction='collect'),0),coalesce(sum(amount) filter(where direction='refund'),0) into v_collected,v_refunded from mm_secure.bazar_settlement_transactions where finalization_id=v_final.id and member_id=v_row.member_id;
    v_out:=case when v_row.bazar_balance<0 then least(0,v_row.bazar_balance+v_collected) when v_row.bazar_balance>0 then greatest(0,v_row.bazar_balance-v_refunded) else 0 end;
    v_remaining_due:=v_remaining_due+greatest(0,-v_out); v_remaining_advance:=v_remaining_advance+greatest(0,v_out);
    v_members:=v_members||jsonb_build_array(jsonb_build_object('member_id',v_row.member_id,'member_name',v_row.member_name,'meal_units',v_row.meal_units,'food_bill',v_row.food_bill,'food_deposit',v_row.food_deposit,'original_balance',v_row.bazar_balance,'outstanding_balance',v_out,'collected',v_collected,'refunded',v_refunded,'food_cutoff',v_row.food_cutoff));
  end loop;
  return jsonb_build_object('ok',true,'active',true,'finalization_id',v_final.id,'status',v_final.status,'final_day',v_final.final_day,'finalized_at',v_final.finalized_at,'bazar_cost',v_final.bazar_cost,'food_deposit',v_final.food_deposit,'original_fund',v_final.bazar_fund,'current_fund',v_final.bazar_fund+v_total_collected-v_total_refunded,'original_due',v_final.bazar_due,'original_advance',v_final.bazar_advance,'outstanding_due',v_remaining_due,'outstanding_advance',v_remaining_advance,'collected',v_total_collected,'refunded',v_total_refunded,'settlement_started',(v_tx_count>0),'transaction_count',v_tx_count,'meal_units',v_final.meal_units,'member_count',v_final.member_count,'members',v_members);
end;$function$;
revoke all on function public.get_bazar_settlement_summary(date) from public,anon;
grant execute on function public.get_bazar_settlement_summary(date) to authenticated;

-- Full production function definitions for preview/finalize/settlement/reopen and
-- finalized-month enforcement are intentionally kept in this tracked migration.
-- They correspond to database migration 20260828002554.
