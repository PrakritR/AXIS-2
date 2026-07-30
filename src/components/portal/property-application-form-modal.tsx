"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalFooter } from "@/components/ui/modal";
import {
  PROPERTY_LEASE_TYPE_OPTIONS,
  normalizeLeaseTemplateKind,
  type PropertyLeaseTemplateKind,
} from "@/lib/property-lease-templates";
import {
  createPropertyApplicationTemplate,
  updatePropertyApplicationTemplate,
  type PropertyApplicationTemplate,
} from "@/lib/property-application-templates";

const fieldLabelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted";

function defaultApplicationLabel(kind: PropertyLeaseTemplateKind): string {
  const meta = PROPERTY_LEASE_TYPE_OPTIONS.find((o) => o.id === kind);
  const base = meta?.defaultLabel ?? "Application";
  return base.replace(/\blease\b/i, "application");
}

/**
 * Add or rename a property application template (stay type + label).
 */
export function PropertyApplicationFormModal({
  open,
  mode,
  template,
  templates,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "add" | "edit";
  template?: PropertyApplicationTemplate | null;
  templates: PropertyApplicationTemplate[];
  onClose: () => void;
  onSave: (nextTemplates: PropertyApplicationTemplate[]) => boolean;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<PropertyLeaseTemplateKind>("room-rental");
  const [error, setError] = useState<string | null>(null);

  const typeMeta = useMemo(
    () => PROPERTY_LEASE_TYPE_OPTIONS.find((o) => o.id === kind),
    [kind],
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && template) {
      setLabel(template.label);
      setKind(template.kind);
    } else {
      setLabel("");
      setKind("room-rental");
    }
    setError(null);
  }, [open, mode, template]);

  const submit = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Enter a name for this application.");
      return;
    }
    const normalizedKind = normalizeLeaseTemplateKind(kind);
    let next: PropertyApplicationTemplate[];
    if (mode === "edit" && template) {
      next = updatePropertyApplicationTemplate(templates, template.id, {
        label: trimmed,
        kind: normalizedKind,
      });
    } else {
      next = [
        ...templates,
        createPropertyApplicationTemplate({
          kind: normalizedKind,
          label: trimmed,
        }),
      ];
    }
    if (!onSave(next)) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      title={mode === "edit" ? "Edit application" : "Add application"}
      onClose={onClose}
      panelClassName="max-w-md"
      footer={
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={submit} data-attr="property-application-save">
            {mode === "edit" ? "Save" : "Add application"}
          </Button>
        </ModalFooter>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={fieldLabelClass} htmlFor="property-application-kind">
            Application type
          </label>
          <select
            id="property-application-kind"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            value={kind}
            onChange={(e) => {
              const nextKind = normalizeLeaseTemplateKind(e.target.value);
              setKind(nextKind);
              if (!label.trim() || label === defaultApplicationLabel(kind)) {
                setLabel(defaultApplicationLabel(nextKind));
              }
            }}
            disabled={mode === "edit" && Boolean(template?.listingSeedKey)}
          >
            {PROPERTY_LEASE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          {typeMeta ? <p className="mt-1.5 text-xs text-muted">{typeMeta.description}</p> : null}
        </div>
        <div>
          <label className={fieldLabelClass} htmlFor="property-application-label">
            Display name
          </label>
          <Input
            id="property-application-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={defaultApplicationLabel(kind)}
          />
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
