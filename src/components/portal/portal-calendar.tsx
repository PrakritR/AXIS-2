"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell, PORTAL_TOOLBAR_SELECT } from "./portal-metrics";
import { PortalCalendarPanels } from "./portal-calendar-panels";
import {
  ADMIN_AVAILABILITY_STORAGE_KEY,
  managerPropertyAvailabilityStorageKey,
  readAvailabilityDateSetForStorageKey,
  readCalendarShareAvailability,
  registerManagerForProperty,
  syncScheduleRecordsFromServer,
  writeAvailabilityDateSetForStorageKeyToServer,
  writeCalendarShareAvailability,
} from "@/lib/demo-admin-scheduling";
import {
  coManagerOverlaysFromPeers,
  listPropertyCalendarPeers,
  propertyHasMultipleCalendarManagers,
  type CoManagerCalendarPeerDto,
} from "@/lib/co-manager-calendar";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import { buildManagerPropertyFilterOptions, MANAGER_PORTFOLIO_REFRESH_EVENTS } from "@/lib/manager-portfolio-access";
import { buildManagerShareablePropertyOptions } from "@/lib/manager-property-links";
import { ShareLeadLinkModal } from "@/components/portal/share-lead-link-modal";

const selectClassName = `${PORTAL_TOOLBAR_SELECT} min-w-[12rem] max-w-full [html[data-theme=dark]_&]:border-white/32 [html[data-theme=dark]_&]:bg-white/10`;

