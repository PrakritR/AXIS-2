"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { ManagerApplicationQuestionsEditorModal, applicationQuestionTypeLabel } from "@/components/portal/manager-application-questions-editor-modal";
import {
  normalizeCustomApplicationFields,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import {
  persistManagerListingSubmission,
  type ManagerPropertySaveTarget,
} from "@/lib/manager-property-save-target";
import {
  listingApplicationIsCustomized,
  removeListingApplicationField,
  resolveListingApplicationFields,
  type ResolvedApplicationField,
} from "@/lib/rental-application/application-field-catalog";
import { RENTAL_APPLICATION_SECTIONS } from "@/lib/rental-application/application-sections";

type QuestionsSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

function shortenOptions(options: string[], max = 3): string {
  if (options.length === 0) return "";
  if (options.length <= max) return options.join(" / ");
  return `${options.slice(0, max).join(" / ")} +${options.length - max} more`;
}

/**
 * Per-property application editor — custom questions applicants answer in the
 * rental application (Additional details step). Stored on the listing submission
 * (`customApplicationFields`) so they persist with the property record.
 */
export function ManagerPropertyApplicationQuestionsPanel({
  sub,
  saveTarget,
  managerUserId,
  onUpdated,
  showToast,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: QuestionsSaveTarget;
  managerUserId: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const applicationFields = useMemo(
    () => resolveListingApplicationFields(sub, normalizeCustomApplicationFields),
    [sub],
  );
  const hasPreview = applicationFields.length > 0;
  const customized = listingApplicationIsCustomized(sub);

  useEffect(() => {
    setExpandedSections({});
  }, [applicationFields.length, customized]);

  if (!saveTarget || !managerUserId) return null;

  const closeModal = () => setModalOpen(false);

  const removeField = (field: ResolvedApplicationField) => {
    const patch = removeListingApplicationField(sub, field);
    const next: ManagerListingSubmissionV1 = { ...sub, ...patch };
    if (!persistManagerListingSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not remove question.");
      return;
    }
    showToast("Question removed.");
    onUpdated();
  };

  return (
    <>
      <PortalCollapsibleSection
        title="Application"
        expanded={previewExpanded}
        onExpandedChange={setPreviewExpanded}
        collapsible={hasPreview}
        toggleDataAttr="application-section-toggle"
        headerActions={
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            data-attr="application-questions-add"
            onClick={() => setModalOpen(true)}
          >
            Edit application
          </Button>
        }
        contentClassName="max-h-[min(50vh,420px)] overflow-y-auto overscroll-contain px-4 py-3"
      >
        {hasPreview ? (
          <div className="space-y-4">
            {RENTAL_APPLICATION_SECTIONS.map((section) => {
              const sectionQuestions = applicationFields.filter(
                (f) => (f.section ?? "additional") === section.id,
              );
              if (sectionQuestions.length === 0) return null;
              return (
                <PortalCollapsibleSection
                  key={section.id}
                  title={section.title}
                  titleVariant="label"
                  subtitle={`${sectionQuestions.length} question${sectionQuestions.length === 1 ? "" : "s"}`}
                  expanded={expandedSections[section.id] ?? false}
                  onExpandedChange={(open) =>
                    setExpandedSections((prev) => ({ ...prev, [section.id]: open }))
                  }
                  toggleDataAttr={`application-preview-section-${section.id}`}
                  surfaceMuted={false}
                  contentClassName="space-y-2 pt-0"
                >
                  {sectionQuestions.map((field) => (
                    <div
                      key={field.id}
                      className="flex gap-2 rounded-xl border border-border bg-accent/15 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-foreground">{field.label}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {applicationQuestionTypeLabel(field.type)}
                          {field.required ? " · Required" : " · Optional"}
                          {field.type === "select" && field.options.length > 0
                            ? ` · ${shortenOptions(field.options)}`
                            : ""}
                          {field.isStandard ? " · Built-in" : " · Custom"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-200 text-sm font-bold text-rose-800 portal-danger-outline hover:bg-rose-50"
                        data-attr="application-question-remove-one"
                        title={`Remove ${field.label}`}
                        aria-label={`Remove ${field.label}`}
                        onClick={() => removeField(field)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </PortalCollapsibleSection>
              );
            })}
          </div>
        ) : null}
      </PortalCollapsibleSection>

      <ManagerApplicationQuestionsEditorModal
        open={modalOpen}
        sub={sub}
        saveTarget={saveTarget}
        managerUserId={managerUserId}
        onClose={closeModal}
        onSaved={onUpdated}
        showToast={showToast}
      />
    </>
  );
}
