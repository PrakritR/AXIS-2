"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ManagerPortalPageShell } from "./portal-metrics";
import { PortalCalendarPanels } from "./portal-calendar-panels";
import {
  ADMIN_AVAILABILITY_STORAGE_KEY,
  managerPropertyAvailabilityStorageKey,
  readAvailabilityDateSetForStorageKey,
  registerManagerForProperty,
  syncScheduleRecordsFromServer,
  writeAvailabilityDateSetForStorageKeyToServer,
  toLocalDateStr,
  startOfWeekMonday,
} from "@/lib/demo-admin-scheduling";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";

type CopyRange = "week" | "future" | "all";

const selectClassName =
  "h-10 min-w-[12rem] max-w-full rounded-full border border-slate-200/90 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:ring-2 focus:ring-primary/25";

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
      {!value ? (
        <p className="min-w-0 text-xs leading-snug text-slate-500">
          Choose a house before creating tour windows.
        </p>
      ) : null}
    </div>
  );
}

export function PortalCalendar({ portal }: { portal: "manager" | "admin" }) {
  const { userId, email, ready: authReady } = useManagerUserId();
  const { showToast } = useAppUi();
  const [calendarRefreshSignal, setCalendarRefreshSignal] = useState(0);
  const [calendarPropertyId, setCalendarPropertyId] = useState<string>("");
  const [propertyTick, setPropertyTick] = useState(0);
  const [propertiesLoading, setPropertiesLoading] = useState(false);

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string>("");
  const [copyDestId, setCopyDestId] = useState<string>("");
  const [copyRange, setCopyRange] = useState<CopyRange>("all");

  useEffect(() => {
    if (portal !== "manager") return;
    const bump = () => setPropertyTick((n) => n + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, [portal]);

  useEffect(() => {
    if (portal !== "manager" || !authReady || !userId) return;
    let cancelled = false;
    setPropertiesLoading(true);
    syncPropertyPipelineFromServer()
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
    const live = readExtraListingsForUser(userId).map((property) => ({
      id: property.id,
      name: property.title?.trim() || property.buildingName?.trim() || property.address?.trim() || property.id,
    }));
    const pending = readPendingManagerPropertiesForUser(userId).map((property) => ({
      id: property.id,
      name:
        property.buildingName?.trim() ||
        property.submission?.buildingName?.trim() ||
        property.address?.trim() ||
        property.id,
    }));
    return [...live, ...pending]
      .filter((property, index, list) => list.findIndex((candidate) => candidate.id === property.id) === index)
      .map((property) => ({
        id: property.id,
        name: property.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [portal, userId, propertyTick]);

  useEffect(() => {
    if (portal !== "manager") return;
    if (!calendarPropertyId) return;
    if (!managerProperties.some((property) => property.id === calendarPropertyId)) {
      setCalendarPropertyId("");
    }
  }, [portal, calendarPropertyId, managerProperties]);

  // Register this manager as a tour host for the selected property so the public
  // booking page can discover combined availability across all linked managers.
  useEffect(() => {
    if (portal !== "manager" || !userId || !calendarPropertyId) return;
    const label = email || userId;
    registerManagerForProperty(userId, calendarPropertyId, label);
  }, [portal, userId, email, calendarPropertyId]);

  const openCopyModal = useCallback(() => {
    setCopySourceId(calendarPropertyId);
    setCopyDestId("");
    setCopyRange("all");
    setCopyModalOpen(true);
  }, [calendarPropertyId]);

  const executeCopy = useCallback(() => {
    if (!userId || !copySourceId || !copyDestId || copySourceId === copyDestId) return;
    const srcKey = managerPropertyAvailabilityStorageKey(userId, copySourceId);
    const dstKey = managerPropertyAvailabilityStorageKey(userId, copyDestId);
    const srcSlots = readAvailabilityDateSetForStorageKey(srcKey);
    const dstSlots = new Set(readAvailabilityDateSetForStorageKey(dstKey));

    const todayStr = toLocalDateStr(new Date());
    const weekMonday = startOfWeekMonday(new Date());
    const weekStrs = new Set(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekMonday);
        d.setDate(d.getDate() + i);
        return toLocalDateStr(d);
      }),
    );

    for (const key of srcSlots) {
      // key format: "YYYY-MM-DD:slot"
      const dateStr = key.split(":")[0] ?? "";
      if (copyRange === "week" && !weekStrs.has(dateStr)) continue;
      if (copyRange === "future" && dateStr < todayStr) continue;
      dstSlots.add(key);
    }

    setCopyModalOpen(false);
    void writeAvailabilityDateSetForStorageKeyToServer(dstSlots, dstKey)
      .then((ok) => {
        if (!ok) showToast("Could not save copied schedule to backend.");
        return syncScheduleRecordsFromServer();
      })
      .finally(() => setCalendarRefreshSignal((n) => n + 1));
    const srcName = managerProperties.find((p) => p.id === copySourceId)?.name ?? copySourceId;
    const dstName = managerProperties.find((p) => p.id === copyDestId)?.name ?? copyDestId;
    showToast(`Copied schedule from ${srcName} → ${dstName}.`);
  }, [userId, copySourceId, copyDestId, copyRange, managerProperties, showToast]);

  const storageKey = useMemo(() => {
    if (portal === "admin") return ADMIN_AVAILABILITY_STORAGE_KEY;
    if (!userId) return null;
    if (!calendarPropertyId) return null;
    return managerPropertyAvailabilityStorageKey(userId, calendarPropertyId);
  }, [portal, userId, calendarPropertyId]);

  const tourScopeLabel = useMemo(() => {
    if (portal !== "manager") return undefined;
    if (!calendarPropertyId) return undefined;
    const name = managerProperties.find((p) => p.id === calendarPropertyId)?.name;
    return name ? `Tours · ${name}` : undefined;
  }, [portal, calendarPropertyId, managerProperties]);

  const reloadAvailability = () => setCalendarRefreshSignal((n) => n + 1);

  if (portal === "manager" && !authReady) {
    return (
      <ManagerPortalPageShell
        title="Calendar"
        titleAside={
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={reloadAvailability}>
            Refresh
          </Button>
        }
        filterRow={
          <ManagerCalendarPropertyFilter properties={managerProperties} value={calendarPropertyId} onChange={setCalendarPropertyId} />
        }
      >
        <p className="text-sm text-slate-500">{propertiesLoading ? "Loading houses…" : "Loading calendar…"}</p>
      </ManagerPortalPageShell>
    );
  }
  if (portal === "manager" && !userId) {
    return (
      <ManagerPortalPageShell
        title="Calendar"
        titleAside={
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={reloadAvailability}>
            Refresh
          </Button>
        }
        filterRow={
          <ManagerCalendarPropertyFilter properties={managerProperties} value={calendarPropertyId} onChange={setCalendarPropertyId} />
        }
      >
        <p className="text-sm text-slate-600">Sign in to manage your availability.</p>
      </ManagerPortalPageShell>
    );
  }

  const copyModal = portal === "manager" && managerProperties.length > 1 ? (
    <Modal
      open={copyModalOpen}
      title="Copy schedule between houses"
      onClose={() => setCopyModalOpen(false)}
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          Copy availability slots from one house to another. Copied slots are added on top of existing slots in the destination — nothing is removed.
        </p>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-900">Copy from</label>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            value={copySourceId}
            onChange={(e) => {
              setCopySourceId(e.target.value);
              if (e.target.value === copyDestId) setCopyDestId("");
            }}
          >
            <option value="">Select source house</option>
            {managerProperties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-900">Copy to</label>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            value={copyDestId}
            onChange={(e) => setCopyDestId(e.target.value)}
          >
            <option value="">Select destination house</option>
            {managerProperties
              .filter((p) => p.id !== copySourceId)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">Date range</p>
          <div className="space-y-2">
            {(
              [
                { id: "all", label: "Entire schedule", desc: "Copy all stored availability slots" },
                { id: "future", label: "Future dates only", desc: "Copy only slots from today onwards" },
                { id: "week", label: "This week only", desc: "Copy only slots in the current calendar week" },
              ] as const
            ).map(({ id, label, desc }) => (
              <label
                key={id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                  copyRange === id
                    ? "border-primary bg-primary/[0.06] ring-1 ring-primary/30"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="copy-range"
                  value={id}
                  checked={copyRange === id}
                  onChange={() => setCopyRange(id)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{label}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {copySourceId && copyDestId ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Copying <span className="font-semibold text-slate-800">{managerProperties.find((p) => p.id === copySourceId)?.name}</span>
            {" → "}
            <span className="font-semibold text-slate-800">{managerProperties.find((p) => p.id === copyDestId)?.name}</span>
            {copyRange === "week" ? " · this week" : copyRange === "future" ? " · future dates" : " · all dates"}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setCopyModalOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={!copySourceId || !copyDestId}
            onClick={executeCopy}
          >
            Copy schedule
          </Button>
        </div>
      </div>
    </Modal>
  ) : null;

  return (
    <>
      <ManagerPortalPageShell
        title="Calendar"
        titleAside={
          <div className="flex shrink-0 flex-wrap gap-2">
            {portal === "manager" && managerProperties.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                className="shrink-0 rounded-full"
                onClick={openCopyModal}
                title="Copy availability schedule from one house to another"
              >
                Copy schedule
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={reloadAvailability}>
              Refresh
            </Button>
          </div>
        }
        filterRow={
          portal === "manager" ? (
            <ManagerCalendarPropertyFilter properties={managerProperties} value={calendarPropertyId} onChange={setCalendarPropertyId} />
          ) : undefined
        }
      >
        {propertiesLoading && managerProperties.length === 0 ? (
          <p className="text-sm text-slate-500">Loading houses from the backend…</p>
        ) : (
          <PortalCalendarPanels
            storageKey={storageKey}
            calendarRefreshSignal={calendarRefreshSignal}
            tourScopeLabel={tourScopeLabel}
            unavailableMessage={
              portal === "manager" && managerProperties.length === 0
                ? "No houses found for this manager account yet."
                : "Select a house before creating tour windows."
            }
            compactAvailability
            scheduledTourFilter={
              portal === "manager" ? { managerUserId: userId, propertyId: calendarPropertyId || null } : undefined
            }
            otherProperties={
              portal === "manager" && calendarPropertyId
                ? managerProperties.filter((p) => p.id !== calendarPropertyId)
                : undefined
            }
            onCopyWeekToHouses={
              portal === "manager" && userId && calendarPropertyId
              ? (propertyIds, weekDateStrs) => {
                    if (!userId || !calendarPropertyId) return;
                    const srcKey = managerPropertyAvailabilityStorageKey(userId, calendarPropertyId);
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
                        return syncScheduleRecordsFromServer();
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
      {copyModal}
    </>
  );
}
