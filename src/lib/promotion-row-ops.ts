/**
 * Mutations for promotion rows with multiple flyer/text entries.
 * Keeps legacy top-level fields in sync for older code paths and the API.
 */

import {
  createFlyerEntry,
  readFlyerEntries,
  type FlyerCopy,
  type FlyerEntry,
  type ManagerPromotionRow,
  type PromotionInputs,
  type PromotionTemplate,
  type PromotionTheme,
  type FlyerSize,
} from "@/lib/promotion-flyer";
import {
  createPromotionTextEntry,
  primaryPromotionTextCopy,
  readPromotionTextEntries,
  type PromotionTextCopy,
  type PromotionTextEntry,
} from "@/lib/promotion-text";

/** Align legacy single-flyer fields with the newest flyer entry. */
export function syncPromotionRowLegacy(row: ManagerPromotionRow): ManagerPromotionRow {
  const flyerEntries = readFlyerEntries(row);
  const textEntries = readPromotionTextEntries(row);
  const primary = flyerEntries[0] ?? null;

  if (!primary) {
    return {
      ...row,
      flyerCopies: flyerEntries.length > 0 ? flyerEntries : undefined,
      textCopies: textEntries.length > 0 ? textEntries : undefined,
      textCopy: primaryPromotionTextCopy(textEntries),
      copy: null,
      status: textEntries.length > 0 ? row.status : row.status,
    };
  }

  return {
    ...row,
    title: primary.title || row.title,
    copy: primary.copy,
    template: primary.template,
    theme: primary.theme,
    flyerSize: primary.flyerSize,
    inputs: primary.inputs,
    flyerCopies: flyerEntries,
    textCopies: textEntries.length > 0 ? textEntries : undefined,
    textCopy: primaryPromotionTextCopy(textEntries),
    status: "generated",
  };
}

export function updateFlyerEntryOnRow(
  row: ManagerPromotionRow,
  entryId: string,
  patch: Partial<FlyerEntry>,
): ManagerPromotionRow {
  const now = new Date().toISOString();
  const entries = readFlyerEntries(row).map((entry) =>
    entry.id === entryId ? { ...entry, ...patch, updatedAt: now } : entry,
  );
  return syncPromotionRowLegacy({ ...row, flyerCopies: entries });
}

export function updateTextEntryOnRow(
  row: ManagerPromotionRow,
  entryId: string,
  patch: Partial<PromotionTextEntry>,
): ManagerPromotionRow {
  const now = new Date().toISOString();
  const entries = readPromotionTextEntries(row).map((entry) =>
    entry.id === entryId ? { ...entry, ...patch, updatedAt: now } : entry,
  );
  return syncPromotionRowLegacy({ ...row, textCopies: entries });
}

/** Returns null when the row has no remaining assets (caller should delete the row). */
export function removeFlyerEntryFromRow(
  row: ManagerPromotionRow,
  entryId: string,
): ManagerPromotionRow | null {
  const entries = readFlyerEntries(row).filter((e) => e.id !== entryId);
  const texts = readPromotionTextEntries(row);
  if (entries.length === 0 && texts.length === 0) return null;
  return syncPromotionRowLegacy({ ...row, flyerCopies: entries });
}

export function removeTextEntryFromRow(
  row: ManagerPromotionRow,
  entryId: string,
): ManagerPromotionRow | null {
  const flyers = readFlyerEntries(row);
  const entries = readPromotionTextEntries(row).filter((e) => e.id !== entryId);
  if (flyers.length === 0 && entries.length === 0) return null;
  return syncPromotionRowLegacy({ ...row, textCopies: entries });
}

export function appendFlyerEntryToRow(row: ManagerPromotionRow, entry: FlyerEntry): ManagerPromotionRow {
  const entries = [entry, ...readFlyerEntries(row)];
  return syncPromotionRowLegacy({ ...row, flyerCopies: entries });
}

export function appendTextEntryToRow(row: ManagerPromotionRow, entry: PromotionTextEntry): ManagerPromotionRow {
  const entries = [entry, ...readPromotionTextEntries(row)];
  return syncPromotionRowLegacy({ ...row, textCopies: entries });
}

export function buildFlyerEntryFromDraft(args: {
  title: string;
  copy: FlyerCopy;
  inputs: PromotionInputs;
  theme: PromotionTheme;
  flyerSize: FlyerSize;
  template: PromotionTemplate;
  now?: string;
}): FlyerEntry {
  return createFlyerEntry(
    {
      title: args.title,
      copy: args.copy,
      inputs: args.inputs,
      theme: args.theme,
      flyerSize: args.flyerSize,
      template: args.template,
    },
    args.now,
  );
}

export function buildTextEntryFromCopy(
  copy: PromotionTextCopy,
  title: string,
  now = new Date().toISOString(),
): PromotionTextEntry {
  return createPromotionTextEntry(copy, title, now);
}
