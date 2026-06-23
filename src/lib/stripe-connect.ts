import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Controller config for manager recipient accounts (destination charges; platform collects). */
export const AXIS_CONNECT_CONTROLLER = {
  fees: { payer: "application" as const },
  losses: { payments: "application" as const },
  requirement_collection: "stripe" as const,
  stripe_dashboard: { type: "express" as const },
};

export type ManagerConnectValidation =
  | { ok: true; accountId: string }
  | { ok: false; code: "NO_ACCOUNT" | "TRANSFERS_NOT_ACTIVE"; error: string };

export function connectAccountTransfersActive(account: Stripe.Account): boolean {
  return account.capabilities?.transfers === "active";
}

/** True when the manager can receive ACH destination transfers and withdraw to their bank. */
export function connectAccountReadyForAchPayouts(account: Stripe.Account): boolean {
  return connectAccountTransfersActive(account) && Boolean(account.payouts_enabled);
}

export async function createAxisConnectAccount(
  stripe: Stripe,
  opts: { email?: string; axisUserId: string },
): Promise<Stripe.Account> {
  return stripe.accounts.create({
    country: "US",
    email: opts.email,
    // Destination charges only require transfers on the connected account (not card_payments).
    capabilities: {
      transfers: { requested: true },
    },
    controller: AXIS_CONNECT_CONTROLLER,
    metadata: {
      axis_user_id: opts.axisUserId,
      axis_portal: "portal",
    },
  });
}

/** Request transfers on legacy accounts that were created without it. */
export async function ensureConnectAccountTransfersRequested(
  stripe: Stripe,
  accountId: string,
): Promise<Stripe.Account> {
  const account = await stripe.accounts.retrieve(accountId);
  const transfers = account.capabilities?.transfers;
  if (transfers === "active" || transfers === "pending") return account;

  return stripe.accounts.update(accountId, {
    capabilities: {
      transfers: { requested: true },
    },
  });
}

export function managerConnectValidationError(account: Stripe.Account): string {
  const transfers = account.capabilities?.transfers ?? "not_requested";
  if (transfers === "pending") {
    return "This property manager's payout setup is still processing. They must finish Stripe onboarding in Portal → Payments before bank payments can go through.";
  }
  if (transfers === "inactive") {
    return "This property manager's Stripe payout account needs additional information. They must complete onboarding in Portal → Payments before bank payments can go through.";
  }
  return "This property manager has not finished Stripe payout setup. They must connect payouts in Portal → Payments before bank payments can go through.";
}

export async function validateManagerConnectForDestinationCharge(
  stripe: Stripe,
  accountId: string,
): Promise<ManagerConnectValidation> {
  const id = accountId.trim();
  if (!id) {
    return { ok: false, code: "NO_ACCOUNT", error: "No Stripe Connect account linked." };
  }

  const account = await ensureConnectAccountTransfersRequested(stripe, id);
  if (connectAccountTransfersActive(account)) {
    return { ok: true, accountId: account.id };
  }

  return {
    ok: false,
    code: "TRANSFERS_NOT_ACTIVE",
    error: managerConnectValidationError(account),
  };
}

export async function resolveManagerConnectAccountId(
  db: SupabaseClient,
  managerUserId: string,
): Promise<string | null> {
  const id = managerUserId.trim();
  if (!id) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", id)
    .maybeSingle();
  return (profile as { stripe_connect_account_id?: string | null } | null)?.stripe_connect_account_id?.trim() ?? null;
}

export async function resolveAndValidateManagerConnectForPayments(
  stripe: Stripe,
  db: SupabaseClient,
  managerUserId: string,
): Promise<ManagerConnectValidation> {
  const accountId = await resolveManagerConnectAccountId(db, managerUserId);
  if (!accountId) {
    return {
      ok: false,
      code: "NO_ACCOUNT",
      error:
        "This property manager has not connected Stripe payouts yet. Use Zelle or Venmo if the listing offers it.",
    };
  }
  return validateManagerConnectForDestinationCharge(stripe, accountId);
}
