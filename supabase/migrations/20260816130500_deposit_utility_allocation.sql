-- Split member deposits into Bazar/Utility purposes and support fixed utility allocations.
-- Existing blank/legacy deposits are intentionally treated as Bazar deposits so
-- the historical all-in-one deposit ledger remains backward compatible.

alter table public.deposits
  add column if not exists purpose text;

update public.deposits
set purpose = case
  when lower(trim(coalesce(note, ''))) = 'bazar' then 'Bazar'
  when lower(trim(coalesce(note, ''))) = 'gas' then 'Gas'
  when lower(trim(coalesce(note, ''))) in ('current', 'electricity', 'electric') then 'Current'
  when lower(trim(coalesce(note, ''))) in ('wifi', 'wi-fi', 'internet') then 'WiFi'
  when lower(trim(coalesce(note, ''))) in ('bua', 'bua bill', 'maid') then 'Bua'
  when lower(trim(coalesce(note, ''))) = 'water' then 'Water'
  when lower(trim(coalesce(note, ''))) = 'other' then 'Other'
  else 'Bazar'
end
where purpose is null or trim(purpose) = '';

alter table public.deposits
  alter column purpose set default 'Bazar',
  alter column purpose set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deposits_purpose_check'
      and conrelid = 'public.deposits'::regclass
  ) then
    alter table public.deposits
      add constraint deposits_purpose_check
      check (purpose in ('Bazar','Gas','Current','WiFi','Bua','Water','Other'));
  end if;
end $$;

alter table public.utility_bills
  add column if not exists bill_mode text;

-- A historical bill assigned to exactly one member matches the new fixed-bill
-- meaning. Multi-member (and unassigned) historical bills remain shared bills.
update public.utility_bills b
set bill_mode = case
  when (
    select count(*)
    from public.utility_bill_members ubm
    where ubm.utility_bill_id = b.id
  ) = 1 then 'fixed'
  else 'shared'
end
where bill_mode is null or trim(bill_mode) = '';

alter table public.utility_bills
  alter column bill_mode set default 'shared',
  alter column bill_mode set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'utility_bills_mode_check'
      and conrelid = 'public.utility_bills'::regclass
  ) then
    alter table public.utility_bills
      add constraint utility_bills_mode_check
      check (bill_mode in ('shared','fixed'));
  end if;
end $$;
