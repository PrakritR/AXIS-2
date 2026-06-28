import { NextResponse } from "next/server";
import { getManagerScreeningSettings, updateManagerScreeningSettings } from "@/lib/screening/settings";
import type { ScreeningMode } from "@/lib/screening/types";
import { screeningConfigured, screeningCostCents } from "@/lib/screening/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function isMode(value: unknown): value is ScreeningMode {
  return value === "off" || value === "auto_on_submit" || value === "manual";
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const settings = await getManagerScreeningSettings(db, user.id);
    return NextResponse.json({
      settings,
      configured: screeningConfigured(),
      costCents: screeningCostCents(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load screening settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json()) as { mode?: unknown };
    if (!isMode(body.mode)) {
      return NextResponse.json({ error: "Invalid screening mode." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const settings = await updateManagerScreeningSettings(db, user.id, { mode: body.mode });
    return NextResponse.json({ settings, configured: screeningConfigured(), costCents: screeningCostCents() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save screening settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
