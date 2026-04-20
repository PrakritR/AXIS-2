"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { contactsForPortal, type InboxScopedContact } from "@/data/inbox-scoped-directory";

export type ScopedInboxSendPayload =
  | { kind: "admin"; subject: string; body: string; senderName: string; senderEmail: string }
  | { kind: "peer"; subject: string; body: string; toLabel: string; toEmailLine: string };

type RecipientMode =
  | "axis-admin"
  | "broadcast-managers"
  | "broadcast-owners"
  | "broadcast-residents"
  | "pick-managers"
  | "pick-owners"
  | "pick-residents";

function modesForPortal(portal: "resident" | "manager" | "owner"): { value: RecipientMode; label: string }[] {
  const admin = { value: "axis-admin" as const, label: "Axis admin team" };
  if (portal === "resident") {
    return [
      admin,
      { value: "broadcast-managers", label: "All my managers" },
      { value: "broadcast-owners", label: "All my owners" },
      { value: "pick-managers", label: "Choose managers…" },
      { value: "pick-owners", label: "Choose owners…" },
    ];
  }
  if (portal === "manager") {
    return [
      admin,
      { value: "broadcast-residents", label: "All my residents" },
      { value: "broadcast-owners", label: "All my owners" },
      { value: "pick-residents", label: "Choose residents…" },
      { value: "pick-owners", label: "Choose owners…" },
    ];
  }
  return [
    admin,
    { value: "broadcast-managers", label: "All my managers" },
    { value: "broadcast-residents", label: "All my residents" },
    { value: "pick-managers", label: "Choose managers…" },
    { value: "pick-residents", label: "Choose residents…" },
  ];
}

function pickRole(mode: RecipientMode): "manager" | "owner" | "resident" | null {
  if (mode === "pick-managers" || mode === "broadcast-managers") return "manager";
  if (mode === "pick-owners" || mode === "broadcast-owners") return "owner";
  if (mode === "pick-residents" || mode === "broadcast-residents") return "resident";
  return null;
}

function isPick(mode: RecipientMode): boolean {
  return mode.startsWith("pick-");
}

function isBroadcast(mode: RecipientMode): boolean {
  return mode.startsWith("broadcast-");
}

export function ScopedInboxComposeModal({
  open,
  onClose,
  onSend,
  portal,
  title = "New message",
  senderName = "Portal user",
  senderEmail = "portal-user@example.com",
}: {
  open: boolean;
  onClose: () => void;
  onSend: (payload: ScopedInboxSendPayload) => void;
  portal: "resident" | "manager" | "owner";
  title?: string;
  /** Shown on messages to the admin inbox */
  senderName?: string;
  senderEmail?: string;
}) {
  const { showToast } = useAppUi();
  const modeOptions = useMemo(() => modesForPortal(portal), [portal]);
  const [mode, setMode] = useState<RecipientMode>(() => modeOptions[0]!.value);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const contacts = useMemo(() => contactsForPortal(portal), [portal]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setMode(modeOptions[0]!.value);
      setSelectedIds(new Set());
      setSubject("");
      setBody("");
    });
  }, [open, modeOptions]);

  const pickList = useMemo(() => {
    if (!isPick(mode)) return [] as InboxScopedContact[];
    const r = pickRole(mode);
    if (!r) return [];
    return contacts.filter((c) => c.role === r);
  }, [contacts, mode]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInPickList = () => {
    setSelectedIds(new Set(pickList.map((c) => c.id)));
  };

  const submit = () => {
    const s = subject.trim();
    const b = body.trim();
    if (!s || !b) {
      showToast("Add a subject and message.");
      return;
    }

    if (mode === "axis-admin") {
      onSend({ kind: "admin", subject: s, body: b, senderName, senderEmail });
      return;
    }

    if (isBroadcast(mode)) {
      const r = pickRole(mode);
      const label = r === "manager" ? "All my managers" : r === "owner" ? "All my owners" : "All my residents";
      const stub =
        r === "manager" ? "broadcast-managers@portal.demo" : r === "owner" ? "broadcast-owners@portal.demo" : "broadcast-residents@portal.demo";
      onSend({ kind: "peer", subject: s, body: b, toLabel: label, toEmailLine: stub });
      return;
    }

    const picked = pickList.filter((c) => selectedIds.has(c.id));
    if (picked.length === 0) {
      showToast("Select at least one recipient.");
      return;
    }
    const toLabel = picked.map((p) => p.name).join(", ");
    const toEmailLine = picked.map((p) => p.email).join("; ");
    onSend({ kind: "peer", subject: s, body: b, toLabel, toEmailLine });
  };

  const pickHeading =
    mode === "pick-managers"
      ? "Which managers"
      : mode === "pick-owners"
        ? "Which owners"
        : mode === "pick-residents"
          ? "Which residents"
          : null;

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="scoped-compose-mode">
            Send to
          </label>
          <Select
            id="scoped-compose-mode"
            className="mt-1.5"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as RecipientMode);
              setSelectedIds(new Set());
            }}
            aria-label="Recipient type"
          >
            {modeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {isPick(mode) && pickList.length > 0 ? (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{pickHeading}</label>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => selectAllInPickList()}
              >
                Select all
              </button>
            </div>
            <ul className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
              {pickList.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-2 py-2 text-sm ring-1 ring-slate-200/80 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleId(c.id)}
                    />
                    <span>
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{c.email}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isPick(mode) && pickList.length === 0 ? (
          <p className="text-sm text-slate-500">No contacts available for this category (demo).</p>
        ) : null}

        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="scoped-compose-subject">
            Subject
          </label>
          <Input id="scoped-compose-subject" className="mt-1.5" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="scoped-compose-body">
            Message
          </label>
          <Textarea
            id="scoped-compose-body"
            className="mt-1.5 min-h-[140px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" className="rounded-full" onClick={submit}>
            Send
          </Button>
        </div>
      </div>
    </Modal>
  );
}
