"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { readLeaseTemplateFile } from "@/components/portal/lease-config-form";
import { createPropertyLeaseTemplate } from "@/lib/property-lease-templates";

const fieldLabelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted";

function leaseNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "").trim();
  return base || "Uploaded lease";
}

export function PropertyLeaseUploadModal({
  open,
  onClose,
  onUploaded,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (args: {
    label: string;
    dataUrl: string;
    fileName: string;
  }) => boolean;
  showToast: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("Uploaded lease");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel("Uploaded lease");
    setFileName(null);
    setDataUrl(null);
    setBusy(false);
  }, [open]);

  const close = () => onClose();

  const handleFile = (file: File | null) => {
    if (!file) return;
    readLeaseTemplateFile(
      file,
      (url, name) => {
        setDataUrl(url);
        setFileName(name);
        setLabel(leaseNameFromFileName(name));
      },
      showToast,
      // The picker uploads to the private bucket before it hands back a URL;
      // reuse the existing Save gate so the button waits instead of claiming no
      // file was chosen.
      setBusy,
    );
  };

  const save = () => {
    if (!dataUrl || !fileName) {
      showToast("Choose a lease PDF to upload.");
      return;
    }
    setBusy(true);
    const ok = onUploaded({
      label: label.trim() || leaseNameFromFileName(fileName),
      dataUrl,
      fileName,
    });
    setBusy(false);
    if (!ok) return;
    showToast("Lease uploaded.");
    close();
  };

  return (
    <Modal
      open={open}
      title="Upload lease"
      description="Your PDF becomes the lease document. PropLane adds placement details and e-signatures at signing."
      onClose={close}
      panelClassName="max-w-md"
      footer={
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={busy || !dataUrl}
            onClick={save}
            data-attr="property-lease-upload-save"
          >
            {busy ? "Saving…" : "Save lease"}
          </Button>
        </ModalFooter>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={fieldLabelClass} htmlFor="property-lease-upload-name">
            Lease name
          </label>
          <Input
            id="property-lease-upload-name"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Corporate lease 2026"
            data-attr="property-lease-upload-name"
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Lease file</label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            data-attr="property-lease-upload-input"
            onChange={(e) => {
              handleFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          {fileName && dataUrl ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-3">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{fileName}</p>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </button>
            </div>
          ) : (
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-accent/20 px-4 py-10 text-center transition hover:border-primary/40"
              onClick={() => inputRef.current?.click()}
            >
              <span className="text-sm font-semibold text-foreground">Drop or click to upload</span>
              <span className="text-xs text-muted">PDF only · up to 8 MB</span>
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function buildUploadedLeaseTemplate(args: {
  label: string;
  dataUrl: string;
  fileName: string;
}) {
  return createPropertyLeaseTemplate({
    kind: "custom",
    label: args.label,
    source: "custom_format",
    leaseTemplateDocUrl: args.dataUrl,
    leaseTemplateDocName: args.fileName,
  });
}
