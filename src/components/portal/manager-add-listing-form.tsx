"use client";

import type { DragEvent, ReactNode } from "react";
import { Children, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/hooks/use-is-client";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { isNativeRuntimeSync } from "@/lib/native/detect-native";
import {
  DEMO_LISTING_AUTOFILL_EVENT,
  DEMO_LISTING_SUBMITTED_EVENT,
} from "@/lib/demo/demo-playback";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LeaseConfigForm, readLeaseTemplateFile } from "@/components/portal/lease-config-form";
import {
  submitManagerPendingPropertyToServer,
  updateExtraListingFromSubmissionOnServer,
  updatePendingManagerPropertyOnServer,
} from "@/lib/demo-property-pipeline";
import { updateRequestChangeProperty } from "@/lib/demo-admin-property-inventory";
import { sortRoomIndicesByFloor, sortUniqueFloorLabels } from "@/lib/listing-floor-order";
import { getPortalListingNote } from "@/lib/portal-listing-notes";
import {
  BUSINESS_MAX_PROPERTIES,
  FREE_MAX_PROPERTIES,
  managerTierPropertyLimitReached,
  normalizeManagerSkuTier,
  PRO_MAX_PROPERTIES,
} from "@/lib/manager-access";
import {
  applyListingBedroomSlots,
  applyListingBathroomSlots,
  applyEntireHomeListingPricing,
  applyEntireHomeMonthlyRent,
  createDefaultListingSubmission,
  CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS,
  customApplicationFieldKeyFromLabel,
  LISTING_SERVICE_QUICK_ADDS,
  resolveServiceOfferPricing,
  type ListingServiceQuickAdd,
  emptyCustomApplicationField,
  entireHomeMonthlyRentAmount,
  formatLeaseTermsBodyFromAllowed,
  isEntireHomeListing,
  normalizeCustomApplicationFields,
  normalizeManagerListingSubmissionV1,
  resolveAllowedLeaseTerms,
  duplicateRoomEntry,
  emptyBathroom,
  emptyBundleRow,
  emptyCustomFeeRow,
  emptyQuickFactRow,
  emptyRoom,
  emptySharedSpace,
  PAYMENT_AT_SIGNING_OPTIONS,
  type ManagerBathroomRoomAccessKind,
  type ManagerBathroomSubmission,
  type ManagerBundleRow,
  type ManagerCustomApplicationField,
  type ManagerCustomApplicationFieldType,
  type ManagerCustomFeeRow,
  type ManagerListingSubmissionV1,
  type ManagerListingServiceOption,
  type ManagerQuickFactRow,
  type ManagerRoomSubmission,
  type ManagerSharedSpaceSubmission,
  type PaymentAtSigningOptionId,
} from "@/lib/manager-listing-submission";
import {
  UTILITIES_PAYMENT_MODEL_OPTIONS,
  type UtilitiesPaymentModel,
} from "@/lib/listing-utilities-payment";
import { RENTAL_APPLICATION_SECTIONS } from "@/lib/rental-application/application-sections";
import {
  addListingApplicationField,
  patchListingApplicationField,
  removeListingApplicationField,
  resolveListingApplicationFields,
  restoreDefaultApplicationConfig,
  type ResolvedApplicationField,
} from "@/lib/rental-application/application-field-catalog";
import {
  BATHROOM_EXTRA_AMENITY_PRESETS,
  HOUSE_WIDE_AMENITY_PRESETS,
  LISTING_BEDROOM_SLOT_OPTIONS,
  LISTING_PLACE_CATEGORY_OPTIONS,
  LISTING_PROPERTY_TYPE_OPTIONS,
  LISTING_ROOM_FLOOR_LEVEL_OPTIONS,
  LISTING_STORIES_OPTIONS,
  LISTING_TOTAL_BATH_OPTIONS,
  ROOM_AMENITY_PRESETS,
  ROOM_FLOOR_LEVEL_CUSTOM,
  ROOM_FURNITURE_PRESETS,
  ROOM_FURNISHING_OPTIONS,
  SHARED_SPACE_AMENITY_PRESETS,
  SHARED_SPACE_KIND_OPTIONS,
  normalizeSharedSpaceKind,
  sharedSpaceAmenityPresetsForKind,
  pruneSharedSpaceAmenitiesForKind,
  type SharedSpaceKind,
  mergeFurnitureToggle,
  mergeToggleLine,
  parseFurnitureSet,
  sanitizeRoomAmenityText,
  splitLineList,
} from "@/data/manager-listing-presets";
import { loadListingPresetConfig, type ListingPresetConfig } from "@/lib/site-content";
import {
  parseOptionalSanitizedMoneyNumber,
  parseSanitizedInteger,
  parseSanitizedMoneyNumber,
  sanitizeBuildingNameInput,
  sanitizeFloorLabelInput,
  sanitizeMoneyInput,
  sanitizeNeighborhoodInput,
  sanitizePaymentContactInput,
  sanitizePaymentLinkInput,
  sanitizePlaceNameInput,
  sanitizeStreetAddressInput,
  sanitizeZipInput,
} from "@/lib/listing-form-inputs";
import { canNavigateToWizardStep } from "@/lib/wizard-step-nav";
import {
  buildListingStepFieldOrder,
  firstInvalidListingStep,
  listingBathroomNameKey,
  listingCustomQuestionErrorKey,
  listingRoomNameKey,
  listingRoomRentKey,
  listingSharedSpaceNameKey,
  validateListingWizardStep,
} from "@/lib/listing-wizard-validation";
import {
  scrollToFirstWizardFieldError,
  wizardFieldErrorClass,
  wizardSectionErrorClass,
} from "@/lib/wizard-field-errors";
import { LEASE_TERM_OPTIONS } from "@/lib/rental-application/data";
import { Modal } from "@/components/ui/modal";
import { usePortalContainer } from "@/components/ui/portal-container-context";

const selectInputCls =
  "min-h-[44px] w-full rounded-xl border border-border bg-auth-input-bg px-3.5 py-2.5 text-[14px] text-foreground outline-none transition focus:border-primary/40 focus:bg-card focus:ring-2 focus:ring-primary/20";

