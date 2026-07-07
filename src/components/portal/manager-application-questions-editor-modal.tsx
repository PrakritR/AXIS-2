"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS,
  customApplicationFieldKeyFromLabel,
  emptyCustomApplicationField,
  normalizeCustomApplicationFields,
  type ManagerCustomApplicationField,
  type ManagerCustomApplicationFieldType,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import {
  persistManagerListingSubmission,
  type ManagerPropertySaveTarget,
} from "@/lib/manager-property-save-target";
import {
  addListingApplicationField,
  patchListingApplicationField,
  removeListingApplicationField,
  resolveListingApplicationFields,
  restoreDefaultApplicationConfig,
  type ResolvedApplicationField,
} from "@/lib/rental-application/application-field-catalog";
import { RENTAL_APPLICATION_SECTIONS } from "@/lib/rental-application/application-sections";

function parseOptionsText(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const t = part.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

function typeLabel(type: ManagerCustomApplicationFieldType): string {
  return CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS.find((o) => o.id === type)?.label ?? type;
}

export { typeLabel as applicationQuestionTypeLabel };

type DraftConfig = {
  disabledStandardApplicationKeys: string[];
  customApplicationFields: ManagerCustomApplicationField[];
};

function draftFromSubmission(sub: ManagerListingSubmissionV1): DraftConfig {
  return {
    disabledStandardApplicationKeys: [...(sub.disabledStandardApplicationKeys ?? [])],
    customApplicationFields: normalizeCustomApplicationFields(sub.customApplicationFields),
  };
}

function applicationConfigModeFromDraft(draft: DraftConfig): "standard" | "custom" {
  return draft.disabledStandardApplicationKeys.length > 0 || draft.customApplicationFields.length > 0
    ? "custom"
    : "standard";
}

/** Shared application-question editor — same modal used on property details and Applications. */
export function ManagerApplicationQuestionsEditorModal({
  open,
  title = "Application",
  sub,
  saveTarget,
  managerUserId,
  onClose,
  onSaved,
  showToast,
}: {
  open: boolean;
  title?: string;
  sub: ManagerListingSubmissionV1;
  saveTarget: ManagerPropertySaveTarget;
  managerUserId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (m: string) => void;
}) {
  const [draft, setDraft] = useState<DraftConfig>(() => draftFromSubmission(sub));
  const [optionsDrafts, setOptionsDrafts] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDraft(draftFromSubmission(sub));
    setOptionsDrafts({});
    setRowErrors({});
  }, [open, sub]);

  const applicationFields = useMemo(
    () => resolveListingApplicationFields(draft, normalizeCustomApplicationFields),
    [draft],
  );

  const patchField = (field: ResolvedApplicationField, patch: Partial<ManagerCustomApplicationField>) => {
    setDraft((prev) => ({ ...prev, ...patchListingApplicationField(prev, field, patch) }));
    setRowErrors((prev) => {
      if (!prev[field.id]) return prev;
      const next = { ...prev };
      delete next[field.id];
      return next;
    });
  };

  const removeField = (field: ResolvedApplicationField) => {
    setDraft((prev) => ({ ...prev, ...removeListingApplicationField(prev, field) }));
    setRowErrors((prev) => {
      if (!prev[field.id]) return prev;
      const next = { ...prev };
      delete next[field.id];
      return next;
    });
  };

  const addField = (section: string) => {
    setDraft((prev) => ({ ...prev, ...addListingApplicationField(prev, emptyCustomApplicationField(section)) }));
  };

  const restoreDefaults = () => {
    setDraft(draftFromSubmission({ ...sub, ...restoreDefaultApplicationConfig() }));
    setOptionsDrafts({});
    setRowErrors({});
  };

  const questionOptionsText = (field: ResolvedApplicationField): string =>
    optionsDrafts[field.id] ?? field.options.join(", ");

  const setQuestionOptionsText = (field: ResolvedApplicationField, text: string) => {
    setOptionsDrafts((d) => ({ ...d, [field.id]: text }));
    patchField(field, { options: parseOptionsText(text) });
  };

  const save = () => {
    const errors: Record<string, string> = {};
    const usedKeys = new Set<string>();
    for (const field of applicationFields) {
      if (!field.isStandard) {
        const label = field.label.trim();
        if (!label) {
          errors[field.id] = "Question label is required.";
          continue;
        }
        if (field.type === "select" && field.options.length === 0) {
          errors[field.id] = "Add at least one dropdown option (comma-separated).";
          continue;
        }
        const key = field.key.trim() || customApplicationFieldKeyFromLabel(label, usedKeys);
        if (usedKeys.has(key)) {
          errors[field.id] = "Duplicate question — rename or remove one of the copies.";
          continue;
        }
        usedKeys.add(key);
      }
    }
    if (Object.keys(errors).length > 0) {
      setRowErrors(errors);
      showToast("Fix the highlighted questions before saving.");
      return;
    }

    const next: ManagerListingSubmissionV1 = {
      ...sub,
      disabledStandardApplicationKeys: draft.disabledStandardApplicationKeys,
      customApplicationFields: draft.customApplicationFields,
      applicationConfigMode: applicationConfigModeFromDraft(draft),
    };
    if (!persistManagerListingSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not save application questions.");
      return;
    }
    showToast("Application saved.");
    onClose();
    onSaved();
  };

  return (
    <Modal open={open} title={title} onClose={onClose} panelClassName="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            {applicationFields.length} question{applicationFields.length === 1 ? "" : "s"} on this application
          </p>
          <Button type="button" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={restoreDefaults}>
            Restore Axis defaults
          </Button>
        </div>

        {RENTAL_APPLICATION_SECTIONS.map((section) => {
          const sectionQuestions = applicationFields.filter((f) => (f.section ?? "additional") === section.id);
          return (
            <div key={section.id} className="space-y-3 rounded-xl border border-border bg-accent/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{section.title}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-7 rounded-full px-2.5 text-xs"
                  data-attr="application-questions-add"
                  onClick={() => addField(section.id)}
                >
                  + Add question
                </Button>
              </div>
              {sectionQuestions.length === 0 ? (
                <p className="text-sm text-muted">No questions in this section.</p>
              ) : (
                sectionQuestions.map((field) => (
                  <div
                    key={field.id}
                    className={`space-y-3 rounded-xl border p-3 ${rowErrors[field.id] ? "border-red-300 ring-2 ring-red-100" : "border-border bg-accent/20"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${field.isStandard ? "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100" : "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100"}`}
                      >
                        {field.isStandard ? "Built-in" : "Custom"}
                      </span>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 text-sm font-bold text-rose-800 portal-danger-outline hover:bg-rose-50"
                        title="Remove question"
                        aria-label="Remove question"
                        onClick={() => removeField(field)}
                      >
                        ×
                      </button>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Question</p>
                      <Input
                        value={field.label}
                        onChange={(e) => patchField(field, { label: e.target.value })}
                        placeholder="e.g. Do you smoke?"
                        className="mt-1"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">Answer type</p>
                        <Select
                          value={field.type}
                          onChange={(e) =>
                            patchField(field, { type: e.target.value as ManagerCustomApplicationFieldType })
                          }
                          className="mt-1"
                        >
                          {CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 self-end rounded-xl border border-border bg-card px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border text-primary"
                          checked={field.required}
                          onChange={(e) => patchField(field, { required: e.target.checked })}
                        />
                        <span className="text-sm font-medium text-foreground">Required</span>
                      </label>
                    </div>
                    {field.type === "select" ? (
                      <div>
                        <p className="text-sm font-medium text-foreground">Dropdown options</p>
                        <Input
                          value={questionOptionsText(field)}
                          onChange={(e) => setQuestionOptionsText(field, e.target.value)}
                          placeholder="Comma-separated, e.g. Yes, No, Occasionally"
                          className="mt-1"
                        />
                      </div>
                    ) : null}
                    {rowErrors[field.id] ? <p className="text-sm text-red-600">{rowErrors[field.id]}</p> : null}
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          className="rounded-full"
          data-attr="application-questions-save"
          onClick={save}
        >
          Save
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
