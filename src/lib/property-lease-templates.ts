import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  draftFieldsFromLeaseSource,
  resolvePropertyLeaseSource,
  type PropertyLeaseSource,
} from "@/lib/property-lease-source";

/** Agreement use-case for a property lease template (not a duration preset). */
export type PropertyLeaseTemplateKind =
  | "room-rental"
  | "month-to-month"
  | "sublease"
  | "corporate-furnished"
  | "custom";

/** Legacy stored values — normalized on read. */
type LegacyLeaseTemplateKind = "standard" | "short-term";

export type StoredPropertyLeaseTemplateKind = PropertyLeaseTemplateKind | LegacyLeaseTemplateKind;

export type PropertyLeaseListingSeedKey =
  | "fixed-term"
  | "month-to-month"
  | "short-term"
  | "custom-term"
  | "primary";

export type PropertyLeaseTemplate = {
  id: string;
  kind: PropertyLeaseTemplateKind;
  /** Manager-facing label shown in the property lease list. */
  label: string;
  /** When auto-created from listing offered terms, stable key for merge/sync. */
  listingSeedKey?: PropertyLeaseListingSeedKey;
  /** Application lease-term choices that route applicants to this template. */
  applicationLeaseTerms?: string[];
  leaseConfigMode: "standard" | "custom";
  leaseCustomKind: "terms" | "document";
  customLeaseTerms: string;
  leaseTemplateDocUrl: string | null;
  leaseTemplateDocName: string;
  createdAt: string;
  updatedAt: string;
};

export const PROPERTY_LEASE_TYPE_OPTIONS: readonly {
  id: PropertyLeaseTemplateKind;
  label: string;
  description: string;
  defaultLabel: string;
}[] = [
  {
    id: "room-rental",
    label: "Room rental",
    description: "Standard shared-housing lease generated from the approved application.",
    defaultLabel: "Room rental lease",
  },
  {
    id: "month-to-month",
    label: "Month-to-month",
    description: "Rolling monthly tenancy with notice terms suited to flexible stays.",
    defaultLabel: "Month-to-month lease",
  },
  {
    id: "sublease",
    label: "Sublease",
    description: "Approved tenant sublease or roommate transfer agreement.",
    defaultLabel: "Sublease agreement",
  },
  {
    id: "corporate-furnished",
    label: "Corporate / furnished",
    description: "Company placement, relocation, or furnished rental arrangement.",
    defaultLabel: "Corporate lease",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Any other arrangement — give it a name your team will recognize.",
    defaultLabel: "Custom lease",
  },
] as const;

/** @deprecated Use PROPERTY_LEASE_TYPE_OPTIONS */
export const PROPERTY_LEASE_TEMPLATE_KIND_OPTIONS = PROPERTY_LEASE_TYPE_OPTIONS;

export function normalizeLeaseTemplateKind(kind: string | undefined | null): PropertyLeaseTemplateKind {
  if (kind === "standard") return "room-rental";
  if (kind === "short-term") return "custom";
  if (PROPERTY_LEASE_TYPE_OPTIONS.some((o) => o.id === kind)) {
    return kind as PropertyLeaseTemplateKind;
  }
  return "room-rental";
}

export function propertyLeaseTypeLabel(kind: string | undefined | null): string {
  const normalized = normalizeLeaseTemplateKind(kind);
  return PROPERTY_LEASE_TYPE_OPTIONS.find((o) => o.id === normalized)?.label ?? "Room rental";
}

