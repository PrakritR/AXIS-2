/**
 * Auto-seed a default flyer and listing blurb per property — modeled on
 * {@link syncPropertyLeaseTemplatesFromListing}. Uses deterministic fallback
 * copy from listing facts (no AI) so the Promotion tab is never empty on first open.
 *
 * Entries whose ids end with {@link DEFAULT_PROMOTION_FLYER_SEED_SUFFIX} /
 * {@link DEFAULT_PROMOTION_TEXT_SEED_SUFFIX} are system-owned: they refresh when
 * listing photos or facts change (e.g. merging media onto an existing property).
 */

import type { MockProperty } from "@/data/types";
import { PUBLIC_LEASING_EMAIL, PUBLIC_SUPPORT_PHONE_DISPLAY } from "@/lib/marketing/public-contact";
import {
  composeFallbackFlyerCopy,
  defaultFlyerEntryTitle,
  PROMOTION_TEMPLATE_DEFAULT,
  PROMOTION_TONE_OPTIONS,
  readFlyerEntries,
  type FlyerEntry,
  type ManagerPromotionRow,
  type PromotionInputs,
} from "@/lib/promotion-flyer";
import { buildPromotionDraftAutofill } from "@/lib/promotion-listing-context";
import {
  appendFlyerEntryToRow,
  appendTextEntryToRow,
  buildFlyerEntryFromDraft,
  buildTextEntryFromCopy,
  syncPromotionRowLegacy,
  updateFlyerEntryOnRow,
  updateTextEntryOnRow,
} from "@/lib/promotion-row-ops";
import {
  composeFallbackPromotionText,
  defaultPromotionTextEntryTitle,
  PROMOTION_TEXT_FORMAT_DEFAULT,
  readPromotionTextEntries,
  type PromotionTextEntry,
} from "@/lib/promotion-text";
import { makePromotionId } from "@/lib/manager-promotions-storage";

export const DEFAULT_PROMOTION_FLYER_SEED_SUFFIX = "::default-flyer";
export const DEFAULT_PROMOTION_TEXT_SEED_SUFFIX = "::default-text";

export function defaultPromotionFlyerEntryId(propertyId: string): string {
  return `${propertyId.trim()}${DEFAULT_PROMOTION_FLYER_SEED_SUFFIX}`;
}

export function defaultPromotionTextEntryId(propertyId: string): string {
  return `${propertyId.trim()}${DEFAULT_PROMOTION_TEXT_SEED_SUFFIX}`;
}

function defaultPromotionContact(managerContact?: string): string {
  const email = managerContact?.trim() || PUBLIC_LEASING_EMAIL;
  return `${email} · ${PUBLIC_SUPPORT_PHONE_DISPLAY}`;
}

function inputsFromListing(
  property: MockProperty,
  opts?: { managerContact?: string; appOrigin?: string },
): PromotionInputs {
  const autofill = buildPromotionDraftAutofill(property, {
    managerContact: defaultPromotionContact(opts?.managerContact),
    appOrigin: opts?.appOrigin,
  });
  return {
    headline: autofill.headline,
    sellingPoints: autofill.sellingPoints,
    price: autofill.price,
    promo: autofill.promo,
    cta: autofill.cta,
    contact: autofill.contact || defaultPromotionContact(opts?.managerContact),
    tone: PROMOTION_TONE_OPTIONS[0]!,
    address: autofill.address,
    customDetails: autofill.customDetails,
    schedulingUrl: autofill.schedulingUrl,
    includeSchedulingLink: autofill.includeSchedulingLink,
    images: autofill.images,
  };
}

