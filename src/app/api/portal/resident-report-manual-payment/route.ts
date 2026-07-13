import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { HouseholdCharge } from "@/lib/household-charges";
import { canPayHouseholdChargeWithManualChannel } from "@/lib/platform/resident-payments";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";

export const runtime = "nodejs";

type Body = {
  chargeIds?: string[];
  channel?: "zelle" | "venmo";
};

function chargeOwnedByUser(charge: HouseholdCharge, userId: string, email: string): boolean {
  const e = email.trim().toLowerCase();
  if (charge.residentUserId && charge.residentUserId === userId) return true;
  return Boolean(e && charge.residentEmail.trim().toLowerCase() === e);
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("role, email").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? user.user_metadata?.role ?? "").trim().toLowerCase();
    if (role !== "resident") {
      return NextResponse.json({ error: "Residents only." }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const channel = body.channel === "venmo" ? "venmo" : body.channel === "zelle" ? "zelle" : null;
    if (!channel) {
      return NextResponse.json({ error: "channel must be zelle or venmo." }, { status: 400 });
    }

    const requestedIds = (Array.isArray(body.chargeIds) ? body.chargeIds : [])
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean);
    const uniqueIds = [...new Set(requestedIds)];
    if (uniqueIds.length === 0) {
      return NextResponse.json({ error: "chargeIds is required." }, { status: 400 });
    }

    const userEmail = (profile?.email ?? user.email ?? "").trim().toLowerCase();
    const now = new Date().toISOString();
    const updated: HouseholdCharge[] = [];
    const managerIds = new Set<string>();

    for (const id of uniqueIds) {
      const { data: row, error: rowErr } = await db
        .from("portal_household_charge_records")
        .select("id, row_data, status, manager_user_id")
        .eq("id", id)
        .maybeSingle();

      if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
      if (!row) return NextResponse.json({ error: `Charge not found: ${id}` }, { status: 404 });

      const charge = row.row_data as HouseholdCharge | null;
      if (!charge?.id) return NextResponse.json({ error: "Invalid charge record." }, { status: 500 });
      if (row.status === "paid" || charge.status === "paid") {
        return NextResponse.json({ error: "One or more selected charges are already paid." }, { status: 409 });
      }
      if (!chargeOwnedByUser(charge, user.id, userEmail)) {
        return NextResponse.json({ error: "You do not have access to one of the selected charges." }, { status: 403 });
      }
      if (!canPayHouseholdChargeWithManualChannel(charge, channel)) {
        return NextResponse.json(
          { error: `One or more charges cannot be paid with ${channel === "venmo" ? "Venmo" : "Zelle"}.` },
          { status: 422 },
        );
      }

      const managerUserId = (row.manager_user_id as string | null)?.trim() || charge.managerUserId?.trim() || "";
      if (managerUserId) managerIds.add(managerUserId);

      const patched: HouseholdCharge = {
        ...charge,
        manualPaymentChannel: channel,
        manualPaymentReportedAt: now,
      };
      updated.push(patched);

      const { error: upsertErr } = await db.from("portal_household_charge_records").upsert(
        {
          id,
          manager_user_id: managerUserId || null,
          resident_user_id: charge.residentUserId,
          resident_email: charge.residentEmail.trim().toLowerCase(),
          property_id: charge.propertyId,
          kind: charge.kind,
          status: charge.status,
          row_data: patched,
          updated_at: now,
        },
        { onConflict: "id" },
      );
      if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    const channelLabel = channel === "venmo" ? "Venmo" : "Zelle";
    const senderEmail = userEmail || "resident@axis.local";
    for (const managerUserId of managerIds) {
      await deliverPortalInboxMessage(db, {
        senderUserId: user.id,
        senderEmail,
        fromName: "Resident payment",
        subject: `${channelLabel} payment reported`,
        text: `A resident reported sending ${updated.length === 1 ? "a payment" : `${updated.length} payments`} via ${channelLabel}. Please verify and mark the charge${updated.length === 1 ? "" : "s"} paid when received.`,
        toUserIds: [managerUserId],
        eventCategory: "payments",
      }).catch(() => undefined);
    }

    track("manual_payment_reported", user.id, { channel, charge_count: updated.length });
    return NextResponse.json({ ok: true, charges: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to report manual payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
