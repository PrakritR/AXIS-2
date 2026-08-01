import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/lease-terms";
import {
  createPropertyApplicationTemplate,
  readPropertyApplicationTemplates,
  syncLegacyApplicationFieldsFromTemplates,
  type PropertyApplicationTemplate,
} from "@/lib/property-application-templates";
import type { PropertyLeaseTemplateKind } from "@/lib/property-lease-templates";
import { buildLeaseTemplateSeeds } from "@/lib/property-lease-template-sync";

function nowIso(): string {
  return new Date().toISOString();
}

function defaultLabelForSeed(seed: { label: string; kind: PropertyLeaseTemplateKind }): string {
  if (seed.kind === "short-term") return "Short-term application";
  return "Long-term application";
}

function adoptLegacyDefaultTemplate(
  existing: PropertyApplicationTemplate[],
  seed: ReturnType<typeof buildLeaseTemplateSeeds>[number],
): PropertyApplicationTemplate | null {
  if (existing.length !== 1) return null;
  const only = existing[0]!;
  if (only.listingSeedKey) return null;
  if (only.id !== "app-tpl-default" && existing.some((t) => t.listingSeedKey)) return null;
  return {
    ...only,
    listingSeedKey: seed.seedKey,
    kind: seed.kind,
    formVariant: seed.kind === "short-term" ? "short_term" : "standard",
    applicationLeaseTerms: seed.applicationLeaseTerms,
    label: only.label.trim() === "Primary application" ? defaultLabelForSeed(seed) : only.label,
    updatedAt: nowIso(),
  };
}

/** Merge auto-seeded application templates from listing offered terms with manager-owned rows. */
export function syncPropertyApplicationTemplatesFromListing(
  sub: ManagerListingSubmissionV1,
): ManagerListingSubmissionV1 {
  const seeds = buildLeaseTemplateSeeds(sub);
  const existing = readPropertyApplicationTemplates(sub);
  const adoptedLegacyIds = new Set<string>();
  const seededExisting = existing.filter((t) => Boolean(t.listingSeedKey));

  const nextSeeded: PropertyApplicationTemplate[] = [];

  for (const seed of seeds) {
    const legacyAdopted =
      seededExisting.length === 0 && adoptedLegacyIds.size === 0
        ? adoptLegacyDefaultTemplate(existing, seed)
        : null;
    const prev = seededExisting.find((t) => t.listingSeedKey === seed.seedKey) ?? legacyAdopted;

    if (prev) {
      if (legacyAdopted) adoptedLegacyIds.add(legacyAdopted.id);
      const defaultLabel = defaultLabelForSeed(seed);
      nextSeeded.push({
        ...prev,
        kind: seed.kind,
        formVariant: seed.kind === "short-term" ? "short_term" : "standard",
        listingSeedKey: seed.seedKey,
        applicationLeaseTerms: seed.applicationLeaseTerms,
        label: prev.label.trim() && prev.label !== defaultLabel ? prev.label : defaultLabel,
        updatedAt: nowIso(),
      });
    } else {
      const created = createPropertyApplicationTemplate({
        kind: seed.kind,
        label: defaultLabelForSeed(seed),
        listingSeedKey: seed.seedKey,
        applicationLeaseTerms: seed.applicationLeaseTerms,
      });
      nextSeeded.push(created);
    }
  }

  const manual = existing.filter((t) => !t.listingSeedKey && !adoptedLegacyIds.has(t.id));
  const merged = [...nextSeeded, ...manual];
  const hasShortTerm = merged.some((t) => t.formVariant === "short_term");
  return syncLegacyApplicationFieldsFromTemplates(
    {
      ...sub,
      shortTermRentalsAllowed: hasShortTerm || Boolean(sub.shortTermRentalsAllowed),
    },
    merged,
  );
}

export function submissionAfterRemovingApplicationTemplate(
  sub: ManagerListingSubmissionV1,
  templates: PropertyApplicationTemplate[],
): ManagerListingSubmissionV1 {
  const hasShortTerm = templates.some((t) => t.formVariant === "short_term");
  let next = syncLegacyApplicationFieldsFromTemplates(sub, templates);
  if (!hasShortTerm && next.shortTermRentalsAllowed) {
    const allowed = (next.allowedLeaseTerms ?? []).filter((t) => t !== SHORT_TERM_LEASE_TERM);
    next = {
      ...next,
      shortTermRentalsAllowed: false,
      allowedLeaseTerms: allowed,
    };
  }
  return next;
}
