import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { provisionVendorAccountByEmail } from "@/lib/auth/provision-vendor-account";
import { assertPasswordMatchesExistingAuthUser } from "@/lib/auth/verify-auth-password";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  email?: string;
  password?: string;
  fullName?: string;
};

/** Vendor signup from an invite link — links to the inviting manager by email. */
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
      user_metadata: { role: "vendor", full_name: fullName || undefined },
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

    const provisioned = await provisionVendorAccountByEmail(supabase, {
      userId,
      email,
      fullName: fullName || null,
    });
    if (!provisioned.ok) {
      return NextResponse.json({ error: provisioned.error }, { status: provisioned.status });
    }

    return NextResponse.json({
      ok: true,
      axisId: provisioned.axisId,
      linkedManagerId: provisioned.linkedManagerId,
      redirectTo: "/vendor/dashboard",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create vendor account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
