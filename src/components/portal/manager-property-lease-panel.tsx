"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { ManagerLeaseEditorModal } from "@/components/portal/manager-lease-editor-modal";
import {
  activeCustomLeaseTerms,
  activeLeaseTemplateDoc,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";

type LeaseSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

function propertyLeaseSummary(sub: ManagerListingSubmissionV1): string {
  const mode = sub.leaseConfigMode ?? "standard";
  if (mode === "standard") return "Axis standard lease";
  if (sub.leaseCustomKind === "document") {
    const doc = activeLeaseTemplateDoc(sub);
    return doc ? `Custom PDF · ${doc.name}` : "Custom PDF template";
  }
  return "Custom lease terms";
}

/**
 * Per-property lease editor — standard Axis lease or manager custom terms / PDF template.
 * Mirrors the listing wizard Lease step; edits persist on the listing submission.
 */
export function ManagerPropertyLeasePanel({
  sub,
  saveTarget,
  managerUserId,
  onUpdated,
  showToast,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: LeaseSaveTarget;
  managerUserId: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const summary = useMemo(() => propertyLeaseSummary(sub), [sub]);
  const customTerms = useMemo(() => activeCustomLeaseTerms(sub), [sub]);
  const templateDoc = useMemo(() => activeLeaseTemplateDoc(sub), [sub]);
  const isStandard = (sub.leaseConfigMode ?? "standard") === "standard";

  if (!saveTarget || !managerUserId) return null;

  return (
    <>
      <PortalCollapsibleSection
        title="Lease"
        subtitle={summary}
        expanded={previewExpanded}
        onExpandedChange={setPreviewExpanded}
        collapsible
        className="mt-4"
        toggleDataAttr="lease-section-toggle"
        headerActions={
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            data-attr="property-lease-edit"
            onClick={() => setModalOpen(true)}
          >
            Edit lease
          </Button>
        }
        contentClassName="px-4 py-3"
      >
        {isStandard ? (
          <p className="text-sm leading-relaxed text-muted">
            Axis generates a complete lease from the approved application and this listing — rent, deposits, house
            rules, and local disclosures included.
          </p>
        ) : sub.leaseCustomKind === "document" ? (
          <div className="rounded-xl border border-border bg-accent/15 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">Uploaded lease template</p>
            <p className="mt-0.5 text-xs text-muted">
              {templateDoc?.name ?? "PDF template"} · Used as the lease document for placements at this property
            </p>
            {templateDoc?.url && !templateDoc.url.startsWith("data:") ? (
              <a
                href={templateDoc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
              >
                View template
              </a>
            ) : null}
          </div>
        ) : customTerms ? (
          <div className="rounded-xl border border-border bg-accent/15 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">Custom lease addendum</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{customTerms}</pre>
          </div>
        ) : (
          <p className="text-sm text-muted">Custom lease configured — open Edit lease to add terms or upload a template.</p>
        )}
      </PortalCollapsibleSection>

      <ManagerLeaseEditorModal
        open={modalOpen}
        sub={sub}
        saveTarget={saveTarget}
        managerUserId={managerUserId}
        onClose={() => setModalOpen(false)}
        onSaved={onUpdated}
        showToast={showToast}
      />
    </>
  );
}
