"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  PORTAL_HEADER_ACTION_BTN,
} from "./portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
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
  startOfWeekMonday,
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
import { TourProposalsPanel } from "@/components/portal/tour-proposals-panel";
import { GoogleCalendarConnectDialog } from "@/components/portal/google-calendar-connect-dialog";
import type { DemoMeeting } from "@/components/portal/portal-calendar-panels";
import { listManagerServiceCalendarMeetings } from "@/lib/manager-service-calendar";
import {
  MANAGER_WORK_ORDERS_EVENT,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";
import {
  readPartnerInquiries,
  readPlannedEvents,
  getPartnerInquiryWindows,
} from "@/lib/demo-admin-scheduling";

type ManagerCalendarView = "all" | "tours" | "services";

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
  const [googleExternalMeetings, setGoogleExternalMeetings] = useState<DemoMeeting[]>([]);
  const [googleCalendarTick, setGoogleCalendarTick] = useState(0);
  const [calendarView, setCalendarView] = useState<ManagerCalendarView>("all");
  const [workOrderTick, setWorkOrderTick] = useState(0);


  useEffect(() => {
    if (portal !== "manager") return;
    const bump = () => setWorkOrderTick((n) => n + 1);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    void syncManagerWorkOrdersFromServer().then(() => bump());
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
  }, [portal]);

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
    const weekStart = startOfWeekMonday(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 14);
    void fetch(
      `/api/portal/google-calendar/events?timeMin=${encodeURIComponent(weekStart.toISOString())}&timeMax=${encodeURIComponent(weekEnd.toISOString())}`,
      { credentials: "include" },
    )
      .then(async (res) => {
        const data = (await res.json()) as {
          meetings?: DemoMeeting[];
          warning?: string;
          hint?: string;
        };
        if (!res.ok) return { meetings: [] as DemoMeeting[], warning: undefined as string | undefined };
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          setGoogleExternalMeetings(Array.isArray(data.meetings) ? data.meetings : []);
          if (data.warning === "calendar_api_disabled") {
            showToast(
              data.hint ??
                "Enable the Google Calendar API in Google Cloud Console, then refresh this page.",
            );
          } else if (data.warning === "calendar_oauth_not_configured" || data.warning === "calendar_not_connected") {
            showToast(data.hint ?? "Google Calendar sync is not ready yet.");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setGoogleExternalMeetings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [portal, authReady, userId, calendarRefreshSignal, googleCalendarTick, showToast]);

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

  const managerPropertyFilterOptions = useMemo(() => {
    if (portal !== "manager" || !userId) return [];
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId);
  }, [portal, userId, propertyTick]);

  const managerProperties = useMemo(
    () => managerPropertyFilterOptions.map((property) => ({ id: property.id, name: property.label })),
    [managerPropertyFilterOptions],
  );

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
    if (portal !== "manager") return [];
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


  const serviceCalendarMeetings = useMemo(() => {
    if (portal !== "manager" || !userId) return [] as DemoMeeting[];
    void workOrderTick;
    return listManagerServiceCalendarMeetings(userId, activeCalendarPropertyId || null);
  }, [portal, userId, activeCalendarPropertyId, workOrderTick]);

  const calendarTabCounts = useMemo(() => {
    if (portal !== "manager" || !userId) {
      return { all: 0, tours: 0, services: serviceCalendarMeetings.length };
    }
    void calendarRefreshSignal;
    void workOrderTick;
    const tourFilter = {
      viewerUserId: userId,
      propertyId: activeCalendarPropertyId || null,
      peers: calendarPeers,
    };
    const plannedTours = readPlannedEvents().filter(
      (event) => event.kind === "tour" && plannedTourVisibleToViewer(event, tourFilter),
    ).length;
    const pendingTours = readPartnerInquiries()
      .filter((row) => row.kind === "tour" && row.status === "pending")
      .filter((row) => tourInquiryVisibleToViewer(row, tourFilter))
      .flatMap((row) => getPartnerInquiryWindows(row)).length;
    const services = serviceCalendarMeetings.length;
    const tours = plannedTours + pendingTours;
    return { all: tours + services, tours, services };
  }, [
    portal,
    userId,
    activeCalendarPropertyId,
    calendarPeers,
    calendarRefreshSignal,
    workOrderTick,
    serviceCalendarMeetings.length,
  ]);

  const calendarTabs = useMemo(
    () => [
      { id: "all", label: "All", count: calendarTabCounts.all, dataAttr: "calendar-tab-all" },
      { id: "tours", label: "Tours", count: calendarTabCounts.tours, dataAttr: "calendar-tab-tours" },
      {
        id: "services",
        label: "Service orders",
        count: calendarTabCounts.services,
        dataAttr: "calendar-tab-services",
      },
    ],
    [calendarTabCounts],
  );

  const showTourAvailability = calendarView === "tours" || calendarView === "all";
  const showServiceVisits = calendarView === "services" || calendarView === "all";
  const servicesOnlyView = calendarView === "services";

  const mergedExternalMeetings = useMemo(() => {
    const base = portal === "manager" ? [...googleExternalMeetings] : [];
    if (showServiceVisits) base.push(...serviceCalendarMeetings);
    return base;
  }, [portal, googleExternalMeetings, serviceCalendarMeetings, showServiceVisits]);

  const calendarPanelsReadOnly = servicesOnlyView || (calendarView === "all" && !activeCalendarPropertyId);
  const calendarStorageKey = showTourAvailability && !servicesOnlyView ? storageKey : servicesOnlyView ? null : storageKey;
  const calendarUnavailableMessage = servicesOnlyView
    ? "No scheduled service visits yet. Vendor visits and your own assigned work appear here once a visit time is set."
    : calendarView === "all" && !activeCalendarPropertyId
      ? "Select a house to edit tour availability, or stay on this view to see service visits across your portfolio."
      : "Select a house before creating tour windows.";


  const pageTitle = portal === "manager" ? "Calendar" : "Schedule meeting";

  if (portal === "manager" && !authReady) {
    return (
      <ManagerPortalPageShell
        title={pageTitle}
        filterRow={
          <ManagerPortalFilterRow>
              <ManagerPortalStatusPills
                tabs={calendarTabs}
                activeId={calendarView}
                onChange={(id) => setCalendarView(id as ManagerCalendarView)}
              />
              <PortalPropertyFilterPill
                propertyOptions={managerPropertyFilterOptions}
                propertyValue={activeCalendarPropertyId}
                onPropertyChange={setCalendarPropertyId}
                propertyPlaceholder={calendarView === "tours" ? "Select a house" : "All your properties"}
              />
          </ManagerPortalFilterRow>
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
          <ManagerPortalFilterRow>
              <ManagerPortalStatusPills
                tabs={calendarTabs}
                activeId={calendarView}
                onChange={(id) => setCalendarView(id as ManagerCalendarView)}
              />
              <PortalPropertyFilterPill
                propertyOptions={managerPropertyFilterOptions}
                propertyValue={activeCalendarPropertyId}
                onPropertyChange={setCalendarPropertyId}
                propertyPlaceholder={calendarView === "tours" ? "Select a house" : "All your properties"}
              />
          </ManagerPortalFilterRow>
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
        titleAside={
          <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
            {portal === "manager" ? (
              <GoogleCalendarConnectDialog onConnectionChange={() => setGoogleCalendarTick((n) => n + 1)} />
            ) : null}
            {portal === "manager" ? (
              <Button
                type="button"
                variant="outline"
                className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
                disabled={!activeCalendarPropertyId || calendarView === "services"}
                title={
                  calendarView === "services"
                    ? "Switch to Tours or All to share a tour link"
                    : !activeCalendarPropertyId
                      ? "Select a house first"
                      : "Share tour link"
                }
                onClick={() => setShareTourModalOpen(true)}
              >
                Share tour
              </Button>
            ) : null}
          </div>
        }
        filterRow={
          portal === "manager" ? (
            <div className="flex w-full min-w-0 flex-col gap-3">
            <ManagerPortalFilterRow>
              <ManagerPortalStatusPills
                tabs={calendarTabs}
                activeId={calendarView}
                onChange={(id) => setCalendarView(id as ManagerCalendarView)}
              />
              <PortalPropertyFilterPill
                propertyOptions={managerPropertyFilterOptions}
                propertyValue={activeCalendarPropertyId}
                onPropertyChange={setCalendarPropertyId}
                propertyPlaceholder={calendarView === "tours" ? "Select a house" : "All your properties"}
              />
            </ManagerPortalFilterRow>
              {showCoManagerCoordination ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm">
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
        {portal === "manager" && calendarView !== "services" ? (
          <div className="mb-4">
            <TourProposalsPanel />
          </div>
        ) : null}
        {portal === "manager" && servicesOnlyView ? (
          <p className="mb-3 text-sm text-muted">
            Scheduled vendor visits and work you assigned to yourself. Filter by house or leave all properties selected to see your full service schedule.
          </p>
        ) : null}
        {propertiesLoading && managerProperties.length === 0 ? (
          <p className="text-sm text-muted">Loading houses from the backend…</p>
        ) : (
          <PortalCalendarPanels
            key={`${calendarStorageKey ?? "calendar-unavailable"}-${calendarView}`}
            storageKey={calendarStorageKey}
            calendarRefreshSignal={calendarRefreshSignal}
            tourScopeLabel={tourScopeLabel}
            unavailableMessage={
              portal === "manager" && managerProperties.length === 0
                ? "No houses found for this manager account yet."
                : calendarUnavailableMessage
            }
            compactAvailability
            availabilityHeading={portal === "manager" ? "Your availability" : "Schedule meeting"}
            scheduledTourFilter={
              portal === "manager" && userId && showTourAvailability
                ? {
                    viewerUserId: userId,
                    propertyId: activeCalendarPropertyId || null,
                    peers: calendarPeers,
                  }
                : undefined
            }
            coManagerAvailabilityOverlays={showCoManagerCoordination ? coManagerAvailabilityOverlays : undefined}
            externalMeetings={portal === "manager" ? mergedExternalMeetings : undefined}
            readOnly={portal === "manager" ? calendarPanelsReadOnly : false}
            eventSummaryLabel={servicesOnlyView ? "visit" : calendarView === "all" ? "event" : "tour"}
            preferEventCountsInDayHeader={calendarView !== "tours"}
            otherProperties={
              portal === "manager" && activeCalendarPropertyId
                ? managerProperties.filter((p) => p.id !== activeCalendarPropertyId)
                : undefined
            }
            onCopyWeekToHouses={
              portal === "manager" && userId && activeCalendarPropertyId
                ? (propertyIds, weekDateStrs, scope) => {
                    if (!userId || !activeCalendarPropertyId) return;
                    const srcKey = managerPropertyAvailabilityStorageKey(userId, activeCalendarPropertyId);
                    const srcSlots = readAvailabilityDateSetForStorageKey(srcKey);
                    const weekStrs = new Set(weekDateStrs);
                    const slotsToCopy =
                      scope === "entire"
                        ? [...srcSlots]
                        : [...srcSlots].filter((key) => weekStrs.has(key.split(":")[0] ?? ""));
                    void Promise.all(
                      propertyIds.map((pid) => {
                        const dstKey = managerPropertyAvailabilityStorageKey(userId, pid);
                        const dstSlots = new Set(readAvailabilityDateSetForStorageKey(dstKey));
                        for (const slot of slotsToCopy) dstSlots.add(slot);
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
                    showToast(
                      scope === "entire"
                        ? `Full schedule copied to: ${destNames}.`
                        : `This week's schedule copied to: ${destNames}.`,
                    );
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
