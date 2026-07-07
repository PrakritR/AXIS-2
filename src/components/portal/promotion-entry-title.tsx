"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Inline-renamable label for a flyer or text entry header. Double-click to edit;
 * blur or Enter saves, Escape cancels.
 */
export function PromotionEntryEditableTitle({
  value,
  fallback,
  onSave,
  className,
  inputClassName,
}: {
  value: string;
  fallback: string;
  onSave: (title: string) => void;
  className?: string;
  inputClassName?: string;
}) {
  const display = value.trim() || fallback;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(display);

  useEffect(() => {
    setDraft(value.trim() || fallback);
    setEditing(false);
  }, [value, fallback]);

  function commit() {
    setEditing(false);
    const next = draft.trim() || fallback;
    if (next !== display) onSave(next);
  }

  if (editing) {
    return (
      <input
        type="text"
        className={cn(
          "min-w-0 max-w-[12rem] rounded-md border border-border bg-card px-1.5 py-0.5 text-xs font-bold uppercase tracking-[0.12em] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10",
          inputClassName,
        )}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(display);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        aria-label="Entry name"
        autoFocus
      />
    );
  }

  return (
    <span
      className={cn("min-w-0 truncate", className)}
      title="Double-click to rename"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(display);
        setEditing(true);
      }}
    >
      {display}
    </span>
  );
}
