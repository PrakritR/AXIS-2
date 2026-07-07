"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { ManagerLeaseEditorModal } from "@/components/portal/manager-lease-editor-modal";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { buildPropertyLeasePreview, type PropertyLeasePreviewHint } from "@/lib/property-lease-preview";

type LeaseSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

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
  propertyHint,
  demoMode = false,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: LeaseSaveTarget;
  managerUserId: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  propertyHint?: PropertyLeasePreviewHint;
  demoMode?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const preview = useMemo(
    () => buildPropertyLeasePreview(sub, { hint: propertyHint, demo: demoMode }),
    [sub, propertyHint, demoMode],
  );

  if (!saveTarget || !managerUserId) return null;

  return (
    <>
      <PortalCollapsibleSection
        title="Lease"
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
            Edit
          </Button>
        }
        contentClassName="px-4 py-3"
      >
        {preview.unsupportedJurisdiction ? (
          <p className="rounded-xl border border-border bg-accent/20 px-3 py-2.5 text-sm text-muted">
            {preview.plainText}
          </p>
        ) : preview.html ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <iframe
              title="Lease preview"
              srcDoc={preview.html}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              className="h-[min(48vh,400px)] w-full"
            />
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-accent/20 px-3 py-2.5 text-sm text-muted">
            {preview.plainText}
          </p>
        )}
      </PortalCollapsibleSection>

      <ManagerLeaseEditorModal
        open={modalOpen}
        sub={sub}
        saveTarget={saveTarget}
        managerUserId={managerUserId}
        propertyHint={propertyHint}
        demoMode={demoMode}
        onClose={() => setModalOpen(false)}
        onSaved={onUpdated}
        showToast={showToast}
      />
    </>
  );
}
