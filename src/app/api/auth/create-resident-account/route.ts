import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { ACTIVE_PORTAL_COOKIE } from "@/lib/auth/portal-access";
import { primaryRoleWhenAddingResident } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Add the RESIDENT role to the already-signed-in account, additively.
 *
 * One person can hold manager / resident / vendor roles on a single login: a
 * manager (or vendor) who wants to rent a home creates a resident account here
 * WITHOUT a second email and WITHOUT losing their existing role. The write:
 *
 *  - takes the user id from the authenticated session only (never from the
 *    request body — there is no body), so it can only ever add a role to the
 *    caller's own account;
 *  - is additive and idempotent — it inserts the `resident` profile_roles row
 *    (composite PK makes a repeat a no-op) and never removes another role;
 *  - preserves the legacy `profiles.role` precedence via
 *    `primaryRoleWhenAddingResident` (a manager stays a manager), and only
 *    writes that column when it would actually change, so a manager's profile
 *    (including their `manager_id`) is left untouched;
 *  - flips the active-portal cookie to `resident` so the caller lands in the
 *    resident portal, from which they apply. The portal switcher moves them
 *    back to the manager side without signing out.
 */
export async function POST() {
  try {
    const serverClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const service = createSupabaseServiceRoleClient();

    const { data: existingProfile } = await service
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const nextPrimaryRole = primaryRoleWhenAddingResident(existingProfile?.role as string | undefined);
    if (!existingProfile) {
      // No profile row yet (rare for an authenticated user) — seed a minimal one.
      const { error } = await service
        .from("profiles")
        .insert({ id: user.id, email: user.email ?? null, role: nextPrimaryRole });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (nextPrimaryRole !== existingProfile.role) {
      // Only ever raise the legacy column to the higher role; never clobber
      // other profile fields (manager_id, phone, full_name…).
      const { error } = await service.from("profiles").update({ role: nextPrimaryRole }).eq("id", user.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    await ensureProfileRoleRow(service, user.id, "resident");

    track("resident_account_created", user.id, { source: "signed_in_apply" });

    const res = NextResponse.json({ ok: true, redirectTo: "/resident/applications/apply" });
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set(ACTIVE_PORTAL_COOKIE, "resident", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure,
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create resident account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
