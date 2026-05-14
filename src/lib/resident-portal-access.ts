import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ManagerSubscriptionTier = "free" | "paid" | null;

export type ResidentPortalAccessState = {
  roleOk: boolean;
  applicationApproved: boolean;
  applicationId: string | null;
  applicationStage: string | null;
  applicationProperty: string | null;
  leaseAccessUnlocked: boolean;
  fullPortalAccess: boolean;
  managerSubscriptionTier: ManagerSubscriptionTier;
};

function emptyAccessState(managerSubscriptionTier: ManagerSubscriptionTier): ResidentPortalAccessState {
  return {
    roleOk: false,
    applicationApproved: false,
    applicationId: null,
    applicationStage: null,
    applicationProperty: null,
    leaseAccessUnlocked: false,
    fullPortalAccess: false,
    managerSubscriptionTier,
  };
}

function normalizeEmail(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readLatestApplication(
  records: Array<{ row_data: unknown; updated_at?: string | null }>,
  email: string,
): {
  id: string | null;
  bucket: string | null;
  stage: string | null;
  property: string | null;
} {
  const matching = records
    .map((record) => {
      const row = record.row_data && typeof record.row_data === "object" && !Array.isArray(record.row_data)
        ? (record.row_data as Record<string, unknown>)
        : null;
      const residentEmail = normalizeEmail(typeof row?.email === "string" ? row.email : null);
      if (!row || residentEmail !== email) return null;
      return {
        id: typeof row.id === "string" ? row.id.trim() || null : null,
        bucket: typeof row.bucket === "string" ? row.bucket.trim().toLowerCase() || null : null,
        stage: typeof row.stage === "string" ? row.stage.trim() || null : null,
        property: typeof row.property === "string" ? row.property.trim() || null : null,
        updatedAt: typeof record.updated_at === "string" ? record.updated_at : "",
      };
    })
    .filter(Boolean) as Array<{
      id: string | null;
      bucket: string | null;
      stage: string | null;
      property: string | null;
      updatedAt: string;
    }>;

  if (!matching.length) {
    return { id: null, bucket: null, stage: null, property: null };
  }

  matching.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const latest = matching[0]!;
  return {
    id: latest.id,
    bucket: latest.bucket,
    stage: latest.stage,
    property: latest.property,
  };
}

export async function loadResidentPortalAccessState(params: {
  userId: string | null | undefined;
  role: string | null | undefined;
  email: string | null | undefined;
  managerSubscriptionTier?: ManagerSubscriptionTier;
}): Promise<ResidentPortalAccessState> {
  const managerSubscriptionTier = params.managerSubscriptionTier ?? null;
  const roleOk = !params.role || params.role === "resident";
  const email = normalizeEmail(params.email);
  if (!roleOk || !email) return emptyAccessState(managerSubscriptionTier);

  const db = createSupabaseServiceRoleClient();
  const { data: applicationRows } = await db
    .from("manager_application_records")
    .select("row_data, updated_at")
    .eq("resident_email", email)
    .order("updated_at", { ascending: false });

  const latestApplication = readLatestApplication(applicationRows ?? [], email);
  let applicationApproved = latestApplication.bucket === "approved";

  // Fallback: if no application found or status unclear, check the profile directly
  // to see if the resident has been provisioned as approved
  if (!applicationApproved && params.userId) {
    const { data: profile } = await db
      .from("profiles")
      .select("application_approved")
      .eq("id", params.userId)
      .maybeSingle();
    applicationApproved = Boolean(profile?.application_approved === true);
  }

  const leaseAccessUnlocked = applicationApproved;

  return {
    roleOk,
    applicationApproved,
    applicationId: latestApplication.id,
    applicationStage: latestApplication.stage,
    applicationProperty: latestApplication.property,
    leaseAccessUnlocked,
    fullPortalAccess: applicationApproved && managerSubscriptionTier !== "free",
    managerSubscriptionTier,
  };
}

/** Server-side: returns true when the resident has a lease that both manager and resident signed. */
export async function loadResidentLeaseSignedStatus(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;
  const db = createSupabaseServiceRoleClient();
  const { data } = await db
    .from("portal_lease_pipeline_records")
    .select("row_data")
    .eq("resident_email", normalizedEmail)
    .order("updated_at", { ascending: false });
  if (!data?.length) return false;
  return data.some((record) => {
    const row = record.row_data as Record<string, unknown> | null;
    if (!row) return false;
    const mgr = row.managerSignature as Record<string, unknown> | null | undefined;
    const res = row.residentSignature as Record<string, unknown> | null | undefined;
    const legacyName = typeof row.signatureName === "string" ? row.signatureName : null;
    const legacyAt = typeof row.signedAtIso === "string" ? row.signedAtIso : null;
    const managerSigned = Boolean(mgr?.name && mgr?.signedAtIso);
    const residentSigned = Boolean((res?.name && res?.signedAtIso) || (legacyName && legacyAt));
    return managerSigned && residentSigned;
  });
}

export function residentHasFullPortalAccess(params: {
  applicationApproved: boolean;
  role: string | null | undefined;
  email: string | null | undefined;
  managerSubscriptionTier?: ManagerSubscriptionTier;
}): boolean {
  if (params.role && params.role !== "resident") return false;
  return params.applicationApproved && params.managerSubscriptionTier !== "free";
}
