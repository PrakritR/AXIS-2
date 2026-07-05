"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  MANAGER_TABLE_TH,
  PORTAL_HEADER_ACTION_BTN,
  PORTAL_TOOLBAR_SELECT,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalDataTableEmpty,
  PortalMobileSummaryCard,
  createPortalRowExpandClick,
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

const CO_MANAGER_ROLE_BADGE =
  "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold border border-border bg-accent/40 text-foreground ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";

const LINKED_COUNT_TRIGGER =
  "inline-flex items-center gap-1 rounded-full text-xs font-semibold text-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 transition hover:text-primary";

const OWNER_ROLE_BADGE =
  "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";

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

function inviteDraftFromRelationship(row: ProRelationshipRecord): InviteDraft {
  return {
    assignedPropertyIds: [...row.assignedPropertyIds],
    propertyCoManagerPermissions: normalizePropertyCoManagerPermissions(
      row.propertyCoManagerPermissions ?? row.coManagerPermissions,
      row.assignedPropertyIds,
    ),
  };
}

function AddPropertyToCoManager({
  linkId,
  assignedPropertyIds,
  propertyOptions,
  selectedPropertyId,
  onSelect,
  onAdd,
  disabled,
}: {
  linkId: string;
  assignedPropertyIds: string[];
  propertyOptions: { id: string; label: string }[];
  selectedPropertyId: string;
  onSelect: (linkId: string, propertyId: string) => void;
  onAdd: () => void;
  disabled?: boolean;
}) {
  const unassigned = propertyOptions.filter((option) => !assignedPropertyIds.includes(option.id));
  if (unassigned.length === 0) {
    return <p className="text-xs text-muted">All of your properties are already assigned to this co-manager.</p>;
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-[12rem] flex-1 text-xs font-semibold text-muted">
        Add property
        <select
          value={selectedPropertyId}
          disabled={disabled}
          onChange={(e) => onSelect(linkId, e.target.value)}
          className="mt-1 h-10 w-full rounded-full border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        >
          <option value="">Select property…</option>
          {unassigned.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="button" variant="outline" className="rounded-full text-xs" disabled={disabled || !selectedPropertyId} onClick={onAdd}>
        Add property
      </Button>
    </div>
  );
}

export function ProAccountLinksPanel({ userId }: { userId: string }) {
  const { showToast } = useAppUi();

  const [localTick, setLocalTick] = useState(0);
  const refreshLocal = useCallback(() => setLocalTick((n) => n + 1), []);

  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [useRemote, setUseRemote] = useState(false);
  const [remoteInvites, setRemoteInvites] = useState<AccountLinkInviteDto[]>([]);
  const [inviteDrafts, setInviteDrafts] = useState<Record<string, InviteDraft>>({});
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [addPropertySelect, setAddPropertySelect] = useState<Record<string, string>>({});
  const [coManagerBucket, setCoManagerBucket] = useState<"all" | "active" | "pending">("all");
  const [linkedPropertiesPopup, setLinkedPropertiesPopup] = useState<{
    label: string;
    propertyIds: string[];
  } | null>(null);

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
    const saveTimers = saveTimersRef.current;
    return () => {
      for (const timer of Object.values(saveTimers)) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const localRows = useMemo(() => {
    void localTick;
    return readProRelationships(userId);
  }, [userId, localTick]);

  // Memoized so the reference is stable across renders. activeRemote feeds the
  // relationship-sync effect below; a fresh array each render would re-run that
  // effect every render, and its writeProRelationships dispatch bumps the nav
  // hook's tick, causing an infinite render loop.
  const activeRemote = useMemo(
    () => remoteInvites.filter((i) => i.status === "accepted"),
    [remoteInvites],
  );
  const incomingPending = useMemo(
    () => remoteInvites.filter((i) => i.status === "pending" && i.direction === "incoming"),
    [remoteInvites],
  );
  const outgoingPending = useMemo(
    () => remoteInvites.filter((i) => i.status === "pending" && i.direction === "outgoing"),
    [remoteInvites],
  );

  const coManagerBucketCounts = useMemo(() => {
    const active = useRemote ? activeRemote.length : localRows.length;
    const pending = useRemote ? incomingPending.length + outgoingPending.length : 0;
    return { all: active + pending, active, pending };
  }, [useRemote, activeRemote, localRows, incomingPending, outgoingPending]);

  const coManagerBucketTabs = useMemo(
    () =>
      [
        { id: "all" as const, label: "All", count: coManagerBucketCounts.all, dataAttr: "co-manager-filter-all" },
        { id: "active" as const, label: "Active", count: coManagerBucketCounts.active, dataAttr: "co-manager-filter-active" },
        { id: "pending" as const, label: "Pending", count: coManagerBucketCounts.pending, dataAttr: "co-manager-filter-pending" },
      ] as const,
    [coManagerBucketCounts],
  );

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
  const [linkModalOpen, setLinkModalOpen] = useState(false);
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

  const lookup = async (): Promise<boolean> => {
    const raw = axisInput.trim();
    if (!raw) {
      showToast(`Enter an ${AXIS_ID_LABEL}.`);
      return false;
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
        return false;
      }
      setDraftAxisId(raw);
      setDraftName(body.displayName ?? raw);
      setDraftUserId(body.userId ?? null);
      showToast("Account verified — assign properties, then send invite.");
      return true;
    } catch {
      showToast("Network error.");
      return false;
    } finally {
      setLookupBusy(false);
    }
  };

  const submitLinkAccount = async () => {
    const ok = await lookup();
    if (ok) setLinkModalOpen(false);
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

  const addPropertyToInvite = (inv: AccountLinkInviteDto, propId: string) => {
    if (!propId.trim()) {
      showToast("Select a property to add.");
      return;
    }
    const draft = getInviteDraft(inv);
    if (draft.assignedPropertyIds.includes(propId)) {
      showToast("That property is already assigned.");
      return;
    }
    const nextAssigned = [...draft.assignedPropertyIds, propId];
    applyAssignedPropertyChange(inv.id, nextAssigned, draft, useRemote && remoteLoaded);
    setAddPropertySelect((prev) => ({ ...prev, [inv.id]: "" }));
    showToast("Property added.");
  };

  const applyAssignedPropertyChange = (
    linkId: string,
    nextAssigned: string[],
    draft: InviteDraft,
    remote: boolean,
  ) => {
    if (nextAssigned.length === 0) {
      showToast("Keep at least one property in this link.");
      return;
    }
    const nextPerms = normalizePropertyCoManagerPermissions(
      {
        ...draft.propertyCoManagerPermissions,
        ...Object.fromEntries(
          nextAssigned
            .filter((id) => !draft.assignedPropertyIds.includes(id))
            .map((id) => [id, { ...EMPTY_CO_MANAGER_PERMISSIONS }]),
        ),
      },
      nextAssigned,
    );
    if (remote) {
      const inv = activeRemote.find((row) => row.id === linkId);
      if (inv) scheduleInviteSave(inv.id, { assignedPropertyIds: nextAssigned, propertyCoManagerPermissions: nextPerms });
      return;
    }
    const all = readProRelationships(userId);
    const next = all.map((r) => {
      if (r.id !== linkId) return r;
      return { ...r, assignedPropertyIds: nextAssigned, propertyCoManagerPermissions: nextPerms };
    });
    writeProRelationships(userId, next);
    refreshLocal();
  };

  const addPropertyToLocalRow = (rowId: string, propId: string) => {
    if (!propId.trim()) {
      showToast("Select a property to add.");
      return;
    }
    const all = readProRelationships(userId);
    const row = all.find((r) => r.id === rowId);
    if (!row) return;
    if (row.assignedPropertyIds.includes(propId)) {
      showToast("That property is already assigned.");
      return;
    }
    const nextAssigned = [...row.assignedPropertyIds, propId];
    applyAssignedPropertyChange(rowId, nextAssigned, inviteDraftFromRelationship(row), false);
    setAddPropertySelect((prev) => ({ ...prev, [rowId]: "" }));
    showToast("Property added.");
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

  const removePropertyFromLink = async (inv: AccountLinkInviteDto, propId: string) => {
    const draft = getInviteDraft(inv);
    if (!draft.assignedPropertyIds.includes(propId)) return;
    if (draft.assignedPropertyIds.length === 1) {
      await removeLink(inv.id);
      return;
    }
    const nextAssigned = draft.assignedPropertyIds.filter((id) => id !== propId);
    const nextPerms = normalizePropertyCoManagerPermissions(draft.propertyCoManagerPermissions, nextAssigned);
    if (useRemote && remoteLoaded) {
      scheduleInviteSave(inv.id, { assignedPropertyIds: nextAssigned, propertyCoManagerPermissions: nextPerms });
      showToast("Property removed from this co-manager.");
      return;
    }
    const all = readProRelationships(userId);
    const next = all.map((r) => {
      if (r.id !== inv.id) return r;
      return { ...r, assignedPropertyIds: nextAssigned, propertyCoManagerPermissions: nextPerms };
    });
    writeProRelationships(userId, next);
    refreshLocal();
    showToast("Property removed from this co-manager.");
  };

  const removePropertyFromLocalRow = (rowId: string, propId: string) => {
    const all = readProRelationships(userId);
    const row = all.find((r) => r.id === rowId);
    if (!row || !row.assignedPropertyIds.includes(propId)) return;
    if (row.assignedPropertyIds.length === 1) {
      writeProRelationships(
        userId,
        all.filter((r) => r.id !== rowId),
      );
      refreshLocal();
      showToast("Link removed.");
      return;
    }
    const nextAssigned = row.assignedPropertyIds.filter((id) => id !== propId);
    const nextPerms = normalizePropertyCoManagerPermissions(row.propertyCoManagerPermissions, nextAssigned);
    writeProRelationships(
      userId,
      all.map((r) =>
        r.id === rowId ? { ...r, assignedPropertyIds: nextAssigned, propertyCoManagerPermissions: nextPerms } : r,
      ),
    );
    refreshLocal();
    showToast("Property removed from this co-manager.");
  };

  const openTransferForProperty = (propertyId: string, coManagerUserId: string) => {
    setTransferPropertyId(propertyId);
    setTransferCoManagerUserId(coManagerUserId);
    setTransferPermissions(EMPTY_CO_MANAGER_PERMISSIONS);
  };

  const openTransferForCoManager = async (
    propertyId: string,
    axisId: string,
    knownUserId?: string,
  ) => {
    let coManagerUserId = knownUserId?.trim();
    if (!coManagerUserId) {
      try {
        const res = await fetch(`/api/pro/lookup-axis-id?axisId=${encodeURIComponent(axisId)}`, {
          credentials: "include",
        });
        const body = (await res.json()) as { ok?: boolean; userId?: string; error?: string };
        if (!res.ok || !body.ok || !body.userId) {
          showToast(body.error ?? "Could not resolve co-manager account.");
          return;
        }
        coManagerUserId = body.userId;
      } catch {
        showToast("Network error.");
        return;
      }
    }
    openTransferForProperty(propertyId, coManagerUserId);
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

  const renderSelfDetail = () => (
    <div className="mx-auto max-w-4xl space-y-4">
      {ownedProperties.map((prop) => {
        const coManagers = coManagersForProperty(prop.id);
        return (
          <div key={prop.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{prop.label}</p>
                <p className="mt-1 text-xs text-muted">
                  {coManagers.length === 0
                    ? "No co-managers on this property"
                    : `Co-managers: ${coManagers.map((c) => c.linkedDisplayName ?? c.linkedAxisId).join(", ")}`}
                </p>
              </div>
              {coManagers.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full text-xs"
                  onClick={() =>
                    void openTransferForCoManager(
                      prop.id,
                      coManagers[0]!.linkedAxisId,
                      coManagers[0]!.linkedUserId,
                    )
                  }
                >
                  Make owner of property
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderInviteDetail = (inv: AccountLinkInviteDto) => {
    const draft = getInviteDraft(inv);
    const readOnly = inv.direction === "incoming";
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        {!readOnly ? (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Linked properties
            </p>
            <AddPropertyToCoManager
              linkId={inv.id}
              assignedPropertyIds={draft.assignedPropertyIds}
              propertyOptions={propertyOptions}
              selectedPropertyId={addPropertySelect[inv.id] ?? ""}
              onSelect={(id, propertyId) =>
                setAddPropertySelect((prev) => ({ ...prev, [id]: propertyId }))
              }
              onAdd={() => addPropertyToInvite(inv, addPropertySelect[inv.id] ?? "")}
            />
          </div>
        ) : (
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Properties they granted you
          </p>
        )}

        {draft.assignedPropertyIds.length === 0 ? (
          <p className="text-sm text-muted">No properties in this link yet.</p>
        ) : (
          draft.assignedPropertyIds.map((pid) => (
            <div key={pid} className="rounded-xl border border-border bg-accent/25 p-4">
              <div className="flex flex-wrap items-start justify-start gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {resolvePropertyLabel(pid, pid)}
                  </p>
                  <p className="mt-1 text-xs text-muted">Permissions for this property</p>
                </div>
                {!readOnly ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full text-xs"
                      onClick={() =>
                        void openTransferForCoManager(
                          pid,
                          inv.linkedAxisId,
                          inv.linkedUserId,
                        )
                      }
                    >
                      Make owner of property
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full text-xs border-rose-200 text-rose-700 hover:bg-[var(--status-overdue-bg)]"
                      onClick={() => void removePropertyFromLink(inv, pid)}
                    >
                      Remove property
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="mt-3">
                {readOnly ? (
                  <p className="text-xs text-muted">
                    {summarizePropertyCoManagerPermissions({
                      [pid]: permissionsForProperty(draft.propertyCoManagerPermissions, pid),
                    })}
                  </p>
                ) : (
                  <CoManagerPermissionsEditor
                    value={permissionsForProperty(draft.propertyCoManagerPermissions, pid)}
                    onChange={(next) => updatePropertyPermissions(inv, pid, next)}
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderLocalRowDetail = (r: ProRelationshipRecord) => (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Linked properties
        </p>
        <AddPropertyToCoManager
          linkId={r.id}
          assignedPropertyIds={r.assignedPropertyIds}
          propertyOptions={propertyOptions}
          selectedPropertyId={addPropertySelect[r.id] ?? ""}
          onSelect={(id, propertyId) =>
            setAddPropertySelect((prev) => ({ ...prev, [id]: propertyId }))
          }
          onAdd={() => addPropertyToLocalRow(r.id, addPropertySelect[r.id] ?? "")}
        />
      </div>
      {r.assignedPropertyIds.length === 0 ? (
        <p className="text-sm text-muted">No properties in this link yet.</p>
      ) : (
        r.assignedPropertyIds.map((pid) => (
          <div key={pid} className="rounded-xl border border-border bg-accent/25 p-4">
            <div className="flex flex-wrap items-start justify-start gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{resolvePropertyLabel(pid, pid)}</p>
                <p className="mt-1 text-xs text-muted">Permissions for this property</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full text-xs"
                  onClick={() =>
                    void openTransferForCoManager(
                      pid,
                      r.linkedAxisId,
                      r.linkedUserId,
                    )
                  }
                >
                  Make owner of property
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full text-xs border-rose-200 text-rose-700 hover:bg-[var(--status-overdue-bg)]"
                  onClick={() => removePropertyFromLocalRow(r.id, pid)}
                >
                  Remove property
                </Button>
              </div>
            </div>
            <div className="mt-3">
              <CoManagerPermissionsEditor
                value={normalizeCoManagerPermissions(
                  r.propertyCoManagerPermissions?.[pid] ?? r.coManagerPermissions,
                )}
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
        ))
      )}
    </div>
  );

  return (
    <ManagerPortalPageShell
      title="Co-managers"
      titleAside={
        <Button
          type="button"
          variant="primary"
          className={PORTAL_HEADER_ACTION_BTN}
          disabled={atLinkCap}
          onClick={() => setLinkModalOpen(true)}
          title={atLinkCap ? "Remove a link or upgrade your plan to add another." : undefined}
          data-attr="co-manager-link-account"
        >
          Link account
        </Button>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills
            tabs={[...coManagerBucketTabs]}
            activeId={coManagerBucket}
            onChange={(id) => setCoManagerBucket(id as typeof coManagerBucket)}
          />
        </ManagerPortalFilterRow>
      }
    >
      <div className="space-y-6">
        {linkCap != null ? (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
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
            </div>
          </div>
        ) : null}

        {atLinkCap ? (
          <p className="text-xs font-medium text-[var(--status-overdue-fg)]">At limit — remove a link or change plan.</p>
        ) : null}
        {inviteeAtCap ? (
          <p className="text-xs font-medium text-[var(--status-overdue-fg)]">
            That account is already at its link limit and cannot accept new links.
          </p>
        ) : null}

        {draftAxisId ? (
          <div className="space-y-5 border-t border-border pt-6">
            <p className="text-sm text-muted">
              Verified <span className="font-semibold text-foreground">{draftName}</span>{" "}
              <span className="font-mono text-xs text-muted">({draftAxisId})</span>
            </p>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Assigned properties</p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border bg-accent/30 p-3">
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
                  <div key={pid} className="rounded-xl border border-border bg-accent/25 p-4">
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

            <Button type="button" className={`${PORTAL_HEADER_ACTION_BTN} rounded-full`} onClick={() => void saveNewLink()}>
              {useRemote ? "Send invite" : "Save link (local)"}
            </Button>
          </div>
        ) : null}

        {coManagerBucket !== "active" && useRemote && incomingPending.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Pending approvals (incoming)</p>
            <ul className="space-y-2">
              {incomingPending.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-start justify-start gap-3 rounded-xl border border-border bg-accent/30 px-4 py-3"
                >
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
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {coManagerBucket !== "active" && useRemote && outgoingPending.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Waiting on them</p>
            <ul className="space-y-2">
              {outgoingPending.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-accent/30 px-4 py-3 text-sm text-muted"
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

        {coManagerBucket === "pending" ? (
          incomingPending.length === 0 && outgoingPending.length === 0 ? (
            <PortalDataTableEmpty message="No pending invites." icon="team" />
          ) : null
        ) : activeCards.length === 0 && ownedProperties.length === 0 ? (
          <PortalDataTableEmpty message="No team members yet." icon="team" />
        ) : (
          <>
            <div className="space-y-2 lg:hidden">
              {ownedProperties.length > 0 ? (
                <PortalMobileSummaryCard
                  key="__self__"
                  title="You"
                  subtitle="Main manager"
                  meta={`${ownedProperties.length} owned`}
                  badge={<span className={OWNER_ROLE_BADGE}>Owner</span>}
                  expanded={expandedLinkId === "__self__"}
                  onClick={() => setExpandedLinkId((cur) => (cur === "__self__" ? null : "__self__"))}
                >
                  {expandedLinkId === "__self__" ? renderSelfDetail() : null}
                </PortalMobileSummaryCard>
              ) : null}

              {useRemote
                ? activeRemote.map((inv) => {
                    const draft = getInviteDraft(inv);
                    const readOnly = inv.direction === "incoming";
                    const expanded = expandedLinkId === inv.id;
                    return (
                      <PortalMobileSummaryCard
                        key={inv.id}
                        title={inv.linkedDisplayName ?? inv.linkedAxisId}
                        subtitle={readOnly ? "Linked to you" : "Co-manager"}
                        trailing={
                          <button
                            type="button"
                            className={LINKED_COUNT_TRIGGER}
                            data-attr="co-manager-linked-properties"
                            onClick={() =>
                              setLinkedPropertiesPopup({
                                label: inv.linkedDisplayName ?? inv.linkedAxisId,
                                propertyIds: draft.assignedPropertyIds,
                              })
                            }
                          >
                            <span className="tabular-nums">{draft.assignedPropertyIds.length}</span>
                            <span>linked</span>
                          </button>
                        }
                        badge={
                          <span className={CO_MANAGER_ROLE_BADGE}>{readOnly ? "Linked to you" : "Co-manager"}</span>
                        }
                        expanded={expanded}
                        onClick={() => setExpandedLinkId((cur) => (cur === inv.id ? null : inv.id))}
                      >
                        {expanded ? renderInviteDetail(inv) : null}
                      </PortalMobileSummaryCard>
                    );
                  })
                : localRows.map((r) => {
                    const expanded = expandedLinkId === r.id;
                    return (
                      <PortalMobileSummaryCard
                        key={r.id}
                        title={r.linkedDisplayName ?? r.linkedAxisId}
                        subtitle="Co-manager"
                        trailing={
                          <button
                            type="button"
                            className={LINKED_COUNT_TRIGGER}
                            data-attr="co-manager-linked-properties"
                            onClick={() =>
                              setLinkedPropertiesPopup({
                                label: r.linkedDisplayName ?? r.linkedAxisId,
                                propertyIds: r.assignedPropertyIds,
                              })
                            }
                          >
                            <span className="tabular-nums">{r.assignedPropertyIds.length}</span>
                            <span>linked</span>
                          </button>
                        }
                        badge={<span className={CO_MANAGER_ROLE_BADGE}>Co-manager</span>}
                        expanded={expanded}
                        onClick={() => setExpandedLinkId((cur) => (cur === r.id ? null : r.id))}
                      >
                        {expanded ? renderLocalRowDetail(r) : null}
                      </PortalMobileSummaryCard>
                    );
                  })}
            </div>
            <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
              <div className={PORTAL_DATA_TABLE_SCROLL}>
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className={PORTAL_TABLE_HEAD_ROW}>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Manager</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Role</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Properties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownedProperties.length > 0 ? (
                      <Fragment key="__self__">
                        <tr
                          className={PORTAL_TABLE_TR_EXPANDABLE}
                          onClick={createPortalRowExpandClick(() =>
                            setExpandedLinkId((cur) => (cur === "__self__" ? null : "__self__")),
                          )}
                          aria-expanded={expandedLinkId === "__self__"}
                        >
                          <td className={PORTAL_TABLE_TD}>
                            <p className="font-medium text-foreground">You</p>
                            <p className="mt-0.5 text-xs text-muted">Main manager</p>
                          </td>
                          <td className={PORTAL_TABLE_TD}>
                            <span className={OWNER_ROLE_BADGE}>Owner</span>
                          </td>
                          <td className={PORTAL_TABLE_TD}>
                            <span className="tabular-nums">{ownedProperties.length}</span>
                            <span className="text-muted"> owned</span>
                          </td>
                        </tr>
                        {expandedLinkId === "__self__" ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
                              {renderSelfDetail()}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ) : null}

                    {useRemote
                      ? activeRemote.map((inv) => {
                          const draft = getInviteDraft(inv);
                          const readOnly = inv.direction === "incoming";
                          return (
                            <Fragment key={inv.id}>
                              <tr
                                className={PORTAL_TABLE_TR_EXPANDABLE}
                                onClick={createPortalRowExpandClick(() => {
                                  setExpandedLinkId((cur) => (cur === inv.id ? null : inv.id));
                                })}
                                aria-expanded={expandedLinkId === inv.id}
                              >
                                <td className={PORTAL_TABLE_TD}>
                                  <p className="font-medium text-foreground">{inv.linkedDisplayName ?? inv.linkedAxisId}</p>
                                  <p className="mt-0.5 font-mono text-xs text-muted">{inv.linkedAxisId}</p>
                                </td>
                                <td className={PORTAL_TABLE_TD}>
                                  <span className={CO_MANAGER_ROLE_BADGE}>
                                    {readOnly ? "Linked to you" : "Co-manager"}
                                  </span>
                                </td>
                                <td className={PORTAL_TABLE_TD}>
                                  <button
                                    type="button"
                                    className={LINKED_COUNT_TRIGGER}
                                    data-attr="co-manager-linked-properties"
                                    onClick={() =>
                                      setLinkedPropertiesPopup({
                                        label: inv.linkedDisplayName ?? inv.linkedAxisId,
                                        propertyIds: draft.assignedPropertyIds,
                                      })
                                    }
                                  >
                                    <span className="tabular-nums">{draft.assignedPropertyIds.length}</span>
                                    <span>linked</span>
                                  </button>
                                </td>
                              </tr>
                              {expandedLinkId === inv.id ? (
                                <tr className={PORTAL_TABLE_DETAIL_ROW}>
                                  <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
                                    {renderInviteDetail(inv)}
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })
                      : localRows.map((r) => {
                          return (
                            <Fragment key={r.id}>
                              <tr
                                className={PORTAL_TABLE_TR_EXPANDABLE}
                                onClick={createPortalRowExpandClick(() =>
                                  setExpandedLinkId((cur) => (cur === r.id ? null : r.id)),
                                )}
                                aria-expanded={expandedLinkId === r.id}
                              >
                                <td className={PORTAL_TABLE_TD}>
                                  <p className="font-medium text-foreground">{r.linkedDisplayName ?? r.linkedAxisId}</p>
                                  <p className="mt-0.5 font-mono text-xs text-muted">{r.linkedAxisId}</p>
                                </td>
                                <td className={PORTAL_TABLE_TD}>
                                  <span className={CO_MANAGER_ROLE_BADGE}>Co-manager</span>
                                </td>
                                <td className={PORTAL_TABLE_TD}>
                                  <button
                                    type="button"
                                    className={LINKED_COUNT_TRIGGER}
                                    data-attr="co-manager-linked-properties"
                                    onClick={() =>
                                      setLinkedPropertiesPopup({
                                        label: r.linkedDisplayName ?? r.linkedAxisId,
                                        propertyIds: r.assignedPropertyIds,
                                      })
                                    }
                                  >
                                    <span className="tabular-nums">{r.assignedPropertyIds.length}</span>
                                    <span>linked</span>
                                  </button>
                                </td>
                              </tr>
                              {expandedLinkId === r.id ? (
                                <tr className={PORTAL_TABLE_DETAIL_ROW}>
                                  <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
                                    {renderLocalRowDetail(r)}
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
          </>
        )}

        <Modal open={linkModalOpen} title="Link account" onClose={() => setLinkModalOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitLinkAccount();
            }}
            className="space-y-4"
          >
            <label className="block text-xs font-semibold text-muted">
              {AXIS_ID_LABEL}
              <input
                type="text"
                value={axisInput}
                onChange={(e) => setAxisInput(e.target.value)}
                placeholder="e.g. AXIS-1A2B3C4D"
                autoFocus
                className={`mt-1 h-10 w-full font-mono text-sm ${PORTAL_TOOLBAR_SELECT}`}
              />
            </label>
            <div className="flex justify-start gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={lookupBusy}
                onClick={() => setLinkModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="rounded-full" disabled={lookupBusy || atLinkCap}>
                {lookupBusy ? "Checking…" : "Link account"}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal
          open={linkedPropertiesPopup !== null}
          title={linkedPropertiesPopup ? `Linked properties — ${linkedPropertiesPopup.label}` : "Linked properties"}
          onClose={() => setLinkedPropertiesPopup(null)}
        >
          {linkedPropertiesPopup && linkedPropertiesPopup.propertyIds.length > 0 ? (
            <ul className="space-y-2">
              {linkedPropertiesPopup.propertyIds.map((pid) => (
                <li
                  key={pid}
                  className="rounded-xl border border-border bg-accent/25 px-3 py-2 text-sm text-foreground"
                >
                  {resolvePropertyLabel(pid, pid)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No properties linked yet.</p>
          )}
        </Modal>

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

              <div className="mt-6 flex justify-start gap-2">
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
