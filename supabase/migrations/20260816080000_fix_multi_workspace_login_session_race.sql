-- Harden multi-workspace login against auth-session timing/race issues.
-- Workspace selections are keyed by the signed JWT session_id, but do not need
-- a hard FK to auth.sessions. Auth session rows can disappear during sign-out
-- while concurrent bootstrap requests are still finishing.
alter table public.user_workspace_selections
  drop constraint if exists user_workspace_selections_session_id_fkey;

-- RLS policies call current_member() directly, so authenticated callers need
-- EXECUTE permission on this SECURITY DEFINER helper. It only returns the
-- caller's selected (or sole) active membership.
revoke all on function public.current_member() from public, anon;
grant execute on function public.current_member() to authenticated;

-- Keep selection rows private; app clients use the workspace RPCs instead.
revoke all on table public.user_workspace_selections from public, anon, authenticated;
