import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  emptyPayoutSplitsConfig,
  normalizePayoutSplitsConfig,
  validatePayoutSplitsConfig,
  type PayoutSplitsConfig,
} from "@/lib/manager-payout-splits";
import { platformFeeDisplayPercents } from "@/lib/platform-fees";
import { getManagerPurchaseSku } from "@/lib/manager-access";

export const runtime = "nodejs";

const MAX_NOTES = 8000;

function looksLikeMissingColumn(err: { message?: string }) {
  const m = (err.message ?? "").toLowerCase();
  return m.includes("payout_splits_config") && (m.includes("column") || m.includes("schema"));
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

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("payout_splits_config")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      if (looksLikeMissingColumn(error)) {
        return NextResponse.json({
          config: emptyPayoutSplitsConfig(),
          platformFees: platformFeeDisplayPercents(),
          migrationRequired: true,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const config = normalizePayoutSplitsConfig(profile?.payout_splits_config);
    const { tier } = await getManagerPurchaseSku(user.id);

    return NextResponse.json({
      config,
      tier: tier ?? "free",
      platformFees: platformFeeDisplayPercents(tier),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { config?: unknown } | null;
    const raw = body?.config;
    const normalized = normalizePayoutSplitsConfig(raw ?? emptyPayoutSplitsConfig());

    if (normalized.notes.length > MAX_NOTES) {
      return NextResponse.json({ error: `Notes must be at most ${MAX_NOTES} characters.` }, { status: 400 });
    }

    const v = validatePayoutSplitsConfig(normalized as PayoutSplitsConfig);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({ payout_splits_config: normalized, updated_at: updatedAt })
      .eq("id", user.id);

    if (error) {
      if (looksLikeMissingColumn(error)) {
        return NextResponse.json(
          {
            error:
              "Database is missing payout_splits_config. Apply the migration supabase/migrations/20260421200000_profiles_payout_splits_config.sql.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      config: normalized,
      platformFees: platformFeeDisplayPercents((await getManagerPurchaseSku(user.id)).tier),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
