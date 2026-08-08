"use client";

import { ResidentMoveInMediaGallery } from "@/components/portal/move-in-media-fields";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import { PORTAL_INLINE_UNLOCK_NOTICE_CLASS } from "@/components/portal/portal-metrics";
import type { ResidentMoveInResolved } from "@/lib/resident-move-in-resolve";

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ResidentMoveInPageContent({ resolved }: { resolved: ResidentMoveInResolved }) {
  return (
    <div className="space-y-10 text-sm leading-relaxed text-muted">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Your placement</h2>
          <p className="mt-1 text-sm text-muted">Where you are assigned and when you can move in.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <DetailField label="Assigned room" value={resolved.roomLabel} />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Property</p>
            <p className="mt-1 text-sm font-medium text-foreground">{resolved.propertyLabel}</p>
            {resolved.addressLine ? <p className="mt-0.5 text-xs text-muted">{resolved.addressLine}</p> : null}
          </div>
          <DetailField label="Move-in date" value={resolved.earliestMoveInDateLabel ?? "Not set yet"} />
        </div>
      </section>

      {resolved.housemates.length > 0 ? (
        <section className="space-y-4 border-t border-border/40 pt-8">
          <div>
            <h2 className="text-base font-semibold text-foreground">Housemates</h2>
            <p className="mt-1 text-sm text-muted">Other residents in your household.</p>
          </div>
          <ul className="divide-y divide-border/50">
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

      {resolved.generalHouseInfo || resolved.houseRulesText ? (
        <section className="space-y-4 border-t border-border/40 pt-8">
          <div>
            <h2 className="text-base font-semibold text-foreground">Info & rules</h2>
            <p className="mt-1 text-sm text-muted">Shared information from your property manager.</p>
          </div>
          <div className="space-y-4 whitespace-pre-wrap text-foreground">
            {resolved.generalHouseInfo ? <div>{resolved.generalHouseInfo}</div> : null}
            {resolved.houseRulesText ? <div>{resolved.houseRulesText}</div> : null}
          </div>
        </section>
      ) : null}

      {resolved.amenities.length > 0 ? (
        <section className="space-y-4 border-t border-border/40 pt-8">
          <div>
            <h2 className="text-base font-semibold text-foreground">Amenities</h2>
            <p className="mt-1 text-sm text-muted">What this home offers.</p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-foreground">
            {resolved.amenities.map((amenity) => (
              <li key={amenity}>{amenity}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4 border-t border-border/40 pt-8">
        <div>
          <h2 className="text-base font-semibold text-foreground">Move-in instructions</h2>
          <p className="mt-1 text-sm text-muted">Keys, parking, access codes, and anything to know before arrival.</p>
        </div>
        <div className="whitespace-pre-wrap text-foreground">
          {resolved.instructions ?? (
            <span className="text-muted">
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
    </div>
  );
}

/** House details — single scrollable page (placement, housemates, rules, amenities, and move-in instructions). */
export function ResidentMoveInShell({
  basePath: _basePath = "/resident",
  resolved,
  email,
  locked = false,
}: {
  activeTab?: string;
  basePath?: string;
  resolved: ResidentMoveInResolved | null;
  email: string;
  locked?: boolean;
}) {
  return (
    <div className="text-sm leading-relaxed text-muted">
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
        <ResidentMoveInPageContent resolved={resolved} />
      )}
    </div>
  );
}

/** @deprecated Use {@link ResidentMoveInShell} — kept for imports during migration. */
export function ResidentMoveInResolvedView({
  resolved,
  basePath = "/resident",
}: {
  resolved: ResidentMoveInResolved;
  activeTab?: string;
  basePath?: string;
}) {
  return (
    <ResidentMoveInShell basePath={basePath} resolved={resolved} email="resident@placeholder.local" />
  );
}
