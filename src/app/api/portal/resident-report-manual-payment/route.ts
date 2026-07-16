import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { reportManualPaymentForResident } from "@/lib/resident-report-manual-payment.server";

export const runtime = "nodejs";

type Body = {
  chargeIds?: string[];
  channel?: "zelle" | "venmo";
};

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
    const result = await reportManualPaymentForResident({
      residentUserId: user.id,
      residentEmail: userEmail,
      channel,
      chargeIds: uniqueIds,
    });

    if (!result.ok) {
      const status =
        result.error === "no_payable_charges" || result.error === "no_charges_updated" ? 422 : 400;
      return NextResponse.json(
        {
          error:
            result.error === "no_payable_charges" || result.error === "no_charges_updated"
              ? "One or more selected charges cannot be reported for this channel."
              : result.error,
        },
        { status },
      );
    }

    return NextResponse.json({ ok: true, charges: result.charges });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to report manual payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
