import { NextResponse } from "next/server";
import {
  getManagerPurchaseSku,
  isBusinessSkuTier,
  isProSkuTier,
  PRO_MAX_PROPERTIES,
  upgradeManagerAccountToBusiness,
} from "@/lib/manager-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  };
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

    const { tier, billing } = await getManagerPurchaseSku(user.id);
    return NextResponse.json(subscriptionJson(tier, billing));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Account-scoped upgrade: sets `manager_purchases.tier` to `business` for the signed-in user. */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { action?: string } | null;
    if (body?.action !== "upgrade_business") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const result = await upgradeManagerAccountToBusiness(user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const { tier, billing } = await getManagerPurchaseSku(user.id);
    const alreadyBusiness = result.ok && "alreadyBusiness" in result && result.alreadyBusiness === true;
    return NextResponse.json({
      ok: true,
      alreadyBusiness,
      ...subscriptionJson(tier, billing),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
