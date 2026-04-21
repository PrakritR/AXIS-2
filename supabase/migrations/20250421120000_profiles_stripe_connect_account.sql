-- Stripe Connect Express account id (acct_...) for payout routing (rent + fees).
alter table public.profiles
  add column if not exists stripe_connect_account_id text;

comment on column public.profiles.stripe_connect_account_id is
  'Stripe Connect Express connected account id for receiving application fees and rent payouts.';
