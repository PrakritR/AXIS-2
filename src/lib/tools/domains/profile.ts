import { z } from "zod";
import { defineTool } from "../registry";
import {
  managerTierDisplayLabel,
  maxPropertiesForManagerTier,
  normalizeManagerSkuTier,
} from "@/lib/manager-access";
import { getManagerPurchaseSku, getManagerSubscriptionTier } from "@/lib/manager-access-server";
import { MANAGER_INBOX_SCOPE } from "@/lib/portal-inbox-thread-scope";
import { queryDelinquency, queryRentRoll } from "@/lib/reports/queries";
import { screeningConfigured } from "@/lib/screening/config";
import { getStripe } from "@/lib/stripe";
import {
  connectAccountReadyForAchPayouts,
  connectAccountTransfersActive,
  retrieveManagerConnectAccountOrNull,
} from "@/lib/stripe-connect";

/**
 * Stripe Connect readiness as BOOLEANS only — account ids never reach the
 * model. Mirrors the read path of /api/stripe/connect/status (same
 * stripe-connect helpers) minus that route's capability-request write, since a
 * read tool must not mutate the Stripe account.
 */
type ConnectReadiness = {
  stripeConfigured: boolean;
  connected: boolean;
  transfersEnabled: boolean;
  payoutsEnabled: boolean;
  paymentReady: boolean;
  detailsSubmitted: boolean;
};

