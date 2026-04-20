-- Stripe subscription id for in-portal plan changes (proration / tier updates).
alter table public.manager_purchases
  add column if not exists stripe_subscription_id text;

create index if not exists manager_purchases_stripe_subscription_id_idx
  on public.manager_purchases (stripe_subscription_id)
  where stripe_subscription_id is not null;
