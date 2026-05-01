"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  broadcastStubForCategory,
  categoryForContactRole,
  contactsForPortal,
  PRIMARY_AXIS_ADMIN_LABEL,
  rolesForRecipientCategory,
  type InboxRecipientCategory,
  type InboxScopedContact,
} from "@/data/inbox-scoped-directory";

export type ScopedInboxSendPayload = {
  subject: string;
  body: string;
  senderName: string;
  senderEmail: string;
  toLabel: string;
  toEmailLine: string;
  includesAxisAdmin: boolean;
  includesDirectoryRecipients: boolean;
};

type Chip =
  | { key: string; kind: "broadcast"; category: InboxRecipientCategory }
  | { key: string; kind: "contact"; contact: InboxScopedContact };

function categoryHint(portal: "resident" | "manager" | "owner", category: InboxRecipientCategory): string {
  if (category === "admin") return "Messages to Axis Housing operations.";
  if (portal === "manager") {
    if (category === "management") return "Property owners on your listings.";
    return "Tenants & approved residents.";
  }
  if (portal === "resident") {
    if (category === "management") return "Property managers and owners.";
    return "Household / co-tenants.";
  }
  if (category === "management") return "Property managers and staff.";
  return "Residents at your properties.";
}

function allLabelForCategory(category: InboxRecipientCategory): string {
  if (category === "admin") return "All admins";
  if (category === "management") return "All management";
  return "All residents";
}

