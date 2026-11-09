-- Run this in Supabase SQL Editor before deploying the Vercel paywall.
create table if not exists public.studyline_payments (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  amount integer not null check (amount = 3000),
  currency text not null check (currency = 'GHS'),
  status text not null check (status = 'success'),
  created_at timestamptz not null default now()
);

create table if not exists public.studyline_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default false,
  payment_reference text not null unique references public.studyline_payments(reference),
  amount integer not null check (amount = 3000),
  currency text not null check (currency = 'GHS'),
  granted_at timestamptz not null default now()
);

alter table public.studyline_payments enable row level security;
alter table public.studyline_entitlements enable row level security;

-- Browser clients cannot read or write purchase records directly. Only the
-- server-side Supabase service key used by Vercel functions can access them.
revoke all on public.studyline_payments from anon, authenticated;
revoke all on public.studyline_entitlements from anon, authenticated;
grant all on public.studyline_payments to service_role;
grant all on public.studyline_entitlements to service_role;
