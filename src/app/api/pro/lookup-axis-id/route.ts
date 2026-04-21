import { NextResponse } from "next/server";
import { getManagerPurchaseSku } from "@/lib/manager-access";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function isPaidTier(tier: string | null, stripeSubscriptionId: string | null): boolean {
  const t = tier?.toLowerCase().trim() ?? "";
  if (t === "pro" || t === "business") return true;
  if (stripeSubscriptionId?.trim()) return true;
  return false;
}

/**
 * Resolve another account by Axis ID (`profiles.manager_id`) and confirm they have a paid subscription.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const axisId = searchParams.get("axisId")?.trim() ?? "";
    if (!axisId) {
      return NextResponse.json({ error: "axisId is required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, manager_id, role")
      .eq("manager_id", axisId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!profile?.id) {
      return NextResponse.json({ ok: false, error: "No account found with this Axis ID." }, { status: 404 });
    }

    const role = String(profile.role ?? "").toLowerCase();
    if (role !== "manager" && role !== "owner") {
      return NextResponse.json(
        { ok: false, error: "This account is not eligible for Axis Pro linking (must be a manager or owner workspace)." },
        { status: 400 },
      );
    }

    const sku = await getManagerPurchaseSku(profile.id);
    const paid = isPaidTier(sku.tier, sku.stripeSubscriptionId);
    if (!paid) {
      return NextResponse.json(
        { ok: false, error: "This account must be on a paid plan (Pro or Business) before you can link." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      userId: profile.id,
      axisId,
      displayName: profile.full_name?.trim() || profile.email || axisId,
      role,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
