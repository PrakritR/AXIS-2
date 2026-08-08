"use client";

import { ResidentMoveInMediaGallery } from "@/components/portal/move-in-media-fields";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import { PORTAL_INLINE_UNLOCK_NOTICE_CLASS } from "@/components/portal/portal-metrics";
import type { ResidentMoveInResolved } from "@/lib/resident-move-in-resolve";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-foreground">{children}</h2>;
}

function ResidentMoveInContent({ resolved }: { resolved: ResidentMoveInResolved }) {
  const hasInstructions =
    Boolean(resolved.instructions?.trim()) ||
    resolved.moveInPhotoDataUrls.length > 0 ||
    Boolean(resolved.moveInVideoDataUrl);

  return (
    <div className="space-y-8 text-sm leading-relaxed text-muted">
      <section className="grid gap-4 sm:grid-cols-3">
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
      </section>

      {resolved.housemates.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading>Housemates</SectionHeading>
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

      {resolved.generalHouseInfo ? (
        <section className="space-y-2">
          <SectionHeading>About the home</SectionHeading>
          <p className="whitespace-pre-wrap text-foreground">{resolved.generalHouseInfo}</p>
        </section>
      ) : null}

      {resolved.houseRulesText ? (
        <section className="space-y-2">
          <SectionHeading>House rules</SectionHeading>
          <p className="whitespace-pre-wrap text-foreground">{resolved.houseRulesText}</p>
        </section>
      ) : null}

      {resolved.amenities.length > 0 ? (
        <section className="space-y-2">
          <SectionHeading>Amenities</SectionHeading>
          <ul className="list-disc space-y-1 pl-5 text-foreground">
            {resolved.amenities.map((amenity) => (
              <li key={amenity}>{amenity}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasInstructions ? (
        <section className="space-y-2">
          <SectionHeading>Move-in instructions</SectionHeading>
          {resolved.instructions?.trim() ? (
            <p className="whitespace-pre-wrap text-foreground">{resolved.instructions}</p>
          ) : (
            <p className="text-muted">
              No written instructions yet. Your property manager can add keys, parking, access codes, and house rules
              when they edit the listing.
            </p>
          )}
          <ResidentMoveInMediaGallery
            photoDataUrls={resolved.moveInPhotoDataUrls}
            videoDataUrl={resolved.moveInVideoDataUrl}
          />
        </section>
      ) : null}
    </div>
  );
}

/** House details — one scrollable page (placement, housemates, rules, and move-in instructions). */
export function ResidentMoveInShell({
  basePath: _basePath = "/resident",
  resolved,
  email,
  locked = false,
}: {
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
        <ResidentMoveInContent resolved={resolved} />
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
