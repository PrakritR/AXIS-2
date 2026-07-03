"use client";

import { useRef, useState } from "react";
import { track } from "@/lib/analytics/track-client";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal, MODAL_FIELD_LABEL_CLASS } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { submitBugFeedbackReport, type BugFeedbackReporterRole } from "@/lib/portal-bug-feedback";
import { BUG_FEEDBACK_MAX_ATTACHMENTS, uploadBugFeedbackImages } from "@/lib/bug-feedback-attachments";

export function PortalFeedbackSubmitModal({
  open,
  onClose,
  reporterRole,
  reporterUserId,
  reporterEmail,
  reporterName,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  reporterRole: BugFeedbackReporterRole;
  reporterUserId: string | null;
  reporterEmail: string;
  reporterName: string;
  onSubmitted: () => void | Promise<void>;
}) {
  const { showToast } = useAppUi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (busy) return;
    resetForm();
    onClose();
  };

  const addAttachments = (picked: File[]) => {
    if (picked.length === 0) return;
    setAttachments((prev) => {
      const room = BUG_FEEDBACK_MAX_ATTACHMENTS - prev.length;
      if (room <= 0) {
        showToast(`You can attach up to ${BUG_FEEDBACK_MAX_ATTACHMENTS} images.`);
        return prev;
      }
      const next = [...prev, ...picked.slice(0, room)];
      if (picked.length > room) {
        showToast(`Only ${BUG_FEEDBACK_MAX_ATTACHMENTS} images allowed. Extra files were skipped.`);
      }
      return next;
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const userId = reporterUserId;
    const email = reporterEmail.trim();
    if (!userId || !email.includes("@")) {
      showToast("Sign in to submit feedback.");
      return;
    }
    if (!title.trim()) {
      showToast("Add a short title.");
      return;
    }
    if (!description.trim()) {
      showToast("Describe your feedback.");
      return;
    }
    setBusy(true);
    try {
      const attachmentUrls = attachments.length > 0 ? await uploadBugFeedbackImages(attachments) : undefined;
      await submitBugFeedbackReport({
        type: "feedback",
        reporterUserId: userId,
        reporterName: reporterName.trim() || email,
        reporterEmail: email,
        reporterRole,
        title,
        description,
        attachmentUrls,
      });
      track("feedback_submitted", { role: reporterRole });
      resetForm();
      await onSubmitted();
      onClose();
      showToast("Thanks for your feedback!");
    } catch {
      showToast("Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const atAttachmentLimit = attachments.length >= BUG_FEEDBACK_MAX_ATTACHMENTS;

  return (
    <Modal open={open} title="Add feedback" onClose={handleClose} panelClassName="max-w-lg">
      <p className="mb-4 text-sm text-muted">
        Share ideas, report issues, or tell us what would make Axis better for you.
      </p>
      <div className="space-y-4">
        <div>
          <label className={MODAL_FIELD_LABEL_CLASS} htmlFor="feedback-title">
            Title
          </label>
          <Input
            id="feedback-title"
            className="mt-1.5"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Easier way to duplicate a room"
          />
        </div>
        <div>
          <label className={MODAL_FIELD_LABEL_CLASS} htmlFor="feedback-description">
            Your feedback
          </label>
          <Textarea
            id="feedback-description"
            className="mt-1.5 min-h-[120px]"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What would help you or your residents? Include steps if something is broken."
          />
        </div>
        <div>
          <label className={MODAL_FIELD_LABEL_CLASS} htmlFor="feedback-attachments">
            Screenshots (optional, up to {BUG_FEEDBACK_MAX_ATTACHMENTS})
          </label>
          <input
            id="feedback-attachments"
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            disabled={atAttachmentLimit || busy}
            className="mt-1.5 block w-full text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-accent/50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-foreground disabled:opacity-50"
            onChange={(e) => {
              addAttachments(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          {attachments.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((file, index) => (
                <span
                  key={`${file.name}-${file.lastModified}`}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/30 py-0.5 pl-2 pr-1 text-[10px] text-muted"
                >
                  {file.name}
                  <button
                    type="button"
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-muted hover:bg-accent/50 hover:text-foreground"
                    onClick={() => removeAttachment(index)}
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <p className="mt-1 text-[10px] text-muted">
            {attachments.length}/{BUG_FEEDBACK_MAX_ATTACHMENTS} images selected
          </p>
        </div>
        <div className="flex flex-wrap justify-start gap-2 pt-2">
          <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" className="rounded-full" disabled={busy} onClick={() => void handleSubmit()}>
            {busy ? "Sending…" : "Send feedback"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
