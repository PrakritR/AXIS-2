import { NextResponse } from "next/server";

import {
  managerManualPaymentSettingsPublic,
  normalizeManagerManualPaymentSettings,
  saveManagerManualPaymentSettings,
} from "@/lib/manager-manual-payment-settings";
import { ensureManagerPaymentInbox } from "@/lib/payment-receipt-email/payment-inbox";
import { applyManagerManualPaymentsToListings, syncManagerManualPaymentsToPendingCharges } from "@/lib/manager-manual-payment-settings.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function requireManager() {
  const supabaseAuth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user?.id) return null;

  const db = createSupabaseServiceRoleClient();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    db.from("profile_roles").select("role").eq("user_id", user.id),
  ]);
  const roleList = (roles ?? []).map((r) => String(r.role).toLowerCase());
  const legacy = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  const isManager = roleList.includes("manager") || legacy === "manager" || legacy === "admin";
  if (!isManager) return null;
  return { db, userId: user.id };
}

export async function GET() {
  try {
    const ctx = await requireManager();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const inbox = await ensureManagerPaymentInbox(ctx.db, ctx.userId);
    return NextResponse.json({
      settings: managerManualPaymentSettingsPublic(inbox, {
        paymentInboxAddress: inbox.paymentInboxAddress,
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireManager();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const body = (await req.json()) as Record<string, unknown>;
    const { applyToAllListings, ...rest } = body;
    const saved = await saveManagerManualPaymentSettings(
      ctx.db,
      ctx.userId,
      normalizeManagerManualPaymentSettings(rest),
    );
    const inbox = await ensureManagerPaymentInbox(ctx.db, ctx.userId);
    const settings = { ...saved, paymentInboxToken: inbox.paymentInboxToken };
    let listingsUpdated = 0;
    let chargesUpdated = 0;
    const shouldSyncListings = applyToAllListings === true || body.syncListings === true;
    if (shouldSyncListings) {
      listingsUpdated = await applyManagerManualPaymentsToListings(ctx.db, ctx.userId, settings);
    }
    chargesUpdated = await syncManagerManualPaymentsToPendingCharges(ctx.db, ctx.userId, settings);
    return NextResponse.json({
      settings: managerManualPaymentSettingsPublic(settings, {
        paymentInboxAddress: inbox.paymentInboxAddress,
      }),
      listingsUpdated,
      chargesUpdated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
