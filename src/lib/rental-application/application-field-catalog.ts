import type {
  ManagerCustomApplicationField,
  ManagerCustomApplicationFieldType,
} from "@/lib/manager-listing-submission";
import {
  applicationWizardStepForSection,
  RENTAL_APPLICATION_SECTIONS,
  type RentalApplicationSectionId,
} from "@/lib/rental-application/application-sections";

/** Applicant wizard `RentalWizardFormState` keys controlled by one built-in question row. */
const STANDARD_FIELD_WIZARD_KEYS: Record<string, readonly string[]> = {
  "property:Property": ["propertyId"],
  "property:Room choices (1st – 3rd)": ["roomChoice1", "roomChoice2", "roomChoice3"],
  "property:Lease term": ["leaseTerm"],
  "property:Lease start & end dates": ["leaseStart", "leaseEnd"],
  "personal:Full legal name": ["fullLegalName"],
  "personal:Date of birth": ["dateOfBirth"],
  "personal:Social Security number": ["ssn"],
  // The ID-photo attachments ride on the same question as the ID number: a
  // listing that disables "Driver's license / ID" (and the short-term form,
  // which disables it by default) hides AND strips the photos too.
  "personal:Driver's license / ID": ["driversLicense", "idPhotoFront", "idPhotoBack"],
  "personal:Phone": ["phone"],
  "personal:Email": ["email"],
  "current_address:Street, city, state, ZIP": ["currentStreet", "currentCity", "currentState", "currentZip"],
  "current_address:Current landlord name & phone": ["currentLandlordName", "currentLandlordPhone"],
  "current_address:Move-in / move-out dates": ["currentMoveIn", "currentMoveOut"],
  "current_address:Reason for leaving": ["currentReasonLeaving"],
  "previous_address:Street, city, state, ZIP": ["prevStreet", "prevCity", "prevState", "prevZip"],
  "previous_address:Previous landlord name & phone": ["prevLandlordName", "prevLandlordPhone"],
  "previous_address:Move-in / move-out dates": ["prevMoveIn", "prevMoveOut"],
  "previous_address:Reason for leaving": ["prevReasonLeaving"],
  "employment:Employer & employer address": ["employer", "employerAddress"],
  "employment:Supervisor name & phone": ["supervisorName", "supervisorPhone"],
  "employment:Job title & employment start": ["jobTitle", "employmentStart"],
  // Proof-of-income attachments ride on the income question, so the short-term
  // form (which omits the whole employment section) never shows or keeps them.
  "employment:Monthly / annual income": ["monthlyIncome", "annualIncome", "incomeProofPhotos"],
  "employment:Other income": ["otherIncome"],
  "references:Reference 1 — name, relationship, phone": ["ref1Name", "ref1Relationship", "ref1Phone"],
  "references:Reference 2 — name, relationship, phone": ["ref2Name", "ref2Relationship", "ref2Phone"],
  "additional:Number of occupants": ["occupancyCount"],
  "additional:Pets": ["pets"],
  "additional:Eviction history": ["evictionHistory", "evictionDetails"],
  "additional:Bankruptcy history": ["bankruptcyHistory", "bankruptcyDetails"],
  "additional:Criminal history": ["criminalHistory", "criminalDetails"],
  "consent:Credit & background check consent": ["consentCredit"],
  "consent:Truthfulness certification": ["consentTruth"],
  "consent:Digital signature & date": ["digitalSignature", "dateSigned"],
};

export type StandardApplicationFieldDef = {
  standardKey: string;
  section: RentalApplicationSectionId;
  label: string;
  type: ManagerCustomApplicationFieldType;
  required: boolean;
  options: string[];
  wizardFormKeys: readonly string[];
};

export type ResolvedApplicationField = ManagerCustomApplicationField & {
  /** Present on built-in Axis questions from the catalog. */
  standardKey?: string;
  isStandard: boolean;
};

const OCCUPANCY_OPTIONS = ["1", "2", "3", "4", "5"] as const;
const YES_NO_OPTIONS = ["Yes", "No"] as const;

