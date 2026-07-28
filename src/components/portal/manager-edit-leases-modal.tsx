"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ManagerLeaseEditorModal } from "@/components/portal/manager-lease-editor-modal";
import type { ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";
import { resolveManagerListingSubmissionForPropertyId } from "@/lib/manager-property-save-target";

/** Pick one property, then edit its lease settings. */
export function ManagerEditLeasesModal({
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setEditingPropertyId(null);
    }
  }, [open]);

  const resolved = useMemo(() => {
    const id = editingPropertyId?.trim();
    if (!id || !managerUserId) return null;
    return resolveManagerListingSubmissionForPropertyId(managerUserId, id);
  }, [editingPropertyId, managerUserId]);

  const editorTitle = useMemo(() => {
    if (!editingPropertyId) return "Edit lease";
    const label = propertyOptions.find((o) => o.id === editingPropertyId)?.label ?? "Property";
    return `Edit lease · ${label}`;
  }, [editingPropertyId, propertyOptions]);

  const closeAll = () => {
    setSelectedId(null);
    setEditingPropertyId(null);
    onClose();
  };

  const continueFromSelect = () => {
    if (!selectedId) {
      showToast("Select a property.");
      return;
    }
    if (!managerUserId) {
      showToast("Sign in to edit lease settings.");
      return;
    }
    const hit = resolveManagerListingSubmissionForPropertyId(managerUserId, selectedId);
    if (!hit) {
      showToast("Could not load lease settings for that property.");
      return;
    }
    setEditingPropertyId(selectedId);
  };

  const onEditorClose = () => {
    setEditingPropertyId(null);
  };

  const onEditorSaved = () => {
    onSaved();
    setEditingPropertyId(null);
    closeAll();
  };

  return (
    <>
      <Modal
        open={open && !editingPropertyId}
        title="Edit lease settings"
        description="Choose which property's lease document you want to edit."
        onClose={closeAll}
        panelClassName="max-w-md"
        footer={
          <ModalFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeAll}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              className="rounded-full"
              data-attr="leases-edit-continue"
              disabled={!selectedId || propertyOptions.length === 0}
              onClick={continueFromSelect}
            >
              Continue
            </Button>
          </ModalFooter>
        }
      >
        <div
          className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2"
          role="radiogroup"
          aria-label="Property"
        >
          {propertyOptions.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">No properties in portfolio yet.</p>
          ) : (
            propertyOptions.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/30"
              >
                <input
                  type="radio"
                  name="leases-edit-property"
                  className="h-4 w-4 shrink-0 border-border text-primary"
                  data-attr={`leases-edit-property-${o.id}`}
                  checked={selectedId === o.id}
                  onChange={() => setSelectedId(o.id)}
                />
                <span className="min-w-0 text-sm text-foreground">{o.label}</span>
              </label>
            ))
          )}
        </div>
      </Modal>

      {resolved && managerUserId && editingPropertyId ? (
        <ManagerLeaseEditorModal
          open
          title={editorTitle}
          sub={resolved.sub}
          saveTarget={resolved.saveTarget}
          propertyId={editingPropertyId}
          propertyLabel={propertyOptions.find((o) => o.id === editingPropertyId)?.label}
          propertyHint={{
            buildingName: propertyOptions.find((o) => o.id === editingPropertyId)?.label,
          }}
          managerUserId={managerUserId}
          onClose={onEditorClose}
          onSaved={onEditorSaved}
          showToast={showToast}
        />
      ) : null}
    </>
  );
}