export function makePropertyLeaseTemplateId(): string {
  return `lease-tpl-${crypto.randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function propertyLeaseSourceFromTemplate(
  template: Pick<PropertyLeaseTemplate, "leaseConfigMode" | "leaseCustomKind">,
): PropertyLeaseSource {
  return resolvePropertyLeaseSource(template);
}

export function createPropertyLeaseTemplate(args: {
  kind: PropertyLeaseTemplateKind;
  label?: string;
  source: PropertyLeaseSource;
  customLeaseTerms?: string;
  leaseTemplateDocUrl?: string | null;
  leaseTemplateDocName?: string;
  listingSeedKey?: PropertyLeaseListingSeedKey;
  applicationLeaseTerms?: string[];
}): PropertyLeaseTemplate {
  const kindMeta = PROPERTY_LEASE_TYPE_OPTIONS.find((o) => o.id === args.kind);
  const sourceFields = draftFieldsFromLeaseSource(args.source);
  const stamp = nowIso();
  return {
    id: makePropertyLeaseTemplateId(),
    kind: args.kind,
    label: args.label?.trim() || kindMeta?.defaultLabel || "Lease",
    leaseConfigMode: sourceFields.leaseConfigMode ?? "standard",
    leaseCustomKind: sourceFields.leaseCustomKind ?? "terms",
    customLeaseTerms: args.customLeaseTerms?.trim() ?? "",
    leaseTemplateDocUrl: args.leaseTemplateDocUrl ?? null,
    leaseTemplateDocName: args.leaseTemplateDocName?.trim() ?? "",
    listingSeedKey: args.listingSeedKey,
    applicationLeaseTerms: args.applicationLeaseTerms?.length ? [...args.applicationLeaseTerms] : undefined,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function isPropertyLeaseTemplate(raw: unknown): raw is PropertyLeaseTemplate & { kind: string } {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as PropertyLeaseTemplate;
  return Boolean(row.id && row.kind && row.label);
}

function normalizeTemplate(row: PropertyLeaseTemplate & { kind: string }): PropertyLeaseTemplate {
  return { ...row, kind: normalizeLeaseTemplateKind(row.kind) };
}

/** Migrate legacy single lease fields into a template list when needed. */
export function readPropertyLeaseTemplates(
  sub: Pick<
    ManagerListingSubmissionV1,
    | "propertyLeaseTemplates"
    | "leaseConfigMode"
    | "leaseCustomKind"
    | "customLeaseTerms"
    | "leaseTemplateDocUrl"
    | "leaseTemplateDocName"
  >,
): PropertyLeaseTemplate[] {
  if (Array.isArray(sub.propertyLeaseTemplates)) {
    const rows = sub.propertyLeaseTemplates.filter(isPropertyLeaseTemplate).map(normalizeTemplate);
    if (rows.length > 0) return rows;
  }

  const stamp = nowIso();
  return [
    {
      id: "lease-tpl-default",
      kind: "room-rental",
      label: "Primary lease",
      leaseConfigMode: sub.leaseConfigMode === "custom" ? "custom" : "standard",
      leaseCustomKind: sub.leaseCustomKind === "document" ? "document" : "terms",
      customLeaseTerms: typeof sub.customLeaseTerms === "string" ? sub.customLeaseTerms : "",
      leaseTemplateDocUrl:
        typeof sub.leaseTemplateDocUrl === "string" && sub.leaseTemplateDocUrl.trim()
          ? sub.leaseTemplateDocUrl
          : null,
      leaseTemplateDocName: typeof sub.leaseTemplateDocName === "string" ? sub.leaseTemplateDocName : "",
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
}

/** Keep legacy top-level lease fields in sync with the primary template for older code paths. */
export function syncLegacyLeaseFieldsFromTemplates(
  sub: ManagerListingSubmissionV1,
  templates: PropertyLeaseTemplate[],
): ManagerListingSubmissionV1 {
  const primary = templates[0];
  if (!primary) {
    return {
      ...sub,
      propertyLeaseTemplates: [],
      leaseConfigMode: "standard",
      leaseCustomKind: "terms",
      customLeaseTerms: "",
      leaseTemplateDocUrl: null,
      leaseTemplateDocName: "",
    };
  }
  return {
    ...sub,
    propertyLeaseTemplates: templates,
    leaseConfigMode: primary.leaseConfigMode,
    leaseCustomKind: primary.leaseCustomKind,
    customLeaseTerms: primary.customLeaseTerms,
    leaseTemplateDocUrl: primary.leaseTemplateDocUrl,
    leaseTemplateDocName: primary.leaseTemplateDocName,
  };
}

/** Application lease-term hint when this template is selected. */
export function templateKindLeaseTermHint(kind: PropertyLeaseTemplateKind): string | null {
  if (kind === "month-to-month") return "Month-to-Month";
  return null;
}

export function updatePropertyLeaseTemplate(
  templates: PropertyLeaseTemplate[],
  templateId: string,
  patch: Partial<PropertyLeaseTemplate>,
): PropertyLeaseTemplate[] {
  return templates.map((row) =>
    row.id === templateId
      ? {
          ...row,
          ...patch,
          kind: patch.kind ? normalizeLeaseTemplateKind(patch.kind) : row.kind,
          updatedAt: nowIso(),
        }
      : row,
  );
}

export function removePropertyLeaseTemplate(
  templates: PropertyLeaseTemplate[],
  templateId: string,
): PropertyLeaseTemplate[] {
  return templates.filter((row) => row.id !== templateId);
}
