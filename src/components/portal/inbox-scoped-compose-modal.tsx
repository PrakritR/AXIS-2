"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CheckboxMultiSelect, type CheckboxMultiSelectGroup } from "@/components/ui/checkbox-multi-select";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { DEMO_INBOX_COMPOSE_PREFILL_EVENT } from "@/lib/demo/demo-playback";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  broadcastStubForCategory,
  categoryForContactRole,
  contactsForPortal,
  PRIMARY_AXIS_ADMIN_LABEL,
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
  scheduleLater?: boolean;
  sendAt?: string;
  /** Also deliver via SMS when the recipient has a phone on file. */
  deliverViaSms?: boolean;
};

type ComposeCategory = "resident" | "management" | "admin" | "vendor";
type PersonKey = "admin" | "broadcast:management" | "broadcast:resident" | `id:${string}`;

function defaultScheduleSendAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function contactOptionLabel(contact: InboxScopedContact): string {
  const property = contact.propertyLabel?.trim();
  const status =
    contact.role === "resident"
      ? contact.tenancyStatus === "applicant"
        ? "Applicant"
        : "Resident"
      : null;
  const bits = [contact.name, status, property || contact.email].filter(Boolean);
  return bits.join(" · ");
}

function categoriesForPortal(portal: "resident" | "manager" | "vendor"): ComposeCategory[] {
  if (portal === "manager") return ["resident", "management", "admin", "vendor"];
  if (portal === "vendor") return ["management", "admin"];
  return ["resident", "management", "admin"];
}

function categoryLabel(category: ComposeCategory): string {
  if (category === "resident") return "Residents & applicants";
  if (category === "management") return "Manager";
  if (category === "vendor") return "Vendor";
  return "PropLane admin";
}

function peopleForCategory(
  category: ComposeCategory,
  portal: "resident" | "manager" | "vendor",
  contacts: InboxScopedContact[],
): { key: PersonKey; label: string }[] {
  if (category === "admin") {
    return [{ key: "admin", label: PRIMARY_AXIS_ADMIN_LABEL }];
  }

  if (category === "vendor") {
    return contacts
      .filter((c) => c.role === "vendor")
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map((c) => ({ key: `id:${c.id}` as const, label: contactOptionLabel(c) }));
  }

  const roleCategory: InboxRecipientCategory = category === "resident" ? "resident" : "management";
  const people = contacts
    .filter((c) => categoryForContactRole(portal, c.role) === roleCategory)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((c) => ({ key: `id:${c.id}` as const, label: contactOptionLabel(c) }));

  if (portal === "manager" && category === "resident") {
    return [{ key: "broadcast:resident", label: "All residents" }, ...people];
  }
  if (portal === "manager" && category === "management") {
    return [{ key: "broadcast:management", label: "All management" }, ...people];
  }
  return people;
}

