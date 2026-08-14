-- Full workspace reset retains only the verified admin who initiated it.
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
  v_count bigint;
begin
  if p_confirmation is distinct from 'RESET' then raise exception 'Type RESET to confirm'; end if;

  select m.mess_id, m.id, lower(coalesce(m.email, u.email)), s.created_at
    into v_mess_id, v_admin_member_id, v_email, v_session_created_at
  from public.members m
  join auth.users u on u.id = m.user_id
  join auth.sessions s on s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  where m.user_id = auth.uid() and m.active and m.role = 'admin';

  if v_mess_id is null then raise exception 'Only an active mess admin can reset this workspace'; end if;
  if v_email is distinct from lower(trim(p_admin_email)) then raise exception 'Admin email does not match'; end if;
  if v_session_created_at < now() - interval '5 minutes' then raise exception 'Security OTP expired. Request a new OTP'; end if;

  delete from public.mess_notices where mess_id = v_mess_id; get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.mess_messages where mess_id = v_mess_id; get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.monthly_settlements where mess_id = v_mess_id; get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.utility_bills where mess_id = v_mess_id; get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.bazar_schedules where mess_id = v_mess_id; get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.bazar_entries where mess_id = v_mess_id; get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.deposits where mess_id = v_mess_id; get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.meals where mess_id = v_mess_id; get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.activity_logs where mess_id = v_mess_id; get diagnostics v_count = row_count; v_deleted := v_deleted + v_count;
  delete from public.members where mess_id = v_mess_id and id <> v_admin_member_id;
  get diagnostics v_deleted_members = row_count;
  v_deleted := v_deleted + v_deleted_members;

  insert into public.activity_logs(mess_id, actor_id, action, entity_type, metadata)
  values(v_mess_id, v_admin_member_id, 'reset', 'workspace', jsonb_build_object('deleted_records',v_deleted,'deleted_members',v_deleted_members,'verified_email',v_email));

  return jsonb_build_object('ok',true,'deleted_records',v_deleted,'deleted_members',v_deleted_members);
end;
$$;

revoke all on function public.reset_current_mess(text, text) from public, anon;
grant execute on function public.reset_current_mess(text, text) to authenticated;
