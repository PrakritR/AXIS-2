"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/hooks/use-is-client";

export function Modal({
  open,
  title,
  onClose,
  children,
  panelClassName,
  stackClassName,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Override default panel width (e.g. wide onboarding / payouts). */
  panelClassName?: string;
  /** Override z-index stacking for nested modals (e.g. inside listing form overlay). */
  stackClassName?: string;
}) {
  const isClient = useIsClient();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !isClient) return null;

  return createPortal(
    <div className={stackClassName ?? "fixed inset-0 z-[70] overflow-y-auto"}>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[71] flex min-h-screen items-center justify-center px-2 py-4 sm:px-4 sm:py-6">
        <div
          className={
            panelClassName ??
            "relative w-full max-w-lg overflow-hidden rounded-2xl glass-card p-5 sm:p-6"
          }
        >
          <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
            <h3 className="min-w-0 text-lg font-semibold text-foreground">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold text-muted hover:bg-foreground/5"
            >
              Close
            </button>
          </div>
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto pt-4 sm:max-h-[calc(100vh-9rem)]">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