type StandardFieldConfig = {
  type: ManagerCustomApplicationFieldType;
  options?: readonly string[];
};

/** Default editor types/options aligned with the applicant rental wizard. */
const STANDARD_FIELD_TYPE_MAP: Record<string, StandardFieldConfig> = {
  "property:Property": { type: "select" },
  "property:Room choices (1st – 3rd)": { type: "select" },
  "property:Lease term": { type: "select" },
  "property:Lease start & end dates": { type: "date" },
  "personal:Full legal name": { type: "text" },
  "personal:Date of birth": { type: "date" },
  "personal:Social Security number": { type: "text" },
  "personal:Driver's license / ID": { type: "text" },
  "personal:Phone": { type: "text" },
  "personal:Email": { type: "text" },
  "current_address:Street, city, state, ZIP": { type: "text" },
  "current_address:Current landlord name & phone": { type: "text" },
  "current_address:Move-in / move-out dates": { type: "date" },
  "current_address:Reason for leaving": { type: "text" },
  "previous_address:Street, city, state, ZIP": { type: "text" },
  "previous_address:Previous landlord name & phone": { type: "text" },
  "previous_address:Move-in / move-out dates": { type: "date" },
  "previous_address:Reason for leaving": { type: "text" },
  "employment:Employer & employer address": { type: "text" },
  "employment:Supervisor name & phone": { type: "text" },
  "employment:Job title & employment start": { type: "text" },
  "employment:Monthly / annual income": { type: "number" },
  "employment:Other income": { type: "number" },
  "references:Reference 1 — name, relationship, phone": { type: "text" },
  "references:Reference 2 — name, relationship, phone": { type: "text" },
  "additional:Number of occupants": { type: "select", options: OCCUPANCY_OPTIONS },
  "additional:Pets": { type: "text" },
  "additional:Eviction history": { type: "select", options: YES_NO_OPTIONS },
  "additional:Bankruptcy history": { type: "select", options: YES_NO_OPTIONS },
  "additional:Criminal history": { type: "select", options: YES_NO_OPTIONS },
  "consent:Credit & background check consent": { type: "checkbox" },
  "consent:Truthfulness certification": { type: "checkbox" },
  "consent:Digital signature & date": { type: "text" },
};

function standardFieldConfig(section: RentalApplicationSectionId, label: string): StandardFieldConfig {
  const key = `${section}:${label}`;
  const config = STANDARD_FIELD_TYPE_MAP[key];
  if (!config) {
    throw new Error(`Missing standard field type map entry for ${key}`);
  }
  return config;
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
    section.standardFields.map((label, index) => {
      const config = standardFieldConfig(section.id, label);
      return {
        standardKey: standardKeyFor(section.id, label, index),
        section: section.id,
        label,
        type: config.type,
        required: true,
        options: [...(config.options ?? [])],
        wizardFormKeys: STANDARD_FIELD_WIZARD_KEYS[`${section.id}:${label}`] ?? [],
      };
    }),
  );

const CATALOG_BY_KEY = new Map(
  STANDARD_APPLICATION_FIELD_CATALOG.map((def) => [def.standardKey, def] as const),
);

/** The two application products. Mirrors `RentalWizardFormState["rentalType"]`. */
export type ApplicationFormVariant = "standard" | "short_term";

/**
 * Sections and individual built-in questions PropLane omits from the SHORT-TERM
 * application by default. A short-term lodger staying a handful of days is not
 * asked for rental history, employer/income, references, or a background check;
 * the short-term stay is defined by who/where/when + house-rules acknowledgement
 * + signature (see the captain's Short-Term Room Stay Agreement reference).
 * Derived from the catalog (not hand-slugged) so it survives label/slug changes.
 */
const SHORT_TERM_OMITTED_SECTIONS = new Set<RentalApplicationSectionId>([
  "current_address",
  "previous_address",
  "employment",
  "references",
  "additional",
]);
const SHORT_TERM_OMITTED_STANDARD_LABELS = new Set<string>([
  "personal:Social Security number",
  "personal:Driver's license / ID",
  "consent:Credit & background check consent",
]);

