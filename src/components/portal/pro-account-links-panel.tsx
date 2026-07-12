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
  PortalToolbarSelectWrap,
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
  PortalTableInlineExpand,
  PORTAL_DETAIL_BTN,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { AccountLinkInviteDto } from "@/lib/account-links";
import {
  buildAllModulesGrant,
  CO_MANAGER_PERMISSION_OPTIONS,
  EMPTY_CO_MANAGER_PERMISSIONS,
  normalizeCoManagerPermissions,
  normalizePropertyCoManagerPermissions,
  permissionsForProperty,
  summarizePropertyCoManagerPermissions,
  type CoManagerBulkPreset,
  type CoManagerPermissionId,
  type CoManagerPermissions,
  type PropertyCoManagerPermissions,
} from "@/lib/co-manager-permissions";
import {
  PROPERTY_PIPELINE_EVENT,
  readPendingManagerPropertiesForUser,
  readExtraListingsForUser,
} from "@/lib/demo-property-pipeline";
import {
  readLinkedListingsForUser,
  resolvePropertyLabelForId,
  safePropertyOptionLabel,
  syncManagerPortfolioFromServer,
} from "@/lib/manager-portfolio-access";
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
import {
  listOutgoingCoManagerLinks,
  listOutgoingCoManagersForProperty,
  resolveAssignedPropertyId,
  type CoManagerPropertyLink,
} from "@/lib/co-manager-property-links";

const CO_MANAGER_ROLE_BADGE =
  "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold border border-border bg-accent/40 text-foreground ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";

const LINKED_COUNT_TRIGGER =
  "inline-flex items-center gap-1 rounded-full text-xs font-semibold text-foreground transition hover:text-primary";

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
    out.push({
      id: p.id,
      label: safePropertyOptionLabel([`${p.buildingName} · ${p.unitLabel || "Unit"}`, p.buildingName, p.address], p.id),
    });
  }
  for (const r of pend) {
    const joined = `${r.buildingName} · ${r.unitLabel} (pending)`;
    out.push({
      id: r.id,
      label: safePropertyOptionLabel([joined, r.buildingName, r.address], r.id),
    });
  }
  return out;
}

function resolvePropertyLabel(id: string, fallback: string): string {
  return resolvePropertyLabelForId(id, fallback);
}

type GrantLevels = { read?: boolean; edit?: boolean; delete?: boolean };

function grantToLevels(grant: CoManagerPermissions[CoManagerPermissionId]): GrantLevels {
  if (grant === true) return { read: true, edit: true, delete: true };
  if (grant && typeof grant === "object") {
    return {
      read: grant.read === true || grant.edit === true || grant.delete === true,
      edit: grant.edit === true,
      delete: grant.delete === true,
    };
  }
  return {};
}

function levelsToGrant(levels: GrantLevels): CoManagerPermissions[CoManagerPermissionId] | undefined {
  if (levels.read && levels.edit && levels.delete) return true;
  const grant: GrantLevels = {};
  if (levels.read) grant.read = true;
  if (levels.edit) grant.edit = true;
  if (levels.delete) grant.delete = true;
  return Object.keys(grant).length > 0 ? grant : undefined;
}

// "All delete" grants delete (without edit) so it stays distinct from "All edit";
// "All full access" is read+edit+delete (collapses to the legacy `true`). The
// grant-map builder lives in the lib (buildAllModulesGrant) so it is unit-tested.
const CO_MANAGER_PERMISSION_PRESETS: { label: string; preset: CoManagerBulkPreset }[] = [
  { label: "All read-only", preset: "read" },
  { label: "All write", preset: "edit" },
  { label: "All delete", preset: "delete" },
  { label: "All full access", preset: "full" },
];

