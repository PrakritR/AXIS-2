import type { AuthRole } from "@/components/auth/portal-switcher";
import { MANAGER_PRICING_ENTRY_PATH } from "@/lib/auth/manager-pricing-entry-path";
import { normalizePostAuthPath } from "@/lib/auth/normalize-post-auth-path";
import { portalDashboardPath } from "@/lib/auth/portal-roles";
import {
  applyOAuthSurfaceToPath,
  defaultOAuthNextPath,
  resolvePostOAuthPathFromRoles,
  type OAuthSignInIntent,
  type OAuthSurface,
} from "@/lib/auth/post-oauth-routing";
import { completeResidentSignupFromOAuth } from "@/lib/auth/complete-resident-signup-oauth";
import { GET_STARTED_PATH } from "@/lib/auth/get-started-path";
import {
  findManagerPurchaseForAccount,
  isManagerOnboardingComplete,
  managerNeedsPricingSelection,
} from "@/lib/auth/manager-onboarding";
import { primaryRoleWhenAddingManager } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { managerOauthFinishPath } from "@/lib/auth/manager-oauth-finish-path";
import { isPrimaryAdminEmail } from "@/lib/auth/primary-admin";
import type { SupabaseClient, User } from "@supabase/supabase-js";

function isAuthRole(value: string): value is AuthRole {
  return value === "resident" || value === "manager" || value === "admin";
}

function isBypassOAuthGatePath(path: string): boolean {
  return (
    path.startsWith("/auth/manager-") ||
    path.startsWith("/auth/resident-") ||
    path.startsWith("/partner/pricing") ||
    path.startsWith(MANAGER_PRICING_ENTRY_PATH) ||
    path.startsWith("/auth/create-account") ||
    path.startsWith("/auth/callback/") ||
    path === "/auth/manager-register-oauth"
  );
}

function managerPortalDestination(safeIntended: string): string {
  if (
    safeIntended.startsWith("/auth/continue") ||
    safeIntended.startsWith("/resident/") ||
    safeIntended === "/partner/pricing" ||
    safeIntended.startsWith("/partner/pricing")
  ) {
    return portalDashboardPath("manager");
  }
  return safeIntended;
}

function applicationBucket(rowData: unknown): string {
  if (!rowData || typeof rowData !== "object" || Array.isArray(rowData)) return "";
  return String((rowData as Record<string, unknown>).bucket ?? "").toLowerCase();
}

/**
 * After Google OAuth, decide where the user may go.
 * Unknown accounts → free manager portal. Residents need an application. Managers use their tier.
 */
export async function resolveOAuthPortalRedirect(
  supabase: SupabaseClient,
  user: User,
  intendedPath: string,
  options?: {
    intent?: OAuthSignInIntent | null;
    surface?: OAuthSurface | null;
  },
): Promise<string> {
  const intent = options?.intent ?? null;
  const surface = options?.surface ?? null;
  const safeIntended = normalizePostAuthPath(
    intendedPath.startsWith("/") ? intendedPath : defaultOAuthNextPath(intent),
  );

  function finish(path: string): string {
    return applyOAuthSurfaceToPath(path, surface);
  }

  if (isBypassOAuthGatePath(safeIntended)) {
    return finish(safeIntended);
  }

  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return finish(MANAGER_PRICING_ENTRY_PATH);
  }

  const { data: roleRows } = await supabase.from("profile_roles").select("role").eq("user_id", user.id);
  const roles = [...new Set((roleRows ?? []).map((row) => row.role).filter((role): role is AuthRole => isAuthRole(role)))];

  // Multi-role users (e.g. admin+manager) always pick their portal explicitly — the chooser
  // must never be skipped by a single-role branch below.
  if (roles.length > 1) {
    return finish(resolvePostOAuthPathFromRoles(roles, safeIntended));
  }

  const soleRole = roles[0] ?? null;
  if (soleRole === "resident" || soleRole === "admin") {
    return finish(resolvePostOAuthPathFromRoles(roles, safeIntended));
  }
  if (soleRole === "manager") {
    if (await managerNeedsPricingSelection(supabase, user.id, email)) {
      return finish(MANAGER_PRICING_ENTRY_PATH);
    }
    return finish(managerPortalDestination(safeIntended));
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "manager" && (await managerNeedsPricingSelection(supabase, user.id, email))) {
    return finish(MANAGER_PRICING_ENTRY_PATH);
  }
  if (profile?.role === "manager") {
    return finish(managerPortalDestination(safeIntended));
  }
  if (profile?.role === "resident") {
    return finish(resolvePostOAuthPathFromRoles(["resident"], safeIntended));
  }
  if (profile?.role && isAuthRole(profile.role)) {
    return finish(resolvePostOAuthPathFromRoles([profile.role], safeIntended));
  }

  if (isPrimaryAdminEmail(email)) {
    return finish(safeIntended);
  }

  const linkedPurchase = await findManagerPurchaseForAccount(supabase, user.id, email);
  if (linkedPurchase && !isManagerOnboardingComplete(linkedPurchase)) {
    return finish(MANAGER_PRICING_ENTRY_PATH);
  }
  if (linkedPurchase && isManagerOnboardingComplete(linkedPurchase)) {
    const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email,
        role: primaryRoleWhenAddingManager(existingProfile?.role as string | undefined),
        manager_id: existingProfile?.manager_id?.trim() || linkedPurchase.manager_id,
        full_name: existingProfile?.full_name ?? linkedPurchase.full_name ?? null,
        application_approved: existingProfile?.application_approved ?? true,
      },
      { onConflict: "id" },
    );
    await ensureProfileRoleRow(supabase, user.id, "manager");
    if (safeIntended.startsWith("/auth/continue")) {
      return finish("/portal/dashboard");
    }
    return finish(safeIntended);
  }

  const { data: pendingPurchases } = await supabase
    .from("manager_purchases")
    .select("stripe_checkout_session_id, user_id, paid_at")
    .eq("email", email)
    .is("user_id", null)
    .order("paid_at", { ascending: false })
    .limit(1);

  const pendingPurchase = pendingPurchases?.[0];
  if (pendingPurchase?.stripe_checkout_session_id && pendingPurchase.paid_at) {
    return finish(managerOauthFinishPath(pendingPurchase.stripe_checkout_session_id));
  }

  // Link by rental application (approved OR pending). A pending applicant lands in the
  // resident portal in a limited state — never bounced back to create-account.
  const { data: applicationRows } = await supabase
    .from("manager_application_records")
    .select("id, resident_email, row_data")
    .eq("resident_email", email);

  const approvedApplication = (applicationRows ?? []).find((row) => applicationBucket(row.row_data) === "approved");
  const linkableApplication = approvedApplication ?? (applicationRows ?? [])[0];
  if (linkableApplication) {
    const linked = await completeResidentSignupFromOAuth(supabase, user.id, email, linkableApplication.id);
    if (linked.ok) {
      return finish("/resident/dashboard");
    }
    const params = new URLSearchParams({ role: "resident", message: "resident_signup_failed" });
    if (linked.error) params.set("error", linked.error);
    return finish(`/auth/create-account?${params.toString()}`);
  }

  // Unknown account: no role, no purchase, no application. Do NOT silently create a free
  // manager. Honor an explicit intent; otherwise send the user to the quick role chooser.
  if (intent === "manager") {
    return finish(MANAGER_PRICING_ENTRY_PATH);
  }
  if (intent === "resident") {
    return finish("/auth/create-account?role=resident&message=resident_signup_failed");
  }
  return finish(GET_STARTED_PATH);
}
