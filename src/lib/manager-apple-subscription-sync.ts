import "server-only";
import { normalizeManagerSkuTier } from "@/lib/manager-access";
import {
  APPLE_MANAGER_PURCHASE_BILLING,
  appleManagerPurchaseSessionId,
  isAppleBilledManagerPurchase,
} from "@/lib/manager-apple-purchase";
import {
  interpretRevenueCatWebhookEvent,
  revenueCatSubscriberActiveTier,
  type AppleEntitlementDecision,
  type RevenueCatSubscriber,
  type RevenueCatWebhookEvent,
} from "@/lib/manager-apple-webhook";
import { generateManagerId } from "@/lib/manager-id";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { PaidTier } from "@/lib/stripe-price-ids";

/**
 * Apple/RevenueCat side of the entitlement spine — the mirror of
 * `manager-stripe-subscription-sync.ts`. Writes `billing = 'apple'` grants onto
 * `manager_purchases`, honours the union with any live Stripe subscription
 * (never locks out a payer, never auto-cancels either side), and reconciles
 * against RevenueCat's authoritative state on read. Read docs/agents/apple-iap.md
 * before touching this — it is a real-money path.
 */

const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1";

type PurchaseRow = {
  id: string;
  tier: string | null;
  billing: string | null;
  stripe_subscription_id: string | null;
  apple_original_transaction_id: string | null;
  user_id: string | null;
};

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

const ROW_SELECT =
  "id, tier, billing, stripe_subscription_id, apple_original_transaction_id, user_id";

function hasActiveStripe(row: Pick<PurchaseRow, "stripe_subscription_id">): boolean {
  return Boolean(row.stripe_subscription_id?.trim());
}

/** Loads every manager_purchases row for the account (by user_id and by email), deduped. */
async function loadRows(
  supabase: ServiceClient,
  userId: string,
  email: string | null,
): Promise<PurchaseRow[]> {
  const [{ data: byUser }, { data: byEmail }] = await Promise.all([
    supabase.from("manager_purchases").select(ROW_SELECT).eq("user_id", userId),
    email
      ? supabase.from("manager_purchases").select(ROW_SELECT).ilike("email", email)
      : Promise.resolve({ data: [] as PurchaseRow[] }),
  ]);
  const merged = new Map<string, PurchaseRow>();
  for (const row of [...((byUser as PurchaseRow[]) ?? []), ...((byEmail as PurchaseRow[]) ?? [])]) {
    merged.set(String(row.id), row);
  }
  return [...merged.values()];
}

async function loadProfile(
  supabase: ServiceClient,
  userId: string,
): Promise<{ email: string; managerId: string } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("email, manager_id")
    .eq("id", userId)
    .maybeSingle();
  const email = data?.email?.trim().toLowerCase() ?? "";
  if (!email) return null;
  return { email, managerId: data?.manager_id?.trim() ?? "" };
}

export type UpsertAppleManagerPurchaseInput = {
  userId: string;
  tier: PaidTier;
  originalTransactionId: string;
  environment: string | null;
};

/**
 * Records/renews an Apple-billed paid grant for `userId`.
 *
 * Double-subscribe union (report §3.4): if the account also has a LIVE Stripe
 * subscription, we do NOT overwrite the Stripe-governed tier/billing — we only
 * stamp the Apple ids (so the sub is recorded for support to refund the
 * duplicate) and log a warning. The manager keeps paid access either way; we
 * never cancel or downgrade either side from code.
 */
export async function upsertAppleManagerPurchase(
  input: UpsertAppleManagerPurchaseInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = input.userId.trim();
  const originalTransactionId = input.originalTransactionId.trim();
  if (!userId || !originalTransactionId) {
    return { ok: false, error: "Missing user id or Apple transaction id." };
  }

  const supabase = createSupabaseServiceRoleClient();
  const profile = await loadProfile(supabase, userId);
  if (!profile) return { ok: false, error: "Account email not found." };

  const nowIso = new Date().toISOString();
  const rows = await loadRows(supabase, userId, profile.email);

  if (rows.length > 0) {
    let dualSubscribe = false;
    for (const row of rows) {
      if (hasActiveStripe(row)) {
        dualSubscribe = true;
        const { error } = await supabase
          .from("manager_purchases")
          .update({
            apple_original_transaction_id: originalTransactionId,
            apple_environment: input.environment,
            rc_app_user_id: userId,
            user_id: userId,
          })
          .eq("id", row.id);
        if (error) return { ok: false, error: error.message };
        continue;
      }
      const { error } = await supabase
        .from("manager_purchases")
        .update({
          tier: input.tier,
          billing: APPLE_MANAGER_PURCHASE_BILLING,
          apple_original_transaction_id: originalTransactionId,
          apple_environment: input.environment,
          rc_app_user_id: userId,
          user_id: userId,
          stripe_subscription_id: null,
          paid_at: nowIso,
        })
        .eq("id", row.id);
      if (error) return { ok: false, error: error.message };
    }
    if (dualSubscribe) {
      // Not an error — the account is paid on both stores. Surfaced so billing
      // can proactively refund the duplicate (never auto-cancelled here).
      console.warn("[apple iap] dual subscription detected (Stripe + Apple)", { userId });
    }
    return { ok: true };
  }

  // No row yet — create one (needs email + manager id, like checkout completion).
  let managerId = profile.managerId;
  if (!managerId) {
    managerId = generateManagerId();
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ manager_id: managerId, updated_at: nowIso })
      .eq("id", userId);
    if (profileErr) return { ok: false, error: profileErr.message };
  }

  const insertPatch = {
    stripe_checkout_session_id: appleManagerPurchaseSessionId(originalTransactionId),
    email: profile.email,
    manager_id: managerId,
    tier: input.tier,
    billing: APPLE_MANAGER_PURCHASE_BILLING,
    apple_original_transaction_id: originalTransactionId,
    apple_environment: input.environment,
    rc_app_user_id: userId,
    user_id: userId,
    paid_at: nowIso,
  };
  const { error: insErr } = await supabase.from("manager_purchases").insert(insertPatch);
  if (insErr) {
    // Lost the race with an email-keyed row (unique email/session) — update it.
    if (insErr.code === "23505") {
      const { error: upErr } = await supabase
        .from("manager_purchases")
        .update({
          tier: input.tier,
          billing: APPLE_MANAGER_PURCHASE_BILLING,
          apple_original_transaction_id: originalTransactionId,
          apple_environment: input.environment,
          rc_app_user_id: userId,
          user_id: userId,
          stripe_subscription_id: null,
          paid_at: nowIso,
          manager_id: managerId,
        })
        .ilike("email", profile.email);
      if (upErr) return { ok: false, error: upErr.message };
      return { ok: true };
    }
    return { ok: false, error: insErr.message };
  }
  return { ok: true };
}

