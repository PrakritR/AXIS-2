import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { deleteResidentAccount } from "@/lib/auth/delete-portal-account";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { managerOwnsResident } from "@/lib/auth/resident-relationship";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function canManageResidentAccess(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "pro";
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      email?: unknown;
      purgeData?: unknown;
      applicationId?: unknown;
    } | null;
    const emailInput = normalizeEmail(body?.email);
    const applicationId = typeof body?.applicationId === "string" ? body.applicationId.trim() : "";
    if (!emailInput && !applicationId) {
      return NextResponse.json({ error: "Email or applicationId is required." }, { status: 400 });
    }
    const purgeData = body?.purgeData === true;

    const svc = createSupabaseServiceRoleClient();
    let email = emailInput;
    if (!email && applicationId) {
      const { data: appRow } = await svc
        .from("manager_application_records")
        .select("resident_email")
        .eq("id", applicationId)
        .maybeSingle();
      email = normalizeEmail(appRow?.resident_email);
    }
    const { data: requestor } = await svc.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!requestor || !canManageResidentAccess(requestor.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const isAdmin = String(requestor.role ?? "").toLowerCase() === "admin" || (await isAdminUser(user.id));
    if (!isAdmin) {
      let related = email ? await managerOwnsResident(svc, user.id, { email }) : false;
      if (!related && applicationId) {
        const { data: appRow } = await svc
          .from("manager_application_records")
          .select("manager_user_id")
          .eq("id", applicationId)
          .maybeSingle();
        if (appRow && appRow.manager_user_id === user.id) related = true;
      }
      if (!related) {
        return NextResponse.json(
          { error: "Forbidden: resident is not in your portfolio." },
          { status: 403 },
        );
      }
    }

    const targetUserId = email ? await findAuthUserIdByEmail(svc, email) : null;
    const result = await deleteResidentAccount(svc, {
      userId: targetUserId ?? undefined,
      email,
      applicationId,
      purgeData,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    if (result.mode === "purged") {
      return NextResponse.json({ ok: true, mode: "purged", loginMode: result.loginMode });
    }

    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove resident access." },
      { status: 500 },
    );
  }
}
