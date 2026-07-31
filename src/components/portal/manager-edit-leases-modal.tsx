"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ManagerPropertyLeasePanel } from "@/components/portal/manager-property-lease-panel";
import type { ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";
import { resolveManagerListingSubmissionForPropertyId } from "@/lib/manager-property-save-target";
import { syncPropertyLeaseTemplatesFromListing } from "@/lib/property-lease-template-sync";

/** Pick a property, then manage every lease template on that listing. */
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

  const syncedSub = resolved ? syncPropertyLeaseTemplatesFromListing(resolved.sub) : null;

  return (
    <>
      <Modal
        open={open && !editingPropertyId}
        title="Edit lease settings"
        description="Choose a property to view, add, or edit its lease templates."
        onClose={closeAll}
        panelClassName="max-w-md"
        footer={
          <ModalFooter>
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

      {resolved && managerUserId && syncedSub && editingPropertyId ? (
        <Modal
          open
          title={editorTitle}
          description="Add a lease or edit an existing template. Open a lease to set document source, clauses, PDF upload, and the visual editor."
          onClose={onEditorClose}
          panelClassName="max-w-3xl"
        >
          <ManagerPropertyLeasePanel
            sub={syncedSub}
            saveTarget={resolved.saveTarget}
            managerUserId={managerUserId}
            propertyHint={{ buildingName: propertyOptions.find((o) => o.id === editingPropertyId)?.label }}
            propertyId={editingPropertyId}
            propertyLabel={propertyOptions.find((o) => o.id === editingPropertyId)?.label}
            onUpdated={onSaved}
            showToast={showToast}
          />
        </Modal>
      ) : null}
    </>
  );
}
