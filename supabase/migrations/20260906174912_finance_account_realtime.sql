-- Keep fund movement and Utility finalization status synced across active devices.

begin;
alter publication supabase_realtime add table public.fund_transfers;
alter publication supabase_realtime add table public.monthly_utility_controls;
commit;
