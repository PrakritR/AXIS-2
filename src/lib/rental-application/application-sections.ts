/**
 * Catalog of the standard Axis rental-application sections.
 *
 * Used by the manager create-listing wizard (to show the default application
 * outline and attach custom questions to a section) and by the applicant
 * wizard (to ask each custom question inside its section's step).
 *
 * Keep dependency-free: imported by both `manager-listing-submission` and the
 * rental-application libs.
 */

export type RentalApplicationSectionId =
  | "property"
  | "personal"
  | "current_address"
  | "previous_address"
  | "employment"
  | "references"
  | "additional"
  | "consent";

export type RentalApplicationSection = {
  id: RentalApplicationSectionId;
  title: string;
  /** Applicant rental-wizard step that asks this section's questions. */
  wizardStep: number;
  /** Standard fields the applicant fills in this section (manager-facing outline). */
  standardFields: readonly string[];
};

/**
 * Sections managers can review and extend with custom questions, in applicant
 * order. Group/co-signer steps are intentionally excluded: they run before the
 * applicant has picked a property, so per-property questions there could be
 * skipped.
 */
export const RENTAL_APPLICATION_SECTIONS: readonly RentalApplicationSection[] = [
  {
    id: "property",
    title: "Property information",
    wizardStep: 3,
    standardFields: [
      "Property",
      "Room choices (1st – 3rd)",
      "Rental type (standard or short-term)",
      "Lease term",
      "Lease start & end dates",
    ],
  },
  {
    id: "personal",
    title: "Personal information",
    wizardStep: 4,
    standardFields: [
      "Full legal name",
      "Date of birth",
      "Social Security number",
      "Driver's license / ID",
      "Phone",
      "Email",
    ],
  },
  {
    id: "current_address",
    title: "Current address",
    wizardStep: 5,
    standardFields: [
      "Street, city, state, ZIP",
      "Current landlord name & phone",
      "Move-in / move-out dates",
      "Reason for leaving",
    ],
  },
  {
    id: "previous_address",
    title: "Previous address",
    wizardStep: 6,
    standardFields: [
      "Street, city, state, ZIP",
      "Previous landlord name & phone",
      "Move-in / move-out dates",
      "Reason for leaving",
    ],
  },
  {
    id: "employment",
    title: "Employment & income",
    wizardStep: 7,
    standardFields: [
      "Employer & employer address",
      "Supervisor name & phone",
      "Job title & employment start",
      "Monthly / annual income",
      "Other income",
    ],
  },
  {
    id: "references",
    title: "References",
    wizardStep: 8,
    standardFields: [
      "Reference 1 — name, relationship, phone",
      "Reference 2 — name, relationship, phone",
    ],
  },
  {
    id: "additional",
    title: "Additional details",
    wizardStep: 9,
    standardFields: [
      "Number of occupants",
      "Pets",
      "Eviction history",
      "Bankruptcy history",
      "Criminal history",
    ],
  },
  {
    id: "consent",
    title: "Consent & signature",
    wizardStep: 10,
    standardFields: [
      "Credit & background check consent",
      "Truthfulness certification",
      "Digital signature & date",
    ],
  },
];

const SECTION_BY_ID = new Map(RENTAL_APPLICATION_SECTIONS.map((s) => [s.id, s]));

export const RENTAL_APPLICATION_SECTION_IDS: ReadonlySet<string> = new Set(SECTION_BY_ID.keys());

/** Section for questions saved without one (legacy manager questions). */
export const DEFAULT_CUSTOM_FIELD_SECTION_ID: RentalApplicationSectionId = "additional";

export function applicationSectionById(id: string | undefined): RentalApplicationSection | undefined {
  return id ? SECTION_BY_ID.get(id as RentalApplicationSectionId) : undefined;
}

/** Applicant wizard step that should ask a custom question with this section tag. */
export function applicationWizardStepForSection(section: string | undefined): number {
  return applicationSectionById(section)?.wizardStep
    ?? SECTION_BY_ID.get(DEFAULT_CUSTOM_FIELD_SECTION_ID)!.wizardStep;
}
