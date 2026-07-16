import { z } from "zod";
import { defineTool } from "../../registry";
import type { VendorAgentContext } from "../../vendor-context";
import { getStripe } from "@/lib/stripe";
import {
  connectAccountReadyForAchPayouts,
  connectAccountTransfersActive,
  retrieveManagerConnectAccountOrNull,
} from "@/lib/stripe-connect";
import { resolveOwnVendorRecords } from "@/lib/vendor-own-record";
import { formatUsd } from "./load-vendor-rows";

export const listMyPayoutsTool = defineTool({
  name: "list_my_payouts",
  description:
    "List your own payout history for completed work orders: amount, status (paid/failed/skipped), the work order it pays, and the failure reason if any. Use for 'did I get paid for that job'.",
  kind: "read",
  inputSchema: z.object({}).strict(),
  handler: async (ctx: VendorAgentContext) => {
    const { data, error } = await ctx.db
      .from("vendor_payouts")
      .select("id, work_order_id, amount_cents, status, failure_reason, created_at")
      .eq("vendor_user_id", ctx.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const payouts = (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      workOrderId: String(row.work_order_id),
      amountCents: (row.amount_cents as number | null) ?? 0,
      amount: formatUsd((row.amount_cents as number | null) ?? 0),
      status: (row.status as string) || null,
      failureReason: (row.failure_reason as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
    }));
    return { count: payouts.length, payouts };
  },
});

type ConnectReadiness = {
  connected: boolean;
  payoutsReady: boolean;
  transfersEnabled?: boolean;
  detailsSubmitted?: boolean;
  /** True when a Connect account is linked but live Stripe status could not be read. */
  statusUnavailable?: boolean;
};

/**
 * Connect readiness booleans, reusing the same helpers as
 * /api/vendor/stripe-connect/status. Read-only: unlike the route, this never
 * mutates the Stripe account; without Stripe keys it reports the stored link.
 */
async function stripeConnectReadiness(accountId: string | null): Promise<ConnectReadiness> {
  if (!accountId) return { connected: false, payoutsReady: false };
  try {
    const stripe = getStripe();
    const account = await retrieveManagerConnectAccountOrNull(stripe, accountId);
    if (!account) return { connected: false, payoutsReady: false };
    return {
      connected: true,
      payoutsReady: connectAccountReadyForAchPayouts(account),
      transfersEnabled: connectAccountTransfersActive(account),
      detailsSubmitted: Boolean(account.details_submitted),
    };
  } catch {
    // Stripe not configured/reachable: report the stored link without live status.
    return { connected: true, payoutsReady: false, statusUnavailable: true };
  }
}

export const getMyProfileTool = defineTool({
  name: "get_my_profile",
  description:
    "Read your own vendor profile: name, contact info, trades, which managers list you, whether your Stripe payout account is ready, and whether your tax profile is complete. Never returns tax identifiers or payment contact details.",
  kind: "read",
  inputSchema: z.object({}).strict(),
  handler: async (ctx: VendorAgentContext) => {
    const [{ data: profile }, directoryRecords] = await Promise.all([
      ctx.db.from("profiles").select("full_name, stripe_connect_account_id").eq("id", ctx.userId).maybeSingle(),
      resolveOwnVendorRecords(ctx.db, ctx.userId),
    ]);
    const own = directoryRecords[0] ?? null;

    // Completeness boolean ONLY — never the TIN/W-9 fields themselves.
    let taxProfileComplete = false;
    if (own) {
      const { data: tax } = await ctx.db
        .from("vendor_tax_profiles")
        .select("legal_name, tin_last4")
        .eq("vendor_id", own.id)
        .eq("manager_user_id", own.managerUserId)
        .maybeSingle();
      taxProfileComplete = Boolean(
        tax && String(tax.legal_name ?? "").trim() && String(tax.tin_last4 ?? "").trim(),
      );
    }

    const accountId =
      String((profile as { stripe_connect_account_id?: string | null } | null)?.stripe_connect_account_id ?? "").trim() ||
      null;

    return {
      name: own?.row.name?.trim() || String(profile?.full_name ?? "").trim() || null,
      email: ctx.email || null,
      phone: own?.row.phone?.trim() || null,
      trades: own?.row.trades?.length ? own.row.trades : own?.row.trade ? [own.row.trade] : [],
      active: own?.row.active !== false,
      linkedManagerCount: directoryRecords.length,
      stripeConnect: await stripeConnectReadiness(accountId),
      taxProfileComplete,
    };
  },
});
