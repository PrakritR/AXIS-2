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
  /** Present only on vendor-agent turns; pins every vendor tool to one job. */
  vendorScope?: VendorAgentScope;
  /** Present only on leasing SMS agent turns; pins links to the prospect phone. */
  leasingScope?: LeasingSmsAgentScope;
  /** Present only on resident-portal assistant turns; see {@link ResidentAgentScope}. */
  residentScope?: ResidentAgentScope;
  /** Present only on vendor-portal assistant turns; see {@link VendorPortalScope}. */
  vendorPortalScope?: VendorPortalScope;
};

/**
 * The signed-in resident a resident-portal assistant turn is pinned to.
 *
 * `residentUserId` / `residentEmail` come from the authenticated Supabase
 * session, never from model or client input. On a resident turn `landlordId` is
 * the resident's *linked manager* (needed because household charges, work
 * orders, and service requests are stored on manager-owned rows) — it is NOT an
 * ownership claim. Every resident tool MUST filter by the resident's own
 * identity in addition to `landlordId`, so one resident can never read another
 * resident of the same manager.
 */
export type ResidentAgentScope = {
  residentUserId: string;
  residentEmail: string;
  residentName: string;
  /** Manager the resident's approved residency belongs to; null when unlinked. */
  managerUserId: string | null;
  propertyId: string | null;
};

/**
 * The signed-in vendor a vendor-portal assistant turn is pinned to. Every vendor
 * tool filters by `vendor_user_id = vendorUserId` (the authenticated user id),
 * so cross-vendor access is structurally impossible.
 */
export type VendorPortalScope = {
  vendorUserId: string;
  email: string;
};

/** The single work-order conversation a vendor-agent turn is allowed to see. */
export type VendorAgentScope = {
  sessionId: string;
  vendorDirectoryId: string;
  vendorUserId: string | null;
  workOrderId: string;
};

/** Prospect texting a PropLane leasing line (per-manager Twilio or the shared Claw line). */
export type LeasingSmsAgentScope = {
  sessionId: string;
  prospectPhoneE164: string;
  workNumber: string | null;
  /**
   * True on the shared Claw line (`+12053690702`), where a single number fronts
   * EVERY manager. Listing tools then read the whole public catalog (any owner)
   * instead of only `ctx.landlordId`'s listings, so the agent can find and link
   * any live listing on PropLane — the same set the public `/rent` pages show.
   * False/undefined on a per-manager work number (scoped to that manager only).
   */
  crossCatalog?: boolean;
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

/**
 * Resolve the resident-portal assistant context from the authenticated session.
 * Returns null for an unauthenticated caller or a user with no resident role.
 *
 * The resident's identity (`residentUserId`, `residentEmail`) is taken from the
 * session; the linked manager is resolved from the resident's own approved
 * residency row. Neither ever comes from model or client input.
 */
export async function resolveResidentAgentContext(): Promise<AgentContext | null> {
  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createSupabaseServiceRoleClient();
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    db.from("profiles").select("email, role, full_name").eq("id", user.id).maybeSingle(),
    db.from("profile_roles").select("role").eq("user_id", user.id),
  ]);

  const roleList = (roleRows ?? []).map((r) => String(r.role).toLowerCase());
  const legacyRole = String(profile?.role ?? "").toLowerCase();
  const roles = roleList.length > 0 ? roleList : legacyRole ? [legacyRole] : [];
  const isAdmin = await isAdminUser(user.id);
  // Admins get the resident surface for support access; everyone else needs the
  // resident role. A manager visiting /resident without a resident role is not
  // a resident and must not receive resident-scoped tools.
  if (!isAdmin && !roles.includes("resident")) return null;

  const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
  const scope = await resolveResidentScope(db, user.id, email, String(profile?.full_name ?? ""));

  return {
    // On a resident turn this is the resident's LINKED MANAGER, not an ownership
    // claim — every resident tool additionally filters by residentScope.
    landlordId: scope.managerUserId ?? "",
    userId: user.id,
    email,
    roles,
    isAdmin,
    db,
    residentScope: scope,
  };
}

