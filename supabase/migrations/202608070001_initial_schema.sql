-- Mess Manager production schema. Run with the Supabase CLI (`supabase db push`).
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'member');
create type public.schedule_status as enum ('pending', 'done');
create type public.settlement_status as enum ('draft', 'finalized');

create table public.messes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  mess_id uuid not null references public.messes(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  email text,
  role public.app_role not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mess_id, email)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(), mess_id uuid not null references public.messes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade, meal_date date not null,
  enabled boolean not null default true, units numeric(6,2) not null default 1 check (units >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (member_id, meal_date)
);

create table public.bazar_entries (
  id uuid primary key default gen_random_uuid(), mess_id uuid not null references public.messes(id) on delete cascade,
  entry_date date not null, buyer text not null default '', items text not null,
  amount numeric(12,2) not null check (amount >= 0), created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.deposits (
  id uuid primary key default gen_random_uuid(), mess_id uuid not null references public.messes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict, deposit_date date not null,
  amount numeric(12,2) not null check (amount > 0), note text not null default '', created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.utility_bills (
  id uuid primary key default gen_random_uuid(), mess_id uuid not null references public.messes(id) on delete cascade,
  bill_date date not null, bill_type text not null, amount numeric(12,2) not null check (amount >= 0),
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.utility_bill_members (
  utility_bill_id uuid not null references public.utility_bills(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  primary key (utility_bill_id, member_id)
);

create table public.bazar_schedules (
  id uuid primary key default gen_random_uuid(), mess_id uuid not null references public.messes(id) on delete cascade,
  schedule_date date not null, assigned_names text not null, status public.schedule_status not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.monthly_settlements (
  id uuid primary key default gen_random_uuid(), mess_id uuid not null references public.messes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict, month date not null check (month = date_trunc('month', month)::date),
  meal_units numeric(10,2) not null default 0, food_cost numeric(12,2) not null default 0,
  utility_cost numeric(12,2) not null default 0, deposit_total numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0, status public.settlement_status not null default 'draft',
  finalized_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (mess_id, member_id, month)
);

create table public.activity_logs (
  id bigint generated always as identity primary key, mess_id uuid not null references public.messes(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null, action text not null, entity_type text not null,
  entity_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create index meals_mess_date_idx on public.meals(mess_id, meal_date);
create index bazar_mess_date_idx on public.bazar_entries(mess_id, entry_date);
create index deposits_mess_date_idx on public.deposits(mess_id, deposit_date);
create index utilities_mess_date_idx on public.utility_bills(mess_id, bill_date);
create index schedules_mess_date_idx on public.bazar_schedules(mess_id, schedule_date);
create index logs_mess_created_idx on public.activity_logs(mess_id, created_at desc);

create function public.current_member() returns public.members language sql stable security definer set search_path = public
as $$ select * from public.members where user_id = auth.uid() and active limit 1 $$;
create function public.current_mess_id() returns uuid language sql stable security definer set search_path = public
as $$ select mess_id from public.current_member() $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'admin' from public.current_member()), false) $$;

alter table public.messes enable row level security;
alter table public.members enable row level security;
alter table public.meals enable row level security;
alter table public.bazar_entries enable row level security;
alter table public.deposits enable row level security;
alter table public.utility_bills enable row level security;
alter table public.utility_bill_members enable row level security;
alter table public.bazar_schedules enable row level security;
alter table public.monthly_settlements enable row level security;
alter table public.activity_logs enable row level security;

create policy "mess members read mess" on public.messes for select using (id = public.current_mess_id());
create policy "admins update mess" on public.messes for update using (id = public.current_mess_id() and public.is_admin()) with check (id = public.current_mess_id() and public.is_admin());
create policy "mess members read roster" on public.members for select using (mess_id = public.current_mess_id());
create policy "admins manage roster" on public.members for all using (mess_id = public.current_mess_id() and public.is_admin()) with check (mess_id = public.current_mess_id() and public.is_admin());
create policy "mess members read meals" on public.meals for select using (mess_id = public.current_mess_id());
create policy "admins or owner insert meals" on public.meals for insert with check (mess_id = public.current_mess_id() and (public.is_admin() or member_id = (select id from public.current_member())));
create policy "admins or owner update meals" on public.meals for update using (mess_id = public.current_mess_id() and (public.is_admin() or member_id = (select id from public.current_member()))) with check (mess_id = public.current_mess_id() and (public.is_admin() or member_id = (select id from public.current_member())));
create policy "admins delete meals" on public.meals for delete using (mess_id = public.current_mess_id() and public.is_admin());

create policy "mess members read bazar" on public.bazar_entries for select using (mess_id = public.current_mess_id());
create policy "admins manage bazar" on public.bazar_entries for all using (mess_id = public.current_mess_id() and public.is_admin()) with check (mess_id = public.current_mess_id() and public.is_admin());
create policy "mess members read deposits" on public.deposits for select using (mess_id = public.current_mess_id() and (public.is_admin() or member_id = (select id from public.current_member())));
create policy "admins manage deposits" on public.deposits for all using (mess_id = public.current_mess_id() and public.is_admin()) with check (mess_id = public.current_mess_id() and public.is_admin());
create policy "mess members read bills" on public.utility_bills for select using (mess_id = public.current_mess_id());
create policy "admins manage bills" on public.utility_bills for all using (mess_id = public.current_mess_id() and public.is_admin()) with check (mess_id = public.current_mess_id() and public.is_admin());
create policy "mess members read bill shares" on public.utility_bill_members for select using (exists (select 1 from public.utility_bills b where b.id = utility_bill_id and b.mess_id = public.current_mess_id()));
create policy "admins manage bill shares" on public.utility_bill_members for all using (public.is_admin() and exists (select 1 from public.utility_bills b where b.id = utility_bill_id and b.mess_id = public.current_mess_id())) with check (public.is_admin() and exists (select 1 from public.utility_bills b where b.id = utility_bill_id and b.mess_id = public.current_mess_id()));
create policy "mess members read schedules" on public.bazar_schedules for select using (mess_id = public.current_mess_id());
create policy "admins manage schedules" on public.bazar_schedules for all using (mess_id = public.current_mess_id() and public.is_admin()) with check (mess_id = public.current_mess_id() and public.is_admin());
create policy "members read own settlements" on public.monthly_settlements for select using (mess_id = public.current_mess_id() and (public.is_admin() or member_id = (select id from public.current_member())));
create policy "admins manage settlements" on public.monthly_settlements for all using (mess_id = public.current_mess_id() and public.is_admin()) with check (mess_id = public.current_mess_id() and public.is_admin());
create policy "admins read logs" on public.activity_logs for select using (mess_id = public.current_mess_id() and public.is_admin());
create policy "members write logs" on public.activity_logs for insert with check (mess_id = public.current_mess_id() and actor_id = auth.uid());

-- Promote the first user from the SQL editor after signup. Never expose service-role keys in this app:
-- insert into public.messes(name) values ('আমাদের মেস') returning id;
-- insert into public.members(mess_id, user_id, name, email, role)
-- values ('<mess-id>', '<auth-user-id>', 'Admin', 'admin@example.com', 'admin');