/**
 * Ends an Apple-billed grant (expiry / refund). Union-safe:
 * - A row backed by a LIVE Stripe subscription keeps its tier — only the Apple
 *   ids are cleared (the Apple sub ended, Stripe still pays).
 * - An Apple-governed row is downgraded to free.
 * - A stale event for a SUPERSEDED transaction (row already carries a different
 *   original transaction id) is ignored, so an old EXPIRATION can't wipe a newer
 *   resubscribe.
 */
export async function downgradeAppleManagerPurchase(
  userId: string,
  originalTransactionId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const uid = userId.trim();
  if (!uid) return { ok: false, error: "Missing user id." };

  const supabase = createSupabaseServiceRoleClient();
  const profile = await loadProfile(supabase, uid);
  const rows = await loadRows(supabase, uid, profile?.email ?? null);
  const txn = originalTransactionId?.trim() || null;

  for (const row of rows) {
    const rowTxn = row.apple_original_transaction_id?.trim() || null;
    // Only the row that owns this (or an unspecified) Apple sub is affected.
    if (txn && rowTxn && rowTxn !== txn) continue;
    if (!rowTxn && !isAppleBilledManagerPurchase(row.billing, row.apple_original_transaction_id)) {
      continue; // not an Apple-owned row
    }

    if (hasActiveStripe(row)) {
      const { error } = await supabase
        .from("manager_purchases")
        .update({ apple_original_transaction_id: null, apple_environment: null })
        .eq("id", row.id);
      if (error) return { ok: false, error: error.message };
      continue;
    }

    const { error } = await supabase
      .from("manager_purchases")
      .update({
        tier: "free",
        billing: "free",
        apple_original_transaction_id: null,
        apple_environment: null,
      })
      .eq("id", row.id);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Applies one RevenueCat webhook event to `manager_purchases`. */
export async function applyRevenueCatWebhookEvent(
  event: RevenueCatWebhookEvent,
  nowMs = Date.now(),
): Promise<{ decision: AppleEntitlementDecision }> {
  const decision = interpretRevenueCatWebhookEvent(event, nowMs);
  if (decision.action === "grant") {
    await upsertAppleManagerPurchase({
      userId: decision.appUserId,
      tier: decision.tier,
      originalTransactionId: decision.originalTransactionId ?? "",
      environment: decision.environment,
    });
  } else if (decision.action === "revoke") {
    await downgradeAppleManagerPurchase(decision.appUserId, decision.originalTransactionId);
  }
  return { decision };
}

/**
 * Reconciles an Apple-governed row against RevenueCat's authoritative subscriber
 * state (the mirror of `reconcileManagerPurchaseWithStripe`). Best-effort and
 * conservative: it downgrades ONLY when RevenueCat definitively (HTTP 200) shows
 * no active managed subscription; any non-200 / network error keeps the last
 * known DB state. No-op unless the row is Apple-billed and the secret key is set.
 */
export async function reconcileManagerPurchaseWithApple(
  userId: string,
  nowMs = Date.now(),
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const key = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!key) return;

  const supabase = createSupabaseServiceRoleClient();
  const { data: row } = await supabase
    .from("manager_purchases")
    .select("tier, billing, stripe_subscription_id, apple_original_transaction_id")
    .eq("user_id", uid)
    .maybeSingle();

  if (!row) return;
  // Stripe governs its own rows; Apple is only recorded there (dual-subscribe).
  if (hasActiveStripe(row)) return;
  if (!isAppleBilledManagerPurchase(row.billing, row.apple_original_transaction_id)) return;

  let res: Response;
  try {
    res = await fetch(`${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
  } catch {
    return; // transient — keep DB state
  }
  if (!res.ok) return; // non-authoritative — keep DB state

  let subscriber: RevenueCatSubscriber | null = null;
  try {
    const json = (await res.json()) as { subscriber?: RevenueCatSubscriber };
    subscriber = json.subscriber ?? null;
  } catch {
    return;
  }

  const active = revenueCatSubscriberActiveTier(subscriber, nowMs);
  if (!active) {
    await downgradeAppleManagerPurchase(uid, row.apple_original_transaction_id ?? null);
    return;
  }

  // Still active — keep access; only touch the row if the tier drifted.
  if (normalizeManagerSkuTier(row.tier) !== active.tier) {
    await upsertAppleManagerPurchase({
      userId: uid,
      tier: active.tier,
      originalTransactionId: row.apple_original_transaction_id ?? "",
      environment: null,
    });
  }
}
