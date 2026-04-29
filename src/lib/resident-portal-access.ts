import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ManagerSubscriptionTier = "free" | "paid" | null;

export type ResidentPortalAccessState = {
  roleOk: boolean;
  paymentsUnlocked: boolean;
  applicationApproved: boolean;
  applicationId: string | null;
  applicationStage: string | null;
  applicationProperty: string | null;
  applicationFeePaid: boolean;
  pendingApplicationFeeLabel: string | null;
  leaseAccessUnlocked: boolean;
  fullPortalAccess: boolean;
  managerSubscriptionTier: ManagerSubscriptionTier;
};

function emptyAccessState(managerSubscriptionTier: ManagerSubscriptionTier): ResidentPortalAccessState {
  return {
    roleOk: false,
    paymentsUnlocked: false,
    applicationApproved: false,
    applicationId: null,
    applicationStage: null,
    applicationProperty: null,
    applicationFeePaid: false,
    pendingApplicationFeeLabel: null,
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

function readApplicationFeeState(
  records: Array<{ row_data: unknown; updated_at?: string | null }>,
  email: string,
): {
  paid: boolean;
  pendingLabel: string | null;
} {
  const fees = records
    .map((record) =>
      record.row_data && typeof record.row_data === "object" && !Array.isArray(record.row_data)
        ? (record.row_data as Record<string, unknown>)
        : null,
    )
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .filter((row) => normalizeEmail(typeof row.residentEmail === "string" ? row.residentEmail : null) === email)
    .filter((row) => row.kind === "application_fee");

  if (!fees.length) return { paid: true, pendingLabel: null };
  const hasPaid = fees.some((row) => row.status === "paid");
  const pending = fees.find((row) => row.status === "pending");
  return {
    paid: hasPaid,
    pendingLabel: typeof pending?.balanceLabel === "string" ? pending.balanceLabel.trim() || null : null,
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
  const [{ data: applicationRows }, { data: chargeRows }] = await Promise.all([
    db.from("manager_application_records").select("row_data, updated_at").eq("resident_email", email).order("updated_at", { ascending: false }),
    db
      .from("portal_household_charge_records")
      .select("row_data, updated_at")
      .or(params.userId ? `resident_user_id.eq.${params.userId},resident_email.eq.${email}` : `resident_email.eq.${email}`)
      .order("updated_at", { ascending: false }),
  ]);

  const latestApplication = readLatestApplication(applicationRows ?? [], email);
  const applicationApproved = latestApplication.bucket === "approved";
  const feeState = readApplicationFeeState(chargeRows ?? [], email);
  const leaseAccessUnlocked = applicationApproved && feeState.paid;

  return {
    roleOk,
    paymentsUnlocked: true,
    applicationApproved,
    applicationId: latestApplication.id,
    applicationStage: latestApplication.stage,
    applicationProperty: latestApplication.property,
    applicationFeePaid: feeState.paid,
    pendingApplicationFeeLabel: feeState.pendingLabel,
    leaseAccessUnlocked,
    fullPortalAccess: leaseAccessUnlocked && managerSubscriptionTier !== "free",
    managerSubscriptionTier,
  };
}

export function residentHasFullPortalAccess(params: {
  applicationApproved: boolean;
  applicationFeePaid?: boolean;
  role: string | null | undefined;
  email: string | null | undefined;
  managerSubscriptionTier?: ManagerSubscriptionTier;
}): boolean {
  if (params.role && params.role !== "resident") return false;
  return params.applicationApproved && Boolean(params.applicationFeePaid) && params.managerSubscriptionTier !== "free";
}

export function residentHasPaymentsPortalAccess(params: {
  role: string | null | undefined;
  email: string | null | undefined;
}): boolean {
  if (params.role && params.role !== "resident") return false;
  return Boolean(normalizeEmail(params.email));
}
