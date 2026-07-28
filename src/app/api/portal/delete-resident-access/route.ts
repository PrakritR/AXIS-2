import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { deleteResidentAccount } from "@/lib/auth/delete-portal-account";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { managerCanAccessApplicationRecord } from "@/lib/auth/manager-application-access";
import { managerOwnsResident } from "@/lib/auth/resident-relationship";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function canManageResidentAccess(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "owner" || role === "pro";
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
        // Authorize deletion the SAME way the Applications list decides
        // visibility: not just the frozen `manager_user_id` stamp, but DIRECT
        // ownership / co-management of the application's property. An
        // "Incomplete" draft keeps a stale (or unattributed) stamp, so the owner
        // saw it in their list yet got "resident is not in your portfolio" on
        // Delete — the list and the guard disagreeing about the same row.
        // This is a destructive route (account deletion, optionally purged), so
        // a co-manager needs the "delete" level, matching
        // `assertCanDeleteApplicationRecords`; read-level visibility is not
        // enough to destroy.
        const { data: appRow } = await svc
          .from("manager_application_records")
          .select("manager_user_id, property_id, assigned_property_id")
          .eq("id", applicationId)
          .maybeSingle();
        if (appRow && (await managerCanAccessApplicationRecord(svc, user.id, appRow, { level: "delete" }))) {
          related = true;
        }
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