function CoManagerPermissionsEditor({
  value,
  onChange,
  disabled,
}: {
  value: CoManagerPermissions;
  onChange: (next: CoManagerPermissions) => void;
  disabled?: boolean;
}) {
  const setLevels = (id: CoManagerPermissionId, levels: GrantLevels) => {
    const next = { ...value };
    const grant = levelsToGrant(levels);
    if (grant === undefined) delete next[id];
    else next[id] = grant;
    onChange(next);
  };

  const isEmpty = Object.keys(value).length === 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {CO_MANAGER_PERMISSION_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(buildAllModulesGrant(preset.preset))}
            className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            data-attr={`co-manager-preset-${preset.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {isEmpty ? (
        <p className="rounded-lg border border-dashed border-border bg-accent/20 px-3 py-2 text-xs text-muted">
          No restrictions — this co-manager has full access to every module on this property.
          Check modules below to restrict them. (To remove the property entirely, use
          &ldquo;Remove access&rdquo;.)
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
      {CO_MANAGER_PERMISSION_OPTIONS.map(({ id, label }) => {
        const levels = grantToLevels(value[id]);
        const enabled = Boolean(levels.read);
        return (
          <div
            key={id}
            className={`rounded-lg border border-border bg-card px-3 py-2.5 text-sm ${disabled ? "opacity-60" : ""}`}
          >
            <label className={`flex items-start gap-2 ${disabled ? "" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={enabled}
                onChange={(e) =>
                  setLevels(id, e.target.checked ? { read: true } : {})
                }
                className="mt-0.5 h-4 w-4 rounded border-border text-primary"
              />
              <span className="font-medium text-foreground">{label}</span>
            </label>
            {enabled ? (
              <div className="mt-2 flex items-center gap-4 pl-6 text-xs text-muted">
                <label className={`inline-flex items-center gap-1.5 ${disabled ? "" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={Boolean(levels.edit)}
                    onChange={(e) => setLevels(id, { ...levels, edit: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-border text-primary"
                  />
                  Write
                </label>
                <label className={`inline-flex items-center gap-1.5 ${disabled ? "" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={Boolean(levels.delete)}
                    onChange={(e) => setLevels(id, { ...levels, delete: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-border text-primary"
                  />
                  Delete
                </label>
              </div>
            ) : null}
          </div>
        );
      })}
      </div>
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
    return null;
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-[12rem] flex-1 text-xs font-semibold text-muted">
        Add property
        <PortalToolbarSelectWrap className="mt-1 block w-full">
          <select
            value={selectedPropertyId}
            disabled={disabled}
            onChange={(e) => onSelect(linkId, e.target.value)}
            className={`h-10 w-full ${PORTAL_TOOLBAR_SELECT}`}
          >
            <option value="">Select property…</option>
            {unassigned.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </PortalToolbarSelectWrap>
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
  // Remote (account-backed) is the default; only a confirmed missing table
  // (migrationRequired) downgrades to localStorage-only mode.
  const [useRemote, setUseRemote] = useState(true);
  const [remoteInvites, setRemoteInvites] = useState<AccountLinkInviteDto[]>([]);
  // A failed load must NOT silently render "0 links" (a co-manager would think
  // their access vanished). We surface an explicit error + retry instead.
  const [loadError, setLoadError] = useState(false);
  const loadInFlightRef = useRef(false);
  const loadRetriedRef = useRef(false);
  const [inviteDrafts, setInviteDrafts] = useState<Record<string, InviteDraft>>({});
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [addPropertySelect, setAddPropertySelect] = useState<Record<string, string>>({});
  const [coManagerBucket, setCoManagerBucket] = useState<"active" | "pending">("active");
  const [linkedPropertiesPopup, setLinkedPropertiesPopup] = useState<{
    label: string;
    propertyIds: string[];
  } | null>(null);

  const [transferPropertyId, setTransferPropertyId] = useState<string | null>(null);
  const [transferCoManagerUserId, setTransferCoManagerUserId] = useState<string | null>(null);
  const [transferPermissions, setTransferPermissions] = useState<CoManagerPermissions>(EMPTY_CO_MANAGER_PERMISSIONS);
  const [transferBusy, setTransferBusy] = useState(false);

  const loadRemoteInvites = useCallback(async () => {
    // In-flight guard: the initial-load effect and the post-purge refresh can
    // both fire; without this the auto-retry below could also stack.
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    // On a transient failure, retry once after a short backoff before giving up
    // — a single blip must never surface as "0 links".
    const failSoft = (): boolean => {
      setUseRemote(true);
      if (!loadRetriedRef.current) {
        loadRetriedRef.current = true;
        window.setTimeout(() => void loadRemoteInvites(), 1200);
        return true; // retry scheduled
      }
      setLoadError(true);
      showToast("Couldn't load your linked accounts — tap retry.");
      return false;
    };
    try {
      const res = await fetch("/api/pro/account-links", { credentials: "include" });
      let data: { invites?: AccountLinkInviteDto[]; migrationRequired?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Non-JSON (proxy/HTML error page) counts as a transient failure.
        failSoft();
        return;
      }
      if (data.migrationRequired) {
        // The invites table genuinely doesn't exist — localStorage-only mode.
        setUseRemote(false);
        setRemoteInvites([]);
        setLoadError(false);
        loadRetriedRef.current = false;
        return;
      }
      if (!res.ok) {
        // Transient server error: STAY in remote mode with last-known invites.
        // Downgrading to local here made saves silently diverge from the account.
        failSoft();
        return;
      }
      setUseRemote(true);
      setLoadError(false);
      loadRetriedRef.current = false;
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
      // Network error — keep remote mode so saves fail loudly instead of
      // silently writing localStorage that never reaches the account.
      failSoft();
    } finally {
      setRemoteLoaded(true);
      loadInFlightRef.current = false;
    }
  }, [showToast]);

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
    void syncManagerPortfolioFromServer(userId, { force: true }).then(() => {
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
    return { active, pending };
  }, [useRemote, activeRemote, localRows, incomingPending, outgoingPending]);

  const coManagerBucketTabs = useMemo(
    () =>
      [
        { id: "pending" as const, label: "Pending", count: coManagerBucketCounts.pending, dataAttr: "co-manager-filter-pending" },
        { id: "active" as const, label: "Active", count: coManagerBucketCounts.active, dataAttr: "co-manager-filter-active" },
      ] as const,
    [coManagerBucketCounts],
  );

  const propertyOptions = useMemo(() => {
    void localTick;
    return propertyChoices(userId);
  }, [userId, localTick]);

  const ownedProperties = useMemo(() => {
    void localTick;
    const live = readExtraListingsForUser(userId).map((p) => ({
      id: p.id,
      label: safePropertyOptionLabel([`${p.buildingName} · ${p.unitLabel || "Unit"}`, p.buildingName, p.address], p.id),
    }));
    const pending = readPendingManagerPropertiesForUser(userId).map((r) => {
      const joined = `${r.buildingName} · ${r.unitLabel} (pending)`;
      return {
        id: r.id,
        label: safePropertyOptionLabel([joined, r.buildingName, r.address], r.id),
      };
    });
    return [...live, ...pending];
  }, [userId, localTick]);

  // Properties this manager co-manages via an incoming account link (e.g. Brooklyn
  // when Ambika granted access). Shown under "You" so the panel matches Properties.
  const coManagedProperties = useMemo(() => {
    void localTick;
    return readLinkedListingsForUser(userId).map(({ listing, ownerUserId }) => ({
      id: listing.id,
      label: safePropertyOptionLabel(
        [`${listing.buildingName} · ${listing.unitLabel || "Unit"}`, listing.buildingName, listing.address],
        listing.id,
      ),
      ownerUserId,
    }));
  }, [userId, localTick]);

  const managedPropertyCount = ownedProperties.length + coManagedProperties.length;

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
      showToast(`Enter a ${AXIS_ID_LABEL}.`);
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

  // On a successful lookup, draftAxisId is set — the Link-account modal then
  // advances from the Axis-ID step to the assign-properties step in place,
  // instead of closing and dropping the user onto an inline page section.
  const submitLinkAccount = async () => {
    await lookup();
  };

  /** Clear the whole in-progress link draft (used on cancel/close and after send). */
  const resetLinkDraft = () => {
    setAxisInput("");
    setDraftAxisId(null);
    setDraftName(null);
    setDraftUserId(null);
    setSelectedProps({});
    setPropertyPermissionsDraft({});
    setInviteeAtCap(false);
  };

  /** Return to the Axis-ID step, keeping the typed id so it can be re-verified. */
  const backToLookup = () => {
    setDraftAxisId(null);
    setDraftName(null);
    setDraftUserId(null);
    setSelectedProps({});
    setPropertyPermissionsDraft({});
    setInviteeAtCap(false);
  };

  const openLinkModal = () => {
    resetLinkDraft();
    setLinkModalOpen(true);
  };

  const closeLinkModal = () => {
    setLinkModalOpen(false);
    resetLinkDraft();
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
      showToast(`Verify a ${AXIS_ID_LABEL} first.`);
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
        resetLinkDraft();
        setLinkModalOpen(false);
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
    resetLinkDraft();
    setLinkModalOpen(false);
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
    const assignedId = resolveAssignedPropertyId(propId, draft.assignedPropertyIds);
    if (!assignedId) return;
    if (draft.assignedPropertyIds.length === 1) {
      await removeLink(inv.id);
      return;
    }
    const nextAssigned = draft.assignedPropertyIds.filter((id) => id !== assignedId);
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
    const assignedId = row ? resolveAssignedPropertyId(propId, row.assignedPropertyIds) : null;
    if (!row || !assignedId) return;
    if (row.assignedPropertyIds.length === 1) {
      writeProRelationships(
        userId,
        all.filter((r) => r.id !== rowId),
      );
      refreshLocal();
      showToast("Link removed.");
      return;
    }
    const nextAssigned = row.assignedPropertyIds.filter((id) => id !== assignedId);
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

  const outgoingCoManagerLinks = useMemo(
    () =>
      listOutgoingCoManagerLinks({
        useRemote,
        remoteInvites,
        localRows,
        inviteDrafts,
      }),
    [useRemote, remoteInvites, localRows, inviteDrafts],
  );

  const coManagersForProperty = useCallback(
    (propertyId: string) => listOutgoingCoManagersForProperty(propertyId, outgoingCoManagerLinks),
    [outgoingCoManagerLinks],
  );

  const removeCoManagerFromProperty = async (link: CoManagerPropertyLink, propertyId: string) => {
    if (useRemote && remoteLoaded) {
      const inv = activeRemote.find((row) => row.id === link.id);
      if (!inv) return;
      await removePropertyFromLink(inv, propertyId);
      return;
    }
    removePropertyFromLocalRow(link.id, propertyId);
  };

  const renderCoManagerPropertyActions = (
    propertyId: string,
    link: CoManagerPropertyLink,
    readOnly: boolean,
  ) => {
    if (readOnly) return null;
    return (
      <>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-full px-4 text-xs"
          onClick={() => void openTransferForCoManager(propertyId, link.linkedAxisId, link.linkedUserId)}
        >
          Make owner of property
        </Button>
        <Button
          type="button"
          variant="outline"
          className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
          onClick={() => void removeCoManagerFromProperty(link, propertyId)}
        >
          Remove access
        </Button>
      </>
    );
  };

  const renderPropertyPermissionsSection = (
    propertyId: string,
    draft: InviteDraft,
    inv: AccountLinkInviteDto,
    readOnly: boolean,
  ) => {
    const label = resolvePropertyLabel(propertyId, propertyId);
    const perms = permissionsForProperty(draft.propertyCoManagerPermissions, propertyId);
    return (
      <PortalCollapsibleSection
        key={propertyId}
        title={label}
        subtitle={summarizePropertyCoManagerPermissions({ [propertyId]: perms })}
        defaultExpanded={false}
        surfaceMuted={false}
        className="mt-4 first:mt-0"
        toggleDataAttr="co-manager-property-toggle"
        headerActions={renderCoManagerPropertyActions(propertyId, {
          id: inv.id,
          linkedAxisId: inv.linkedAxisId,
          linkedDisplayName: inv.linkedDisplayName,
          linkedUserId: inv.linkedUserId,
          assignedPropertyIds: draft.assignedPropertyIds,
          propertyCoManagerPermissions: draft.propertyCoManagerPermissions,
        }, readOnly)}
      >
        <div className="px-4 pb-4">
          {readOnly ? (
            <p className="text-xs text-muted">{summarizePropertyCoManagerPermissions({ [propertyId]: perms })}</p>
          ) : (
            <CoManagerPermissionsEditor
              value={perms}
              onChange={(next) => updatePropertyPermissions(inv, propertyId, next)}
            />
          )}
        </div>
      </PortalCollapsibleSection>
    );
  };

  const renderLocalPropertyPermissionsSection = (propertyId: string, row: ProRelationshipRecord) => {
    const label = resolvePropertyLabel(propertyId, propertyId);
    const perms = normalizeCoManagerPermissions(
      row.propertyCoManagerPermissions?.[propertyId] ?? row.coManagerPermissions,
    );
    return (
      <PortalCollapsibleSection
        key={propertyId}
        title={label}
        subtitle={summarizePropertyCoManagerPermissions({ [propertyId]: perms })}
        defaultExpanded={false}
        surfaceMuted={false}
        className="mt-4 first:mt-0"
        toggleDataAttr="co-manager-property-toggle"
        headerActions={renderCoManagerPropertyActions(propertyId, {
          id: row.id,
          linkedAxisId: row.linkedAxisId,
          linkedDisplayName: row.linkedDisplayName,
          linkedUserId: row.linkedUserId,
          assignedPropertyIds: row.assignedPropertyIds,
          propertyCoManagerPermissions: row.propertyCoManagerPermissions ?? {},
        }, false)}
      >
        <div className="px-4 pb-4">
          <CoManagerPermissionsEditor
            value={perms}
            onChange={(next) => {
              const all = readProRelationships(userId);
              const updated = all.map((rel) =>
                rel.id === row.id
                  ? {
                      ...rel,
                      propertyCoManagerPermissions: {
                        ...(rel.propertyCoManagerPermissions ?? {}),
                        [propertyId]: next,
                      },
                    }
                  : rel,
              );
              writeProRelationships(userId, updated);
              refreshLocal();
            }}
          />
        </div>
      </PortalCollapsibleSection>
    );
  };

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
      await syncManagerPortfolioFromServer(userId, { force: true });
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
    <>
      {ownedProperties.map((prop) => {
        const coManagers = coManagersForProperty(prop.id);
        return (
          <PortalCollapsibleSection
            key={prop.id}
            title={prop.label}
            subtitle={
              coManagers.length === 0
                ? "No co-managers on this property"
                : `${coManagers.length} co-manager${coManagers.length === 1 ? "" : "s"}`
            }
            defaultExpanded={false}
            surfaceMuted={false}
            className="mt-4 first:mt-0"
            toggleDataAttr="owner-property-toggle"
          >
            <div className="space-y-3 px-4 pb-4">
              {coManagers.length === 0 ? (
                <p className="text-sm text-muted">No co-managers on this property yet.</p>
              ) : (
                coManagers.map((link) => {
                  const assignedId =
                    resolveAssignedPropertyId(prop.id, link.assignedPropertyIds) ?? prop.id;
                  const perms = permissionsForProperty(link.propertyCoManagerPermissions, assignedId);
                  return (
                  <PortalCollapsibleSection
                    key={link.id}
                    title={link.linkedDisplayName ?? link.linkedAxisId}
                    subtitle={summarizePropertyCoManagerPermissions({ [assignedId]: perms })}
                    defaultExpanded={false}
                    surfaceMuted={false}
                    titleVariant="resident"
                    toggleDataAttr="owner-co-manager-toggle"
                    headerActions={renderCoManagerPropertyActions(prop.id, link, false)}
                  >
                    <p className="px-4 pb-4 text-xs text-muted">
                      {summarizePropertyCoManagerPermissions({ [assignedId]: perms })}
                    </p>
                  </PortalCollapsibleSection>
                  );
                })
              )}
            </div>
          </PortalCollapsibleSection>
        );
      })}
      {coManagedProperties.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Co-managing (linked to you)
          </p>
          {coManagedProperties.map((prop) => (
            <div
              key={`linked-${prop.id}`}
              className="rounded-xl border border-border bg-accent/20 px-4 py-3"
              data-attr="co-managed-property"
            >
              <p className="text-sm font-medium text-foreground">{prop.label}</p>
              <p className="mt-0.5 text-xs text-muted">
                You manage this listing through a co-manager link — it is not in your owned portfolio.
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {ownedProperties.length === 0 && coManagedProperties.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No properties in your portfolio yet.</p>
      ) : null}
    </>
  );

  const renderInviteDetail = (inv: AccountLinkInviteDto) => {
    const draft = getInviteDraft(inv);
    const readOnly = inv.direction === "incoming";
    return (
      <>
        {!readOnly ? (
          <div className="mt-4">
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
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Properties they granted you
          </p>
        )}

        {draft.assignedPropertyIds.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No properties in this link yet.</p>
        ) : (
          draft.assignedPropertyIds.map((pid) =>
            renderPropertyPermissionsSection(pid, draft, inv, readOnly),
          )
        )}

        {/* Either side of an active co-manager link can remove it. */}
        <div className="mt-5 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline`}
            onClick={() => void removeLink(inv.id)}
            data-attr="co-manager-remove-link"
          >
            {readOnly ? "Leave this co-manager link" : "Remove co-manager link"}
          </Button>
        </div>
      </>
    );
  };

  const renderLocalRowDetail = (r: ProRelationshipRecord) => (
    <>
      <div className="mt-4">
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
        <p className="mt-4 text-sm text-muted">No properties in this link yet.</p>
      ) : (
        r.assignedPropertyIds.map((pid) => renderLocalPropertyPermissionsSection(pid, r))
      )}
    </>
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
          onClick={openLinkModal}
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
        {loadError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm portal-banner-danger">
            <span className="text-[var(--status-overdue-fg)]">
              Couldn&apos;t load your linked accounts. Your access hasn&apos;t changed — this is a
              temporary load error.
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                loadRetriedRef.current = false;
                setLoadError(false);
                void loadRemoteInvites();
              }}
              data-attr="co-manager-retry-load"
            >
              Retry
            </Button>
          </div>
        ) : null}

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
          <p className="text-xs font-medium text-[var(--status-overdue-fg)]">
            {/* Web keeps the "change plan" option; native drops it (App Store 2.1(b)). */}
            <span className="native-hide">At limit — remove a link or change plan.</span>
            <span className="native-only">At limit — remove a link to add another.</span>
          </p>
        ) : null}
        {inviteeAtCap ? (
          <p className="text-xs font-medium text-[var(--status-overdue-fg)]">
            That account is already at its link limit and cannot accept new links.
          </p>
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
        ) : activeCards.length === 0 && managedPropertyCount === 0 ? (
          <PortalDataTableEmpty message="No team members yet." icon="team" />
        ) : (
          <>
            <div className="space-y-2 lg:hidden">
              {managedPropertyCount > 0 ? (
                <PortalMobileSummaryCard
                  key="__self__"
                  title="You"
                  subtitle="Main manager"
                  meta={
                    coManagedProperties.length > 0
                      ? `${ownedProperties.length} owned · ${coManagedProperties.length} co-managing`
                      : `${ownedProperties.length} owned`
                  }
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
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <thead>
                    <tr className={PORTAL_TABLE_HEAD_ROW}>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Manager</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Role</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Properties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managedPropertyCount > 0 ? (
                      <Fragment key="__self__">
                        <tr
                          className={PORTAL_TABLE_TR_EXPANDABLE}
                          onClick={createPortalRowExpandClick(() =>
                            setExpandedLinkId((cur) => (cur === "__self__" ? null : "__self__")),
                          )}
                          aria-expanded={expandedLinkId === "__self__"}
                        >
                          <td className={PORTAL_TABLE_TD}>
                            <PortalTableInlineExpand
                              expanded={expandedLinkId === "__self__"}
                              className="font-medium text-foreground"
                            >
                              You
                            </PortalTableInlineExpand>
                            <p className="mt-0.5 text-xs text-muted">Main manager</p>
                          </td>
                          <td className={PORTAL_TABLE_TD}>
                            <span className={OWNER_ROLE_BADGE}>Owner</span>
                          </td>
                          <td className={PORTAL_TABLE_TD}>
                            <span className="tabular-nums">{ownedProperties.length}</span>
                            <span className="text-muted"> owned</span>
                            {coManagedProperties.length > 0 ? (
                              <>
                                <span className="text-muted"> · </span>
                                <span className="tabular-nums">{coManagedProperties.length}</span>
                                <span className="text-muted"> co-managing</span>
                              </>
                            ) : null}
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
                                  <PortalTableInlineExpand
                                    expanded={expandedLinkId === inv.id}
                                    className="font-medium text-foreground"
                                  >
                                    {inv.linkedDisplayName ?? inv.linkedAxisId}
                                  </PortalTableInlineExpand>
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
                                  <PortalTableInlineExpand
                                    expanded={expandedLinkId === r.id}
                                    className="font-medium text-foreground"
                                  >
                                    {r.linkedDisplayName ?? r.linkedAxisId}
                                  </PortalTableInlineExpand>
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

        <Modal
          open={linkModalOpen}
          title={draftAxisId ? "Assign properties & permissions" : "Link account"}
          onClose={closeLinkModal}
          panelClassName={draftAxisId ? "max-w-2xl" : undefined}
        >
          {!draftAxisId ? (
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
              <p className="text-xs text-muted">
                Enter the {AXIS_ID_LABEL} of the manager you want to add. Next you&apos;ll choose which properties
                they co-manage and what they can do on each.
              </p>
              <div className="flex justify-start gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={lookupBusy}
                  onClick={closeLinkModal}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" className="rounded-full" disabled={lookupBusy || atLinkCap}>
                  {lookupBusy ? "Checking…" : "Continue"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-muted">
                Verified <span className="font-semibold text-foreground">{draftName}</span>{" "}
                <span className="font-mono text-xs text-muted">({draftAxisId})</span>
              </p>

              {inviteeAtCap ? (
                <p className="rounded-xl portal-banner-danger px-4 py-3 text-xs font-medium text-[var(--status-overdue-fg)]">
                  That account is already at its link limit and cannot accept new links.
                </p>
              ) : null}

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

              <div className="flex justify-start gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={backToLookup}>
                  Back
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="rounded-full"
                  disabled={atLinkCap}
                  onClick={() => void saveNewLink()}
                >
                  {useRemote ? "Send invite" : "Save link (local)"}
                </Button>
              </div>
            </div>
          )}
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
