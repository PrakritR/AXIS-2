import { NextResponse } from "next/server";
import { backgroundCheckConfigured } from "@/lib/checkr/config";
import { checkrAddOnCatalog, checkrPackageCatalog } from "@/lib/checkr/packages";
import { managerScreeningAllowedForTier } from "@/lib/manager-access";
import { getManagerSubscriptionTier } from "@/lib/manager-access-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Package + add-on catalog for the manager screening picker (Checkr Tenant pricing). */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const tier = await getManagerSubscriptionTier(user.id);

    return NextResponse.json({
      configured: backgroundCheckConfigured(),
      screeningAllowed: managerScreeningAllowedForTier(tier),
      packages: checkrPackageCatalog(),
      addOns: checkrAddOnCatalog(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load screening packages.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
