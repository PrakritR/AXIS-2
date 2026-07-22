"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CheckboxMultiSelect, type CheckboxMultiSelectGroup } from "@/components/ui/checkbox-multi-select";
import { RecipientChipsInput } from "@/components/ui/recipient-chips-input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { ManagerSmsResidentConversation } from "@/lib/manager-sms-messages";
import {
  parseOtherRecipientTokens,
  type OtherRecipientToken,
} from "@/lib/communication-other-recipients";

type SmsComposeSection = "resident" | "applicant" | "other";
type SmsDirectorySection = Exclude<SmsComposeSection, "other">;

function formatPhoneDisplay(phone: string | null): string {
  if (!phone?.trim()) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function personKey(r: ManagerSmsResidentConversation): string {
  return r.residentUserId ?? r.residentEmail ?? r.phone ?? r.name;
}

/** Same middot convention as email compose: Name · Status · House/phone. */
function smsContactOptionLabel(r: ManagerSmsResidentConversation): string {
  const status = r.tenancyStatus === "applicant" ? "Applicant" : "Resident";
  const houseOrPhone = r.propertyLabel?.trim() || formatPhoneDisplay(r.phone);
  return [r.name, status, houseOrPhone].filter(Boolean).join(" · ");
}

function sectionLabel(section: SmsComposeSection): string {
  if (section === "applicant") return "Applicants";
  if (section === "other") return "Other";
  return "Residents";
}

/** Compose a new SMS — same TO / Which people multi-select pattern as New message. */
export function ManagerSmsComposeModal({
  open,
  onClose,
  residents,
  onSent,
  endpoint = "/api/manager/sms-conversations",
}: {
  open: boolean;
  onClose: () => void;
  residents: ManagerSmsResidentConversation[];
  onSent?: () => void;
  /** Send endpoint. Admin oversight passes its admin-scoped route. */
  endpoint?: string;
}) {
  const { showToast } = useAppUi();
  const withPhone = useMemo(
    () => residents.filter((r) => Boolean(r.phone?.trim())),
    [residents],
  );

  const [selectedSections, setSelectedSections] = useState<SmsComposeSection[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [otherTokens, setOtherTokens] = useState<OtherRecipientToken[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const otherSelected = selectedSections.includes("other");
  const directorySections = useMemo(
    () => selectedSections.filter((s): s is SmsDirectorySection => s !== "other"),
    [selectedSections],
  );

  const sectionOptions = useMemo(() => {
    const allSections: { value: SmsComposeSection; label: string }[] = [
      { value: "resident", label: "Residents" },
      { value: "applicant", label: "Applicants" },
    ];
    const base = allSections.filter((opt) =>
      withPhone.some((r) =>
        opt.value === "applicant" ? r.tenancyStatus === "applicant" : r.tenancyStatus !== "applicant",
      ),
    );
    // Other always available, last in the list.
    return [...base, { value: "other" as const, label: "Other" }];
  }, [withPhone]);

  const personGroups = useMemo((): CheckboxMultiSelectGroup[] => {
    return directorySections
      .map((section) => {
        const options = withPhone
          .filter((r) =>
            section === "applicant" ? r.tenancyStatus === "applicant" : r.tenancyStatus !== "applicant",
          )
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
          .map((r) => ({
            value: personKey(r),
            label: smsContactOptionLabel(r),
          }));
        return { label: sectionLabel(section), options };
      })
      .filter((g) => g.options.length > 0);
  }, [directorySections, withPhone]);

  const flatPersonOptions = useMemo(() => personGroups.flatMap((g) => g.options), [personGroups]);
  const validPersonKeys = useMemo(() => new Set(flatPersonOptions.map((o) => o.value)), [flatPersonOptions]);

  const selectedRecipients = useMemo(
    () => withPhone.filter((r) => selectedPeople.includes(personKey(r))),
    [selectedPeople, withPhone],
  );

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setSelectedSections([]);
      setSelectedPeople([]);
      setOtherTokens([]);
      setBody("");
    });
  }, [open]);

  useEffect(() => {
    setSelectedPeople((prev) => prev.filter((key) => validPersonKeys.has(key)));
  }, [validPersonKeys]);

  useEffect(() => {
    if (!otherSelected) setOtherTokens([]);
  }, [otherSelected]);

  async function send() {
    const otherPhones = otherSelected ? parseOtherRecipientTokens(otherTokens).phones : [];
    if (selectedSections.length === 0) {
      showToast("Select Residents, Applicants, and/or Other.");
      return;
    }
    if (otherSelected && otherPhones.length === 0) {
      showToast("Type a phone number under Other.");
      return;
    }
    if (directorySections.length > 0 && selectedRecipients.length === 0) {
      showToast("Select at least one person with a phone number.");
      return;
    }
    const text = body.trim();
    if (!text) {
      showToast("Enter a message.");
      return;
    }
    setSending(true);
    try {
      let ok = 0;
      let lastError = "Could not send SMS.";
      const targets: { phone: string; residentUserId?: string | null }[] = [];
      const seen = new Set<string>();
      for (const recipient of selectedRecipients) {
        if (!recipient.phone || seen.has(recipient.phone)) continue;
        seen.add(recipient.phone);
        targets.push({ phone: recipient.phone, residentUserId: recipient.residentUserId });
      }
      for (const phone of otherPhones) {
        if (seen.has(phone)) continue;
        seen.add(phone);
        targets.push({ phone, residentUserId: null });
      }
      if (targets.length === 0) {
        showToast("Add at least one phone number.");
        return;
      }
      for (const recipient of targets) {
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toPhone: recipient.phone,
            text,
            residentUserId: recipient.residentUserId ?? undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          lastError = data.error ?? lastError;
          continue;
        }
        ok += 1;
      }
      if (ok === 0) {
        showToast(lastError);
        return;
      }
      showToast(ok === 1 ? "SMS sent." : `SMS sent to ${ok} people.`);
      onClose();
      onSent?.();
    } catch {
      showToast("Could not send SMS.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} title="New message" onClose={onClose}>
      <div className="space-y-3">
        {withPhone.length === 0 && !otherSelected ? (
          <p className="text-sm text-muted">
            No residents or applicants with a phone number yet. Choose Other in To to type a number, or add a phone on
            their profile.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxMultiSelect
            label="To"
            options={sectionOptions}
            selected={selectedSections}
            onChange={(next) =>
              setSelectedSections(
                next.filter(
                  (v): v is SmsComposeSection =>
                    v === "resident" || v === "applicant" || v === "other",
                ),
              )
            }
            dataAttr="manager-sms-compose-section"
          />
          <CheckboxMultiSelect
            label="Which people"
            groups={personGroups}
            selected={selectedPeople}
            onChange={setSelectedPeople}
            disabled={directorySections.length === 0}
            emptyMenuText={
              selectedSections.length === 0
                ? "Pick a section first"
                : directorySections.length === 0
                  ? "Other uses the field below"
                  : "No people with phones in selected sections"
            }
            dataAttr="manager-sms-compose-person"
          />
        </div>

        {otherSelected ? (
          <div>
            <label
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted"
              htmlFor="manager-sms-compose-other"
            >
              Other
            </label>
            <RecipientChipsInput
              id="manager-sms-compose-other"
              tokens={otherTokens}
              onChange={setOtherTokens}
              placeholder="Type a phone, then press Space…"
              dataAttr="manager-sms-compose-other"
            />
            <p className="mt-1 text-xs text-muted">Press Space, comma, or Enter to save each number as a chip.</p>
          </div>
        ) : null}

        <div>
          <label
            className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted"
            htmlFor="manager-sms-compose-body"
          >
            Message
          </label>
          <Textarea
            id="manager-sms-compose-body"
            className="mt-1 min-h-[120px]"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your text…"
            maxLength={1600}
            data-attr="manager-sms-compose-body"
          />
          <span className="mt-1 block text-xs text-muted">{body.trim().length}/1600</span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={sending || !body.trim()}
            data-attr="manager-sms-compose-send"
            onClick={() => void send()}
          >
            {sending
              ? "Sending…"
              : selectedPeople.length + (otherSelected ? otherTokens.length : 0) > 1
                ? `Send SMS (${selectedPeople.length + (otherSelected ? otherTokens.length : 0)})`
                : "Send SMS"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
