-- Allow a newly authenticated email-OTP user to claim exactly one pre-created,
-- active, unlinked member profile with the same email address.
create or replace function public.claim_member_by_email()
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_member_id uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null or btrim(v_email) = '' then
    raise exception 'Authenticated account has no email';
  end if;

  -- Existing links are idempotent.
  select id into v_member_id
  from public.members
  where user_id = v_uid and active
  limit 1;
  if v_member_id is not null then
    return v_member_id;
  end if;

  select count(*), min(id)
    into v_count, v_member_id
  from public.members
  where active
    and user_id is null
    and email is not null
    and lower(btrim(email)) = lower(btrim(v_email));

  if v_count = 0 then
    raise exception 'No active mess member is registered for this email';
  elsif v_count > 1 then
    raise exception 'This email matches multiple member profiles; contact an administrator';
  end if;

  update public.members
     set user_id = v_uid,
         updated_at = now()
   where id = v_member_id
     and user_id is null;

  if not found then
    raise exception 'Member profile was linked by another request; sign in again';
  end if;

  return v_member_id;
end;
$$;

revoke all on function public.claim_member_by_email() from public, anon;
grant execute on function public.claim_member_by_email() to authenticated;
