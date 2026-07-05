-- Stripe Customer id for saved resident payment methods (cards, ACH).

alter table public.profiles
  add column if not exists stripe_customer_id text;

comment on column public.profiles.stripe_customer_id is
  'Stripe Customer used to store saved payment methods for portal payers (residents).';
