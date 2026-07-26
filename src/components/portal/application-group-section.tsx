"use client";

import { Badge } from "@/components/ui/badge";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  applicationHasGroup,
  summarizeGroupProgress,
  type ApplicationGroup,
  type ApplicationGroupMemberStatus,
  type GroupRowInput,
} from "@/lib/rental-application/application-groups";
import { isInProgressApplicationRow } from "@/lib/rental-application/in-progress-application";
import { isWithdrawnApplicationRow } from "@/lib/rental-application/resident-application-list";

type ApplicationStatusPill = {
  label: string;
  tone: "neutral" | "info" | "pending" | "confirmed" | "overdue";
};

/**
 * Single source of truth for an application's status — derived purely from the row's
 * existing bucket + screening signals (no new state, no writes). Both the row pill and
 * the group roster read the same value, so they can never contradict each other.
 */
export function applicationStatusForRow(row: DemoApplicantRow): ApplicationGroupMemberStatus {
  if (row.bucket === "approved") return "approved";
  if (row.bucket === "rejected") return "rejected";
  if (isInProgressApplicationRow(row)) return "in_progress";
  const bg = row.backgroundCheckStatus;
  if (bg === "flagged") return "flagged";
  if (bg === "passed") return "screened";
  if (bg === "pending_review" || row.screening) return "screening";
  return "submitted";
}

const APPLICATION_STATUS_PILL: Record<ApplicationGroupMemberStatus, ApplicationStatusPill> = {
  approved: { label: "Approved", tone: "confirmed" },
  rejected: { label: "Rejected", tone: "overdue" },
  in_progress: { label: "Incomplete", tone: "neutral" },
  flagged: { label: "Flagged", tone: "overdue" },
  screened: { label: "Screened", tone: "info" },
  screening: { label: "Screening", tone: "pending" },
  submitted: { label: "New", tone: "info" },
};

export function applicationStatusPill(row: DemoApplicantRow): ApplicationStatusPill {
  if (isWithdrawnApplicationRow(row)) return { label: "Withdrawn", tone: "neutral" };
  return APPLICATION_STATUS_PILL[applicationStatusForRow(row)];
}

/** The Group ID a row participates in, or "" when it does not. */
export function groupIdForRow(row: DemoApplicantRow): string {
  return applicationHasGroup(row.application) ? row.application?.groupId ?? "" : "";
}

/** Reduce an application row to the fields group reconciliation needs. */
export function groupRowInputForRow(row: DemoApplicantRow): GroupRowInput {
  return {
    id: row.id,
    name: row.name || row.email || "Applicant",
    email: row.email || "",
    role: row.application?.groupRole ?? null,
    groupId: groupIdForRow(row),
    groupSize: row.application?.groupSize ?? "",
    status: applicationStatusForRow(row),
  };
}

/**
 * Group-application roster shown inside an expanded application. Presents the household
 * as a single group covering the bundle while each member keeps an independent account.
 */
export function ApplicationGroupSection({ group, currentRowId }: { group: ApplicationGroup; currentRowId: string }) {
  const progress = summarizeGroupProgress(group);
  return (
    <PortalCollapsibleSection
      title="Group application"
      defaultExpanded
      surfaceMuted={false}
      className="mt-4"
      contentClassName="p-4 pt-0"
      toggleDataAttr="application-group-toggle"
      headerActions={<Badge tone={progress.tone}>{progress.label}</Badge>}
    >
      <p className="mb-3 text-xs text-muted">
        PropLane Group ID <span className="font-mono text-foreground">{group.groupId}</span>
        {group.missingCount != null && group.missingCount > 0
          ? ` · waiting on ${group.missingCount} more ${group.missingCount === 1 ? "applicant" : "applicants"} to start`
          : ""}
      </p>
      {!group.hasFirst ? (
        <p className="mb-3 text-xs text-muted">
          No organizer application using this Group ID is visible in your applications. The organizer may have applied
          to a property outside your access, or the code may not match an existing group.
        </p>
      ) : null}
      {group.isOverSubscribed ? (
        <p className="mb-3 text-xs text-[var(--status-pending-fg)]">
          {group.totalCount} applications carry this Group ID, more than the {group.expectedSize} the organizer
          declared.
        </p>
      ) : null}
      <ul className="divide-y divide-[var(--border)] rounded-2xl border border-border">
        {group.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium text-foreground">
                {m.name}
                {m.id === currentRowId ? <span className="ml-1.5 text-[11px] text-muted">(this application)</span> : null}
                {m.role === "first" ? <span className="ml-1.5 text-[11px] text-muted">· organizer</span> : null}
              </span>
              {m.email ? <span className="truncate text-[11px] text-muted">{m.email}</span> : null}
            </span>
            <Badge tone={APPLICATION_STATUS_PILL[m.status].tone}>{APPLICATION_STATUS_PILL[m.status].label}</Badge>
          </li>
        ))}
      </ul>
    </PortalCollapsibleSection>
  );
}
