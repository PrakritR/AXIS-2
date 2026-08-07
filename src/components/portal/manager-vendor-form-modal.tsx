"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal, ModalFooter, MODAL_FIELD_LABEL_CLASS, PORTAL_MODAL_FORM_FIELD_CLASS, PORTAL_MODAL_FORM_FULL_ROW_CLASS, PORTAL_MODAL_FORM_GRID_CLASS } from "@/components/ui/modal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  deleteManagerVendorRow,
  makeVendorId,
  persistManagerVendorToServer,
  setManagerVendorPriority,
  upsertManagerVendor,
  type ManagerVendorRow,
} from "@/lib/manager-vendors-storage";
import { VENDOR_TRADE_OPTIONS } from "@/lib/work-order-taxonomy";

export type ManagerVendorFormDraft = {
  name: string;
  trade: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
  sharedWithManagers: boolean;
  vendorPriority: "" | "primary" | "secondary";
};

export const EMPTY_MANAGER_VENDOR_FORM_DRAFT: ManagerVendorFormDraft = {
  name: "",
  trade: VENDOR_TRADE_OPTIONS[0]!,
  phone: "",
  email: "",
  notes: "",
  active: true,
  sharedWithManagers: false,
  vendorPriority: "",
};

function draftFromVendor(row: ManagerVendorRow): ManagerVendorFormDraft {
  return {
    name: row.name,
    trade: row.trade || VENDOR_TRADE_OPTIONS[0]!,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    active: row.active !== false,
    sharedWithManagers: row.sharedWithManagers === true,
    vendorPriority: row.vendorPriority ?? "",
  };
}

