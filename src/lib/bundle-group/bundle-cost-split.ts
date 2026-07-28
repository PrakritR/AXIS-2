import { parseMoneyAmount } from "@/lib/parse-money";
import {
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { utilitiesBillableMonthlyAmount } from "@/lib/listing-utilities-payment";
import type { BundleCostSplitLine, BundleFinancialTotals } from "./types";

/** Equal split with cent remainder assigned to the lowest member indices (organizer first). */
export function splitMoneyEvenly(totalAmount: number, memberCount: number, memberIndex: number): number {
  if (!(memberCount > 0) || memberIndex < 0 || memberIndex >= memberCount) return 0;
  if (!(totalAmount > 0)) return 0;
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / memberCount);
  const remainder = totalCents - baseCents * memberCount;
  const cents = baseCents + (memberIndex < remainder ? 1 : 0);
  return Number((cents / 100).toFixed(2));
}

export function splitShareLabel(memberIndex: number, memberCount: number, totalLabel: string): string {
  if (memberCount <= 1) return totalLabel;
  return `your ${memberIndex + 1}/${memberCount} share of ${totalLabel}`;
}

export function moneyLabel(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

export function resolveBundleFinancialTotals(
  sub: ManagerListingSubmissionV1,
  bundleId: string,
): BundleFinancialTotals | null {
  const normalized = normalizeManagerListingSubmissionV1(sub);
  const bundle = normalized.bundles.find((b) => b.id === bundleId.trim());
  if (!bundle) return null;

  const monthlyRent = parseMoneyAmount(bundle.price);
  const securityDeposit = parseMoneyAmount(normalized.securityDeposit);
  const moveInFee = parseMoneyAmount(normalized.moveInFee);

  const roomIds =
    bundle.includedRoomIds?.length && bundle.includedRoomIds.length > 0
      ? bundle.includedRoomIds
      : normalized.rooms.map((r) => r.id);
  const rooms = normalized.rooms.filter((r) => roomIds.includes(r.id));
  const monthlyUtilities = rooms.reduce(
    (sum, room) => sum + utilitiesBillableMonthlyAmount(normalized, room),
    0,
  );

  return { monthlyRent, securityDeposit, moveInFee, monthlyUtilities };
}

export function buildMemberSplitLines(
  totals: BundleFinancialTotals,
  memberCount: number,
  memberIndex: number,
): BundleCostSplitLine[] {
  const lines: BundleCostSplitLine[] = [];
  const push = (kind: string, total: number) => {
    if (!(total > 0)) return;
    const memberAmount = splitMoneyEvenly(total, memberCount, memberIndex);
    if (!(memberAmount > 0)) return;
    lines.push({
      kind,
      totalAmount: total,
      memberAmount,
      memberIndex,
      memberCount,
      shareLabel: splitShareLabel(memberIndex, memberCount, moneyLabel(total)),
    });
  };
  push("rent", totals.monthlyRent);
  push("security_deposit", totals.securityDeposit);
  push("move_in_fee", totals.moveInFee);
  push("utilities", totals.monthlyUtilities);
  return lines;
}
