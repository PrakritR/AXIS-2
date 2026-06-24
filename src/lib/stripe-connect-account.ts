import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearManagerConnectAccountId,
  createAxisConnectAccount,
  retrieveManagerConnectAccountOrNull,
} from "@/lib/stripe-connect";

/** Returns a Connect account id for the manager, creating one or clearing stale ids when needed. */
export async function ensureManagerConnectAccountId(
  stripe: Stripe,
  db: SupabaseClient,
  opts: { userId: string; email?: string },
): Promise<string> {
  const { data: profile } = await db
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", opts.userId)
    .maybeSingle();

  let accountId = profile?.stripe_connect_account_id?.trim() ?? null;

  if (accountId) {
    const existing = await retrieveManagerConnectAccountOrNull(stripe, accountId);
    if (!existing) {
      await clearManagerConnectAccountId(db, opts.userId);
      accountId = null;
    }
  }

  if (!accountId) {
    const account = await createAxisConnectAccount(stripe, {
      email: opts.email,
      axisUserId: opts.userId,
    });
    accountId = account.id;
    await db
      .from("profiles")
      .update({
        stripe_connect_account_id: accountId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.userId);
  }

  return accountId;
}
