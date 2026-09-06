alter table public.member_fund_transfers drop constraint if exists member_fund_transfers_destination_deposit_id_fkey;
alter table public.member_fund_transfers add constraint member_fund_transfers_destination_deposit_id_fkey foreign key (destination_deposit_id) references public.deposits(id) on delete set null;
