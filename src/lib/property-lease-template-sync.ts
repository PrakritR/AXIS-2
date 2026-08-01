import {
  resolveAllowedLeaseTerms,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/lease-terms";
import { normalizeApplicationLeaseTerm } from "@/lib/resident-manual-lease-terms";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import {
  createPropertyLeaseTemplate,
  readPropertyLeaseTemplates,
  syncLegacyLeaseFieldsFromTemplates,
  type PropertyLeaseListingSeedKey,
  type PropertyLeaseTemplate,
  type PropertyLeaseTemplateKind,
} from "@/lib/property-lease-templates";

type LeaseTemplateSeed = {
  seedKey: PropertyLeaseListingSeedKey;
  kind: PropertyLeaseTemplateKind;
  label: string;
  applicationLeaseTerms: string[];
};

const LONG_TERM_SEED_KEY: PropertyLeaseListingSeedKey = "primary";
const SHORT_TERM_SEED_KEY: PropertyLeaseListingSeedKey = "short-term";

/** Legacy per-term seed keys collapsed into the single long-term default. */
const LEGACY_LONG_TERM_SEED_KEYS: PropertyLeaseListingSeedKey[] = [
  "fixed-term",
  "fixed-3-month",
  "fixed-9-month",
  "fixed-12-month",
  "month-to-month",
  "custom-term",
];

function nowIso(): string {
  return new Date().toISOString();
}

function longTermApplicationLeaseTerms(
  sub: Pick<ManagerListingSubmissionV1, "allowedLeaseTerms" | "leaseTermsBody" | "shortTermRentalsAllowed">,
): string[] {
  const allowed = resolveAllowedLeaseTerms(sub).filter((t) => t !== SHORT_TERM_LEASE_TERM);
  return allowed.length > 0 ? allowed : ["12-Month"];
}

/** Every property keeps exactly two auto-seeded templates: long-term and short-term. */
export function buildLeaseTemplateSeeds(
  sub: Pick<
    ManagerListingSubmissionV1,
    | "allowedLeaseTerms"
    | "leaseTermsBody"
    | "shortTermRentalsAllowed"
    | "rooms"
    | "entireHomeMonthlyRent"
    | "listingPlaceCategoryId"
  >,
): LeaseTemplateSeed[] {
  return [
    {
      seedKey: LONG_TERM_SEED_KEY,
      kind: "long-term",
      label: "Long-term lease",
      applicationLeaseTerms: longTermApplicationLeaseTerms(sub),
    },
    {
      seedKey: SHORT_TERM_SEED_KEY,
      kind: "short-term",
      label: "Short-term lease",
      applicationLeaseTerms: [SHORT_TERM_LEASE_TERM],
    },
  ];
}

function templateHasManagerEdits(template: PropertyLeaseTemplate): boolean {
  return (
    template.leaseConfigMode === "custom" ||
    Boolean(template.customLeaseTerms?.trim()) ||
    Boolean(template.leaseTemplateHtmlOverride?.trim()) ||
    Boolean(template.leaseTemplateDocUrl?.trim())
  );
}

/** When collapsing legacy per-term seeds, keep the richest long-term row. */
function adoptPreviousLongTermTemplate(existing: PropertyLeaseTemplate[]): PropertyLeaseTemplate | null {
  const candidates = existing.filter(
    (t) => t.listingSeedKey && t.listingSeedKey !== SHORT_TERM_SEED_KEY,
  );
  if (candidates.length === 0) return null;

  const edited = candidates.find(templateHasManagerEdits);
  if (edited) return edited;

  for (const key of [LONG_TERM_SEED_KEY, ...LEGACY_LONG_TERM_SEED_KEYS]) {
    const hit = candidates.find((t) => t.listingSeedKey === key);
    if (hit) return hit;
  }

  return candidates[0] ?? null;
}

function defaultLabelForSeed(seed: LeaseTemplateSeed): string {
  return seed.label;
}

function adoptLegacyDefaultTemplate(
  existing: PropertyLeaseTemplate[],
  seed: LeaseTemplateSeed,
): PropertyLeaseTemplate | null {
  if (existing.length !== 1) return null;
  const only = existing[0]!;
  if (only.listingSeedKey) return null;
  if (only.id !== "lease-tpl-default" && existing.some((t) => t.listingSeedKey)) return null;
  return {
    ...only,
    listingSeedKey: seed.seedKey,
    kind: seed.kind,
    applicationLeaseTerms: seed.applicationLeaseTerms,
    label: only.label.trim() === "Primary lease" ? seed.label : only.label,
    updatedAt: nowIso(),
  };
}

function adoptPreviousSeededTemplate(
  existing: PropertyLeaseTemplate[],
  seededExisting: PropertyLeaseTemplate[],
  seed: LeaseTemplateSeed,
): PropertyLeaseTemplate | null {
  const direct = seededExisting.find((t) => t.listingSeedKey === seed.seedKey);
  if (direct) return direct;

  if (seed.seedKey === LONG_TERM_SEED_KEY) {
    return adoptPreviousLongTermTemplate(existing);
  }
  if (seed.seedKey === SHORT_TERM_SEED_KEY) {
    return seededExisting.find((t) => t.listingSeedKey === SHORT_TERM_SEED_KEY) ?? null;
  }

  return null;
}

/**
 * Merge auto-seeded lease templates from listing offered terms with manager-owned templates.
 * Seeded rows are matched by `listingSeedKey`; manual rows (no key) are preserved.
 */
export function syncPropertyLeaseTemplatesFromListing(
  sub: ManagerListingSubmissionV1,
): ManagerListingSubmissionV1 {
  const seeds = buildLeaseTemplateSeeds(sub);
  const existing = readPropertyLeaseTemplates(sub);
  const adoptedLegacyIds = new Set<string>();
  const seededExisting = existing.filter((t) => Boolean(t.listingSeedKey));

  const nextSeeded: PropertyLeaseTemplate[] = [];

  for (const seed of seeds) {
    const legacyAdopted =
      seededExisting.length === 0 && adoptedLegacyIds.size === 0
        ? adoptLegacyDefaultTemplate(existing, seed)
        : null;
    const prev =
      adoptPreviousSeededTemplate(existing, seededExisting, seed) ?? legacyAdopted;

    if (prev) {
      if (legacyAdopted) adoptedLegacyIds.add(legacyAdopted.id);
      const defaultLabel = defaultLabelForSeed(seed);
      nextSeeded.push({
        ...prev,
        kind: seed.kind,
        listingSeedKey: seed.seedKey,
        applicationLeaseTerms: seed.applicationLeaseTerms,
        label: prev.label.trim() && prev.label !== defaultLabel ? prev.label : defaultLabel,
        updatedAt: nowIso(),
      });
    } else {
      const created = createPropertyLeaseTemplate({
        kind: seed.kind,
        label: seed.label,
        source: "axis_default",
      });
      nextSeeded.push({
        ...created,
        listingSeedKey: seed.seedKey,
        applicationLeaseTerms: seed.applicationLeaseTerms,
      });
    }
  }

  const manual = existing.filter((t) => !t.listingSeedKey && !adoptedLegacyIds.has(t.id));
  const merged = [...nextSeeded, ...manual];
  return syncLegacyLeaseFieldsFromTemplates(sub, merged);
}

export function formatApplicationLeaseTermsLabel(terms: string[] | undefined): string | null {
  const clean = (terms ?? []).filter((t) => t.trim());
  if (clean.length === 0) return null;
  return clean.join(" · ");
}

/** Pick the property lease template that best matches an applicant's lease-term choice. */
export function resolvePropertyLeaseTemplateForApplication(
  sub: ManagerListingSubmissionV1,
  application: Pick<Partial<RentalWizardFormState>, "leaseTerm" | "rentalType">,
): PropertyLeaseTemplate | null {
  const templates = readPropertyLeaseTemplates(sub);
  if (templates.length === 0) return null;

  const shortTermTemplate =
    templates.find((t) => t.listingSeedKey === SHORT_TERM_SEED_KEY) ??
    templates.find((t) => t.kind === "short-term");
  const longTermTemplate =
    templates.find((t) => t.listingSeedKey === LONG_TERM_SEED_KEY) ??
    templates.find((t) => t.kind === "long-term") ??
    templates[0]!;

  if (application.rentalType === "short_term") {
    return shortTermTemplate ?? longTermTemplate;
  }

  const term = normalizeApplicationLeaseTerm(application.leaseTerm ?? "");

  if (term === SHORT_TERM_LEASE_TERM) {
    return shortTermTemplate ?? longTermTemplate;
  }

  if (term) {
    const explicit = templates.filter((t) => (t.applicationLeaseTerms ?? []).includes(term));
    if (explicit.length === 1) return explicit[0]!;
    if (explicit.length > 1) {
      return [...explicit].sort((a, b) => a.label.localeCompare(b.label))[0]!;
    }
  }

  return longTermTemplate;
}

/** Overlay the matched lease template onto legacy top-level lease fields for generation. */
export function submissionWithLeaseTemplateForApplication(
  sub: ManagerListingSubmissionV1,
  application: Pick<Partial<RentalWizardFormState>, "leaseTerm" | "rentalType">,
): ManagerListingSubmissionV1 {
  const template = resolvePropertyLeaseTemplateForApplication(sub, application);
  if (!template) return sub;
  const templates = readPropertyLeaseTemplates(sub);
  const rest = templates.filter((t) => t.id !== template.id);
  return syncLegacyLeaseFieldsFromTemplates(sub, [template, ...rest]);
}
