import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import type { ApplicationFormVariant } from "@/lib/rental-application/application-field-catalog";
import {
  PROPERTY_LEASE_TYPE_OPTIONS,
  normalizeLeaseTemplateKind,
  propertyLeaseTypeLabel,
  type PropertyLeaseListingSeedKey,
  type PropertyLeaseTemplateKind,
} from "@/lib/property-lease-templates";

export type PropertyApplicationTemplate = {
  id: string;
  kind: PropertyLeaseTemplateKind;
  label: string;
  formVariant: ApplicationFormVariant;
  applicationLeaseTerms?: string[];
  listingSeedKey?: PropertyLeaseListingSeedKey;
  createdAt: string;
  updatedAt: string;
};

export function applicationFormVariantForKind(kind: PropertyLeaseTemplateKind | string): ApplicationFormVariant {
  return normalizeLeaseTemplateKind(kind) === "short-term" ? "short_term" : "standard";
}

export function applicationFormVariantForTemplate(
  template: Pick<PropertyApplicationTemplate, "kind" | "listingSeedKey" | "formVariant">,
): ApplicationFormVariant {
  if (
    template.listingSeedKey === "cosigner" ||
    template.listingSeedKey === "cosigner-short-term" ||
    template.formVariant === "cosigner"
  ) {
    return "cosigner";
  }
  if (template.formVariant === "short_term") return "short_term";
  return applicationFormVariantForKind(template.kind);
}

export function propertyApplicationTypeLabel(kind: PropertyLeaseTemplateKind | string): string {
  return propertyLeaseTypeLabel(kind);
}

export function makePropertyApplicationTemplateId(): string {
  return `app-tpl-${crypto.randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createPropertyApplicationTemplate(args: {
  kind: PropertyLeaseTemplateKind;
  label?: string;
  applicationLeaseTerms?: string[];
  listingSeedKey?: PropertyLeaseListingSeedKey;
  formVariant?: ApplicationFormVariant;
}): PropertyApplicationTemplate {
  const kind = normalizeLeaseTemplateKind(args.kind);
  const kindMeta = PROPERTY_LEASE_TYPE_OPTIONS.find((o) => o.id === kind);
  const stamp = nowIso();
  return {
    id: makePropertyApplicationTemplateId(),
    kind,
    label: args.label?.trim() || kindMeta?.defaultLabel.replace(/ lease$/i, " application") || "Application",
    formVariant: args.formVariant ?? applicationFormVariantForKind(kind),
    applicationLeaseTerms: args.applicationLeaseTerms?.length ? [...args.applicationLeaseTerms] : undefined,
    listingSeedKey: args.listingSeedKey,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function isPropertyApplicationTemplate(raw: unknown): raw is PropertyApplicationTemplate & { kind: string } {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as PropertyApplicationTemplate;
  return Boolean(row.id && row.kind && row.label);
}

function normalizeApplicationTemplate(
  row: PropertyApplicationTemplate & { kind: string },
): PropertyApplicationTemplate {
  const kind = normalizeLeaseTemplateKind(row.kind);
  return {
    ...row,
    kind,
    formVariant: applicationFormVariantForTemplate({ ...row, kind }),
  };
}

export function readPropertyApplicationTemplates(
  sub: Pick<ManagerListingSubmissionV1, "propertyApplicationTemplates">,
): PropertyApplicationTemplate[] {
  if (!Array.isArray(sub.propertyApplicationTemplates)) return [];
  return sub.propertyApplicationTemplates.filter(isPropertyApplicationTemplate).map(normalizeApplicationTemplate);
}

export function syncLegacyApplicationFieldsFromTemplates(
  sub: ManagerListingSubmissionV1,
  templates: PropertyApplicationTemplate[],
): ManagerListingSubmissionV1 {
  const hasShortTerm = templates.some((t) => t.formVariant === "short_term");
  return {
    ...sub,
    propertyApplicationTemplates: templates,
    shortTermRentalsAllowed: hasShortTerm ? true : sub.shortTermRentalsAllowed,
  };
}

export function updatePropertyApplicationTemplate(
  templates: PropertyApplicationTemplate[],
  templateId: string,
  patch: Partial<PropertyApplicationTemplate>,
): PropertyApplicationTemplate[] {
  return templates.map((row) =>
    row.id === templateId
      ? {
          ...row,
          ...patch,
          kind: patch.kind ? normalizeLeaseTemplateKind(patch.kind) : row.kind,
          formVariant: applicationFormVariantForTemplate({
            ...row,
            ...patch,
            kind: patch.kind ? normalizeLeaseTemplateKind(patch.kind) : row.kind,
          }),
          updatedAt: nowIso(),
        }
      : row,
  );
}

export function removePropertyApplicationTemplate(
  templates: PropertyApplicationTemplate[],
  templateId: string,
): PropertyApplicationTemplate[] {
  return templates.filter((row) => row.id !== templateId);
}
