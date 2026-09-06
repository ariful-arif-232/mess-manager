begin;

grant insert,update on public.member_fund_transfers to authenticated;

drop policy if exists "admins create member fund transfers" on public.member_fund_transfers;
create policy "admins create member fund transfers" on public.member_fund_transfers for insert to authenticated
with check (mess_id=(select public.current_mess_id()) and created_by=(select auth.uid()) and (select public.is_admin()));

drop policy if exists "admins update member fund transfers" on public.member_fund_transfers;
create policy "admins update member fund transfers" on public.member_fund_transfers for update to authenticated
using (mess_id=(select public.current_mess_id()) and (select public.is_admin()))
with check (mess_id=(select public.current_mess_id()) and (select public.is_admin()));

create index if not exists member_fund_transfers_created_by_idx on public.member_fund_transfers(created_by);
create index if not exists member_fund_transfers_undone_by_idx on public.member_fund_transfers(undone_by) where undone_by is not null;

create or replace function public.protect_active_transfer_destination()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
  if current_setting('mm.member_transfer_internal',true)='on' or current_setting('mm.reset_mode',true)='1' then return coalesce(new,old);end if;
  if exists(select 1 from public.member_fund_transfers t where t.destination_deposit_id=old.id and t.undone_at is null) then raise exception 'This deposit was created by Fund Transfer. Undo the transfer first.';end if;
  return coalesce(new,old);
end;$function$;

create or replace function public.reset_current_mess(p_confirmation text,p_admin_email text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_mess_id uuid;v_admin_member_id uuid;v_email text;v_session_created_at timestamptz;v_removed_user_ids uuid[]:='{}'::uuid[];v_deleted bigint:=0;v_deleted_members bigint:=0;v_deleted_auth_users bigint:=0;v_count bigint;
begin
  if p_confirmation is distinct from 'RESET' then raise exception 'Type RESET to confirm';end if;
  select m.mess_id,m.id,lower(u.email),s.created_at into v_mess_id,v_admin_member_id,v_email,v_session_created_at from public.current_member() m join auth.users u on u.id=m.user_id join auth.sessions s on s.id=nullif(auth.jwt()->>'session_id','')::uuid where m.role='admin' and u.email_confirmed_at is not null;
  if v_mess_id is null then raise exception 'Only a verified active mess admin can reset this workspace';end if;
  if v_email is distinct from lower(trim(p_admin_email)) then raise exception 'Admin email does not match the verified account';end if;
  if v_session_created_at<now()-interval '5 minutes' then raise exception 'Security OTP expired. Request a new OTP';end if;
  perform set_config('mm.reset_mode','1',true);
  select coalesce(array_agg(distinct user_id) filter(where user_id is not null),'{}'::uuid[]) into v_removed_user_ids from public.members where mess_id=v_mess_id and id<>v_admin_member_id;
  delete from public.member_fund_transfers where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.fund_transfers where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.monthly_utility_controls where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from mm_secure.utility_finalizations where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from mm_secure.bazar_finalizations where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.monthly_food_controls where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.mess_notices where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.mess_messages where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.monthly_settlements where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.utility_bills where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.bazar_schedules where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.bazar_entries where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.deposits where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.meals where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.activity_logs where mess_id=v_mess_id;get diagnostics v_count=row_count;v_deleted:=v_deleted+v_count;
  delete from public.members where mess_id=v_mess_id and id<>v_admin_member_id;get diagnostics v_deleted_members=row_count;v_deleted:=v_deleted+v_deleted_members;
  if cardinality(v_removed_user_ids)>0 then delete from auth.users u where u.id=any(v_removed_user_ids) and u.id<>auth.uid() and not exists(select 1 from public.members remaining where remaining.user_id=u.id and remaining.active and remaining.deleted_at is null);get diagnostics v_deleted_auth_users=row_count;end if;
  insert into public.activity_logs(mess_id,actor_id,action,entity_type,metadata) values(v_mess_id,auth.uid(),'reset','workspace',jsonb_build_object('deleted_records',v_deleted,'deleted_members',v_deleted_members,'deleted_auth_users',v_deleted_auth_users,'verified_email',v_email));
  return jsonb_build_object('ok',true,'deleted_records',v_deleted,'deleted_members',v_deleted_members,'deleted_auth_users',v_deleted_auth_users);
end;$function$;

commit;