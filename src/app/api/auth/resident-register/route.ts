import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { provisionResidentAccountByEmail } from "@/lib/auth/provision-resident-account";
import { assertPasswordMatchesExistingAuthUser } from "@/lib/auth/verify-auth-password";
import { sendResidentApplyInviteEmail } from "@/lib/resident-apply-invite-email";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  email?: string;
  password?: string;
  fullName?: string;
};

/** Simple resident account — no Axis ID field; links application by email when present. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "resident", full_name: fullName || undefined },
    });

    let userId: string;
    let isNewUser = false;

    if (createErr) {
      const exists =
        createErr.message.toLowerCase().includes("already") ||
        createErr.message.toLowerCase().includes("registered");
      if (!exists) {
        return NextResponse.json({ error: createErr.message }, { status: 400 });
      }
      const existingId = await findAuthUserIdByEmail(supabase, email);
      if (!existingId) {
        return NextResponse.json({ error: "Could not locate existing account for this email." }, { status: 400 });
      }
      const pwCheck = await assertPasswordMatchesExistingAuthUser(email, password);
      if (!pwCheck.ok) {
        return NextResponse.json({ error: pwCheck.message }, { status: 401 });
      }
      userId = existingId;
    } else {
      if (!created?.user?.id) {
        return NextResponse.json({ error: "Could not create account." }, { status: 500 });
      }
      userId = created.user.id;
      isNewUser = true;
    }

    const provisioned = await provisionResidentAccountByEmail(supabase, {
      userId,
      email,
      fullName: fullName || null,
    });
    if (!provisioned.ok) {
      return NextResponse.json({ error: provisioned.error }, { status: provisioned.status });
    }

    if (isNewUser) {
      void sendResidentApplyInviteEmail({
        to: email,
        residentName: fullName || undefined,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      axisId: provisioned.axisId,
      linkedApplication: provisioned.linkedApplication,
      redirectTo: "/resident/applications/apply",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create resident account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
