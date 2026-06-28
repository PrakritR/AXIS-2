import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { provisionPendingManagerAccount } from "@/lib/auth/manager-onboarding";
import { assertPasswordMatchesExistingAuthUser } from "@/lib/auth/verify-auth-password";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  email?: string;
  password?: string;
  fullName?: string;
};

/**
 * Creates a new manager account (pending tier selection) for email/password signup.
 * User must pick Free / Pro / Business on /partner/pricing before portal access.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!fullName) {
      return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "manager", full_name: fullName },
    });

    let userId: string;

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
    }

    const { managerId } = await provisionPendingManagerAccount(supabase, {
      userId,
      email,
      fullName,
    });

    return NextResponse.json({ ok: true, managerId, redirectTo: "/partner/pricing" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create manager account.";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