/** Built-in question keys disabled by default in an unconfigured short-term application. */
export const SHORT_TERM_DEFAULT_DISABLED_STANDARD_KEYS: readonly string[] =
  STANDARD_APPLICATION_FIELD_CATALOG.filter(
    (def) =>
      SHORT_TERM_OMITTED_SECTIONS.has(def.section) ||
      SHORT_TERM_OMITTED_STANDARD_LABELS.has(`${def.section}:${def.label}`),
  ).map((def) => def.standardKey);

/** The application-config triplet the catalog + validator functions read, for one form variant. */
export type ApplicationConfigSlice = {
  disabledStandardApplicationKeys: string[];
  customApplicationFields: ManagerCustomApplicationField[];
  applicationConfigMode: "standard" | "custom";
};

type VariantConfigSource = {
  disabledStandardApplicationKeys?: unknown;
  customApplicationFields?: unknown;
  applicationConfigMode?: unknown;
  shortTermDisabledStandardApplicationKeys?: unknown;
  shortTermCustomApplicationFields?: unknown;
  shortTermApplicationConfigMode?: unknown;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    : [];
}

function asCustomFields(value: unknown): ManagerCustomApplicationField[] {
  return Array.isArray(value) ? (value as ManagerCustomApplicationField[]) : [];
}

function asConfigMode(value: unknown): "standard" | "custom" {
  return value === "custom" ? "custom" : "standard";
}

/**
 * Resolve the application-config slice for ONE form variant. The long-term
 * (standard) form reads the top-level triplet unchanged; the short-term form
 * reads its own `shortTerm*` triplet, and while it is still "standard"
 * (unconfigured) it resolves to PropLane's curated short-term default — the
 * only place the two forms differ out of the box. Pass the result to
 * `isWizardFormFieldEnabled` / `resolveListingApplicationFields` / the
 * mutation helpers, which already operate on this exact shape.
 */
export function applicationConfigForVariant(
  sub: VariantConfigSource | null | undefined,
  variant: ApplicationFormVariant,
): ApplicationConfigSlice {
  if (variant !== "short_term") {
    return {
      disabledStandardApplicationKeys: asStringArray(sub?.disabledStandardApplicationKeys),
      customApplicationFields: asCustomFields(sub?.customApplicationFields),
      applicationConfigMode: asConfigMode(sub?.applicationConfigMode),
    };
  }
  if (sub?.shortTermApplicationConfigMode === "custom") {
    return {
      disabledStandardApplicationKeys: asStringArray(sub.shortTermDisabledStandardApplicationKeys),
      customApplicationFields: asCustomFields(sub.shortTermCustomApplicationFields),
      applicationConfigMode: "custom",
    };
  }
  // Unconfigured short-term form → curated default question set.
  return {
    disabledStandardApplicationKeys: [...SHORT_TERM_DEFAULT_DISABLED_STANDARD_KEYS],
    customApplicationFields: asCustomFields(sub?.shortTermCustomApplicationFields),
    applicationConfigMode: "standard",
  };
}

/**
 * Write a resolved slice back onto the correct set of submission fields for the
 * variant. Returns a partial submission to spread over the listing submission.
 */
export function mergeApplicationConfigForVariant(
  variant: ApplicationFormVariant,
  slice: ApplicationConfigSlice,
): {
  disabledStandardApplicationKeys?: string[];
  customApplicationFields?: ManagerCustomApplicationField[];
  applicationConfigMode?: "standard" | "custom";
  shortTermDisabledStandardApplicationKeys?: string[];
  shortTermCustomApplicationFields?: ManagerCustomApplicationField[];
  shortTermApplicationConfigMode?: "standard" | "custom";
} {
  if (variant !== "short_term") {
    return {
      disabledStandardApplicationKeys: slice.disabledStandardApplicationKeys,
      customApplicationFields: slice.customApplicationFields,
      applicationConfigMode: slice.applicationConfigMode,
    };
  }
  return {
    shortTermDisabledStandardApplicationKeys: slice.disabledStandardApplicationKeys,
    shortTermCustomApplicationFields: slice.customApplicationFields,
    shortTermApplicationConfigMode: slice.applicationConfigMode,
  };
}

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

