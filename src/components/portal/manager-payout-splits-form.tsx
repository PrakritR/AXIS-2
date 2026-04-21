"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { PayoutOwnerSplit, PayoutSplitsConfig } from "@/lib/manager-payout-splits";
import { managerRemainderPercents } from "@/lib/manager-payout-splits";

function newRow(): PayoutOwnerSplit {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `owner-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    displayName: "",
    email: "",
    applicationFeePercent: 0,
    rentPercent: 0,
  };
}

type ApiPayload = {
  config?: PayoutSplitsConfig;
  platformFees?: { applicationFee: number; rent: number };
  error?: string;
  migrationRequired?: boolean;
};

export function ManagerPayoutSplitsForm() {
  const { showToast } = useAppUi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<PayoutSplitsConfig>({ owners: [], notes: "" });
  const [platformFees, setPlatformFees] = useState<{ applicationFee: number; rent: number } | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile/payout-splits", { credentials: "include" });
      const body = (await res.json()) as ApiPayload;
      if (!res.ok) {
        showToast(body.error ?? "Could not load payout splits.");
        return;
      }
      if (body.config) setConfig(body.config);
      if (body.platformFees) setPlatformFees(body.platformFees);
      setMigrationRequired(Boolean(body.migrationRequired));
    } catch {
      showToast("Network error.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const remainder = useMemo(() => managerRemainderPercents(config), [config]);

  const updateOwner = useCallback((id: string, patch: Partial<PayoutOwnerSplit>) => {
    setConfig((c) => ({
      ...c,
      owners: c.owners.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
  }, []);

  const removeOwner = useCallback((id: string) => {
    setConfig((c) => ({ ...c, owners: c.owners.filter((o) => o.id !== id) }));
  }, []);

  const addOwner = useCallback(() => {
    setConfig((c) => ({ ...c, owners: [...c.owners, newRow()] }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/payout-splits", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const body = (await res.json()) as ApiPayload & { ok?: boolean };
      if (!res.ok) {
        showToast(body.error ?? "Could not save.");
        return;
      }
      if (body.config) setConfig(body.config);
      showToast("Saved payout split settings.");
    } catch {
      showToast("Network error.");
    } finally {
      setSaving(false);
    }
  }, [config, showToast]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
        Loading split settings…
      </div>
    );
  }

  const pf = platformFees ?? { applicationFee: 1, rent: 0.5 };

  if (migrationRequired) {
    return (
      <div className="rounded-2xl border border-amber-200/90 bg-amber-50/80 px-4 py-5 text-sm text-amber-950 shadow-sm">
        <p className="font-semibold">Database migration needed</p>
        <p className="mt-2 leading-relaxed">
          Apply <code className="rounded bg-amber-100/90 px-1 font-mono text-xs">20260421200000_profiles_payout_splits_config.sql</code> to your
          Supabase project so owner splits can be saved.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white px-4 py-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Owner revenue shares</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Add property owners and what share of{" "}
        <span className="font-medium text-slate-800">application fees</span> and{" "}
        <span className="font-medium text-slate-800">rent</span> they receive after Axis platform fees. Whatever you do not assign here stays with
        the manager&apos;s connected payout account ({remainder.applicationFee.toFixed(1)}% app fee share / {remainder.rent.toFixed(1)}% rent share
        remaining).
      </p>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-relaxed text-blue-950">
        <p className="font-semibold text-blue-950">Axis platform fee (Stripe)</p>
        <p className="mt-1">
          On live card payments, the platform collects{" "}
          <span className="font-semibold">{pf.applicationFee}%</span> of each application fee charge and{" "}
          <span className="font-semibold">{pf.rent}%</span> of each rent collection charge into the main Stripe account (configure via{" "}
          <code className="rounded bg-blue-100/80 px-1 py-0.5 font-mono text-xs">application_fee_amount</code> on Connect PaymentIntents). Override
          with env <code className="font-mono text-xs">AXIS_PLATFORM_APPLICATION_FEE_BPS</code> and{" "}
          <code className="font-mono text-xs">AXIS_PLATFORM_RENT_BPS</code> (basis points).
        </p>
      </div>

      <div className="mt-5 space-y-4">
        {config.owners.length === 0 ? (
          <p className="text-sm text-slate-500">No owners yet — add one to record split percentages.</p>
        ) : (
          config.owners.map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">
                  Owner name
                  <input
                    type="text"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-primary/0 transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    placeholder="e.g. Jane Owner"
                    value={row.displayName}
                    onChange={(e) => updateOwner(row.id, { displayName: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Email (optional)
                  <input
                    type="email"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    placeholder="owner@example.com"
                    value={row.email ?? ""}
                    onChange={(e) => updateOwner(row.id, { email: e.target.value })}
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">
                  Share of application fees (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    value={row.applicationFeePercent || ""}
                    onChange={(e) => updateOwner(row.id, { applicationFeePercent: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Share of rent (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    value={row.rentPercent || ""}
                    onChange={(e) => updateOwner(row.id, { rentPercent: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
              <div className="mt-3 flex justify-end">
                <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => removeOwner(row.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="rounded-full" onClick={addOwner}>
          Add owner
        </Button>
      </div>

      <label className="mt-6 block text-xs font-semibold text-slate-600">
        Notes for your team (optional)
        <textarea
          rows={10}
          value={config.notes}
          onChange={(e) => setConfig((c) => ({ ...c, notes: e.target.value }))}
          placeholder="Internal notes about splits, separate Stripe accounts for multiple owners, etc."
          className="mt-2 min-h-[240px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-relaxed text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Button type="button" className="rounded-full" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save payout splits"}
        </Button>
      </div>
    </div>
  );
}
