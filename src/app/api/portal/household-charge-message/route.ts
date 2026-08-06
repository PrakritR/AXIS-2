import { NextResponse } from "next/server";

import { authorizeResidentRole } from "@/lib/auth/resident-role-access";
import { sendResidentChargeMessage } from "@/lib/resident-charge-message.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
  chargeId?: string;
  message?: string;
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
    const { data: profile } = await db
      .from("profiles")
      .select("role, email, full_name")
      .eq("id", user.id)
      .maybeSingle();
    const legacyRole = String(profile?.role ?? user.user_metadata?.role ?? "").trim().toLowerCase();
    if (!(await authorizeResidentRole(db, { userId: user.id, legacyRole }))) {
      return NextResponse.json({ error: "Residents only." }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const result = await sendResidentChargeMessage(db, {
      userId: user.id,
      userEmail: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
      residentName: String(profile?.full_name ?? "").trim() || "Resident",
      chargeId: String(body.chargeId ?? ""),
      message: String(body.message ?? ""),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, charge: result.charge });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not send message.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
