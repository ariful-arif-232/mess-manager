-- Workspace reset verifies the signed-in Supabase Auth identity, not a potentially stale member profile email.
create or replace function public.reset_current_mess(p_confirmation text, p_admin_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mess_id uuid;
  v_admin_member_id uuid;
  v_email text;
  v_session_created_at timestamptz;
  v_deleted bigint := 0;
  v_deleted_members bigint := 0;
  v_count bigint