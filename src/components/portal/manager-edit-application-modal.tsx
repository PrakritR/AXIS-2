"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ManagerApplicationQuestionsEditorModal } from "@/components/portal/manager-application-questions-editor-modal";
import type { ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";
import { resolveManagerListingSubmissionForPropertyId } from "@/lib/manager-property-save-target";

/** Pick one or more properties, then edit application questions in bulk. */
export function ManagerEditApplicationModal({
  open,
  onClose,
  propertyOptions,
  managerUserId,
  onSaved,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  propertyOptions: ManagerPropertyFilterOption[];
  managerUserId: string | null;
  onSaved: () => void;
  showToast: (m: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editingPropertyIds, setEditingPropertyIds] = useState<string[]>([]);

  const allSelected = propertyOptions.length > 0 && selectedIds.size === propertyOptions.length;

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setEditingPropertyIds([]);
    }
  }, [open]);

  const resolved = useMemo(() => {
    const firstId = editingPropertyIds[0]?.trim();
    if (!firstId || !managerUserId) return null;
    return resolveManagerListingSubmissionForPropertyId(managerUserId, firstId);
  }, [editingPropertyIds, managerUserId]);

  const editorTitle = useMemo(() => {
    if (editingPropertyIds.length === 1) {
      const label = propertyOptions.find((o) => o.id === editingPropertyIds[0])?.label ?? "Property";
      return `Edit application · ${label}`;
    }
    if (editingPropertyIds.length > 1) {
      return `Edit application · ${editingPropertyIds.length} properties`;
    }
    return "Edit application";
  }, [editingPropertyIds, propertyOptions]);

  const closeAll = () => {
    setSelectedIds(new Set());
    setEditingPropertyIds([]);
    onClose();
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(propertyOptions.map((o) => o.id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const continueFromSelect = () => {
    if (selectedIds.size === 0) {
      showToast("Select at least one property.");
      return;
    }
    if (!managerUserId) {
      showToast("Sign in to edit applications.");
      return;
    }
    const ids = [...selectedIds];
    const firstHit = resolveManagerListingSubmissionForPropertyId(managerUserId, ids[0]!);
    if (!firstHit) {
      showToast("Could not load application settings for the selected properties.");
      return;
    }
    setEditingPropertyIds(ids);
  };

  const onEditorClose = () => {
    setEditingPropertyIds([]);
  };

  const onEditorSaved = () => {
    onSaved();
    setEditingPropertyIds([]);
    closeAll();
  };

  return (
    <>
      <Modal
        open={open && editingPropertyIds.length === 0}
        title="Edit application settings"
        onClose={closeAll}
        panelClassName="max-w-md"
      >
        <p className="text-sm text-muted">
          Choose which properties&apos; rental applications you want to edit. When you select multiple, the same
          questions apply to all — built-in fields, custom questions, and required/optional settings.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-accent/20 px-3 py-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-primary"
              data-attr="applications-edit-all-properties"
              checked={allSelected}
              disabled={propertyOptions.length === 0}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            <span className="text-sm font-semibold text-foreground">All properties</span>
          </label>

          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
            {propertyOptions.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">No properties in portfolio yet.</p>
            ) : (
              propertyOptions.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/30"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-border text-primary"
                    data-attr={`applications-edit-property-${o.id}`}
                    checked={selectedIds.has(o.id)}
                    onChange={(e) => toggleOne(o.id, e.target.checked)}
                  />
                  <span className="min-w-0 text-sm text-foreground">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            data-attr="applications-edit-continue"
            disabled={selectedIds.size === 0 || propertyOptions.length === 0}
            onClick={continueFromSelect}
          >
            Continue
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={closeAll}>
            Cancel
          </Button>
        </div>
      </Modal>

      {resolved && managerUserId ? (
        <ManagerApplicationQuestionsEditorModal
          open={editingPropertyIds.length > 0}
          title={editorTitle}
          sub={resolved.sub}
          saveTarget={resolved.saveTarget}
          propertyIds={editingPropertyIds.length > 1 ? editingPropertyIds : undefined}
          managerUserId={managerUserId}
          onClose={onEditorClose}
          onSaved={onEditorSaved}
          showToast={showToast}
        />
      ) : null}
    </>
  );
}
