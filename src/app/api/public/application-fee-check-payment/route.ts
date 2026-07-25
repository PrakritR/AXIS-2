import { NextResponse } from "next/server";

import { checkApplicationFeeManualPayment } from "@/lib/resident-check-manual-payment.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
  propertyId?: string;
  residentEmail?: string;
  channel?: "zelle" | "venmo" | "other";
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const residentEmail = typeof body.residentEmail === "string" ? body.residentEmail.trim() : "";
    const channel = body.channel;
    if (channel !== "zelle" && channel !== "venmo" && channel !== "other") {
      return NextResponse.json({ error: "channel must be zelle, venmo, or other." }, { status: 400 });
    }

    let residentUserId: string | null = null;
    try {
      const auth = await createSupabaseServerClient();
      const {
        data: { user },
      } = await auth.auth.getUser();
      residentUserId = user?.id ?? null;
      if (user?.email && residentEmail && user.email.trim().toLowerCase() !== residentEmail.toLowerCase()) {
        return NextResponse.json({ error: "Email does not match your signed-in account." }, { status: 403 });
      }
    } catch {
      residentUserId = null;
    }

    const db = createSupabaseServiceRoleClient();
    const result = await checkApplicationFeeManualPayment(db, {
      propertyId,
      residentEmail,
      residentUserId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (!result.paid) {
      return NextResponse.json({ paid: false, message: result.message });
    }

    return NextResponse.json({ paid: true, charges: result.charges });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to check payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
