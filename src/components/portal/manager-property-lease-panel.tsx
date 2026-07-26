"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { PropertyLeaseFormModal } from "@/components/portal/property-lease-form-modal";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { persistManagerListingSubmission } from "@/lib/manager-property-save-target";
import type { PropertyLeasePreviewHint } from "@/lib/property-lease-preview";
import { propertyLeaseSourceLabel } from "@/lib/property-lease-source";
import {
  propertyLeaseSourceFromTemplate,
  propertyLeaseTypeLabel,
  readPropertyLeaseTemplates,
  removePropertyLeaseTemplate,
  syncLegacyLeaseFieldsFromTemplates,
  type PropertyLeaseTemplate,
} from "@/lib/property-lease-templates";
import { formatApplicationLeaseTermsLabel, syncPropertyLeaseTemplatesFromListing } from "@/lib/property-lease-template-sync";

type LeaseSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

function leaseDocumentSummary(template: PropertyLeaseTemplate): string {
  const source = propertyLeaseSourceFromTemplate(template);
  if (source === "custom_format") {
    return template.leaseTemplateDocName?.trim()
      ? `Your PDF · ${template.leaseTemplateDocName}`
      : "Your PDF · not uploaded yet";
  }
  if (source === "custom_comments") {
    const preview = template.customLeaseTerms?.trim();
    if (!preview) return "Custom clauses · not added yet";
    const short = preview.length > 72 ? `${preview.slice(0, 72)}…` : preview;
    return `Custom clauses · ${short}`;
  }
  return propertyLeaseSourceLabel(source);
}

/**
 * Per-property lease templates — agreement type plus PropLane default, custom clauses, or uploaded PDF.
 */
export function ManagerPropertyLeasePanel({
  sub,
  saveTarget,
  managerUserId,
  onUpdated,
  showToast,
  propertyHint,
  propertyId,
  propertyLabel,
  demoMode = false,
  sectionActions,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: LeaseSaveTarget;
  managerUserId: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  propertyHint?: PropertyLeasePreviewHint;
  propertyId?: string | null;
  propertyLabel?: string | null;
  demoMode?: boolean;
  sectionActions?: ReactNode;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [sectionExpanded, setSectionExpanded] = useState(false);

  const syncedSub = useMemo(() => syncPropertyLeaseTemplatesFromListing(sub), [sub]);
  const templates = useMemo(() => readPropertyLeaseTemplates(syncedSub), [syncedSub]);

  const persistTemplates = (nextTemplates: PropertyLeaseTemplate[]) => {
    if (!saveTarget || !managerUserId) return false;
    const next = syncLegacyLeaseFieldsFromTemplates(syncedSub, nextTemplates);
    return persistManagerListingSubmission(saveTarget, managerUserId, next);
  };

  const openAdd = () => {
    setFormMode("add");
    setEditingTemplateId(null);
    setFormOpen(true);
  };

  const openEdit = (templateId: string) => {
    setFormMode("edit");
    setEditingTemplateId(templateId);
    setFormOpen(true);
  };

  const handleRemove = (templateId: string) => {
    if (templates.length <= 1) {
      showToast("Keep at least one lease on this property.");
      return;
    }
    if (!window.confirm("Remove this lease?")) return;
    const next = removePropertyLeaseTemplate(templates, templateId);
    if (!persistTemplates(next)) {
      showToast("Could not remove lease.");
      return;
    }
    onUpdated();
    showToast("Lease removed.");
  };

  if (!saveTarget || !managerUserId) return null;

  const editingTemplate = templates.find((t) => t.id === editingTemplateId) ?? null;

  return (
    <>
      <PortalCollapsibleSection
        title="Lease"
        expanded={sectionExpanded}
        onExpandedChange={setSectionExpanded}
        collapsible
        headerActionsInline
        toggleDataAttr="lease-section-toggle"
        headerActions={
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            data-attr="property-lease-add"
            onClick={openAdd}
          >
            Add lease
          </Button>
        }
        contentClassName="px-4 py-2"
      >
        {sectionActions}
        <div className="space-y-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{template.label}</p>
                <p className="text-xs text-muted">
                  {propertyLeaseTypeLabel(template.kind)} · {leaseDocumentSummary(template)}
                </p>
                {formatApplicationLeaseTermsLabel(template.applicationLeaseTerms) ? (
                  <p className="mt-0.5 text-xs text-muted">
                    Applicants: {formatApplicationLeaseTermsLabel(template.applicationLeaseTerms)}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-full px-3 text-xs"
                  data-attr={`property-lease-edit-${template.id}`}
                  onClick={() => openEdit(template.id)}
                >
                  Edit
                </Button>
                {templates.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => handleRemove(template.id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </PortalCollapsibleSection>

      <PropertyLeaseFormModal
        open={formOpen}
        mode={formMode}
        sub={sub}
        template={editingTemplate}
        templates={templates}
        propertyHint={propertyHint}
        demoMode={demoMode}
        onClose={() => {
          setFormOpen(false);
          setEditingTemplateId(null);
        }}
        onSave={(nextTemplates) => {
          if (!persistTemplates(nextTemplates)) {
            showToast("Could not save lease.");
            return false;
          }
          onUpdated();
          return true;
        }}
        showToast={showToast}
      />
    </>
  );
}
