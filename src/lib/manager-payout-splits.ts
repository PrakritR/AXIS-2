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
  owners: PayoutOwnerSplit[];
  notes: string;
};

export const emptyPayoutSplitsConfig = (): PayoutSplitsConfig => ({
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
  return { owners, notes };
}

export function validatePayoutSplitsConfig(c: PayoutSplitsConfig): { ok: true } | { ok: false; error: string } {
  const sumApp = c.owners.reduce((s, r) => s + r.applicationFeePercent, 0);
  const sumRent = c.owners.reduce((s, r) => s + r.rentPercent, 0);
  if (sumApp > 100.01) return { ok: false, error: "Owner application-fee shares total more than 100%." };
  if (sumRent > 100.01) return { ok: false, error: "Owner rent shares total more than 100%." };
  return { ok: true };
}

/** Remaining share implied for the manager after owner splits (before considering Connect accounts). */
export function managerRemainderPercents(c: PayoutSplitsConfig): { applicationFee: number; rent: number } {
  const sumApp = c.owners.reduce((s, r) => s + r.applicationFeePercent, 0);
  const sumRent = c.owners.reduce((s, r) => s + r.rentPercent, 0);
  return {
    applicationFee: Math.max(0, 100 - sumApp),
    rent: Math.max(0, 100 - sumRent),
  };
}
