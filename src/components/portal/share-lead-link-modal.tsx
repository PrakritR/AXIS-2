"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
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
  buildManagerPortfolioTourUrl,
  buildManagerTourUrl,
  copyTextToClipboard,
} from "@/lib/manager-property-links";
import type { ManagerPropertyFilterOption } from "@/lib/manager-portfolio-access";
import { getPropertyById, getRoomOptionsForProperty, parseRoomChoiceValue } from "@/lib/rental-application/data";
import { buildListingShareSummary } from "@/lib/listing-share-summary";

const FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

function ShareLinkCopyRow({
  label,
  url,
  copyLabel,
  onCopy,
  hint,
}: {
  label: string;
  url: string;
  copyLabel: string;
  onCopy: () => void;
  hint?: ReactNode;
}) {
  return (
    <div>
      <p className={FIELD_LABEL_CLASS}>{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="flex min-h-10 min-w-0 flex-1 items-center rounded-xl border border-border bg-accent/30 px-3 py-2 text-xs leading-relaxed text-muted break-all">
          {url || "Select a property to generate a link."}
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 rounded-full px-4 sm:h-auto sm:self-stretch"
          disabled={!url}
          onClick={onCopy}
        >
          {copyLabel}
        </Button>
      </div>
      {hint ? <div className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</div> : null}
    </div>
  );
}


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
  const multiEnabled = properties.length > 1;
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [roomChoice, setRoomChoice] = useState("");
  const [applyRentalType, setApplyRentalType] = useState<"standard" | "short_term">("standard");
  const [prospectName, setProspectName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [note, setNote] = useState("");
  const [sendPreviewOpen, setSendPreviewOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => {
      const initialId =
        preselectedPropertyId && properties.some((p) => p.id === preselectedPropertyId)
          ? preselectedPropertyId
          : properties[0]?.id ?? "";
      setPropertyIds(initialId ? [initialId] : []);
      setRoomChoice("");
      setApplyRentalType("standard");
      setProspectName("");
      setProspectEmail("");
      setNote("");
      setSendPreviewOpen(false);
      setSendBusy(false);
    });
  }, [open, kind, preselectedPropertyId, properties]);

  const singlePropertyId = propertyIds.length === 1 ? propertyIds[0] : "";
  const isMultiProperty = propertyIds.length > 1;
  const isMultiListing = kind === "listing" && isMultiProperty;
  const isMultiApply = kind === "apply" && isMultiProperty;
  const isPortfolioTour = kind === "tour" && isMultiProperty;

  const propertyTitle = useMemo(() => {
    if (isMultiProperty) {
      return kind === "tour" ? `${propertyIds.length} properties` : `${propertyIds.length} homes`;
    }
    if (!singlePropertyId) return "";
    return properties.find((p) => p.id === singlePropertyId)?.label ?? singlePropertyId;
  }, [properties, singlePropertyId, isMultiProperty, propertyIds.length, kind]);

  const portfolioTourUrl = useMemo(() => {
    if (!isPortfolioTour || typeof window === "undefined") return "";
    return buildManagerPortfolioTourUrl(window.location.origin, propertyIds);
  }, [isPortfolioTour, propertyIds]);

  const individualTourLinks = useMemo(() => {
    if (kind !== "tour" || typeof window === "undefined") return [];
    const origin = window.location.origin;
    const selected = new Set(propertyIds);
    return properties
      .filter((property) => selected.has(property.id))
      .map((property) => ({
        id: property.id,
        label: property.label,
        url: buildManagerTourUrl(origin, property.id),
      }));
  }, [kind, properties, propertyIds]);

  const roomOptions = useMemo(() => {
    if (kind !== "apply" || !singlePropertyId) return [];
    return getRoomOptionsForProperty(singlePropertyId, { includeUnavailable: true }).filter((o) => o.value);
  }, [kind, singlePropertyId]);

  const linkUrl = useMemo(() => {
    if (propertyIds.length === 0 || typeof window === "undefined") return "";
    const origin = window.location.origin;
    if (isPortfolioTour) return portfolioTourUrl;
    if (isMultiListing || isMultiApply) return buildManagerBrowseUrl(origin, propertyIds);
    if (!singlePropertyId) return "";
    if (kind === "tour") return buildManagerTourUrl(origin, singlePropertyId);
    if (kind === "listing") return buildManagerListingUrl(origin, singlePropertyId);
    const { listingRoomId } = roomChoice ? parseRoomChoiceValue(roomChoice) : { listingRoomId: undefined };
    const roomName = roomChoice ? roomOptions.find((o) => o.value === roomChoice)?.label : undefined;
    return buildManagerApplyUrl(origin, {
      propertyId: singlePropertyId,
      listingRoomId: listingRoomId || undefined,
      roomName: roomName || undefined,
      rentalType: applyRentalType,
    });
  }, [kind, propertyIds, singlePropertyId, isMultiListing, isMultiApply, isPortfolioTour, portfolioTourUrl, roomChoice, roomOptions, applyRentalType]);

  const listingSummary = useMemo(() => {
    if (kind !== "listing" || isMultiListing || !singlePropertyId) return null;
    const property = getPropertyById(singlePropertyId);
    if (!property) return null;
    return buildListingShareSummary(property);
  }, [kind, singlePropertyId, isMultiListing]);

  const invitePreviewBody = useMemo(() => {
    if (!linkUrl) return "";
    if (isMultiProperty) {
      return buildLeadInviteEmailBody({
        kind,
        prospectName: prospectName.trim() || undefined,
        propertyTitle,
        linkUrl,
        listingCount: isMultiListing || isMultiApply ? propertyIds.length : undefined,
        tourCount: isPortfolioTour ? propertyIds.length : undefined,
        managerNote: note.trim() || undefined,
      });
    }
    return buildLeadInviteEmailBody({
      kind,
      prospectName: prospectName.trim() || undefined,
      propertyTitle,
      linkUrl: kind === "listing" ? buildManagerApplyUrl(typeof window !== "undefined" ? window.location.origin : "", {
        propertyId: singlePropertyId,
      }) : linkUrl,
      listingPageUrl: kind === "listing" ? linkUrl : undefined,
      tourUrl:
        kind === "listing" && singlePropertyId && typeof window !== "undefined"
          ? buildManagerTourUrl(window.location.origin, singlePropertyId)
          : undefined,
      listingSummary: listingSummary ?? undefined,
      managerNote: note.trim() || undefined,
    });
  }, [kind, prospectName, propertyTitle, linkUrl, singlePropertyId, isMultiProperty, isMultiListing, isPortfolioTour, isMultiApply, propertyIds.length, roomChoice, roomOptions, listingSummary, note]);

  const sendListingRoomParams = useMemo(() => {
    if (kind === "listing" || isMultiListing || isMultiApply) {
      return { listingRoomId: undefined, roomName: undefined };
    }
    if (!roomChoice) return { listingRoomId: undefined, roomName: undefined };
    const { listingRoomId } = parseRoomChoiceValue(roomChoice);
    return {
      listingRoomId: listingRoomId || undefined,
      roomName: roomOptions.find((o) => o.value === roomChoice)?.label,
    };
  }, [kind, isMultiListing, isMultiApply, roomChoice, roomOptions]);

  const handleCopy = async (text: string, successMessage: string) => {
    if (!text) {
      showToast("Select a property first.");
      return;
    }
    const ok = await copyTextToClipboard(text);
    showToast(ok ? successMessage : "Could not copy link.");
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
    const { listingRoomId, roomName } = sendListingRoomParams;
    setSendBusy(true);
    try {
      if (isDemoModeActive()) {
        logDemoOutboundEmail(
          prospectEmail.trim(),
          leadInviteSubject(kind, propertyTitle, isMultiProperty ? propertyIds.length : undefined),
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

  const title = kind === "listing" ? "Send listing" : kind === "apply" ? "Send application" : "Send tour link";

  const actionFooter =
    properties.length > 0 ? (
      <ModalFooter>
        <Button type="button" variant="primary" className="rounded-full" disabled={propertyIds.length === 0} onClick={openSendPreview}>
          Preview & send
        </Button>
      </ModalFooter>
    ) : undefined;

  return (
    <>
      <Modal open={open} title={title} onClose={onClose} panelClassName="max-w-lg" footer={actionFooter}>
        <div className="space-y-4">
          {properties.length === 0 ? (
            <p className="text-sm text-muted">
              No active properties yet. List a property as active before sharing apply or tour links.
            </p>
          ) : (
            <>
              {multiEnabled ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor="share-lead-property-multi" className={FIELD_LABEL_CLASS}>
                      Properties
                    </label>
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
                  </div>
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
                </div>
              ) : (
                <div
                  className={
                    kind === "apply" && roomOptions.length > 0 ? "grid gap-3 sm:grid-cols-2" : undefined
                  }
                >
                  <div>
                    <label htmlFor="share-lead-property" className={FIELD_LABEL_CLASS}>
                      Property
                    </label>
                    <Select
                      id="share-lead-property"
                      value={singlePropertyId}
                      onChange={(e) => {
                        const next = e.target.value;
                        setPropertyIds(next ? [next] : []);
                        setRoomChoice("");
                      }}
                    >
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {kind === "apply" && roomOptions.length > 0 ? (
                    <div>
                      <label htmlFor="share-lead-room" className={FIELD_LABEL_CLASS}>
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
                </div>
              )}

              {kind === "apply" && !isMultiApply ? (
                <div>
                  <label htmlFor="share-lead-application-type" className={FIELD_LABEL_CLASS}>
                    Application
                  </label>
                  <Select
                    id="share-lead-application-type"
                    value={applyRentalType}
                    onChange={(e) => setApplyRentalType(e.target.value === "short_term" ? "short_term" : "standard")}
                  >
                    <option value="standard">Long-term lease</option>
                    <option value="short_term">Short-term stay</option>
                  </Select>
                </div>
              ) : null}

              {kind === "listing" ? (
                <ShareLinkCopyRow
                  label={isMultiListing ? "Public browse link" : "Public listing link"}
                  url={linkUrl}
                  copyLabel={isMultiListing ? "Copy browse link" : "Copy listing link"}
                  onCopy={() =>
                    void handleCopy(linkUrl, isMultiListing ? "Browse link copied." : "Listing link copied.")
                  }
                  hint={
                    isMultiListing
                      ? `Opens the browse page filtered to the ${propertyIds.length} homes you selected.`
                      : undefined
                  }
                />
              ) : null}

              {kind === "tour" ? (
                <div className="space-y-4">
                  {isPortfolioTour ? (
                    <ShareLinkCopyRow
                      label="Generic tour link"
                      url={portfolioTourUrl}
                      copyLabel="Copy generic tour link"
                      onCopy={() => void handleCopy(portfolioTourUrl, "Generic tour link copied.")}
                      hint="Prospects pick which property to tour before choosing a time."
                    />
                  ) : null}

                  {isPortfolioTour ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Property tour links</p>
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {individualTourLinks.map((entry) => (
                          <div key={entry.id} className="rounded-xl border border-border bg-accent/20 px-3 py-2.5">
                            <p className="mb-2 text-sm font-semibold text-foreground">{entry.label}</p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                              <div className="flex min-h-10 min-w-0 flex-1 items-center rounded-xl border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted break-all">
                                {entry.url}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10 shrink-0 rounded-full px-4 sm:h-auto sm:self-stretch"
                                onClick={() => void handleCopy(entry.url, "Tour link copied.")}
                              >
                                Copy link
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <ShareLinkCopyRow
                      label="Public tour link"
                      url={linkUrl}
                      copyLabel="Copy tour link"
                      onCopy={() => void handleCopy(linkUrl, "Tour link copied.")}
                    />
                  )}
                </div>
              ) : null}

              {kind === "apply" ? (
                <ShareLinkCopyRow
                  label={isMultiApply ? "Public browse link" : "Public application link"}
                  url={linkUrl}
                  copyLabel={isMultiApply ? "Copy browse link" : "Copy application link"}
                  onCopy={() =>
                    void handleCopy(linkUrl, isMultiApply ? "Browse link copied." : "Application link copied.")
                  }
                  hint={
                    isMultiApply
                      ? `Opens the browse page filtered to the ${propertyIds.length} homes you selected.`
                      : !isMultiApply
                        ? "Applicants create a resident account first, then complete the application in their portal."
                        : undefined
                  }
                />
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
                    <label htmlFor="share-lead-name" className={FIELD_LABEL_CLASS}>
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
                    <label htmlFor="share-lead-email" className={FIELD_LABEL_CLASS}>
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
                  <label htmlFor="share-lead-note" className={FIELD_LABEL_CLASS}>
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
            </>
          )}
        </div>
      </Modal>

      <PortalNotificationPreviewModal
        open={sendPreviewOpen}
        title={kind === "listing" ? "Send listing" : kind === "apply" ? "Send application" : "Send tour link"}
        onClose={() => setSendPreviewOpen(false)}
        recipient={prospectEmail.trim()}
        subject={leadInviteSubject(kind, propertyTitle, isMultiProperty ? propertyIds.length : undefined)}
        body={invitePreviewBody}
        intro="Review the email before sending."
        footerNote="Sent via PropLane when email delivery is configured."
        confirmLabel={kind === "listing" ? "Send listing" : kind === "apply" ? "Send application" : "Send tour link"}
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
