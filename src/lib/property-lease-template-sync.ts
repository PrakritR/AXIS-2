import {
  isEntireHomeListing,
  resolveAllowedLeaseTerms,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/lease-terms";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import {
  createPropertyLeaseTemplate,
  readPropertyLeaseTemplates,
  syncLegacyLeaseFieldsFromTemplates,
  type PropertyLeaseListingSeedKey,
  type PropertyLeaseTemplate,
  type PropertyLeaseTemplateKind,
} from "@/lib/property-lease-templates";

const FIXED_LEASE_TERMS = ["3-Month", "9-Month", "12-Month"] as const;

type LeaseTemplateSeed = {
  seedKey: PropertyLeaseListingSeedKey;
  kind: PropertyLeaseTemplateKind;
  label: string;
  applicationLeaseTerms: string[];
};

function nowIso(): string {
  return new Date().toISOString();
}

/** Derive which per-property lease templates should exist from listing offered terms. */
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
  const allowed = resolveAllowedLeaseTerms(sub);
  const seeds: LeaseTemplateSeed[] = [];

  const fixed = allowed.filter((t): t is (typeof FIXED_LEASE_TERMS)[number] =>
    (FIXED_LEASE_TERMS as readonly string[]).includes(t),
  );
  if (fixed.length > 0) {
    seeds.push({
      seedKey: "fixed-term",
      kind: isEntireHomeListing(sub) ? "corporate-furnished" : "room-rental",
      label: fixed.length === 1 ? `${fixed[0]} lease` : "Fixed-term lease",
      applicationLeaseTerms: [...fixed],
    });
  }

  if (allowed.includes("Month-to-Month")) {
    seeds.push({
      seedKey: "month-to-month",
      kind: "month-to-month",
      label: "Month-to-month lease",
      applicationLeaseTerms: ["Month-to-Month"],
    });
  }

  if (allowed.includes(SHORT_TERM_LEASE_TERM)) {
    seeds.push({
      seedKey: "short-term",
      kind: "custom",
      label: "Short-term stay",
      applicationLeaseTerms: [SHORT_TERM_LEASE_TERM],
    });
  }

  if (allowed.includes("Custom")) {
    seeds.push({
      seedKey: "custom-term",
      kind: "custom",
      label: "Custom lease",
      applicationLeaseTerms: ["Custom"],
    });
  }

  if (seeds.length === 0) {
    seeds.push({
      seedKey: "primary",
      kind: isEntireHomeListing(sub) ? "corporate-furnished" : "room-rental",
      label: "Primary lease",
      applicationLeaseTerms: allowed.length > 0 ? [...allowed] : [],
    });
  }

  return seeds;
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
    const prev = seededExisting.find((t) => t.listingSeedKey === seed.seedKey) ?? legacyAdopted;

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

  const term =
    application.rentalType === "short_term"
      ? SHORT_TERM_LEASE_TERM
      : application.leaseTerm?.trim() || "";
  if (!term) return templates[0] ?? null;

  const explicit = templates.filter((t) => (t.applicationLeaseTerms ?? []).includes(term));
  if (explicit.length === 1) return explicit[0]!;
  if (explicit.length > 1) {
    return [...explicit].sort((a, b) => a.label.localeCompare(b.label))[0]!;
  }

  if (term === "Month-to-Month") {
    return templates.find((t) => t.kind === "month-to-month") ?? templates[0]!;
  }
  if (term === SHORT_TERM_LEASE_TERM) {
    return (
      templates.find((t) => t.listingSeedKey === "short-term") ??
      templates.find((t) => t.kind === "custom" && t.label.toLowerCase().includes("short")) ??
      templates[0]!
    );
  }
  if ((FIXED_LEASE_TERMS as readonly string[]).includes(term)) {
    return (
      templates.find((t) => t.listingSeedKey === "fixed-term") ??
      templates.find((t) => t.kind === "room-rental" || t.kind === "corporate-furnished") ??
      templates[0]!
    );
  }
  if (term === "Custom") {
    return (
      templates.find((t) => t.listingSeedKey === "custom-term") ??
      templates.find((t) => t.kind === "custom") ??
      templates[0]!
    );
  }

  return templates[0] ?? null;
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
