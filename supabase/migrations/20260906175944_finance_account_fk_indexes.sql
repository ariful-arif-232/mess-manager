-- Cover foreign keys introduced by Utility finalization and fund transfers.

begin;
create index if not exists utility_finalizations_finalized_by_idx on mm_secure.utility_finalizations(finalized_by);
create index if not exists utility_finalizations_reopened_by_idx on mm_secure.utility_finalizations(reopened_by) where reopened_by is not null;
create index if not exists utility_settlement_created_by_idx on mm_secure.utility_settlement_transactions(created_by);
create index if not exists utility_settlement_voided_by_idx on mm_secure.utility_settlement_transactions(voided_by) where voided_by is not null;
create index if not exists fund_transfers_created_by_idx on public.fund_transfers(created_by);
create index if not exists monthly_utility_controls_finalization_idx on public.monthly_utility_controls(active_finalization_id) where active_finalization_id is not null;
create index if not exists monthly_utility_controls_finalized_by_idx on public.monthly_utility_controls(finalized_by) where finalized_by is not null;
create index if not exists monthly_utility_controls_reopened_by_idx on public.monthly_utility_controls(reopened_by) where reopened_by is not null;
commit;
