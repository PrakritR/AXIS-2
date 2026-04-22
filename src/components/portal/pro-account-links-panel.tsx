"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  PROPERTY_PIPELINE_EVENT,
  readPendingManagerPropertiesForUser,
  readExtraListingsForUser,
} from "@/lib/demo-property-pipeline";
import {
  AXIS_ID_LABEL,
  generateRelationshipId,
  readProRelationships,
  writeProRelationships,
  type ProRelationshipPerspective,
  type ProRelationshipRecord,
} from "@/lib/pro-relationships";
import { maxAccountLinksForTier, normalizeManagerSkuTier } from "@/lib/manager-access";
import Link from "next/link";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";

function propertyChoices(userId: string): { id: string; label: string }[] {
  const live = readExtraListingsForUser(userId);
  const pend = readPendingManagerPropertiesForUser(userId);
  const out: { id: string; label: string }[] = [];
  for (const p of live) {
    out.push({ id: p.id, label: `${p.buildingName} · ${p.unitLabel || "Unit"}` });
  }
  for (const r of pend) {
    out.push({ id: r.id, label: `${r.buildingName} · ${r.unitLabel} (pending)` });
  }
  return out;
}

export function ProAccountLinksPanel({
  mode,
  userId,
}: {
  mode: "owner" | "manager";
  userId: string;
}) {
  const { showToast } = useAppUi();
  const planBase = usePaidPortalBasePath();
  const perspective: ProRelationshipPerspective =
    mode === "owner" ? "owner_linked_manager" : "manager_linked_owner";

  const [rows, setRows] = useState<ProRelationshipRecord[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const on = () => refresh();
    window.addEventListener("axis-pro-relationships", on);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => {
      window.removeEventListener("axis-pro-relationships", on);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
    };
  }, [refresh]);

  useEffect(() => {
    setRows(readProRelationships(userId).filter((r) => r.perspective === perspective));
  }, [userId, perspective, tick]);

  const propertyOptions = useMemo(() => propertyChoices(userId), [userId, tick]);

  const [axisInput, setAxisInput] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [draftAxisId, setDraftAxisId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftUserId, setDraftUserId] = useState<string | null>(null);

  const [selectedProps, setSelectedProps] = useState<Record<string, boolean>>({});
  const [payoutDraft, setPayoutDraft] = useState(15);
  const [skuTier, setSkuTier] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/manager/subscription", { credentials: "include" });
        const body = (await res.json()) as { tier?: string | null; isFree?: boolean };
        if (!res.ok || cancelled) return;
        if (body.isFree) {
          setSkuTier("free");
          return;
        }
        const t = body.tier?.trim() ?? null;
        setSkuTier(normalizeManagerSkuTier(t) ?? t);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const linkCap = maxAccountLinksForTier(skuTier);
  const atLinkCap = linkCap != null && rows.length >= linkCap;

  const lookup = async () => {
    const raw = axisInput.trim();
    if (!raw) {
      showToast(`Enter an ${AXIS_ID_LABEL}.`);
      return;
    }
    setLookupBusy(true);
    try {
      const res = await fetch(`/api/pro/lookup-axis-id?axisId=${encodeURIComponent(raw)}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        displayName?: string;
        userId?: string;
        role?: string;
      };
      if (!res.ok || !body.ok) {
        showToast(body.error ?? "Lookup failed.");
        setDraftAxisId(null);
        return;
      }
      const wrongRole =
        mode === "owner" ? body.role !== "manager" : body.role !== "owner";
      if (wrongRole) {
        showToast(
          mode === "owner"
            ? "On this tab, link a manager workspace by entering their Axis ID."
            : "On this tab, link an owner workspace by entering their Axis ID.",
        );
        setDraftAxisId(null);
        return;
      }
      setDraftAxisId(raw);
      setDraftName(body.displayName ?? raw);
      setDraftUserId(body.userId ?? null);
      showToast("Account verified — choose properties and payout, then save.");
    } catch {
      showToast("Network error.");
    } finally {
      setLookupBusy(false);
    }
  };

  const toggleProp = (id: string) => {
    setSelectedProps((s) => ({ ...s, [id]: !s[id] }));
  };

  const saveNewLink = () => {
    if (linkCap != null && rows.length >= linkCap) {
      showToast(
        `Your plan allows up to ${linkCap} linked ${mode === "owner" ? "manager" : "owner"} account${linkCap === 1 ? "" : "s"} on this tab.`,
      );
      return;
    }
    if (!draftAxisId || !draftUserId) {
      showToast(`Verify an ${AXIS_ID_LABEL} first.`);
      return;
    }
    const ids = Object.entries(selectedProps)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) {
      showToast("Select at least one property for this link.");
      return;
    }
    const all = readProRelationships(userId);
    const dupe = all.some((r) => r.linkedAxisId === draftAxisId && r.perspective === perspective);
    if (dupe) {
      showToast("You already have a link with this account.");
      return;
    }
    const row: ProRelationshipRecord = {
      id: generateRelationshipId(),
      linkedAxisId: draftAxisId,
      linkedDisplayName: draftName ?? draftAxisId,
      perspective,
      payoutPercentForManager: Math.min(100, Math.max(0, Math.round(payoutDraft * 10) / 10)),
      assignedPropertyIds: ids,
      createdAt: new Date().toISOString(),
    };
    writeProRelationships(userId, [...all, row]);
    setAxisInput("");
    setDraftAxisId(null);
    setDraftName(null);
    setDraftUserId(null);
    setSelectedProps({});
    setPayoutDraft(15);
    refresh();
    showToast("Link saved.");
  };

  const updatePayout = (id: string, pct: number) => {
    const all = readProRelationships(userId);
    const next = all.map((r) =>
      r.id === id ? { ...r, payoutPercentForManager: Math.min(100, Math.max(0, pct)) } : r,
    );
    writeProRelationships(userId, next);
    refresh();
  };

  const toggleAssignedProp = (relId: string, propId: string) => {
    const all = readProRelationships(userId);
    const next = all.map((r) => {
      if (r.id !== relId) return r;
      const set = new Set(r.assignedPropertyIds);
      if (set.has(propId)) set.delete(propId);
      else set.add(propId);
      return { ...r, assignedPropertyIds: [...set] };
    });
    writeProRelationships(userId, next);
    refresh();
  };

  const removeLink = (id: string) => {
    const all = readProRelationships(userId).filter((r) => r.id !== id);
    writeProRelationships(userId, all);
    refresh();
    showToast("Link removed.");
  };

  const title = mode === "owner" ? "Link a manager to your portfolio" : "Link an owner account";

  return (
    <ManagerPortalPageShell title="Account links">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            {mode === "owner" ? "Owner perspective" : "Manager perspective"}
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Enter another workspace&apos;s <span className="font-semibold text-slate-800">{AXIS_ID_LABEL}</span>. We confirm it&apos;s a valid manager or owner
            account, then you choose which properties belong to this relationship and what percentage the manager receives on those properties.
          </p>
          {linkCap != null ? (
            <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
              Your plan allows up to <span className="font-semibold text-slate-900">{linkCap}</span>{" "}
              {mode === "owner" ? "manager" : "owner"} link{linkCap === 1 ? "" : "s"} on this tab ({rows.length}/{linkCap} used).{" "}
              <Link href={`${planBase}/plan`} className="font-semibold text-primary underline-offset-2 hover:underline">
                Upgrade
              </Link>{" "}
              for higher caps.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">New link</p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="block flex-1 text-xs font-semibold text-slate-600">
              {AXIS_ID_LABEL}
              <input
                type="text"
                value={axisInput}
                onChange={(e) => setAxisInput(e.target.value)}
                placeholder="e.g. axis-mgr-abc123"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <Button
              type="button"
              className="rounded-full px-6"
              disabled={lookupBusy || atLinkCap}
              onClick={() => void lookup()}
              title={atLinkCap ? "Remove a link or upgrade your plan to add another." : undefined}
            >
              {lookupBusy ? "Checking…" : "Verify account"}
            </Button>
          </div>

          {atLinkCap ? (
            <p className="mt-3 text-xs text-rose-700">
              Link limit reached for this tab. Remove a link below or upgrade on{" "}
              <Link href={`${planBase}/plan`} className="font-semibold underline">
                Plan
              </Link>
              .
            </p>
          ) : null}

          {draftAxisId ? (
            <div className="mt-6 space-y-5 border-t border-slate-100 pt-6">
              <p className="text-sm text-slate-700">
                Verified <span className="font-semibold text-slate-900">{draftName}</span>{" "}
                <span className="font-mono text-xs text-slate-500">({draftAxisId})</span>
              </p>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned properties</p>
                <p className="mt-1 text-xs text-slate-500">Only checked properties are included in this relationship.</p>
                <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
                  {propertyOptions.length === 0 ? (
                    <li className="text-sm text-slate-500">No properties yet — add listings under Properties first.</li>
                  ) : (
                    propertyOptions.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedProps[p.id])}
                            onChange={() => toggleProp(p.id)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary"
                          />
                          <span className="text-sm text-slate-800">{p.label}</span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manager payout share</p>
                  <span className="text-sm font-bold tabular-nums text-primary">{payoutDraft}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={payoutDraft}
                  onChange={(e) => setPayoutDraft(Number(e.target.value))}
                  className="mt-2 w-full accent-primary"
                />
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  On the selected properties, the manager receives <span className="font-semibold text-slate-700">{payoutDraft}%</span> of the
                  relevant collections (after Axis platform fees). You can edit this later.
                </p>
              </div>

              <Button type="button" className="rounded-full" onClick={saveNewLink}>
                Save link
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-900">Active links</p>
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
              No links yet — add one above.
            </p>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{r.linkedDisplayName ?? r.linkedAxisId}</p>
                    <p className="font-mono text-xs text-slate-500">{r.linkedAxisId}</p>
                  </div>
                  <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => removeLink(r.id)}>
                    Remove
                  </Button>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500">Payout to manager</p>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.5}
                      value={r.payoutPercentForManager}
                      onChange={(e) => updatePayout(r.id, Number(e.target.value))}
                      className="h-2 w-full max-w-xs accent-primary"
                    />
                    <span className="text-lg font-bold tabular-nums text-primary">{r.payoutPercentForManager}%</span>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500">Properties in this link</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {propertyOptions.map((p) => {
                      const on = r.assignedPropertyIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleAssignedProp(r.id, p.id)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                            on
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}

/** Load session user id on client and render panel (server passes mode only). */
export function ProAccountLinksPanelLoader({ mode }: { mode: "owner" | "manager" }) {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled && user?.id) setUserId(user.id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!userId) {
    return (
      <ManagerPortalPageShell title="Account links">
        <p className="text-sm text-slate-500">Loading…</p>
      </ManagerPortalPageShell>
    );
  }

  return <ProAccountLinksPanel mode={mode} userId={userId} />;
}
