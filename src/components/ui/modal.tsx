"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

export function Modal({
  open,
  title,
  onClose,
  children,
  panelClassName,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Override default panel width (e.g. wide onboarding / payouts). */
  panelClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={
          panelClassName ??
          "relative z-[71] w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl"
        }
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-muted hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