export function ManagerVendorFormFields({
  draft,
  onPatch,
  idPrefix = "vendor",
}: {
  draft: ManagerVendorFormDraft;
  onPatch: (patch: Partial<ManagerVendorFormDraft>) => void;
  idPrefix?: string;
}) {
  return (
    <div className={PORTAL_MODAL_FORM_GRID_CLASS}>
      <div className={PORTAL_MODAL_FORM_FIELD_CLASS}>
        <label className={MODAL_FIELD_LABEL_CLASS} htmlFor={`${idPrefix}-name`}>
          Vendor name
        </label>
        <Input
          id={`${idPrefix}-name`}
          value={draft.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="e.g. Apex Plumbing"
          autoFocus
        />
      </div>
      <div className={PORTAL_MODAL_FORM_FIELD_CLASS}>
        <label className={MODAL_FIELD_LABEL_CLASS} htmlFor={`${idPrefix}-trade`}>
          Trade
        </label>
        <Select
          id={`${idPrefix}-trade`}
          value={draft.trade}
          onChange={(e) => onPatch({ trade: e.target.value })}
        >
          {VENDOR_TRADE_OPTIONS.map((trade) => (
            <option key={trade} value={trade}>
              {trade}
            </option>
          ))}
        </Select>
      </div>
      <div className={PORTAL_MODAL_FORM_FIELD_CLASS}>
        <label className={MODAL_FIELD_LABEL_CLASS} htmlFor={`${idPrefix}-phone`}>
          Phone
        </label>
        <Input
          id={`${idPrefix}-phone`}
          type="tel"
          value={draft.phone}
          onChange={(e) => onPatch({ phone: e.target.value })}
          placeholder="(206) 555-0100"
          autoComplete="tel"
        />
      </div>
      <div className={PORTAL_MODAL_FORM_FIELD_CLASS}>
        <label className={MODAL_FIELD_LABEL_CLASS} htmlFor={`${idPrefix}-email`}>
          Email
        </label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={draft.email}
          onChange={(e) => onPatch({ email: e.target.value })}
          placeholder="vendor@company.com"
          autoComplete="email"
        />
      </div>
      <div className={`${PORTAL_MODAL_FORM_FIELD_CLASS} ${PORTAL_MODAL_FORM_FULL_ROW_CLASS}`}>
        <label className={MODAL_FIELD_LABEL_CLASS} htmlFor={`${idPrefix}-notes`}>
          Notes <span className="font-normal normal-case tracking-normal text-muted">(optional)</span>
        </label>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={3}
          className="resize-y"
          value={draft.notes}
          onChange={(e) => onPatch({ notes: e.target.value })}
          placeholder="License, service area, after-hours contact, billing notes…"
        />
      </div>
      <div className={`${PORTAL_MODAL_FORM_FULL_ROW_CLASS} space-y-3 rounded-xl border border-border bg-accent/15 p-3`}>
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border text-primary"
            checked={draft.active}
            onChange={(e) => onPatch({ active: e.target.checked })}
          />
          <span className="text-sm font-medium text-foreground">Active — available for work orders and payments</span>
        </label>
        <fieldset className="space-y-2">
          <legend className={MODAL_FIELD_LABEL_CLASS}>Priority for this trade</legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={`${idPrefix}-priority`}
              checked={draft.vendorPriority === "primary"}
              onChange={() => onPatch({ vendorPriority: "primary" })}
            />
            Primary — preferred when assigning this trade
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={`${idPrefix}-priority`}
              checked={draft.vendorPriority === "secondary"}
              onChange={() => onPatch({ vendorPriority: "secondary" })}
            />
            Secondary backup
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={`${idPrefix}-priority`}
              checked={draft.vendorPriority === ""}
              onChange={() => onPatch({ vendorPriority: "" })}
            />
            Standard — no priority
          </label>
        </fieldset>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border text-primary"
            checked={draft.sharedWithManagers}
            onChange={(e) => onPatch({ sharedWithManagers: e.target.checked })}
          />
          <span className="text-sm leading-6 text-foreground">
            Share on PropLane
            <span className="mt-0.5 block text-xs font-normal text-muted">
              Other managers can discover and assign this vendor. You can turn this off anytime.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

export function ManagerVendorFormModal({
  open,
  mode,
  vendor,
  initialTrade,
  onClose,
  onSaved,
  onDeleted,
  onAdded,
  showToast,
  onBrowseCatalog,
}: {
  open: boolean;
  mode: "add" | "edit";
  vendor?: ManagerVendorRow | null;
  initialTrade?: string;
  onClose: () => void;
  onSaved?: () => void;
  onDeleted?: () => void;
  /** After a successful add — parent can open onboarding compose. */
  onAdded?: (vendor: { id: string; name: string; email: string }) => void | Promise<void>;
  showToast: (message: string) => void;
  /** Opens vendor settings (catalog / defaults) without losing context. */
  onBrowseCatalog?: () => void;
}) {
  const { userId } = useManagerUserId();
  const [draft, setDraft] = useState<ManagerVendorFormDraft>(EMPTY_MANAGER_VENDOR_FORM_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && vendor) {
      setDraft(draftFromVendor(vendor));
    } else {
      setDraft({
        ...EMPTY_MANAGER_VENDOR_FORM_DRAFT,
        trade: initialTrade?.trim() || VENDOR_TRADE_OPTIONS[0]!,
      });
    }
    setError(null);
    setSaving(false);
  }, [open, mode, vendor, initialTrade]);

  const patch = (next: Partial<ManagerVendorFormDraft>) => setDraft((prev) => ({ ...prev, ...next }));

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      setError("Vendor name is required.");
      return;
    }
    if (!userId) {
      showToast("Sign in to save vendors.");
      return;
    }
    setSaving(true);
    setError(null);
    const id = mode === "edit" && vendor ? vendor.id : makeVendorId();
    const now = new Date().toISOString();
    const existing = mode === "edit" ? vendor : null;
    const row: ManagerVendorRow = {
      id,
      managerUserId: userId,
      name,
      trade: draft.trade.trim() || VENDOR_TRADE_OPTIONS[0]!,
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      notes: draft.notes.trim(),
      active: draft.active,
      sharedWithManagers: draft.sharedWithManagers,
      vendorPriority: draft.vendorPriority || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    upsertManagerVendor(row, userId);
    if (draft.vendorPriority === "primary") {
      setManagerVendorPriority(id, "primary", userId);
    }
    const persisted = await persistManagerVendorToServer(row);
    setSaving(false);
    if (!persisted) {
      showToast("Vendor saved locally; syncing to the server failed. Try again before sending the invite.");
    } else {
      showToast(mode === "edit" ? "Vendor updated." : "Vendor added.");
    }
    onClose();
    if (mode === "add") {
      await onAdded?.({ id, name, email: row.email });
    } else {
      onSaved?.();
    }
  };

  const remove = () => {
    if (mode !== "edit" || !vendor) return;
    if (!window.confirm(`Remove ${vendor.name} from your vendors? This cannot be undone.`)) return;
    if (!deleteManagerVendorRow(vendor.id, userId)) {
      showToast("Could not remove vendor.");
      return;
    }
    showToast("Vendor removed.");
    onClose();
    onDeleted?.();
  };

  const title = mode === "edit" ? "Edit vendor" : "Add vendor";

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      panelClassName="max-w-lg"
      dense
      footer={
        <ModalFooter className="w-full">
          {mode === "edit" && vendor ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-red-200 text-red-700 hover:bg-red-50"
              onClick={remove}
              data-attr="vendor-form-delete"
            >
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            variant="primary"
            className="ml-auto rounded-full"
            disabled={saving}
            onClick={save}
            data-attr="vendor-form-save"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </ModalFooter>
      }
    >
      <div className="space-y-4">
        {onBrowseCatalog ? (
          <p className="text-xs text-muted">
            Prefer a curated vendor?{" "}
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              data-attr="vendor-form-browse-catalog"
              onClick={() => {
                onClose();
                onBrowseCatalog();
              }}
            >
              Browse PropLane catalog
            </button>
          </p>
        ) : null}
        <ManagerVendorFormFields draft={draft} onPatch={patch} />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
