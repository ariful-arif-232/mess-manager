-- Final polish: safe finalization FK and reset-mode bypass for audited transfer triggers.

begin;

alter table public.monthly_utility_controls drop constraint if exists monthly_utility_controls_active_finalization_id_fkey;
alter table public.monthly_utility_controls add constraint monthly_utility_controls_active_finalization_id_fkey foreign key(active_finalization_id) references mm_secure.utility_finalizations(id) on delete set null;

create or replace function public.enforce_fund_transfer_balance()
returns trigger language plpgsql security invoker set search_path=''
as $function$
declare v_summary jsonb;v_source numeric;v_destination numeric;v_today date:=(now() at time zone 'Asia/Dhaka')::date;
begin
  if coalesce(current_setting('mm.reset_mode',true),'')='1' then if tg_op='DELETE' then return old;end if;return new;end if;
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
  if coalesce(current_setting('mm.reset_mode',true),'')='1' then if tg_op='DELETE' then return old;end if;return new;end if;
  if tg_op='INSERT' then insert into public.activity_logs(mess_id,actor_id,action,entity_type,entity_id,metadata) values(new.mess_id,auth.uid(),'fund_transfer','fund_transfer',new.id::text,jsonb_build_object('from',new.from_account,'to',new.to_account,'amount',new.amount,'date',new.transfer_date,'note',new.note));return new;end if;
  insert into public.activity_logs(mess_id,actor_id,action,entity_type,entity_id,metadata) values(old.mess_id,auth.uid(),'delete_fund_transfer','fund_transfer',old.id::text,jsonb_build_object('from',old.from_account,'to',old.to_account,'amount',old.amount,'date',old.transfer_date));return old;
end;$function$;

create or replace function public.reset_current_mess(p_confirmation text,p_admin_email text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_mess_id uuid;v_admin_member_id uuid;v_email text;v_session_created_at timestamptz;v_removed_user_ids uuid[]:='{}'::uuid[];v_deleted bigint:=0;v_deleted_members bigint:=0;v_deleted_auth_users bigint:=0;v_count bigint;
begin
  if p_confirmation is distinct from 'RESET' then raise exception 'Type RESET to confirm';end if;
  select m.mess_id,m.id,lower(u.email),s.created_at into v_mess_id,v_admin_member_id,v_email,v_session_created_at from public.current_member() m join auth.users u on u.id=m.user_id join auth.sessions s on s.id=nullif(auth.jwt()->>'session_id','')::uuid where m.role='admin' and u.email_confirmed_at is not null;
  if v_mess_id is null then raise exception 'Only a verified active mess admin can reset this workspace';end if;if v_email is distinct from lower(trim(p_admin_email)) then raise exception 'Admin email does not match the verified account';end if;if v_session_created_at<now()-interval '5 minutes' then raise exception 'Security OTP expired. Request a new OTP';end if;
  perform set_config('mm.reset_mode','1',true);
  select coalesce(array_agg(distinct user_id) filter(where user_id is not null),'{}'::uuid[]) into v_removed_user_ids from public.members where mess_id=v_mess_id and id<>v_admin_member_id;
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
