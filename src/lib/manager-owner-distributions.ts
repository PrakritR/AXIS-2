/**
 * Owner distribution statement rows. The distribution amount is always computed
 * (never model- or client-supplied) from the industry-standard formula:
 *
 *   distribution = beginningBalance + cashIn − cashOut − managementFee
 *                  − reserveHoldback + adjustments
 *
 * Schema: `manager_owner_distributions` in `20260712120000_manager_bills_ap.sql`.
 */
export const OWNER_DISTRIBUTION_STATUSES = ["draft", "approved", "paid"] as const;
export type OwnerDistributionStatus = (typeof OWNER_DISTRIBUTION_STATUSES)[number];

export type OwnerDistribution = {
  id: string;
  propertyId: string;
  ownerId: string | null;
  periodStart: string;
  periodEnd: string;
  beginningBalanceCents: number;
  cashInCents: number;
  cashOutCents: number;
  managementFeeCents: number;
  reserveHoldbackCents: number;
  adjustmentsCents: number;
  distributionCents: number;
  status: OwnerDistributionStatus;
  paidAt: string | null;
  memo: string | null;
  createdAt: string;
};

export type PropertyOwner = {
  id: string;
  propertyId: string;
  ownerName: string;
  ownerEmail: string | null;
  ownershipPct: number;
};

export const OWNER_DISTRIBUTION_SELECT =
  "id, property_id, owner_id, period_start, period_end, beginning_balance_cents, cash_in_cents, cash_out_cents, management_fee_cents, reserve_holdback_cents, adjustments_cents, distribution_cents, status, paid_at, memo, created_at";

export const PROPERTY_OWNER_SELECT = "id, property_id, owner_name, owner_email, ownership_pct";

export type DistributionComponents = {
  beginningBalanceCents?: number;
  cashInCents?: number;
  cashOutCents?: number;
  managementFeeCents?: number;
  reserveHoldbackCents?: number;
  adjustmentsCents?: number;
};

function intCents(value: number | undefined | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Pure distribution math — the single source of the owner-statement bottom line. */
export function computeDistributionCents(input: DistributionComponents): number {
  return (
    intCents(input.beginningBalanceCents) +
    intCents(input.cashInCents) -
    intCents(input.cashOutCents) -
    intCents(input.managementFeeCents) -
    intCents(input.reserveHoldbackCents) +
    intCents(input.adjustmentsCents)
  );
}

export function ownerDistributionBadgeTone(
  status: OwnerDistributionStatus,
): "pending" | "approved" | "confirmed" {
  switch (status) {
    case "draft":
      return "pending";
    case "approved":
      return "approved";
    case "paid":
      return "confirmed";
  }
}

export function mapOwnerDistributionRow(row: Record<string, unknown>): OwnerDistribution {
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    ownerId: row.owner_id ? String(row.owner_id) : null,
    periodStart: String(row.period_start).slice(0, 10),
    periodEnd: String(row.period_end).slice(0, 10),
    beginningBalanceCents: Number(row.beginning_balance_cents ?? 0),
    cashInCents: Number(row.cash_in_cents ?? 0),
    cashOutCents: Number(row.cash_out_cents ?? 0),
    managementFeeCents: Number(row.management_fee_cents ?? 0),
    reserveHoldbackCents: Number(row.reserve_holdback_cents ?? 0),
    adjustmentsCents: Number(row.adjustments_cents ?? 0),
    distributionCents: Number(row.distribution_cents ?? 0),
    status: row.status as OwnerDistributionStatus,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    memo: row.memo ? String(row.memo) : null,
    createdAt: String(row.created_at),
  };
}

export function mapPropertyOwnerRow(row: Record<string, unknown>): PropertyOwner {
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    ownerName: String(row.owner_name),
    ownerEmail: row.owner_email ? String(row.owner_email) : null,
    ownershipPct: Number(row.ownership_pct ?? 100),
  };
}
