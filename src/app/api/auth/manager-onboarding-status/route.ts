import { managerNeedsPricingSelection } from "@/lib/auth/manager-onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user?.id || !user.email) {
      return NextResponse.json({ needsPricing: false, authenticated: false });
    }

    const service = createSupabaseServiceRoleClient();
    const needsPricing = await managerNeedsPricingSelection(service, user.id, user.email);

    return NextResponse.json({ needsPricing, authenticated: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
