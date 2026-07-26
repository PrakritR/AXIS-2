"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import type { MockProperty } from "@/data/types";
import { ListingDetailSections } from "@/components/marketing/listing-detail-sections";
import { ListingPreviewScrollShell } from "@/components/marketing/listing-preview-scroll-shell";
import { getListingRichContent } from "@/data/listing-rich-content";
import { ManagerAddListingForm } from "@/components/portal/manager-add-listing-form";
import { ManagerPropertyHouseDetailsPanel } from "@/components/portal/manager-property-house-details-panel";
import { ManagerPropertyApplicationQuestionsPanel } from "@/components/portal/manager-property-application-questions-panel";
import { ManagerPropertyLeasePanel } from "@/components/portal/manager-property-lease-panel";
import { ManagerPropertyPromotionPanel } from "@/components/portal/manager-property-promotion-panel";
import { ManagerPropertyTourPanel } from "@/components/portal/manager-property-tour-panel";
import { ShareLeadLinkModal } from "@/components/portal/share-lead-link-modal";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableColGroup,
  PortalDataTableEmpty,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PORTAL_MOBILE_CARD_CLASS,
  PortalTableInlineExpand,
  createPortalRowExpandClick,
  portalTableColumnPercents,
} from "@/components/portal/portal-data-table";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { useListingContactSmsPhone } from "@/hooks/use-listing-contact-sms-phone";
import { isDemoModeActive, resolveManagerScopeUserId } from "@/lib/demo/demo-session";
import {
  adminPropertyRentDisplayLabel,
  compareAdminPropertyRowsForDisplay,
  deleteManagerLiveListing,
  deleteManagerPropertyDraft,
  deleteUnlistedManagerProperty,
  listAdminRow,
  readAdminPropertyRows,
  resolveAdminPropertyRowPreview,
  unlistManagerListing,
  type AdminPropertyBucketIndex,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";
import { parseMonthlyRent } from "@/lib/listings-search";
import {
  PROPERTY_PIPELINE_EVENT,
  countManagerManagedPropertiesForUser,
  mirrorLocalPropertyPipelineToServer,
  readExtraListingsForUser,
} from "@/lib/demo-property-pipeline";
import { samePropertyId } from "@/lib/co-manager-calendar";
import {
  collectLinkedPropertyIds,
  hasLinkedPropertyModuleLevel,
  linkedPropertyOwnerId,
  syncManagerPortfolioFromServer,
} from "@/lib/manager-portfolio-access";

const OWNERSHIP_BADGE_OWNED =
  "inline-flex rounded-full border border-border bg-accent/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground";
const OWNERSHIP_BADGE_LINKED =
  "inline-flex rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted";

function propertyIdIsLinked(pid: string, linkedIds: Set<string>): boolean {
  if (!pid) return false;
  if (linkedIds.has(pid)) return true;
  for (const id of linkedIds) {
    if (samePropertyId(id, pid)) return true;
  }
  return false;
}
import { resolvePropertySaveTarget } from "@/lib/manager-property-save-target";
import {
  legacyAdminFieldsToSubmission,
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { withListingContactSmsPhone } from "@/lib/listing-contact-sms";

function submissionForListedEdit(p: MockProperty): ManagerListingSubmissionV1 {
  if (p.listingSubmission) return normalizeManagerListingSubmissionV1(p.listingSubmission);
  const rentNum = parseMonthlyRent(String(p.rentLabel ?? "")) ?? 0;
  return normalizeManagerListingSubmissionV1(
    legacyAdminFieldsToSubmission({
      buildingName: p.buildingName,
      address: p.address,
      zip: p.zip,
      neighborhood: p.neighborhood,
      unitLabel: p.unitLabel,
      beds: p.beds,
      baths: p.baths,
      monthlyRent: rentNum,
      petFriendly: p.petFriendly,
      tagline: p.tagline,
    }),
  );
}

function submissionForAdminRow(row: AdminPropertyRow): ManagerListingSubmissionV1 {
  if (row.submission) return normalizeManagerListingSubmissionV1(row.submission);
  return normalizeManagerListingSubmissionV1(
    legacyAdminFieldsToSubmission({
      buildingName: row.buildingName,
      address: row.address,
      zip: row.zip,
      neighborhood: row.neighborhood,
      unitLabel: row.unitLabel,
      beds: row.beds,
      baths: row.baths,
      monthlyRent: row.monthlyRent,
      petFriendly: row.petFriendly,
      tagline: row.tagline,
    }),
  );
}

/** Lets the browser paint after click before heavy localStorage writes (better INP on delete/unlist). */
function deferCatalogMutation(fn: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}

const MANAGER_STAGES = [
  { key: "listed", label: "Listed", buckets: [2] as AdminPropertyBucketIndex[] },
  { key: "unlisted", label: "Unlisted", buckets: [3] as AdminPropertyBucketIndex[] },
  { key: "drafts", label: "Drafts", buckets: [5] as AdminPropertyBucketIndex[] },
] as const;

export type ManagerStageKey = (typeof MANAGER_STAGES)[number]["key"];

export const MANAGER_PROPERTY_EMPTY_COPY: Record<ManagerStageKey, string> = {
  listed: "No listed properties.",
  unlisted: "No unlisted properties.",
  drafts: "No saved drafts. Start a new property — close the wizard any time and your progress is saved here to finish later.",
};

/** A draft can be saved before it has a name — never render an empty title cell. */
function managerPropertyRowTitle(row: AdminPropertyRow, bucket: AdminPropertyBucketIndex): string {
  return row.buildingName.trim() || (bucket === 5 ? "Untitled draft" : "Untitled property");
}

export function managerStageFromParam(raw: string | null): ManagerStageKey {
  return MANAGER_STAGES.some((stage) => stage.key === raw) ? (raw as ManagerStageKey) : "listed";
}

export { MANAGER_STAGES };

function ManagerPropertyInlineDetails({
  bucket,
  row,
  onUpdated,
  showToast,
  managerUserId,
  skuTier,
  skuLoaded,
  propCount,
  onSendToProspect,
}: {
  bucket: AdminPropertyBucketIndex;
  row: AdminPropertyRow | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  managerUserId: string | null;
  skuTier: string | null;
  skuLoaded: boolean;
  propCount: number;
  onSendToProspect?: (listingId: string) => void;
}) {
  const mock = useMemo(() => (row ? resolveAdminPropertyRowPreview(row) : null), [row]);
  const contactSmsPhone = useListingContactSmsPhone({
    listingId: row?.listingId,
    ownerManagerUserId: row?.managerUserId,
    viewerManagerUserId: managerUserId,
  });
  const previewProperty = useMemo(
    () => (mock ? withListingContactSmsPhone(mock, contactSmsPhone) : null),
    [mock, contactSmsPhone],
  );
  const rich = useMemo(() => (previewProperty ? getListingRichContent(previewProperty) : null), [previewProperty]);
  const hasPreview = Boolean(previewProperty && rich);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const listingId = row?.listingId;
  const stablePropertyId = row?.listingId?.trim() || row?.adminRefId?.trim() || null;

  const isLinkedProperty = Boolean(
    managerUserId && stablePropertyId && collectLinkedPropertyIds(managerUserId).has(stablePropertyId),
  );

  // For a LINKED property, the listing itself is owned by another manager and
  // stored under the owner's key. Resolve that owner so edits/deletes attribute
  // to and mutate the owner's record (the server re-checks the co-manager grant).
  const linkedOwnerId = useMemo(
    () =>
      isLinkedProperty && managerUserId && stablePropertyId
        ? linkedPropertyOwnerId(managerUserId, stablePropertyId)
        : null,
    [isLinkedProperty, managerUserId, stablePropertyId],
  );
  // Gate the destructive/edit actions on a linked property by the co-manager's
  // granted level for the `properties` module. Own properties always qualify.
  const canEditLevel =
    !isLinkedProperty ||
    Boolean(
      managerUserId &&
        stablePropertyId &&
        hasLinkedPropertyModuleLevel(managerUserId, stablePropertyId, "properties", "edit"),
    );
  const canDeleteLevel =
    !isLinkedProperty ||
    Boolean(
      managerUserId &&
        stablePropertyId &&
        hasLinkedPropertyModuleLevel(managerUserId, stablePropertyId, "properties", "delete"),
    );

  const portalSub = useMemo<
    | {
        sub: ManagerListingSubmissionV1;
        saveMode: "listing";
        saveId: string;
        listingId?: string;
        ownerUserId?: string;
      }
    | null
  >(() => {
    if (!managerUserId || !row) return null;

    const listingId = row.listingId?.trim() || undefined;
    if (listingId) {
      // Linked (co-managed) property: the listing lives under the OWNER's key in
      // the local mirror. Resolve it there and remember the owner so the edit
      // save + delete target the owner's record (server re-checks the grant).
      if (linkedOwnerId) {
        const owned = readExtraListingsForUser(linkedOwnerId).find((x) => x.id === listingId);
        if (owned) {
          return {
            sub: submissionForListedEdit(owned),
            saveMode: "listing",
            saveId: listingId,
            listingId,
            ownerUserId: linkedOwnerId,
          };
        }
      }
      const p = readExtraListingsForUser(managerUserId).find((x) => x.id === listingId);
      if (p) return { sub: submissionForListedEdit(p), saveMode: "listing", saveId: listingId, listingId };
    }

    return null;
  }, [managerUserId, row, linkedOwnerId]);

  // noteKey is stable per listing — derived from row identifiers so it doesn't depend on portalSub.
  const noteKey = useMemo(
    () => (managerUserId && stablePropertyId ? `${managerUserId}:${stablePropertyId}` : null),
    [managerUserId, stablePropertyId],
  );

  const displaySub = portalSub?.sub ?? null;
  const [listingEditorOpen, setListingEditorOpen] = useState(false);
  const [draftEditorOpen, setDraftEditorOpen] = useState(false);
  const [shareApplicationOpen, setShareApplicationOpen] = useState(false);

  const managerSubmission = useMemo(
    () => (row ? displaySub ?? submissionForAdminRow(row) : null),
    [displaySub, row],
  );

  const houseSaveTarget = useMemo(() => {
    if (!row) return null;
    return resolvePropertySaveTarget({
      portalSaveMode: portalSub?.saveMode,
      portalSaveId: portalSub?.saveId,
      bucket,
      adminRefId: row.adminRefId,
      listingId,
    });
  }, [portalSub, bucket, row, listingId]);

  const leasePropertyHint = useMemo(
    () =>
      row
        ? { buildingName: row.buildingName, unitLabel: row.unitLabel, rentLabel: row.rentRangeLabel }
        : undefined,
    [row],
  );

  const run = (label: string, ok: boolean, err = "Action could not be completed.") => {
    if (!ok) {
      showToast(err);
      return;
    }
    showToast(label);
    onUpdated();
  };

  const propertyShareLabel = row ? managerPropertyRowTitle(row, bucket) : "Property";
  const sharePropertyOptions = useMemo(
    () => (listingId ? [{ id: listingId, label: propertyShareLabel }] : []),
    [listingId, propertyShareLabel],
  );

  if (!row || !mock || !managerSubmission) return null;

  const actionBtnClass = "rounded-full";
  const sectionHeaderBtn = "h-8 rounded-full px-3 text-xs";
  const canEditListing = Boolean(displaySub && portalSub);
  // Show Edit only with write (`edit`) level and Delete only with `delete` level.
  // Own properties always qualify; a linked property is gated by the grant.
  const canEditAction = canEditListing && canEditLevel;
  const canDeleteAction = canEditListing && canDeleteLevel;
  // Listing edits/deletes for a linked property must mutate the OWNER's record.
  const listingOwnerUserId = portalSub?.ownerUserId ?? managerUserId;

  const openFullListingEditor = () => setListingEditorOpen(true);

  const applicationHeaderExtra =
    bucket === 2 && listingId ? (
      <Button
        type="button"
        variant="outline"
        className={`${actionBtnClass} h-8 px-3 text-xs`}
        data-attr="listing-send-application"
        onClick={(e) => {
          e.stopPropagation();
          setShareApplicationOpen(true);
        }}
      >
        Send application
      </Button>
    ) : null;

  const previewHeaderActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {bucket === 2 && listingId ? (
        <>
          <Button
            type="button"
            variant="outline"
            className={sectionHeaderBtn}
            data-attr="listing-send-listing"
            onClick={(e) => {
              e.stopPropagation();
              onSendToProspect?.(listingId);
            }}
          >
            Send listing
          </Button>
          {canEditAction ? (
            <Button
              type="button"
              variant="outline"
              className={sectionHeaderBtn}
              data-attr="listing-edit-full"
              onClick={(e) => {
                e.stopPropagation();
                openFullListingEditor();
              }}
            >
              Edit listing
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className={sectionHeaderBtn}
            data-attr="listing-unlist"
            onClick={(e) => {
              e.stopPropagation();
              deferCatalogMutation(() => run("Listing unlisted.", unlistManagerListing(listingId, managerUserId)));
            }}
          >
            Unlist
          </Button>
          {canDeleteAction ? (
            <Button
              type="button"
              variant="outline"
              className={`${sectionHeaderBtn} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
              data-attr="listing-delete"
              onClick={(e) => {
                e.stopPropagation();
                if (!window.confirm("Permanently delete this listing? It will be removed from your catalog.")) return;
                deferCatalogMutation(() =>
                  run("Listing deleted.", deleteManagerLiveListing(listingId, listingOwnerUserId)),
                );
              }}
            >
              Delete listing
            </Button>
          ) : null}
        </>
      ) : null}

      {bucket === 3 ? (
        <>
          <Button
            type="button"
            variant="outline"
            className={sectionHeaderBtn}
            data-attr="listing-relist"
            onClick={(e) => {
              e.stopPropagation();
              deferCatalogMutation(() => {
                const id = listAdminRow(row, managerUserId);
                if (!id) {
                  showToast("Could not relist.");
                  return;
                }
                showToast("Listing is live again.");
                onUpdated();
              });
            }}
          >
            Relist property
          </Button>
          {canEditListing && canEditAction ? (
            <Button
              type="button"
              variant="outline"
              className={sectionHeaderBtn}
              data-attr="listing-edit-full"
              onClick={(e) => {
                e.stopPropagation();
                openFullListingEditor();
              }}
            >
              Edit listing
            </Button>
          ) : null}
          {canEditListing && canDeleteAction ? (
            <Button
              type="button"
              variant="outline"
              className={`${sectionHeaderBtn} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
              data-attr="listing-delete"
              onClick={(e) => {
                e.stopPropagation();
                if (!window.confirm("Remove this unlisted property from your queue permanently?")) return;
                deferCatalogMutation(() =>
                  run("Removed from queue.", deleteUnlistedManagerProperty(row.adminRefId, managerUserId)),
                );
              }}
            >
              Delete from queue
            </Button>
          ) : null}
        </>
      ) : null}

      {bucket === 5 ? (
        <>
          <Button
            type="button"
            variant="primary"
            className={sectionHeaderBtn}
            data-attr="draft-continue-editing"
            onClick={(e) => {
              e.stopPropagation();
              if (!skuLoaded) {
                showToast("Loading subscription…");
                return;
              }
              setDraftEditorOpen(true);
            }}
          >
            Continue editing
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`${sectionHeaderBtn} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
            data-attr="draft-delete"
            onClick={(e) => {
              e.stopPropagation();
              if (!window.confirm("Delete this draft? Your saved progress will be removed.")) return;
              deferCatalogMutation(() => {
                void deleteManagerPropertyDraft(row.adminRefId, managerUserId).then((ok) =>
                  run("Draft deleted.", ok, "Could not delete the draft. Check your connection and try again."),
                );
              });
            }}
          >
            Delete draft
          </Button>
        </>
      ) : null}
    </div>
  );

  const listingFormProps = portalSub
    ? {
        onClose: () => {
          setListingEditorOpen(false);
        },
        onSubmitted: () => {
          setListingEditorOpen(false);
          onUpdated();
        },
        showToast,
        skuTier,
        propCountBeforeSubmit: propCount,
        initialSubmission: portalSub.sub,
        noteKey,
        editPendingId: null,
        editListingId: portalSub.saveId,
        editRequestChangeId: null,
        editListingOwnerUserId: portalSub.ownerUserId ?? null,
      }
    : null;

  // Resume a saved draft in the full wizard. On final submit the wizard publishes
  // this draft in place (draft → live) and removes it from the drafts bucket.
  const draftFormProps =
    bucket === 5 && managerUserId
      ? {
          onClose: () => setDraftEditorOpen(false),
          onSubmitted: () => {
            setDraftEditorOpen(false);
            showToast("Listing submitted and published.");
            onUpdated();
          },
          onSaved: onUpdated,
          showToast,
          skuTier,
          propCountBeforeSubmit: propCount,
          initialSubmission: managerSubmission,
          noteKey,
          editDraftId: row.adminRefId,
          initialStepIndex: row.draftStepIndex ?? null,
          initialMaxStepReached: row.draftMaxStepReached ?? null,
        }
      : null;

  return (
    <div className="space-y-2">
      <PortalCollapsibleSection
        title="Preview"
        titleVariant="label"
        expanded={previewExpanded}
        onExpandedChange={setPreviewExpanded}
        collapsible={hasPreview || bucket === 3 || bucket === 5}
        surfaceMuted={false}
        headerActionsInline
        toggleDataAttr="listing-preview-toggle"
        headerActions={previewHeaderActions}
        contentClassName="p-0"
      >
        {hasPreview ? (
          <ListingPreviewScrollShell className="max-h-[min(70vh,560px)] rounded-b-2xl">
            <ListingDetailSections property={previewProperty!} rich={rich!} previewModal hidePreviewSubnav />
          </ListingPreviewScrollShell>
        ) : bucket === 3 || bucket === 5 ? (
          <p className="px-4 py-3 text-sm text-muted">
            {bucket === 5
              ? "Finish the draft wizard to see a public preview."
              : "Relist this property to restore the public preview."}
          </p>
        ) : null}
      </PortalCollapsibleSection>

      {bucket !== 3 && bucket !== 5 ? (
        <>
          <ManagerPropertyHouseDetailsPanel
            noteKey={noteKey}
            sub={managerSubmission}
            saveTarget={houseSaveTarget}
            managerUserId={managerUserId}
            onUpdated={onUpdated}
            showToast={showToast}
          />

          <ManagerPropertyApplicationQuestionsPanel
            sub={managerSubmission}
            saveTarget={houseSaveTarget}
            managerUserId={managerUserId}
            onUpdated={onUpdated}
            showToast={showToast}
            headerActionsExtra={applicationHeaderExtra}
          />

          <ManagerPropertyLeasePanel
            sub={managerSubmission}
            saveTarget={houseSaveTarget}
            managerUserId={managerUserId}
            propertyId={stablePropertyId}
            propertyLabel={leasePropertyHint?.buildingName ?? row?.buildingName}
            onUpdated={onUpdated}
            showToast={showToast}
            propertyHint={leasePropertyHint}
            demoMode={isDemoModeActive()}
          />

          {bucket === 2 && listingId ? (
            <ManagerPropertyTourPanel
              listingId={listingId}
              managerUserId={managerUserId}
              propertyLabel={propertyShareLabel}
              showToast={showToast}
            />
          ) : null}
        </>
      ) : null}

      {bucket === 2 && listingId ? (
        <ManagerPropertyPromotionPanel
          listingId={listingId}
          showToast={showToast}
          onUpdated={onUpdated}
        />
      ) : null}

      {listingId ? (
        <ShareLeadLinkModal
          open={shareApplicationOpen}
          onClose={() => setShareApplicationOpen(false)}
          kind="apply"
          properties={sharePropertyOptions}
          preselectedPropertyId={listingId}
        />
      ) : null}

      {listingEditorOpen && listingFormProps ? (
        <ManagerAddListingForm {...listingFormProps} wizardScope="full" />
      ) : null}

      {draftEditorOpen && draftFormProps ? (
        <ManagerAddListingForm {...draftFormProps} wizardScope="full" />
      ) : null}
    </div>
  );
}

export function ManagerHousePropertiesPanel({
  showToast,
  activeStage,
  onSendToProspect,
  skuTier,
  skuLoaded,
}: {
  showToast: (m: string) => void;
  activeStage: ManagerStageKey;
  onStageChange: (stage: ManagerStageKey) => void;
  onSendToProspect?: (listingId: string) => void;
  /** Plan tier from the page-level subscription load — publishing a draft is gated on it. */
  skuTier: string | null;
  /** False until that load settles; publishing must not proceed on an unknown plan. */
  skuLoaded: boolean;
}) {
  const { userId: managerUserId, ready: authReady } = useManagerUserId();
  const scopeUserId = resolveManagerScopeUserId(managerUserId);
  const [tick, setTick] = useState(0);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const propCount = useMemo(() => {
    void tick;
    return countManagerManagedPropertiesForUser(scopeUserId);
  }, [tick, scopeUserId]);

  useEffect(() => {
    if (!scopeUserId) return;
    if (!isDemoModeActive()) {
      void syncManagerPortfolioFromServer(scopeUserId, { force: true }).then(() => {
        setTick((t) => t + 1);
        void mirrorLocalPropertyPipelineToServer(scopeUserId, collectLinkedPropertyIds(scopeUserId));
      });
    } else {
      setTick((t) => t + 1);
    }
    const on = () => {
      if (isDemoModeActive()) {
        setTick((t) => t + 1);
        return;
      }
      void syncManagerPortfolioFromServer(scopeUserId, { force: true }).then(() => setTick((t) => t + 1));
    };
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("axis-pro-relationships", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("axis-pro-relationships", on);
    };
  }, [scopeUserId]);


  const rows = useMemo(() => {
    void tick;
    if (!scopeUserId) return [] as Array<{ sourceBucket: AdminPropertyBucketIndex; row: AdminPropertyRow; linked: boolean }>;
    const stage = MANAGER_STAGES.find((item) => item.key === activeStage);
    if (!stage) return [];
    const linkedIds = collectLinkedPropertyIds(scopeUserId);
    const mapped = stage.buckets.flatMap((bucket) =>
      readAdminPropertyRows(bucket, scopeUserId).map((row) => {
        const pid = row.listingId?.trim() || row.adminRefId.trim();
        return {
          sourceBucket: bucket,
          row,
          linked: propertyIdIsLinked(pid, linkedIds),
        };
      }),
    );
    return [...mapped].sort((a, b) => compareAdminPropertyRowsForDisplay(a.row, b.row));
  }, [tick, scopeUserId, activeStage]);

  if (!authReady) {
    return <p className="text-sm text-muted">Loading your properties…</p>;
  }
  if (!scopeUserId) {
    return <p className="text-sm text-muted">Sign in to view and manage your properties.</p>;
  }

  const renderRowDetail = (sourceBucket: AdminPropertyBucketIndex, row: AdminPropertyRow, rowKey: string) => (
    <ManagerPropertyInlineDetails
      key={rowKey}
      bucket={sourceBucket}
      row={row}
      onUpdated={() => setTick((t) => t + 1)}
      showToast={showToast}
      managerUserId={managerUserId}
      skuTier={skuTier}
      skuLoaded={skuLoaded}
      propCount={propCount}
      onSendToProspect={onSendToProspect}
    />
  );

  return (
    <>
      {rows.length === 0 ? (
        <PortalDataTableEmpty message={MANAGER_PROPERTY_EMPTY_COPY[activeStage]} icon="default" />
      ) : (
        <>
          <div className="space-y-2 lg:hidden">
            {rows.map(({ sourceBucket, row, linked }) => {
              const rowKey = row.adminRefId + (row.listingId ?? "");
              const expanded = expandedRowKey === rowKey;

              return (
                <div key={rowKey} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button
                    type="button"
                    className="flex w-full gap-2 text-left"
                    onClick={() => setExpandedRowKey(expanded ? null : rowKey)}
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex-1">
                      <PortalTableInlineExpand expanded={expanded} className="font-medium text-foreground">
                        <span className="truncate">{managerPropertyRowTitle(row, sourceBucket)}</span>
                      </PortalTableInlineExpand>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        {row.address}
                        {row.zip ? `, ${row.zip}` : ""}
                      </p>
                      <p className="mt-1.5 text-xs text-muted">
                        <span className="font-medium text-foreground">{adminPropertyRentDisplayLabel(row)}</span> · {row.beds} bd / {row.baths}{" "}
                        ba · {row.neighborhood}
                      </p>
                      <p className="mt-1.5">
                        <span className={linked ? OWNERSHIP_BADGE_LINKED : OWNERSHIP_BADGE_OWNED}>
                          {linked ? "Co-managed" : "Owned"}
                        </span>
                      </p>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="mt-3 border-t border-border pt-3">
                      {renderRowDetail(sourceBucket, row, rowKey)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className={PORTAL_DATA_TABLE}>
                <PortalDataTableColGroup percents={portalTableColumnPercents(2)} />
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ sourceBucket, row, linked }) => {
                    const rowKey = row.adminRefId + (row.listingId ?? "");
                    const expanded = expandedRowKey === rowKey;

                    return (
                      <Fragment key={rowKey}>
                        <tr
                          className={PORTAL_TABLE_TR_EXPANDABLE}
                          onClick={createPortalRowExpandClick(() =>
                            setExpandedRowKey(expanded ? null : rowKey),
                          )}
                          aria-expanded={expanded}
                        >
                          <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                            <PortalTableInlineExpand expanded={expanded}>
                              {managerPropertyRowTitle(row, sourceBucket)}
                            </PortalTableInlineExpand>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted">
                              {row.address}
                              {row.zip ? `, ${row.zip}` : ""}
                            </p>
                            <p className="mt-1.5">
                              <span className={linked ? OWNERSHIP_BADGE_LINKED : OWNERSHIP_BADGE_OWNED}>
                                {linked ? "Co-managed" : "Owned"}
                              </span>
                            </p>
                          </td>
                          <td className={PORTAL_TABLE_TD}>
                            <p className="text-xs text-muted">
                              <span className="font-medium text-foreground">{adminPropertyRentDisplayLabel(row)}</span> · {row.beds} bd / {row.baths}{" "}
                              ba · {row.neighborhood}
                            </p>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={2} className={PORTAL_TABLE_DETAIL_CELL}>
                              {renderRowDetail(sourceBucket, row, rowKey)}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
