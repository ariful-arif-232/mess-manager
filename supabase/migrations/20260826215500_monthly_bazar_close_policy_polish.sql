-- Remove avoidable policy overlap and the redundant index created beside the unique constraint.

drop policy if exists "admins manage monthly food controls" on public.monthly_food_controls;

create policy "admins insert monthly food controls"
on public.monthly_food_controls
for insert
to authenticated
with check (
  mess_id = (select public.current_mess_id())
  and (select public.is_admin())
);

create policy "admins update monthly food controls"
on public.monthly_food_controls
for update
to authenticated
using (
  mess_id = (select public.current_mess_id())
  and (select public.is_admin())
)
with check (
  mess_id = (select public.current_mess_id())
  and (select public.is_admin())
);

create policy "admins delete monthly food controls"
on public.monthly_food_controls
for delete
to authenticated
using (
  mess_id = (select public.current_mess_id())
  and (select public.is_admin())
);

drop index if exists public.monthly_food_controls_mess_month_idx;
