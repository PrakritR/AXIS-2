import { NextResponse } from "next/server";
import { getManagerPurchaseSku, isBusinessSkuTier, isProSkuTier, PRO_MAX_PROPERTIES } from "@/lib/manager-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
    const t = tier?.toLowerCase() ?? null;

    return NextResponse.json({
      tier: t,
      billing,
      isPro: isProSkuTier(t),
      isBusiness: isBusinessSkuTier(t),
      isFree: t === "free",
      /** No purchase row — legacy / unknown; not treated as Pro-capped. */
      isLegacyUnlimited: t === null,
      proPropertyLimit: PRO_MAX_PROPERTIES,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
