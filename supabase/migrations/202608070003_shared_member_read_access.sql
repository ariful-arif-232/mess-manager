-- Active members can read all shared data in their own mess. Writes remain
-- governed by the admin-only policies established in the earlier migrations.

drop policy if exists "mess members read deposits" on public.deposits;
create policy "mess members read deposits" on public.deposits for select
using (mess_id = public.current_mess_id());

drop policy if exists "members read own settlements" on public.monthly_settlements;
create policy "mess members read settlements" on public.monthly_settlements for select
using (mess_id = public.current_mess_id());
