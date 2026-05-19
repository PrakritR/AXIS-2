import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { removePortalAccess } from "@/lib/auth/remove-portal-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function canManageResidentAccess(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "owner" || role === "pro";
}

function hasProtectedRole(roles: string[]): boolean {
  return roles.some((role) => role === "admin" || role === "manager" || role === "owner" || role === "pro");
}

async function purgeResidentDataByEmail(input: {
  db: ReturnType<typeof createSupabaseServiceRoleClient>;
  email: string;
  applicationId?: string | null;
}) {
  const { db, email, applicationId } = input;

  const deleteOps = email ? [
    db.from("portal_household_charge_records").delete().eq("resident_email", email),
    db.from("portal_recurring_rent_profile_records").delete().eq("resident_email", email),
    db.from("portal_lease_pipeline_records").delete().eq("resident_email", email),
    db.from("portal_work_order_records").delete().eq("resident_email", email),
    db.from("portal_inbox_thread_records").delete().eq("participant_email", email),
    db.from("portal_outbound_mail_records").delete().eq("recipient_email", email),
    db.from("portal_resident_lease_upload_records").delete().eq("resident_email", email),
  ] : [];

  if (applicationId) {
    deleteOps.push(db.from("manager_application_records").delete().eq("id", applicationId));
    deleteOps.push(db.from("portal_household_charge_records").delete().filter("row_data->>applicationId", "eq", applicationId));
    deleteOps.push(db.from("portal_lease_pipeline_records").delete().filter("row_data->>axisId", "eq", applicationId));
  }
  if (email) {
    deleteOps.push(db.from("manager_application_records").delete().eq("resident_email", email));
  }

  const results = await Promise.all(deleteOps);
  const withError = results.find((result) => result.error);
  if (withError?.error) {
    throw new Error(withError.error.message);
  }
}

async function deleteResidentPortalLogin(db: ReturnType<typeof createSupabaseServiceRoleClient>, email: string) {
  const targetUserId = await findAuthUserIdByEmail(db, email);
  if (!targetUserId) {
    return { ok: true as const, mode: "no_auth_user" as const };
  }

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    db.from("profiles").select("id, role").eq("id", targetUserId).maybeSingle(),
    db.from("profile_roles").select("role").eq("user_id", targetUserId),
  ]);

  const normalizedRoles = (roleRows ?? [])
    .map((row) => String(row.role ?? "").toLowerCase())
    .filter(Boolean);
  const legacyRole = String(profile?.role ?? "").toLowerCase();
  if (legacyRole && !normalizedRoles.includes(legacyRole)) normalizedRoles.push(legacyRole);

  if (hasProtectedRole(normalizedRoles)) {
    return { ok: false as const, error: "Target user has non-resident portal roles and cannot be hard-deleted." };
  }

  await db.from("profile_roles").delete().eq("user_id", targetUserId);
  await db.from("profiles").delete().eq("id", targetUserId);

  const { error: authDeleteError } = await db.auth.admin.deleteUser(targetUserId);
  if (authDeleteError) {
    throw new Error(authDeleteError.message);
  }
  return { ok: true as const, mode: "deleted_auth_user" as const };
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
    const email = normalizeEmail(body?.email);
    const applicationId = typeof body?.applicationId === "string" ? body.applicationId.trim() : "";
    if (!email && !applicationId) {
      return NextResponse.json({ error: "Email or applicationId is required." }, { status: 400 });
    }
    const purgeData = body?.purgeData === true;

    const svc = createSupabaseServiceRoleClient();
    const { data: requestor } = await svc.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!requestor || !canManageResidentAccess(requestor.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (!purgeData) {
      const targetUserId = await findAuthUserIdByEmail(svc, email);
      if (!targetUserId) {
        return NextResponse.json({ ok: true, mode: "no_auth_user" });
      }

      const result = await removePortalAccess(svc, targetUserId, "resident");
      if (result.mode === "no_role") {
        return NextResponse.json({ ok: true, mode: "no_resident_role" });
      }
      return NextResponse.json({ ok: true, mode: result.mode });
    }

    await purgeResidentDataByEmail({
      db: svc,
      email,
      applicationId: applicationId || null,
    });

    const loginDeleteResult = await deleteResidentPortalLogin(svc, email);
    if (!loginDeleteResult.ok) {
      return NextResponse.json({ error: loginDeleteResult.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true, mode: "purged", loginMode: loginDeleteResult.mode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove resident access." },
      { status: 500 },
    );
  }
}
