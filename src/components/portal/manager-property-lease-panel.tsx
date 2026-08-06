"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PropertyLeaseFormModal } from "@/components/portal/property-lease-form-modal";
import {
  PORTAL_LIST_ADD_ROW_WRAP_CLASS,
  PortalListAddRow,
  PORTAL_LIST_ADD_ICONS,
} from "@/components/portal/portal-list-add-row";
import {
  PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS,
  PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS,
  PortalPropertyDetailSection,
} from "@/components/portal/portal-property-detail-section";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  persistManagerListingSubmission,
  resolveManagerListingSubmissionForPropertyId,
} from "@/lib/manager-property-save-target";
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
      ? `Parsed PDF · ${template.leaseTemplateDocName}`
      : "Uploaded PDF · not parsed yet";
  }
  if (source === "custom_builder") {
    return template.leaseTemplateHtmlOverride?.trim()
      ? "Custom builder · edited"
      : "Custom builder · blank shell";
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
  propertyIds,
  onUpdated,
  showToast,
  propertyHint,
  propertyId,
  propertyLabel,
  demoMode = false,
  sectionActions,
  onRegisterAddLease,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: LeaseSaveTarget;
  managerUserId: string | null;
  /** When set, template changes apply to every listed property (bulk edit). */
  propertyIds?: string[];
  onUpdated: () => void;
  showToast: (m: string) => void;
  propertyHint?: PropertyLeasePreviewHint;
  propertyId?: string | null;
  propertyLabel?: string | null;
  demoMode?: boolean;
  sectionActions?: ReactNode;
  /** Parent header "Add lease" — same handler as the dashed list footer row. */
  onRegisterAddLease?: (openAdd: (() => void) | null) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const syncedSub = useMemo(() => syncPropertyLeaseTemplatesFromListing(sub), [sub]);
  const templates = useMemo(() => readPropertyLeaseTemplates(syncedSub), [syncedSub]);

  const bulkPropertyIds = propertyIds?.filter((id) => id.trim()) ?? [];

  const persistTemplates = (nextTemplates: PropertyLeaseTemplate[]) => {
    if (!managerUserId) return false;

    if (bulkPropertyIds.length > 0) {
      let saved = 0;
      let failed = 0;
      for (const bulkPropertyId of bulkPropertyIds) {
        const hit = resolveManagerListingSubmissionForPropertyId(managerUserId, bulkPropertyId);
        if (!hit) {
          failed += 1;
          continue;
        }
        const base = syncPropertyLeaseTemplatesFromListing(hit.sub);
        const next = syncLegacyLeaseFieldsFromTemplates(base, nextTemplates);
        if (persistManagerListingSubmission(hit.saveTarget, managerUserId, next)) saved += 1;
        else failed += 1;
      }
      if (saved === 0) {
        showToast("Could not save lease settings.");
        return false;
      }
      if (failed > 0) {
        showToast(`Updated lease for ${saved} properties (${failed} could not be saved).`);
      } else if (saved > 1) {
        showToast(`Updated lease for ${saved} properties.`);
      }
      return true;
    }

    if (!saveTarget) return false;
    const next = syncLegacyLeaseFieldsFromTemplates(syncedSub, nextTemplates);
    return persistManagerListingSubmission(saveTarget, managerUserId, next);
  };

  const openAdd = useCallback(() => {
    setFormMode("add");
    setEditingTemplateId(null);
    setFormOpen(true);
  }, []);

  useEffect(() => {
    onRegisterAddLease?.(openAdd);
    return () => onRegisterAddLease?.(null);
  }, [onRegisterAddLease, openAdd]);

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

  if (!managerUserId || (!saveTarget && bulkPropertyIds.length === 0)) return null;

  const editingTemplate = templates.find((t) => t.id === editingTemplateId) ?? null;

  return (
    <>
      <PortalPropertyDetailSection contentClassName="space-y-0">
          {sectionActions}
          {templates.map((template) => (
            <div key={template.id} className={PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{template.label}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {propertyLeaseTypeLabel(template.kind)} · {leaseDocumentSummary(template)}
                </p>
                {formatApplicationLeaseTermsLabel(template.applicationLeaseTerms) ? (
                  <p className="mt-0.5 text-xs text-muted">
                    Applicants: {formatApplicationLeaseTermsLabel(template.applicationLeaseTerms)}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                  data-attr={`property-lease-edit-${template.id}`}
                  onClick={() => openEdit(template.id)}
                >
                  Edit
                </Button>
                {templates.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                    onClick={() => handleRemove(template.id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
      </PortalPropertyDetailSection>

      <div className={PORTAL_LIST_ADD_ROW_WRAP_CLASS}>
        <PortalListAddRow
          label="Add"
          icon={PORTAL_LIST_ADD_ICONS.lease}
          onClick={openAdd}
          dataAttr="property-lease-add"
        />
      </div>

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