/**
 * New message compose: two multi-select dropdowns (sections + people) with checkboxes.
 */
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
  liveContacts?: InboxScopedContact[];
}) {
  const { showToast } = useAppUi();
  const contacts = useMemo(() => contactsForPortal(portal, liveContacts), [portal, liveContacts]);
  const categoryOptions = useMemo(() => categoriesForPortal(portal), [portal]);
  const [selectedCategories, setSelectedCategories] = useState<ComposeCategory[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<PersonKey[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [deliverViaSms, setDeliverViaSms] = useState(false);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [sendAt, setSendAt] = useState(defaultScheduleSendAt);

  const sectionOptions = useMemo(
    () => categoryOptions.map((c) => ({ value: c, label: categoryLabel(c) })),
    [categoryOptions],
  );

  const personGroups = useMemo((): CheckboxMultiSelectGroup[] => {
    const cats = selectedCategories.length > 0 ? selectedCategories : [];
    return cats
      .map((category) => ({
        label: categoryLabel(category),
        options: peopleForCategory(category, portal, contacts).map((p) => ({
          value: p.key,
          label: p.label,
        })),
      }))
      .filter((g) => g.options.length > 0);
  }, [selectedCategories, portal, contacts]);

  const flatPersonOptions = useMemo(() => personGroups.flatMap((g) => g.options), [personGroups]);
  const validPersonKeys = useMemo(() => new Set(flatPersonOptions.map((o) => o.value)), [flatPersonOptions]);

  const showSmsOption = portal === "manager";
  const smsEligible = selectedKeys.some((key) => {
    if (key === "broadcast:resident") return true;
    if (!key.startsWith("id:")) return false;
    return contacts.some((c) => c.role === "resident" && `id:${c.id}` === key);
  });

  useEffect(() => {
    if (!isDemoModeActive()) return;
    const onPrefill = (e: Event) => {
      const detail = (e as CustomEvent<{ subject?: string; body?: string; residentEmail?: string }>).detail;
      setSubject(detail?.subject?.trim() || "Lease renewal reminder");
      setBody(
        detail?.body?.trim() ||
          "Hi — just a friendly reminder that your lease renewal paperwork is ready whenever you want to review it.",
      );
      const email = detail?.residentEmail?.trim().toLowerCase();
      if (email) {
        const hit = contacts.find((c) => c.email?.toLowerCase() === email);
        if (hit) {
          setSelectedCategories(["resident"]);
          setSelectedKeys([`id:${hit.id}`]);
        }
      }
    };
    window.addEventListener(DEMO_INBOX_COMPOSE_PREFILL_EVENT, onPrefill as EventListener);
    return () => window.removeEventListener(DEMO_INBOX_COMPOSE_PREFILL_EVENT, onPrefill as EventListener);
  }, [contacts]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setSelectedCategories([]);
      setSelectedKeys([]);
      setSubject("");
      setBody("");
      setDeliverViaSms(false);
      setScheduleLater(false);
      setSendAt(defaultScheduleSendAt());
    });
  }, [open, portal]);

  useEffect(() => {
    setSelectedKeys((prev) => prev.filter((key) => validPersonKeys.has(key)));
  }, [validPersonKeys]);

  useEffect(() => {
    if (!smsEligible && deliverViaSms) setDeliverViaSms(false);
  }, [smsEligible, deliverViaSms]);

  const onCategoriesChange = (next: string[]) => {
    const cats = next.filter((v): v is ComposeCategory =>
      categoryOptions.includes(v as ComposeCategory),
    );
    setSelectedCategories(cats);
  };

  const onPeopleChange = (next: string[]) => {
    setSelectedKeys(next as PersonKey[]);
  };

  const submit = () => {
    const s = subject.trim();
    const b = body.trim();
    if (!s || !b) {
      showToast("Add a subject and message.");
      return;
    }
    if (selectedCategories.length === 0) {
      showToast("Select at least one section (Resident, Manager, …).");
      return;
    }
    if (selectedKeys.length === 0) {
      showToast("Select at least one recipient.");
      return;
    }
    if (portal === "resident" && scheduleLater) {
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

    const labels: string[] = [];
    const directEmails: string[] = [];
    let includesAxisAdmin = false;
    let includesDirectoryRecipients = false;
    const broadcastCategories: ("management" | "resident")[] = [];
    const seenBroadcast = new Set<string>();
    const seenEmail = new Set<string>();

    for (const key of selectedKeys) {
      if (key === "admin") {
        const stub = broadcastStubForCategory("admin");
        includesAxisAdmin = true;
        labels.push(PRIMARY_AXIS_ADMIN_LABEL);
        const email = stub.email.trim().toLowerCase();
        if (!seenEmail.has(email)) {
          seenEmail.add(email);
          directEmails.push(stub.email.trim());
        }
        continue;
      }
      if (key === "broadcast:management") {
        if (!seenBroadcast.has("management")) {
          seenBroadcast.add("management");
          broadcastCategories.push("management");
          labels.push("All management");
          includesDirectoryRecipients = true;
        }
        continue;
      }
      if (key === "broadcast:resident") {
        if (!seenBroadcast.has("resident")) {
          seenBroadcast.add("resident");
          broadcastCategories.push("resident");
          labels.push("All residents");
          includesDirectoryRecipients = true;
        }
        continue;
      }
      const id = key.slice(3);
      const contact = contacts.find((c) => c.id === id);
      if (!contact) continue;
      labels.push(contact.name);
      includesDirectoryRecipients = true;
      const email = contact.email.trim();
      const lower = email.toLowerCase();
      if (!lower || seenEmail.has(lower)) continue;
      seenEmail.add(lower);
      directEmails.push(email);
      if (lower === broadcastStubForCategory("admin").email.toLowerCase()) {
        includesAxisAdmin = true;
      }
    }

    if (!includesAxisAdmin && broadcastCategories.length === 0 && directEmails.length === 0) {
      showToast("Select at least one recipient.");
      return;
    }

    onSend({
      subject: s,
      body: b,
      senderName,
      senderEmail,
      toLabel: labels.join(", "),
      toEmailLine: directEmails.join("; "),
      directRecipientEmailLine: directEmails.join("; "),
      includesAxisAdmin,
      includesDirectoryRecipients,
      broadcastCategories,
      scheduleLater: portal === "resident" ? scheduleLater : false,
      sendAt: portal === "resident" && scheduleLater ? new Date(sendAt).toISOString() : undefined,
      deliverViaSms: showSmsOption && smsEligible ? deliverViaSms : false,
    });
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxMultiSelect
            label="To"
            options={sectionOptions}
            selected={selectedCategories}
            onChange={onCategoriesChange}
            dataAttr="inbox-compose-category"
          />
          <CheckboxMultiSelect
            label="Which people"
            groups={personGroups}
            selected={selectedKeys}
            onChange={onPeopleChange}
            disabled={selectedCategories.length === 0}
            emptyMenuText={
              selectedCategories.length === 0 ? "Pick a section first" : "No contacts in selected sections"
            }
            dataAttr="inbox-compose-person"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted" htmlFor="compose-subject">
            Subject
          </label>
          <Input
            id="compose-subject"
            className="mt-1"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted" htmlFor="compose-body">
            Message
          </label>
          <Textarea
            id="compose-body"
            className="mt-1 min-h-[120px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
          />
        </div>

        {showSmsOption ? (
          <label
            className={`flex items-start gap-2.5 text-sm ${smsEligible ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
              checked={deliverViaSms}
              disabled={!smsEligible}
              onChange={(e) => setDeliverViaSms(e.target.checked)}
              data-attr="inbox-compose-sms"
            />
            <span>
              <span className="font-medium text-foreground">Also send as SMS</span>
              <span className="mt-0.5 block text-xs text-muted">
                {smsEligible
                  ? "Texts selected residents from your work number when a phone is on file."
                  : "Select a resident to enable SMS."}
              </span>
            </span>
          </label>
        ) : null}

        {portal === "resident" ? (
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
                  className="mt-1"
                  value={sendAt}
                  onChange={(e) => setSendAt(e.target.value)}
                />
              </label>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" className="rounded-full" data-attr="inbox-compose-send" onClick={submit}>
            {scheduleLater ? "Schedule" : deliverViaSms ? "Send email + SMS" : "Send"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
