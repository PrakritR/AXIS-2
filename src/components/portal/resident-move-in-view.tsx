"use client";

import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { ResidentMoveInMediaGallery } from "@/components/portal/move-in-media-fields";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import { PORTAL_INLINE_UNLOCK_NOTICE_CLASS } from "@/components/portal/portal-metrics";
import {
  RESIDENT_MOVE_IN_TAB_LABELS,
  RESIDENT_MOVE_IN_TABS,
  residentMoveInHref,
  type ResidentMoveInTabId,
} from "@/lib/portal-detail-routes";
import type { ResidentMoveInResolved } from "@/lib/resident-move-in-resolve";

function availableTabs(resolved: ResidentMoveInResolved): ResidentMoveInTabId[] {
  const tabs: ResidentMoveInTabId[] = ["placement"];
  if (resolved.housemates.length > 0) tabs.push("housemates");
  if (resolved.generalHouseInfo || resolved.houseRulesText) tabs.push("info");
  tabs.push("instructions");
  return tabs;
}

function moveInDestinations(basePath: string, tabIds: readonly ResidentMoveInTabId[]) {
  return tabIds.map((id) => ({
    id,
    label: RESIDENT_MOVE_IN_TAB_LABELS[id],
    href: residentMoveInHref(basePath, id),
    dataAttr: `resident-move-in-tab-${id}`,
  }));
}

function ResidentMoveInTabContent({
  resolved,
  activeTab,
}: {
  resolved: ResidentMoveInResolved;
  activeTab: ResidentMoveInTabId;
}) {
  const tab = availableTabs(resolved).includes(activeTab) ? activeTab : "placement";

  return (
    <>
      {tab === "placement" ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Assigned room</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{resolved.roomLabel}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Property</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{resolved.propertyLabel}</p>
              {resolved.addressLine ? <p className="mt-0.5 text-xs">{resolved.addressLine}</p> : null}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Move-in date</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {resolved.earliestMoveInDateLabel ?? "Not set yet"}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "housemates" ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <ul className="divide-y divide-border">
            {resolved.housemates.map((mate) => (
              <li
                key={mate.email}
                className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{mate.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{mate.roomLabel}</p>
                </div>
                <div className="text-right text-sm text-muted">
                  {mate.phone ? (
                    <a
                      href={`tel:+1${mate.phone.replace(/\D/g, "").replace(/^1/, "")}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {mate.phone}
                    </a>
                  ) : (
                    <span>No phone on file</span>
                  )}
                  <p className="mt-0.5 text-xs">{mate.email}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "info" ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
          {resolved.generalHouseInfo ? <div className="whitespace-pre-wrap">{resolved.generalHouseInfo}</div> : null}
          {resolved.houseRulesText ? <div className="whitespace-pre-wrap">{resolved.houseRulesText}</div> : null}
        </section>
      ) : null}

      {tab === "instructions" ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="whitespace-pre-wrap">
            {resolved.instructions ?? (
              <span>
                No house instructions have been added for this room yet. Your property manager can add keys, parking,
                access codes, and house rules when they edit the listing.
              </span>
            )}
          </div>
          <ResidentMoveInMediaGallery
            photoDataUrls={resolved.moveInPhotoDataUrls}
            videoDataUrl={resolved.moveInVideoDataUrl}
          />
        </section>
      ) : null}
    </>
  );
}

/** House details body: routed tabs always visible; content varies by placement / lock state. */
export function ResidentMoveInShell({
  activeTab,
  basePath = "/resident",
  resolved,
  email,
  locked = false,
}: {
  activeTab: ResidentMoveInTabId;
  basePath?: string;
  resolved: ResidentMoveInResolved | null;
  email: string;
  locked?: boolean;
}) {
  const tabIds = resolved ? availableTabs(resolved) : RESIDENT_MOVE_IN_TABS;
  const tab = tabIds.includes(activeTab) ? activeTab : "placement";

  return (
    <div className="space-y-4 text-sm leading-relaxed text-muted">
      <PortalListControlStack
        className="mb-3 max-lg:mb-4"
        destinationInset
        destinations={moveInDestinations(basePath, tabIds)}
        activeDestinationId={tab}
        destinationAriaLabel="Placement views"
      />

      {locked ? (
        <>
          <p className={PORTAL_INLINE_UNLOCK_NOTICE_CLASS}>
            <span className="font-semibold">Available once your lease is signed.</span> House details unlock after both
            you and your property manager have signed the lease.
          </p>
          <PortalDataTableEmpty message="Unlocks after both signatures are complete." icon="lease" />
        </>
      ) : !email ? (
        <p className={`${PORTAL_INLINE_UNLOCK_NOTICE_CLASS} portal-banner-pending`}>
          Sign in to see house details for your placement.
        </p>
      ) : !resolved ? (
        <PortalDataTableEmpty
          icon="residents"
          message="We could not find an approved placement tied to this account yet. Once your property manager assigns your listing room, your house details will appear here automatically."
        />
      ) : (
        <ResidentMoveInTabContent resolved={resolved} activeTab={tab} />
      )}
    </div>
  );
}

/** @deprecated Use {@link ResidentMoveInShell} — kept for imports during migration. */
export function ResidentMoveInResolvedView({
  resolved,
  activeTab,
  basePath = "/resident",
}: {
  resolved: ResidentMoveInResolved;
  activeTab: ResidentMoveInTabId;
  basePath?: string;
}) {
  return (
    <ResidentMoveInShell activeTab={activeTab} basePath={basePath} resolved={resolved} email="resident@placeholder.local" />
  );
}
