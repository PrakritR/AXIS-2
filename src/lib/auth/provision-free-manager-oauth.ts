import { primaryRoleWhenAddingManager } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { isPrimaryAdminEmail } from "@/lib/auth/primary-admin";
import { generateManagerId } from "@/lib/manager-id";
import type { SupabaseClient, User } from "@supabase/supabase-js";

function oauthFullName(user: User): string | null {
  const meta = user.user_metadata ?? {};
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;
  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  return name || null;
}

/** Google OAuth identity or Gmail address (legacy signups). */
export function isGoogleOrGmailAccount(user: User): boolean {
  const email = user.email?.trim().toLowerCase() ?? "";
  if (email.endsWith("@gmail.com")) return true;
  if ((user.identities ?? []).some((i) => i.provider === "google")) return true;
  const provider = user.app_metadata?.provider;
  if (provider === "google") return true;
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes("google")) return true;
  return false;
}

async function hasManagerPortalAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: roleRow } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "manager")
    .maybeSingle();
  if (roleRow) return true;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return profile?.role === "manager" || profile?.role === "admin";
}

async function isResidentOnlyAccount(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: residentRole } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "resident")
    .maybeSingle();
  if (!residentRole) return false;
  return !(await hasManagerPortalAccess(supabase, userId));
}

/**
 * Creates or completes a free manager portal account for an OAuth user.
 * Idempotent — safe to call on every Google sign-in and during admin backfill.
 */
export async function provisionFreeManagerFromOAuth(
  supabase: SupabaseClient,
  user: User,
): Promise<{ provisioned: boolean; managerId?: string }> {
  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email) return { provisioned: false };

  if (isPrimaryAdminEmail(email)) return { provisioned: false };
  if (!isGoogleOrGmailAccount(user)) return { provisioned: false };
  if (await hasManagerPortalAccess(supabase, user.id)) return { provisioned: false };
  if (await isResidentOnlyAccount(supabase, user.id)) return { provisioned: false };

  const { data: pendingPurchases } = await supabase
    .from("manager_purchases")
    .select("id")
    .ilike("email", email)
    .is("user_id", null)
    .limit(1);
  if (pendingPurchases?.length) return { provisioned: false };

  const fullName = oauthFullName(user);
  const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  const { data: purchasesByEmail } = await supabase
    .from("manager_purchases")
    .select("id, manager_id, user_id, stripe_checkout_session_id, tier, billing")
    .ilike("email", email)
    .order("paid_at", { ascending: false });

  const unlinkedPurchase = (purchasesByEmail ?? []).find((p) => !p.user_id || p.user_id === user.id);
  let managerId =
    existingProfile?.manager_id?.trim() ||
    unlinkedPurchase?.manager_id?.trim() ||
    (purchasesByEmail ?? [])[0]?.manager_id?.trim() ||
    "";

  if (!managerId) managerId = generateManagerId();

  const { error: profileErr } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email,
      role: primaryRoleWhenAddingManager(existingProfile?.role as string | undefined),
      manager_id: managerId,
      full_name: fullName || existingProfile?.full_name?.trim() || null,
      application_approved: existingProfile?.application_approved ?? true,
    },
    { onConflict: "id" },
  );
  if (profileErr) throw profileErr;

  await ensureProfileRoleRow(supabase, user.id, "manager");

  if (unlinkedPurchase && !unlinkedPurchase.user_id) {
    await supabase.from("manager_purchases").update({ user_id: user.id }).eq("id", unlinkedPurchase.id);
  } else if (!unlinkedPurchase) {
    const sessionId = `oauth_free_${user.id}`;
    await supabase.from("manager_purchases").upsert(
      {
        stripe_checkout_session_id: sessionId,
        stripe_customer_id: null,
        email,
        manager_id: managerId,
        tier: "free",
        billing: "free",
        user_id: user.id,
        paid_at: new Date().toISOString(),
      },
      { onConflict: "stripe_checkout_session_id" },
    );
  }

  return { provisioned: true, managerId };
}

/** Backfill manager portal rows for Google/Gmail auth users missing from admin lists. */
export async function backfillOrphanGoogleOAuthManagers(
  supabase: SupabaseClient,
): Promise<{ scanned: number; provisioned: number }> {
  let scanned = 0;
  let provisioned = 0;
  let page = 1;
  const perPage = 200;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      scanned += 1;
      if (!isGoogleOrGmailAccount(user)) continue;
      const result = await provisionFreeManagerFromOAuth(supabase, user);
      if (result.provisioned) provisioned += 1;
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return { scanned, provisioned };
}
