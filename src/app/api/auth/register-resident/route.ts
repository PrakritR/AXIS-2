import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { primaryRoleWhenAddingResident } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { assertPasswordMatchesExistingAuthUser } from "@/lib/auth/verify-auth-password";
import { generateAxisId } from "@/lib/manager-id";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
  email: string;
  password: string;
  axisId?: string;
};

function axisIdVariants(axisId: string): string[] {
  const trimmed = axisId.trim();
  const normalized = normalizeApplicationAxisId(trimmed);
  return [...new Set([trimmed, normalized].filter(Boolean))];
}

export async function POST(req: Request) {
  try {
    const { email, password, axisId } = (await req.json()) as Body;
    const normalEmail = email?.trim().toLowerCase();
    const normalAxisId = axisId?.trim();

    if (!normalEmail || !normalAxisId) {
      return NextResponse.json({ error: "Email and Axis ID are required." }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data: applicationRows, error: applicationError } = await supabase
      .from("manager_application_records")
      .select("id, resident_email")
      .in("id", axisIdVariants(normalAxisId));

    if (applicationError) {
      return NextResponse.json({ error: applicationError.message }, { status: 500 });
    }

    const matchingApplication = (applicationRows ?? []).find((row) => {
      const rowEmail = row.resident_email?.trim().toLowerCase() ?? "";
      return rowEmail === normalEmail;
    });

    if (!matchingApplication) {
      const hasDifferentEmailMatch = (applicationRows ?? []).length > 0;
      return NextResponse.json(
        {
          error: hasDifferentEmailMatch
            ? "This application ID belongs to a different email address. Use the same email from the rental application."
            : "Application ID not found. Check the ID and try again.",
        },
        { status: 403 },
      );
    }

    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email: normalEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: "resident",
        axis_id: normalAxisId,
      },
    });

    let userId: string;
    let reusedExistingAuthUser = false;

    if (cErr) {
      const isAlreadyExists =
        cErr.message.toLowerCase().includes("already") ||
        cErr.message.toLowerCase().includes("registered");
      if (!isAlreadyExists) {
        return NextResponse.json({ error: cErr.message }, { status: 400 });
      }
      const existingId = await findAuthUserIdByEmail(supabase, normalEmail);
      if (!existingId) {
        return NextResponse.json({ error: "Could not locate existing account for this email." }, { status: 400 });
      }
      await supabase.auth.admin.updateUserById(existingId, { email_confirm: true });
      const pwCheck = await assertPasswordMatchesExistingAuthUser(normalEmail, password);
      if (!pwCheck.ok) {
        return NextResponse.json({ error: pwCheck.message }, { status: 401 });
      }
      userId = existingId;
      reusedExistingAuthUser = true;
    } else {
      if (!created?.user) {
        return NextResponse.json({ error: "Could not create user." }, { status: 400 });
      }
      userId = created.user.id;
    }

    const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    const profileAxisId = existingProfile?.manager_id?.trim() || normalAxisId || generateAxisId();

    const { error: upErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: normalEmail,
        role: primaryRoleWhenAddingResident(existingProfile?.role as string | undefined),
        full_name: existingProfile?.full_name ?? null,
        manager_id: profileAxisId,
        application_approved: existingProfile?.application_approved ?? false,
      },
      { onConflict: "id" },
    );
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    await ensureProfileRoleRow(supabase, userId, "resident");

    return NextResponse.json({ ok: true, reusedExistingAuthUser, axisId: profileAxisId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