function emptyPromotionRow(args: {
  propertyId: string;
  propertyLabel: string;
  managerUserId: string;
  now: string;
}): ManagerPromotionRow {
  return {
    id: makePromotionId(),
    managerUserId: args.managerUserId,
    propertyId: args.propertyId,
    propertyLabel: args.propertyLabel,
    title: "Promotion",
    theme: "cobalt",
    flyerSize: "letter",
    template: PROMOTION_TEMPLATE_DEFAULT,
    status: "draft",
    inputs: {
      headline: "",
      sellingPoints: "",
      price: "",
      promo: "",
      cta: "",
      contact: "",
      tone: PROMOTION_TONE_OPTIONS[0]!,
      customDetails: "",
      images: [],
    },
    copy: null,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

function buildDefaultFlyerEntry(
  propertyId: string,
  inputs: PromotionInputs,
  propertyLabel: string,
  now: string,
): FlyerEntry {
  const copy = composeFallbackFlyerCopy(inputs, propertyLabel);
  return {
    ...buildFlyerEntryFromDraft({
      title: defaultFlyerEntryTitle(1),
      copy,
      inputs,
      theme: "cobalt",
      flyerSize: "letter",
      template: PROMOTION_TEMPLATE_DEFAULT,
      now,
    }),
    id: defaultPromotionFlyerEntryId(propertyId),
  };
}

function buildDefaultTextEntry(
  propertyId: string,
  inputs: PromotionInputs,
  propertyLabel: string,
  now: string,
): PromotionTextEntry {
  const copy = composeFallbackPromotionText(inputs, propertyLabel, PROMOTION_TEXT_FORMAT_DEFAULT);
  return {
    ...buildTextEntryFromCopy(copy, defaultPromotionTextEntryTitle(1), now),
    id: defaultPromotionTextEntryId(propertyId),
  };
}

function flyerEntrySyncPayload(entry: FlyerEntry): string {
  return JSON.stringify({
    copy: entry.copy,
    inputs: entry.inputs,
    template: entry.template,
    theme: entry.theme,
    flyerSize: entry.flyerSize,
  });
}

function textEntrySyncPayload(entry: PromotionTextEntry): string {
  return JSON.stringify(entry.copy);
}

export type EnsureDefaultPromotionOpts = {
  propertyId: string;
  property: MockProperty;
  managerUserId: string;
  managerContact?: string;
  appOrigin?: string;
  existingRow?: ManagerPromotionRow | null;
};

/**
 * Create or refresh the seeded default flyer and listing blurb from current
 * listing facts. System-owned seed entries update when photos or copy change;
 * manager-created assets are never touched. Returns null when already in sync.
 */
export function ensureDefaultPromotionAssets(opts: EnsureDefaultPromotionOpts): ManagerPromotionRow | null {
  const propertyId = opts.propertyId.trim();
  if (!propertyId) return null;

  const inputs = inputsFromListing(opts.property, {
    managerContact: opts.managerContact,
    appOrigin: opts.appOrigin,
  });
  const propertyLabel = buildPromotionDraftAutofill(opts.property, {
    managerContact: opts.managerContact,
    appOrigin: opts.appOrigin,
  }).propertyLabel;

  const now = new Date().toISOString();
  const flyerSeedId = defaultPromotionFlyerEntryId(propertyId);
  const textSeedId = defaultPromotionTextEntryId(propertyId);
  const freshFlyer = buildDefaultFlyerEntry(propertyId, inputs, propertyLabel, now);
  const freshText = buildDefaultTextEntry(propertyId, inputs, propertyLabel, now);

  const existingFlyers = opts.existingRow ? readFlyerEntries(opts.existingRow) : [];
  const existingTexts = opts.existingRow ? readPromotionTextEntries(opts.existingRow) : [];
  const currentFlyer = existingFlyers.find((e) => e.id === flyerSeedId) ?? null;
  const currentText = existingTexts.find((e) => e.id === textSeedId) ?? null;

  const needsFlyer = !currentFlyer;
  const needsText = !currentText;
  const flyerStale = currentFlyer ? flyerEntrySyncPayload(currentFlyer) !== flyerEntrySyncPayload(freshFlyer) : false;
  const textStale = currentText ? textEntrySyncPayload(currentText) !== textEntrySyncPayload(freshText) : false;

  if (!needsFlyer && !needsText && !flyerStale && !textStale) return null;

  let row =
    opts.existingRow ??
    emptyPromotionRow({
      propertyId,
      propertyLabel,
      managerUserId: opts.managerUserId,
      now,
    });

  if (needsFlyer) {
    row = appendFlyerEntryToRow(row, freshFlyer);
  } else if (flyerStale && currentFlyer) {
    row = updateFlyerEntryOnRow(row, currentFlyer.id, {
      copy: freshFlyer.copy,
      inputs: freshFlyer.inputs,
      template: freshFlyer.template,
      theme: freshFlyer.theme,
      flyerSize: freshFlyer.flyerSize,
    });
  }

  if (needsText) {
    row = appendTextEntryToRow(row, freshText);
  } else if (textStale && currentText) {
    row = updateTextEntryOnRow(row, currentText.id, { copy: freshText.copy });
  }

  return syncPromotionRowLegacy({
    ...row,
    managerUserId: opts.managerUserId,
    propertyId,
    propertyLabel,
    inputs,
    updatedAt: now,
  });
}

/** @deprecated Use {@link ensureDefaultPromotionAssets} — kept for tests/docs. */
export function syncDefaultPromotionAssets(opts: EnsureDefaultPromotionOpts): ManagerPromotionRow | null {
  return ensureDefaultPromotionAssets(opts);
}
