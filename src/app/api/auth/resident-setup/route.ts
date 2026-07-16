import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import {
  consumeResidentSetupTokenOnApplication,
  findApplicationForResidentSetup,
} from "@/lib/auth/resident-setup-token";
import { provisionResidentAccountByEmail } from "@/lib/auth/provision-resident-account";
import { assertPasswordMatchesExistingAuthUser } from "@/lib/auth/verify-auth-password";
import { canSendResidentOutboundSms, sendResidentOutboundSms } from "@/lib/resident-outbound-sms.server";
import { defaultResidentOnboardingSmsLinks } from "@/lib/claw-resident-links";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
  email?: string;
  password?: string;
  fullName?: string;
  token?: string;
  axisId?: string;
};

/** Validate a resident setup link (token + axis id). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim() ?? "";
    const axisId = url.searchParams.get("axis_id")?.trim() ?? "";
    const db = createSupabaseServiceRoleClient();
    const lookup = await findApplicationForResidentSetup(db, { token, axisId });
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }
    return NextResponse.json({
      ok: true,
      axisId: lookup.axisId,
      email: lookup.email,
      name: lookup.name,
      propertyId: lookup.propertyId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not validate setup link." },
      { status: 500 },
    );
  }
}

/**
 * Create or link a resident account using a one-time setup token from the application email.
 * Generic resident signup without a token is rejected.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const axisId = typeof body.axisId === "string" ? body.axisId.trim() : "";

    if (!token || !axisId) {
      return NextResponse.json(
        { error: "Resident accounts are created from the setup link in your application email." },
        { status: 403 },
      );
    }
    if (!email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const lookup = await findApplicationForResidentSetup(supabase, { token, axisId });
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }
    if (lookup.email !== email) {
      return NextResponse.json(
        { error: "Use the same email address from your rental application." },
        { status: 403 },
      );
    }

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "resident",
        full_name: fullName || lookup.name || undefined,
        axis_id: lookup.axisId,
      },
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

    const provisioned = await provisionResidentAccountByEmail(supabase, {
      userId,
      email,
      fullName: fullName || lookup.name,
    });
    if (!provisioned.ok) {
      return NextResponse.json({ error: provisioned.error }, { status: provisioned.status });
    }

    await supabase.from("profiles").update({ manager_id: lookup.axisId }).eq("id", userId);
    await consumeResidentSetupTokenOnApplication(supabase, lookup.row);

    // Text welcome from the shared Claw/PropLane line when we have a phone on file.
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, full_name")
        .eq("id", userId)
        .maybeSingle();
      const phone = String(profile?.phone ?? "").trim();
      if (phone && canSendResidentOutboundSms()) {
        const name =
          String(profile?.full_name ?? "").trim() ||
          fullName ||
          lookup.name ||
          "Resident";
        const smsBody = [
          `Welcome to PropLane, ${name}! Your resident account is ready.`,
          `PropLane ID: ${lookup.axisId}`,
          ...defaultResidentOnboardingSmsLinks(),
          `We'll text this number for lease signing and payment reminders — reply STOP anytime to opt out.`,
        ].join("\n");
        await sendResidentOutboundSms({ to: phone, text: smsBody, linkKind: null });
      }
    } catch {
      /* non-critical */
    }

    const propertyId = lookup.propertyId;
    const redirectTo = propertyId
      ? `/resident/applications?axis_id=${encodeURIComponent(lookup.axisId)}`
      : "/resident/applications";

    return NextResponse.json({
      ok: true,
      axisId: lookup.axisId,
      linkedApplication: true,
      redirectTo,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create resident account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
