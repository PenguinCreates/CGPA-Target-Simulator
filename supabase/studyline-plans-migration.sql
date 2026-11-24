-- Run once in Supabase SQL Editor before deploying the multi-plan paywall.
-- Existing active GHS 30 entitlements are retained as lifetime access.
alter table public.studyline_payments
  drop constraint if exists studyline_payments_amount_check;
alter table public.studyline_payments
  add constraint studyline_payments_amount_check
  check (amount in (3000, 5500, 19900));

alter table public.studyline_entitlements
  drop constraint if exists studyline_entitlements_amount_check;
alter table public.studyline_entitlements
  add constraint studyline_entitlements_amount_check
  check (amount in (3000, 5500, 19900));

alter table public.studyline_payments
  add column if not exists plan_id text not null default 'lifetime';
alter table public.studyline_entitlements
  add column if not exists plan_id text not null default 'lifetime';
alter table public.studyline_entitlements
  add column if not exists expires_at timestamptz;

alter table public.studyline_payments
  drop constraint if exists studyline_payments_plan_id_check;
alter table public.studyline_payments
  add constraint studyline_payments_plan_id_check
  check (plan_id in ('six_months', 'twelve_months', 'lifetime'));
alter table public.studyline_entitlements
  drop constraint if exists studyline_entitlements_plan_id_check;
alter table public.studyline_entitlements
  add constraint studyline_entitlements_plan_id_check
  check (plan_id in ('six_months', 'twelve_months', 'lifetime'));
