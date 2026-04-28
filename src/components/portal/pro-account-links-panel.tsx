"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AccountLinkInviteDto } from "@/lib/account-links";
import {
  PROPERTY_PIPELINE_EVENT,
  readPendingManagerPropertiesForUser,
  readExtraListingsForUser,
  readAllExtraListings,
} from "@/lib/demo-property-pipeline";
import {
  AXIS_ID_LABEL,
  generateRelationshipId,
  readProRelationships,
  writeProRelationships,
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

/** Resolve a property label from the global catalog (all managers' extra listings). */
function resolvePropertyLabel(id: string, fallback: string): string {
  const all = readAllExtraListings();
  const found = all.find((p) => p.id === id);
  if (!found) return fallback || id;
  return [found.buildingName, found.unitLabel || found.address].filter(Boolean).join(" · ").trim() || id;
}

export function ProAccountLinksPanel({
  userId,
}: {
  userId: string;
}) {
  const { showToast } = useAppUi();
  const planBase = usePaidPortalBasePath();

  const [localTick, setLocalTick] = useState(0);
  const refreshLocal = useCallback(() => setLocalTick((n) => n + 1), []);

  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [useRemote, setUseRemote] = useState(false);
  const [remoteInvites, setRemoteInvites] = useState<AccountLinkInviteDto[]>([]);

  const loadRemoteInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/pro/account-links", { credentials: "include" });
      const data = (await res.json()) as {
        invites?: AccountLinkInviteDto[];
        migrationRequired?: boolean;
        error?: string;
      };
      if (!res.ok || data.migrationRequired) {
        setUseRemote(false);
        setRemoteInvites([]);
        return;
      }
      setUseRemote(true);
      setRemoteInvites(Array.isArray(data.invites) ? data.invites : []);
    } catch {
      setUseRemote(false);
      setRemoteInvites([]);
    } finally {
      setRemoteLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadRemoteInvites();
  }, [loadRemoteInvites]);

  useEffect(() => {
    const on = () => refreshLocal();
    window.addEventListener("axis-pro-relationships", on);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => {
      window.removeEventListener("axis-pro-relationships", on);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
    };
  }, [refreshLocal]);

  const localRows = useMemo(() => readProRelationships(userId), [userId, localTick]);

  const activeRemote = remoteInvites.filter((i) => i.status === "accepted");
  const incomingPending = remoteInvites.filter((i) => i.status === "pending" && i.direction === "incoming");
  const outgoingPending = remoteInvites.filter((i) => i.status === "pending" && i.direction === "outgoing");

  const outgoingUsedCount = remoteInvites.filter(
    (i) => i.direction === "outgoing" && (i.status === "pending" || i.status === "accepted"),
  ).length;

  const propertyOptions = useMemo(() => propertyChoices(userId), [userId, localTick]);

  const [axisInput, setAxisInput] = useState("");
  const [selectedKind, setSelectedKind] = useState<"manager" | "owner">("manager");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [draftAxisId, setDraftAxisId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftUserId, setDraftUserId] = useState<string | null>(null);
  const [inviteeAtCap, setInviteeAtCap] = useState(false);

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
  const atLinkCap =
    linkCap != null &&
    (useRemote ? outgoingUsedCount >= linkCap : localRows.length >= linkCap);

  const linksUsed = useRemote ? outgoingUsedCount : localRows.length;

  const tierShort =
    skuTier === "free"
      ? "Free"
      : skuTier === "pro"
        ? "Pro"
        : skuTier === "business"
          ? "Business"
          : skuTier?.trim()
            ? skuTier
            : null;

  const lookup = async () => {
    const raw = axisInput.trim();
    if (!raw) {
      showToast(`Enter an ${AXIS_ID_LABEL}.`);
      return;
    }
    setLookupBusy(true);
    setInviteeAtCap(false);
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
      const lookedUpRole = String(body.role ?? "").toLowerCase();
      if (lookedUpRole && lookedUpRole !== selectedKind) {
        showToast("Choose the matching link role for that Axis ID.");
        setDraftAxisId(null);
        setDraftName(null);
        setDraftUserId(null);
        return;
      }

      setDraftAxisId(raw);
      setDraftName(body.displayName ?? raw);
      setDraftUserId(body.userId ?? null);
      showToast("Account verified — assign properties and payout, then send invite.");
    } catch {
      showToast("Network error.");
    } finally {
      setLookupBusy(false);
    }
  };

  const toggleProp = (id: string) => {
    setSelectedProps((s) => ({ ...s, [id]: !s[id] }));
  };

  const saveNewLink = async () => {
    if (linkCap != null && atLinkCap) {
      showToast(`${tierShort ?? "Your plan"}: ${linkCap} link${linkCap === 1 ? "" : "s"} max.`);
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
      showToast("Select at least one property for this invite.");
      return;
    }

    const payout = Math.min(100, Math.max(0, Math.round(payoutDraft * 10) / 10));

    if (useRemote && remoteLoaded) {
      try {
        const res = await fetch("/api/pro/account-links", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inviteeAxisId: draftAxisId,
            tabKind: selectedKind,
            assignedPropertyIds: ids,
            payoutPercentForManager: payout,
          }),
        });
        const data = (await res.json()) as { error?: string; migrationRequired?: boolean };
        if (!res.ok) {
          setInviteeAtCap(Boolean(data.error?.includes("Invitee needs to upgrade")));
          showToast(data.error ?? "Could not send invite.");
          return;
        }
        await loadRemoteInvites();
        setAxisInput("");
        setDraftAxisId(null);
        setDraftName(null);
        setDraftUserId(null);
        setSelectedProps({});
        setPayoutDraft(15);
        showToast("Invite sent — waiting for their approval.");
        return;
      } catch {
        showToast("Network error.");
        return;
      }
    }

    const all = readProRelationships(userId);
    const dupe = all.some((r) => r.linkedAxisId === draftAxisId);
    if (dupe) {
      showToast("You already have a link with this account.");
      return;
    }
    const row: ProRelationshipRecord = {
      id: generateRelationshipId(),
      linkedAxisId: draftAxisId,
      linkedDisplayName: draftName ?? draftAxisId,
      perspective: selectedKind === "owner" ? "owner_tab" : "manager_tab",
      payoutPercentForManager: payout,
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
    refreshLocal();
    showToast("Link saved locally (invite sync requires database migration).");
  };

  const patchInvite = async (
    id: string,
    payload: Record<string, unknown>,
    okToast?: string,
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/pro/account-links/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(data.error ?? "Request failed.");
        return false;
      }
      await loadRemoteInvites();
      if (okToast) showToast(okToast);
      return true;
    } catch {
      showToast("Network error.");
      return false;
    }
  };

  const updatePayout = async (id: string, pct: number) => {
    const v = Math.min(100, Math.max(0, pct));
    if (useRemote && remoteLoaded) {
      await patchInvite(id, { payoutPercentForManager: v });
      return;
    }
    const all = readProRelationships(userId);
    const next = all.map((r) => (r.id === id ? { ...r, payoutPercentForManager: v } : r));
    writeProRelationships(userId, next);
    refreshLocal();
  };

  const toggleAssignedProp = async (relId: string, propId: string) => {
    if (useRemote && remoteLoaded) {
      const inv = remoteInvites.find((i) => i.id === relId);
      if (!inv || inv.status !== "accepted") return;
      const set = new Set(inv.assignedPropertyIds);
      if (set.has(propId)) set.delete(propId);
      else set.add(propId);
      const next = [...set];
      if (next.length === 0) {
        showToast("Keep at least one property in this link.");
        return;
      }
      await patchInvite(relId, { assignedPropertyIds: next });
      return;
    }
    const all = readProRelationships(userId);
    const next = all.map((r) => {
      if (r.id !== relId) return r;
      const set = new Set(r.assignedPropertyIds);
      if (set.has(propId)) set.delete(propId);
      else set.add(propId);
      return { ...r, assignedPropertyIds: [...set] };
    });
    writeProRelationships(userId, next);
    refreshLocal();
  };

  const removeLink = async (id: string) => {
    if (useRemote && remoteLoaded) {
      await patchInvite(id, { action: "revoke" }, "Link removed.");
      return;
    }
    const all = readProRelationships(userId).filter((r) => r.id !== id);
    writeProRelationships(userId, all);
    refreshLocal();
    showToast("Link removed.");
  };

  const respondInvite = async (id: string, action: "accept" | "reject") => {
    await patchInvite(
      id,
      { action },
      action === "accept" ? "Invite accepted — link is active." : "Invite declined.",
    );
  };

  const cancelInvite = async (id: string) => {
    await patchInvite(id, { action: "cancel" }, "Invite withdrawn.");
  };

  // Sync accepted remote invites into this user's localStorage so collectAccessiblePropertyIds
  // picks up linked property IDs (enables Applications and Residents tabs to filter correctly).
  useEffect(() => {
    if (!useRemote || activeRemote.length === 0) return;
    const existing = readProRelationships(userId);
    const existingIds = new Set(existing.map((r) => r.id));
    let changed = false;
    const next = [...existing];
    for (const inv of activeRemote) {
      if (existingIds.has(inv.id)) continue;
      next.push({
        id: inv.id,
        linkedAxisId: inv.linkedAxisId,
        linkedDisplayName: inv.linkedDisplayName ?? undefined,
        perspective: inv.tabKind === "owner" ? "owner_tab" : "manager_tab",
        payoutPercentForManager: inv.payoutPercentForManager,
        assignedPropertyIds: inv.assignedPropertyIds,
        createdAt: inv.createdAt,
      });
      changed = true;
    }
    // Remove synced records that are no longer accepted.
    const activeIds = new Set(activeRemote.map((i) => i.id));
    const filtered = next.filter((r) => {
      if (activeRemote.some((i) => i.id === r.id)) return activeIds.has(r.id);
      return true;
    });
    if (changed || filtered.length !== next.length) {
      writeProRelationships(userId, filtered);
    }
  }, [activeRemote, useRemote, userId]);

  const activeCards = useRemote ? activeRemote : localRows;

  return (
    <ManagerPortalPageShell title="Account links">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            Account relationships
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Link another workspace</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Verify their <span className="font-semibold text-slate-800">{AXIS_ID_LABEL}</span>, then assign the properties and split amount for that relationship.
          </p>
          {!useRemote && remoteLoaded ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-900">
              Invites need the database migration — links stay in this browser only until then.
            </p>
          ) : null}
          {linkCap != null ? (
            <div
              className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                atLinkCap ? "border-rose-200 bg-rose-50/90" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={`font-semibold tabular-nums ${atLinkCap ? "text-rose-900" : "text-slate-900"}`}>{linksUsed}/{linkCap}</span>
                <span className="text-slate-500">links in use</span>
                {tierShort ? (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${atLinkCap ? "bg-white/80 text-rose-800" : "bg-white text-slate-600"}`}>
                    {tierShort}
                  </span>
                ) : null}
              </div>
              <Link href={`${planBase}/plan`} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
                Plan
              </Link>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">New invite</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-end">
            <label className="block text-xs font-semibold text-slate-600">
              Link role
              <select
                value={selectedKind}
                onChange={(e) => {
                  const next = e.target.value === "owner" ? "owner" : "manager";
                  setSelectedKind(next);
                  setDraftAxisId(null);
                  setDraftName(null);
                  setDraftUserId(null);
                  setSelectedProps({});
                  setInviteeAtCap(false);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <label className="block flex-1 text-xs font-semibold text-slate-600">
              {AXIS_ID_LABEL}
              <input
                type="text"
                value={axisInput}
                onChange={(e) => setAxisInput(e.target.value)}
                placeholder="e.g. AXIS-1A2B3C4D"
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
            <p className="mt-3 text-xs font-medium text-rose-700">At limit — remove a link or change plan.</p>
          ) : null}

          {inviteeAtCap ? (
            <p className="mt-3 text-xs font-medium text-rose-700">That account is already at its link limit and cannot accept new links.</p>
          ) : null}

          {draftAxisId ? (
            <div className="mt-6 space-y-5 border-t border-slate-100 pt-6">
              <p className="text-sm text-slate-700">
                Verified <span className="font-semibold text-slate-900">{draftName}</span>{" "}
                <span className="font-mono text-xs text-slate-500">({draftAxisId})</span>
              </p>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned properties</p>
                <p className="mt-1 text-xs text-slate-500">
                  Only checked properties are included. The linked workspace only has access to these units — not your other listings.
                </p>
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Split amount</p>
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
                  This is the split amount for this linked workspace. It applies to the selected properties, and you can change it later after the link is active.
                </p>
              </div>

              <Button type="button" className="rounded-full" onClick={() => void saveNewLink()}>
                {useRemote ? "Send invite" : "Save link (local)"}
              </Button>
            </div>
          ) : null}
        </div>

        {useRemote && incomingPending.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Pending approvals (incoming)</p>
            <ul className="space-y-3">
              {incomingPending.map((inv) => (
                <li
                  key={inv.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{inv.linkedDisplayName ?? inv.linkedAxisId}</p>
                      <p className="font-mono text-xs text-slate-500">{inv.linkedAxisId}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {inv.assignedPropertyIds.length} propert{inv.assignedPropertyIds.length === 1 ? "y" : "ies"} · {inv.payoutPercentForManager}% payout
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" className="rounded-full text-xs" onClick={() => void respondInvite(inv.id, "accept")}>
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full text-xs"
                        onClick={() => void respondInvite(inv.id, "reject")}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {useRemote && outgoingPending.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Waiting on them</p>
            <ul className="space-y-3">
              {outgoingPending.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-5 py-4 text-sm text-slate-700"
                >
                  <div>
                    <span className="font-semibold text-slate-900">{inv.linkedDisplayName ?? inv.linkedAxisId}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">{inv.linkedAxisId}</span>
                  </div>
                  <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => void cancelInvite(inv.id)}>
                    Withdraw invite
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-900">Active links</p>
          {activeCards.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
              No active links yet — send an invite above or approve one in Pending.
            </p>
          ) : useRemote ? (
            activeRemote.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{r.linkedDisplayName ?? r.linkedAxisId}</p>
                    <p className="font-mono text-xs text-slate-500">{r.linkedAxisId}</p>
                  </div>
                  <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => void removeLink(r.id)}>
                    Remove
                  </Button>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500">Split amount</p>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.5}
                      value={r.payoutPercentForManager}
                      onChange={(e) => void updatePayout(r.id, Number(e.target.value))}
                      className="h-2 w-full max-w-xs accent-primary"
                    />
                    <span className="text-lg font-bold tabular-nums text-primary">{r.payoutPercentForManager}%</span>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500">Properties in this link</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.assignedPropertyIds.length === 0 ? (
                      <span className="text-xs text-slate-400">No properties assigned</span>
                    ) : r.direction === "incoming" ? (
                      r.assignedPropertyIds.map((pid) => (
                        <span
                          key={pid}
                          className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                        >
                          {resolvePropertyLabel(pid, pid)}
                        </span>
                      ))
                    ) : (
                      propertyOptions.map((p) => {
                        const on = r.assignedPropertyIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => void toggleAssignedProp(r.id, p.id)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                              on
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            localRows.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{r.linkedDisplayName ?? r.linkedAxisId}</p>
                    <p className="font-mono text-xs text-slate-500">{r.linkedAxisId}</p>
                  </div>
                  <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => void removeLink(r.id)}>
                    Remove
                  </Button>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500">Split amount</p>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.5}
                      value={r.payoutPercentForManager}
                      onChange={(e) => void updatePayout(r.id, Number(e.target.value))}
                      className="h-2 w-full max-w-xs accent-primary"
                    />
                    <span className="text-lg font-bold tabular-nums text-primary">{r.payoutPercentForManager}%</span>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500">Properties in this link</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.assignedPropertyIds.length === 0 ? (
                      <span className="text-xs text-slate-400">No properties assigned</span>
                    ) : (
                      propertyOptions.map((p) => {
                        const on = r.assignedPropertyIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => void toggleAssignedProp(r.id, p.id)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                              on
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })
                    )}
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

/** Load session user id on client and render panel. */
export function ProAccountLinksPanelLoader() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
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

  return <ProAccountLinksPanel userId={userId} />;
}
