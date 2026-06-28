"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell, MANAGER_TABLE_TH, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
  PortalDataTableEmpty,
} from "@/components/portal/portal-data-table";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { AccountLinkInviteDto } from "@/lib/account-links";
import {
  CO_MANAGER_PERMISSION_OPTIONS,
  EMPTY_CO_MANAGER_PERMISSIONS,
  normalizeCoManagerPermissions,
  normalizePropertyCoManagerPermissions,
  permissionsForProperty,
  summarizePropertyCoManagerPermissions,
  type CoManagerPermissions,
  type PropertyCoManagerPermissions,
} from "@/lib/co-manager-permissions";
import {
  PROPERTY_PIPELINE_EVENT,
  readPendingManagerPropertiesForUser,
  readExtraListingsForUser,
  readAllExtraListings,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import {
  AXIS_ID_LABEL,
  generateRelationshipId,
  proRelationshipRowsFromInvites,
  readProRelationships,
  writeProRelationships,
  syncProRelationshipsFromServer,
  type ProRelationshipRecord,
} from "@/lib/pro-relationships";
import { maxAccountLinksForTier, normalizeManagerSkuTier } from "@/lib/manager-access";
import { BADGE_SUCCESS_CLASS } from "@/lib/ui-styles";
import Link from "next/link";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";

type InviteDraft = {
  assignedPropertyIds: string[];
  propertyCoManagerPermissions: PropertyCoManagerPermissions;
};

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

function resolvePropertyLabel(id: string, fallback: string): string {
  const all = readAllExtraListings();
  const found = all.find((p) => p.id === id);
  if (!found) return fallback || id;
  return [found.buildingName, found.unitLabel || found.address].filter(Boolean).join(" · ").trim() || id;
}

function CoManagerPermissionsEditor({
  value,
  onChange,
  disabled,
}: {
  value: CoManagerPermissions;
  onChange: (next: CoManagerPermissions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CO_MANAGER_PERMISSION_OPTIONS.map(({ id, label }) => (
        <label
          key={id}
          className={`flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm ${disabled ? "opacity-60" : "cursor-pointer"}`}
        >
          <input
            type="checkbox"
            disabled={disabled}
            checked={value[id] === true}
            onChange={(e) => {
              const next = { ...value };
              if (e.target.checked) next[id] = true;
              else delete next[id];
              onChange(next);
            }}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary"
          />
          <span className="font-medium text-foreground">{label}</span>
        </label>
      ))}
    </div>
  );
}

function inviteDraftFromRemote(inv: AccountLinkInviteDto): InviteDraft {
  return {
    assignedPropertyIds: [...inv.assignedPropertyIds],
    propertyCoManagerPermissions: normalizePropertyCoManagerPermissions(
      inv.propertyCoManagerPermissions ?? inv.coManagerPermissions,
      inv.assignedPropertyIds,
    ),
  };
}

export function ProAccountLinksPanel({ userId }: { userId: string }) {
  const { showToast } = useAppUi();
  const planBase = usePaidPortalBasePath();

  const [localTick, setLocalTick] = useState(0);
  const refreshLocal = useCallback(() => setLocalTick((n) => n + 1), []);

  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [useRemote, setUseRemote] = useState(false);
  const [remoteInvites, setRemoteInvites] = useState<AccountLinkInviteDto[]>([]);
  const [inviteDrafts, setInviteDrafts] = useState<Record<string, InviteDraft>>({});
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [expandedPropertyId, setExpandedPropertyId] = useState<string | null>(null);

  const [transferPropertyId, setTransferPropertyId] = useState<string | null>(null);
  const [transferCoManagerUserId, setTransferCoManagerUserId] = useState<string | null>(null);
  const [transferPermissions, setTransferPermissions] = useState<CoManagerPermissions>(EMPTY_CO_MANAGER_PERMISSIONS);
  const [transferBusy, setTransferBusy] = useState(false);

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
      const invites = Array.isArray(data.invites) ? data.invites : [];
      setRemoteInvites(invites);
      setInviteDrafts((prev) => {
        const next = { ...prev };
        for (const inv of invites.filter((i) => i.status === "accepted")) {
          if (!saveTimersRef.current[inv.id]) {
            next[inv.id] = inviteDraftFromRemote(inv);
          }
        }
        return next;
      });
    } catch {
      setUseRemote(false);
      setRemoteInvites([]);
    } finally {
      setRemoteLoaded(true);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void loadRemoteInvites(), 0);
    return () => window.clearTimeout(id);
  }, [loadRemoteInvites]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/portal/purge-orphaned-co-manager-links", {
      method: "POST",
      credentials: "include",
    })
      .then(() => syncProRelationshipsFromServer(userId))
      .then(() => loadRemoteInvites())
      .then(() => {
        if (!cancelled) refreshLocal();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, loadRemoteInvites, refreshLocal]);

  useEffect(() => {
    let cancelled = false;
    void syncPropertyPipelineFromServer().then(() => {
      if (!cancelled) refreshLocal();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshLocal]);

  useEffect(() => {
    const on = () => refreshLocal();
    window.addEventListener("axis-pro-relationships", on);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => {
      window.removeEventListener("axis-pro-relationships", on);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
    };
  }, [refreshLocal]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(saveTimersRef.current)) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const localRows = useMemo(() => {
    void localTick;
    return readProRelationships(userId);
  }, [userId, localTick]);

  const activeRemote = remoteInvites.filter((i) => i.status === "accepted");
  const incomingPending = remoteInvites.filter((i) => i.status === "pending" && i.direction === "incoming");
  const outgoingPending = remoteInvites.filter((i) => i.status === "pending" && i.direction === "outgoing");

  const propertyOptions = useMemo(() => {
    void localTick;
    return propertyChoices(userId);
  }, [userId, localTick]);

  const ownedProperties = useMemo(() => {
    void localTick;
    return readExtraListingsForUser(userId).map((p) => ({
      id: p.id,
      label: `${p.buildingName} · ${p.unitLabel || "Unit"}`,
    }));
  }, [userId, localTick]);

  const [axisInput, setAxisInput] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [draftAxisId, setDraftAxisId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftUserId, setDraftUserId] = useState<string | null>(null);
  const [inviteeAtCap, setInviteeAtCap] = useState(false);

  const [selectedProps, setSelectedProps] = useState<Record<string, boolean>>({});
  const [propertyPermissionsDraft, setPropertyPermissionsDraft] = useState<PropertyCoManagerPermissions>({});
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
  const participantUsedCount = remoteInvites.filter((i) => i.status === "pending" || i.status === "accepted").length;
  const atLinkCap = linkCap != null && (useRemote ? participantUsedCount >= linkCap : localRows.length >= linkCap);
  const linksUsed = useRemote ? participantUsedCount : localRows.length;

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
      setDraftAxisId(raw);
      setDraftName(body.displayName ?? raw);
      setDraftUserId(body.userId ?? null);
      showToast("Account verified — assign properties, then send invite.");
    } catch {
      showToast("Network error.");
    } finally {
      setLookupBusy(false);
    }
  };

  const toggleProp = (id: string) => {
    setSelectedProps((s) => {
      const next = { ...s, [id]: !s[id] };
      if (next[id]) {
        setPropertyPermissionsDraft((perms) => ({
          ...perms,
          [id]: perms[id] ?? { ...EMPTY_CO_MANAGER_PERMISSIONS },
        }));
      }
      return next;
    });
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

    const payout = 15;
    const propertyCoManagerPermissions = normalizePropertyCoManagerPermissions(propertyPermissionsDraft, ids);

    if (useRemote && remoteLoaded) {
      try {
        const res = await fetch("/api/pro/account-links", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inviteeAxisId: draftAxisId,
            tabKind: "manager",
            assignedPropertyIds: ids,
            payoutPercentForManager: payout,
            propertyCoManagerPermissions,
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
        setPropertyPermissionsDraft({});
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
    const flatPerms = ids.length === 1 ? propertyCoManagerPermissions[ids[0]] : undefined;
    const row: ProRelationshipRecord = {
      id: generateRelationshipId(),
      linkedAxisId: draftAxisId,
      linkedDisplayName: draftName ?? draftAxisId,
      perspective: "manager_tab",
      payoutPercentForManager: payout,
      assignedPropertyIds: ids,
      coManagerPermissions: flatPerms,
      propertyCoManagerPermissions,
      createdAt: new Date().toISOString(),
    };
    writeProRelationships(userId, [...all, row]);
    setAxisInput("");
    setDraftAxisId(null);
    setDraftName(null);
    setDraftUserId(null);
    setSelectedProps({});
    setPropertyPermissionsDraft({});
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
      const data = (await res.json()) as { error?: string; invite?: AccountLinkInviteDto };
      if (!res.ok) {
        showToast(data.error ?? "Request failed.");
        await loadRemoteInvites();
        return false;
      }
      if (data.invite) {
        setInviteDrafts((prev) => ({ ...prev, [id]: inviteDraftFromRemote(data.invite!) }));
      }
      await loadRemoteInvites();
      if (okToast) showToast(okToast);
      return true;
    } catch {
      showToast("Network error.");
      await loadRemoteInvites();
      return false;
    }
  };

  const scheduleInviteSave = useCallback(
    (inviteId: string, draft: InviteDraft, partial?: { propertyId: string; permissions: CoManagerPermissions }) => {
      setInviteDrafts((d) => ({ ...d, [inviteId]: draft }));
      if (saveTimersRef.current[inviteId]) {
        clearTimeout(saveTimersRef.current[inviteId]);
      }
      saveTimersRef.current[inviteId] = setTimeout(() => {
        delete saveTimersRef.current[inviteId];
        if (partial) {
          void patchInvite(inviteId, {
            propertyId: partial.propertyId,
            permissions: normalizeCoManagerPermissions(partial.permissions),
          });
        } else {
          void patchInvite(inviteId, {
            assignedPropertyIds: draft.assignedPropertyIds,
            propertyCoManagerPermissions: draft.propertyCoManagerPermissions,
          });
        }
      }, 300);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const getInviteDraft = (inv: AccountLinkInviteDto): InviteDraft =>
    inviteDrafts[inv.id] ?? inviteDraftFromRemote(inv);

  const toggleAssignedProp = (inv: AccountLinkInviteDto, propId: string) => {
    const draft = getInviteDraft(inv);
    const set = new Set(draft.assignedPropertyIds);
    if (set.has(propId)) set.delete(propId);
    else set.add(propId);
    const nextAssigned = [...set];
    if (nextAssigned.length === 0) {
      showToast("Keep at least one property in this link.");
      return;
    }
    const nextPerms = normalizePropertyCoManagerPermissions(draft.propertyCoManagerPermissions, nextAssigned);
    if (useRemote && remoteLoaded) {
      scheduleInviteSave(inv.id, { assignedPropertyIds: nextAssigned, propertyCoManagerPermissions: nextPerms });
      return;
    }
    const all = readProRelationships(userId);
    const next = all.map((r) => {
      if (r.id !== inv.id) return r;
      return { ...r, assignedPropertyIds: nextAssigned, propertyCoManagerPermissions: nextPerms };
    });
    writeProRelationships(userId, next);
    refreshLocal();
  };

  const updatePropertyPermissions = (inv: AccountLinkInviteDto, propertyId: string, permissions: CoManagerPermissions) => {
    const draft = getInviteDraft(inv);
    const normalized = normalizeCoManagerPermissions(permissions);
    const next: InviteDraft = {
      assignedPropertyIds: draft.assignedPropertyIds,
      propertyCoManagerPermissions: {
        ...draft.propertyCoManagerPermissions,
        [propertyId]: normalized,
      },
    };
    if (useRemote && remoteLoaded) {
      scheduleInviteSave(inv.id, next, { propertyId, permissions: normalized });
      return;
    }
    const all = readProRelationships(userId);
    const updated = all.map((r) =>
      r.id === inv.id
        ? {
            ...r,
            propertyCoManagerPermissions: next.propertyCoManagerPermissions,
            coManagerPermissions: normalized,
          }
        : r,
    );
    writeProRelationships(userId, updated);
    refreshLocal();
  };

  const removeLink = async (id: string) => {
    if (useRemote && remoteLoaded) {
      await patchInvite(id, { action: "revoke" }, "Link removed.");
      writeProRelationships(userId, readProRelationships(userId).filter((row) => row.id !== id));
      setInviteDrafts((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      await loadRemoteInvites();
      refreshLocal();
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

  const coManagersForProperty = useCallback(
    (propertyId: string) =>
      activeRemote.filter(
        (inv) => inv.direction === "outgoing" && inv.assignedPropertyIds.includes(propertyId),
      ),
    [activeRemote],
  );

  const submitTransfer = async () => {
    if (!transferPropertyId || !transferCoManagerUserId) return;
    setTransferBusy(true);
    try {
      const res = await fetch(
        `/api/pro/properties/${encodeURIComponent(transferPropertyId)}/transfer-ownership`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newManagerUserId: transferCoManagerUserId,
            formerOwnerPermissions: transferPermissions,
          }),
        },
      );
      const data = (await res.json()) as { error?: string; propertyLabel?: string };
      if (!res.ok) {
        showToast(data.error ?? "Transfer failed.");
        return;
      }
      showToast(`${data.propertyLabel ?? "Property"} ownership transferred.`);
      setTransferPropertyId(null);
      setTransferCoManagerUserId(null);
      setTransferPermissions(EMPTY_CO_MANAGER_PERMISSIONS);
      await loadRemoteInvites();
      await syncPropertyPipelineFromServer({ force: true });
      refreshLocal();
    } catch {
      showToast("Network error.");
    } finally {
      setTransferBusy(false);
    }
  };

  useEffect(() => {
    if (!useRemote || activeRemote.length === 0) {
      if (useRemote && remoteLoaded) {
        writeProRelationships(userId, []);
      }
      return;
    }
    writeProRelationships(userId, proRelationshipRowsFromInvites(activeRemote));
  }, [activeRemote, remoteLoaded, useRemote, userId]);

  const activeCards = useRemote ? activeRemote : localRows;
  const selectedPropIds = Object.entries(selectedProps)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <ManagerPortalPageShell title="Co-managers">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Account links</p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground">Link a co-manager</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            You have full access to your property portal. Link another manager by{" "}
            <span className="font-semibold text-foreground">{AXIS_ID_LABEL}</span> and choose per-property
            permissions for each assigned unit.
          </p>
          {linkCap != null ? (
            <div
              className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                atLinkCap ? "portal-banner-danger" : "border-border bg-accent/30"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={`font-semibold tabular-nums ${atLinkCap ? "text-[var(--status-overdue-fg)]" : "text-foreground"}`}
                >
                  {linksUsed}/{linkCap}
                </span>
                <span className="text-muted">links in use</span>
                {tierShort ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${atLinkCap ? "bg-card/80 text-[var(--status-overdue-fg)]" : "bg-card text-muted"}`}
                  >
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

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm [html[data-theme=dark]_&]:portal-surface-muted">
          <p className="text-sm font-semibold text-foreground">New link</p>
          <div className="mt-4 flex gap-3 sm:items-end">
            <label className="block min-w-0 flex-1 text-xs font-semibold text-muted">
              {AXIS_ID_LABEL}
              <input
                type="text"
                value={axisInput}
                onChange={(e) => setAxisInput(e.target.value)}
                placeholder="e.g. AXIS-1A2B3C4D"
                className="mt-1 h-10 w-full rounded-full border border-border bg-card px-4 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <Button
              type="button"
              className={PORTAL_HEADER_ACTION_BTN}
              disabled={lookupBusy || atLinkCap}
              onClick={() => void lookup()}
              title={atLinkCap ? "Remove a link or upgrade your plan to add another." : undefined}
            >
              {lookupBusy ? "Checking…" : "Link account"}
            </Button>
          </div>

          {atLinkCap ? (
            <p className="mt-3 text-xs font-medium text-[var(--status-overdue-fg)]">At limit — remove a link or change plan.</p>
          ) : null}
          {inviteeAtCap ? (
            <p className="mt-3 text-xs font-medium text-[var(--status-overdue-fg)]">
              That account is already at its link limit and cannot accept new links.
            </p>
          ) : null}

          {draftAxisId ? (
            <div className="mt-6 space-y-5 border-t border-border pt-6">
              <p className="text-sm text-muted">
                Verified <span className="font-semibold text-foreground">{draftName}</span>{" "}
                <span className="font-mono text-xs text-muted">({draftAxisId})</span>
              </p>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Assigned properties</p>
                <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border bg-card p-3">
                  {propertyOptions.length === 0 ? (
                    <li className="text-sm text-muted">No properties yet — add listings under Properties first.</li>
                  ) : (
                    propertyOptions.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-accent/30">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedProps[p.id])}
                            onChange={() => toggleProp(p.id)}
                            className="mt-1 h-4 w-4 rounded border-border text-primary"
                          />
                          <span className="text-sm text-foreground">{p.label}</span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {selectedPropIds.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Per-property permissions</p>
                  {selectedPropIds.map((pid) => (
                    <div key={pid} className="rounded-xl border border-border bg-card p-4">
                      <p className="text-sm font-semibold text-foreground">{resolvePropertyLabel(pid, pid)}</p>
                      <div className="mt-3">
                        <CoManagerPermissionsEditor
                          value={normalizeCoManagerPermissions(propertyPermissionsDraft[pid])}
                          onChange={(next) =>
                            setPropertyPermissionsDraft((prev) => ({ ...prev, [pid]: next }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <Button type="button" className="rounded-full" onClick={() => void saveNewLink()}>
                {useRemote ? "Send invite" : "Save link (local)"}
              </Button>
            </div>
          ) : null}
        </div>

        {useRemote && incomingPending.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Pending approvals (incoming)</p>
            <ul className="space-y-3">
              {incomingPending.map((inv) => (
                <li key={inv.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{inv.linkedDisplayName ?? inv.linkedAxisId}</p>
                      <p className="font-mono text-xs text-muted">{inv.linkedAxisId}</p>
                      <p className="mt-2 text-xs text-muted">
                        {inv.assignedPropertyIds.length} propert{inv.assignedPropertyIds.length === 1 ? "y" : "ies"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" className="rounded-full text-xs" onClick={() => void respondInvite(inv.id, "accept")}>
                        Approve
                      </Button>
                      <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => void respondInvite(inv.id, "reject")}>
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
            <p className="text-sm font-semibold text-foreground">Waiting on them</p>
            <ul className="space-y-3">
              {outgoingPending.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-accent/30 px-5 py-4 text-sm text-muted"
                >
                  <div>
                    <span className="font-semibold text-foreground">{inv.linkedDisplayName ?? inv.linkedAxisId}</span>
                    <span className="ml-2 font-mono text-xs text-muted">{inv.linkedAxisId}</span>
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
          <p className="text-sm font-semibold text-foreground">Active links</p>
          {activeCards.length === 0 ? (
            <PortalDataTableEmpty message="No active links yet — send an invite above or approve one in Pending." />
          ) : useRemote ? (
            <div className={PORTAL_DATA_TABLE_WRAP}>
              <div className={PORTAL_DATA_TABLE_SCROLL}>
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className={PORTAL_TABLE_HEAD_ROW}>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Co-manager</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Properties</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Access</th>
                      <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRemote.map((inv) => {
                      const draft = getInviteDraft(inv);
                      const accessSummary = summarizePropertyCoManagerPermissions(draft.propertyCoManagerPermissions);
                      return (
                        <Fragment key={inv.id}>
                          <tr className={PORTAL_TABLE_TR}>
                            <td className={PORTAL_TABLE_TD}>
                              <p className="font-medium text-foreground">{inv.linkedDisplayName ?? inv.linkedAxisId}</p>
                              <p className="mt-0.5 font-mono text-xs text-muted">{inv.linkedAxisId}</p>
                            </td>
                            <td className={PORTAL_TABLE_TD}>
                              <span className="tabular-nums">{draft.assignedPropertyIds.length}</span>
                              <span className="text-muted"> assigned</span>
                            </td>
                            <td className={`${PORTAL_TABLE_TD} max-w-[220px]`}>
                              <p className="line-clamp-2 text-xs text-muted">{accessSummary}</p>
                            </td>
                            <td className={`${PORTAL_TABLE_TD} text-right`}>
                              <div className="inline-flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                                  onClick={() => setExpandedLinkId((cur) => (cur === inv.id ? null : inv.id))}
                                >
                                  {expandedLinkId === inv.id ? "Hide" : "Details"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                                  onClick={() => void removeLink(inv.id)}
                                >
                                  Remove
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expandedLinkId === inv.id ? (
                            <tr className={PORTAL_TABLE_DETAIL_ROW}>
                              <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
                                <div className="mx-auto max-w-4xl space-y-5">
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                                      Properties in this link
                                    </p>
                                    {inv.direction === "incoming" ? (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {draft.assignedPropertyIds.map((pid) => (
                                          <span
                                            key={pid}
                                            className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                                          >
                                            {resolvePropertyLabel(pid, pid)}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <ul className="mt-2 space-y-2 rounded-xl border border-border bg-accent/30 p-3">
                                        {propertyOptions.map((p) => {
                                          const on = draft.assignedPropertyIds.includes(p.id);
                                          return (
                                            <li key={p.id}>
                                              <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-card">
                                                <input
                                                  type="checkbox"
                                                  checked={on}
                                                  onChange={() => toggleAssignedProp(inv, p.id)}
                                                  className="mt-1 h-4 w-4 rounded border-border text-primary"
                                                />
                                                <span className="text-sm text-foreground">{p.label}</span>
                                              </label>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </div>

                                  {draft.assignedPropertyIds.map((pid) => (
                                    <div key={pid} className="rounded-xl border border-border bg-card p-4">
                                      <p className="text-sm font-semibold text-foreground">{resolvePropertyLabel(pid, pid)}</p>
                                      {inv.direction !== "incoming" ? (
                                        <div className="mt-3">
                                          <CoManagerPermissionsEditor
                                            value={permissionsForProperty(draft.propertyCoManagerPermissions, pid)}
                                            onChange={(next) => updatePropertyPermissions(inv, pid, next)}
                                          />
                                        </div>
                                      ) : (
                                        <p className="mt-2 text-xs text-muted">
                                          {summarizePropertyCoManagerPermissions({
                                            [pid]: permissionsForProperty(draft.propertyCoManagerPermissions, pid),
                                          })}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            localRows.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{r.linkedDisplayName ?? r.linkedAxisId}</p>
                    <p className="font-mono text-xs text-muted">{r.linkedAxisId}</p>
                  </div>
                  <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => void removeLink(r.id)}>
                    Remove
                  </Button>
                </div>
                {r.assignedPropertyIds.map((pid) => (
                  <div key={pid} className="mt-4 rounded-xl border border-border bg-accent/30 p-4">
                    <p className="text-sm font-semibold text-foreground">{resolvePropertyLabel(pid, pid)}</p>
                    <div className="mt-2">
                      <CoManagerPermissionsEditor
                        value={normalizeCoManagerPermissions(r.propertyCoManagerPermissions?.[pid] ?? r.coManagerPermissions)}
                        onChange={(next) => {
                          const all = readProRelationships(userId);
                          const updated = all.map((row) =>
                            row.id === r.id
                              ? {
                                  ...row,
                                  propertyCoManagerPermissions: {
                                    ...(row.propertyCoManagerPermissions ?? {}),
                                    [pid]: next,
                                  },
                                }
                              : row,
                          );
                          writeProRelationships(userId, updated);
                          refreshLocal();
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {ownedProperties.length > 0 ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Property team</p>
              <p className="mt-1 text-xs text-muted">
                Main manager and co-managers per property. Transfer ownership to promote a linked co-manager.
              </p>
            </div>
            <div className={PORTAL_DATA_TABLE_WRAP}>
              <div className={PORTAL_DATA_TABLE_SCROLL}>
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className={PORTAL_TABLE_HEAD_ROW}>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Main manager</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Co-managers</th>
                      <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownedProperties.map((prop) => {
                      const coManagers = coManagersForProperty(prop.id);
                      return (
                        <Fragment key={prop.id}>
                          <tr className={PORTAL_TABLE_TR}>
                            <td className={PORTAL_TABLE_TD}>
                              <p className="font-medium text-foreground">{prop.label}</p>
                            </td>
                            <td className={PORTAL_TABLE_TD}>
                              <span className={`${BADGE_SUCCESS_CLASS} px-2.5 py-0.5`}>
                                You
                              </span>
                            </td>
                            <td className={PORTAL_TABLE_TD}>
                              {coManagers.length === 0 ? (
                                <span className="text-xs text-muted">None linked</span>
                              ) : (
                                <span className="text-xs text-foreground">
                                  {coManagers.map((c) => c.linkedDisplayName ?? c.linkedAxisId).join(", ")}
                                </span>
                              )}
                            </td>
                            <td className={`${PORTAL_TABLE_TD} text-right`}>
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                                onClick={() => setExpandedPropertyId((cur) => (cur === prop.id ? null : prop.id))}
                              >
                                {expandedPropertyId === prop.id ? "Hide" : "Details"}
                              </Button>
                            </td>
                          </tr>
                          {expandedPropertyId === prop.id ? (
                            <tr className={PORTAL_TABLE_DETAIL_ROW}>
                              <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
                                <div className="mx-auto max-w-3xl space-y-4">
                                  <div className="rounded-xl border border-border bg-card p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Main manager</p>
                                    <p className="mt-1 text-sm font-medium text-foreground">You (owner)</p>
                                  </div>
                                  {coManagers.length === 0 ? (
                                    <p className="text-sm text-muted">Link a co-manager above to build your property team.</p>
                                  ) : (
                                    coManagers.map((cm) => (
                                      <div key={cm.id} className="rounded-xl border border-border bg-accent/30 p-4">
                                        <p className="text-sm font-semibold text-foreground">
                                          {cm.linkedDisplayName ?? cm.linkedAxisId}
                                        </p>
                                        <p className="mt-1 text-xs text-muted">
                                          {summarizePropertyCoManagerPermissions({
                                            [prop.id]: permissionsForProperty(
                                              getInviteDraft(cm).propertyCoManagerPermissions,
                                              prop.id,
                                            ),
                                          })}
                                        </p>
                                      </div>
                                    ))
                                  )}
                                  {coManagers.length > 0 ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full text-xs"
                                      onClick={() => {
                                        setTransferPropertyId(prop.id);
                                        setTransferCoManagerUserId(coManagers[0]?.linkedUserId ?? null);
                                        setTransferPermissions(EMPTY_CO_MANAGER_PERMISSIONS);
                                      }}
                                    >
                                      Transfer ownership
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {transferPropertyId ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 [html[data-theme=dark]_&]:bg-black/65">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-lg">
              <p className="text-lg font-semibold text-foreground">Transfer ownership</p>
              <p className="mt-2 text-sm text-muted">
                Promote a co-manager to main manager of{" "}
                <span className="font-medium text-foreground">
                  {resolvePropertyLabel(transferPropertyId, transferPropertyId)}
                </span>
                . Choose the permissions you keep as co-manager.
              </p>

              <label className="mt-4 block text-xs font-semibold text-muted">
                New main manager
                <select
                  value={transferCoManagerUserId ?? ""}
                  onChange={(e) => setTransferCoManagerUserId(e.target.value || null)}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                >
                  {coManagersForProperty(transferPropertyId).map((cm) => (
                    <option key={cm.id} value={cm.linkedUserId}>
                      {cm.linkedDisplayName ?? cm.linkedAxisId}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your co-manager permissions</p>
                <div className="mt-2">
                  <CoManagerPermissionsEditor value={transferPermissions} onChange={setTransferPermissions} />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={transferBusy}
                  onClick={() => {
                    setTransferPropertyId(null);
                    setTransferCoManagerUserId(null);
                    setTransferPermissions(EMPTY_CO_MANAGER_PERMISSIONS);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" className="rounded-full" disabled={transferBusy} onClick={() => void submitTransfer()}>
                  {transferBusy ? "Transferring…" : "Confirm transfer"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ManagerPortalPageShell>
  );
}
