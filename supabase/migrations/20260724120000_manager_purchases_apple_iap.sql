-- Apple In-App Purchase as a fifth entitlement grant source on manager_purchases.
--
-- The entitlement model is already multi-source (Stripe subscription, admin grant,
-- payment-waiver/coupon, signup trial). Apple IAP joins as `billing = 'apple'`,
-- mirroring how the other non-Stripe grants coexist. These columns record the
-- Apple/RevenueCat lifecycle anchors so the reconciler and the
-- `revokeUnauthorizedManagerPaidTier` sweep can recognize (and never wipe) an
-- Apple-billed paid tier. See docs/agents/apple-iap.md and the report in
-- firstmate/data/ios-iap-plan/report.md (§1.4 / §3.3).
--
-- Additive + idempotent only: no column rename, no constraint change. The
-- `agent_pending_actions` claim column and every other live surface are untouched.

alter table public.manager_purchases
  add column if not exists apple_original_transaction_id text,
  add column if not exists apple_environment text,
  -- RevenueCat App User ID = our Supabase user.id; kept for support/debug lookups.
  add column if not exists rc_app_user_id text;

-- One Apple subscription (original transaction) maps to at most one manager row.
create index if not exists manager_purchases_apple_original_transaction_id_idx
  on public.manager_purchases (apple_original_transaction_id)
  where apple_original_transaction_id is not null;

-- RLS unchanged: no client policies exist on this table, so it stays service-role
-- only. The columns are written exclusively by the RevenueCat webhook / reconciler
-- (service role), never from a browser.