/** Comma/newline-separated dropdown options → clean deduped list. */
function parseQuestionOptionsText(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const t = part.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

function dedupeByLabel<T extends { label: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function roomFloorOptionsFromStories(storiesId: string | undefined): { id: string; label: string }[] {
  if (storiesId === "1") {
    return [
      { id: "1", label: "1st floor" },
      { id: "basement", label: "Basement / garden level" },
      { id: "loft", label: "Loft / attic" },
      { id: "outdoor", label: "Outdoor / detached area" },
    ];
  }
  if (storiesId === "2") {
    return [
      { id: "1", label: "1st floor" },
      { id: "2", label: "2nd floor" },
      { id: "basement", label: "Basement / garden level" },
      { id: "loft", label: "Loft / attic" },
      { id: "outdoor", label: "Outdoor / detached area" },
    ];
  }
  if (storiesId === "3") {
    return [
      { id: "1", label: "1st floor" },
      { id: "2", label: "2nd floor" },
      { id: "3", label: "3rd floor" },
      { id: "basement", label: "Basement / garden level" },
      { id: "loft", label: "Loft / attic" },
      { id: "outdoor", label: "Outdoor / detached area" },
    ];
  }
  if (storiesId === "4") {
    return [
      { id: "1", label: "1st floor" },
      { id: "2", label: "2nd floor" },
      { id: "3", label: "3rd floor" },
      { id: "4plus", label: "4th floor or higher" },
      { id: "basement", label: "Basement / garden level" },
      { id: "loft", label: "Loft / attic" },
      { id: "outdoor", label: "Outdoor / detached area" },
    ];
  }
  if (storiesId === "split") {
    return [
      { id: "split-main", label: "Main split level" },
      { id: "split-upper", label: "Upper split level" },
      { id: "split-lower", label: "Lower split level" },
      { id: "basement", label: "Basement / garden level" },
      { id: "loft", label: "Loft / attic" },
      { id: "outdoor", label: "Outdoor / detached area" },
    ];
  }
  return LISTING_ROOM_FLOOR_LEVEL_OPTIONS.map((o) => ({ id: o.id, label: o.label }));
}

function roomFloorSelectValueFromOptions(floor: string, options: readonly { id: string; label: string }[]): string {
  const hit = options.find((o) => o.label === floor);
  if (hit) return hit.id;
  if (!floor.trim()) return "";
  return ROOM_FLOOR_LEVEL_CUSTOM;
}

function uniqueRoomFloorLabels(rooms: { floor: string }[]): string[] {
  return sortUniqueFloorLabels(rooms.map((r) => r.floor));
}

const LOCATION_LEVEL_CUSTOM = "__location_custom__";

function locationOptionsFromStories(storiesId: string | undefined): string[] {
  if (storiesId === "1") return ["1st / main floor", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  if (storiesId === "2") return ["1st / main floor", "2nd floor", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  if (storiesId === "3") return ["1st / main floor", "2nd floor", "3rd floor", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  if (storiesId === "4") return ["1st / main floor", "2nd floor", "3rd floor", "4th floor or higher", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  if (storiesId === "split") return ["Main split level", "Upper split level", "Lower split level", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
  // Default: all standard floors (stories not yet set)
  return ["1st / main floor", "2nd floor", "3rd floor", "4th floor or higher", "Basement / garden level", "Loft / attic", "Outdoor / detached area"];
}

function locationSelectValue(location: string, options: readonly string[]): string {
  const t = location.trim();
  if (!t) return "";
  return options.includes(t) ? t : LOCATION_LEVEL_CUSTOM;
}

const DEFAULT_LISTING_PRESETS: ListingPresetConfig = {
  houseWide: [...HOUSE_WIDE_AMENITY_PRESETS],
  sharedSpace: [...SHARED_SPACE_AMENITY_PRESETS],
  bathroom: [...BATHROOM_EXTRA_AMENITY_PRESETS],
  room: [...ROOM_AMENITY_PRESETS],
  furniture: [...ROOM_FURNITURE_PRESETS],
  availability: [],
  furnishing: ROOM_FURNISHING_OPTIONS,
};

function FormSection({ id, title, description, children }: { id?: string; title: string; description?: ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-5">
      <header>
        <h3 className="text-base font-bold tracking-tight text-foreground sm:text-[17px]">{title}</h3>
        {description ? <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">{description}</p> : null}
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function ListingWizardChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LISTING_WIZARD_ACTION_BTN = "h-8 rounded-full px-3 text-xs";
const LISTING_WIZARD_REMOVE_BTN = `${LISTING_WIZARD_ACTION_BTN} shrink-0 border-rose-200 text-rose-800 portal-danger-outline`;

function listingItemKey(kind: string, id: string) {
  return `${kind}:${id}`;
}

function ListingWizardCollapsibleCard({
  expanded,
  onToggle,
  title,
  subtitle,
  headerActions,
  hasError,
  bodyClassName = "p-4 sm:p-5",
  toggleDataAttr,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  hasError?: boolean;
  bodyClassName?: string;
  toggleDataAttr?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${hasError ? "border-red-300 ring-2 ring-red-100" : "border-border"}`}
    >
      <div
        className={`flex flex-col gap-3 bg-accent/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 ${expanded ? "border-b border-border" : ""}`}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left sm:items-center"
          aria-expanded={expanded}
          data-attr={toggleDataAttr}
          onClick={onToggle}
        >
          <ListingWizardChevron open={expanded} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">{title}</p>
            {subtitle ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{subtitle}</p> : null}
          </div>
        </button>
        {headerActions ? (
          <div className="flex flex-wrap gap-2 pl-6 sm:pl-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {headerActions}
          </div>
        ) : null}
      </div>
      {expanded ? <div className={bodyClassName}>{children}</div> : null}
    </div>
  );
}

const LISTING_CHOICE_CARD =
  "rounded-2xl border px-3 py-3 text-left transition sm:px-4 sm:py-3.5";

function listingChoiceCardClass(selected: boolean) {
  return selected
    ? `${LISTING_CHOICE_CARD} border-primary ring-2 ring-primary/25`
    : `${LISTING_CHOICE_CARD} border-border hover:border-primary/30`;
}

function togglePaymentAtSigning(
  current: PaymentAtSigningOptionId[],
  id: PaymentAtSigningOptionId,
  on: boolean,
): PaymentAtSigningOptionId[] {
  const set = new Set(current);
  if (on) set.add(id);
  else set.delete(id);
  return PAYMENT_AT_SIGNING_OPTIONS.map((o) => o.id).filter((k) => set.has(k));
}

const MAX_IMG_BYTES = 10 * 1024 * 1024;
const MAX_HOUSE_PHOTOS = 12;
/** Max pixel width after compression. */
const IMG_MAX_WIDTH = 1280;
const IMG_QUALITY = 0.75;

function isImageUploadFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(file.name);
}

function isVideoUploadFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name);
}

function mediaDropZoneClass(active: boolean) {
  return `rounded-xl border border-dashed p-4 transition ${
    active
      ? "border-primary/50 bg-primary/[0.06] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]"
      : "border-border bg-card hover:border-primary/30 hover:bg-primary/[0.03]"
  }`;
}

const MEDIA_PICK_BTN_CLASS =
  "inline-flex cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.06] disabled:cursor-not-allowed disabled:opacity-60";

/** Programmatic file picker — avoids label/htmlFor inside overflow-hidden modals blanking the UI. */
function MediaPickTrigger({
  accept,
  multiple,
  disabled,
  className,
  onFiles,
  children,
}: {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  onFiles: (files: FileList | null) => void;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        className={className ?? MEDIA_PICK_BTN_CLASS}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        {children}
      </button>
    </>
  );
}

function PlaceCategoryPicker({
  value,
  onSelect,
  hasError,
  errorMsg,
}: {
  value: string | undefined;
  onSelect: (id: string) => void;
  hasError?: boolean;
  errorMsg?: string;
}) {
  return (
    <div
      data-wizard-field="listingPlaceCategoryId"
      className={wizardSectionErrorClass(Boolean(hasError))}
    >
      <p className="text-sm font-semibold text-foreground">How is this property rented?</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Choose one model — we’ll tailor rent, utilities, and proration fields below.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {LISTING_PLACE_CATEGORY_OPTIONS.map((opt) => {
          const on = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={listingChoiceCardClass(on)}
            >
              <span className="text-sm font-semibold text-foreground">{opt.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{opt.hint}</span>
            </button>
          );
        })}
      </div>
      <StepFieldError msg={errorMsg} />
    </div>
  );
}

function UtilitiesPaymentModelPicker({
  value,
  onSelect,
}: {
  value: UtilitiesPaymentModel | undefined;
  onSelect: (model: UtilitiesPaymentModel) => void;
}) {
  const selected = value ?? "manager_billed";
  return (
    <div className="space-y-2">
      <FieldLabel hint="How residents pay for utilities on this listing.">Utilities payment</FieldLabel>
      <div className="grid gap-2">
        {UTILITIES_PAYMENT_MODEL_OPTIONS.map((opt) => {
          const on = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={listingChoiceCardClass(on)}
            >
              <span className="text-sm font-semibold text-foreground">{opt.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{opt.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProrationMethodFields({
  prorateMethod,
  monthlyRent,
  dailyRentRate,
  dailyUtilitiesRate,
  utilitiesLabel,
  onMethod,
  onDailyRent,
  onDailyUtilities,
}: {
  prorateMethod: "auto" | "daily_rate";
  monthlyRent: number;
  dailyRentRate?: number;
  dailyUtilitiesRate?: number;
  utilitiesLabel?: string;
  onMethod: (m: "auto" | "daily_rate") => void;
  onDailyRent: (n: number | undefined) => void;
  onDailyUtilities: (n: number | undefined) => void;
}) {
  return (
    <div className="space-y-3">
      <FieldLabel hint="How first-month rent and utilities are prorated when someone moves in mid-month.">
        Proration method
      </FieldLabel>
      <div className="flex gap-3">
        {(["auto", "daily_rate"] as const).map((method) => {
          const active = prorateMethod === method;
          return (
            <button
              key={method}
              type="button"
              onClick={() => onMethod(method)}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${active ? "border-primary bg-primary/5 font-medium text-primary" : "border-border bg-card text-muted hover:border-border hover:bg-accent/30"}`}
            >
              <span className="block font-semibold">
                {method === "auto" ? "Auto (÷ days in month)" : "Manual daily rate"}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {method === "auto"
                  ? "Remaining days ÷ days in month × monthly rate"
                  : "Remaining days × your set daily rate"}
              </span>
            </button>
          );
        })}
      </div>
      {prorateMethod === "auto" && monthlyRent > 0 ? (
        <p className="text-xs text-muted">
          Example: move-in May 14 → 18/31 × ${monthlyRent} ={" "}
          <span className="font-semibold text-muted">${((18 / 31) * monthlyRent).toFixed(2)}</span> prorated rent
        </p>
      ) : null}
      {prorateMethod === "daily_rate" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <GridField>
            <FieldLabel>Daily rent rate</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
              <Input
                inputMode="decimal"
                className="pl-8"
                value={dailyRentRate ?? ""}
                onChange={(e) => onDailyRent(parseOptionalSanitizedMoneyNumber(e.target.value))}
                placeholder={monthlyRent > 0 ? String(Math.ceil(monthlyRent / 30)) : "28"}
              />
            </div>
          </GridField>
          <GridField>
            <FieldLabel>{utilitiesLabel ?? "Daily utilities rate"}</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
              <Input
                inputMode="decimal"
                className="pl-8"
                value={dailyUtilitiesRate ?? ""}
                onChange={(e) => onDailyUtilities(parseOptionalSanitizedMoneyNumber(e.target.value))}
                placeholder="6"
              />
            </div>
          </GridField>
        </div>
      ) : null}
    </div>
  );
}

const SHARED_SPACE_TEMPLATES = [
  {
    label: "Kitchen & dining",
    kind: "kitchen" as const,
    detail: "",
    amenities: ["Refrigerator", "Microwave", "Oven / range", "Dishwasher"],
  },
  {
    label: "Living room / lounge",
    kind: "living" as const,
    detail: "",
    amenities: ["Living / lounge seating", "Couch / sofa", "TV in common area"],
  },
  {
    label: "Laundry",
    kind: "laundry" as const,
    detail: "",
    amenities: ["Washer / dryer", "Laundry sink"],
  },
  {
    label: "Outdoor / yard",
    kind: "outdoor" as const,
    detail: "",
    amenities: ["Patio / deck seating", "BBQ grill", "Yard / lawn"],
  },
  {
    label: "Workspace",
    kind: "workspace" as const,
    detail: "",
    amenities: ["Desk / workspace", "Office chair"],
  },
] as const;

const LISTING_FORM_STEPS = [
  { id: "home",        label: "Home",           icon: "🏠" },
  { id: "rooms",       label: "Rooms",          icon: "🛏" },
  { id: "bathrooms",   label: "Bathrooms",      icon: "🚿" },
  { id: "spaces",      label: "Shared spaces",  icon: "🪑" },
  { id: "lease",       label: "Pricing",        icon: "💰" },
  { id: "move",        label: "Move info",      icon: "📦" },
  { id: "services",    label: "Services",       icon: "🛎" },
  { id: "application", label: "Application",    icon: "📋" },
  { id: "leasedoc",    label: "Lease",          icon: "📄" },
  { id: "finish",      label: "Submit",         icon: "✅" },
] as const;

/** Public listing preview tabs — home through pricing plus sidebar quick facts. */
export const LISTING_PREVIEW_STEP_IDS = ["home", "rooms", "bathrooms", "spaces", "lease", "finish"] as const;

export type ListingWizardScope = "full" | "preview";

export function listingWizardStepIndices(scope: ListingWizardScope): number[] {
  if (scope === "full") return LISTING_FORM_STEPS.map((_, i) => i);
  const previewIds = new Set<string>(LISTING_PREVIEW_STEP_IDS);
  return LISTING_FORM_STEPS.map((step, i) => (previewIds.has(step.id) ? i : -1)).filter((i) => i >= 0);
}

const LISTING_STEP_COUNT = LISTING_FORM_STEPS.length;

const LISTING_STEP_BLURBS: Record<(typeof LISTING_FORM_STEPS)[number]["id"], string> = {
  home:        "Property type, address, layout, building amenities, house details, and full-house photos.",
  rooms:       "Bedroom names, floor, furnishing, and amenities — pricing is set on Pricing.",
  bathrooms:   "Bathroom name, location, and amenities for the public listing.",
  spaces:      "Shared areas — name, location, and amenities (kitchen, laundry, lounge, outdoor).",
  lease:       "How the home is rented (by room or entire place), rent, utilities, proration, deposits, and fees.",
  move:        "Move-in access instructions for residents.",
  services:    "Optional paid or free services residents can request from their portal.",
  application: "Review the rental application applicants complete for this property, and add your own questions to any section.",
  leasedoc:    "Use the Axis standard generated lease, or provide your own lease terms or template for this property.",
  finish:      "Sidebar quick facts and final submit.",
};

/** Reads a file and returns a compressed JPEG data URL. Falls back to raw data URL for non-image files. */
/** Yields control back to the browser so it can paint/handle input before heavy work. */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function fileToDataUrl(file: File, maxBytes: number): Promise<string | null> {
  if (file.size > maxBytes) return null;
  if (!file.type.startsWith("image/")) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    });
  }
  return new Promise((resolve) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const scale = Math.min(1, IMG_MAX_WIDTH / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", IMG_QUALITY));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
    img.src = objectUrl;
  });
}

const TUS_CHUNK = 6 * 1024 * 1024; // 6 MB per chunk

async function uploadViaTus(file: File, path: string, mime: string, token: string, supabaseUrl: string): Promise<void> {
  const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
  const metadata = [
    `bucketName ${b64("listing-photos")}`,
    `objectName ${b64(path)}`,
    `contentType ${b64(mime)}`,
    // Filenames are timestamp+random and never overwritten, so the object is
    // immutable — cache for a year to avoid re-fetching media on every view.
    `cacheControl ${b64("31536000")}`,
  ].join(",");

  const createRes = await fetch(`${supabaseUrl}/storage/v1/upload/resumable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Length": "0",
      "Upload-Length": String(file.size),
      "Upload-Metadata": metadata,
      "Tus-Resumable": "1.0.0",
      "x-upsert": "false",
    },
  });
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => "");
    throw new Error(`TUS session failed (${createRes.status}): ${body}`);
  }
  const rawLoc = createRes.headers.get("Location");
  if (!rawLoc) throw new Error("TUS: no Location header in response");
  const location = rawLoc.startsWith("http") ? rawLoc : `${supabaseUrl}${rawLoc}`;

  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + TUS_CHUNK, file.size);
    const chunk = file.slice(offset, end);
    const patchRes = await fetch(location, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/offset+octet-stream",
        "Content-Length": String(end - offset),
        "Upload-Offset": String(offset),
        "Tus-Resumable": "1.0.0",
      },
      body: chunk,
    });
    if (!patchRes.ok) {
      const body = await patchRes.text().catch(() => "");
      throw new Error(`TUS chunk failed at offset ${offset} (${patchRes.status}): ${body}`);
    }
    offset = end;
  }
}

async function uploadToBucket(input: File | string): Promise<string> {
  const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
  const db = createSupabaseBrowserClient();
  const { data: { session } } = await db.auth.getSession();
  if (!session) throw new Error("Not signed in.");

  const userId = session.user.id;
  let body: Blob;
  let mime: string;
  let ext: string;

  if (typeof input === "string") {
    body = await fetch(input).then((r) => r.blob());
    mime = body.type || "image/jpeg";
    ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  } else {
    body = input;
    ext = input.name.split(".").pop()?.toLowerCase() ?? "mp4";
    mime = input.type || extToMime(ext);
  }

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Use TUS resumable upload for large files (videos) to avoid Supabase's single-request size limit
  if (input instanceof File && input.size >= 10 * 1024 * 1024) {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
    const token = session.access_token;
    await uploadViaTus(input, path, mime, token, supabaseUrl);
    return db.storage.from("listing-photos").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await db.storage.from("listing-photos").upload(path, body, {
    contentType: mime,
    cacheControl: "31536000", // immutable object (unique filename); cache 1 year
    upsert: false,
    duplex: "half",
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("Payload too large") || msg.includes("413") || msg.includes("exceeded")) {
      throw new Error("File is too large. Try splitting the video into shorter clips.");
    }
    throw new Error(msg || "Upload failed.");
  }
  return db.storage.from("listing-photos").getPublicUrl(path).data.publicUrl;
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v",
    webm: "video/webm", avi: "video/x-msvideo", mkv: "video/x-matroska",
    wmv: "video/x-ms-wmv", flv: "video/x-flv",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", gif: "image/gif", heic: "image/heic",
  };
  return map[ext] ?? "application/octet-stream";
}

async function uploadDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  // /demo has no signed-in Supabase session to upload against — keep the
  // data URL as-is so demo photos and lease templates round-trip locally.
  if (isDemoModeActive()) return dataUrl;
  return uploadToBucket(dataUrl);
}

async function uploadSubmissionMedia(
  sub: import("@/lib/manager-listing-submission").ManagerListingSubmissionV1,
): Promise<import("@/lib/manager-listing-submission").ManagerListingSubmissionV1> {
  async function uploadAll(urls: string[]): Promise<string[]> {
    return Promise.all(urls.map((u) => uploadDataUrl(u)));
  }
  async function uploadOne(url: string | null | undefined): Promise<string | null> {
    if (!url) return url ?? null;
    return uploadDataUrl(url);
  }

  const [housePhotos, houseVideo, leaseTemplateDocUrl, propertyFloorPlan, floorPlanByLabel, rooms, bathrooms, sharedSpaces] = await Promise.all([
    uploadAll(sub.housePhotoDataUrls ?? []),
    uploadOne(sub.houseVideoDataUrl),
    uploadOne(sub.leaseTemplateDocUrl),
    uploadOne(sub.propertyFloorPlanDataUrl),
    (async () => {
      const entries = Object.entries(sub.floorPlanByLabel ?? {});
      if (entries.length === 0) return {} as Record<string, string>;
      const uploaded = await Promise.all(
        entries.map(async ([label, url]) => [label, await uploadDataUrl(url)] as const),
      );
      return Object.fromEntries(uploaded) as Record<string, string>;
    })(),
    Promise.all(
      sub.rooms.map(async (r) => ({
        ...r,
        photoDataUrls: await uploadAll(r.photoDataUrls),
        videoDataUrl: await uploadOne(r.videoDataUrl),
      })),
    ),
    Promise.all(
      sub.bathrooms.map(async (b) => ({
        ...b,
        photoDataUrls: await uploadAll(b.photoDataUrls ?? []),
        videoDataUrl: await uploadOne(b.videoDataUrl),
      })),
    ),
    Promise.all(
      sub.sharedSpaces.map(async (s) => ({
        ...s,
        photoDataUrls: await uploadAll(s.photoDataUrls ?? []),
        videoDataUrl: await uploadOne(s.videoDataUrl),
      })),
    ),
  ]);

  return {
    ...sub,
    housePhotoDataUrls: housePhotos,
    houseVideoDataUrl: houseVideo,
    leaseTemplateDocUrl,
    propertyFloorPlanDataUrl: propertyFloorPlan,
    floorPlanByLabel: Object.keys(floorPlanByLabel).length > 0 ? floorPlanByLabel : undefined,
    rooms,
    bathrooms,
    sharedSpaces,
  };
}

async function uploadVideoFile(file: File): Promise<string> {
  return uploadToBucket(file);
}

function FieldLabel({ children, hint, required }: { children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div className="mb-1.5">
      <p className="text-xs font-semibold text-foreground">
        {children}
        {required ? <span className="text-red-600"> *</span> : null}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function StepFieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs font-medium text-red-600">{msg}</p>;
}

/** In CSS grid rows, bottom-aligns the control with siblings when label/hint blocks differ in height. */
function GridField({ children, className }: { children: React.ReactNode; className?: string }) {
  const parts = Children.toArray(children);
  if (parts.length !== 2) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div className={`flex h-full min-h-0 flex-col ${className ?? ""}`}>
      <div className="shrink-0">{parts[0]}</div>
      <div className="mt-auto w-full shrink-0">{parts[1]}</div>
    </div>
  );
}

function ListingSubsection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="space-y-4 border-t border-border pt-5">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {description ? <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function roomAccessSummary(space: ManagerSharedSpaceSubmission, rooms: ManagerRoomSubmission[]) {
  const ids = new Set(space.roomAccessIds ?? []);
  if (rooms.length === 0) return "No rooms added yet";
  if (ids.size === 0) return "No room access selected";
  if (ids.size === rooms.length) return "All rooms have access";
  return `${ids.size} of ${rooms.length} rooms have access`;
}

function roomLabelForBundle(room: ManagerRoomSubmission) {
  return room.name.trim() || `Room (${room.id.slice(-6)})`;
}

function bundleRoomsLine(roomIds: string[], rooms: ManagerRoomSubmission[]) {
  const names = roomIds.map((id) => rooms.find((room) => room.id === id)).filter(Boolean).map((room) => roomLabelForBundle(room!));
  if (names.length === 0) return "";
  return names.length === rooms.length ? `Whole house - ${names.length} rooms` : names.join(", ");
}

function bundleRentLabel(roomIds: string[], rooms: ManagerRoomSubmission[], entireHomeRent = 0) {
  if (entireHomeRent > 0) return `$${entireHomeRent}/mo`;
  const total = roomIds
    .map((id) => rooms.find((room) => room.id === id)?.monthlyRent ?? 0)
    .filter((rent) => Number.isFinite(rent) && rent > 0)
    .reduce((sum, rent) => sum + rent, 0);
  return total > 0 ? `$${total}/mo` : "";
}

export function ManagerAddListingForm({
  onClose,
  onSubmitted,
  showToast,
  skuTier,
  propCountBeforeSubmit,
  editPendingId = null,
  editListingId = null,
  editListingOwnerUserId = null,
  editRequestChangeId = null,
  initialSubmission = null,
  noteKey = null,
  wizardScope = "full",
}: {
  onClose: () => void;
  onSubmitted: () => void;
  showToast: (m: string) => void;
  skuTier: string | null;
  propCountBeforeSubmit: number;
  editPendingId?: string | null;
  editListingId?: string | null;
  /** Owner's userId to use when saving edits to a linked listing (overrides the current user's id). */
  editListingOwnerUserId?: string | null;
  /** adminRefId of a "request change" (edits requested by admin) row to save back to. */
  editRequestChangeId?: string | null;
  initialSubmission?: ManagerListingSubmissionV1 | null;
  /** Stable key for legacy localStorage house-detail notes, used to backfill houseDescription/houseRulesText if empty on the submission. */
  noteKey?: string | null;
  /** `preview` limits steps to public listing marketing content (floor plans, lease basics, amenities, etc.). */
  wizardScope?: ListingWizardScope;
}) {
  const [sub, setSub] = useState<ManagerListingSubmissionV1>(() => {
    const base = initialSubmission ? normalizeManagerListingSubmissionV1(initialSubmission) : createDefaultListingSubmission();
    if (!noteKey || (base.houseDescription?.trim() && base.houseRulesText?.trim())) return base;
    const legacy = getPortalListingNote(noteKey);
    return {
      ...base,
      houseDescription: base.houseDescription?.trim() || legacy.houseDescription || "",
      houseRulesText: base.houseRulesText?.trim() || legacy.houseRulesText || "",
    };
  });
  const [busy, setBusy] = useState(false);
  const [demoAutofillSubmitPending, setDemoAutofillSubmitPending] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepFieldErrors, setStepFieldErrors] = useState<Record<string, string>>({});
  const [maxStepReached, setMaxStepReached] = useState(() =>
    (editPendingId ?? editListingId ?? editRequestChangeId) ? LISTING_STEP_COUNT - 1 : 0,
  );
  // Portal to document.body once mounted, so this modal can't get visually trapped by an
  // ancestor that creates a containing block for fixed-position descendants (e.g. transform/filter).
  const mounted = useIsClient();
  const portalContainer = usePortalContainer();
  const [listingPresets, setListingPresets] = useState<ListingPresetConfig>(DEFAULT_LISTING_PRESETS);
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null);
  const [serviceOffers, setServiceOffers] = useState<ManagerListingServiceOption[]>(() => {
    const normalized = normalizeManagerListingSubmissionV1(initialSubmission ?? createDefaultListingSubmission());
    return normalized.serviceRequestOptions ?? [];
  });
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ManagerListingServiceOption | null>(null);
  const [serviceForm, setServiceForm] = useState({ name: "", description: "", price: "", deposit: "" });
  // Application step — free-text drafts for dropdown options so typing commas feels natural.
  const [questionOptionsDrafts, setQuestionOptionsDrafts] = useState<Record<string, string>>({});
  const [expandedListingItems, setExpandedListingItems] = useState<Set<string>>(() => new Set());

  const toggleListingItem = (key: string) => {
    setExpandedListingItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandListingItem = (key: string) => {
    setExpandedListingItems((prev) => new Set(prev).add(key));
  };

  const isListingItemExpanded = (key: string) => expandedListingItems.has(key);

  const scrollRef = useRef<HTMLDivElement>(null);
  const submitListingRef = useRef<() => Promise<void>>(async () => {});
  // Object URLs for video preview (avoids putting huge base64 strings in <video src>).
  // Keyed by a stable id like "room-<id>", "bath-<id>", "space-<id>", "house".
  const [videoPreviewUrls, setVideoPreviewUrls] = useState<Record<string, string>>({});
  const videoPreviewUrlsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    videoPreviewUrlsRef.current = videoPreviewUrls;
  }, [videoPreviewUrls]);
  const { userId, ready: authReady } = useManagerUserId();
  const dedupedPresets = useMemo(
    () => ({
      furniture: dedupeByLabel(listingPresets.furniture),
      room: dedupeByLabel(listingPresets.room),
      bathroom: dedupeByLabel(listingPresets.bathroom),
      sharedSpace: dedupeByLabel(listingPresets.sharedSpace),
      houseWide: dedupeByLabel(listingPresets.houseWide),
    }),
    [listingPresets],
  );
  const locationLevelOptions = useMemo(() => locationOptionsFromStories(sub.listingStoriesId), [sub.listingStoriesId]);
  const roomFloorOptions = useMemo(() => roomFloorOptionsFromStories(sub.listingStoriesId), [sub.listingStoriesId]);
  const roomFloorLabelsForPlans = useMemo(() => uniqueRoomFloorLabels(sub.rooms), [sub.rooms]);

  const isEditMode = Boolean(editPendingId ?? editListingId ?? editRequestChangeId);
  const wizardSteps = useMemo(() => listingWizardStepIndices(wizardScope), [wizardScope]);
  const lastStepIndex = wizardSteps[wizardSteps.length - 1] ?? LISTING_STEP_COUNT - 1;
  const visibleStepPosition = Math.max(0, wizardSteps.indexOf(stepIndex));
  const visibleStepCount = wizardSteps.length;
  const isFinalStep = stepIndex === lastStepIndex;
  const isPreviewWizard = wizardScope === "preview";
  const wizardTitlePrefix = isPreviewWizard ? "Edit preview" : isEditMode ? "Edit listing" : "New listing";

  // Revoke all object URLs on unmount.
  useEffect(() => {
    return () => {
      Object.values(videoPreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!isDemoModeActive()) return;
    const onAutofill = (e: Event) => {
      const detail = (e as CustomEvent<{ submission?: ManagerListingSubmissionV1; submitAfter?: boolean }>).detail;
      const submission = detail?.submission;
      if (!submission) return;
      const normalized = normalizeManagerListingSubmissionV1(submission);
      setSub(normalized);
      setServiceOffers(normalized.serviceRequestOptions ?? []);
      setMaxStepReached(LISTING_STEP_COUNT - 1);
      setStepIndex(LISTING_STEP_COUNT - 1);
      setStepFieldErrors({});
      if (detail?.submitAfter) setDemoAutofillSubmitPending(true);
    };
    window.addEventListener(DEMO_LISTING_AUTOFILL_EVENT, onAutofill as EventListener);
    return () => window.removeEventListener(DEMO_LISTING_AUTOFILL_EVENT, onAutofill as EventListener);
  }, []);

  const handleSaveService = () => {
    if (!serviceForm.name.trim()) return;
    const offer: ManagerListingServiceOption = {
      id: editingOffer?.id ?? `offer-${Date.now()}`,
      name: serviceForm.name.trim(),
      description: serviceForm.description.trim(),
      price: serviceForm.price.trim(),
      deposit: serviceForm.deposit.trim(),
      available: editingOffer?.available ?? true,
      createdAt: editingOffer?.createdAt ?? new Date().toISOString(),
    };
    setServiceOffers((prev) => {
      const idx = prev.findIndex((o) => o.id === offer.id);
      if (idx === -1) return [offer, ...prev];
      const next = [...prev];
      next[idx] = offer;
      return next;
    });
    setServiceModalOpen(false);
    setEditingOffer(null);
    setServiceForm({ name: "", description: "", price: "", deposit: "" });
  };

  const addQuickService = (preset: ListingServiceQuickAdd) => {
    setServiceOffers((prev) => {
      if (prev.some((o) => o.name.trim().toLowerCase() === preset.name.toLowerCase())) return prev;
      const pricing = resolveServiceOfferPricing({ name: preset.name, price: preset.price, deposit: preset.deposit });
      return [
        ...prev,
        {
          id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: preset.name,
          description: preset.description,
          price: pricing.price,
          deposit: pricing.deposit,
          available: true,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  };

  /** Set or replace the preview object URL for a video key, revoking the old one. */
  const setVideoPreview = (key: string, file: File) => {
    setVideoPreviewUrls((prev) => {
      const old = prev[key];
      if (old) URL.revokeObjectURL(old);
      return { ...prev, [key]: URL.createObjectURL(file) };
    });
  };

  /** Remove the preview object URL for a video key, revoking it. */
  const clearVideoPreview = (key: string) => {
    setVideoPreviewUrls((prev) => {
      const old = prev[key];
      if (!old) return prev;
      URL.revokeObjectURL(old);
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const [videoUploadingKeys, setVideoUploadingKeys] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepIndex]);

  useEffect(() => {
    if (stepIndex !== 2) return;
    queueMicrotask(() =>
      setSub((s) => {
        const applied = applyListingBathroomSlots(s);
        return applied.ok ? applied.sub : s.bathrooms.length > 0 ? s : { ...s, bathrooms: [emptyBathroom(0)] };
      }),
    );
  }, [stepIndex]);

  useEffect(() => {
    let cancelled = false;
    loadListingPresetConfig()
      .then((presets) => {
        if (!cancelled) setListingPresets(presets);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const isEntireHome = isEntireHomeListing(sub);
  const entireHomeRent = entireHomeMonthlyRentAmount(sub);

  const clearListingFieldError = (key: string) => {
    setStepFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateListingStep = (i: number): Record<string, string> =>
    validateListingWizardStep(i, sub, { isEditMode, entireHomeRent });

  const goNext = () => {
    const errs = validateListingStep(stepIndex);
    if (Object.keys(errs).length > 0) {
      setStepFieldErrors(errs);
      showToast("Please fix the highlighted fields before continuing.");
      queueMicrotask(() =>
        scrollToFirstWizardFieldError(buildListingStepFieldOrder(stepIndex, sub), errs, scrollRef.current),
      );
      return;
    }
    setStepFieldErrors({});
    if (stepIndex === 0) {
      const slots = sub.listingBedroomSlots ?? sub.rooms.length;
      let nextSub = sub;
      const appliedRooms = applyListingBedroomSlots(nextSub, slots);
      if (!appliedRooms.ok) {
        if (isEditMode) {
          nextSub = { ...nextSub, listingBedroomSlots: nextSub.rooms.length };
          showToast("Bedroom count was reset to match existing room rows so your layout updates can continue.");
        } else {
          showToast(appliedRooms.message);
          return;
        }
      } else {
        nextSub = appliedRooms.sub;
      }
      const appliedBaths = applyListingBathroomSlots(nextSub);
      if (!appliedBaths.ok) {
        if (isEditMode) {
          showToast("Bathroom count was kept to match existing bathroom rows so your layout updates can continue.");
        } else {
          showToast(appliedBaths.message);
          return;
        }
      } else {
        nextSub = appliedBaths.sub;
      }
      setSub(nextSub);
    }
    if (stepIndex === 1) {
      setSub((s) => ({
        ...s,
        rooms: s.rooms.map((room, i) => ({
          ...room,
          name: room.name.trim() || `Room ${i + 1}`,
        })),
      }));
    }
    if (stepIndex === 2) {
      setSub((s) => ({
        ...s,
        bathrooms: s.bathrooms.map((bath, i) => ({
          ...bath,
          name: bath.name.trim() || emptyBathroom(i).name,
        })),
      }));
    }
    if (stepIndex === 3) {
      setSub((s) => ({
        ...s,
        sharedSpaces: s.sharedSpaces.filter((space) => space.name.trim()),
      }));
    }
    const pos = wizardSteps.indexOf(stepIndex);
    if (pos < 0 || pos >= wizardSteps.length - 1) return;
    const nextIdx = wizardSteps[pos + 1]!;
    setStepIndex(nextIdx);
    setMaxStepReached((m) => Math.max(m, nextIdx));
  };

  const goPrev = () => {
    setStepFieldErrors({});
    const pos = wizardSteps.indexOf(stepIndex);
    if (pos > 0) setStepIndex(wizardSteps[pos - 1]!);
  };

  const setRoom = (i: number, patch: Partial<ManagerRoomSubmission>) => {
    setSub((s) => {
      const rooms = [...s.rooms];
      rooms[i] = { ...rooms[i]!, ...patch };
      return { ...s, rooms };
    });
  };

  const setBath = (i: number, patch: Partial<ManagerBathroomSubmission>) => {
    setSub((s) => {
      const bathrooms = [...s.bathrooms];
      bathrooms[i] = { ...bathrooms[i]!, ...patch };
      return { ...s, bathrooms };
    });
  };

  const setSharedSpace = (i: number, patch: Partial<ManagerSharedSpaceSubmission>) => {
    setSub((s) => {
      const sharedSpaces = [...s.sharedSpaces];
      sharedSpaces[i] = { ...sharedSpaces[i]!, ...patch };
      return { ...s, sharedSpaces };
    });
  };

  // ── Application step (all questions — built-in + custom) ─────────────────
  const applicationFields = resolveListingApplicationFields(sub, normalizeCustomApplicationFields);

  const patchApplicationQuestion = (field: ResolvedApplicationField, patch: Partial<ManagerCustomApplicationField>) => {
    clearListingFieldError(listingCustomQuestionErrorKey(field.id));
    clearListingFieldError("customApplicationFields");
    setSub((s) => ({ ...s, ...patchListingApplicationField(s, field, patch) }));
  };

  const addCustomQuestion = (section: string) => {
    expandListingItem(listingItemKey("app-section", section));
    setSub((s) => ({
      ...s,
      ...addListingApplicationField(s, emptyCustomApplicationField(section)),
    }));
  };

  const removeApplicationQuestion = (field: ResolvedApplicationField) => {
    clearListingFieldError(listingCustomQuestionErrorKey(field.id));
    setSub((s) => ({ ...s, ...removeListingApplicationField(s, field) }));
  };

  const restoreApplicationDefaults = () => {
    setStepFieldErrors({});
    setSub((s) => ({ ...s, ...restoreDefaultApplicationConfig() }));
  };

  const questionOptionsText = (field: ManagerCustomApplicationField): string =>
    questionOptionsDrafts[field.id] ?? field.options.join(", ");

  const setQuestionOptionsText = (field: ResolvedApplicationField, text: string) => {
    setQuestionOptionsDrafts((d) => ({ ...d, [field.id]: text }));
    patchApplicationQuestion(field, { options: parseQuestionOptionsText(text) });
  };

  useEffect(() => {
    const toExpand = new Set<string>();
    if (stepIndex === 1) {
      for (const room of sub.rooms) {
        if (stepFieldErrors[listingRoomNameKey(room.id)] || stepFieldErrors[listingRoomRentKey(room.id)]) {
          toExpand.add(listingItemKey("room", room.id));
        }
      }
      if (stepFieldErrors.rooms) sub.rooms.forEach((r) => toExpand.add(listingItemKey("room", r.id)));
    }
    if (stepIndex === 2) {
      for (const bath of sub.bathrooms) {
        if (stepFieldErrors[listingBathroomNameKey(bath.id)]) {
          toExpand.add(listingItemKey("bathroom", bath.id));
        }
      }
      if (stepFieldErrors.bathrooms) sub.bathrooms.forEach((b) => toExpand.add(listingItemKey("bathroom", b.id)));
    }
    if (stepIndex === 3) {
      for (const sp of sub.sharedSpaces) {
        if (stepFieldErrors[listingSharedSpaceNameKey(sp.id)]) {
          toExpand.add(listingItemKey("shared", sp.id));
        }
      }
      if (stepFieldErrors.sharedSpaces) sub.sharedSpaces.forEach((s) => toExpand.add(listingItemKey("shared", s.id)));
    }
    if (stepIndex === 7) {
      for (const field of applicationFields) {
        if (stepFieldErrors[listingCustomQuestionErrorKey(field.id)]) {
          toExpand.add(listingItemKey("app-section", field.section ?? "additional"));
        }
      }
    }
    if (toExpand.size === 0) return;
    setExpandedListingItems((prev) => new Set([...prev, ...toExpand]));
  }, [stepFieldErrors, stepIndex, sub.rooms, sub.bathrooms, sub.sharedSpaces, applicationFields]);

  const onPickLeaseTemplateDoc = (file: File | null) => {
    readLeaseTemplateFile(
      file,
      (dataUrl, fileName) => {
        clearListingFieldError("leaseTemplateDoc");
        setSub((s) => ({ ...s, leaseTemplateDocUrl: dataUrl, leaseTemplateDocName: fileName }));
      },
      showToast,
    );
  };

  const addRoom = () => {
    if (sub.rooms.length >= 20) return;
    const next = emptyRoom(sub.rooms.length);
    expandListingItem(listingItemKey("room", next.id));
    setSub((s) => ({ ...s, rooms: [...s.rooms, next] }));
  };

  const removeRoom = (i: number) => {
    if (sub.rooms.length <= 1) return;
    const removedId = sub.rooms[i]!.id;
    setSub((s) => ({
      ...s,
      rooms: s.rooms.filter((_, j) => j !== i),
      bathrooms: s.bathrooms.map((b) => {
        const assignedRoomIds = (b.assignedRoomIds ?? []).filter((id) => id !== removedId);
        let accessKindByRoomId = b.accessKindByRoomId;
        if (accessKindByRoomId?.[removedId]) {
          accessKindByRoomId = { ...accessKindByRoomId };
          delete accessKindByRoomId[removedId];
          if (Object.keys(accessKindByRoomId).length === 0) accessKindByRoomId = undefined;
        }
        return { ...b, assignedRoomIds, accessKindByRoomId };
      }),
      sharedSpaces: s.sharedSpaces.map((ss) => ({
        ...ss,
        roomAccessIds: (ss.roomAccessIds ?? []).filter((id) => id !== removedId),
      })),
      bundles: (s.bundles ?? []).map((bundle) => {
        const nextRooms = s.rooms.filter((_, j) => j !== i);
        const includedRoomIds = (bundle.includedRoomIds ?? []).filter((id) => id !== removedId);
        return {
          ...bundle,
          includedRoomIds,
          roomsLine: bundle.roomsLine.trim() ? bundle.roomsLine : bundleRoomsLine(includedRoomIds, nextRooms),
        };
      }),
    }));
  };

  const toggleBathroomRoom = (bathIndex: number, roomId: string, on: boolean) => {
    setSub((s) => {
      if (s.bathrooms[bathIndex]?.allResidents) return s;
      const nextBathrooms = s.bathrooms.map((b, bi) => {
        if (bi === bathIndex) {
          const set = new Set(b.assignedRoomIds ?? []);
          if (on) set.add(roomId);
          else set.delete(roomId);
          const nextIds = s.rooms.map((r) => r.id).filter((id) => set.has(id));
          let access = b.accessKindByRoomId;
          if (!on && access?.[roomId]) {
            access = { ...access };
            delete access[roomId];
            if (Object.keys(access).length === 0) access = undefined;
          }
          return { ...b, assignedRoomIds: nextIds, accessKindByRoomId: access };
        }
        if (on && !b.allResidents) {
          return { ...b, assignedRoomIds: (b.assignedRoomIds ?? []).filter((id) => id !== roomId) };
        }
        return b;
      });
      return { ...s, bathrooms: nextBathrooms };
    });
  };

  const setBathRoomAccessKind = (bathIndex: number, roomId: string, value: "" | ManagerBathroomRoomAccessKind) => {
    setSub((s) => {
      const bathrooms = [...s.bathrooms];
      const b = bathrooms[bathIndex];
      if (!b || b.allResidents) return s;
      if (!(b.assignedRoomIds ?? []).includes(roomId)) return s;
      const nextAccess: Partial<Record<string, ManagerBathroomRoomAccessKind>> = { ...(b.accessKindByRoomId ?? {}) };
      if (!value) delete nextAccess[roomId];
      else nextAccess[roomId] = value;
      bathrooms[bathIndex] = {
        ...b,
        accessKindByRoomId: Object.keys(nextAccess).length ? nextAccess : undefined,
      };
      return { ...s, bathrooms };
    });
  };

  const duplicateRoom = (i: number) => {
    if (sub.rooms.length >= 20) {
      showToast("Maximum 20 rooms.");
      return;
    }
    const copy = duplicateRoomEntry(sub.rooms[i]!);
    expandListingItem(listingItemKey("room", copy.id));
    setSub((s) => ({
      ...s,
      rooms: [...s.rooms.slice(0, i + 1), copy, ...s.rooms.slice(i + 1)],
    }));
    showToast("Room duplicated — edit the copy below.");
  };

  const addBathroom = () => {
    if (sub.bathrooms.length >= 12) return;
    const next = emptyBathroom(sub.bathrooms.length);
    expandListingItem(listingItemKey("bathroom", next.id));
    setSub((s) => {
      if (s.bathrooms.length === 0) return { ...s, bathrooms: [next] };
      return { ...s, bathrooms: [s.bathrooms[0]!, next, ...s.bathrooms.slice(1)] };
    });
  };

  const removeBathroom = (i: number) => {
    const bathId = sub.bathrooms[i]?.id;
    if (bathId) clearVideoPreview(`bath-${bathId}`);
    setSub((s) => ({ ...s, bathrooms: s.bathrooms.filter((_, j) => j !== i) }));
  };

  const addSharedSpace = () => {
    if (sub.sharedSpaces.length >= 24) return;
    const next = emptySharedSpace(sub.sharedSpaces.length);
    expandListingItem(listingItemKey("shared", next.id));
    setSub((s) => ({ ...s, sharedSpaces: [...s.sharedSpaces, next] }));
  };

  const addSharedSpaceFromTemplate = (template: (typeof SHARED_SPACE_TEMPLATES)[number]) => {
    if (sub.sharedSpaces.length >= 24) return;
    const row = {
      ...emptySharedSpace(sub.sharedSpaces.length),
      name: template.label,
      spaceKind: template.kind,
      detail: template.detail,
      amenitiesText: template.amenities.join("\n"),
      roomAccessIds: sub.rooms.map((room) => room.id),
    };
    expandListingItem(listingItemKey("shared", row.id));
    setSub((s) => ({ ...s, sharedSpaces: [...s.sharedSpaces, row] }));
  };

  const removeSharedSpace = (i: number) => {
    const spaceId = sub.sharedSpaces[i]?.id;
    if (spaceId) clearVideoPreview(`space-${spaceId}`);
    setSub((s) => ({ ...s, sharedSpaces: s.sharedSpaces.filter((_, j) => j !== i) }));
  };

  const setSharedSpaceRoomAccess = (spaceIndex: number, mode: "all" | "none") => {
    setSub((s) => {
      const sharedSpaces = s.sharedSpaces.map((ss, si) =>
        si === spaceIndex ? { ...ss, roomAccessIds: mode === "all" ? s.rooms.map((room) => room.id) : [] } : ss,
      );
      return { ...s, sharedSpaces };
    });
  };

  const toggleSharedSpaceRoom = (spaceIndex: number, roomId: string, on: boolean) => {
    setSub((s) => {
      const sharedSpaces = s.sharedSpaces.map((ss, si) => {
        if (si !== spaceIndex) return ss;
        const set = new Set(ss.roomAccessIds ?? []);
        if (on) set.add(roomId);
        else set.delete(roomId);
        return { ...ss, roomAccessIds: s.rooms.map((r) => r.id).filter((id) => set.has(id)) };
      });
      return { ...s, sharedSpaces };
    });
  };

  const toggleBundleRoom = (bundleIndex: number, roomId: string, on: boolean) => {
    setSub((s) => {
      const bundles = [...(s.bundles ?? [])];
      const cur = bundles[bundleIndex];
      if (!cur) return s;
      const nextSet = new Set(cur.includedRoomIds ?? []);
      if (on) nextSet.add(roomId);
      else nextSet.delete(roomId);
      const includedRoomIds = s.rooms.map((r) => r.id).filter((id) => nextSet.has(id));
      bundles[bundleIndex] = {
        ...cur,
        includedRoomIds,
        roomsLine: cur.roomsLine.trim() ? cur.roomsLine : bundleRoomsLine(includedRoomIds, s.rooms),
        price: cur.price.trim() ? cur.price : bundleRentLabel(includedRoomIds, s.rooms, entireHomeMonthlyRentAmount(s)),
      };
      return { ...s, bundles };
    });
  };

  const setBundle = (i: number, patch: Partial<ManagerBundleRow>) => {
    setSub((s) => {
      const bundles = [...(s.bundles ?? [])];
      bundles[i] = { ...bundles[i]!, ...patch };
      return { ...s, bundles };
    });
  };

  const addBundle = () => {
    const next = emptyBundleRow();
    expandListingItem(listingItemKey("bundle", next.id));
    setSub((s) => ({ ...s, bundles: [...(s.bundles ?? []), next] }));
  };

  const addGeneratedBundle = (kind: "whole_house" | "multi_room") => {
    setSub((s) => {
      if (s.rooms.length === 0) return s;
      const namedRooms = s.rooms.filter((room) => room.name.trim());
      const includedRoomIds =
        kind === "whole_house"
          ? s.rooms.map((room) => room.id)
          : namedRooms.slice(0, Math.min(2, namedRooms.length)).map((room) => room.id);
      if (kind === "multi_room" && includedRoomIds.length < 2) return s;
      const row: ManagerBundleRow = {
        ...emptyBundleRow(),
        label: kind === "whole_house" ? "Whole house lease" : "Group lease bundle",
        price: bundleRentLabel(includedRoomIds, s.rooms, entireHomeMonthlyRentAmount(s)),
        strikethrough: "",
        promo:
          kind === "whole_house"
            ? "Rent the full home as one lease — all rooms included."
            : "Select any rooms that can be rented together.",
        roomsLine: bundleRoomsLine(includedRoomIds, s.rooms),
        includedRoomIds,
      };
      expandListingItem(listingItemKey("bundle", row.id));
      return { ...s, bundles: [...(s.bundles ?? []), row] };
    });
  };

  const removeBundle = (i: number) => {
    setSub((s) => {
      const bundles = (s.bundles ?? []).filter((_, j) => j !== i);
      return { ...s, bundles };
    });
  };

  const applyBundleRoomScope = (bundleIndex: number, mode: "all_named" | "none") => {
    setSub((s) => {
      const bundles = [...(s.bundles ?? [])];
      const cur = bundles[bundleIndex];
      if (!cur) return s;
      const named = s.rooms.filter((r) => r.name.trim());
      const includedRoomIds = mode === "all_named" ? s.rooms.map((r) => r.id) : [];
      bundles[bundleIndex] = {
        ...cur,
        includedRoomIds,
        roomsLine: bundleRoomsLine(includedRoomIds, s.rooms),
        price: bundleRentLabel(includedRoomIds, s.rooms, entireHomeMonthlyRentAmount(s)),
      };
      return { ...s, bundles };
    });
  };

  const setQuickFact = (i: number, patch: Partial<ManagerQuickFactRow>) => {
    setSub((s) => {
      const quickFacts = [...(s.quickFacts ?? [])];
      quickFacts[i] = { ...quickFacts[i]!, ...patch };
      return { ...s, quickFacts };
    });
  };

  const addQuickFact = () => {
    const next = emptyQuickFactRow();
    expandListingItem(listingItemKey("quickfact", next.id));
    setSub((s) => ({ ...s, quickFacts: [...(s.quickFacts ?? []), next] }));
  };

  const removeQuickFact = (i: number) => {
    setSub((s) => ({
      ...s,
      quickFacts: (s.quickFacts ?? []).filter((_, j) => j !== i),
    }));
  };

  const setCustomFee = (i: number, patch: Partial<ManagerCustomFeeRow>) => {
    setSub((s) => {
      const customFees = [...(s.customFees ?? [])];
      customFees[i] = { ...customFees[i]!, ...patch };
      return { ...s, customFees };
    });
  };

  const addCustomFee = () => {
    const next = emptyCustomFeeRow();
    expandListingItem(listingItemKey("fee", next.id));
    setSub((s) => ({ ...s, customFees: [...(s.customFees ?? []), next] }));
  };

  const removeCustomFee = (i: number) => {
    setSub((s) => ({
      ...s,
      customFees: (s.customFees ?? []).filter((_, j) => j !== i),
    }));
  };

  const onPickRoomPhotos = async (roomIndex: number, files: FileList | null) => {
    if (!files?.length) return;
    const fileArray = Array.from(files);
    try {
    const next: string[] = [];
    for (let i = 0; i < Math.min(fileArray.length, 6); i++) {
      await yieldToMain();
      const f = fileArray[i]!;
      if (!f.type.startsWith("image/")) {
        showToast("Images only for room photos.");
        return;
      }
      const url = await fileToDataUrl(f, MAX_IMG_BYTES);
      if (!url) {
        showToast(`Image too large (max ${Math.round(MAX_IMG_BYTES / 1024 / 1024)} MB): ${f.name}`);
        return;
      }
      next.push(url);
    }
    startTransition(() => {
    setSub((s) => {
      const rooms = [...s.rooms];
      const cur = rooms[roomIndex]!;
      rooms[roomIndex] = { ...cur, photoDataUrls: [...cur.photoDataUrls, ...next].slice(0, 8) };
      return { ...s, rooms };
    });
    });
    } catch { showToast("Could not process image. Please try a different file."); }
  };

  const onPickRoomVideo = async (roomIndex: number, file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { showToast("Please choose a video file."); return; }
    const roomId = sub.rooms[roomIndex]?.id;
    if (!roomId) return;
    const key = `room-${roomId}`;
    setVideoPreview(key, file);
    setVideoUploadingKeys((s) => new Set([...s, key]));
    try {
      const url = await uploadVideoFile(file);
      setRoom(roomIndex, { videoDataUrl: url });
    } catch {
      showToast("Could not upload video. Check your connection and try again.");
      clearVideoPreview(key);
    } finally {
      setVideoUploadingKeys((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  const removeRoomPhoto = (roomIndex: number, photoIndex: number) => {
    setSub((s) => {
      const rooms = [...s.rooms];
      const cur = rooms[roomIndex]!;
      rooms[roomIndex] = {
        ...cur,
        photoDataUrls: cur.photoDataUrls.filter((_, j) => j !== photoIndex),
      };
      return { ...s, rooms };
    });
  };

  const onPickBathroomPhotos = async (bathId: string, files: FileList | null) => {
    if (!files?.length) return;
    const fileArray = Array.from(files);
    try {
    const next: string[] = [];
    for (let i = 0; i < Math.min(fileArray.length, 6); i++) {
      await yieldToMain();
      const f = fileArray[i]!;
      if (!isImageUploadFile(f)) {
        showToast("Images only for bathroom photos.");
        return;
      }
      const url = await fileToDataUrl(f, MAX_IMG_BYTES);
      if (!url) {
        showToast(`Image too large (max ${Math.round(MAX_IMG_BYTES / 1024 / 1024)} MB): ${f.name}`);
        return;
      }
      next.push(url);
    }
    startTransition(() => {
    setSub((s) => {
      const bathIndex = s.bathrooms.findIndex((b) => b.id === bathId);
      if (bathIndex < 0) return s;
      const bathrooms = [...s.bathrooms];
      const cur = bathrooms[bathIndex];
      if (!cur) return s;
      bathrooms[bathIndex] = { ...cur, photoDataUrls: [...(cur.photoDataUrls ?? []), ...next].slice(0, 8) };
      return { ...s, bathrooms };
    });
    });
    } catch { showToast("Could not process image. Please try a different file."); }
  };

  const onPickBathroomVideo = async (bathId: string, file: File | null) => {
    if (!file) return;
    if (!isVideoUploadFile(file)) { showToast("Please choose a video file."); return; }
    const key = `bath-${bathId}`;
    setVideoPreview(key, file);
    setVideoUploadingKeys((s) => new Set([...s, key]));
    try {
      const url = await uploadVideoFile(file);
      setSub((s) => {
        const bathIndex = s.bathrooms.findIndex((b) => b.id === bathId);
        if (bathIndex < 0) return s;
        const bathrooms = [...s.bathrooms];
        bathrooms[bathIndex] = { ...bathrooms[bathIndex]!, videoDataUrl: url };
        return { ...s, bathrooms };
      });
    } catch {
      showToast("Could not upload video. Check your connection and try again.");
      clearVideoPreview(key);
    } finally {
      setVideoUploadingKeys((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  const removeBathroomPhoto = (bathId: string, photoIndex: number) => {
    setSub((s) => {
      const bathIndex = s.bathrooms.findIndex((b) => b.id === bathId);
      if (bathIndex < 0) return s;
      const bathrooms = [...s.bathrooms];
      const cur = bathrooms[bathIndex];
      if (!cur) return s;
      bathrooms[bathIndex] = {
        ...cur,
        photoDataUrls: (cur.photoDataUrls ?? []).filter((_, j) => j !== photoIndex),
      };
      return { ...s, bathrooms };
    });
  };

  const clearBathroomVideo = (bathId: string) => {
    clearVideoPreview(`bath-${bathId}`);
    setSub((s) => {
      const bathIndex = s.bathrooms.findIndex((b) => b.id === bathId);
      if (bathIndex < 0) return s;
      const bathrooms = [...s.bathrooms];
      bathrooms[bathIndex] = { ...bathrooms[bathIndex]!, videoDataUrl: null };
      return { ...s, bathrooms };
    });
  };

  const onPickSharedSpacePhotos = async (spaceId: string, files: FileList | null) => {
    if (!files?.length) return;
    const fileArray = Array.from(files);
    try {
    const next: string[] = [];
    for (let i = 0; i < Math.min(fileArray.length, 6); i++) {
      await yieldToMain();
      const f = fileArray[i]!;
      if (!isImageUploadFile(f)) {
        showToast("Images only for shared-space photos.");
        return;
      }
      const url = await fileToDataUrl(f, MAX_IMG_BYTES);
      if (!url) {
        showToast(`Image too large (max ${Math.round(MAX_IMG_BYTES / 1024 / 1024)} MB): ${f.name}`);
        return;
      }
      next.push(url);
    }
    startTransition(() => {
    setSub((s) => {
      const spaceIndex = s.sharedSpaces.findIndex((ss) => ss.id === spaceId);
      if (spaceIndex < 0) return s;
      const sharedSpaces = [...s.sharedSpaces];
      const cur = sharedSpaces[spaceIndex];
      if (!cur) return s;
      sharedSpaces[spaceIndex] = { ...cur, photoDataUrls: [...(cur.photoDataUrls ?? []), ...next].slice(0, 8) };
      return { ...s, sharedSpaces };
    });
    });
    } catch { showToast("Could not process image. Please try a different file."); }
  };

  const onPickSharedSpaceVideo = async (spaceId: string, file: File | null) => {
    if (!file) return;
    if (!isVideoUploadFile(file)) { showToast("Please choose a video file."); return; }
    const key = `space-${spaceId}`;
    setVideoPreview(key, file);
    setVideoUploadingKeys((s) => new Set([...s, key]));
    try {
      const url = await uploadVideoFile(file);
      setSub((s) => {
        const spaceIndex = s.sharedSpaces.findIndex((ss) => ss.id === spaceId);
        if (spaceIndex < 0) return s;
        const sharedSpaces = [...s.sharedSpaces];
        sharedSpaces[spaceIndex] = { ...sharedSpaces[spaceIndex]!, videoDataUrl: url };
        return { ...s, sharedSpaces };
      });
    } catch {
      showToast("Could not upload video. Check your connection and try again.");
      clearVideoPreview(key);
    } finally {
      setVideoUploadingKeys((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  const removeSharedSpacePhoto = (spaceId: string, photoIndex: number) => {
    setSub((s) => {
      const spaceIndex = s.sharedSpaces.findIndex((ss) => ss.id === spaceId);
      if (spaceIndex < 0) return s;
      const sharedSpaces = [...s.sharedSpaces];
      const cur = sharedSpaces[spaceIndex];
      if (!cur) return s;
      sharedSpaces[spaceIndex] = {
        ...cur,
        photoDataUrls: (cur.photoDataUrls ?? []).filter((_, j) => j !== photoIndex),
      };
      return { ...s, sharedSpaces };
    });
  };

  const clearSharedSpaceVideo = (spaceId: string) => {
    clearVideoPreview(`space-${spaceId}`);
    setSub((s) => {
      const spaceIndex = s.sharedSpaces.findIndex((ss) => ss.id === spaceId);
      if (spaceIndex < 0) return s;
      const sharedSpaces = [...s.sharedSpaces];
      sharedSpaces[spaceIndex] = { ...sharedSpaces[spaceIndex]!, videoDataUrl: null };
      return { ...s, sharedSpaces };
    });
  };

  const onPickHousePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const fileArray = Array.from(files);
    try {
    const cur = sub.housePhotoDataUrls ?? [];
    const remaining = MAX_HOUSE_PHOTOS - cur.length;
    if (remaining <= 0) {
      showToast(`You can add up to ${MAX_HOUSE_PHOTOS} house photos.`);
      return;
    }
    const next: string[] = [...cur];
    for (let i = 0; i < Math.min(fileArray.length, remaining); i++) {
      await yieldToMain();
      const f = fileArray[i]!;
      if (!f.type.startsWith("image/")) {
        showToast("Images only for house photos.");
        return;
      }
      const url = await fileToDataUrl(f, MAX_IMG_BYTES);
      if (!url) {
        showToast(`Image too large (max ${Math.round(MAX_IMG_BYTES / 1024 / 1024)} MB): ${f.name}`);
        return;
      }
      next.push(url);
    }
    startTransition(() => {
      setSub((s) => ({ ...s, housePhotoDataUrls: next }));
    });
    } catch { showToast("Could not process image. Please try a different file."); }
  };

  const removeHousePhoto = (photoIndex: number) => {
    setSub((s) => ({
      ...s,
      housePhotoDataUrls: (s.housePhotoDataUrls ?? []).filter((_, j) => j !== photoIndex),
    }));
  };

  const onPickPropertyFloorPlan = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Images only for floor plans.");
      return;
    }
    try {
      const url = await fileToDataUrl(file, MAX_IMG_BYTES);
      if (!url) {
        showToast(`Image too large (max ${Math.round(MAX_IMG_BYTES / 1024 / 1024)} MB): ${file.name}`);
        return;
      }
      setSub((s) => ({ ...s, propertyFloorPlanDataUrl: url }));
    } catch {
      showToast("Could not process image. Please try a different file.");
    }
  };

  const clearPropertyFloorPlan = () => {
    setSub((s) => ({ ...s, propertyFloorPlanDataUrl: null }));
  };

  const onPickFloorPlanForLabel = async (floorLabel: string, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Images only for floor plans.");
      return;
    }
    try {
      const url = await fileToDataUrl(file, MAX_IMG_BYTES);
      if (!url) {
        showToast(`Image too large (max ${Math.round(MAX_IMG_BYTES / 1024 / 1024)} MB): ${file.name}`);
        return;
      }
      setSub((s) => ({
        ...s,
        floorPlanByLabel: { ...(s.floorPlanByLabel ?? {}), [floorLabel]: url },
      }));
    } catch {
      showToast("Could not process image. Please try a different file.");
    }
  };

  const removeFloorPlanForLabel = (floorLabel: string) => {
    setSub((s) => {
      const next = { ...(s.floorPlanByLabel ?? {}) };
      delete next[floorLabel];
      return { ...s, floorPlanByLabel: Object.keys(next).length > 0 ? next : undefined };
    });
  };

  const clearRoomVideo = (roomIndex: number) => {
    const roomId = sub.rooms[roomIndex]?.id;
    if (roomId) clearVideoPreview(`room-${roomId}`);
    setRoom(roomIndex, { videoDataUrl: null });
  };

  const onPickHouseVideo = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { showToast("Please choose a video file."); return; }
    setVideoPreview("house", file);
    setVideoUploadingKeys((s) => new Set([...s, "house"]));
    try {
      const url = await uploadVideoFile(file);
      setSub((s) => ({ ...s, houseVideoDataUrl: url }));
    } catch {
      showToast("Could not upload video. Check your connection and try again.");
      clearVideoPreview("house");
    } finally {
      setVideoUploadingKeys((s) => { const n = new Set(s); n.delete("house"); return n; });
    }
  };

  const clearHouseVideo = () => {
    clearVideoPreview("house");
    setSub((s) => ({ ...s, houseVideoDataUrl: null }));
  };

  const onDropHouseVideo = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone("house-video");
    void onPickHouseVideo(event.dataTransfer.files?.[0] ?? null);
  };

  const activateDropZone = (zoneId: string) => {
    setActiveDropZone(zoneId);
  };

  const deactivateDropZone = (zoneId?: string) => {
    setActiveDropZone((current) => (zoneId && current !== zoneId ? current : null));
  };

  const handleDragOver = (event: DragEvent<HTMLElement>, zoneId: string) => {
    event.preventDefault();
    event.stopPropagation();
    activateDropZone(zoneId);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>, zoneId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    deactivateDropZone(zoneId);
  };

  const onDropHousePhotos = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone("house-photos");
    void onPickHousePhotos(event.dataTransfer.files);
  };

  const onDropRoomPhotos = (roomIndex: number, roomId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`room-photos-${roomId}`);
    void onPickRoomPhotos(roomIndex, event.dataTransfer.files);
  };

  const onDropRoomVideo = (roomIndex: number, roomId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`room-video-${roomId}`);
    void onPickRoomVideo(roomIndex, event.dataTransfer.files?.[0] ?? null);
  };

  const onDropBathroomPhotos = (bathId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`bath-photos-${bathId}`);
    void onPickBathroomPhotos(bathId, event.dataTransfer.files);
  };

  const onDropBathroomVideo = (bathId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`bath-video-${bathId}`);
    void onPickBathroomVideo(bathId, event.dataTransfer.files?.[0] ?? null);
  };

  const onDropSharedSpacePhotos = (spaceId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`shared-photos-${spaceId}`);
    void onPickSharedSpacePhotos(spaceId, event.dataTransfer.files);
  };

  const onDropSharedSpaceVideo = (spaceId: string, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateDropZone(`shared-video-${spaceId}`);
    void onPickSharedSpaceVideo(spaceId, event.dataTransfer.files?.[0] ?? null);
  };

  /** Assign stable answer keys and drop blank drafts before persisting. */
  const finalizeCustomApplicationFields = (
    fields: ManagerCustomApplicationField[] | undefined,
  ): ManagerCustomApplicationField[] => {
    const out: ManagerCustomApplicationField[] = [];
    const usedKeys = new Set<string>();
    for (const field of fields ?? []) {
      const label = field.label.trim();
      if (!label) continue;
      if (field.type === "select" && field.options.length === 0) continue;
      const key = field.key.trim() || customApplicationFieldKeyFromLabel(label, usedKeys);
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      out.push({ ...field, key, label });
    }
    return out;
  };

  const submitListing = async () => {
    const invalid = (() => {
      if (!isPreviewWizard) return firstInvalidListingStep(sub, { isEditMode, entireHomeRent }, 8);
      for (const i of wizardSteps) {
        const errors = validateListingWizardStep(i, sub, { isEditMode, entireHomeRent });
        if (Object.keys(errors).length > 0) return { stepIndex: i, errors };
      }
      return null;
    })();
    if (invalid) {
      setStepIndex(invalid.stepIndex);
      setMaxStepReached((m) => Math.max(m, invalid.stepIndex));
      setStepFieldErrors(invalid.errors);
      showToast("Please fix the highlighted fields before submitting.");
      queueMicrotask(() =>
        scrollToFirstWizardFieldError(
          buildListingStepFieldOrder(invalid.stepIndex, sub),
          invalid.errors,
          scrollRef.current,
        ),
      );
      return;
    }

    const submission: ManagerListingSubmissionV1 = {
      ...sub,
      serviceRequestOptions: serviceOffers,
      customApplicationFields: finalizeCustomApplicationFields(sub.customApplicationFields),
      disabledStandardApplicationKeys: sub.disabledStandardApplicationKeys ?? [],
      applicationConfigMode:
        (sub.disabledStandardApplicationKeys?.length ?? 0) > 0 ||
        (sub.customApplicationFields?.length ?? 0) > 0
          ? "custom"
          : "standard",
      rooms: sub.rooms.map((room) => ({
        ...room,
        roomAmenitiesText: sanitizeRoomAmenityText(room.roomAmenitiesText),
      })),
    };
    const roomsOk = isEntireHomeListing(submission)
      ? entireHomeMonthlyRentAmount(submission) > 0 && submission.rooms.some((r) => r.name.trim())
      : submission.rooms.some((r) => r.name.trim() && r.monthlyRent > 0);
    if (!submission.address.trim() || !submission.zip.trim()) {
      showToast("Fill in address and ZIP.");
      return;
    }
    if (!roomsOk) {
      showToast(
        isEntireHomeListing(submission)
          ? "Add at least one bedroom and the monthly rent for the entire home."
          : "Add at least one room with a name and monthly rent.",
      );
      return;
    }
    submission.sharedSpaces = submission.sharedSpaces.filter((space) => space.name.trim());
    submission.rooms = submission.rooms.map((room, i) => ({
      ...room,
      name: room.name.trim() || `Room ${i + 1}`,
    }));
    submission.bathrooms = submission.bathrooms.map((bath, i) => ({
      ...bath,
      name: bath.name.trim() || emptyBathroom(i).name,
    }));

    setBusy(true);
    try {
      if (!authReady || !userId) {
        showToast("Sign in to submit a property.");
        return;
      }
      if (!isEditMode && managerTierPropertyLimitReached(skuTier, propCountBeforeSubmit)) {
        const n = normalizeManagerSkuTier(skuTier);
        // On native iOS, drop the "Upgrade to …" clause (App Store Guideline
        // 2.1(b) — no subscription upgrade CTAs outside IAP). Web is unchanged.
        const upsell = (clause: string) => (isNativeRuntimeSync() ? "" : ` ${clause}`);
        showToast(
          n === "free"
            ? `Free includes ${FREE_MAX_PROPERTIES} property.${upsell("Upgrade to Pro or Business to add more.")}`
            : n === "pro"
              ? `Pro includes up to ${PRO_MAX_PROPERTIES} properties.${upsell("Upgrade to Business to add more.")}`
              : `Business includes up to ${BUSINESS_MAX_PROPERTIES} properties.`,
        );
        return;
      }
      let uploadedSubmission: typeof submission;
      try {
        uploadedSubmission = await uploadSubmissionMedia(submission);
      } catch (err) {
        console.error("manager-add-listing-form: uploadSubmissionMedia failed", err);
        showToast("Could not upload photos. Check your connection and try again.");
        return;
      }

      if (editPendingId) {
        const ok = await updatePendingManagerPropertyOnServer(editPendingId, uploadedSubmission, userId);
        if (!ok) {
          console.error("manager-add-listing-form: updatePendingManagerPropertyOnServer returned false", { editPendingId, userId });
          showToast("Could not save changes.");
          return;
        }
        onSubmitted();
        return;
      }
      if (editRequestChangeId) {
        const ok = updateRequestChangeProperty(editRequestChangeId, userId, uploadedSubmission);
        if (!ok) {
          console.error("manager-add-listing-form: updateRequestChangeProperty returned false", { editRequestChangeId, userId });
          showToast("Could not save changes.");
          return;
        }
        showToast("Changes saved and resubmitted for admin re-approval.");
        onSubmitted();
        return;
      }
      if (editListingId) {
        const saveUserId = editListingOwnerUserId?.trim() || userId;
        const ok = await updateExtraListingFromSubmissionOnServer(editListingId, saveUserId, uploadedSubmission);
        if (!ok) {
          console.error("manager-add-listing-form: updateExtraListingFromSubmissionOnServer returned false", { editListingId, saveUserId });
          showToast("Could not save changes.");
          return;
        }
        showToast("Listing saved. It is pending admin review before it appears on Rent with Axis again.");
        onSubmitted();
        return;
      }
      const id = await submitManagerPendingPropertyToServer(uploadedSubmission, userId);
      if (!id) {
        showToast("Could not submit listing.");
        return;
      }
      if (isDemoModeActive()) {
        window.dispatchEvent(new CustomEvent(DEMO_LISTING_SUBMITTED_EVENT, { detail: { id } }));
      }
      onSubmitted();
    } finally {
      setBusy(false);
    }
  };
  submitListingRef.current = submitListing;

  useEffect(() => {
    if (!demoAutofillSubmitPending || !isDemoModeActive()) return;
    setDemoAutofillSubmitPending(false);
    const body = scrollRef.current;
    if (body && body.scrollHeight > body.clientHeight + 8) {
      body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
      window.setTimeout(() => void submitListingRef.current(), 560);
      return;
    }
    void submitListingRef.current();
  }, [demoAutofillSubmitPending, sub]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="modal-overlay fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        id="manager-add-listing-form"
        onSubmit={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        className="modal-panel relative z-10 flex max-h-[calc(100svh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border shadow-2xl sm:max-h-[calc(100svh-1.5rem)] lg:max-h-[calc(100svh-2rem)]"
      >
        {/* ── Header ── */}
        <div className="modal-panel shrink-0 border-b border-border px-5 pt-5 pb-6 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
                Step {visibleStepPosition + 1} of {visibleStepCount}
              </p>
              <p className="mt-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">
                {wizardTitlePrefix} · {LISTING_FORM_STEPS[stepIndex]?.label}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/30 text-muted hover:bg-accent/40"
              aria-label="Close"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
            </button>
          </div>

          {/* Step pills — jump only to steps already reached via Continue */}
          <div className="-mx-0 mt-4 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <div className="flex min-w-max gap-1.5">
              {wizardSteps.map((i, pillPos) => {
                const step = LISTING_FORM_STEPS[i]!;
                const reachable = canNavigateToWizardStep(i, maxStepReached);
                const completed = pillPos < visibleStepPosition;
                return (
                <button
                  key={step.id}
                  type="button"
                  disabled={!reachable}
                  onClick={() => { if (reachable) { setStepFieldErrors({}); setStepIndex(i); } }}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    i === stepIndex
                      ? "bg-primary/10 text-primary"
                      : completed
                        ? "text-muted hover:bg-accent/30"
                        : reachable
                          ? "text-muted hover:bg-accent/30"
                          : "cursor-not-allowed text-slate-300"
                  }`}
                >
                  <span className={`inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    completed ? "bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]" : i === stepIndex ? "bg-primary/10 text-primary" : reachable ? "bg-accent/30 text-muted" : "bg-accent/30 text-muted"
                  }`}>
                    {completed ? "✓" : pillPos + 1}
                  </span>
                  {step.label}
                </button>
              );
              })}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-accent/30">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${((visibleStepPosition + 1) / visibleStepCount) * 100}%` }}
            />
          </div>

          {/* Step blurb */}
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            {LISTING_STEP_BLURBS[LISTING_FORM_STEPS[stepIndex]!.id]}
          </p>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-24 sm:px-6">
          {/* ── Step 0: Home ── */}
          {stepIndex === 0 ? (
          <FormSection
            id="edit-building"
            title="Tell us about your place"
            description="Pick the property type and basics, then we’ll match room slots on the next step. Everything here can be changed later."
          >
            <div
              data-wizard-field="listingPropertyTypeId"
              className={`space-y-3 ${wizardSectionErrorClass(Boolean(stepFieldErrors.listingPropertyTypeId))}`}
            >
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Step 1 · Basics</p>
              <p className="mt-1 text-sm font-semibold text-foreground">What kind of place is this?</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {LISTING_PROPERTY_TYPE_OPTIONS.map((opt) => {
                  const on = sub.listingPropertyTypeId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        clearListingFieldError("listingPropertyTypeId");
                        setSub((s) => ({ ...s, listingPropertyTypeId: opt.id }));
                      }}
                      className={listingChoiceCardClass(on)}
                    >
                      <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
              <StepFieldError msg={stepFieldErrors.listingPropertyTypeId} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2" data-wizard-field="buildingName">
                <FieldLabel>Building name</FieldLabel>
                <Input
                  value={sub.buildingName}
                  onChange={(e) => {
                    clearListingFieldError("buildingName");
                    setSub((s) => ({ ...s, buildingName: sanitizeBuildingNameInput(e.target.value) }));
                  }}
                  className={wizardFieldErrorClass(Boolean(stepFieldErrors.buildingName))}
                  placeholder="e.g. Pioneer Collective"
                />
                <StepFieldError msg={stepFieldErrors.buildingName} />
              </div>
              <div className="sm:col-span-2" data-wizard-field="address">
                <FieldLabel>Street address *</FieldLabel>
                <Input
                  value={sub.address}
                  onChange={(e) => {
                    clearListingFieldError("address");
                    setSub((s) => ({ ...s, address: sanitizeStreetAddressInput(e.target.value) }));
                  }}
                  className={wizardFieldErrorClass(Boolean(stepFieldErrors.address))}
                  placeholder="Street, unit if any"
                />
                <StepFieldError msg={stepFieldErrors.address} />
              </div>
              <GridField>
                <div data-wizard-field="zip">
                  <FieldLabel>ZIP *</FieldLabel>
                </div>
                <div>
                  <Input
                    value={sub.zip}
                    onChange={(e) => {
                      clearListingFieldError("zip");
                      setSub((s) => ({ ...s, zip: sanitizeZipInput(e.target.value) }));
                    }}
                    className={wizardFieldErrorClass(Boolean(stepFieldErrors.zip))}
                    maxLength={10}
                    inputMode="numeric"
                  />
                  <StepFieldError msg={stepFieldErrors.zip} />
                </div>
              </GridField>
              <GridField>
                <div data-wizard-field="neighborhood">
                  <FieldLabel>Neighborhood</FieldLabel>
                </div>
                <div>
                  <Input
                    value={sub.neighborhood}
                    onChange={(e) => {
                      clearListingFieldError("neighborhood");
                      setSub((s) => ({ ...s, neighborhood: sanitizeNeighborhoodInput(e.target.value) }));
                    }}
                    className={wizardFieldErrorClass(Boolean(stepFieldErrors.neighborhood))}
                    placeholder="e.g. Capitol Hill"
                  />
                  <StepFieldError msg={stepFieldErrors.neighborhood} />
                </div>
              </GridField>

              <GridField>
                <div data-wizard-field="listingStoriesId">
                  <FieldLabel>Floors / levels in the home *</FieldLabel>
                </div>
                <div>
                  <div className="relative">
                    <Select
                      aria-label="Number of floors"
                      className={`${wizardFieldErrorClass(Boolean(stepFieldErrors.listingStoriesId), selectInputCls)}`}
                      value={sub.listingStoriesId ?? ""}
                      onChange={(e) => {
                        clearListingFieldError("listingStoriesId");
                        setSub((s) => ({ ...s, listingStoriesId: e.target.value }));
                      }}
                  >
                    <option value="">Select</option>
                    {LISTING_STORIES_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
                  <StepFieldError msg={stepFieldErrors.listingStoriesId} />
                </div>
              </GridField>
              <GridField>
                <div data-wizard-field="listingTotalBathroomsId">
                  <FieldLabel hint="We’ll open that many bathroom cards on the next steps with names autofilled.">Bathrooms in the home *</FieldLabel>
                </div>
                <div>
                  <div className="relative">
                    <Select
                      aria-label="Total bathrooms"
                      className={`${wizardFieldErrorClass(Boolean(stepFieldErrors.listingTotalBathroomsId), selectInputCls)}`}
                      value={sub.listingTotalBathroomsId ?? ""}
                      onChange={(e) => {
                        clearListingFieldError("listingTotalBathroomsId");
                        setSub((s) => ({ ...s, listingTotalBathroomsId: e.target.value }));
                      }}
                  >
                    <option value="">Select</option>
                    {LISTING_TOTAL_BATH_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
                  <StepFieldError msg={stepFieldErrors.listingTotalBathroomsId} />
                </div>
              </GridField>
              <GridField className="sm:col-span-2">
                <div data-wizard-field="listingBedroomSlots">
                  <FieldLabel hint="We’ll open that many room cards on the next step with names autofilled. Other room fields stay optional.">
                    Bedrooms in the home *
                  </FieldLabel>
                </div>
                <div>
                  <div className="relative max-w-md">
                    <Select
                      aria-label="Bedrooms for rent"
                      className={`${wizardFieldErrorClass(Boolean(stepFieldErrors.listingBedroomSlots), selectInputCls)}`}
                      value={String(sub.listingBedroomSlots ?? sub.rooms.length)}
                      onChange={(e) => {
                        clearListingFieldError("listingBedroomSlots");
                        setSub((s) => ({ ...s, listingBedroomSlots: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }));
                      }}
                  >
                    {LISTING_BEDROOM_SLOT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n} bedroom{n === 1 ? "" : "s"}
                      </option>
                    ))}
                  </Select>
                </div>
                  <StepFieldError msg={stepFieldErrors.listingBedroomSlots} />
                </div>
              </GridField>

              <div className="sm:col-span-2">
                <FieldLabel hint="Optional — only if the layout is unusual (split level, ADU, etc.). Otherwise your selections above appear on the listing.">
                  Extra layout note
                </FieldLabel>
                <Textarea
                  className=""
                  value={sub.homeStructureNote}
                  onChange={(e) => setSub((s) => ({ ...s, homeStructureNote: e.target.value }))}
                  placeholder="e.g. Garden apartment in a triplex; private entrance on the side."
                />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel>Listing tagline</FieldLabel>
                <Input value={sub.tagline} onChange={(e) => setSub((s) => ({ ...s, tagline: e.target.value }))} placeholder="Short headline for search cards" />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel hint="Describe the home, culture, and who it is good for.">House overview</FieldLabel>
                <Textarea
                  className=""
                  value={sub.houseOverview}
                  onChange={(e) => setSub((s) => ({ ...s, houseOverview: e.target.value }))}
                  placeholder="Full description of the house, co-living setup, and what applicants should know."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-accent/30 p-4 transition hover:border-border">
                  <input
                    type="checkbox"
                    checked={sub.petFriendly}
                    onChange={(e) => setSub((s) => ({ ...s, petFriendly: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                  />
                  <span className="text-sm font-medium text-foreground">Pet-friendly listing (subject to approval)</span>
                </label>
              </div>
            </div>

            <div className="mt-6">
            <ListingSubsection
              title="Full-house photos & video"
              description="Hero gallery at the top of your public listing — exterior, kitchen, living areas, and common spaces. Up to 12 photos."
            >
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <div
                  className={`flex min-h-[12.5rem] flex-col ${mediaDropZoneClass(activeDropZone === "house-photos")}`}
                  onDragOver={(e) => handleDragOver(e, "house-photos")}
                  onDragEnter={(e) => handleDragOver(e, "house-photos")}
                  onDragLeave={(e) => handleDragLeave(e, "house-photos")}
                  onDrop={onDropHousePhotos}
                >
                  <FieldLabel>Full-house photos</FieldLabel>
                  <MediaPickTrigger accept="image/*" multiple onFiles={(files) => { void onPickHousePhotos(files); }}>
                    Add house photos
                  </MediaPickTrigger>
                  <p className="mt-3 text-sm text-muted">Drag and drop photos here, or use the button above.</p>
                  {(sub.housePhotoDataUrls?.length ?? 0) > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(sub.housePhotoDataUrls ?? []).map((url, pi) => (
                        <div key={`house-p-${pi}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-accent/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="h-full w-full object-cover" />
                          <button type="button" className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl bg-black/55 text-sm font-bold text-white hover:bg-black/70" onClick={() => removeHousePhoto(pi)} aria-label="Remove photo">×</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-auto pt-2 text-[11px] text-muted">Optional for draft — recommended before you go live.</p>
                  )}
                </div>
                <div
                  className={`flex min-h-[12.5rem] flex-col ${mediaDropZoneClass(activeDropZone === "house-video")}`}
                  onDragOver={(e) => handleDragOver(e, "house-video")}
                  onDragEnter={(e) => handleDragOver(e, "house-video")}
                  onDragLeave={(e) => handleDragLeave(e, "house-video")}
                  onDrop={onDropHouseVideo}
                >
                  <FieldLabel hint="Optional walkthrough (~14 MB max).">Full-house video</FieldLabel>
                  <MediaPickTrigger accept="video/*" disabled={videoUploadingKeys.has("house")} onFiles={(files) => { void onPickHouseVideo(files?.[0] ?? null); }}>
                    {videoUploadingKeys.has("house") ? "Uploading…" : sub.houseVideoDataUrl ? "Replace video" : "Add house video"}
                  </MediaPickTrigger>
                  {sub.houseVideoDataUrl ? (
                    <div className="mt-3 space-y-2">
                      <video src={videoPreviewUrls.house ?? sub.houseVideoDataUrl} controls className="max-h-48 w-full rounded-xl border border-border bg-black object-contain" />
                      <button type="button" onClick={clearHouseVideo} className="text-xs font-medium text-rose-600 hover:text-rose-800">Remove video</button>
                    </div>
                  ) : (
                    <p className="mt-auto pt-2 text-[11px] text-muted">Optional — MP4, MOV, or WebM.</p>
                  )}
                </div>
              </div>
            </ListingSubsection>

            <ListingSubsection
              title="Building & neighborhood amenities"
              description="What shows in the main amenities table on the listing. Kitchen gear, shared desks, and TV belong under Shared spaces; bathroom finishes under Bathrooms."
            >
              <div>
                <FieldLabel hint="Tap all that apply.">Common amenities</FieldLabel>
                <div className="mt-2 grid gap-2 rounded-xl border border-border bg-accent/30/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {dedupedPresets.houseWide.map((p) => {
                    const on = splitLineList(sub.amenitiesText).includes(p.label);
                    return (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          checked={on}
                          onChange={(e) =>
                            setSub((s) => ({
                              ...s,
                              amenitiesText: mergeToggleLine(s.amenitiesText, p.label, e.target.checked),
                            }))
                          }
                        />
                        <span className="font-medium text-foreground">{p.label}</span>
                      </label>
                    );
                  })}
                </div>
                <Textarea
                  className="mt-2"
                  rows={2}
                  value={sub.amenitiesText}
                  onChange={(e) => setSub((s) => ({ ...s, amenitiesText: e.target.value }))}
                  placeholder="Add custom amenities not listed above (one per line)."
                />
              </div>
            </ListingSubsection>

            <ListingSubsection
              title="House details"
              description="House rules and general info appear in the resident portal. House description is for your internal notes only."
            >
              <div>
                <div className="mb-0.5 flex items-center gap-2">
                  <FieldLabel>House description</FieldLabel>
                  <span className="portal-badge-notice rounded-full px-1.5 py-0.5 text-[9px] font-semibold">Manager only</span>
                </div>
                <Textarea
                  rows={4}
                  value={sub.houseDescription ?? ""}
                  onChange={(e) => setSub((s) => ({ ...s, houseDescription: e.target.value }))}
                  placeholder="Internal notes about the house…"
                />
              </div>
              <div>
                <div className="mb-0.5 flex items-center gap-2">
                  <FieldLabel>House rules</FieldLabel>
                  <span className="portal-badge-info rounded-full px-1.5 py-0.5 text-[9px] font-semibold">Residents only</span>
                </div>
                <p className="mb-1.5 text-[11px] text-muted">Shown to residents in their Move-in portal after approval.</p>
                <Textarea
                  rows={3}
                  value={sub.houseRulesText}
                  onChange={(e) => setSub((s) => ({ ...s, houseRulesText: e.target.value }))}
                  placeholder="Quiet hours, guests, smoking, pets…"
                />
              </div>
              <div>
                <div className="mb-0.5 flex items-center gap-2">
                  <FieldLabel>General house info</FieldLabel>
                  <span className="portal-badge-info rounded-full px-1.5 py-0.5 text-[9px] font-semibold">Residents only</span>
                </div>
                <p className="mb-1.5 text-[11px] text-muted">Shown to residents in their Move-in portal after approval.</p>
                <Textarea
                  rows={4}
                  value={sub.generalHouseInfo ?? ""}
                  onChange={(e) => setSub((s) => ({ ...s, generalHouseInfo: e.target.value }))}
                  placeholder="Gate/door codes, laundry tips, trash schedule…"
                />
              </div>
            </ListingSubsection>
            </div>
          </FormSection>
          ) : null}

          {/* ── Step 4: Pricing ── */}
          {stepIndex === 4 ? (
          <FormSection
            id="edit-lease"
            title="Pricing"
            description={
              <>Set how the home is rented, monthly amounts, and move-in fees. Leave optional fields blank to hide them on the public listing.</>
            }
          >
            <div className="space-y-5">
              <PlaceCategoryPicker
                hasError={Boolean(stepFieldErrors.listingPlaceCategoryId)}
                errorMsg={stepFieldErrors.listingPlaceCategoryId}
                value={sub.listingPlaceCategoryId}
                onSelect={(id) => {
                  clearListingFieldError("listingPlaceCategoryId");
                  setSub((s) => {
                    if (id === "entire_home") {
                      const sum = s.rooms.reduce((acc, room) => acc + (room.monthlyRent > 0 ? room.monthlyRent : 0), 0);
                      const rent =
                        (s.entireHomeMonthlyRent ?? 0) > 0 ? s.entireHomeMonthlyRent! : sum > 0 ? sum : s.rooms[0]?.monthlyRent ?? 0;
                      return applyEntireHomeListingPricing({ ...s, listingPlaceCategoryId: id }, { entireHomeMonthlyRent: rent });
                    }
                    return { ...s, listingPlaceCategoryId: id, entireHomeMonthlyRent: undefined, entireHomeUtilitiesEstimate: undefined, entireHomeProrateMethod: undefined, entireHomeDailyRentRate: undefined, entireHomeDailyUtilitiesRate: undefined };
                  });
                }}
              />

              <ListingSubsection
                title={isEntireHome ? "Entire-home rent & utilities" : "Per-room rent & utilities"}
                description={
                  isEntireHome
                    ? "One monthly lease for the full unit — utilities and proration apply to the whole home."
                    : "Set rent, utilities estimate, and proration for each bedroom you are listing."
                }
              >
                {isEntireHome ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <GridField>
                      <div data-wizard-field="monthlyRent">
                        <FieldLabel>Monthly rent for entire home *</FieldLabel>
                      </div>
                      <div>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                          <Input
                            inputMode="decimal"
                            className={wizardFieldErrorClass(Boolean(stepFieldErrors.monthlyRent), "pl-8")}
                            value={
                              typeof sub.entireHomeMonthlyRent === "number" && sub.entireHomeMonthlyRent > 0
                                ? String(sub.entireHomeMonthlyRent)
                                : ""
                            }
                            onChange={(e) => {
                              clearListingFieldError("monthlyRent");
                              const raw = sanitizeMoneyInput(e.target.value);
                              const nextRent = raw === "" || raw === "." ? 0 : parseSanitizedMoneyNumber(raw);
                              setSub((s) => applyEntireHomeListingPricing(s, { entireHomeMonthlyRent: nextRent }));
                            }}
                            placeholder="4500"
                          />
                        </div>
                        <StepFieldError msg={stepFieldErrors.monthlyRent} />
                      </div>
                    </GridField>
                    <div className="sm:col-span-2">
                      <UtilitiesPaymentModelPicker
                        value={sub.entireHomeUtilitiesPaymentModel}
                        onSelect={(model) =>
                          setSub((s) =>
                            applyEntireHomeListingPricing(s, {
                              entireHomeUtilitiesPaymentModel: model,
                              ...(model === "included_in_rent" ? { entireHomeUtilitiesEstimate: "" } : {}),
                            }),
                          )
                        }
                      />
                    </div>
                    <GridField>
                      <FieldLabel
                        hint={
                          (sub.entireHomeUtilitiesPaymentModel ?? "manager_billed") === "included_in_rent"
                            ? "Not billed separately when included in rent."
                            : (sub.entireHomeUtilitiesPaymentModel ?? "manager_billed") === "tenant_direct"
                              ? "Optional — typical monthly cost shown on the listing."
                              : "Monthly estimate used in signing totals."
                        }
                      >
                        Utilities estimate (whole home)
                      </FieldLabel>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                        <Input
                          inputMode="decimal"
                          className="pl-8"
                          disabled={(sub.entireHomeUtilitiesPaymentModel ?? "manager_billed") === "included_in_rent"}
                          value={(sub.entireHomeUtilitiesEstimate ?? "").replace(/^\$/, "").replace(/\/mo(nth)?\.?$/i, "").trim()}
                          onChange={(e) =>
                            setSub((s) => applyEntireHomeListingPricing(s, { entireHomeUtilitiesEstimate: sanitizeMoneyInput(e.target.value) }))
                          }
                          placeholder="175"
                        />
                      </div>
                    </GridField>
                    <div className="sm:col-span-2">
                      <ProrationMethodFields
                        prorateMethod={sub.entireHomeProrateMethod ?? "auto"}
                        monthlyRent={entireHomeRent}
                        dailyRentRate={sub.entireHomeDailyRentRate}
                        dailyUtilitiesRate={sub.entireHomeDailyUtilitiesRate}
                        utilitiesLabel="Daily utilities rate (whole home)"
                        onMethod={(m) => setSub((s) => applyEntireHomeListingPricing(s, { entireHomeProrateMethod: m }))}
                        onDailyRent={(n) => setSub((s) => applyEntireHomeListingPricing(s, { entireHomeDailyRentRate: n }))}
                        onDailyUtilities={(n) => setSub((s) => applyEntireHomeListingPricing(s, { entireHomeDailyUtilitiesRate: n }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4" data-wizard-field="monthlyRent">
                    {stepFieldErrors.monthlyRent ? (
                      <p className="text-xs font-medium text-red-600">{stepFieldErrors.monthlyRent}</p>
                    ) : null}
                    {sub.rooms.map((room, i) => {
                      const roomRentKey = listingRoomRentKey(room.id);
                      const roomRentErr = stepFieldErrors[roomRentKey];
                      return (
                      <div
                        key={room.id}
                        className={`rounded-xl border bg-card p-4 ${wizardSectionErrorClass(Boolean(roomRentErr || stepFieldErrors.monthlyRent), "border-border")}`}
                      >
                        <p className="text-sm font-semibold text-foreground">{room.name.trim() || `Room ${i + 1}`}</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <GridField>
                            <FieldLabel>Monthly rent *</FieldLabel>
                            <div className="relative" data-wizard-field={roomRentKey}>
                              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                              <Input
                                inputMode="decimal"
                                className={wizardFieldErrorClass(Boolean(roomRentErr || stepFieldErrors.monthlyRent), "pl-8")}
                                value={room.monthlyRent || ""}
                                onChange={(e) => {
                                  clearListingFieldError("monthlyRent");
                                  clearListingFieldError(roomRentKey);
                                  setRoom(i, { monthlyRent: parseSanitizedMoneyNumber(e.target.value) });
                                }}
                                placeholder="800"
                              />
                              <StepFieldError msg={roomRentErr} />
                            </div>
                          </GridField>
                          <GridField>
                            <FieldLabel
                              hint={
                                (room.utilitiesPaymentModel ?? "manager_billed") === "included_in_rent"
                                  ? "Not billed separately when included in rent."
                                  : (room.utilitiesPaymentModel ?? "manager_billed") === "tenant_direct"
                                    ? "Optional — typical monthly cost shown on the listing."
                                    : "Monthly estimate billed with rent through the portal."
                              }
                            >
                              Utilities estimate
                            </FieldLabel>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                              <Input
                                inputMode="decimal"
                                className="pl-8"
                                disabled={(room.utilitiesPaymentModel ?? "manager_billed") === "included_in_rent"}
                                value={room.utilitiesEstimate.replace(/^\$/, "").replace(/\/mo(nth)?\.?$/i, "").trim()}
                                onChange={(e) => setRoom(i, { utilitiesEstimate: sanitizeMoneyInput(e.target.value) })}
                                placeholder="175"
                              />
                            </div>
                          </GridField>
                          <div className="sm:col-span-2">
                            <UtilitiesPaymentModelPicker
                              value={room.utilitiesPaymentModel}
                              onSelect={(model) =>
                                setRoom(i, {
                                  utilitiesPaymentModel: model,
                                  ...(model === "included_in_rent" ? { utilitiesEstimate: "" } : {}),
                                })
                              }
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <ProrationMethodFields
                              prorateMethod={room.prorateMethod ?? "auto"}
                              monthlyRent={room.monthlyRent}
                              dailyRentRate={room.dailyRentRate}
                              dailyUtilitiesRate={room.dailyUtilitiesRate}
                              onMethod={(m) => setRoom(i, { prorateMethod: m })}
                              onDailyRent={(n) => setRoom(i, { dailyRentRate: n })}
                              onDailyUtilities={(n) => setRoom(i, { dailyUtilitiesRate: n })}
                            />
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </ListingSubsection>

              <ListingSubsection title="Lease terms">
                <div data-wizard-field="allowedLeaseTerms" className={wizardSectionErrorClass(Boolean(stepFieldErrors.allowedLeaseTerms))}>
                  <FieldLabel required>Lease terms offered</FieldLabel>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {LEASE_TERM_OPTIONS.map((term) => {
                      const selected = resolveAllowedLeaseTerms(sub).includes(term);
                      return (
                        <label
                          key={term}
                          className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm shadow-sm"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border"
                            checked={selected}
                            onChange={(e) => {
                              clearListingFieldError("allowedLeaseTerms");
                              const on = e.target.checked;
                              setSub((s) => {
                                const current = resolveAllowedLeaseTerms(s);
                                const next = on
                                  ? [...new Set([...current, term])]
                                  : current.filter((t) => t !== term);
                                return {
                                  ...s,
                                  allowedLeaseTerms: next,
                                  leaseTermsBody: formatLeaseTermsBodyFromAllowed(next),
                                };
                              });
                            }}
                          />
                          <span className="font-medium text-foreground">{term}</span>
                        </label>
                      );
                    })}
                  </div>
                  <StepFieldError msg={stepFieldErrors.allowedLeaseTerms} />
                </div>
              </ListingSubsection>

              <ListingSubsection
                title="Short-term stays"
                description="Enable this only if this property may host temporary lodger / guest stays."
              >
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    checked={Boolean(sub.shortTermRentalsAllowed)}
                    onChange={(e) => setSub((s) => ({ ...s, shortTermRentalsAllowed: e.target.checked }))}
                  />
                  <span className="text-sm font-medium text-foreground">This property allows short-term room stays</span>
                </label>
                {sub.shortTermRentalsAllowed ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <GridField>
                      <FieldLabel>Daily cost</FieldLabel>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                        <Input
                          className="pl-8"
                          inputMode="decimal"
                          value={(sub.shortTermDailyCost ?? "").replace(/^\$/, "").trim()}
                          onChange={(e) => setSub((s) => ({ ...s, shortTermDailyCost: sanitizeMoneyInput(e.target.value) }))}
                          placeholder="40"
                        />
                      </div>
                    </GridField>
                    <GridField>
                      <FieldLabel>Short-term deposit</FieldLabel>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                        <Input
                          className="pl-8"
                          inputMode="decimal"
                          value={(sub.shortTermDeposit ?? "").replace(/^\$/, "").trim()}
                          onChange={(e) => setSub((s) => ({ ...s, shortTermDeposit: sanitizeMoneyInput(e.target.value) }))}
                          placeholder="100"
                        />
                      </div>
                    </GridField>
                    <GridField>
                      <FieldLabel hint="Move-in fee for short-term stays — used to calculate the balance owed when upgrading to long-term.">Short-term move-in fee</FieldLabel>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                        <Input
                          className="pl-8"
                          inputMode="decimal"
                          value={(sub.shortTermMoveInFee ?? "").replace(/^\$/, "").trim()}
                          onChange={(e) => setSub((s) => ({ ...s, shortTermMoveInFee: sanitizeMoneyInput(e.target.value) }))}
                          placeholder="50"
                        />
                      </div>
                    </GridField>
                    <div className="sm:col-span-2">
                      <FieldLabel hint="Shown to applicants and included in the generated short-term agreement.">
                        Requirements / house rules for short-term stays
                      </FieldLabel>
                      <Textarea
                        className=""
                        value={sub.shortTermRequirements ?? ""}
                        onChange={(e) => setSub((s) => ({ ...s, shortTermRequirements: e.target.value }))}
                        placeholder="Owner/host lives on property. No mail or residency claims. Guest must leave by checkout. Follow posted house rules."
                      />
                    </div>
                  </div>
                ) : null}
              </ListingSubsection>

              <ListingSubsection
                title="Lease bundles"
                description={
                  isEntireHome
                    ? "Optional — the public listing already shows one rent for the entire home. Add a bundle only if you want promo pricing or extra copy."
                    : "Optional packages on the public listing — whole-house leases, roommate groups, or custom room combinations. If you add none, we show a smart default from your room list."
                }
              >
                {!isEntireHome ? (
                <div className="rounded-xl border border-border p-4 sm:p-5">
                  <p className="text-sm font-semibold text-foreground">Build from your rooms</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Bundle rent defaults to the sum of selected room rents — edit the price when you offer a discount. Use strikethrough + promo for limited-time offers.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full text-xs"
                      onClick={() => addGeneratedBundle("whole_house")}
                      disabled={sub.rooms.length === 0}
                    >
                      Whole house
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full text-xs"
                      onClick={() => addGeneratedBundle("multi_room")}
                      disabled={sub.rooms.filter((room) => room.name.trim()).length < 2}
                    >
                      Group
                    </Button>
                    <Button type="button" variant="primary" className="rounded-full text-xs" onClick={addBundle}>
                      Custom (blank)
                    </Button>
                  </div>
                </div>
                ) : null}

                {(sub.bundles ?? []).length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-accent/30 px-4 py-5 text-sm text-muted">
                    {isEntireHome
                      ? "No extra bundles — the listing uses your entire-home rent from Lease & pricing."
                      : "No bundles yet — renters will still see per-room pricing from Lease & pricing. Add a bundle when you want to advertise a combined lease."}
                  </p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {(sub.bundles ?? []).map((bundle, i) => {
                      const selectedIds = new Set(bundle.includedRoomIds ?? []);
                      const namedRooms = sub.rooms.filter((r) => r.name.trim());
                      const selectedRooms = namedRooms.filter((r) => selectedIds.has(r.id));
                      const rentSum = selectedRooms.reduce((sum, r) => sum + (Number.isFinite(r.monthlyRent) ? r.monthlyRent : 0), 0);
                      const priceNum = bundle.price.replace(/^\$/, "").replace(/\/mo(nth)?\.?$/i, "").trim();
                      const hasManualPrice = priceNum.length > 0 && Number(priceNum) !== rentSum;
                      return (
                        <ListingWizardCollapsibleCard
                          key={bundle.id}
                          expanded={isListingItemExpanded(listingItemKey("bundle", bundle.id))}
                          onToggle={() => toggleListingItem(listingItemKey("bundle", bundle.id))}
                          title={bundle.label.trim() || `Package ${i + 1}`}
                          subtitle={[
                            `${selectedRooms.length} room${selectedRooms.length === 1 ? "" : "s"}`,
                            rentSum > 0 ? `$${rentSum}/mo base` : null,
                            hasManualPrice ? "Custom price" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          bodyClassName="grid gap-3 sm:grid-cols-2"
                          toggleDataAttr={`listing-bundle-toggle-${bundle.id}`}
                          headerActions={
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                className={LISTING_WIZARD_ACTION_BTN}
                                onClick={() => applyBundleRoomScope(i, "all_named")}
                                disabled={namedRooms.length === 0}
                                aria-label="Select all named rooms"
                              >
                                All rooms
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className={LISTING_WIZARD_ACTION_BTN}
                                onClick={() => applyBundleRoomScope(i, "none")}
                              >
                                Clear
                              </Button>
                              <Button type="button" variant="outline" className={LISTING_WIZARD_REMOVE_BTN} onClick={() => removeBundle(i)}>
                                Remove
                              </Button>
                            </>
                          }
                        >
                            <GridField>
                              <FieldLabel>Bundle name</FieldLabel>
                              <Input
                                value={bundle.label}
                                onChange={(e) => setBundle(i, { label: sanitizePlaceNameInput(e.target.value) })}
                                placeholder="Whole house lease, Rooms A+B"
                              />
                            </GridField>
                            <GridField>
                              <FieldLabel hint="Defaults to sum of room rents; edit for discounts.">Bundle rent / mo</FieldLabel>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                                <Input
                                  inputMode="decimal"
                                  className="pl-8"
                                  value={bundle.price.replace(/^\$/, "").replace(/\/mo(nth)?\.?$/i, "").trim()}
                                  onChange={(e) => setBundle(i, { price: sanitizeMoneyInput(e.target.value) })}
                                  placeholder={rentSum > 0 ? String(rentSum) : "4500"}
                                />
                              </div>
                            </GridField>
                            <GridField>
                              <FieldLabel hint="Optional — shows crossed out on the listing.">Original price</FieldLabel>
                              <div className="relative">
                                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                                <Input
                                  inputMode="decimal"
                                  className="pl-8"
                                  value={bundle.strikethrough.replace(/^\$/, "").replace(/\/mo(nth)?\.?$/i, "").trim()}
                                  onChange={(e) => setBundle(i, { strikethrough: sanitizeMoneyInput(e.target.value) })}
                                  placeholder="4800"
                                />
                              </div>
                            </GridField>
                            <GridField>
                              <FieldLabel>Promo line</FieldLabel>
                              <Input
                                value={bundle.promo}
                                onChange={(e) => setBundle(i, { promo: e.target.value })}
                                placeholder="Best for groups — limited availability"
                              />
                            </GridField>
                            <div className="sm:col-span-2">
                              <FieldLabel>Rooms in this bundle</FieldLabel>
                              <div className="mt-2 grid gap-2 rounded-xl border border-border bg-accent/30 p-3 sm:grid-cols-2 lg:grid-cols-3">
                                {sub.rooms.map((room) => (
                                  <label key={`${bundle.id}-${room.id}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-border"
                                      checked={selectedIds.has(room.id)}
                                      onChange={(e) => toggleBundleRoom(i, room.id, e.target.checked)}
                                    />
                                    <span className="min-w-0 font-medium text-foreground">
                                      <span className="truncate">{roomLabelForBundle(room)}</span>
                                      {room.monthlyRent > 0 ? (
                                        <span className="ml-1 tabular-nums text-xs font-normal text-muted">· ${room.monthlyRent}</span>
                                      ) : null}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                        </ListingWizardCollapsibleCard>
                      );
                    })}
                  </div>
                )}
              </ListingSubsection>

              <ListingSubsection title="Fees">
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["applicationFee", "Application fee", sub.applicationFee.replace(/^\$/, "").trim()],
                      ["securityDeposit", "Security deposit", sub.securityDeposit.replace(/^\$/, "").trim()],
                      ["moveInFee", "Move-in fee", sub.moveInFee.replace(/^\$/, "").trim()],
                      ["parkingMonthly", "Parking (monthly)", sub.parkingMonthly.replace(/^\$/, "").trim()],
                      ["hoaMonthly", "HOA / community", sub.hoaMonthly.replace(/^\$/, "").trim()],
                      ["otherMonthlyFees", "Other monthly fees", sub.otherMonthlyFees.replace(/^\$/, "").trim()],
                      ["monthToMonthSurcharge", "Month-to-month surcharge", (sub.monthToMonthSurcharge ?? "").replace(/^\$/, "").trim()],
                    ] as const
                  ).map(([key, label, value]) => (
                    <GridField key={key}>
                      <div data-wizard-field={key}>
                        <FieldLabel required>{label}</FieldLabel>
                      </div>
                      <div>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                          <Input
                            className={wizardFieldErrorClass(Boolean(stepFieldErrors[key]), "pl-8")}
                            inputMode="decimal"
                            value={value}
                            onChange={(e) => {
                              clearListingFieldError(key);
                              setSub((s) => ({ ...s, [key]: sanitizeMoneyInput(e.target.value) }));
                            }}
                            placeholder="0"
                          />
                        </div>
                        <StepFieldError msg={stepFieldErrors[key]} />
                      </div>
                    </GridField>
                  ))}
                </div>
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Application options</p>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border"
                      checked={Boolean(sub.allowMultiplePropertyApplications)}
                      onChange={(e) =>
                        setSub((s) => ({
                          ...s,
                          allowMultiplePropertyApplications: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-sm text-foreground">
                      <span className="font-medium">Allow multiple applications</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Residents can apply to more than one property or room on this listing.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border"
                      checked={Boolean(sub.applicationFeeOnlyFirstApplication)}
                      onChange={(e) =>
                        setSub((s) => ({
                          ...s,
                          applicationFeeOnlyFirstApplication: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-sm text-foreground">
                      <span className="font-medium">Application fee only for first application</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Charge the application fee once per resident; skip payment on later applications.
                      </span>
                    </span>
                  </label>
                </div>
                {(sub.customFees ?? []).length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Additional fees</p>
                    {(sub.customFees ?? []).map((fee, i) => (
                      <ListingWizardCollapsibleCard
                        key={fee.id}
                        expanded={isListingItemExpanded(listingItemKey("fee", fee.id))}
                        onToggle={() => toggleListingItem(listingItemKey("fee", fee.id))}
                        title={fee.label.trim() || `Fee ${i + 1}`}
                        subtitle={`$${fee.amount.replace(/^\$/, "").trim() || "0"} · ${fee.frequency === "one-time" ? "One-time" : "Monthly"}`}
                        bodyClassName="grid gap-3 sm:grid-cols-2"
                        toggleDataAttr={`listing-fee-toggle-${fee.id}`}
                        headerActions={
                          <Button type="button" variant="outline" className={LISTING_WIZARD_REMOVE_BTN} onClick={() => removeCustomFee(i)}>
                            Remove
                          </Button>
                        }
                      >
                        <div className="sm:col-span-2 sm:grid sm:grid-cols-2 sm:gap-3">
                        <div>
                          <FieldLabel>Fee name</FieldLabel>
                          <Input
                            value={fee.label}
                            onChange={(e) => setCustomFee(i, { label: sanitizePlaceNameInput(e.target.value) })}
                            placeholder="e.g. Pet fee, Cleaning fee"
                          />
                        </div>
                        <div>
                          <FieldLabel>Amount</FieldLabel>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                            <Input
                              className="pl-8"
                              inputMode="decimal"
                              value={fee.amount.replace(/^\$/, "").trim()}
                              onChange={(e) => setCustomFee(i, { amount: sanitizeMoneyInput(e.target.value) })}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel>Type</FieldLabel>
                          <div className="relative">
                            <Select
                              aria-label={`Additional fee ${i + 1} type`}
                              className={`${selectInputCls}`}
                              value={fee.frequency ?? "monthly"}
                              onChange={(e) =>
                                setCustomFee(i, { frequency: e.target.value === "one-time" ? "one-time" : "monthly" })
                              }
                            >
                              <option value="monthly">Monthly</option>
                              <option value="one-time">One-time</option>
                            </Select>
                          </div>
                        </div>
                        </div>
                      </ListingWizardCollapsibleCard>
                    ))}
                  </div>
                ) : null}
                <Button type="button" variant="outline" className={`mt-4 ${LISTING_WIZARD_ACTION_BTN}`} onClick={addCustomFee}>
                  + Add fee
                </Button>
              </ListingSubsection>

              <ListingSubsection
                title="Payment at signing"
                description="Select every charge collected when the lease is signed."
              >
                <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2">
                  {PAYMENT_AT_SIGNING_OPTIONS.map((opt) => (
                    <label key={opt.id} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={sub.paymentAtSigningIncludes.includes(opt.id)}
                        onChange={(e) =>
                          setSub((s) => ({
                            ...s,
                            paymentAtSigningIncludes: togglePaymentAtSigning(s.paymentAtSigningIncludes, opt.id, e.target.checked),
                          }))
                        }
                      />
                      <span className="text-sm font-medium text-foreground">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </ListingSubsection>

              <ListingSubsection
                id="edit-zelle"
                title="Resident payment methods"
                description="How residents and applicants pay rent, utilities, application fees, and other charges."
              >
                <div
                  data-wizard-field="residentPaymentMethods"
                  className={`space-y-4 rounded-xl border bg-card p-4 ${wizardSectionErrorClass(Boolean(stepFieldErrors.residentPaymentMethods), "border-border")}`}
                >
                  <StepFieldError msg={stepFieldErrors.residentPaymentMethods} />
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={sub.axisPaymentsEnabled !== false}
                      onChange={(e) =>
                        setSub((s) => ({
                          ...s,
                          axisPaymentsEnabled: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-sm font-medium text-foreground">
                      Bank (ACH) with Stripe — low {0.8}% processing fee
                    </span>
                  </label>
                  <div className="border-t border-border pt-3">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={Boolean(sub.zellePaymentsEnabled)}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setSub((s) => ({
                            ...s,
                            zellePaymentsEnabled: on,
                          }));
                        }}
                      />
                      <span className="text-sm font-medium text-foreground">Zelle</span>
                    </label>
                    {sub.zellePaymentsEnabled ? (
                      <div className="mt-2 pl-7" data-wizard-field="zelleContact">
                        <FieldLabel required>Zelle phone or email</FieldLabel>
                        <Input
                          value={sub.zelleContact ?? ""}
                          onChange={(e) => {
                            clearListingFieldError("zelleContact");
                            setSub((s) => ({ ...s, zelleContact: sanitizePaymentContactInput(e.target.value) }));
                          }}
                          className={wizardFieldErrorClass(Boolean(stepFieldErrors.zelleContact))}
                          placeholder="+1 555 010 8899 or name@email.com"
                        />
                        <StepFieldError msg={stepFieldErrors.zelleContact} />
                      </div>
                    ) : null}
                  </div>
                  <div className="border-t border-border pt-3">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={Boolean(sub.venmoPaymentsEnabled)}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setSub((s) => ({
                            ...s,
                            venmoPaymentsEnabled: on,
                          }));
                        }}
                      />
                      <span className="text-sm font-medium text-foreground">Venmo</span>
                    </label>
                    {sub.venmoPaymentsEnabled ? (
                      <div className="mt-2 pl-7" data-wizard-field="venmoContact">
                        <FieldLabel required>Venmo username, phone, or email</FieldLabel>
                        <Input
                          value={sub.venmoContact ?? ""}
                          onChange={(e) => {
                            clearListingFieldError("venmoContact");
                            setSub((s) => ({ ...s, venmoContact: sanitizePaymentContactInput(e.target.value) }));
                          }}
                          className={wizardFieldErrorClass(Boolean(stepFieldErrors.venmoContact))}
                          placeholder="@username, +1 555 010 8899, or name@email.com"
                        />
                        <StepFieldError msg={stepFieldErrors.venmoContact} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </ListingSubsection>

              <ListingSubsection
                title="Rent due date & late fees"
                description="First month rent is always due on move-in. Recurring rent follows the schedule below."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <GridField>
                    <FieldLabel hint="When recurring rent and utilities are due each month.">Monthly due date</FieldLabel>
                    <Select
                      value={sub.rentDueDayMode ?? "first_of_month"}
                      onChange={(e) =>
                        setSub((s) => ({
                          ...s,
                          rentDueDayMode: e.target.value === "last_of_month" ? "last_of_month" : "first_of_month",
                        }))
                      }
                    >
                      <option value="first_of_month">1st of the month</option>
                      <option value="last_of_month">Last day of the month</option>
                    </Select>
                  </GridField>
                  <GridField>
                    <FieldLabel hint="Days after the due date before a late fee is added automatically.">Late fee grace period (days)</FieldLabel>
                    <Input
                      inputMode="numeric"
                      min={0}
                      max={30}
                      value={String(sub.lateFeeGraceDays ?? 5)}
                      onChange={(e) =>
                        setSub((s) => ({
                          ...s,
                          lateFeeGraceDays: Math.max(0, Math.min(30, parseSanitizedInteger(e.target.value, 5))),
                        }))
                      }
                    />
                  </GridField>
                  <GridField>
                    <FieldLabel hint="Flat fee added once per overdue charge after the grace period.">Late fee amount</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span>
                      <Input
                        className="pl-8"
                        inputMode="decimal"
                        value={(sub.lateFeeAmount ?? "50").replace(/^\$/, "").trim()}
                        onChange={(e) => setSub((s) => ({ ...s, lateFeeAmount: sanitizeMoneyInput(e.target.value) }))}
                        placeholder="50"
                      />
                    </div>
                  </GridField>
                  <GridField>
                    <FieldLabel>Automatic late fees</FieldLabel>
                    <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={sub.lateFeeEnabled !== false}
                        onChange={(e) => setSub((s) => ({ ...s, lateFeeEnabled: e.target.checked }))}
                      />
                      <span className="text-sm text-foreground">Create late fee charges & send messages</span>
                    </label>
                  </GridField>
                </div>
              </ListingSubsection>
            </div>
          </FormSection>
          ) : null}

          {/* ── Step 5: Move info ── */}
          {stepIndex === 5 ? (
          <FormSection
            id="edit-move-info"
            title="Move info"
            description={
              isEntireHome
                ? "Access instructions for the entire home."
                : "Set move-in instructions for each bedroom — shown to placed residents."
            }
          >
            {isEntireHome ? (
              <div className="rounded-2xl border border-border bg-accent/30 p-4 sm:p-5">
                <p className="text-sm font-bold text-foreground">Entire home</p>
                <div className="mt-3">
                  <FieldLabel hint="Keys, parking, access, what to bring.">Move-in instructions</FieldLabel>
                  <Textarea
                    rows={4}
                    value={sub.houseMoveInInstructions ?? ""}
                    onChange={(e) => setSub((s) => ({ ...s, houseMoveInInstructions: e.target.value }))}
                    placeholder="Where to pick up keys, parking spot, gate codes, move-in window…"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {sub.rooms.map((room, i) => {
                  const moveKey = listingItemKey("move", room.id);
                  const movePreview = room.moveInInstructions.trim();
                  return (
                  <ListingWizardCollapsibleCard
                    key={room.id}
                    expanded={isListingItemExpanded(moveKey)}
                    onToggle={() => toggleListingItem(moveKey)}
                    title={room.name.trim() || `Room ${i + 1}`}
                    subtitle={movePreview ? movePreview.slice(0, 80) + (movePreview.length > 80 ? "…" : "") : "No move-in instructions yet"}
                    toggleDataAttr={`listing-move-toggle-${room.id}`}
                  >
                    <FieldLabel hint="Keys, parking, access, what to bring.">Move-in instructions</FieldLabel>
                    <Textarea
                      rows={3}
                      value={room.moveInInstructions}
                      onChange={(e) => setRoom(i, { moveInInstructions: e.target.value })}
                      placeholder="Room-specific access, parking, and move-in details…"
                    />
                  </ListingWizardCollapsibleCard>
                  );
                })}
              </div>
            )}
          </FormSection>
          ) : null}

          {/* ── Step 1: Rooms ── */}
          {stepIndex === 1 ? (
          <FormSection
            id="edit-rooms"
            title="Rooms"
            description={
              isEntireHome
                ? "List each bedroom — name, floor, furnishing, and amenities. Rent and utilities are set on Pricing."
                : "Name, floor, furnishing, and amenities for each bedroom. Rent is set on Pricing."
            }
          >
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <p className="text-sm text-muted">
                Layout details only — add optional photos per room if helpful.
              </p>
              <Button type="button" variant="outline" className={LISTING_WIZARD_ACTION_BTN} onClick={addRoom}>
                + Add room
              </Button>
            </div>
            <div
              className={`space-y-3 ${wizardSectionErrorClass(Boolean(stepFieldErrors.rooms))}`}
              data-wizard-field="rooms"
            >
              {stepFieldErrors.rooms ? (
                <p className="text-xs font-medium text-red-600">{stepFieldErrors.rooms}</p>
              ) : null}
              {sortRoomIndicesByFloor(sub.rooms).map((i) => {
                const room = sub.rooms[i]!;
                const isUnfurnished = room.furnishing.trim().toLowerCase() === "unfurnished";
                const checkedFurniture = parseFurnitureSet(room.furnishing);
                const roomNameKey = listingRoomNameKey(room.id);
                const roomRentKey = listingRoomRentKey(room.id);
                const roomNameErr = stepFieldErrors[roomNameKey];
                const roomRentErr = stepFieldErrors[roomRentKey];
                const roomHasErr = Boolean(roomNameErr || roomRentErr);
                const roomPresetLabels = new Set(dedupedPresets.room.map((p) => p.label));
                const customRoomAmenitiesText = splitLineList(room.roomAmenitiesText)
                  .filter((line) => !roomPresetLabels.has(line))
                  .join("\n");
                const roomSubtitle = [
                  room.floor.trim() || null,
                  room.furnishing.trim() || null,
                  room.photoDataUrls.length > 0 ? `${room.photoDataUrls.length} photo${room.photoDataUrls.length === 1 ? "" : "s"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Tap to add name, floor, and amenities";
                const roomKey = listingItemKey("room", room.id);
                return (
                  <ListingWizardCollapsibleCard
                    key={room.id}
                    expanded={isListingItemExpanded(roomKey)}
                    onToggle={() => toggleListingItem(roomKey)}
                    title={room.name.trim() || `Room ${i + 1}`}
                    subtitle={roomSubtitle}
                    hasError={roomHasErr}
                    bodyClassName="grid gap-3 sm:grid-cols-2"
                    toggleDataAttr={`listing-room-toggle-${room.id}`}
                    headerActions={
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className={LISTING_WIZARD_ACTION_BTN}
                          onClick={() => duplicateRoom(i)}
                          disabled={sub.rooms.length >= 20}
                        >
                          Duplicate
                        </Button>
                        {sub.rooms.length > 1 ? (
                          <Button
                            type="button"
                            variant="outline"
                            className={LISTING_WIZARD_REMOVE_BTN}
                            onClick={() => removeRoom(i)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </>
                    }
                  >
                      <GridField>
                        <FieldLabel hint="Autofilled — edit anytime.">Room name</FieldLabel>
                        <div data-wizard-field={roomNameKey}>
                          <Input
                            value={room.name}
                            className={wizardFieldErrorClass(Boolean(roomNameErr))}
                            onChange={(e) => {
                              clearListingFieldError(roomNameKey);
                              clearListingFieldError("rooms");
                              setRoom(i, { name: sanitizePlaceNameInput(e.target.value) });
                            }}
                            placeholder="Room 12A"
                          />
                          <StepFieldError msg={roomNameErr} />
                        </div>
                      </GridField>
                      <GridField>
                        <FieldLabel hint="Preset or custom wording.">Floor / level</FieldLabel>
                        <div className="space-y-2">
                          <div className="relative">
                            <Select
                              aria-label={`Floor for ${room.name || `room ${i + 1}`}`}
                              className={`${selectInputCls}`}
                              value={roomFloorSelectValueFromOptions(room.floor, roomFloorOptions)}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === ROOM_FLOOR_LEVEL_CUSTOM) {
                                  if (roomFloorOptions.some((o) => o.label === room.floor)) {
                                    setRoom(i, { floor: "" });
                                  }
                                  return;
                                }
                                const label = roomFloorOptions.find((o) => o.id === v)?.label ?? "";
                                setRoom(i, { floor: label });
                              }}
                            >
                              <option value="">Select floor</option>
                              {roomFloorOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                              <option value={ROOM_FLOOR_LEVEL_CUSTOM}>Custom…</option>
                            </Select>
                          </div>
                          {roomFloorSelectValueFromOptions(room.floor, roomFloorOptions) === ROOM_FLOOR_LEVEL_CUSTOM ? (
                            <Input
                              value={room.floor}
                              onChange={(e) => setRoom(i, { floor: sanitizeFloorLabelInput(e.target.value) })}
                              placeholder="e.g. Garden level, half-basement"
                              aria-label="Custom floor"
                            />
                          ) : null}
                        </div>
                      </GridField>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Toggle items included, or add custom lines below.">Furnishing &amp; furniture</FieldLabel>
                        <div className="mt-2 rounded-xl border border-border bg-card p-3">
                          <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-border pb-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border"
                              checked={isUnfurnished}
                              onChange={(e) => setRoom(i, { furnishing: e.target.checked ? "Unfurnished" : "" })}
                            />
                            <span className="font-semibold text-muted">Unfurnished</span>
                          </label>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {dedupedPresets.furniture.map((p) => {
                              const on = checkedFurniture.has(p.label);
                              return (
                                <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${on ? "border-primary/30 bg-primary/[0.05]" : "border-border bg-card"} ${isUnfurnished ? "pointer-events-none opacity-40" : ""}`}>
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-border"
                                    checked={on}
                                    disabled={isUnfurnished}
                                    onChange={(e) => setRoom(i, { furnishing: mergeFurnitureToggle(room.furnishing, p.label, e.target.checked) })}
                                  />
                                  <span className="font-medium text-foreground">{p.label}</span>
                                </label>
                              );
                            })}
                          </div>
                          <Textarea className="mt-2" rows={2} value={room.detail} onChange={(e) => setRoom(i, { detail: e.target.value })} placeholder="Other furnishing or layout notes (optional)" />
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Check common room amenities — use the field below for anything not listed.">Room amenities</FieldLabel>
                        <div className="mt-2 grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-3">
                          {dedupedPresets.room.map((p) => {
                            const on = splitLineList(room.roomAmenitiesText).includes(p.label);
                            return (
                              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-border"
                                  checked={on}
                                  onChange={(e) =>
                                    setRoom(i, {
                                      roomAmenitiesText: mergeToggleLine(room.roomAmenitiesText, p.label, e.target.checked),
                                    })
                                  }
                                />
                                <span className="font-medium text-foreground">{p.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        <Textarea
                          className="mt-2"
                          rows={2}
                          value={customRoomAmenitiesText}
                          onChange={(e) => {
                            const presetLines = splitLineList(room.roomAmenitiesText).filter((line) =>
                              roomPresetLabels.has(line),
                            );
                            const customLines = splitLineList(e.target.value);
                            setRoom(i, { roomAmenitiesText: [...presetLines, ...customLines].join("\n") });
                          }}
                          placeholder="Other amenities not listed above (one per line)."
                        />
                      </div>

                      {!isEntireHome ? (
                      <>
                      <div className="sm:col-span-2">
                        <FieldLabel>Photos (optional)</FieldLabel>
                        <div
                          className={`mt-2 ${mediaDropZoneClass(activeDropZone === `room-photos-${room.id}`)}`}
                          onDragOver={(e) => handleDragOver(e, `room-photos-${room.id}`)}
                          onDragEnter={(e) => handleDragOver(e, `room-photos-${room.id}`)}
                          onDragLeave={(e) => handleDragLeave(e, `room-photos-${room.id}`)}
                          onDrop={(e) => onDropRoomPhotos(i, room.id, e)}
                        >
                          <MediaPickTrigger
                            accept="image/*"
                            multiple
                            onFiles={(files) => { void onPickRoomPhotos(i, files); }}
                          >
                            Add photos
                          </MediaPickTrigger>
                          <p className="mt-3 text-sm text-muted">Drag and drop room photos here, or use the button above.</p>
                          {room.photoDataUrls.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {room.photoDataUrls.map((url, pi) => (
                                <div key={`${room.id}-p-${pi}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-accent/30">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" className="h-full w-full object-cover" />
                                  <button
                                    type="button"
                                    className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl bg-black/55 text-sm font-bold text-white hover:bg-black/70"
                                    onClick={() => removeRoomPhoto(i, pi)}
                                    aria-label="Remove photo"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-[11px] text-muted">No photos yet — up to 8 images. Images are auto-compressed.</p>
                          )}
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <FieldLabel hint="One short clip per room (~14 MB max).">Video tour</FieldLabel>
                        <div
                          className={`mt-2 ${mediaDropZoneClass(activeDropZone === `room-video-${room.id}`)}`}
                          onDragOver={(e) => handleDragOver(e, `room-video-${room.id}`)}
                          onDragEnter={(e) => handleDragOver(e, `room-video-${room.id}`)}
                          onDragLeave={(e) => handleDragLeave(e, `room-video-${room.id}`)}
                          onDrop={(e) => onDropRoomVideo(i, room.id, e)}
                        >
                          <MediaPickTrigger
                            accept="video/*"
                            disabled={videoUploadingKeys.has(`room-${room.id}`)}
                            onFiles={(files) => { void onPickRoomVideo(i, files?.[0] ?? null); }}
                          >
                            {videoUploadingKeys.has(`room-${room.id}`) ? "Uploading…" : room.videoDataUrl ? "Replace video" : "Add video"}
                          </MediaPickTrigger>
                          {videoUploadingKeys.has(`room-${room.id}`) ? (
                            <p className="mt-3 text-sm text-primary">Uploading video — this may take a moment…</p>
                          ) : (
                          <p className="mt-3 text-sm text-muted">Drag and drop one room video here, or use the button above.</p>
                          )}
                          {room.videoDataUrl ? (
                            <div className="mt-4 space-y-2">
                              <video
                                src={videoPreviewUrls[`room-${room.id}`] ?? room.videoDataUrl}
                                controls
                                playsInline
                                className="max-h-52 w-full rounded-lg border border-border bg-black object-contain"
                              />
                              <button
                                type="button"
                                className="text-xs font-semibold text-rose-600 hover:underline"
                                onClick={() => clearRoomVideo(i)}
                              >
                                Remove video
                              </button>
                            </div>
                          ) : (
                            <p className="mt-3 text-[11px] text-muted">Optional — MP4, MOV, or WebM. Preview appears after you choose a file.</p>
                          )}
                        </div>
                      </div>
                      </>
                      ) : null}
                  </ListingWizardCollapsibleCard>
                );
              })}
            </div>

            <ListingSubsection
              title="Floor plans"
              description="Upload a layout image for each floor / level (or one property-wide plan). Residents open it from Details on the public listing."
            >
              <div className="mt-3 space-y-4">
                <div className="rounded-xl border border-border bg-accent/20 p-4">
                  <FieldLabel hint="Used when you do not upload separate plans per floor.">
                    Property-wide floor plan
                  </FieldLabel>
                  <MediaPickTrigger accept="image/*" onFiles={(files) => { void onPickPropertyFloorPlan(files); }}>
                    {sub.propertyFloorPlanDataUrl ? "Replace property floor plan" : "Upload property floor plan"}
                  </MediaPickTrigger>
                  {sub.propertyFloorPlanDataUrl ? (
                    <div className="mt-3 space-y-2">
                      <div className="relative max-w-md overflow-hidden rounded-lg border border-border bg-accent/30">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sub.propertyFloorPlanDataUrl} alt="" className="max-h-56 w-full object-contain" />
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-600 hover:underline"
                        onClick={clearPropertyFloorPlan}
                      >
                        Remove property floor plan
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted">Optional — JPG or PNG, up to 10 MB.</p>
                  )}
                </div>

                {roomFloorLabelsForPlans.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-foreground">Per-floor plans</p>
                    {roomFloorLabelsForPlans.map((floorLabel) => {
                      const planUrl = sub.floorPlanByLabel?.[floorLabel];
                      return (
                        <div key={floorLabel} className="rounded-xl border border-border bg-accent/20 p-4">
                          <FieldLabel hint={`Floor plan for bedrooms on ${floorLabel}.`}>{floorLabel}</FieldLabel>
                          <MediaPickTrigger
                            accept="image/*"
                            onFiles={(files) => { void onPickFloorPlanForLabel(floorLabel, files); }}
                          >
                            {planUrl ? "Replace floor plan" : "Upload floor plan"}
                          </MediaPickTrigger>
                          {planUrl ? (
                            <div className="mt-3 space-y-2">
                              <div className="relative max-w-md overflow-hidden rounded-lg border border-border bg-accent/30">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={planUrl} alt="" className="max-h-56 w-full object-contain" />
                              </div>
                              <button
                                type="button"
                                className="text-xs font-semibold text-rose-600 hover:underline"
                                onClick={() => removeFloorPlanForLabel(floorLabel)}
                              >
                                Remove floor plan
                              </button>
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-muted">Recommended before you go live.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Set a floor / level on each room above to upload per-floor plans.</p>
                )}
              </div>
            </ListingSubsection>
          </FormSection>
          ) : null}

          {stepIndex === 2 ? (
          <FormSection
            id="edit-bath"
            title="Bathrooms"
            description="Name, location, and amenities for each bathroom on the public listing."
          >
              <p className="mb-4 text-sm text-muted">Shown in the Bathrooms section on the public listing.</p>
              <div
                className={`space-y-3 ${wizardSectionErrorClass(Boolean(stepFieldErrors.bathrooms))}`}
                data-wizard-field="bathrooms"
              >
                {stepFieldErrors.bathrooms ? (
                  <p className="text-xs font-medium text-red-600">{stepFieldErrors.bathrooms}</p>
                ) : null}
                {sub.bathrooms.map((b, i) => {
                  const bathNameKey = listingBathroomNameKey(b.id);
                  const bathNameErr = stepFieldErrors[bathNameKey];
                  const fixtures = [b.shower && "Shower", b.toilet && "Toilet", b.bathtub && "Tub"].filter(Boolean).join(", ");
                  const bathSubtitle = [
                    b.location?.trim() || null,
                    fixtures || null,
                    b.allResidents ? "Whole-house bath" : `${(b.assignedRoomIds ?? []).length} room(s)`,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const bathKey = listingItemKey("bathroom", b.id);
                  return (
                  <ListingWizardCollapsibleCard
                    key={b.id}
                    expanded={isListingItemExpanded(bathKey)}
                    onToggle={() => toggleListingItem(bathKey)}
                    title={b.name.trim() || `Bathroom ${i + 1}`}
                    subtitle={bathSubtitle || "Tap to set name, location, and fixtures"}
                    hasError={Boolean(bathNameErr)}
                    bodyClassName="grid gap-3 sm:grid-cols-2"
                    toggleDataAttr={`listing-bathroom-toggle-${b.id}`}
                    headerActions={
                      sub.bathrooms.length > 1 ? (
                        <Button
                          type="button"
                          variant="outline"
                          className={LISTING_WIZARD_REMOVE_BTN}
                          onClick={() => removeBathroom(i)}
                        >
                          Remove
                        </Button>
                      ) : null
                    }
                  >
                      <div className="sm:col-span-2" data-wizard-field={bathNameKey}>
                        <FieldLabel hint="Autofilled — edit anytime.">Name</FieldLabel>
                        <Input
                          value={b.name}
                          className={wizardFieldErrorClass(Boolean(bathNameErr))}
                          onChange={(e) => {
                            clearListingFieldError(bathNameKey);
                            clearListingFieldError("bathrooms");
                            setBath(i, { name: sanitizePlaceNameInput(e.target.value) });
                          }}
                          placeholder="Full bath (hall)"
                        />
                        <StepFieldError msg={bathNameErr} />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel>Location in building</FieldLabel>
                        <div className="space-y-2">
                          <div className="relative">
                            <Select
                              aria-label={`Bathroom ${i + 1} location`}
                              className={`${selectInputCls}`}
                              value={locationSelectValue(b.location ?? "", locationLevelOptions)}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) {
                                  setBath(i, { location: "" });
                                  return;
                                }
                                if (v === LOCATION_LEVEL_CUSTOM) {
                                  if (locationLevelOptions.includes((b.location ?? "").trim())) setBath(i, { location: "" });
                                  return;
                                }
                                setBath(i, { location: v });
                              }}
                            >
                              <option value="">Select location</option>
                              {locationLevelOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                              <option value={LOCATION_LEVEL_CUSTOM}>Custom…</option>
                            </Select>
                          </div>
                          {locationSelectValue(b.location ?? "", locationLevelOptions) === LOCATION_LEVEL_CUSTOM ? (
                            <Input
                              value={b.location ?? ""}
                              onChange={(e) => setBath(i, { location: e.target.value })}
                              placeholder="Custom location"
                              aria-label={`Bathroom ${i + 1} custom location`}
                            />
                          ) : null}
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={b.shower} onChange={(e) => setBath(i, { shower: e.target.checked })} />
                        Shower
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={b.toilet} onChange={(e) => setBath(i, { toilet: e.target.checked })} />
                        Toilet
                      </label>
                      <label className="flex items-center gap-2 text-sm sm:col-span-2">
                        <input type="checkbox" checked={b.bathtub} onChange={(e) => setBath(i, { bathtub: e.target.checked })} />
                        Bathtub
                      </label>
                      <div className="sm:col-span-2">
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-border"
                            checked={Boolean(b.allResidents)}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setBath(i, {
                                allResidents: on,
                                assignedRoomIds: on ? [] : (b.assignedRoomIds ?? []),
                                accessKindByRoomId: on ? undefined : b.accessKindByRoomId,
                              });
                            }}
                          />
                          <span className="text-sm font-medium text-foreground">
                            Whole-house / hall bathroom — all listed bedrooms use it (no per-room checkboxes)
                          </span>
                        </label>
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="For non–whole-house baths: checking a room here removes it from other bath rows (except whole-house). Use the situation menu for en suite vs shared wording on the listing.">
                          Used by these rooms
                        </FieldLabel>
                        {b.allResidents ? (
                          <p className="mt-2 rounded-lg border border-border bg-accent/30 px-3 py-2 text-xs text-muted">
                            This bathroom applies to every named room on the listing. Add another bathroom row for suite or shared setups between specific rooms.
                          </p>
                        ) : (
                          <div className="mt-2 space-y-3 rounded-xl border border-border bg-accent/30 p-3">
                            {sub.rooms.map((room) => {
                              const checked = (b.assignedRoomIds ?? []).includes(room.id);
                              return (
                                <div key={`${b.id}-${room.id}`} className="rounded-lg border border-border bg-card p-2.5">
                                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 shrink-0 rounded border-border"
                                      checked={checked}
                                      onChange={(e) => toggleBathroomRoom(i, room.id, e.target.checked)}
                                    />
                                    <span className="font-medium text-foreground">{room.name.trim() || `Room (${room.id.slice(-6)})`}</span>
                                  </label>
                                  {checked ? (
                                    <div className="mt-2 pl-6">
                                      <label className="block text-[11px] font-semibold text-muted">Bathroom situation for this room</label>
                                      <select
                                        className={`${selectInputCls} mt-1 text-xs`}
                                        value={b.accessKindByRoomId?.[room.id] ?? ""}
                                        onChange={(e) =>
                                          setBathRoomAccessKind(i, room.id, e.target.value as "" | ManagerBathroomRoomAccessKind)
                                        }
                                      >
                                        <option value="">Optional — auto from shared vs private</option>
                                        <option value="ensuite">En suite (private to this room)</option>
                                        <option value="shared">Shared (other checked rooms use it too)</option>
                                        <option value="hall">Hall / common (not private to this room)</option>
                                      </select>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Finishes and fixtures for this bathroom only (beyond shower / toilet / tub above).">
                          Bathroom amenities
                        </FieldLabel>
                        <div className="mt-2 grid gap-2 rounded-xl border border-border bg-accent/30 p-3 sm:grid-cols-2">
                          {dedupedPresets.bathroom.map((p) => {
                            const on = splitLineList(b.amenitiesText ?? "").includes(p.label);
                            return (
                              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-border"
                                  checked={on}
                                  onChange={(e) =>
                                    setBath(i, {
                                      amenitiesText: mergeToggleLine(b.amenitiesText ?? "", p.label, e.target.checked),
                                    })
                                  }
                                />
                                <span className="font-medium text-foreground">{p.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        <Textarea
                          className="mt-2"
                          value={b.amenitiesText ?? ""}
                          onChange={(e) => setBath(i, { amenitiesText: e.target.value })}
                          placeholder="Add custom amenities not listed above (one per line)."
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Upload up to 8 bathroom photos.">Bathroom photos</FieldLabel>
                        <div
                          className={`mt-2 ${mediaDropZoneClass(activeDropZone === `bath-photos-${b.id}`)}`}
                          onDragOver={(e) => handleDragOver(e, `bath-photos-${b.id}`)}
                          onDragEnter={(e) => handleDragOver(e, `bath-photos-${b.id}`)}
                          onDragLeave={(e) => handleDragLeave(e, `bath-photos-${b.id}`)}
                          onDrop={(e) => onDropBathroomPhotos(b.id, e)}
                        >
                          <MediaPickTrigger
                            accept="image/*"
                            multiple
                            onFiles={(files) => { void onPickBathroomPhotos(b.id, files); }}
                          >
                            Add photos
                          </MediaPickTrigger>
                          <p className="mt-3 text-sm text-muted">Drag and drop bathroom photos here, or use the button above.</p>
                          {(b.photoDataUrls?.length ?? 0) > 0 ? (
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {b.photoDataUrls.map((src, pi) => (
                                <div key={`${b.id}-p-${pi}`} className="group relative overflow-hidden rounded-lg border border-border bg-accent/30">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={src} alt="Bathroom" className="h-28 w-full object-cover" />
                                  <button
                                    type="button"
                                    className="absolute right-1 top-1 rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-rose-600 shadow-sm opacity-0 transition group-hover:opacity-100"
                                    onClick={() => removeBathroomPhoto(b.id, pi)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-[11px] text-muted">No photos yet — up to 8 images. Images are auto-compressed.</p>
                          )}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel hint="Optional short clip (~14 MB max).">Bathroom video</FieldLabel>
                        <div
                          className={`mt-2 ${mediaDropZoneClass(activeDropZone === `bath-video-${b.id}`)}`}
                          onDragOver={(e) => handleDragOver(e, `bath-video-${b.id}`)}
                          onDragEnter={(e) => handleDragOver(e, `bath-video-${b.id}`)}
                          onDragLeave={(e) => handleDragLeave(e, `bath-video-${b.id}`)}
                          onDrop={(e) => onDropBathroomVideo(b.id, e)}
                        >
                          <MediaPickTrigger
                            accept="video/*"
                            disabled={videoUploadingKeys.has(`bath-${b.id}`)}
                            onFiles={(files) => { void onPickBathroomVideo(b.id, files?.[0] ?? null); }}
                          >
                            {videoUploadingKeys.has(`bath-${b.id}`) ? "Uploading…" : b.videoDataUrl ? "Replace video" : "Add video"}
                          </MediaPickTrigger>
                          {videoUploadingKeys.has(`bath-${b.id}`) ? (
                            <p className="mt-3 text-sm text-primary">Uploading video — this may take a moment…</p>
                          ) : (
                          <p className="mt-3 text-sm text-muted">Drag and drop one bathroom video here, or use the button above.</p>
                          )}
                          {b.videoDataUrl ? (
                            <div className="mt-4 space-y-2">
                              <video
                                src={videoPreviewUrls[`bath-${b.id}`] ?? b.videoDataUrl}
                                controls
                                playsInline
                                className="max-h-52 w-full rounded-lg border border-border bg-black object-contain"
                              />
                              <button
                                type="button"
                                className="text-xs font-semibold text-rose-600 hover:underline"
                                onClick={() => clearBathroomVideo(b.id)}
                              >
                                Remove video
                              </button>
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-muted">Optional — MP4, MOV, or WebM.</p>
                          )}
                        </div>
                      </div>
                  </ListingWizardCollapsibleCard>
                  );
                })}
                <div className="flex justify-center pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className={LISTING_WIZARD_ACTION_BTN}
                    onClick={addBathroom}
                    disabled={sub.bathrooms.length >= 12}
                  >
                    + Add bathroom
                  </Button>
                </div>
              </div>
          </FormSection>
          ) : null}

          {stepIndex === 3 ? (
          <FormSection
            id="edit-shared"
            title="Shared spaces"
            description="Optional — add kitchens, living rooms, and other common areas if you want them on the listing. You can skip this step."
          >
              <div className="mb-5 rounded-2xl border p-4 portal-banner-info">
                <p className="text-sm font-semibold text-blue-950">Quick add</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SHARED_SPACE_TEMPLATES.map((template) => (
                    <Button
                      key={template.label}
                      type="button"
                      variant="outline"
                      className="rounded-full bg-card text-xs"
                      onClick={() => addSharedSpaceFromTemplate(template)}
                      disabled={sub.sharedSpaces.length >= 24}
                    >
                      + {template.label}
                    </Button>
                  ))}
                  <Button type="button" variant="primary" className="rounded-full text-xs" onClick={addSharedSpace}>
                    + Blank shared space
                  </Button>
                </div>
              </div>

              {sub.sharedSpaces.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-accent/30 px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-foreground">No shared spaces added yet.</p>
                  <p className="mt-1 text-xs text-muted">Optional — continue without adding any, or use Quick add above.</p>
                </div>
              ) : (
                <div
                  className={`space-y-3 ${wizardSectionErrorClass(Boolean(stepFieldErrors.sharedSpaces))}`}
                  data-wizard-field="sharedSpaces"
                >
                  {stepFieldErrors.sharedSpaces ? (
                    <p className="text-xs font-medium text-red-600">{stepFieldErrors.sharedSpaces}</p>
                  ) : null}
                  {sub.sharedSpaces.map((sp, i) => {
                    const spaceNameKey = listingSharedSpaceNameKey(sp.id);
                    const spaceNameErr = stepFieldErrors[spaceNameKey];
                    const spaceKind = normalizeSharedSpaceKind(sp.spaceKind, sp.name);
                    const kindPresets = sharedSpaceAmenityPresetsForKind(spaceKind, dedupedPresets.sharedSpace);
                    const kindPresetLabels = new Set(kindPresets.map((p) => p.label));
                    const customAmenitiesText = splitLineList(sp.amenitiesText ?? "")
                      .filter((line) => !kindPresetLabels.has(line))
                      .join("\n");
                    const spaceKindLabel =
                      SHARED_SPACE_KIND_OPTIONS.find((opt) => opt.id === spaceKind)?.label ?? "Shared space";

                    return (
                    <ListingWizardCollapsibleCard
                      key={sp.id}
                      expanded={isListingItemExpanded(listingItemKey("shared", sp.id))}
                      onToggle={() => toggleListingItem(listingItemKey("shared", sp.id))}
                      title={sp.name.trim() || `Shared space ${i + 1}`}
                      subtitle={`${spaceKindLabel} · ${roomAccessSummary(sp, sub.rooms)}`}
                      hasError={Boolean(spaceNameErr)}
                      bodyClassName="grid gap-4 sm:grid-cols-2"
                      toggleDataAttr={`listing-shared-toggle-${sp.id}`}
                      headerActions={
                        <>
                          <Button type="button" variant="outline" className={LISTING_WIZARD_ACTION_BTN} onClick={() => setSharedSpaceRoomAccess(i, "all")}>
                            All rooms
                          </Button>
                          <Button type="button" variant="outline" className={LISTING_WIZARD_ACTION_BTN} onClick={() => setSharedSpaceRoomAccess(i, "none")}>
                            Clear rooms
                          </Button>
                          <Button type="button" variant="outline" className={LISTING_WIZARD_REMOVE_BTN} onClick={() => removeSharedSpace(i)}>
                            Remove
                          </Button>
                        </>
                      }
                    >
                        <div data-wizard-field={spaceNameKey}>
                          <FieldLabel hint="Required only if you add this space.">Name</FieldLabel>
                          <Input
                            value={sp.name}
                            className={wizardFieldErrorClass(Boolean(spaceNameErr))}
                            onChange={(e) => {
                              clearListingFieldError(spaceNameKey);
                              clearListingFieldError("sharedSpaces");
                              setSharedSpace(i, { name: sanitizePlaceNameInput(e.target.value) });
                            }}
                            placeholder="e.g. Kitchen & dining, Laundry, Backyard"
                          />
                          <StepFieldError msg={spaceNameErr} />
                        </div>
                        <div>
                          <FieldLabel>Space type</FieldLabel>
                          <div className="relative">
                            <Select
                              aria-label={`Shared space ${i + 1} type`}
                              className={`${selectInputCls}`}
                              value={sp.spaceKind ?? "other"}
                              onChange={(e) => {
                                const kind = e.target.value as SharedSpaceKind;
                                setSharedSpace(i, {
                                  spaceKind: kind,
                                  amenitiesText: pruneSharedSpaceAmenitiesForKind(sp.amenitiesText ?? "", kind, dedupedPresets.sharedSpace),
                                });
                              }}
                            >
                              {SHARED_SPACE_KIND_OPTIONS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel>Location / level</FieldLabel>
                          <div className="space-y-2">
                            <div className="relative">
                              <Select
                                aria-label={`Shared space ${i + 1} location`}
                                className={`${selectInputCls}`}
                                value={locationSelectValue(sp.location ?? "", locationLevelOptions)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) {
                                    setSharedSpace(i, { location: "" });
                                    return;
                                  }
                                  if (v === LOCATION_LEVEL_CUSTOM) {
                                    if (locationLevelOptions.includes((sp.location ?? "").trim())) setSharedSpace(i, { location: "" });
                                    return;
                                  }
                                  setSharedSpace(i, { location: v });
                                }}
                              >
                                <option value="">Select location</option>
                                {locationLevelOptions.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                                <option value={LOCATION_LEVEL_CUSTOM}>Custom…</option>
                              </Select>
                            </div>
                            {locationSelectValue(sp.location ?? "", locationLevelOptions) === LOCATION_LEVEL_CUSTOM ? (
                              <Input
                                value={sp.location ?? ""}
                                onChange={(e) => setSharedSpace(i, { location: e.target.value })}
                                placeholder="Custom location"
                                aria-label={`Shared space ${i + 1} custom location`}
                              />
                            ) : null}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint={`Common amenities for ${spaceKindLabel.toLowerCase()} — check all that apply.`}>
                            Amenities
                          </FieldLabel>
                          <div className="mt-2 grid gap-2 rounded-xl border border-border bg-accent/30/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
                            {kindPresets.map((p) => {
                              const on = splitLineList(sp.amenitiesText ?? "").includes(p.label);
                              return (
                                <label key={p.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary/30"
                                    checked={on}
                                    onChange={(e) =>
                                      setSharedSpace(i, {
                                        amenitiesText: mergeToggleLine(sp.amenitiesText ?? "", p.label, e.target.checked),
                                      })
                                    }
                                  />
                                  <span className="font-medium text-foreground">{p.label}</span>
                                </label>
                              );
                            })}
                          </div>
                          <Textarea
                            className="mt-2"
                            rows={2}
                            value={customAmenitiesText}
                            onChange={(e) => {
                              const presetLines = splitLineList(sp.amenitiesText ?? "").filter((line) =>
                                kindPresetLabels.has(line),
                              );
                              const customLines = splitLineList(e.target.value);
                              setSharedSpace(i, { amenitiesText: [...presetLines, ...customLines].join("\n") });
                            }}
                            placeholder="Other amenities not listed above (one per line)."
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="Upload up to 8 shared-space photos.">Photos</FieldLabel>
                          <div
                            className={`mt-2 ${mediaDropZoneClass(activeDropZone === `shared-photos-${sp.id}`)}`}
                            onDragOver={(e) => handleDragOver(e, `shared-photos-${sp.id}`)}
                            onDragEnter={(e) => handleDragOver(e, `shared-photos-${sp.id}`)}
                            onDragLeave={(e) => handleDragLeave(e, `shared-photos-${sp.id}`)}
                            onDrop={(e) => onDropSharedSpacePhotos(sp.id, e)}
                          >
                            <MediaPickTrigger
                              accept="image/*"
                              multiple
                              onFiles={(files) => { void onPickSharedSpacePhotos(sp.id, files); }}
                            >
                              Add photos
                            </MediaPickTrigger>
                            <p className="mt-3 text-sm text-muted">Drag and drop photos here, or use the button above.</p>
                            {(sp.photoDataUrls?.length ?? 0) > 0 ? (
                              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {sp.photoDataUrls.map((src, pi) => (
                                  <div key={`${sp.id}-p-${pi}`} className="group relative overflow-hidden rounded-lg border border-border bg-accent/30">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={src} alt="Shared space" className="h-28 w-full object-cover" />
                                    <button
                                      type="button"
                                      className="absolute right-1 top-1 rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-rose-600 shadow-sm opacity-0 transition group-hover:opacity-100"
                                      onClick={() => removeSharedSpacePhoto(sp.id, pi)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-[11px] text-muted">No photos yet — up to 8 images. Images are auto-compressed.</p>
                            )}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel hint="One short clip per shared space (~14 MB max).">Video</FieldLabel>
                          <div
                            className={`mt-2 ${mediaDropZoneClass(activeDropZone === `shared-video-${sp.id}`)}`}
                            onDragOver={(e) => handleDragOver(e, `shared-video-${sp.id}`)}
                            onDragEnter={(e) => handleDragOver(e, `shared-video-${sp.id}`)}
                            onDragLeave={(e) => handleDragLeave(e, `shared-video-${sp.id}`)}
                            onDrop={(e) => onDropSharedSpaceVideo(sp.id, e)}
                          >
                            <MediaPickTrigger
                              accept="video/*"
                              disabled={videoUploadingKeys.has(`space-${sp.id}`)}
                              onFiles={(files) => { void onPickSharedSpaceVideo(sp.id, files?.[0] ?? null); }}
                            >
                              {videoUploadingKeys.has(`space-${sp.id}`) ? "Uploading…" : sp.videoDataUrl ? "Replace video" : "Add video"}
                            </MediaPickTrigger>
                            {videoUploadingKeys.has(`space-${sp.id}`) ? (
                              <p className="mt-3 text-sm text-primary">Uploading video — this may take a moment…</p>
                            ) : (
                              <p className="mt-3 text-sm text-muted">Drag and drop one video here, or use the button above.</p>
                            )}
                            {sp.videoDataUrl ? (
                              <div className="mt-4 space-y-2">
                                <video
                                  src={videoPreviewUrls[`space-${sp.id}`] ?? sp.videoDataUrl}
                                  controls
                                  playsInline
                                  className="max-h-52 w-full rounded-lg border border-border bg-black object-contain"
                                />
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-rose-600 hover:underline"
                                  onClick={() => clearSharedSpaceVideo(sp.id)}
                                >
                                  Remove video
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel>Room access</FieldLabel>
                          <div className="mt-2 grid gap-2 rounded-xl border border-border bg-accent/30 p-3 sm:grid-cols-2 lg:grid-cols-3">
                            {sub.rooms.map((room) => (
                              <label key={`${sp.id}-acc-${room.id}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-border"
                                  checked={(sp.roomAccessIds ?? []).includes(room.id)}
                                  onChange={(e) => toggleSharedSpaceRoom(i, room.id, e.target.checked)}
                                />
                                <span className="font-medium text-foreground">{room.name.trim() || `Room (${room.id.slice(-6)})`}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                    </ListingWizardCollapsibleCard>
                  );
                  })}
                </div>
              )}
          </FormSection>
          ) : null}

          {/* ── Step 6: Services ── */}
          {stepIndex === 6 ? (
          <FormSection
            id="edit-services"
            title="Resident services"
            description="Optional services residents can request from their portal."
          >
            <div className="space-y-4">
              {serviceOffers.length > 0 ? (
                <div className="space-y-3">
                  {serviceOffers.map((offer) => (
                    <ListingWizardCollapsibleCard
                      key={offer.id}
                      expanded={isListingItemExpanded(listingItemKey("service", offer.id))}
                      onToggle={() => toggleListingItem(listingItemKey("service", offer.id))}
                      title={offer.name}
                      subtitle={[offer.price, offer.available ? "Active" : "Paused"].filter(Boolean).join(" · ")}
                      toggleDataAttr={`listing-service-toggle-${offer.id}`}
                      headerActions={
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className={LISTING_WIZARD_ACTION_BTN}
                            onClick={() => {
                              setEditingOffer(offer);
                              setServiceForm({ name: offer.name, description: offer.description, price: offer.price, deposit: offer.deposit ?? "" });
                              setServiceModalOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={LISTING_WIZARD_ACTION_BTN}
                            onClick={() => {
                              setServiceOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, available: !o.available } : o)));
                            }}
                          >
                            {offer.available ? "Pause" : "Resume"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={LISTING_WIZARD_REMOVE_BTN}
                            onClick={() => {
                              setServiceOffers((prev) => prev.filter((o) => o.id !== offer.id));
                            }}
                          >
                            Remove
                          </Button>
                        </>
                      }
                    >
                      {offer.description ? (
                        <p className="text-sm leading-relaxed text-muted">{offer.description}</p>
                      ) : (
                        <p className="text-sm text-muted">No description — use Edit to add details.</p>
                      )}
                      {offer.deposit ? (
                        <p className="text-xs text-muted">Deposit: {offer.deposit}</p>
                      ) : null}
                    </ListingWizardCollapsibleCard>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-accent/30 py-10 text-center">
                  <p className="text-sm font-medium text-muted">No services yet</p>
                  <p className="mt-1 text-xs text-muted">Add a preset below or create a custom service.</p>
                </div>
              )}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Quick add</p>
                <div className="flex flex-wrap gap-2">
                  {LISTING_SERVICE_QUICK_ADDS.map((preset) => {
                    const added = serviceOffers.some(
                      (o) => o.name.trim().toLowerCase() === preset.name.toLowerCase(),
                    );
                    return (
                      <Button
                        key={preset.name}
                        type="button"
                        variant="outline"
                        className="rounded-full text-xs"
                        disabled={added}
                        onClick={() => addQuickService(preset)}
                      >
                        {added ? `${preset.name} added` : `+ ${preset.name}`}
                      </Button>
                    );
                  })}
                </div>
                <Button type="button" variant="primary" className="rounded-full text-xs" onClick={() => { setEditingOffer(null); setServiceForm({ name: "", description: "", price: "", deposit: "" }); setServiceModalOpen(true); }}>
                  + Custom service
                </Button>
              </div>
            </div>
          </FormSection>
          ) : null}

          {/* ── Step 7: Application ── */}
          {stepIndex === 7 ? (
          <FormSection
            id="edit-application"
            title="Rental application"
            description="Review and adjust every question applicants answer. Built-in Axis questions can be edited or removed; add your own in any section."
          >
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {applicationFields.length} question{applicationFields.length === 1 ? "" : "s"} on this application
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className={LISTING_WIZARD_ACTION_BTN}
                  data-attr="listing-application-restore-defaults"
                  onClick={restoreApplicationDefaults}
                >
                  Restore Axis defaults
                </Button>
              </div>

              {stepFieldErrors.customApplicationFields ? (
                <div data-wizard-field="customApplicationFields">
                  <StepFieldError msg={stepFieldErrors.customApplicationFields} />
                </div>
              ) : null}

              <div className="space-y-3">
                {RENTAL_APPLICATION_SECTIONS.map((section, sectionIdx) => {
                  const sectionQuestions = applicationFields.filter(
                    (f) => (f.section ?? "additional") === section.id,
                  );
                  const sectionKey = listingItemKey("app-section", section.id);
                  return (
                    <ListingWizardCollapsibleCard
                      key={section.id}
                      expanded={isListingItemExpanded(sectionKey)}
                      onToggle={() => toggleListingItem(sectionKey)}
                      title={`${sectionIdx + 1}. ${section.title}`}
                      subtitle={`${sectionQuestions.length} question${sectionQuestions.length === 1 ? "" : "s"}`}
                      bodyClassName="space-y-3 px-4 py-3"
                      toggleDataAttr={`listing-application-section-toggle-${section.id}`}
                      headerActions={
                        <Button
                          type="button"
                          variant="outline"
                          className={LISTING_WIZARD_ACTION_BTN}
                          data-attr="listing-application-add-question"
                          onClick={() => addCustomQuestion(section.id)}
                        >
                          + Add question
                        </Button>
                      }
                    >
                        {sectionQuestions.length > 0 ? (
                          sectionQuestions.map((field) => {
                            const err = stepFieldErrors[listingCustomQuestionErrorKey(field.id)];
                            return (
                              <div
                                key={field.id}
                                data-wizard-field={listingCustomQuestionErrorKey(field.id)}
                                className={`space-y-3 rounded-xl border p-3 ${err ? "border-red-300 ring-2 ring-red-100" : "border-border bg-accent/20"}`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${field.isStandard ? "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100" : "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100"}`}
                                  >
                                    {field.isStandard ? "Built-in" : "Custom"}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className={LISTING_WIZARD_REMOVE_BTN}
                                    onClick={() => removeApplicationQuestion(field)}
                                  >
                                    Remove
                                  </Button>
                                </div>
                                <div>
                                  <FieldLabel>Question</FieldLabel>
                                  <Input
                                    value={field.label}
                                    onChange={(e) => patchApplicationQuestion(field, { label: e.target.value })}
                                    placeholder="e.g. Do you smoke?"
                                  />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <FieldLabel>Answer type</FieldLabel>
                                    <Select
                                      value={field.type}
                                      onChange={(e) =>
                                        patchApplicationQuestion(field, {
                                          type: e.target.value as ManagerCustomApplicationFieldType,
                                        })
                                      }
                                    >
                                      {CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS.map((o) => (
                                        <option key={o.id} value={o.id}>
                                          {o.label}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                  <label className="flex cursor-pointer items-center gap-2 self-end rounded-xl border border-border bg-card px-3 py-2.5">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-border text-primary"
                                      checked={field.required}
                                      onChange={(e) => patchApplicationQuestion(field, { required: e.target.checked })}
                                    />
                                    <span className="text-sm font-medium text-foreground">Required</span>
                                  </label>
                                </div>
                                {field.type === "select" ? (
                                  <div>
                                    <FieldLabel>Dropdown options</FieldLabel>
                                    <Input
                                      value={questionOptionsText(field)}
                                      onChange={(e) => setQuestionOptionsText(field, e.target.value)}
                                      placeholder="Comma-separated, e.g. Yes, No, Occasionally"
                                    />
                                  </div>
                                ) : null}
                                <StepFieldError msg={err} />
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-muted">No questions in this section — add one or restore defaults.</p>
                        )}
                    </ListingWizardCollapsibleCard>
                  );
                })}
              </div>
            </div>
          </FormSection>
          ) : null}

          {/* ── Step 8: Lease ── */}
          {stepIndex === 8 ? (
          <FormSection id="edit-leasedoc" title="Lease">
            <LeaseConfigForm
              variant="wizard"
              dataAttrPrefix="listing"
              draft={{
                leaseConfigMode: sub.leaseConfigMode,
                leaseCustomKind: sub.leaseCustomKind,
                customLeaseTerms: sub.customLeaseTerms,
                leaseTemplateDocUrl: sub.leaseTemplateDocUrl,
                leaseTemplateDocName: sub.leaseTemplateDocName,
              }}
              onDraftChange={(patch) => setSub((s) => ({ ...s, ...patch }))}
              onStandardToggle={() => setStepFieldErrors({})}
              onCustomTermsChange={() => clearListingFieldError("customLeaseTerms")}
              onPickLeaseTemplateDoc={onPickLeaseTemplateDoc}
              customTermsError={stepFieldErrors.customLeaseTerms ?? null}
              leaseTemplateError={stepFieldErrors.leaseTemplateDoc ?? null}
            />
          </FormSection>
          ) : null}

          {/* ── Step 9: Highlights ── */}
          {stepIndex === 9 ? (
          <FormSection
            id="edit-highlights"
            title="Highlights & submit"
            description="Fine-tune the sidebar quick facts, then submit for review."
          >
            <div className="space-y-8">
              <ListingSubsection
                title="Quick facts (sidebar)"
                description="Optional. Rows here replace the auto-generated sidebar. Leave empty to use building, room count, floors, and pet policy from earlier steps."
              >
                <div className="space-y-3">
                  {(sub.quickFacts ?? []).map((qf, i) => (
                    <ListingWizardCollapsibleCard
                      key={qf.id}
                      expanded={isListingItemExpanded(listingItemKey("quickfact", qf.id))}
                      onToggle={() => toggleListingItem(listingItemKey("quickfact", qf.id))}
                      title={qf.label.trim() || `Quick fact ${i + 1}`}
                      subtitle={qf.value.trim() || "No value set"}
                      bodyClassName="grid gap-3 sm:grid-cols-2"
                      toggleDataAttr={`listing-quickfact-toggle-${qf.id}`}
                      headerActions={
                        <Button type="button" variant="outline" className={LISTING_WIZARD_REMOVE_BTN} onClick={() => removeQuickFact(i)}>
                          Remove
                        </Button>
                      }
                    >
                      <div>
                        <FieldLabel>Label</FieldLabel>
                        <Input value={qf.label} onChange={(e) => setQuickFact(i, { label: sanitizePlaceNameInput(e.target.value) })} placeholder="e.g. Neighborhood" />
                      </div>
                      <div>
                        <FieldLabel>Value</FieldLabel>
                        <Input value={qf.value} onChange={(e) => setQuickFact(i, { value: e.target.value })} placeholder="—" />
                      </div>
                    </ListingWizardCollapsibleCard>
                  ))}
                  <Button type="button" variant="outline" className={LISTING_WIZARD_ACTION_BTN} onClick={addQuickFact}>
                    + Add quick fact
                  </Button>
                </div>
              </ListingSubsection>

              <div className="border-t border-border pt-5">
                <p className="text-sm font-bold text-foreground">{isEditMode ? "Ready to submit changes?" : "Ready to submit this listing?"}</p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {isEditMode
                    ? "Review each step, then submit your changes when the listing is ready for review."
                    : "This form does not auto-save or auto-submit. Click Submit listing below when the listing is complete and ready for admin approval."}
                </p>
              </div>
            </div>
          </FormSection>
          ) : null}
        </div>

        <div className="modal-panel z-20 shrink-0 border-t border-border px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="w-full min-h-[48px] sm:w-auto sm:min-w-[120px]" onClick={onClose} disabled={busy}>
                Close
              </Button>
              {visibleStepPosition > 0 ? (
                <Button type="button" variant="outline" className="w-full min-h-[48px] sm:w-auto sm:min-w-[120px]" onClick={goPrev} disabled={busy}>
                  Back
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {!isFinalStep ? (
                <Button
                  type="button"
                  className="w-full min-h-[48px] sm:w-auto sm:min-w-[200px]"
                  data-attr="listing-wizard-continue"
                  onClick={goNext}
                  disabled={busy}
                >
                  {visibleStepPosition === visibleStepCount - 2
                    ? isPreviewWizard
                      ? "Review & save →"
                      : "Review & submit →"
                    : "Continue"}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full min-h-[48px] sm:w-auto sm:min-w-[200px]"
                  data-attr="listing-wizard-submit"
                  onClick={() => void submitListing()}
                  disabled={busy}
                >
                  {busy
                    ? isPreviewWizard
                      ? "Saving preview…"
                      : isEditMode
                        ? "Submitting changes…"
                        : "Submitting listing…"
                    : isPreviewWizard
                      ? "Save preview"
                      : isEditMode
                        ? "Submit changes"
                        : "Submit listing"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Service add/edit modal */}
      <Modal
        open={serviceModalOpen}
        title={editingOffer ? "Edit request option" : "Add request option"}
        onClose={() => setServiceModalOpen(false)}
        stackClassName="fixed inset-0 z-[10050] overflow-y-auto"
        panelClassName="modal-panel relative w-full max-w-md overflow-hidden rounded-2xl border border-border p-5 shadow-2xl sm:p-6"
      >
        <div className="grid gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Request name *</p>
            <Input value={serviceForm.name} onChange={(e) => setServiceForm((f) => ({ ...f, name: sanitizePlaceNameInput(e.target.value) }))} placeholder="e.g. Weekly cleaning, Linen set" className="bg-card" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Price</p>
              <Input value={serviceForm.price} onChange={(e) => setServiceForm((f) => ({ ...f, price: e.target.value }))} placeholder="e.g. $25, Free" className="bg-card" />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Deposit (optional)</p>
              <Input value={serviceForm.deposit} onChange={(e) => setServiceForm((f) => ({ ...f, deposit: sanitizeMoneyInput(e.target.value) }))} placeholder="e.g. $50" className="bg-card" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Description</p>
            <textarea rows={3} value={serviceForm.description} onChange={(e) => setServiceForm((f) => ({ ...f, description: e.target.value }))} placeholder="What's included, how it works…" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setServiceModalOpen(false)}>Cancel</Button>
          <Button type="button" className="rounded-full" onClick={handleSaveService} disabled={!serviceForm.name.trim()}>{editingOffer ? "Save changes" : "Add request"}</Button>
        </div>
      </Modal>
    </div>,
    portalContainer ?? document.body,
  );
}