/** Built-in questions currently turned OFF for a listing/variant (for the manager re-add UI). */
export function resolveDisabledStandardApplicationFields(
  sub: { disabledStandardApplicationKeys?: unknown } | null | undefined,
): ResolvedApplicationField[] {
  const disabled = disabledStandardKeysSet(sub);
  if (disabled.size === 0) return [];
  return STANDARD_APPLICATION_FIELD_CATALOG.filter((def) => disabled.has(def.standardKey)).map(defaultRowFromDef);
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
  const disabled = [...(sub.disabledStandardApplicationKeys ?? [])];
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

/**
 * Re-enable a built-in question that was turned off (either by the manager or,
 * for short-term, by PropLane's curated default). Removes its key from the
 * disabled set; collapses back to "standard" mode when nothing is customized.
 */
export function reenableListingApplicationField(
  sub: {
    disabledStandardApplicationKeys?: string[];
    customApplicationFields?: ManagerCustomApplicationField[];
    applicationConfigMode?: "standard" | "custom";
  },
  standardKey: string,
): {
  disabledStandardApplicationKeys: string[];
  customApplicationFields: ManagerCustomApplicationField[];
  applicationConfigMode: "standard" | "custom";
} {
  const disabled = (sub.disabledStandardApplicationKeys ?? []).filter((k) => k !== standardKey);
  const saved = [...(sub.customApplicationFields ?? [])];
  const applicationConfigMode = disabled.length > 0 || saved.length > 0 ? "custom" : "standard";
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

function disabledStandardKeysSet(
  sub: { disabledStandardApplicationKeys?: unknown } | null | undefined,
): Set<string> {
  return new Set(
    Array.isArray(sub?.disabledStandardApplicationKeys)
      ? sub!.disabledStandardApplicationKeys.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      : [],
  );
}

/** Wizard form keys hidden for this listing (manager removed built-in questions). */
export function listingDisabledWizardFormKeys(
  sub: { disabledStandardApplicationKeys?: unknown } | null | undefined,
): ReadonlySet<string> {
  const disabled = disabledStandardKeysSet(sub);
  const keys = new Set<string>();
  for (const def of STANDARD_APPLICATION_FIELD_CATALOG) {
    if (!disabled.has(def.standardKey)) continue;
    for (const k of def.wizardFormKeys) keys.add(k);
  }
  return keys;
}

export function isWizardFormFieldEnabled(
  sub: { disabledStandardApplicationKeys?: unknown } | null | undefined,
  formKey: string,
): boolean {
  return !listingDisabledWizardFormKeys(sub).has(formKey);
}

/**
 * Wizard steps that carry at least one visible question for a resolved config
 * slice. Group / co-signer / review / fee (1, 2, 11, 12) are structural and
 * always present; the section steps (3-10) appear only when they still have an
 * enabled built-in or custom question. This is what lets the short-term form
 * quietly skip the screening sections its curated default turns off — and bring
 * a section back the moment a manager re-enables a question in it. The applicant
 * never sees a total, so a shorter step list simply reads as a shorter form.
 */
const ALWAYS_ACTIVE_WIZARD_STEPS: readonly number[] = [1, 2, 11, 12];

export function activeApplicationWizardSteps(
  sub:
    | {
        disabledStandardApplicationKeys?: unknown;
        customApplicationFields?: unknown;
      }
    | null
    | undefined,
  normalizeSaved: (raw: unknown) => ManagerCustomApplicationField[],
): number[] {
  const active = new Set<number>(ALWAYS_ACTIVE_WIZARD_STEPS);
  for (const field of resolveListingApplicationFields(sub, normalizeSaved)) {
    active.add(applicationWizardStepForSection(field.section));
  }
  return [...active].sort((a, b) => a - b);
}
