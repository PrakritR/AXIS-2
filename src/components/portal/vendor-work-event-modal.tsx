"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatMinuteOfDayLabel, minuteOfDayToTimeInputValue, timeInputValueToMinuteOfDay } from "@/lib/vendor-availability";

export type VendorWorkEventDraft = {
  id?: string;
  specificDate: string;
  startMinute: number;
  endMinute: number;
  title: string;
};

export function VendorWorkEventModal({
  open,
  draft,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  draft: VendorWorkEventDraft | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: VendorWorkEventDraft) => void;
  onDelete?: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [specificDate, setSpecificDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  useEffect(() => {
    if (!open || !draft) return;
    setTitle(draft.title);
    setSpecificDate(draft.specificDate);
    setStartTime(minuteOfDayToTimeInputValue(draft.startMinute));
    setEndTime(minuteOfDayToTimeInputValue(draft.endMinute));
  }, [draft, open]);

  const summary = useMemo(() => {
    const startMinute = timeInputValueToMinuteOfDay(startTime);
    const endMinute = timeInputValueToMinuteOfDay(endTime);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) return null;
    return `${formatMinuteOfDayLabel(startMinute)} – ${formatMinuteOfDayLabel(endMinute)}`;
  }, [endTime, startTime]);

  const handleSave = () => {
    if (!draft) return;
    const startMinute = timeInputValueToMinuteOfDay(startTime);
    const endMinute = timeInputValueToMinuteOfDay(endTime);
    if (!title.trim()) return;
    if (!specificDate) return;
    if (startMinute === null || endMinute === null || endMinute <= startMinute) return;
    onSave({
      id: draft.id,
      specificDate,
      startMinute,
      endMinute,
      title: title.trim(),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={draft?.id ? "Edit work block" : "Add work to calendar"}>
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted">Title</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Off-site repair, supply run"
            className="rounded-xl"
            data-attr="vendor-work-event-title"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted">Date</span>
          <Input
            type="date"
            value={specificDate}
            onChange={(e) => setSpecificDate(e.target.value)}
            className="rounded-xl"
            data-attr="vendor-work-event-date"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted">Start</span>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-xl"
              data-attr="vendor-work-event-start"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted">End</span>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-xl"
              data-attr="vendor-work-event-end"
            />
          </label>
        </div>
        {summary ? <p className="text-sm text-muted">{summary}</p> : <p className="text-sm text-rose-600">End time must be after start time.</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          {draft?.id && onDelete ? (
            <Button
              type="button"
              variant="outline"
              className="mr-auto rounded-full border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]"
              disabled={saving}
              data-attr="vendor-work-event-delete"
              onClick={() => onDelete(draft.id!)}
            >
              Delete
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={saving || !title.trim() || !summary}
            data-attr="vendor-work-event-save"
            onClick={handleSave}
          >
            {saving ? "Saving…" : draft?.id ? "Save changes" : "Add work"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
