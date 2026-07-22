"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { CheckboxMultiSelect } from "@/components/ui/checkbox-multi-select";
import { PortalNotificationPreviewModal } from "@/components/portal/portal-notification-preview-modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { logDemoOutboundEmail } from "@/lib/demo-outbound-mail";
import {
  buildLeadInviteEmailBody,
  leadInviteSubject,
  type LeadInviteKind,
} from "@/lib/lead-invite-email";
import {
  buildManagerApplyUrl,
  buildManagerBrowseUrl,
  buildManagerListingUrl,
  buildManagerTourUrl,
  copyTextToClipboard,
} from "@/lib/manager-property-links";
import type { ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";
import { getPropertyById, getRoomOptionsForProperty, parseRoomChoiceValue } from "@/lib/rental-application/data";
import { buildListingShareSummary } from "@/lib/listing-share-summary";

export function ShareLeadLinkModal({
  open,
  onClose,
  kind,
  properties,
  preselectedPropertyId,
}: {
  open: boolean;
  onClose: () => void;
  kind: LeadInviteKind;
  properties: ManagerPropertyFilterOption[];
  preselectedPropertyId?: string;
}) {
  const { showToast } = useAppUi();
  // Listing sends support several/all properties at once; apply/tour stay single.
  const multiEnabled = kind === "listing";
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [roomChoice, setRoomChoice] = useState("");
  const [prospectName, setProspectName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [note, setNote] = useState("");
  const [sendPreviewOpen, setSendPreviewOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => {
      const initial =
        preselectedPropertyId && properties.some((p) => p.id === preselectedPropertyId)
          ? preselectedPropertyId
          : properties[0]?.id ?? "";
      setPropertyIds(initial ? [initial] : []);
      setRoomChoice("");
      setProspectName("");
      setProspectEmail("");
      setNote("");
      setSendPreviewOpen(false);
      setSendBusy(false);
    });
  }, [open, kind, preselectedPropertyId, properties]);

  // The room selector and single-listing summary only make sense for exactly one
  // property; a multi-property listing send links to the filtered browse grid.
  const singlePropertyId = propertyIds.length === 1 ? propertyIds[0] : "";
  const isMultiListing = multiEnabled && propertyIds.length > 1;

  const propertyTitle = useMemo(() => {
    if (isMultiListing) return `${propertyIds.length} homes`;
    if (!singlePropertyId) return "";
    return properties.find((p) => p.id === singlePropertyId)?.label ?? singlePropertyId;
  }, [properties, singlePropertyId, isMultiListing, propertyIds.length]);

  const roomOptions = useMemo(() => {
    if ((kind !== "apply" && kind !== "listing") || !singlePropertyId) return [];
    return getRoomOptionsForProperty(singlePropertyId, { includeUnavailable: true }).filter((o) => o.value);
  }, [kind, singlePropertyId]);

  const linkUrl = useMemo(() => {
    if (propertyIds.length === 0 || typeof window === "undefined") return "";
    const origin = window.location.origin;
    if (isMultiListing) return buildManagerBrowseUrl(origin, propertyIds);
    if (!singlePropertyId) return "";
    if (kind === "tour") return buildManagerTourUrl(origin, singlePropertyId);
    if (kind === "listing") return buildManagerListingUrl(origin, singlePropertyId);
    const { listingRoomId } = roomChoice ? parseRoomChoiceValue(roomChoice) : { listingRoomId: undefined };
    const roomName = roomChoice ? roomOptions.find((o) => o.value === roomChoice)?.label : undefined;
    return buildManagerApplyUrl(origin, {
      propertyId: singlePropertyId,
      listingRoomId: listingRoomId || undefined,
      roomName: roomName || undefined,
    });
  }, [kind, propertyIds, singlePropertyId, isMultiListing, roomChoice, roomOptions]);

  const listingSummary = useMemo(() => {
    if (kind !== "listing" || isMultiListing || !singlePropertyId) return null;
    const property = getPropertyById(singlePropertyId);
    if (!property) return null;
    const { listingRoomId } = roomChoice ? parseRoomChoiceValue(roomChoice) : { listingRoomId: undefined };
    const roomName = roomChoice ? roomOptions.find((o) => o.value === roomChoice)?.label : undefined;
    return buildListingShareSummary(property, { roomChoice: roomName, roomId: listingRoomId });
  }, [kind, singlePropertyId, isMultiListing, roomChoice, roomOptions]);

  const invitePreviewBody = useMemo(() => {
    if (!linkUrl) return "";
    if (isMultiListing) {
      return buildLeadInviteEmailBody({
        kind,
        prospectName: prospectName.trim() || undefined,
        propertyTitle,
        linkUrl,
        listingCount: propertyIds.length,
        managerNote: note.trim() || undefined,
      });
    }
    return buildLeadInviteEmailBody({
      kind,
      prospectName: prospectName.trim() || undefined,
      propertyTitle,
      linkUrl: kind === "listing" ? buildManagerApplyUrl(typeof window !== "undefined" ? window.location.origin : "", {
        propertyId: singlePropertyId,
        listingRoomId: roomChoice ? parseRoomChoiceValue(roomChoice).listingRoomId || undefined : undefined,
        roomName: roomChoice ? roomOptions.find((o) => o.value === roomChoice)?.label : undefined,
      }) : linkUrl,
      listingPageUrl: kind === "listing" ? linkUrl : undefined,
      tourUrl:
        kind === "listing" && singlePropertyId && typeof window !== "undefined"
          ? buildManagerTourUrl(window.location.origin, singlePropertyId)
          : undefined,
      listingSummary: listingSummary ?? undefined,
      managerNote: note.trim() || undefined,
    });
  }, [kind, prospectName, propertyTitle, linkUrl, singlePropertyId, isMultiListing, propertyIds.length, roomChoice, roomOptions, listingSummary, note]);

  const handleCopy = async () => {
    if (!linkUrl) {
      showToast("Select a property first.");
      return;
    }
    const ok = await copyTextToClipboard(linkUrl);
    showToast(ok ? "Link copied." : "Could not copy link.");
  };

  const openSendPreview = () => {
    if (propertyIds.length === 0) {
      showToast("Select a property first.");
      return;
    }
    if (!prospectEmail.trim().includes("@")) {
      showToast("Enter a valid prospect email.");
      return;
    }
    setSendPreviewOpen(true);
  };

  const sendInvite = async () => {
    if (propertyIds.length === 0 || !prospectEmail.trim()) return;
    // Room targeting only applies to a single-property send.
    const { listingRoomId } = !isMultiListing && roomChoice ? parseRoomChoiceValue(roomChoice) : { listingRoomId: undefined };
    const roomName = !isMultiListing && roomChoice ? roomOptions.find((o) => o.value === roomChoice)?.label : undefined;
    setSendBusy(true);
    try {
      if (isDemoModeActive()) {
        logDemoOutboundEmail(
          prospectEmail.trim(),
          leadInviteSubject(kind, propertyTitle, isMultiListing ? propertyIds.length : undefined),
          invitePreviewBody,
        );
        showToast(kind === "listing" ? "Listing sent (demo)." : "Invite sent (demo).");
        setSendPreviewOpen(false);
        onClose();
        return;
      }
      const res = await fetch("/api/portal/send-lead-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          to: prospectEmail.trim(),
          prospectName: prospectName.trim() || undefined,
          propertyId: propertyIds[0],
          propertyIds,
          listingRoomId: listingRoomId || undefined,
          roomName: roomName || undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; mailtoHref?: string };
      if (data.ok) {
        showToast(kind === "listing" ? "Listing sent." : "Invite sent.");
        setSendPreviewOpen(false);
        onClose();
        return;
      }
      if (data.mailtoHref) {
        window.location.href = data.mailtoHref;
        showToast(data.error ?? "Opened your email app.");
        setSendPreviewOpen(false);
        return;
      }
      showToast(data.error ?? "Could not send invite.");
    } catch {
      showToast("Could not send invite.");
    } finally {
      setSendBusy(false);
    }
  };

  const title = kind === "listing" ? "Send listing" : kind === "apply" ? "Invite to apply" : "Share tour link";

  return (
    <>
      <Modal open={open} title={title} onClose={onClose} panelClassName="max-w-lg">
        <div className="space-y-4">
          {properties.length === 0 ? (
            <p className="text-sm text-muted">
              No active properties yet. List a property as active before sharing apply or tour links.
            </p>
          ) : (
            <>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor="share-lead-property"
                    className="block text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    {multiEnabled ? "Properties" : "Property"}
                  </label>
                  {multiEnabled ? (
                    <div className="flex items-center gap-3 text-[11px] font-semibold">
                      <button
                        type="button"
                        className="text-primary hover:opacity-90 disabled:opacity-40"
                        data-attr="share-lead-select-all"
                        disabled={propertyIds.length === properties.length}
                        onClick={() => {
                          setPropertyIds(properties.map((p) => p.id));
                          setRoomChoice("");
                        }}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-muted hover:text-foreground disabled:opacity-40"
                        data-attr="share-lead-clear"
                        disabled={propertyIds.length === 0}
                        onClick={() => {
                          setPropertyIds([]);
                          setRoomChoice("");
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>
                {multiEnabled ? (
                  <CheckboxMultiSelect
                    label="Properties"
                    dataAttr="share-lead-property-multi"
                    emptyLabel="Select properties"
                    emptyMenuText="No properties"
                    options={properties.map((p) => ({ value: p.id, label: p.label }))}
                    selected={propertyIds}
                    onChange={(next) => {
                      setPropertyIds(next);
                      setRoomChoice("");
                    }}
                  />
                ) : (
                  <Select
                    id="share-lead-property"
                    value={singlePropertyId}
                    onChange={(e) => {
                      setPropertyIds(e.target.value ? [e.target.value] : []);
                      setRoomChoice("");
                    }}
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              {(kind === "apply" || kind === "listing") && !isMultiListing && roomOptions.length > 0 ? (
                <div>
                  <label htmlFor="share-lead-room" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                    Room (optional)
                  </label>
                  <Select id="share-lead-room" value={roomChoice} onChange={(e) => setRoomChoice(e.target.value)}>
                    <option value="">Any room</option>
                    {roomOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}

              {kind === "listing" ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    {isMultiListing ? "Public browse link" : "Public listing link"}
                  </p>
                  <div className="rounded-xl border border-border bg-accent/30 px-3 py-2.5 text-xs leading-relaxed text-muted break-all">
                    {linkUrl || "Select a property to generate a link."}
                  </div>
                  {isMultiListing ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">
                      Opens the browse page filtered to the {propertyIds.length} homes you selected.
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 rounded-full"
                    disabled={!linkUrl}
                    onClick={() => void handleCopy()}
                  >
                    {isMultiListing ? "Copy browse link" : "Copy listing link"}
                  </Button>
                </div>
              ) : null}

              {kind !== "listing" ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Link preview</p>
                  <div className="rounded-xl border border-border bg-accent/30 px-3 py-2.5 text-xs leading-relaxed text-muted break-all">
                    {linkUrl || "Select a property to generate a link."}
                  </div>
                  <Button type="button" variant="outline" className="mt-2 rounded-full" disabled={!linkUrl} onClick={() => void handleCopy()}>
                    Copy link
                  </Button>
                  {kind === "apply" ? (
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      Applicants create a resident account first, then complete the application in their portal.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="border-t border-border pt-4">
                <p className="text-sm font-semibold text-foreground">Send to prospect</p>
                {kind !== "listing" ? (
                  <p className="mt-1 text-xs text-muted">
                    Email an invite with the link above. You can add an optional note.
                  </p>
                ) : null}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="share-lead-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                      Name (optional)
                    </label>
                    <Input
                      id="share-lead-name"
                      value={prospectName}
                      onChange={(e) => setProspectName(e.target.value)}
                      placeholder="Prospect name"
                    />
                  </div>
                  <div>
                    <label htmlFor="share-lead-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                      Email
                    </label>
                    <Input
                      id="share-lead-email"
                      type="email"
                      value={prospectEmail}
                      onChange={(e) => setProspectEmail(e.target.value)}
                      placeholder="prospect@example.com"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label htmlFor="share-lead-note" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                    Note (optional)
                  </label>
                  <textarea
                    id="share-lead-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary/25"
                    placeholder="Add context for the prospect…"
                  />
                </div>
              </div>

              <div className="sticky bottom-0 z-10 -mx-5 flex justify-start gap-2 border-t border-border bg-inherit px-5 py-4 sm:-mx-6 sm:px-6">
                <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
                  Close
                </Button>
                <Button type="button" variant="primary" className="rounded-full" disabled={propertyIds.length === 0} onClick={openSendPreview}>
                  Preview & send
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <PortalNotificationPreviewModal
        open={sendPreviewOpen}
        title={kind === "listing" ? "Send listing" : "Send invite"}
        onClose={() => setSendPreviewOpen(false)}
        recipient={prospectEmail.trim()}
        subject={leadInviteSubject(kind, propertyTitle, isMultiListing ? propertyIds.length : undefined)}
        body={invitePreviewBody}
        intro="Review the email before sending."
        footerNote="Sent via PropLane when email delivery is configured."
        confirmLabel={kind === "listing" ? "Send listing" : "Send invite"}
        confirmBusy={sendBusy}
        confirmBusyLabel="Sending…"
        onConfirm={(skipMessage) => {
          if (skipMessage) {
            setSendPreviewOpen(false);
            return;
          }
          void sendInvite();
        }}
        panelClassName="max-w-lg"
      />
    </>
  );
}
