"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DestinationNav } from "@/components/ui/destination-nav";
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
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import { PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS } from "@/components/portal/portal-property-detail-section";
import { PortalRecordDetailPage } from "@/components/portal/portal-record-detail-page";
import {
  PROPERTY_DETAIL_TAB_LABELS,
  propertyDetailHref,
  parsePropertyDetailTab,
  type PropertyDetailTabId,
} from "@/lib/portal-detail-routes";
import { PortalPropertyRecordRow } from "@/components/portal/portal-record-row";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import { INBOX_LIST_SCROLL } from "@/components/portal/portal-inbox-ui";
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
  { key: "drafts", label: "Drafts", buckets: [5] as AdminPropertyBucketIndex[] },
  { key: "listed", label: "Listed", buckets: [2] as AdminPropertyBucketIndex[] },
  { key: "unlisted", label: "Unlisted", buckets: [3] as AdminPropertyBucketIndex[] },
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
  propertiesBase,
  stage,
  detailTab: detailTabProp = "preview",
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
  propertiesBase: string;
  stage: ManagerStageKey;
  detailTab?: PropertyDetailTabId;
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
  const detailTab = parsePropertyDetailTab(detailTabProp);
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
  const sectionHeaderBtn = PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS;
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
        className={`${actionBtnClass} ${PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}`}
        data-attr="listing-send-application"
        onClick={(e) => {
          e.stopPropagation();
          setShareApplicationOpen(true);
        }}
      >
        Send application
      </Button>
    ) : null;

  const dangerBtnClass = `${sectionHeaderBtn} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`;

  const previewDestructive =
    bucket === 2 && listingId && canDeleteAction ? (
      <Button
        type="button"
        variant="outline"
        className={dangerBtnClass}
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
    ) : bucket === 3 && canDeleteAction ? (
      <Button
        type="button"
        variant="outline"
        className={dangerBtnClass}
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
    ) : bucket === 5 ? (
      <Button
        type="button"
        variant="outline"
        className={dangerBtnClass}
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
    ) : null;

  const previewHeaderActions = (
    <PortalSectionActionRow variant="grid" destructive={previewDestructive}>
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
        </>
      ) : null}

      {bucket === 5 ? (
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
      ) : null}
    </PortalSectionActionRow>
  );

  const previewHasToolbar = bucket === 2 || bucket === 3 || bucket === 5;

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

  const propertyRouteKey = stablePropertyId || row.adminRefId;
  const availableTabs: PropertyDetailTabId[] =
    bucket === 3 || bucket === 5
      ? ["preview"]
      : bucket === 2 && listingId
        ? ["preview", "house-details", "application", "lease", "calendar", "promotion"]
        : ["preview", "house-details", "application", "lease"];
  const activeDetailTab = availableTabs.includes(detailTab) ? detailTab : availableTabs[0]!;

  return (
    <div className="space-y-3">
      <DestinationNav
        items={availableTabs.map((tab) => ({
          id: tab,
          label: PROPERTY_DETAIL_TAB_LABELS[tab],
          href: propertyDetailHref(propertiesBase, stage, propertyRouteKey, tab),
          dataAttr: `property-detail-tab-${tab}`,
        }))}
        activeId={activeDetailTab}
        ariaLabel="Property detail sections"
      />

      {activeDetailTab === "preview" ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {previewHasToolbar ? (
            <div className="border-b border-border bg-accent/30 px-3 py-2.5 md:px-4">{previewHeaderActions}</div>
          ) : null}
          {hasPreview ? (
            <ListingPreviewScrollShell
              className="max-lg:overflow-visible lg:max-h-[min(70vh,560px)]"
              pageScrollOnMobile
              subnavAppearance="portal"
            >
              <ListingDetailSections
                property={previewProperty!}
                rich={rich!}
                previewModal
                hidePreviewSubnav
                expandSectionsOnMobile
                managerPreviewChrome
              />
            </ListingPreviewScrollShell>
          ) : bucket === 3 || bucket === 5 ? (
            <p className="px-4 py-3 text-sm text-muted">
              {bucket === 5
                ? "Finish the draft wizard to see a public preview."
                : "Relist this property to restore the public preview."}
            </p>
          ) : null}
        </div>
      ) : null}

      {activeDetailTab === "house-details" && bucket !== 3 && bucket !== 5 ? (
        <ManagerPropertyHouseDetailsPanel
          noteKey={noteKey}
          sub={managerSubmission}
          saveTarget={houseSaveTarget}
          managerUserId={managerUserId}
          onUpdated={onUpdated}
          showToast={showToast}
        />
      ) : null}

      {activeDetailTab === "application" && bucket !== 3 && bucket !== 5 ? (
        <ManagerPropertyApplicationQuestionsPanel
          sub={managerSubmission}
          saveTarget={houseSaveTarget}
          managerUserId={managerUserId}
          onUpdated={onUpdated}
          showToast={showToast}
          headerActionsExtra={applicationHeaderExtra}
        />
      ) : null}

      {activeDetailTab === "lease" && bucket !== 3 && bucket !== 5 ? (
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
      ) : null}

      {activeDetailTab === "calendar" && bucket === 2 && listingId ? (
        <ManagerPropertyTourPanel
          listingId={listingId}
          managerUserId={managerUserId}
          propertyLabel={propertyShareLabel}
          showToast={showToast}
        />
      ) : null}

      {activeDetailTab === "promotion" && bucket === 2 && listingId ? (
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
  searchQuery = "",
  propertiesBase,
  propertyKey: propertyKeyProp,
  detailTab: detailTabProp,
}: {
  showToast: (m: string) => void;
  activeStage: ManagerStageKey;
  onStageChange: (stage: ManagerStageKey) => void;
  onSendToProspect?: (listingId: string) => void;
  skuTier: string | null;
  skuLoaded: boolean;
  searchQuery?: string;
  propertiesBase: string;
  propertyKey?: string;
  detailTab?: PropertyDetailTabId;
}) {
  const router = useRouter();
  const { userId: managerUserId, ready: authReady } = useManagerUserId();
  const scopeUserId = resolveManagerScopeUserId(managerUserId);
  const [tick, setTick] = useState(0);

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

  const visibleRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ row, sourceBucket }) => {
      const hay = [managerPropertyRowTitle(row, sourceBucket), row.address, row.zip]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchQuery]);

  const propertyKeyFromRow = (row: AdminPropertyRow) =>
    row.listingId?.trim() || row.adminRefId.trim();

  const routePropertyEntry = useMemo(() => {
    if (!propertyKeyProp) return null;
    const decoded = decodeURIComponent(propertyKeyProp);
    return (
      visibleRows.find(
        ({ row }) => propertyKeyFromRow(row) === decoded || row.adminRefId === decoded,
      ) ?? null
    );
  }, [propertyKeyProp, visibleRows]);

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
      propertiesBase={propertiesBase}
      stage={activeStage}
      detailTab={detailTabProp}
    />
  );

  if (propertyKeyProp) {
    if (!routePropertyEntry) {
      return (
        <PortalDataTableEmpty
          message="Property not found."
          icon="default"
        />
      );
    }
    const { sourceBucket, row } = routePropertyEntry;
    const rowKey = row.adminRefId + (row.listingId ?? "");
    const address = `${row.address}${row.zip ? `, ${row.zip}` : ""}`;
    return (
      <PortalRecordDetailPage
        title={managerPropertyRowTitle(row, sourceBucket)}
        subtitle={address}
        backHref={`${propertiesBase}/properties/${activeStage}`}
        backLabel="Back to properties"
        dataAttrBack="property-detail-back"
      >
        {renderRowDetail(sourceBucket, row, rowKey)}
      </PortalRecordDetailPage>
    );
  }

  return (
    <>
      {visibleRows.length === 0 ? (
        <PortalDataTableEmpty
          message={searchQuery.trim() ? "No properties match your search." : MANAGER_PROPERTY_EMPTY_COPY[activeStage]}
          icon="default"
        />
      ) : (
        <div className={INBOX_LIST_SCROLL}>
          {visibleRows.map(({ sourceBucket, row, linked }) => {
            const rowKey = row.adminRefId + (row.listingId ?? "");
            const address = `${row.address}${row.zip ? `, ${row.zip}` : ""}`;
            const summary = `${adminPropertyRentDisplayLabel(row)} · ${row.beds} bd / ${row.baths} ba · ${row.neighborhood}`;
            return (
              <PortalPropertyRecordRow
                key={rowKey}
                title={managerPropertyRowTitle(row, sourceBucket)}
                address={address}
                summary={summary}
                badge={
                  <span className={linked ? OWNERSHIP_BADGE_LINKED : OWNERSHIP_BADGE_OWNED}>
                    {linked ? "Co-managed" : "Owned"}
                  </span>
                }
                onOpen={() => {
                  const routeKey = propertyKeyFromRow(row);
                  router.push(
                    propertyDetailHref(
                      propertiesBase,
                      activeStage,
                      routeKey,
                      detailTabProp ?? "preview",
                    ),
                    { scroll: false },
                  );
                }}
                dataAttr="property-list-row"
              />
            );
          })}
        </div>
      )}
    </>
  );
}
