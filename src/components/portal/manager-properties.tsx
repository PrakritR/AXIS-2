"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { MockProperty } from "@/data/types";
import { Button } from "@/components/ui/button";
import { ManagerAddListingForm } from "@/components/portal/manager-add-listing-form";
import { ManagerHousePropertiesPanel } from "@/components/portal/manager-house-properties-panel";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  countManagerManagedPropertiesForUser,
  mirrorLocalPropertyPipelineToServer,
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
  type ManagerPendingPropertyRow,
} from "@/lib/demo-property-pipeline";
import { readLinkedListingsForUser } from "@/lib/manager-portfolio-access";
import {
  BUSINESS_MAX_PROPERTIES,
  FREE_MAX_PROPERTIES,
  managerTierPropertyLimitReached,
  maxPropertiesForManagerTier,
  normalizeManagerSkuTier,
  PRO_MAX_PROPERTIES,
} from "@/lib/manager-access";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { legacyAdminFieldsToSubmission, normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";

function submissionForPendingEdit(row: ManagerPendingPropertyRow): ManagerListingSubmissionV1 {
  const raw = row.submission ? row.submission : legacyAdminFieldsToSubmission(row);
  return normalizeManagerListingSubmissionV1(raw);
}

function submissionForListedEdit(p: MockProperty): ManagerListingSubmissionV1 {
  if (p.listingSubmission) return normalizeManagerListingSubmissionV1(p.listingSubmission);
  const rentNum = Number.parseFloat(String(p.rentLabel).replace(/[^\d.]/g, "")) || 0;
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

type EditListingContext =
  | { mode: "pending"; id: string; submission: ManagerListingSubmissionV1 }
  | { mode: "listed"; id: string; submission: ManagerListingSubmissionV1; ownerUserId?: string };

export function ManagerProperties() {
  const { showToast } = useAppUi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const portalBase = usePaidPortalBasePath();
  const { userId } = useManagerUserId();
  const [formOpen, setFormOpen] = useState(false);
  const [editListingContext, setEditListingContext] = useState<EditListingContext | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [skuLoaded, setSkuLoaded] = useState(false);
  const [skuTier, setSkuTier] = useState<string | null>(null);
  const [propCount, setPropCount] = useState(0);
  const [linkedListings, setLinkedListings] = useState<ReturnType<typeof readLinkedListingsForUser>>([]);

  const refreshPending = useCallback(() => {
    if (!userId) {
      setPendingCount(0);
      setPropCount(0);
      setLinkedListings([]);
      return;
    }
    setPropCount(countManagerManagedPropertiesForUser(userId));
    setPendingCount(readPendingManagerPropertiesForUser(userId).length);
    setLinkedListings(readLinkedListingsForUser(userId));
  }, [userId]);

  const loadSku = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/subscription", { credentials: "include" });
      const body = (await res.json()) as { tier?: string | null };
      if (res.ok) {
        setSkuTier(body.tier ?? null);
      }
    } catch {
      /* ignore */
    } finally {
      setSkuLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadSku();
  }, [loadSku]);

  useEffect(() => {
    void syncPropertyPipelineFromServer().then(() => {
      refreshPending();
      void mirrorLocalPropertyPipelineToServer();
    });
    const on = () => refreshPending();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("axis-pro-relationships", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("axis-pro-relationships", on);
    };
  }, [refreshPending]);

  useEffect(() => {
    const editPending = searchParams.get("editPending");
    const editListing = searchParams.get("editListing");
    if (!editPending && !editListing) return;
    if (!userId) return;

    if (editPending) {
      const row = readPendingManagerPropertiesForUser(userId).find((r) => r.id === editPending);
      if (row) {
        setEditListingContext({ mode: "pending", id: editPending, submission: submissionForPendingEdit(row) });
        setFormOpen(true);
        router.replace(`${portalBase}/properties`, { scroll: false });
        return;
      }
      showToast("Could not load that listing for editing.");
      router.replace(`${portalBase}/properties`, { scroll: false });
      return;
    }

    if (editListing) {
      const hit = readExtraListingsForUser(userId).find((p) => p.id === editListing);
      if (hit) {
        setEditListingContext({ mode: "listed", id: editListing, submission: submissionForListedEdit(hit) });
        setFormOpen(true);
        router.replace(`${portalBase}/properties`, { scroll: false });
        return;
      }
      // Check linked listings
      const linked = readLinkedListingsForUser(userId).find((l) => l.listing.id === editListing);
      if (linked?.canEdit) {
        setEditListingContext({ mode: "listed", id: editListing, submission: submissionForListedEdit(linked.listing), ownerUserId: linked.ownerUserId });
        setFormOpen(true);
        router.replace(`${portalBase}/properties`, { scroll: false });
        return;
      }
      showToast("Could not load that listing for editing.");
      router.replace(`${portalBase}/properties`, { scroll: false });
    }
  }, [userId, searchParams, router, showToast, portalBase]);

  const atPropertyLimit = skuLoaded && managerTierPropertyLimitReached(skuTier, propCount);
  const limitMax = maxPropertiesForManagerTier(skuTier);

  const tryOpenAdd = () => {
    if (!skuLoaded) {
      showToast("Loading subscription…");
      void loadSku();
      return;
    }
    if (atPropertyLimit) {
      const n = normalizeManagerSkuTier(skuTier);
      showToast(
        n === "free"
          ? `Free includes ${FREE_MAX_PROPERTIES} property. Upgrade to Pro or Business for more.`
          : n === "pro"
            ? `Pro includes up to ${PRO_MAX_PROPERTIES} properties. Upgrade to Business for more.`
            : `Business includes up to ${BUSINESS_MAX_PROPERTIES} properties.`,
      );
      return;
    }
    setFormOpen(true);
  };

  return (
    <>
      {formOpen ? (
        <ManagerAddListingForm
          key={editListingContext ? `${editListingContext.mode}-${editListingContext.id}` : "new-listing"}
          showToast={showToast}
          skuTier={skuTier ?? null}
          propCountBeforeSubmit={propCount}
          editPendingId={editListingContext?.mode === "pending" ? editListingContext.id : null}
          editListingId={editListingContext?.mode === "listed" ? editListingContext.id : null}
          editListingOwnerUserId={editListingContext?.mode === "listed" ? (editListingContext.ownerUserId ?? null) : null}
          initialSubmission={editListingContext?.submission ?? null}
          onClose={() => {
            setFormOpen(false);
            setEditListingContext(null);
          }}
          onSubmitted={() => {
            if (editListingContext?.mode !== "listed") {
              showToast(
                editListingContext
                  ? "Submission saved."
                  : "Listing submitted for admin approval. It will appear on public search after approval.",
              );
            }
            refreshPending();
            void loadSku();
            setFormOpen(false);
            setEditListingContext(null);
          }}
        />
      ) : null}

      <ManagerPortalPageShell
        title="Properties"
        titleAside={
          <>
            <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={tryOpenAdd}>
              + Create listing
            </Button>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full"
              onClick={() => {
                void loadSku();
                refreshPending();
              }}
            >
              Refresh
            </Button>
          </>
        }
      >
        {atPropertyLimit && limitMax != null ? (
          <p className="mb-4 rounded-2xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-sm text-rose-950">
            You’ve reached your plan limit of {limitMax} propert{limitMax === 1 ? "y" : "ies"}.{" "}
            <Link className="font-semibold underline underline-offset-2 hover:text-rose-900" href={`${portalBase}/plan`}>
              View plans
            </Link>{" "}
            to add more.
          </p>
        ) : null}
        {pendingCount > 0 ? (
          <p className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
            <span className="font-semibold">{pendingCount}</span> propert{pendingCount === 1 ? "y" : "ies"} awaiting admin
            approval before they go live on Axis listings.
          </p>
        ) : null}
        <ManagerHousePropertiesPanel showToast={showToast} />

        {linkedListings.length > 0 ? (
          <div className="mt-8">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-slate-400">Properties from linked accounts</p>
            <ul className="mt-3 space-y-3">
              {linkedListings.map(({ listing, canEdit, ownerUserId }) => (
                <li
                  key={listing.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 leading-snug">
                      {listing.buildingName || listing.address}
                    </p>
                    {listing.unitLabel ? (
                      <p className="text-xs text-slate-500">{listing.unitLabel}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-400">{listing.address}</p>
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 rounded-full text-xs"
                      onClick={() => {
                        setEditListingContext({ mode: "listed", id: listing.id, submission: submissionForListedEdit(listing), ownerUserId });
                        setFormOpen(true);
                      }}
                    >
                      Edit listing
                    </Button>
                  ) : (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                      View only
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ManagerPortalPageShell>
    </>
  );
}
