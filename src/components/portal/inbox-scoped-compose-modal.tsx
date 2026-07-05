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
  /** Same as toEmailLine but with "All management"/"All residents" placeholder addresses stripped. */
  directRecipientEmailLine: string;
  includesAxisAdmin: boolean;
  includesDirectoryRecipients: boolean;
  /** Broadcast categories selected ("All management" / "All residents"), resolved to real recipients server-side. */
  broadcastCategories: ("management" | "resident")[];
  deliverViaEmail: boolean;
  deliverViaSms: boolean;
  scheduleLater?: boolean;
  sendAt?: string;
};

type Chip =
  | { key: string; kind: "broadcast"; category: InboxRecipientCategory }
  | { key: string; kind: "contact"; contact: InboxScopedContact };

function categoryHint(portal: "resident" | "manager" | "vendor", category: InboxRecipientCategory): string {
  if (category === "admin") return "Messages to Axis operations.";
  if (portal === "manager") {
    if (category === "management") return "Property owners on your listings.";
    return "Tenants & approved residents.";
  }
  if (portal === "vendor") return "Your property manager(s).";
  if (category === "management") return "Property managers and owners.";
  return "Household / co-tenants.";
}

function allLabelForCategory(category: InboxRecipientCategory): string {
  if (category === "admin") return "All admins";
  if (category === "management") return "All management";
  return "All residents";
}

const CATEGORY_ORDER: InboxRecipientCategory[] = ["admin", "management", "resident"];

/**
 * Categories the sender may actually reach. Residents message their manager(s)
 * only — no admin broadcast and no other residents.
 */
function visibleCategoriesForPortal(portal: "resident" | "manager" | "vendor"): InboxRecipientCategory[] {
  if (portal === "resident") return ["management"];
  if (portal === "vendor") return ["management"];
  return CATEGORY_ORDER;
}

function defaultScheduleSendAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScopedInboxComposeModal({
  open,
  onClose,
  onSend,
  portal,
  title = "New message",
  senderName = "Portal user",
  senderEmail = "portal-user@example.com",
  liveContacts = [],
}: {
  open: boolean;
  onClose: () => void;
  onSend: (payload: ScopedInboxSendPayload) => void;
  portal: "resident" | "manager" | "vendor";
  title?: string;
  senderName?: string;
  senderEmail?: string;
  /** Live contacts derived from real data (residents, linked accounts). */
  liveContacts?: InboxScopedContact[];
}) {
  const { showToast } = useAppUi();
  const visibleCategories = useMemo(() => visibleCategoriesForPortal(portal), [portal]);
  const contacts = useMemo(() => contactsForPortal(portal, liveContacts), [portal, liveContacts]);
  const [broadcastCats, setBroadcastCats] = useState<Set<InboxRecipientCategory>>(new Set());
  const [contactIds, setContactIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [deliverViaEmail, setDeliverViaEmail] = useState(true);
  const [deliverViaSms, setDeliverViaSms] = useState(false);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [sendAt, setSendAt] = useState(defaultScheduleSendAt);
  const managerOnlyCompose = portal === "resident";

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setBroadcastCats(new Set());
      setContactIds(new Set());
      setSubject("");
      setBody("");
      setDeliverViaEmail(true);
      setDeliverViaSms(false);
      setScheduleLater(false);
      setSendAt(defaultScheduleSendAt());
    });
  }, [open]);

  useEffect(() => {
    if (!open || !managerOnlyCompose) return;
    const managers = contacts.filter((c) => categoryForContactRole(portal, c.role) === "management");
    if (managers.length === 1) {
      queueMicrotask(() => setContactIds(new Set([managers[0]!.id])));
    }
  }, [open, managerOnlyCompose, contacts, portal]);

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
      showToast(managerOnlyCompose ? "Choose your property manager." : "Add at least one recipient in To.");
      return;
    }
    if (scheduleLater) {
      const when = new Date(sendAt);
      if (Number.isNaN(when.getTime())) {
        showToast("Choose a valid send date and time.");
        return;
      }
      if (when.getTime() < Date.now() - 60_000) {
        showToast("Send time must be in the future.");
        return;
      }
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
    // "management"/"resident" broadcast chips are placeholder addresses (resolved server-side via
    // broadcastCategories below) — exclude them here so we don't send literal toEmails to nobody.
    const directRecipientEmailLine = parts
      .filter((p) => p.email.toLowerCase() !== broadcastStubForCategory("management").email.toLowerCase()
        && p.email.toLowerCase() !== broadcastStubForCategory("resident").email.toLowerCase())
      .map((p) => p.email)
      .join("; ");

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

    const broadcastCategories = [...broadcastCats].filter(
      (c): c is "management" | "resident" => c === "management" || c === "resident",
    );

    onSend({
      subject: s,
      body: b,
      senderName,
      senderEmail,
      toLabel,
      toEmailLine,
      directRecipientEmailLine,
      includesAxisAdmin,
      includesDirectoryRecipients,
      broadcastCategories,
      deliverViaEmail,
      deliverViaSms,
      scheduleLater,
      sendAt: scheduleLater ? new Date(sendAt).toISOString() : undefined,
    });
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-4">
        {!managerOnlyCompose ? (
        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted" htmlFor="scoped-compose-to-chips">
            Send to
          </label>
          <div
            id="scoped-compose-to-chips"
            className="mt-1.5 flex min-h-[48px] flex-wrap gap-1.5 rounded-xl border border-border bg-card px-2 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            {chips.length === 0 ? (
              <span className="select-none px-1 py-1 text-sm text-muted">Use the sections below to add people or groups…</span>
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
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-accent/30 px-2.5 py-1 text-left text-xs font-medium text-foreground shadow-sm hover:bg-accent/30"
                    onClick={() => removeChip(chip)}
                    title="Remove"
                  >
                    <span className="min-w-0 truncate">{label}</span>
                    <span className="shrink-0 text-muted" aria-hidden>
                      ×
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">Click a chip to remove it. You can mix groups and individuals like email.</p>
        </div>
        ) : null}

        <div className="space-y-3">
          {managerOnlyCompose ? (
            <div className="rounded-2xl border border-border bg-accent/30/40 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Property manager</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">Messages go to your assigned manager only.</p>
              {contactsByCategory.management.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {contactsByCategory.management.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-card px-3 py-2.5 ring-1 ring-border hover:bg-accent/30">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                          checked={contactIds.has(c.id)}
                          onChange={() => toggleContact(c)}
                        />
                        <span>
                          <span className="text-sm font-medium text-foreground">{c.name}</span>
                          <span className="mt-0.5 block text-xs text-muted">{c.email}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">No manager contact available yet.</p>
              )}
            </div>
          ) : (
          visibleCategories.map((category) => {
            const titleCase =
              category === "admin" ? "Admin" : category === "management" ? "Management" : "Resident";
            const subtitle = categoryHint(portal, category);
            const list = contactsByCategory[category];

            return (
              <details
                key={category}
                className="group rounded-2xl border border-border bg-accent/30/40 open:bg-card open:shadow-sm"
                open={category === "admin"}
              >
                <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{titleCase}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>
                    </div>
                    <span className="mt-0.5 text-xs font-semibold text-primary group-open:hidden">Open</span>
                    <span className="mt-0.5 hidden text-xs font-semibold text-muted group-open:inline">Hide</span>
                  </div>
                </summary>
                <div className="border-t border-border px-4 py-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-card px-3 py-2.5 ring-1 ring-border hover:bg-accent/30">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                      checked={broadcastCats.has(category)}
                      onChange={() => toggleBroadcast(category)}
                    />
                    <span>
                      <span className="text-sm font-medium text-foreground">{allLabelForCategory(category)}</span>
                      {category === "admin" ? (
                        <span className="mt-0.5 block text-xs text-muted">{PRIMARY_AXIS_ADMIN_LABEL}</span>
                      ) : null}
                    </span>
                  </label>

                  {list.length > 0 ? (
                    <>
                      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Or choose people</p>
                      <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
                        {list.map((c) => (
                          <li key={c.id}>
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-card px-3 py-2.5 ring-1 ring-border hover:bg-accent/30">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                                checked={contactIds.has(c.id)}
                                disabled={broadcastCats.has(category)}
                                onChange={() => toggleContact(c)}
                              />
                              <span>
                                <span className="text-sm font-medium text-foreground">{c.name}</span>
                                <span className="mt-0.5 block text-xs text-muted">{c.email}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : category !== "admin" ? (
                    <p className="mt-3 text-sm text-muted">No saved contacts in this category yet.</p>
                  ) : null}
                </div>
              </details>
            );
          })
          )}
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted" htmlFor="scoped-compose-subject">
            Subject
          </label>
          <Input id="scoped-compose-subject" className="mt-1.5" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted" htmlFor="scoped-compose-body">
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

        <div className="rounded-2xl border border-border bg-accent/30/40 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Deliver via</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={deliverViaEmail}
                onChange={(e) => setDeliverViaEmail(e.target.checked)}
              />
              <span className="text-sm font-medium text-foreground">Email</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={deliverViaSms}
                onChange={(e) => setDeliverViaSms(e.target.checked)}
              />
              <span className="text-sm font-medium text-foreground">SMS</span>
            </label>
          </div>
          {deliverViaSms && (
            <p className="mt-2 text-xs text-muted">SMS sends from your Twilio number. Recipients must have a phone number on their profile.</p>
          )}
        </div>

        {managerOnlyCompose ? (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={scheduleLater}
                onChange={(e) => setScheduleLater(e.target.checked)}
              />
              <span className="font-medium text-foreground">Schedule for later</span>
            </label>
            {scheduleLater ? (
              <label className="block text-sm">
                <span className="font-medium text-muted">Send date &amp; time</span>
                <Input
                  type="datetime-local"
                  className="mt-1.5"
                  value={sendAt}
                  onChange={(e) => setSendAt(e.target.value)}
                />
              </label>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-wrap justify-start gap-2 pt-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" className="rounded-full" onClick={submit}>
            {scheduleLater ? "Schedule message" : "Send"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
