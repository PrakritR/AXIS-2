import { platformFeeCents, type PlatformFeeKind } from "@/lib/platform-fees";

function newOwnerId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `owner-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export type PayoutOwnerSplit = {
  id: string;
  displayName: string;
  /** Optional — for your records only in this demo */
  email?: string;
  /** Share of funds after platform fee: 0–100 */
  applicationFeePercent: number;
  rentPercent: number;
};

export type PayoutSplitsConfig = {
  /** Manager share of funds after Axis platform fees. */
  managerApplicationFeePercent: number;
  managerRentPercent: number;
  owners: PayoutOwnerSplit[];
  notes: string;
};

export const emptyPayoutSplitsConfig = (): PayoutSplitsConfig => ({
  managerApplicationFeePercent: 100,
  managerRentPercent: 100,
  owners: [],
  notes: "",
});

function clampPercent(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(100, Math.max(0, Math.round(x * 100) / 100));
}

export function normalizePayoutSplitsConfig(raw: unknown): PayoutSplitsConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyPayoutSplitsConfig();
  }
  const o = raw as Record<string, unknown>;
  const notes = typeof o.notes === "string" ? o.notes : "";
  const arr = Array.isArray(o.owners) ? o.owners : [];
  const owners: PayoutOwnerSplit[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : newOwnerId();
    const displayName = typeof r.displayName === "string" ? r.displayName.trim() : "";
    const email = typeof r.email === "string" ? r.email.trim() : undefined;
    owners.push({
      id,
      displayName,
      ...(email ? { email } : {}),
      applicationFeePercent: clampPercent(r.applicationFeePercent),
      rentPercent: clampPercent(r.rentPercent),
    });
  }
  const ownerApplicationFeePercent = owners.reduce((s, r) => s + r.applicationFeePercent, 0);
  const ownerRentPercent = owners.reduce((s, r) => s + r.rentPercent, 0);
  const managerApplicationFeePercent =
    o.managerApplicationFeePercent === undefined
      ? clampPercent(100 - ownerApplicationFeePercent)
      : clampPercent(o.managerApplicationFeePercent);
  const managerRentPercent =
    o.managerRentPercent === undefined ? clampPercent(100 - ownerRentPercent) : clampPercent(o.managerRentPercent);
  return { managerApplicationFeePercent, managerRentPercent, owners, notes };
}

export function validatePayoutSplitsConfig(c: PayoutSplitsConfig): { ok: true } | { ok: false; error: string } {
  const sumApp = c.managerApplicationFeePercent + c.owners.reduce((s, r) => s + r.applicationFeePercent, 0);
  const sumRent = c.managerRentPercent + c.owners.reduce((s, r) => s + r.rentPercent, 0);
  if (Math.abs(sumApp - 100) > 0.01) return { ok: false, error: "Application-fee shares must total 100%." };
  if (Math.abs(sumRent - 100) > 0.01) return { ok: false, error: "Rent shares must total 100%." };
  return { ok: true };
}

/** Remaining share implied for the manager after owner splits. Kept for older UI callers. */
export function managerRemainderPercents(c: PayoutSplitsConfig): { applicationFee: number; rent: number } {
  const sumApp = c.owners.reduce((s, r) => s + r.applicationFeePercent, 0);
  const sumRent = c.owners.reduce((s, r) => s + r.rentPercent, 0);
  return {
    applicationFee: Math.max(0, 100 - sumApp),
    rent: Math.max(0, 100 - sumRent),
  };
}

function centsForPercent(amountCents: number, percent: number): number {
  return Math.floor((amountCents * percent) / 100);
}

export type PayoutSplitLine = {
  recipientId: string;
  label: string;
  email?: string;
  percent: number;
  amountCents: number;
};

export type PayoutSplitQuote = {
  grossAmountCents: number;
  platformFeeCents: number;
  distributableCents: number;
  manager: PayoutSplitLine;
  owners: PayoutSplitLine[];
};

/**
 * Deterministic cents split after Axis fees. Rounding remainder goes to the
 * manager so the returned lines always add up to the distributable amount.
 */
export function quotePayoutSplit(input: {
  grossAmountCents: number;
  kind: PlatformFeeKind;
  tier?: string | null;
  config: PayoutSplitsConfig;
}): PayoutSplitQuote {
  const grossAmountCents = Math.max(0, Math.floor(input.grossAmountCents));
  const platform = platformFeeCents(grossAmountCents, input.kind, input.tier);
  const distributable = Math.max(0, grossAmountCents - platform);
  const managerPercent =
    input.kind === "application_fee" ? input.config.managerApplicationFeePercent : input.config.managerRentPercent;
  const owners = input.config.owners.map((owner) => {
    const percent = input.kind === "application_fee" ? owner.applicationFeePercent : owner.rentPercent;
    return {
      recipientId: owner.id,
      label: owner.displayName || "Owner",
      ...(owner.email ? { email: owner.email } : {}),
      percent,
      amountCents: centsForPercent(distributable, percent),
    };
  });
  const ownerTotal = owners.reduce((sum, owner) => sum + owner.amountCents, 0);
  const managerFloor = centsForPercent(distributable, managerPercent);
  const managerAmount = Math.max(0, distributable - ownerTotal);
  return {
    grossAmountCents,
    platformFeeCents: platform,
    distributableCents: distributable,
    manager: {
      recipientId: "manager",
      label: "Manager",
      percent: managerPercent,
      amountCents: Math.max(managerFloor, managerAmount),
    },
    owners,
  };
}