function ManagerCalendarPropertyFilter({
  properties,
  value,
  onChange,
}: {
  properties: { id: string; name: string }[];
  value: string;
  onChange: (propertyId: string) => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 sm:shrink-0">
        <label htmlFor="portal-calendar-property" className="sr-only">
          Property
        </label>
        <select
          id="portal-calendar-property"
          className={selectClassName}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select a house</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function PortalCalendar({
  portal,
  initialUserId,
  initialEmail,
}: {
  portal: "manager" | "admin";
  initialUserId?: string | null;
  initialEmail?: string | null;
}) {
  const { userId, email, ready: authReady } = useManagerUserId({
    userId: initialUserId,
    email: initialEmail,
  });
  const { showToast } = useAppUi();
  const [calendarRefreshSignal, setCalendarRefreshSignal] = useState(0);
  const [calendarPropertyId, setCalendarPropertyId] = useState<string>("");
  const [propertyTick, setPropertyTick] = useState(0);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [shareTourModalOpen, setShareTourModalOpen] = useState(false);
  const [coManagerPeers, setCoManagerPeers] = useState<CoManagerCalendarPeerDto[]>([]);
  const [shareAvailability, setShareAvailability] = useState(false);

  useEffect(() => {
    if (portal !== "manager") return;
    const bump = () => setPropertyTick((n) => n + 1);
    for (const eventName of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
      window.addEventListener(eventName, bump);
    }
    return () => {
      for (const eventName of MANAGER_PORTFOLIO_REFRESH_EVENTS) {
        window.removeEventListener(eventName, bump);
      }
    };
  }, [portal]);

  useEffect(() => {
    if (portal !== "manager" || !authReady || !userId) return;
    let cancelled = false;
    void syncPropertyPipelineFromServer()
      .finally(() => {
        if (cancelled) return;
        setPropertiesLoading(false);
        setPropertyTick((n) => n + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [portal, authReady, userId]);

  const managerProperties = useMemo(() => {
    if (portal !== "manager" || !userId) return [];
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId).map((property) => ({
      id: property.id,
      name: property.label,
    }));
  }, [portal, userId, propertyTick]);

  // In the /demo sandbox, pre-select the first property so the calendar opens
  // populated (availability + tours) instead of on the "Select a house" blank.
  useEffect(() => {
    if (!isDemoModeActive() || portal !== "manager" || calendarPropertyId) return;
    const first = managerProperties[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time demo default once seeded properties arrive
    if (first) setCalendarPropertyId(first.id);
  }, [portal, calendarPropertyId, managerProperties]);

  const activeCalendarPropertyId =
    calendarPropertyId && managerProperties.some((property) => property.id === calendarPropertyId) ? calendarPropertyId : "";

  const shareableProperties = useMemo(() => {
    if (portal !== "manager" || !userId) return [];
    void propertyTick;
    return buildManagerShareablePropertyOptions(userId);
  }, [portal, userId, propertyTick]);

  useEffect(() => {
    if (portal !== "manager" || !userId || !activeCalendarPropertyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear co-manager state when scope is unavailable
      setCoManagerPeers([]);
      setShareAvailability(false);
      return;
    }
    let cancelled = false;
    const loadPeers = async () => {
      await syncScheduleRecordsFromServer();
      if (cancelled) return;
      setShareAvailability(readCalendarShareAvailability(userId, activeCalendarPropertyId));
      try {
        const res = await fetch(
          `/api/portal/co-manager-calendar?propertyId=${encodeURIComponent(activeCalendarPropertyId)}`,
          { cache: "no-store", credentials: "include" },
        );
        if (!res.ok) {
          const localPeers = listPropertyCalendarPeers(userId, activeCalendarPropertyId).map((peer) => ({
            ...peer,
            sharesAvailability: peer.isSelf ? readCalendarShareAvailability(userId, activeCalendarPropertyId) : false,
            slots: [] as string[],
          }));
          if (!cancelled) setCoManagerPeers(localPeers);
          return;
        }
        const body = (await res.json()) as { peers?: CoManagerCalendarPeerDto[] };
        if (!cancelled) setCoManagerPeers(Array.isArray(body.peers) ? body.peers : []);
      } catch {
        if (!cancelled) {
          setCoManagerPeers(
            listPropertyCalendarPeers(userId, activeCalendarPropertyId).map((peer) => ({
              ...peer,
              sharesAvailability: peer.isSelf ? readCalendarShareAvailability(userId, activeCalendarPropertyId) : false,
              slots: [],
            })),
          );
        }
      }
    };
    void loadPeers();
    return () => {
      cancelled = true;
    };
  }, [portal, userId, activeCalendarPropertyId, calendarRefreshSignal, propertyTick]);

  const calendarPeers = useMemo(
    () =>
      activeCalendarPropertyId && userId
        ? listPropertyCalendarPeers(userId, activeCalendarPropertyId)
        : [],
    [userId, activeCalendarPropertyId, propertyTick, coManagerPeers],
  );

  const coManagerAvailabilityOverlays = useMemo(
    () => (userId ? coManagerOverlaysFromPeers(coManagerPeers, userId) : []),
    [coManagerPeers, userId],
  );

  const showCoManagerCoordination =
    portal === "manager" &&
    Boolean(activeCalendarPropertyId && userId && propertyHasMultipleCalendarManagers(userId, activeCalendarPropertyId));

  const setShareAvailabilityPreference = useCallback(
    (next: boolean) => {
      if (!userId || !activeCalendarPropertyId) return;
      setShareAvailability(next);
      writeCalendarShareAvailability(userId, activeCalendarPropertyId, next);
      setCoManagerPeers((prev) =>
        prev.map((peer) => (peer.isSelf ? { ...peer, sharesAvailability: next } : peer)),
      );
      showToast(next ? "Co-managers can see your availability for this house." : "Your availability is private.");
    },
    [userId, activeCalendarPropertyId, showToast],
  );

  // Register this manager as a tour host for the selected property so the public
  // booking page can discover combined availability across all linked managers.
  useEffect(() => {
    if (portal !== "manager" || !userId || !activeCalendarPropertyId) return;
    const label = email || userId;
    registerManagerForProperty(userId, activeCalendarPropertyId, label);
  }, [portal, userId, email, activeCalendarPropertyId]);

  const storageKey = useMemo(() => {
    if (portal === "admin") return ADMIN_AVAILABILITY_STORAGE_KEY;
    if (!userId) return null;
    if (!activeCalendarPropertyId) return null;
    return managerPropertyAvailabilityStorageKey(userId, activeCalendarPropertyId);
  }, [portal, userId, activeCalendarPropertyId]);

  const tourScopeLabel = useMemo(() => {
    if (portal !== "manager") return undefined;
    if (!activeCalendarPropertyId) return undefined;
    const name = managerProperties.find((p) => p.id === activeCalendarPropertyId)?.name;
    return name ? `Calendar · ${name}` : undefined;
  }, [portal, activeCalendarPropertyId, managerProperties]);

  const pageTitle = portal === "manager" ? "Calendar" : "Schedule meeting";

  if (portal === "manager" && !authReady) {
    return (
      <ManagerPortalPageShell
        title={pageTitle}
        filterRow={
          <ManagerCalendarPropertyFilter properties={managerProperties} value={activeCalendarPropertyId} onChange={setCalendarPropertyId} />
        }
      >
        <p className="text-sm text-muted">{propertiesLoading ? "Loading houses…" : "Loading calendar…"}</p>
      </ManagerPortalPageShell>
    );
  }
  if (portal === "manager" && !userId) {
    return (
      <ManagerPortalPageShell
        title={pageTitle}
        filterRow={
          <ManagerCalendarPropertyFilter properties={managerProperties} value={activeCalendarPropertyId} onChange={setCalendarPropertyId} />
        }
      >
        <p className="text-sm text-muted">Sign in to manage your availability.</p>
      </ManagerPortalPageShell>
    );
  }

  return (
    <>
      <ManagerPortalPageShell
        title={pageTitle}
        titleAsideInline
        titleAside={
          portal === "manager" ? (
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full"
              disabled={!activeCalendarPropertyId}
              title={!activeCalendarPropertyId ? "Select a house first" : undefined}
              onClick={() => setShareTourModalOpen(true)}
            >
              Share tour link
            </Button>
          ) : undefined
        }
        filterRow={
          portal === "manager" ? (
            <div className="flex w-full min-w-0 flex-col gap-3">
              <ManagerCalendarPropertyFilter
                properties={managerProperties}
                value={activeCalendarPropertyId}
                onChange={setCalendarPropertyId}
              />
              {showCoManagerCoordination ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-primary"
                    checked={shareAvailability}
                    onChange={(e) => setShareAvailabilityPreference(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold text-foreground">Share availability with co-managers</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Linked managers on this house can see when you are open for tours. You only see their availability when they opt in too.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {propertiesLoading && managerProperties.length === 0 ? (
          <p className="text-sm text-muted">Loading houses from the backend…</p>
        ) : (
          <PortalCalendarPanels
            key={storageKey ?? "calendar-unavailable"}
            storageKey={storageKey}
            calendarRefreshSignal={calendarRefreshSignal}
            tourScopeLabel={tourScopeLabel}
            unavailableMessage={
              portal === "manager" && managerProperties.length === 0
                ? "No houses found for this manager account yet."
                : "Select a house before creating tour windows."
            }
            compactAvailability
            availabilityHeading={portal === "manager" ? "Your availability" : "Schedule meeting"}
            scheduledTourFilter={
              portal === "manager" && userId
                ? {
                    viewerUserId: userId,
                    propertyId: activeCalendarPropertyId || null,
                    peers: calendarPeers,
                  }
                : undefined
            }
            coManagerAvailabilityOverlays={showCoManagerCoordination ? coManagerAvailabilityOverlays : undefined}
            otherProperties={
              portal === "manager" && activeCalendarPropertyId
                ? managerProperties.filter((p) => p.id !== activeCalendarPropertyId)
                : undefined
            }
            onCopyWeekToHouses={
              portal === "manager" && userId && activeCalendarPropertyId
                ? (propertyIds, weekDateStrs) => {
                    if (!userId || !activeCalendarPropertyId) return;
                    const srcKey = managerPropertyAvailabilityStorageKey(userId, activeCalendarPropertyId);
                    const srcSlots = readAvailabilityDateSetForStorageKey(srcKey);
                    const weekStrs = new Set(weekDateStrs);
                    const weekSrcSlots = [...srcSlots].filter((key) => weekStrs.has(key.split(":")[0] ?? ""));
                    void Promise.all(
                      propertyIds.map((pid) => {
                        const dstKey = managerPropertyAvailabilityStorageKey(userId, pid);
                        const dstSlots = new Set(readAvailabilityDateSetForStorageKey(dstKey));
                        for (const slot of weekSrcSlots) dstSlots.add(slot);
                        return writeAvailabilityDateSetForStorageKeyToServer(dstSlots, dstKey);
                      }),
                    )
                      .then((results) => {
                        if (results.some((ok) => !ok)) showToast("Could not save every house schedule to backend.");
                        return syncScheduleRecordsFromServer({ force: true });
                      })
                      .finally(() => setCalendarRefreshSignal((n) => n + 1));
                    const destNames = propertyIds
                      .map((id) => managerProperties.find((p) => p.id === id)?.name ?? id)
                      .join(", ");
                    showToast(`Week schedule pushed to: ${destNames}.`);
                  }
                : undefined
            }
          />
        )}
      </ManagerPortalPageShell>
      {portal === "manager" ? (
        <ShareLeadLinkModal
          open={shareTourModalOpen}
          onClose={() => setShareTourModalOpen(false)}
          kind="tour"
          properties={shareableProperties}
          preselectedPropertyId={activeCalendarPropertyId || undefined}
        />
      ) : null}
    </>
  );
}