const CATEGORY_ORDER: InboxRecipientCategory[] = ["admin", "management", "resident"];

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
  senderName?: string;
  senderEmail?: string;
}) {
  const { showToast } = useAppUi();
  const contacts = useMemo(() => contactsForPortal(portal), [portal]);
  const [broadcastCats, setBroadcastCats] = useState<Set<InboxRecipientCategory>>(new Set());
  const [contactIds, setContactIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setBroadcastCats(new Set());
      setContactIds(new Set());
      setSubject("");
      setBody("");
    });
  }, [open]);

  const contactsByCategory = useMemo(() => {
    const map: Record<InboxRecipientCategory, InboxScopedContact[]> = {
      admin: [],
      management: [],
      resident: [],
    };
    for (const c of contacts) {
      const cat = categoryForContactRole(portal, c.role);
      map[cat].push(c);
    }
    for (const k of Object.keys(map) as InboxRecipientCategory[]) {
      map[k].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }
    return map;
  }, [contacts, portal]);

  const toggleBroadcast = (category: InboxRecipientCategory) => {
    setBroadcastCats((prev) => {
      const next = new Set(prev);
      const wasOn = next.has(category);
      if (wasOn) {
        next.delete(category);
      } else {
        next.add(category);
        const roles = category === "admin" ? [] : rolesForRecipientCategory(portal, category);
        if (roles.length > 0) {
          setContactIds((ids) => {
            const n = new Set(ids);
            for (const c of contacts) {
              if (roles.includes(c.role)) n.delete(c.id);
            }
            return n;
          });
        }
      }
      return next;
    });
  };

  const toggleContact = (contact: InboxScopedContact) => {
    const category = categoryForContactRole(portal, contact.role);
    setContactIds((prev) => {
      const next = new Set(prev);
      const adding = !next.has(contact.id);
      if (adding) {
        next.add(contact.id);
        setBroadcastCats((bc) => {
          const nbc = new Set(bc);
          nbc.delete(category);
          return nbc;
        });
      } else {
        next.delete(contact.id);
      }
      return next;
    });
  };

  const chips = useMemo((): Chip[] => {
    const out: Chip[] = [];
    for (const category of CATEGORY_ORDER) {
      if (broadcastCats.has(category)) {
        out.push({ key: `b:${category}`, kind: "broadcast", category });
      }
    }
    for (const id of [...contactIds].sort()) {
      const c = contacts.find((x) => x.id === id);
      if (c) out.push({ key: `c:${id}`, kind: "contact", contact: c });
    }
    return out;
  }, [broadcastCats, contactIds, contacts]);

  const removeChip = (chip: Chip) => {
    if (chip.kind === "broadcast") {
      setBroadcastCats((prev) => {
        const next = new Set(prev);
        next.delete(chip.category);
        return next;
      });
    } else {
      setContactIds((prev) => {
        const next = new Set(prev);
        next.delete(chip.contact.id);
        return next;
      });
    }
  };

  const submit = () => {
    const s = subject.trim();
    const b = body.trim();
    if (!s || !b) {
      showToast("Add a subject and message.");
      return;
    }
    if (chips.length === 0) {
      showToast("Add at least one recipient in To.");
      return;
    }

    const seen = new Set<string>();
    const parts: { label: string; email: string }[] = [];
    for (const chip of chips) {
      if (chip.kind === "broadcast") {
        const stub = broadcastStubForCategory(chip.category);
        const key = stub.email.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          parts.push(stub);
        }
      } else {
        const key = chip.contact.email.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          parts.push({ label: chip.contact.name, email: chip.contact.email.trim() });
        }
      }
    }

    const toLabel = parts.map((p) => p.label).join(", ");
    const toEmailLine = parts.map((p) => p.email).join("; ");

    const includesAxisAdmin =
      broadcastCats.has("admin") ||
      [...contactIds].some((id) => {
        const c = contacts.find((x) => x.id === id);
        return c?.email.trim().toLowerCase() === broadcastStubForCategory("admin").email.toLowerCase();
      });

    const includesDirectoryRecipients =
      broadcastCats.has("management") ||
      broadcastCats.has("resident") ||
      [...contactIds].some((id) => {
        const c = contacts.find((x) => x.id === id);
        return c && categoryForContactRole(portal, c.role) !== "admin";
      });

    onSend({
      subject: s,
      body: b,
      senderName,
      senderEmail,
      toLabel,
      toEmailLine,
      includesAxisAdmin,
      includesDirectoryRecipients,
    });
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor="scoped-compose-to-chips">
            Send to
          </label>
          <div
            id="scoped-compose-to-chips"
            className="mt-1.5 flex min-h-[48px] flex-wrap gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            {chips.length === 0 ? (
              <span className="select-none px-1 py-1 text-sm text-slate-400">Use the sections below to add people or groups…</span>
            ) : (
              chips.map((chip) => {
                const label =
                  chip.kind === "broadcast"
                    ? broadcastStubForCategory(chip.category).label
                    : `${chip.contact.name} · ${chip.contact.email}`;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-left text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-100"
                    onClick={() => removeChip(chip)}
                    title="Remove"
                  >
                    <span className="min-w-0 truncate">{label}</span>
                    <span className="shrink-0 text-slate-400" aria-hidden>
                      ×
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">Click a chip to remove it. You can mix groups and individuals like email.</p>
        </div>

        <div className="space-y-3">
          {CATEGORY_ORDER.map((category) => {
            const titleCase =
              category === "admin" ? "Admin" : category === "management" ? "Management" : "Resident";
            const subtitle = categoryHint(portal, category);
            const list = contactsByCategory[category];

            return (
              <details
                key={category}
                className="group rounded-2xl border border-slate-200/80 bg-slate-50/40 open:bg-white open:shadow-sm"
                open={category === "admin"}
              >
                <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{titleCase}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>
                    </div>
                    <span className="mt-0.5 text-xs font-semibold text-primary group-open:hidden">Open</span>
                    <span className="mt-0.5 hidden text-xs font-semibold text-slate-400 group-open:inline">Hide</span>
                  </div>
                </summary>
                <div className="border-t border-slate-100 px-4 py-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200/80 hover:bg-slate-50/80">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                      checked={broadcastCats.has(category)}
                      onChange={() => toggleBroadcast(category)}
                    />
                    <span>
                      <span className="text-sm font-medium text-slate-900">{allLabelForCategory(category)}</span>
                      {category === "admin" ? (
                        <span className="mt-0.5 block text-xs text-slate-500">{PRIMARY_AXIS_ADMIN_LABEL}</span>
                      ) : null}
                    </span>
                  </label>

                  {list.length > 0 ? (
                    <>
                      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Or choose people</p>
                      <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
                        {list.map((c) => (
                          <li key={c.id}>
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200/80 hover:bg-slate-50/80">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                                checked={contactIds.has(c.id)}
                                disabled={broadcastCats.has(category)}
                                onChange={() => toggleContact(c)}
                              />
                              <span>
                                <span className="text-sm font-medium text-slate-900">{c.name}</span>
                                <span className="mt-0.5 block text-xs text-slate-500">{c.email}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : category !== "admin" ? (
                    <p className="mt-3 text-sm text-slate-500">No saved contacts in this category yet.</p>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>

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
