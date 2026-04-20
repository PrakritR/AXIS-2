"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

/** Inline compose UI when admin/manager chooses “Request edit” on a listing. */
export function PropertyRequestEditForm({
  onCancel,
  onSend,
  recipientHint = "manager or owner who submitted this listing",
}: {
  onCancel: () => void;
  onSend: (note: string) => void;
  recipientHint?: string;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/60 p-4">
      <div>
        <label htmlFor="property-request-edit-note" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          Message to {recipientHint}
        </label>
        <Textarea
          id="property-request-edit-note"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Describe what should change (copy, pricing, photos, amenities…)"
          className="mt-2 min-h-[6.5rem] rounded-xl border-slate-200 bg-white text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="rounded-full" onClick={() => onSend(note)}>
          Send edit request
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
