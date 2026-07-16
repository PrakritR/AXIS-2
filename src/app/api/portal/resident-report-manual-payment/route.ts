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

    const skippedStatus = (reason: string): { status: number; error: string } => {
      switch (reason) {
        case "not_found":
          return { status: 404, error: "One or more selected charges were not found." };
        case "already_paid":
          return { status: 409, error: "One or more selected charges are already paid." };
        case "forbidden":
          return { status: 403, error: "One or more selected charges belong to another resident." };
        default:
          return { status: 422, error: "One or more selected charges cannot be reported for this channel." };
      }
    };

    if (!result.ok) {
      const firstSkip = result.skipped?.[0];
      if (firstSkip) {
        const { status, error } = skippedStatus(firstSkip.reason);
        return NextResponse.json({ error, skipped: result.skipped }, { status });
      }
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

    // Explicit selections are all-or-error: a success toast must not cover a
    // charge that was silently skipped (already paid / missing / wrong channel).
    if (result.skipped.length > 0) {
      const { status, error } = skippedStatus(result.skipped[0]!.reason);
      return NextResponse.json(
        { error, charges: result.charges, skipped: result.skipped },
        { status },
      );
    }

    return NextResponse.json({ ok: true, charges: result.charges });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to report manual payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
