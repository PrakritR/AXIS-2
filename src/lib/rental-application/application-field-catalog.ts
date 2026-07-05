import type {
  ManagerCustomApplicationField,
  ManagerCustomApplicationFieldType,
} from "@/lib/manager-listing-submission";
import {
  RENTAL_APPLICATION_SECTIONS,
  type RentalApplicationSectionId,
} from "@/lib/rental-application/application-sections";

export type StandardApplicationFieldDef = {
  standardKey: string;
  section: RentalApplicationSectionId;
  label: string;
  type: ManagerCustomApplicationFieldType;
  required: boolean;
  options: string[];
};

export type ResolvedApplicationField = ManagerCustomApplicationField & {
  /** Present on built-in Axis questions from the catalog. */
  standardKey?: string;
  isStandard: boolean;
};

function inferStandardFieldType(
  section: RentalApplicationSectionId,
  label: string,
): ManagerCustomApplicationFieldType {
  if (section === "consent") return "checkbox";
  if (/date/i.test(label)) return "date";
  return "text";
}

function standardKeyFor(section: RentalApplicationSectionId, label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${section}-${slug || index}`;
}

/** Canonical built-in application questions — one row per standard applicant prompt. */
export const STANDARD_APPLICATION_FIELD_CATALOG: readonly StandardApplicationFieldDef[] =
  RENTAL_APPLICATION_SECTIONS.flatMap((section) =>
    section.standardFields.map((label, index) => ({
      standardKey: standardKeyFor(section.id, label, index),
      section: section.id,
      label,
      type: inferStandardFieldType(section.id, label),
      required: true,
      options: [] as string[],
    })),
  );

const CATALOG_BY_KEY = new Map(
  STANDARD_APPLICATION_FIELD_CATALOG.map((def) => [def.standardKey, def] as const),
);

function defaultRowFromDef(def: StandardApplicationFieldDef): ResolvedApplicationField {
  return {
    id: `std-${def.standardKey}`,
    key: def.standardKey,
    standardKey: def.standardKey,
    isStandard: true,
    label: def.label,
    type: def.type,
    required: def.required,
    options: [...def.options],
    section: def.section,
  };
}

function mergeStandardWithOverride(
  def: StandardApplicationFieldDef,
  override: ManagerCustomApplicationField | undefined,
): ResolvedApplicationField {
  const base = defaultRowFromDef(def);
  if (!override) return base;
  return {
    ...base,
    id: override.id || base.id,
    label: override.label.trim() || base.label,
    type: override.type ?? base.type,
    required: override.required ?? base.required,
    options: override.type === "select" && override.options.length > 0 ? [...override.options] : base.options,
  };
}

export function listingApplicationIsCustomized(
  sub:
    | {
        disabledStandardApplicationKeys?: unknown;
        customApplicationFields?: unknown;
        applicationConfigMode?: unknown;
      }
    | null
    | undefined,
): boolean {
  if (!sub) return false;
  if (Array.isArray(sub.disabledStandardApplicationKeys) && sub.disabledStandardApplicationKeys.length > 0) {
    return true;
  }
  if (!Array.isArray(sub.customApplicationFields) || sub.customApplicationFields.length === 0) {
    return sub.applicationConfigMode === "custom";
  }
  return true;
}

/** Full question list for manager UI — built-in (minus removed) plus manager-added rows. */
export function resolveListingApplicationFields(
  sub:
    | {
        disabledStandardApplicationKeys?: unknown;
        customApplicationFields?: unknown;
      }
    | null
    | undefined,
  normalizeSaved: (raw: unknown) => ManagerCustomApplicationField[],
): ResolvedApplicationField[] {
  const disabled = new Set(
    Array.isArray(sub?.disabledStandardApplicationKeys)
      ? sub!.disabledStandardApplicationKeys.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      : [],
  );
  const saved = normalizeSaved(sub?.customApplicationFields);
  const overridesByKey = new Map(
    saved.filter((f) => f.standardKey).map((f) => [f.standardKey!, f] as const),
  );
  const customOnly = saved.filter((f) => !f.standardKey);

  const standardRows = STANDARD_APPLICATION_FIELD_CATALOG.filter((def) => !disabled.has(def.standardKey)).map(
    (def) => mergeStandardWithOverride(def, overridesByKey.get(def.standardKey)),
  );

  return [
    ...standardRows,
    ...customOnly.map((f) => ({
      ...f,
      isStandard: false,
    })),
  ];
}

export function restoreDefaultApplicationConfig(): {
  disabledStandardApplicationKeys: string[];
  customApplicationFields: ManagerCustomApplicationField[];
  applicationConfigMode: "standard";
} {
  return {
    disabledStandardApplicationKeys: [],
    customApplicationFields: [],
    applicationConfigMode: "standard",
  };
}

export function applicationFieldCatalogDef(standardKey: string): StandardApplicationFieldDef | undefined {
  return CATALOG_BY_KEY.get(standardKey);
}

function overrideMatchesDefault(
  def: StandardApplicationFieldDef,
  override: ManagerCustomApplicationField,
): boolean {
  return (
    override.label.trim() === def.label &&
    override.type === def.type &&
    override.required === def.required &&
    (override.type !== "select" || override.options.join("|") === def.options.join("|"))
  );
}

/** Persist edits to one resolved application question row. */
export function patchListingApplicationField(
  sub: {
    disabledStandardApplicationKeys?: string[];
    customApplicationFields?: ManagerCustomApplicationField[];
    applicationConfigMode?: "standard" | "custom";
  },
  field: ResolvedApplicationField,
  patch: Partial<ManagerCustomApplicationField>,
): {
  disabledStandardApplicationKeys: string[];
  customApplicationFields: ManagerCustomApplicationField[];
  applicationConfigMode: "standard" | "custom";
} {
  const nextField: ResolvedApplicationField = { ...field, ...patch };
  const disabled = [...(sub.disabledStandardApplicationKeys ?? [])];
  let saved = [...(sub.customApplicationFields ?? [])];

  if (nextField.isStandard && nextField.standardKey) {
    const def = CATALOG_BY_KEY.get(nextField.standardKey);
    const without = saved.filter((f) => f.standardKey !== nextField.standardKey);
    if (def && overrideMatchesDefault(def, nextField)) {
      saved = without;
    } else {
      const { isStandard: _i, ...persisted } = nextField;
      saved = [...without, persisted];
    }
  } else {
    saved = saved.map((f) => (f.id === nextField.id ? { ...f, ...patch } : f));
  }

  const applicationConfigMode =
    disabled.length > 0 || saved.length > 0 ? "custom" : sub.applicationConfigMode === "custom" ? "custom" : "standard";

  return { disabledStandardApplicationKeys: disabled, customApplicationFields: saved, applicationConfigMode };
}

/** Remove a built-in or custom application question from the listing. */
export function removeListingApplicationField(
  sub: {
    disabledStandardApplicationKeys?: string[];
    customApplicationFields?: ManagerCustomApplicationField[];
    applicationConfigMode?: "standard" | "custom";
  },
  field: ResolvedApplicationField,
): {
  disabledStandardApplicationKeys: string[];
  customApplicationFields: ManagerCustomApplicationField[];
  applicationConfigMode: "standard" | "custom";
} {
  let disabled = [...(sub.disabledStandardApplicationKeys ?? [])];
  let saved = [...(sub.customApplicationFields ?? [])];

  if (field.isStandard && field.standardKey) {
    if (!disabled.includes(field.standardKey)) disabled.push(field.standardKey);
    saved = saved.filter((f) => f.standardKey !== field.standardKey);
  } else {
    saved = saved.filter((f) => f.id !== field.id);
  }

  const applicationConfigMode =
    disabled.length > 0 || saved.length > 0 ? "custom" : "standard";

  return { disabledStandardApplicationKeys: disabled, customApplicationFields: saved, applicationConfigMode };
}

export function addListingApplicationField(
  sub: {
    customApplicationFields?: ManagerCustomApplicationField[];
    applicationConfigMode?: "standard" | "custom";
  },
  field: ManagerCustomApplicationField,
): {
  customApplicationFields: ManagerCustomApplicationField[];
  applicationConfigMode: "custom";
} {
  return {
    customApplicationFields: [...(sub.customApplicationFields ?? []), field],
    applicationConfigMode: "custom",
  };
}