/**
 * Find the manager + property a signed-in resident belongs to, preferring an
 * approved residency. Looked up by the resident's own user id first, then their
 * verified session email — never by a client-supplied manager id.
 */
async function resolveResidentScope(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  residentUserId: string,
  residentEmail: string,
  fullName: string,
): Promise<ResidentAgentScope> {
  const base: ResidentAgentScope = {
    residentUserId,
    residentEmail,
    residentName: fullName.trim() || "Resident",
    managerUserId: null,
    propertyId: null,
  };
  if (!residentEmail) return base;

  const { data } = await db
    .from("manager_application_records")
    .select("manager_user_id, property_id, assigned_property_id, row_data, updated_at")
    .eq("resident_email", residentEmail)
    .order("updated_at", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as {
    manager_user_id?: string | null;
    property_id?: string | null;
    assigned_property_id?: string | null;
    row_data?: Record<string, unknown> | null;
  }[];
  // An approved residency wins over a still-pending application, so a resident
  // who also applied elsewhere is scoped to where they actually live.
  const approved = rows.find((r) => String(r.row_data?.bucket ?? "") === "approved");
  const chosen = approved ?? rows[0];
  if (!chosen) return base;

  const name = String(chosen.row_data?.name ?? "").trim();
  return {
    ...base,
    residentName: base.residentName !== "Resident" ? base.residentName : name || "Resident",
    managerUserId: String(chosen.manager_user_id ?? "").trim() || null,
    propertyId:
      String(chosen.assigned_property_id ?? "").trim() ||
      String(chosen.property_id ?? "").trim() ||
      null,
  };
}

/**
 * Resolve the vendor-portal assistant context from the authenticated session.
 * Returns null unless the caller holds the vendor role. `vendorUserId` is the
 * session user id — every vendor tool filters by it, so a vendor can only ever
 * reach their own jobs, invoices, and payouts.
 */
export async function resolveVendorAgentContext(): Promise<AgentContext | null> {
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

  const roleList = (roleRows ?? []).map((r) => String(r.role).toLowerCase());
  const legacyRole = String(profile?.role ?? "").toLowerCase();
  const roles = roleList.length > 0 ? roleList : legacyRole ? [legacyRole] : [];
  const isAdmin = await isAdminUser(user.id);
  if (!isAdmin && !roles.includes("vendor")) return null;

  const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
  return {
    // A vendor has no landlord scope of their own; vendor tools never read a
    // manager-scoped table by landlordId. Left empty on purpose so a tool that
    // forgot its vendor filter returns nothing instead of someone's portfolio.
    landlordId: "",
    userId: user.id,
    email,
    roles,
    isAdmin,
    db,
    vendorPortalScope: { vendorUserId: user.id, email },
  };
}

/**
 * Context for a vendor-agent turn. There is NO authenticated user on an
 * inbound-SMS webhook, so this is constructed ONLY from an agent_sessions row
 * our own dispatch code created — landlordId and the scope never come from
 * client or model input. resolveAgentContext stays vendor-rejecting on purpose.
 */
export function buildVendorAgentContext(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  args: { landlordId: string; scope: VendorAgentScope },
): AgentContext {
  return {
    landlordId: args.landlordId,
    userId: args.scope.vendorUserId ?? args.landlordId,
    email: "",
    roles: ["vendor_agent"],
    isAdmin: false,
    db,
    vendorScope: args.scope,
  };
}

/**
 * Context for a leasing-SMS agent turn. Built ONLY from a work-number inbound
 * webhook we already authenticated — landlordId and prospect phone never come
 * from model or client input.
 */
export function buildLeasingSmsAgentContext(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  args: { landlordId: string; scope: LeasingSmsAgentScope },
): AgentContext {
  return {
    landlordId: args.landlordId,
    userId: args.landlordId,
    email: "",
    roles: ["leasing_sms_agent"],
    isAdmin: false,
    db,
    leasingScope: args.scope,
  };
}
