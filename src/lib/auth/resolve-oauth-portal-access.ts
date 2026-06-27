import { completeResidentSignupFromOAuth } from "@/lib/auth/complete-resident-signup-oauth";
import {
  findManagerPurchaseForAccount,
  isManagerOnboardingComplete,
  managerNeedsPricingSelection,
} from "@/lib/auth/manager-onboarding";
import { managerOauthFinishPath } from "@/lib/auth/manager-oauth-finish-path";
import { isPrimaryAdminEmail } from "@/lib/auth/primary-admin";
import type { AuthRole } from "@/components/auth/portal-switcher";
import type { SupabaseClient, User } from "@supabase/supabase-js";

function isAuthRole(value: string): value is AuthRole {
  return value === "resident" || value === "manager" || value === "admin";
}

function isBypassOAuthGatePath(path: string): boolean {
  return (
    path.startsWith("/auth/manager-") ||
    path.startsWith("/auth/resident-") ||
    path.startsWith("/partner/pricing") ||
    path.startsWith("/auth/create-account") ||
    path.startsWith("/auth/callback/") ||
    path === "/auth/manager-register-oauth"
  );
}

function applicationBucket(rowData: unknown): string {
  if (!rowData || typeof rowData !== "object" || Array.isArray(rowData)) return "";
  return String((rowData as Record<string, unknown>).bucket ?? "").toLowerCase();
}

/**
 * After Google OAuth, decide where the user may go.
 * Unknown accounts → partner pricing. Residents need an application. Managers need payment.
 */
export async function resolveOAuthPortalRedirect(
  supabase: SupabaseClient,
  user: User,
  intendedPath: string,
): Promise<string> {
  const safeIntended = intendedPath.startsWith("/") ? intendedPath : "/auth/continue";

  if (isBypassOAuthGatePath(safeIntended)) {
    return safeIntended;
  }

  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return "/partner/pricing";
  }

  const { data: roleRows } = await supabase.from("profile_roles").select("role").eq("user_id", user.id);
  const roles = (roleRows ?? []).map((row) => row.role).filter((role): role is AuthRole => isAuthRole(role));

  const isManagerAccount = roles.includes("manager");
  if (isManagerAccount && (await managerNeedsPricingSelection(supabase, user.id, email))) {
    return "/partner/pricing";
  }

  if (roles.length > 0) {
    return safeIntended;
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "manager" && (await managerNeedsPricingSelection(supabase, user.id, email))) {
    return "/partner/pricing";
  }
  if (profile?.role && isAuthRole(profile.role)) {
    return safeIntended;
  }

  if (isPrimaryAdminEmail(email)) {
    return safeIntended;
  }

  const linkedPurchase = await findManagerPurchaseForAccount(supabase, user.id, email);
  if (linkedPurchase && isManagerOnboardingComplete(linkedPurchase)) {
    return safeIntended;
  }
  if (linkedPurchase && !isManagerOnboardingComplete(linkedPurchase)) {
    if (safeIntended.startsWith("/auth/continue") || !isBypassOAuthGatePath(safeIntended)) {
      return "/partner/pricing";
    }
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
    return managerOauthFinishPath(pendingPurchase.stripe_checkout_session_id);
  }

  const { data: applicationRows } = await supabase
    .from("manager_application_records")
    .select("id, resident_email, row_data")
    .eq("resident_email", email);

  const approvedApplication = (applicationRows ?? []).find((row) => applicationBucket(row.row_data) === "approved");
  if (approvedApplication) {
    const linked = await completeResidentSignupFromOAuth(supabase, user.id, email, approvedApplication.id);
    if (linked.ok) {
      return "/resident/dashboard";
    }
    const params = new URLSearchParams({
      role: "resident",
      message: "resident_signup_failed",
    });
    if (linked.error) params.set("error", linked.error);
    return `/auth/create-account?${params.toString()}`;
  }

  const hasUnapprovedApplication = (applicationRows ?? []).some((row) => applicationBucket(row.row_data) !== "approved");
  if (hasUnapprovedApplication) {
    return "/auth/create-account?role=resident&message=application_pending";
  }

  return "/partner/pricing";
}
