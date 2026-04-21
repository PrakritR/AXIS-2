-- Owner/manager revenue split preferences for Connect payouts (UI + future PaymentIntent logic).
alter table public.profiles
add column if not exists payout_splits_config jsonb not null default '{"owners":[],"notes":""}'::jsonb;

comment on column public.profiles.payout_splits_config is
  'JSON: { owners: [{ id, displayName, email?, applicationFeePercent, rentPercent }], notes?: string }. Percentages 0–100; sums should not exceed 100 per category.';
