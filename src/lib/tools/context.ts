/**
 * AgentContext is resolved server-side from the authenticated Supabase session.
 * `landlordId` is always the authenticated user's id — never taken from model or
 * client input — and every tool scopes its data access to it. This is the single
 * choke point that makes cross-landlord access structurally impossible.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { isAdminUser } from "@/lib/auth/admin-preview";

export type AgentContext = {
  /** Authenticated manager_user_id. The per-landlord scope key for every tool. */
  landlordId: string;
  userId: string;
  email: string;
  roles: string[];
  isAdmin: boolean;
  /**
   * Service-role client. It bypasses RLS, so every query built from it MUST
   * include an explicit `.eq("manager_user_id", ctx.landlordId)` (or equivalent
   * ownership filter). Never query it without a landlord scope.
   */
  db: ReturnType<typeof createSupabaseServiceRoleClient>;
};

/**
 * Returns the agent context for the current request, or null when the caller is
 * unauthenticated or is not a manager/owner (the agent is a manager surface).
 */
export async function resolveAgentContext(): Promise<AgentContext | null> {
  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createSupabaseServiceRoleClient();
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    db.from("profiles").select("email, role").eq("id", user.id).maybeSingle(),
    db.from("profile_roles").select("role").eq("user_id", user.id),
  ]);

  const isAdmin = await isAdminUser(user.id);
  const roleList = (roleRows ?? []).map((r) => String(r.role).toLowerCase());
  const legacyRole = String(profile?.role ?? "").toLowerCase();
  const roles = roleList.length > 0 ? roleList : legacyRole ? [legacyRole] : [];
  const isManagerOrOwner = roles.some((r) => r === "manager" || r === "owner");
  if (!isAdmin && !isManagerOrOwner) return null;

  return {
    landlordId: user.id,
    userId: user.id,
    email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
    roles,
    isAdmin,
    db,
  };
}
