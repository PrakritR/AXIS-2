"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * In-app delete confirmation — same Modal shell as account deletion / other
 * portal confirms (not `window.confirm`).
 */
export function ConfirmDeleteModal({
  open,
  title = "Delete",
  description,
  confirmLabel = "Delete",
  busy = false,
  onClose,
  onConfirm,
  dataAttr,
}: {
  open: boolean;
  title?: string;
  description: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  dataAttr?: string;
}) {
  return (
    <Modal
      open={open}
      title={title}
      dense
      panelClassName="max-w-md"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={onConfirm}
            data-attr={dataAttr}
          >
            {busy ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-foreground">{description}</p>
      <p className="mt-2 text-xs text-muted">This cannot be undone.</p>
    </Modal>
  );
}
