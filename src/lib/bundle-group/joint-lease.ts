import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { getBundleChoiceLabel } from "@/lib/rental-application/data";
import type { DemoApplicantRow } from "@/data/demo-portal";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import {
  bundleGroupKey,
  jointLeaseRowId,
  memberIndexInBundleGroup,
  type BundleApplicationGroup,
} from "./bundle-group-application";
import type { JointLeaseMember } from "./types";

export function jointLeaseRowIncludesMember(
  row: Pick<LeasePipelineRow, "leaseKind" | "jointLeaseMembers" | "residentEmail" | "axisId">,
  member: { email?: string | null; applicationId?: string | null },
): boolean {
  const email = member.email?.trim().toLowerCase() ?? "";
  const applicationId = member.applicationId?.trim() ?? "";
  const normalizedAppId = applicationId ? normalizeApplicationAxisId(applicationId) : "";

  if (row.leaseKind === "joint_bundle") {
    if (row.jointLeaseMembers?.length) {
      return row.jointLeaseMembers.some((m) => {
        if (email && m.residentEmail.trim().toLowerCase() === email) return true;
        if (normalizedAppId && normalizeApplicationAxisId(m.applicationId) === normalizedAppId) return true;
        return false;
      });
    }
  }

  if (email && row.residentEmail.trim().toLowerCase() === email) return true;
  if (normalizedAppId && row.axisId?.trim() && normalizeApplicationAxisId(row.axisId) === normalizedAppId) {
    return true;
  }
  return false;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildJointLeaseMembers(
  approvedRows: DemoApplicantRow[],
  group: BundleApplicationGroup,
): JointLeaseMember[] {
  const byId = new Map(approvedRows.map((r) => [r.id, r]));
  return group.members
    .map((m) => {
      const row = byId.get(m.id);
      if (!row) return null;
      return {
        applicationId: row.id,
        residentName: row.name?.trim() || row.email?.trim() || "Resident",
        residentEmail: row.email?.trim().toLowerCase() || "",
        residentUserId: row.residentUserId ?? null,
        role: m.role === "first" ? "first" : "joining",
      } satisfies JointLeaseMember;
    })
    .filter((m): m is JointLeaseMember => Boolean(m));
}

export function jointLeaseUnitLabel(propertyId: string, bundleId: string): string {
  const bundleLabel = getBundleChoiceLabel(propertyId, bundleId);
  return bundleLabel ? `Joint bundle · ${bundleLabel}` : "Joint bundle lease";
}

export function jointLeaseResidentNames(members: JointLeaseMember[]): string {
  return members.map((m) => m.residentName).join(", ");
}

export function jointLeasePartiesParagraph(members: JointLeaseMember[]): string {
  if (!members.length) return "";
  const names = members.map((m) => escapeHtml(m.residentName)).join(", ");
  const noun = members.length === 1 ? "Resident" : "Residents";
  return `${noun} (joint and several): ${names}.`;
}

export function jointLeaseSignatureBlocksHtml(members: JointLeaseMember[]): string {
  if (!members.length) return "";
  const cards = members
    .map((m, i) => {
      const sig = m.residentSignature;
      const body = sig
        ? `<p class="axis-esign-name">${escapeHtml(sig.name)}</p><p class="axis-esign-meta">Electronically signed ${escapeHtml(sig.signedAtIso)}</p>`
        : `<p class="axis-esign-pending">Pending signature</p>`;
      return `
    <div class="axis-esign-card">
      <p class="axis-esign-label">Resident / Tenant ${i + 1}${m.role === "first" ? " (organizer)" : ""}</p>
      ${body}
    </div>`;
    })
    .join("");
  return `
<section class="axis-esign">
  <h2>Joint Tenant Signatures</h2>
  <p>Each co-tenant listed on this joint bundle lease must sign below.</p>
  <div class="axis-esign-grid">${cards}</div>
</section>`;
}

export function allJointMembersSigned(members: JointLeaseMember[]): boolean {
  return members.length > 0 && members.every((m) => Boolean(m.residentSignature?.name && m.residentSignature?.signedAtIso));
}

export function buildJointLeasePipelineRow(input: {
  group: BundleApplicationGroup;
  members: JointLeaseMember[];
  organizer: DemoApplicantRow;
  propertyId: string;
  managerUserId: string | null;
  existing?: LeasePipelineRow | null;
}): LeasePipelineRow {
  const { group, members, organizer, propertyId, managerUserId, existing } = input;
  const bundleId = group.bundleId!;
  const groupId = group.groupId;
  const iso = new Date().toISOString();
  const unit = jointLeaseUnitLabel(propertyId, bundleId);
  const primaryName = jointLeaseResidentNames(members);

  return {
    id: existing?.id ?? jointLeaseRowId(groupId, bundleId, propertyId),
    residentName: primaryName,
    residentEmail: organizer.email?.trim().toLowerCase() || members[0]?.residentEmail || "",
    unit,
    stageLabel: existing?.stageLabel ?? "Manager Review",
    updated: existing?.updated ?? new Date().toLocaleDateString(),
    bucket: existing?.bucket ?? "manager",
    pdfVersion: existing?.pdfVersion ?? 1,
    notes: existing?.notes?.trim() || "Joint bundle lease for group household.",
    updatedAtIso: iso,
    axisId: organizer.id,
    propertyId,
    managerUserId,
    residentUserId: organizer.residentUserId ?? null,
    roomChoice: null,
    signedRentLabel: existing?.signedRentLabel ?? null,
    application: organizer.application ?? undefined,
    generatedHtml: existing?.generatedHtml ?? null,
    generatedAtIso: existing?.generatedAtIso ?? null,
    managerUploadedPdf: existing?.managerUploadedPdf ?? null,
    thread: existing?.thread ?? [],
    managerSignature: existing?.managerSignature ?? null,
    residentSignature: existing?.residentSignature ?? null,
    signatureName: existing?.signatureName ?? null,
    signedAtIso: existing?.signedAtIso ?? null,
    leaseKind: "joint_bundle",
    jointLeaseGroupId: groupId,
    jointLeaseBundleId: bundleId,
    jointLeaseMembers: members,
    primaryApplicationId: organizer.id,
    bundleGroupKey: bundleGroupKey(groupId, bundleId, propertyId),
  };
}

export function memberIndexForApplicationInGroup(
  group: BundleApplicationGroup,
  applicationId: string,
): number {
  return memberIndexInBundleGroup(group, applicationId);
}
