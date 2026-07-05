import { cache } from "react";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ManagerSubscriptionTier = "free" | "paid" | null;

export type ResidentPortalAccessState = {
  roleOk: boolean;
  /** True when any manager_application_records row exists for this resident email. */
  hasSubmittedApplication: boolean;
  /** Resident with no submitted application yet — Applications-only portal. */
  isPreApplicationResident: boolean;
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
    hasSubmittedApplication: false,
    isPreApplicationResident: false,
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

const loadResidentPortalAccessStateCached = cache(
  async (
    userId: string | null,
    role: string | null,
    email: string,
    managerSubscriptionTier: ManagerSubscriptionTier,
  ): Promise<ResidentPortalAccessState> => {
    const roleOk = !role || role === "resident";
    if (!roleOk || !email) return emptyAccessState(managerSubscriptionTier);

    const db = createSupabaseServiceRoleClient();
    const { data: applicationRows } = await db
      .from("manager_application_records")
      .select("row_data, updated_at")
      .eq("resident_email", email)
      .order("updated_at", { ascending: false });

    let latestApplication = readLatestApplication(applicationRows ?? [], email);
    let hasSubmittedApplication = (applicationRows ?? []).length > 0;
    let applicationApproved = latestApplication.bucket === "approved";

    if ((!latestApplication.id || !applicationApproved) && userId) {
      const { data: profile } = await db
        .from("profiles")
        .select("application_approved, manager_id")
        .eq("id", userId)
        .maybeSingle();

      const profileAxisId = typeof profile?.manager_id === "string" ? profile.manager_id.trim() : "";
      if (profileAxisId && profileAxisId.toUpperCase().startsWith("AXIS-")) {
        const { data: axisRecord } = await db
          .from("manager_application_records")
          .select("row_data, updated_at")
          .eq("id", profileAxisId)
          .maybeSingle();

        if (axisRecord?.row_data && typeof axisRecord.row_data === "object" && !Array.isArray(axisRecord.row_data)) {
          const axisRow = axisRecord.row_data as Record<string, unknown>;
          hasSubmittedApplication = true;
          latestApplication = {
            id: typeof axisRow.id === "string" ? axisRow.id.trim() || null : null,
            bucket: typeof axisRow.bucket === "string" ? axisRow.bucket.trim().toLowerCase() || null : null,
            stage: typeof axisRow.stage === "string" ? axisRow.stage.trim() || null : null,
            property: typeof axisRow.property === "string" ? axisRow.property.trim() || null : null,
          };
          applicationApproved = latestApplication.bucket === "approved";
        }
      }

      if (!applicationApproved) {
        applicationApproved = Boolean(profile?.application_approved === true);
      }
    }

    const leaseAccessUnlocked = applicationApproved;
    const isPreApplicationResident = roleOk && !hasSubmittedApplication;

    return {
      roleOk,
      hasSubmittedApplication,
      isPreApplicationResident,
      applicationApproved,
      applicationId: latestApplication.id,
      applicationStage: latestApplication.stage,
      applicationProperty: latestApplication.property,
      leaseAccessUnlocked,
      fullPortalAccess: applicationApproved,
      managerSubscriptionTier,
    };
  },
);

export async function loadResidentPortalAccessState(params: {
  userId: string | null | undefined;
  role: string | null | undefined;
  email: string | null | undefined;
  managerSubscriptionTier?: ManagerSubscriptionTier;
}): Promise<ResidentPortalAccessState> {
  const managerSubscriptionTier = params.managerSubscriptionTier ?? null;
  const email = normalizeEmail(params.email);
  return loadResidentPortalAccessStateCached(
    params.userId ?? null,
    params.role ?? null,
    email,
    managerSubscriptionTier,
  );
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

/** Default resident landing route after sign-in / account creation. */
export function residentPortalHomePath(
  access: Pick<ResidentPortalAccessState, "isPreApplicationResident">,
): string {
  return access.isPreApplicationResident ? "/resident/applications" : "/resident/dashboard";
}

export function residentHasFullPortalAccess(params: {
  applicationApproved: boolean;
  role: string | null | undefined;
  email: string | null | undefined;
  managerSubscriptionTier?: ManagerSubscriptionTier;
}): boolean {
  if (params.role && params.role !== "resident") return false;
  return params.applicationApproved;
}
