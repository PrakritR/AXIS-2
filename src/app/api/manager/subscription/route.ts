import { NextResponse } from "next/server";
import {
  formatManagerMonthlyLabel,
  getManagerPurchaseSku,
  isBusinessSkuTier,
  isProSkuTier,
  maxAccountLinksForTier,
  maxPropertiesForManagerTier,
  monthlyUsdForManagerTier,
  PRO_MAX_PROPERTIES,
  setManagerPurchaseTier,
  upgradeManagerAccountToBusiness,
  type ManagerSkuTier,
} from "@/lib/manager-access";
import { getStripe } from "@/lib/stripe";
import { stripeSubscriptionPeriodEndSec } from "@/lib/stripe-subscription-helpers";
import { META_SCHEDULED_BILLING, META_SCHEDULED_TIER } from "@/lib/stripe-subscription-metadata";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reconcileManagerPurchaseWithStripe } from "@/lib/manager-stripe-subscription-sync";

export const runtime = "nodejs";

function subscriptionJson(tier: string | null, billing: string | null) {
  const t = tier?.toLowerCase() ?? null;
  return {
    tier: t,
    billing,
    isPro: isProSkuTier(t),
    isBusiness: isBusinessSkuTier(t),
    isFree: t === "free",
    /** No purchase row — legacy / unknown; not treated as Pro-capped. */
    isLegacyUnlimited: t === null,
    proPropertyLimit: PRO_MAX_PROPERTIES,
    propertyLimit: maxPropertiesForManagerTier(t),
    accountLinkLimit: maxAccountLinksForTier(t),
    monthlyAmountUsd: monthlyUsdForManagerTier(t),
    monthlyLabel: formatManagerMonthlyLabel(t),
  };
}

function isManagerSkuTier(s: string): s is ManagerSkuTier {
  return s === "free" || s === "pro" || s === "business";
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
      await reconcileManagerPurchaseWithStripe(user.id);
    } catch {
      /* Stripe not configured or transient error — serve last known DB state */
    }

    const { tier, billing, stripeSubscriptionId } = await getManagerPurchaseSku(user.id);
    const stripeManaged = Boolean(stripeSubscriptionId);
    const base = subscriptionJson(tier, billing);
    const missingTier = tier == null || String(tier).trim() === "";
    /** Treat missing tier row as Free in the plan UI when there is no paid Stripe subscription. */
    const isFree = base.isFree || (missingTier && !stripeManaged);

    let cancelAtPeriodEnd = false;
    let currentPeriodEnd: number | null = null;
    let scheduledDowngrade: { tier: string; billing: string } | null = null;

    if (stripeManaged && stripeSubscriptionId) {
      try {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        cancelAtPeriodEnd = Boolean((sub as { cancel_at_period_end?: boolean }).cancel_at_period_end);
        currentPeriodEnd = stripeSubscriptionPeriodEndSec(sub);
        const st = sub.metadata?.[META_SCHEDULED_TIER]?.trim().toLowerCase();
        const sb = sub.metadata?.[META_SCHEDULED_BILLING]?.trim().toLowerCase();
        if ((st === "pro" || st === "business") && (sb === "monthly" || sb === "annual")) {
          scheduledDowngrade = { tier: st, billing: sb };
        }
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({
      ...base,
      isFree,
      stripeManaged,
      cancelAtPeriodEnd,
      currentPeriodEnd,
      scheduledDowngrade,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Set tier (free / pro / business) or legacy one-shot upgrade to Business. */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as
      | { action?: string; tier?: string }
      | null;

    if (body?.action === "set_tier" && typeof body.tier === "string") {
      const tierRaw = body.tier.toLowerCase().trim();
      if (!isManagerSkuTier(tierRaw)) {
        return NextResponse.json({ error: "Invalid tier. Use free, pro, or business." }, { status: 400 });
      }
      const result = await setManagerPurchaseTier(user.id, tierRaw);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      const { tier, billing, stripeSubscriptionId } = await getManagerPurchaseSku(user.id);
      return NextResponse.json({
        ok: true,
        ...subscriptionJson(tier, billing),
        stripeManaged: Boolean(stripeSubscriptionId),
      });
    }

    if (body?.action === "upgrade_business") {
      const result = await upgradeManagerAccountToBusiness(user.id);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const { tier, billing, stripeSubscriptionId } = await getManagerPurchaseSku(user.id);
      const alreadyBusiness = result.ok && "alreadyBusiness" in result && result.alreadyBusiness === true;
      return NextResponse.json({
        ok: true,
        alreadyBusiness,
        ...subscriptionJson(tier, billing),
        stripeManaged: Boolean(stripeSubscriptionId),
      });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