async function resolveConnectReadiness(accountId: string | null): Promise<ConnectReadiness> {
  const none: ConnectReadiness = {
    stripeConfigured: true,
    connected: false,
    transfersEnabled: false,
    payoutsEnabled: false,
    paymentReady: false,
    detailsSubmitted: false,
  };
  if (!accountId) return none;
  try {
    const stripe = getStripe();
    const account = await retrieveManagerConnectAccountOrNull(stripe, accountId);
    // A stored id the platform can no longer access is a stale link — report
    // "not connected" so the manager re-onboards from the Payments page.
    if (!account) return none;
    return {
      stripeConfigured: true,
      connected: true,
      transfersEnabled: connectAccountTransfersActive(account),
      payoutsEnabled: Boolean(account.payouts_enabled),
      paymentReady: connectAccountReadyForAchPayouts(account),
      detailsSubmitted: Boolean(account.details_submitted),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    // Without Stripe keys we can't refresh live status; an account id exists
    // but none of the readiness capabilities can be confirmed.
    return { ...none, stripeConfigured: !message.includes("STRIPE_SECRET_KEY"), connected: true };
  }
}

export const getManagerProfileTool = defineTool({
  name: "get_manager_profile",
  description:
    "Get the current landlord's own account profile: name, email, subscription plan and property count vs. the plan's property limit, Stripe payout readiness (booleans — answers 'can I accept payments yet'), and whether outbound email and applicant screening are configured.",
  kind: "read",
  inputSchema: z.object({}).strict(),
  handler: async (ctx) => {
    const [profileRes, purchase, tier, propertiesRes] = await Promise.all([
      ctx.db
        .from("profiles")
        .select("full_name, email, stripe_connect_account_id")
        .eq("id", ctx.landlordId)
        .maybeSingle(),
      getManagerPurchaseSku(ctx.landlordId),
      getManagerSubscriptionTier(ctx.landlordId),
      ctx.db.from("manager_property_records").select("id").eq("manager_user_id", ctx.landlordId),
    ]);
    if (propertiesRes.error) throw new Error(propertiesRes.error.message);

    const profile = (profileRes.data ?? null) as {
      full_name?: string | null;
      email?: string | null;
      stripe_connect_account_id?: string | null;
    } | null;
    const sku = normalizeManagerSkuTier(purchase.tier);
    const propertyCount = (propertiesRes.data ?? []).length;
    const payments = await resolveConnectReadiness(profile?.stripe_connect_account_id?.trim() || null);

    return {
      name: profile?.full_name?.trim() || null,
      email: profile?.email?.trim().toLowerCase() || ctx.email || null,
      subscription: {
        /** "free" | "paid" | null — null is a legacy account with full access. */
        tier,
        plan: sku ? managerTierDisplayLabel(sku) : "Legacy (full access)",
        propertyCount,
        /** null = no numeric cap for this plan. */
        propertyLimit: maxPropertiesForManagerTier(purchase.tier),
      },
      payments,
      emailConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
      screeningConfigured: screeningConfigured(),
    };
  },
});

export const getDashboardSummaryTool = defineTool({
  name: "get_dashboard_summary",
  description:
    "One-call portfolio overview for the current landlord: rent-roll and delinquency totals, property counts by status, open/scheduled work orders, pending applications, unread inbox threads, and calendar events in the next 7 days. Use for 'how is my portfolio doing' or as the first call when the user asks for a general status update; drill into the per-domain tools for detail.",
  kind: "read",
  inputSchema: z.object({}).strict(),
  handler: async (ctx) => {
    const now = new Date();
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Small named numbers only; every count comes from a minimal-column,
    // landlord-scoped select (row_data JSON fields are projected via ->>).
    const [rentRoll, delinquency, propertiesRes, workOrdersRes, applicationsRes, inboxRes, scheduleRes] =
      await Promise.all([
        queryRentRoll(ctx.db, ctx.landlordId, {}),
        queryDelinquency(ctx.db, ctx.landlordId, {}),
        ctx.db.from("manager_property_records").select("status").eq("manager_user_id", ctx.landlordId),
        ctx.db.from("portal_work_order_records").select("bucket:row_data->>bucket").eq("manager_user_id", ctx.landlordId),
        ctx.db.from("manager_application_records").select("bucket:row_data->>bucket").eq("manager_user_id", ctx.landlordId),
        ctx.db
          .from("portal_inbox_thread_records")
          .select("unread:row_data->>unread")
          .eq("scope", MANAGER_INBOX_SCOPE)
          .eq("owner_user_id", ctx.userId),
        ctx.db
          .from("portal_schedule_records")
          .select("id")
          .eq("manager_user_id", ctx.landlordId)
          .gte("starts_at", now.toISOString())
          .lte("starts_at", weekOut.toISOString()),
      ]);
    for (const res of [propertiesRes, workOrdersRes, applicationsRes, inboxRes, scheduleRes]) {
      if (res.error) throw new Error(res.error.message);
    }

    const propertiesByStatus: Record<string, number> = {};
    for (const row of (propertiesRes.data ?? []) as { status?: string | null }[]) {
      const status = String(row.status ?? "unknown");
      propertiesByStatus[status] = (propertiesByStatus[status] ?? 0) + 1;
    }

    let openWorkOrders = 0;
    let scheduledWorkOrders = 0;
    for (const row of (workOrdersRes.data ?? []) as { bucket?: string | null }[]) {
      if (row.bucket === "open") openWorkOrders += 1;
      else if (row.bucket === "scheduled") scheduledWorkOrders += 1;
    }

    const pendingApplications = ((applicationsRes.data ?? []) as { bucket?: string | null }[]).filter(
      (row) => row.bucket === "pending",
    ).length;

    const unreadThreads = ((inboxRes.data ?? []) as { unread?: string | boolean | null }[]).filter(
      (row) => String(row.unread) === "true",
    ).length;

    return {
      rentRoll: {
        occupiedUnits: rentRoll.rows.length,
        monthlyRentTotal: rentRoll.totals?.monthlyRent ?? null,
      },
      delinquency: {
        overdueCharges: delinquency.rows.length,
        totalOutstanding: delinquency.totals?.balance ?? null,
      },
      properties: { total: (propertiesRes.data ?? []).length, byStatus: propertiesByStatus },
      workOrders: { open: openWorkOrders, scheduled: scheduledWorkOrders },
      applications: { pending: pendingApplications },
      inbox: { unreadThreads },
      calendar: { eventsNext7Days: (scheduleRes.data ?? []).length },
    };
  },
});
