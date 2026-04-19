-- Optional display name captured at signup intent (free / promo-skip), not only from Stripe metadata.
alter table public.manager_purchases
  add column if not exists full_name text;
