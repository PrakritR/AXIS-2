"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CheckboxMultiSelect, type CheckboxMultiSelectGroup } from "@/components/ui/checkbox-multi-select";
import {
  PORTAL_TOOLBAR_GROUP,
  PORTAL_TOOLBAR_PILL_BUTTON,
  PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE,
} from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  broadcastStubForCategory,
  categoryForContactRole,
  contactsForPortal,
  PRIMARY_AXIS_ADMIN_LABEL,
  type InboxRecipientCategory,
  type InboxScopedContact,
} from "@/data/inbox-scoped-directory";
import type { ManagerSmsResidentConversation } from "@/lib/manager-sms-messages";
import { parseOtherRecipientTokens, normalizePhoneE164, type OtherRecipientToken } from "@/lib/communication-other-recipients";
import { RecipientChipsInput } from "@/components/ui/recipient-chips-input";
import { appendPortalMessageToAdminInbox } from "@/lib/demo-admin-partner-inbox";
import {
  invalidatePersistedInboxCache,
  MANAGER_INBOX_STORAGE_KEY,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";

export type CommunicationComposeChannel = "email" | "sms";

type ComposeCategory = "resident" | "management" | "admin" | "vendor" | "other";
type DirectoryComposeCategory = Exclude<ComposeCategory, "other">;
type PersonKey = "admin" | "broadcast:management" | "broadcast:resident" | `id:${string}`;

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

function categoryLabel(category: ComposeCategory): string {
  if (category === "resident") return "Residents & applicants";
  if (category === "management") return "Manager";
  if (category === "vendor") return "Vendor";
  if (category === "other") return "Other";
  return "PropLane admin";
}

function peopleForCategory(
  category: DirectoryComposeCategory,
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
    .filter((c) => categoryForContactRole("manager", c.role) === roleCategory)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((c) => ({ key: `id:${c.id}` as const, label: contactOptionLabel(c) }));
  if (category === "resident") {
    return [{ key: "broadcast:resident", label: "All residents" }, ...people];
  }
  if (category === "management") {
    return [{ key: "broadcast:management", label: "All management" }, ...people];
  }
  return people;
}

/**
 * Shared New message for Communication Email + SMS.
 * Same To / Which people / Other fields; choose Email and/or SMS at the bottom.
 */
export function ManagerCommunicationComposeModal({
  open,
  onClose,
  initialChannel = "email",
  liveContacts = [],
  smsRecipients = [],
  senderName = "Property manager",
  senderEmail = "manager@example.com",
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  initialChannel?: CommunicationComposeChannel;
  liveContacts?: InboxScopedContact[];
  smsRecipients?: ManagerSmsResidentConversation[];
  senderName?: string;
  senderEmail?: string;
  onSent?: (channels: { email: boolean; sms: boolean }) => void;
}) {
  const { showToast } = useAppUi();
  const contacts = useMemo(() => contactsForPortal("manager", liveContacts), [liveContacts]);
  /** Other sits last, under Vendor. */
  const categoryOptions = useMemo(
    (): ComposeCategory[] => ["resident", "management", "admin", "vendor", "other"],
    [],
  );

  const [selectedCategories, setSelectedCategories] = useState<ComposeCategory[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<PersonKey[]>([]);
  const [otherTokens, setOtherTokens] = useState<OtherRecipientToken[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [viaEmail, setViaEmail] = useState(true);
  const [viaSms, setViaSms] = useState(false);
  const [sending, setSending] = useState(false);

  const withPhone = useMemo(
    () => smsRecipients.filter((r) => Boolean(r.phone?.trim())),
    [smsRecipients],
  );

  const otherSelected = selectedCategories.includes("other");
  const directoryCategories = useMemo(
    () => selectedCategories.filter((c): c is DirectoryComposeCategory => c !== "other"),
    [selectedCategories],
  );

  const sectionOptions = useMemo(
    () => categoryOptions.map((c) => ({ value: c, label: categoryLabel(c) })),
    [categoryOptions],
  );

  const personGroups = useMemo((): CheckboxMultiSelectGroup[] => {
    return directoryCategories
      .map((category) => ({
        label: categoryLabel(category),
        options: peopleForCategory(category, contacts).map((p) => ({
          value: p.key,
          label: p.label,
        })),
      }))
      .filter((g) => g.options.length > 0);
  }, [directoryCategories, contacts]);

  const flatPersonOptions = useMemo(() => personGroups.flatMap((g) => g.options), [personGroups]);
  const validPersonKeys = useMemo(() => new Set(flatPersonOptions.map((o) => o.value)), [flatPersonOptions]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setSelectedCategories([]);
      setSelectedKeys([]);
      setOtherTokens([]);
      setSubject("");
      setBody("");
      setViaEmail(initialChannel === "email");
      setViaSms(initialChannel === "sms");
      setSending(false);
    });
  }, [open, initialChannel]);

  useEffect(() => {
    setSelectedKeys((prev) => prev.filter((key) => validPersonKeys.has(key)));
  }, [validPersonKeys]);

  useEffect(() => {
    if (!otherSelected) setOtherTokens([]);
  }, [otherSelected]);

  const onCategoriesChange = (next: string[]) => {
    const cats = next.filter((v): v is ComposeCategory =>
      categoryOptions.includes(v as ComposeCategory),
    );
    setSelectedCategories(cats);
  };

  const resolveEmailTargets = () => {
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

    const other = otherSelected
      ? parseOtherRecipientTokens(otherTokens)
      : { emails: [] as string[], phones: [] as string[] };
    for (const email of other.emails) {
      const lower = email.toLowerCase();
      if (seenEmail.has(lower)) continue;
      seenEmail.add(lower);
      directEmails.push(email);
      labels.push(email);
      includesDirectoryRecipients = true;
    }

    return {
      labels,
      directEmails,
      includesAxisAdmin,
      includesDirectoryRecipients,
      broadcastCategories,
    };
  };

  const resolveSmsTargets = () => {
    const targets: { phone: string; residentUserId?: string | null }[] = [];
    const seen = new Set<string>();
    const add = (phone: string | null | undefined, residentUserId?: string | null) => {
      const e164 = phone ? normalizePhoneE164(phone) : null;
      if (!e164 || seen.has(e164)) return;
      seen.add(e164);
      targets.push({ phone: e164, residentUserId });
    };

    const wantsAllResidents = selectedKeys.includes("broadcast:resident");
    if (wantsAllResidents) {
      for (const r of withPhone) add(r.phone, r.residentUserId);
    }

    for (const key of selectedKeys) {
      if (!key.startsWith("id:")) continue;
      const id = key.slice(3);
      const contact = contacts.find((c) => c.id === id);
      if (!contact) continue;
      const email = contact.email.trim().toLowerCase();
      const byEmail = withPhone.find((r) => r.residentEmail?.trim().toLowerCase() === email);
      if (byEmail) {
        add(byEmail.phone, byEmail.residentUserId);
        continue;
      }
      const byName = withPhone.find(
        (r) => r.name.trim().toLowerCase() === contact.name.trim().toLowerCase(),
      );
      if (byName) add(byName.phone, byName.residentUserId);
    }

    if (otherSelected) {
      for (const phone of parseOtherRecipientTokens(otherTokens).phones) {
        add(phone, null);
      }
    }

    return targets;
  };

  const submit = async () => {
    if (!viaEmail && !viaSms) {
      showToast("Choose Email and/or SMS at the bottom.");
      return;
    }
    const text = body.trim();
    if (!text) {
      showToast("Write a message.");
      return;
    }
    if (selectedCategories.length === 0) {
      showToast("Select at least one section under To.");
      return;
    }
    const other = otherSelected
      ? parseOtherRecipientTokens(otherTokens)
      : { emails: [] as string[], phones: [] as string[] };
    if (otherSelected && other.emails.length === 0 && other.phones.length === 0) {
      showToast("Type an email or phone under Other.");
      return;
    }
    if (directoryCategories.length > 0 && selectedKeys.length === 0) {
      showToast("Select at least one person from Which people.");
      return;
    }

    if (viaEmail) {
      const s = subject.trim();
      if (!s) {
        showToast("Add a subject for email.");
        return;
      }
      const emailTargets = resolveEmailTargets();
      if (
        !emailTargets.includesAxisAdmin &&
        emailTargets.broadcastCategories.length === 0 &&
        emailTargets.directEmails.length === 0
      ) {
        showToast("Add at least one email recipient (directory or Other).");
        return;
      }
    }

    if (viaSms) {
      const smsTargets = resolveSmsTargets();
      if (smsTargets.length === 0) {
        showToast("Add at least one phone (resident with a number, or Other).");
        return;
      }
    }

    setSending(true);
    let emailOk = !viaEmail;
    let smsOk = !viaSms;
    let lastError = "Could not send.";

    try {
      if (viaEmail) {
        const emailTargets = resolveEmailTargets();
        if (emailTargets.includesAxisAdmin) {
          appendPortalMessageToAdminInbox({
            role: "manager",
            name: senderName,
            email: senderEmail,
            topic: subject.trim(),
            body: text,
          });
        }
        const res = await fetch("/api/portal/send-inbox-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            fromName: senderName,
            fromEmail: senderEmail,
            toEmails: emailTargets.directEmails,
            toBroadcast: emailTargets.broadcastCategories,
            subject: subject.trim(),
            text,
            deliverToPortalInbox: true,
            deliverViaSms: false,
            eventCategory: "messages",
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          lastError = data.error ?? "Email could not be sent.";
        } else {
          emailOk = true;
          invalidatePersistedInboxCache(MANAGER_INBOX_STORAGE_KEY);
          void syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY, { force: true });
        }
      }

      if (viaSms) {
        const smsTargets = resolveSmsTargets();
        let sent = 0;
        for (const target of smsTargets) {
          const res = await fetch("/api/manager/sms-conversations", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toPhone: target.phone,
              text,
              residentUserId: target.residentUserId ?? undefined,
            }),
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) {
            lastError = data.error ?? lastError;
            continue;
          }
          sent += 1;
        }
        smsOk = sent > 0;
        if (!smsOk) lastError = lastError === "Could not send." ? "SMS could not be sent." : lastError;
      }

      if ((viaEmail && !emailOk) || (viaSms && !smsOk)) {
        if (viaEmail && emailOk && viaSms && !smsOk) {
          showToast("Email sent, but SMS failed.");
          onClose();
          onSent?.({ email: true, sms: false });
          return;
        }
        if (viaSms && smsOk && viaEmail && !emailOk) {
          showToast("SMS sent, but email failed.");
          onClose();
          onSent?.({ email: false, sms: true });
          return;
        }
        showToast(lastError);
        return;
      }

      const both = viaEmail && viaSms;
      showToast(both ? "Message sent via email and SMS." : viaSms ? "SMS sent." : "Message sent.");
      onClose();
      onSent?.({ email: viaEmail, sms: viaSms });
    } catch {
      showToast(lastError);
    } finally {
      setSending(false);
    }
  };

  const sendLabel = (() => {
    if (sending) return "Sending…";
    if (viaEmail && viaSms) return "Send email + SMS";
    if (viaSms) return "Send SMS";
    return "Send email";
  })();

  return (
    <Modal
      open={open}
      title="New message"
      onClose={onClose}
      dense
      panelClassName="max-h-[min(92dvh,36rem)]"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            data-attr="communication-compose-send"
            disabled={sending || (!viaEmail && !viaSms)}
            onClick={() => void submit()}
          >
            {sendLabel}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col gap-2.5">
        <div className="grid shrink-0 gap-2.5 sm:grid-cols-2">
          <CheckboxMultiSelect
            label="To"
            options={sectionOptions}
            selected={selectedCategories}
            onChange={onCategoriesChange}
            dataAttr="communication-compose-category"
          />
          <CheckboxMultiSelect
            label="Which people"
            groups={personGroups}
            selected={selectedKeys}
            onChange={(next) => setSelectedKeys(next as PersonKey[])}
            disabled={directoryCategories.length === 0}
            emptyMenuText={
              selectedCategories.length === 0
                ? "Pick a section first"
                : directoryCategories.length === 0
                  ? "Other uses the field below"
                  : "No contacts in selected sections"
            }
            dataAttr="communication-compose-person"
          />
        </div>

        {selectedCategories.includes("other") ? (
          <div className="shrink-0" data-attr="communication-compose-other-wrap">
            <label
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted"
              htmlFor="communication-compose-other"
            >
              Other
            </label>
            <RecipientChipsInput
              id="communication-compose-other"
              tokens={otherTokens}
              onChange={setOtherTokens}
              placeholder={
                viaSms && !viaEmail
                  ? "Type a phone, then press Space…"
                  : viaEmail && !viaSms
                    ? "Type an email, then press Space…"
                    : "Type email or phone, then press Space…"
              }
              dataAttr="communication-compose-other"
            />
            <p className="mt-1 text-xs text-muted">Press Space, comma, or Enter to save each recipient as a chip.</p>
          </div>
        ) : null}

        {viaEmail ? (
          <div className="shrink-0">
            <label
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted"
              htmlFor="communication-compose-subject"
            >
              Subject
            </label>
            <Input
              id="communication-compose-subject"
              className="mt-1"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              data-attr="communication-compose-subject"
            />
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <label
            className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted"
            htmlFor="communication-compose-body"
          >
            Message
          </label>
          <Textarea
            id="communication-compose-body"
            className="mt-1 max-h-[min(28dvh,10.5rem)] min-h-[5.5rem] resize-none overflow-y-auto overscroll-contain"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            maxLength={viaSms ? 1600 : undefined}
            data-attr="communication-compose-body"
          />
          {viaSms ? (
            <span className="mt-1 block shrink-0 text-xs text-muted">{body.trim().length}/1600</span>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border pt-2.5">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Send via</p>
          <div className={PORTAL_TOOLBAR_GROUP} role="group" aria-label="Send platform">
            <button
              type="button"
              className={`${PORTAL_TOOLBAR_PILL_BUTTON} ${viaEmail ? PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE : ""}`}
              aria-pressed={viaEmail}
              data-attr="communication-compose-via-email"
              onClick={() => setViaEmail((v) => !v)}
            >
              Email
            </button>
            <button
              type="button"
              className={`${PORTAL_TOOLBAR_PILL_BUTTON} ${viaSms ? PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE : ""}`}
              aria-pressed={viaSms}
              data-attr="communication-compose-via-sms"
              onClick={() => setViaSms((v) => !v)}
            >
              SMS
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Pick one or both. SMS uses your work number; recipients need a phone on file or under Other.
          </p>
        </div>
      </div>
    </Modal>
  );
}
