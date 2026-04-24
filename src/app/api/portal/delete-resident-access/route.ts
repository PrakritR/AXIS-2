import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function canManageResidentAccess(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "owner" || role === "pro";
}

function nextPrimaryRole(roles: string[]): string | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("owner")) return "owner";
  if (roles.includes("manager")) return "manager";
  if (roles.includes("pro")) return "pro";
  return roles[0] ?? null;
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

    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = normalizeEmail(body?.email);
    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const svc = createSupabaseServiceRoleClient();
    const { data: requestor } = await svc.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!requestor || !canManageResidentAccess(requestor.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const targetUserId = await findAuthUserIdByEmail(svc, email);
    if (!targetUserId) {
      return NextResponse.json({ ok: true, mode: "no_auth_user" });
    }

    const { data: rolesRows, error: rolesErr } = await svc.from("profile_roles").select("role").eq("user_id", targetUserId);
    if (rolesErr) {
      return NextResponse.json({ error: rolesErr.message }, { status: 400 });
    }

    const currentRoles = (rolesRows ?? []).map((row) => String(row.role ?? "").toLowerCase()).filter(Boolean);
    if (!currentRoles.includes("resident")) {
      return NextResponse.json({ ok: true, mode: "no_resident_role" });
    }

    const remainingRoles = currentRoles.filter((role) => role !== "resident");

    if (remainingRoles.length === 0) {
      const { error: deleteErr } = await svc.auth.admin.deleteUser(targetUserId);
      if (deleteErr) {
        return NextResponse.json({ error: deleteErr.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, mode: "deleted_auth_user" });
    }

    const { error: removeRoleErr } = await svc.from("profile_roles").delete().eq("user_id", targetUserId).eq("role", "resident");
    if (removeRoleErr) {
      return NextResponse.json({ error: removeRoleErr.message }, { status: 400 });
    }

    const nextRole = nextPrimaryRole(remainingRoles);
    const { error: updateErr } = await svc
      .from("profiles")
      .update({
        role: nextRole,
        application_approved: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, mode: "revoked_resident_role" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove resident access." },
      { status: 500 },
    );
  }
}
