-- Make member claims and admin workspace creation safe for both email OTP and Google OAuth.
-- The canonical, verified Supabase Auth email is authoritative.

create or replace function public.claim_member_by_email()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_member_id uuid;
  v_member_active boolean;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select lower(btrim(u.email))
    into v_email
  from auth.users u
  where u.id = v_uid
    and u.email is not null
    and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    raise exception 'A verified email address is required';
  end if;

  -- Existing user links are idempotent. Never relink an inactive account by email.
  select m.id, m.active
    into v_member_id, v_member_active
  from public.members m
  where m.user_id = v_uid
    and m.deleted_at is null
  limit 1;

  if v_member_id is not null then
    if not v_member_active then
      raise exception 'Your existing mess membership is inactive';
    end if;
    return v_member_id;
  end if;

  select count(*)
    into v_count
  from public.members m
  where m.active
    and m.deleted_at is null
    and m.user_id is null
    and m.email is not null
    and lower(btrim(m.email)) = v_email;

  if v_count = 0 then
    raise exception 'No active mess member is registered for this email';
  elsif v_count > 1 then
    raise exception 'This email matches multiple member profiles; contact an administrator';
  end if;

  select m.id
    into v_member_id
  from public.members m
  where m.active
    and m.deleted_at is null
    and m.user_id is null
    and m.email is not null
    and lower(btrim(m.email)) = v_email
  limit 1
  for update;

  if v_member_id is null then
    raise exception 'Member profile was linked by another request; sign in again';
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

create or replace function public.create_admin_workspace(
  p_name text,
  p_mess_name text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_mess_id uuid;
  v_existing_active boolean;
  v_email_members integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select lower(btrim(u.email))
    into v_email
  from auth.users u
  where u.id = v_uid
    and u.email is not null
    and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    raise exception 'A verified email address is required';
  end if;

  if nullif(btrim(coalesce(p_email, '')), '') is not null
     and lower(btrim(p_email)) <> v_email then
    raise exception 'Email must match the verified account';
  end if;

  -- A Google identity can be automatically linked to the existing Supabase user.
  -- Returning the current workspace makes this operation idempotent and prevents
  -- a second workspace from being created for the same account.
  select m.mess_id, m.active
    into v_mess_id, v_existing_active
  from public.members m
  where m.user_id = v_uid
    and m.deleted_at is null
  limit 1;

  if v_mess_id is not null then
    if not v_existing_active then
      raise exception 'Your existing mess membership is inactive';
    end if;
    return v_mess_id;
  end if;

  -- Do not create a new workspace when this verified email is already on an
  -- existing active roster. The caller should claim/sign into that membership.
  select count(*)
    into v_email_members
  from public.members m
  where m.active
    and m.deleted_at is null
    and m.email is not null
    and lower(btrim(m.email)) = v_email;

  if v_email_members > 0 then
    raise exception 'This email is already registered in a mess; sign in to the existing workspace';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null
     or nullif(btrim(coalesce(p_mess_name, '')), '') is null then
    raise exception 'Name and mess name are required';
  end if;

  insert into public.messes(name)
  values (btrim(p_mess_name))
  returning id into v_mess_id;

  insert into public.members(mess_id, user_id, name, email, role, active)
  values (v_mess_id, v_uid, btrim(p_name), v_email, 'admin', true);

  return v_mess_id;
end;
$$;

revoke all on function public.create_admin_workspace(text, text, text) from public, anon;
grant execute on function public.create_admin_workspace(text, text, text) to authenticated;
