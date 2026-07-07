"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ManagerApplicationQuestionsEditorModal } from "@/components/portal/manager-application-questions-editor-modal";
import type { ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";
import { resolveManagerListingSubmissionForPropertyId } from "@/lib/manager-property-save-target";

/** Pick a property, then open the shared application-question editor for that listing. */
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
  const [propertyId, setPropertyId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setPropertyId("");
      setEditorOpen(false);
    }
  }, [open]);

  const resolved = useMemo(() => {
    if (!editorOpen || !managerUserId || !propertyId.trim()) return null;
    return resolveManagerListingSubmissionForPropertyId(managerUserId, propertyId);
  }, [editorOpen, managerUserId, propertyId]);

  const propertyLabel = propertyOptions.find((o) => o.id === propertyId)?.label ?? "Property";

  const closeAll = () => {
    setEditorOpen(false);
    setPropertyId("");
    onClose();
  };

  const openEditor = () => {
    if (!propertyId.trim()) {
      showToast("Select a property first.");
      return;
    }
    if (!managerUserId) {
      showToast("Sign in to edit applications.");
      return;
    }
    const hit = resolveManagerListingSubmissionForPropertyId(managerUserId, propertyId);
    if (!hit) {
      showToast("Could not load that property's application.");
      return;
    }
    setEditorOpen(true);
  };

  return (
    <>
      <Modal open={open && !editorOpen} title="Edit application" onClose={closeAll} panelClassName="max-w-md">
        <p className="text-sm text-muted">
          Choose which property&apos;s rental application you want to edit. Applicants for that listing will see your
          custom questions.
        </p>
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">Property</p>
          <Select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="mt-1"
            disabled={propertyOptions.length === 0}
          >
            <option value="">{propertyOptions.length === 0 ? "No properties in portfolio" : "Select property"}</option>
            {propertyOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            data-attr="edit-application-continue"
            disabled={!propertyId.trim() || propertyOptions.length === 0}
            onClick={openEditor}
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
          open={editorOpen}
          title={`Application — ${propertyLabel}`}
          sub={resolved.sub}
          saveTarget={resolved.saveTarget}
          managerUserId={managerUserId}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            onSaved();
            closeAll();
          }}
          showToast={showToast}
        />
      ) : null}
    </>
  );
}
