-- Self-service member profile avatars.
-- Members may upload only inside their own auth UID folder and may update only avatar_url via RPC.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-avatars',
  'member-avatars',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members upload own avatar objects" on storage.objects;
create policy "members upload own avatar objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members read own avatar objects" on storage.objects;
create policy "members read own avatar objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members update own avatar objects" on storage.objects;
create policy "members update own avatar objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members delete own avatar objects" on storage.objects;
create policy "members delete own avatar objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Do not grant members broad UPDATE rights on their member row.
drop policy if exists "members update own avatar" on public.members;

create or replace function public.update_my_avatar(p_avatar_url text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_required text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_required := '/storage/v1/object/public/member-avatars/' || auth.uid()::text || '/';
  if p_avatar_url is null
     or length(trim(p_avatar_url)) > 2048
     or position(v_required in trim(p_avatar_url)) = 0 then
    raise exception 'Invalid avatar URL';
  end if;

  update public.members
     set avatar_url = trim(p_avatar_url),
         updated_at = now()
   where user_id = auth.uid()
     and active
   returning avatar_url into v_url;

  if v_url is null then
    raise exception 'Active member profile not found';
  end if;

  return v_url;
end;
$$;

revoke all on function public.update_my_avatar(text) from public;
revoke all on function public.update_my_avatar(text) from anon;
grant execute on function public.update_my_avatar(text) to authenticated;
