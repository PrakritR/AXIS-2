"use client";

import { useState } from "react";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { formatBytes } from "@/lib/rental-application/application-photos";
import type { ApplicationPhotoAttachment, ApplicationPhotoSlot } from "@/lib/rental-application/types";

/**
 * Manager-side read of an applicant's ID / income photos. The bytes are served
 * only by `/api/portal/application-photos`, which re-authorizes every request
 * against the calling manager's property access — an `<img>`/link here carries
 * the manager's session cookie, so one manager can never load another's
 * applicants' photos even by crafting the URL. Nothing is embedded inline.
 */

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function photoUrl(applicationId: string, slot: ApplicationPhotoSlot, index: number): string {
  const params = new URLSearchParams({ applicationId, slot, index: String(index) });
  return `/api/portal/application-photos?${params.toString()}`;
}

function PhotoThumb({
  applicationId,
  slot,
  index,
  label,
  attachment,
}: {
  applicationId: string;
  slot: ApplicationPhotoSlot;
  index: number;
  label: string;
  attachment: ApplicationPhotoAttachment;
}) {
  const [failed, setFailed] = useState(false);
  const url = photoUrl(applicationId, slot, index);
  const isImage = IMAGE_MIME.has(attachment.mimeType);
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block"
        data-attr="application-verification-photo-open"
      >
        {isImage && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-32 w-full rounded-lg border border-border object-cover [html[data-theme=dark]_&]:border-white/12"
          />
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded-lg border border-border bg-accent/30 px-3 text-center text-xs font-medium text-muted [html[data-theme=dark]_&]:border-white/12">
            {failed ? "Preview unavailable — open to view" : attachment.mimeType === "application/pdf" ? "Open PDF" : "Open file"}
          </div>
        )}
      </a>
      <p className="truncate text-[11px] text-muted/80" title={attachment.fileName}>
        {attachment.fileName}
        {attachment.sizeBytes ? ` · ${formatBytes(attachment.sizeBytes)}` : ""}
      </p>
    </div>
  );
}

export function ApplicationVerificationPhotos({ row }: { row: DemoApplicantRow }) {
  const app = row.application;
  const front = app?.idPhotoFront ?? null;
  const back = app?.idPhotoBack ?? null;
  const income = Array.isArray(app?.incomeProofPhotos) ? app.incomeProofPhotos : [];
  if (!front && !back && income.length === 0) return null;

  return (
    <PortalCollapsibleSection
      title="Verification photos"
      defaultExpanded={false}
      surfaceMuted={false}
      className="mt-4"
      contentClassName="p-4 pt-0"
      toggleDataAttr="application-verification-photos-toggle"
    >
      <div className="space-y-4">
        {front || back ? (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">ID / driver&apos;s license</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {front ? (
                <PhotoThumb applicationId={row.id} slot="idFront" index={0} label="Front of ID" attachment={front} />
              ) : null}
              {back ? (
                <PhotoThumb applicationId={row.id} slot="idBack" index={0} label="Back of ID" attachment={back} />
              ) : null}
            </div>
          </div>
        ) : null}
        {income.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">Proof of income</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {income.map((attachment, i) => (
                <PhotoThumb
                  key={attachment.storagePath || i}
                  applicationId={row.id}
                  slot="income"
                  index={i}
                  label={`Document ${i + 1}`}
                  attachment={attachment}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </PortalCollapsibleSection>
  );
}
