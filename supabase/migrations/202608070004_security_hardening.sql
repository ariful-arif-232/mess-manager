-- Security hardening for the live database after the shared-management rollout.
-- RLS/trigger helper functions do not need to be directly callable through RPC.
-- The atomic bazar save function remains intentionally available to authenticated
-- users and performs active-admin and same-mess authorization internally.

revoke execute on function public.current_member() from public, anon, authenticated;
revoke execute on function public.current_mess_id() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;

revoke execute on function public.enforce_bazar_entry_total() from public, anon, authenticated;
revoke execute on function public.enforce_bill_member_same_mess() from public, anon, authenticated;
revoke execute on function public.protect_last_active_admin() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.sync_bazar_entry_total() from public, anon, authenticated;

revoke execute on function public.save_bazar_entry(uuid, date, uuid, text, jsonb) from public, anon;
grant execute on function public.save_bazar_entry(uuid, date, uuid, text, jsonb) to authenticated;
