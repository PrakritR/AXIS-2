"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  axisAdminScheduleContact,
  residentsForProperty,
} from "@/lib/manager-inbox-contacts";
import type { InboxScopedContact } from "@/data/inbox-scoped-directory";
import type { ScheduledInboxMessageRecord } from "@/lib/scheduled-inbox-messages";
import {
  ScheduleInboxRecipientPicker,
  type ScheduleRecipientKey,
} from "@/components/portal/schedule-inbox-recipient-picker";

function defaultSendAtLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return defaultSendAtLocal();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultRecipientKey(contacts: InboxScopedContact[]): ScheduleRecipientKey {
  if (contacts.some((c) => c.role === "manager")) {
    const first = contacts.find((c) => c.role === "manager");
    return first ? `id:${first.id}` : "broadcast:management";
  }
  const firstResident = contacts.find((c) => c.role === "resident");
  if (firstResident) return `id:${firstResident.id}`;
  return "admin";
}

async function postScheduledMessage(payload: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/portal/scheduled-inbox-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? "Could not schedule message.");
  }
}

/** Inline compose/edit form for a scheduled inbox message — hosted as an accordion panel, never a modal. */
export function ScheduleInboxComposeForm({
  onClose,
  onSaved,
  contacts,
  editMessage,
  onToggleCancelled,
}: {
  onClose: () => void;
  onSaved: () => void;
  contacts: InboxScopedContact[];
  editMessage?: ScheduledInboxMessageRecord | null;
  onToggleCancelled?: (cancelled: boolean) => void | Promise<void>;
}) {
  const { showToast } = useAppUi();
  const [subject, setSubject] = useState(editMessage?.subject ?? "");
  const [body, setBody] = useState(editMessage?.body ?? "");
  const [sendAtLocal, setSendAtLocal] = useState(
    editMessage ? toLocalInputValue(editMessage.sendAt) : defaultSendAtLocal(),
  );
  const [recipientKey, setRecipientKey] = useState<ScheduleRecipientKey>(() => {
    if (!editMessage) return defaultRecipientKey(contacts);
    if (editMessage.broadcastCategories?.includes("resident")) return "broadcast:resident";
    if (editMessage.broadcastCategories?.includes("management")) return "broadcast:management";
    if (editMessage.recipientUserId) return `id:${editMessage.recipientUserId}`;
    if (editMessage.recipientEmail === axisAdminScheduleContact().email) return "admin";
    const match = contacts.find((c) => c.email.toLowerCase() === editMessage.recipientEmail.toLowerCase());
    return match ? `id:${match.id}` : "admin";
  });
  const [deliverViaEmail, setDeliverViaEmail] = useState(editMessage?.deliverViaEmail ?? true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const subjectTrim = subject.trim();
    const bodyTrim = body.trim();
    if (!subjectTrim || !bodyTrim) {
      showToast("Subject and message are required.");
      return;
    }
    const sendAt = new Date(sendAtLocal);
    if (Number.isNaN(sendAt.getTime())) {
      showToast("Choose a valid send date and time.");
      return;
    }
    if (!editMessage && sendAt.getTime() < Date.now() - 60_000) {
      showToast("Send time must be in the future.");
      return;
    }

    setBusy(true);
    try {
      if (editMessage) {
        const res = await fetch(`/api/portal/scheduled-inbox-messages/${encodeURIComponent(editMessage.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            subject: subjectTrim,
            body: bodyTrim,
            sendAt: sendAt.toISOString(),
            deliverViaEmail,
          }),
        });
        if (!res.ok) {
          const payload = (await res.json()) as { error?: string };
          throw new Error(payload.error ?? "Could not update scheduled message.");
        }
        showToast("Scheduled message updated.");
      } else {
        const base = {
          subject: subjectTrim,
          body: bodyTrim,
          sendAt: sendAt.toISOString(),
          deliverViaEmail,
        };

        if (recipientKey === "admin") {
          const admin = axisAdminScheduleContact();
          await postScheduledMessage({
            ...base,
            recipientEmail: admin.email,
            recipientName: admin.name,
          });
        } else if (recipientKey === "broadcast:management" || recipientKey === "broadcast:resident") {
          await postScheduledMessage({
            ...base,
            broadcastCategories: [recipientKey.replace("broadcast:", "")],
          });
        } else if (recipientKey.startsWith("property:")) {
          const propertyId = recipientKey.slice("property:".length);
          const targets = residentsForProperty(contacts, propertyId);
          if (targets.length === 0) {
            showToast("No residents at that property.");
            return;
          }
          await Promise.all(
            targets.map((contact) =>
              postScheduledMessage({
                ...base,
                recipientEmail: contact.email,
                recipientName: contact.name,
              }),
            ),
          );
        } else if (recipientKey.startsWith("id:")) {
          const contact = contacts.find((c) => c.id === recipientKey.slice(3));
          if (!contact) {
            showToast("Choose a recipient.");
            return;
          }
          await postScheduledMessage({
            ...base,
            recipientEmail: contact.email,
            recipientName: contact.name,
          });
        } else {
          showToast("Choose a recipient.");
          return;
        }
        showToast("Message scheduled.");
      }
      onSaved();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
      <div className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
          {editMessage ? "Edit scheduled message" : "Schedule inbox message"}
        </p>
        <p className="text-sm text-muted">
          Compose a message to deliver later through the portal inbox{deliverViaEmail ? " and email" : ""}.
        </p>

        {!editMessage ? (
          <div>
            <label className="text-xs font-semibold text-muted">Recipient</label>
            <div className="mt-2">
              <ScheduleInboxRecipientPicker
                contacts={contacts}
                value={recipientKey}
                onChange={setRecipientKey}
                disabled={busy}
              />
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-accent/20 px-3 py-2 text-sm text-muted">
            To: <span className="font-medium text-foreground">{editMessage.recipientName}</span>
          </p>
        )}

        <div>
          <label className="text-xs font-semibold text-muted">Send date & time</label>
          <Input
            type="datetime-local"
            className="mt-1"
            value={sendAtLocal}
            onChange={(e) => setSendAtLocal(e.target.value)}
            disabled={busy}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted">Subject</label>
          <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted">Message</label>
          <Textarea className="mt-1 min-h-[160px]" value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={deliverViaEmail} onChange={(e) => setDeliverViaEmail(e.target.checked)} disabled={busy} />
          Also send by email
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" className="rounded-full" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : editMessage ? "Save changes" : "Schedule message"}
          </Button>
          {editMessage && onToggleCancelled && editMessage.status !== "sent" ? (
            editMessage.status === "cancelled" ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={busy}
                onClick={() => void onToggleCancelled(false)}
              >
                Restore send
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="rounded-full text-rose-700"
                disabled={busy}
                onClick={() => void onToggleCancelled(true)}
              >
                Cancel send
              </Button>
            )
          ) : null}
          <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
  );
}
