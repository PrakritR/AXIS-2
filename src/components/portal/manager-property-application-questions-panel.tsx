"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { updateRequestChangeProperty } from "@/lib/demo-admin-property-inventory";
import {
  updateExtraListingFromSubmission,
  updatePendingManagerProperty,
} from "@/lib/demo-property-pipeline";
import {
  CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS,
  customApplicationFieldKeyFromLabel,
  emptyCustomApplicationField,
  normalizeCustomApplicationFields,
  type ManagerCustomApplicationField,
  type ManagerCustomApplicationFieldType,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";

type QuestionsSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

/** Editable row — options kept as free text until save so typing commas feels natural. */
type DraftQuestionRow = {
  id: string;
  key: string;
  label: string;
  type: ManagerCustomApplicationFieldType;
  required: boolean;
  optionsText: string;
};

function draftRowsFromFields(fields: ManagerCustomApplicationField[]): DraftQuestionRow[] {
  return fields.map((f) => ({
    id: f.id,
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    optionsText: f.options.join(", "),
  }));
}

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

/**
 * Per-property "Application questions" editor — the questions applicants answer in
 * the rental application (Additional details step). Stored on the listing submission
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
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<DraftQuestionRow[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const fields = normalizeCustomApplicationFields(sub.customApplicationFields);
  if (!saveTarget || !managerUserId) return null;

  const startEdit = () => {
    setRows(draftRowsFromFields(fields));
    setRowErrors({});
    setEditing(true);
  };

  const patchRow = (id: string, patch: Partial<DraftQuestionRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setRowErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const moveRow = (id: string, dir: -1 | 1) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      const swap = idx + dir;
      if (idx === -1 || swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap]!, next[idx]!];
      return next;
    });
  };

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const addRow = () => {
    const blank = emptyCustomApplicationField();
    setRows((prev) => [
      ...prev,
      { id: blank.id, key: "", label: "", type: "text", required: false, optionsText: "" },
    ]);
  };

  const save = () => {
    const errors: Record<string, string> = {};
    const usedKeys = new Set<string>();
    const nextFields: ManagerCustomApplicationField[] = [];
    for (const row of rows) {
      const label = row.label.trim();
      if (!label) {
        errors[row.id] = "Question label is required.";
        continue;
      }
      const options = row.type === "select" ? parseOptionsText(row.optionsText) : [];
      if (row.type === "select" && options.length === 0) {
        errors[row.id] = "Add at least one dropdown option (comma-separated).";
        continue;
      }
      const key = row.key.trim() || customApplicationFieldKeyFromLabel(label, usedKeys);
      if (usedKeys.has(key)) {
        errors[row.id] = "Duplicate question — rename or remove one of the copies.";
        continue;
      }
      usedKeys.add(key);
      nextFields.push({ id: row.id, key, label, type: row.type, required: row.required, options });
    }
    if (Object.keys(errors).length > 0) {
      setRowErrors(errors);
      showToast("Fix the highlighted questions before saving.");
      return;
    }

    const next: ManagerListingSubmissionV1 = { ...sub, customApplicationFields: nextFields };
    let ok = false;
    if (saveTarget.mode === "pending") {
      ok = updatePendingManagerProperty(saveTarget.saveId, next, managerUserId);
    } else if (saveTarget.mode === "listing") {
      ok = updateExtraListingFromSubmission(saveTarget.saveId, managerUserId, next);
    } else {
      ok = updateRequestChangeProperty(saveTarget.saveId, managerUserId, next);
    }
    if (!ok) {
      showToast("Could not save application questions.");
      return;
    }
    showToast("Application questions saved.");
    setEditing(false);
    onUpdated();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card [html[data-theme=dark]_&]:portal-surface-muted">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Application questions</p>
          <span className="portal-badge-info rounded-full px-2 py-0.5 text-[10px] font-semibold">Applicants</span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-full px-3 text-xs"
          data-attr="application-questions-edit"
          onClick={() => (editing ? setEditing(false) : startEdit())}
        >
          {editing ? "Cancel" : "Edit"}
        </Button>
      </div>

      {editing ? (
        <div className="space-y-4 px-4 py-4">
          <p className="text-xs leading-relaxed text-muted">
            Applicants answer these on the “Additional details” step of the rental application. Answers appear in the
            application review and PDF.
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted">No questions yet — add your first one below.</p>
          ) : null}
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className={`space-y-3 rounded-xl border p-3 ${rowErrors[row.id] ? "border-red-300 ring-2 ring-red-100" : "border-border bg-accent/20"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Question {idx + 1}</p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 rounded-full px-2 text-xs"
                    disabled={idx === 0}
                    title="Move up"
                    onClick={() => moveRow(row.id, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 rounded-full px-2 text-xs"
                    disabled={idx === rows.length - 1}
                    title="Move down"
                    onClick={() => moveRow(row.id, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 rounded-full px-2 text-xs border-rose-200 text-rose-800 portal-danger-outline"
                    title="Remove question"
                    onClick={() => removeRow(row.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Question</p>
                <Input
                  value={row.label}
                  onChange={(e) => patchRow(row.id, { label: e.target.value })}
                  placeholder="e.g. Do you smoke?"
                  className="mt-1"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Answer type</p>
                  <Select
                    value={row.type}
                    onChange={(e) => patchRow(row.id, { type: e.target.value as ManagerCustomApplicationFieldType })}
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
                    checked={row.required}
                    onChange={(e) => patchRow(row.id, { required: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-foreground">Required</span>
                </label>
              </div>
              {row.type === "select" ? (
                <div>
                  <p className="text-sm font-medium text-foreground">Dropdown options</p>
                  <Input
                    value={row.optionsText}
                    onChange={(e) => patchRow(row.id, { optionsText: e.target.value })}
                    placeholder="Comma-separated, e.g. Yes, No, Occasionally"
                    className="mt-1"
                  />
                </div>
              ) : null}
              {rowErrors[row.id] ? <p className="text-sm text-red-600">{rowErrors[row.id]}</p> : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={addRow}>
              + Add question
            </Button>
            <Button
              type="button"
              variant="primary"
              className="rounded-full"
              data-attr="application-questions-save"
              onClick={save}
            >
              Save questions
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {fields.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">
              No custom questions yet — click Edit to ask applicants your own questions during the rental application.
            </p>
          ) : (
            fields.map((field, idx) => (
              <div key={field.id} className="flex gap-4 border-t border-border px-4 py-3 first:border-t-0">
                <p className="w-6 shrink-0 pt-0.5 text-xs font-semibold text-muted">{idx + 1}.</p>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{field.label}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {typeLabel(field.type)}
                    {field.required ? " · Required" : " · Optional"}
                    {field.type === "select" && field.options.length > 0 ? ` · ${field.options.join(" / ")}` : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
