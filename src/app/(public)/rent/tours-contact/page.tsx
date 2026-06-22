"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { loadPublicExtraListingsFromServer, PROPERTY_PIPELINE_EVENT, readExtraListingsPublic } from "@/lib/demo-property-pipeline";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  appendPartnerInquiryToServer,
  dateHasAvailability,
  dateSlotKey,
  formatAvailabilitySlotLabel,
  localDateAtSlotStart,
  type PropertyManagerEntry,
  toLocalDateStr,
} from "@/lib/demo-admin-scheduling";
import Link from "next/link";
import { SegmentedTwo } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { WizardShell } from "@/components/ui/wizard-shell";
import {
  PropertySearchPicker,
  buildingGroupsToSearchOptions,
  type PropertySearchOption,
} from "@/components/marketing/property-search-picker";

type Tab = "tour" | "message";
type TourStep = 1 | 2 | 3;

// --- helper ---
const TOPICS = [
  "General leasing question",
  "Availability & move-in dates",
  "Neighborhood & area",
  "Application process",
  "Pricing & fees",
  "Pet policy",
  "Other",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

type BuildingGroup = {
  buildingId: string;
  buildingName: string;
  address: string;
  neighborhood: string;
  units: MockProperty[];
};

type TourRoomOption = {
  key: string;
  label: string;
  subtitle: string;
  property: MockProperty;
};

function roomOptionsForProperty(p: MockProperty): TourRoomOption[] {
  if (p.listingSubmission?.v === 1) {
    const sub = normalizeManagerListingSubmissionV1(p.listingSubmission);
    const rooms = sub.rooms.filter((r) => r.name.trim());
    if (rooms.length > 0) {
      return rooms.map((room) => {
        const parts = [room.name.trim(), room.floor.trim(), room.monthlyRent > 0 ? `$${room.monthlyRent}/mo` : ""].filter(Boolean);
        return {
          key: `${p.id}::${room.id}`,
          label: parts.join(" · "),
          subtitle: p.title,
          property: p,
        };
      });
    }
  }
  return [
    {
      key: p.id,
      label: `${p.buildingName} · ${p.unitLabel}`,
      subtitle: `${p.neighborhood} · ${p.rentLabel}`,
      property: p,
    },
  ];
}

function groupByBuilding(properties: MockProperty[]): BuildingGroup[] {
  const map = new Map<string, BuildingGroup>();
  for (const p of properties) {
    const cur = map.get(p.buildingId);
    if (cur) cur.units.push(p);
    else {
      map.set(p.buildingId, {
        buildingId: p.buildingId,
        buildingName: p.buildingName,
        address: p.address,
        neighborhood: p.neighborhood,
        units: [p],
      });
    }
  }
  const list = [...map.values()].sort((a, b) => a.buildingName.localeCompare(b.buildingName));
  for (const g of list) {
    g.units.sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, undefined, { numeric: true }));
  }
  return list;
}

function openSlotIndicesForDateStr(availability: Set<string>, dateStr: string): number[] {
  const out: number[] = [];
  for (const key of availability) {
    const [keyDate, slotText] = key.split(":");
    if (keyDate !== dateStr) continue;
    const slotIndex = Number.parseInt(slotText ?? "", 10);
    if (Number.isFinite(slotIndex)) out.push(slotIndex);
  }
  return out.sort((a, b) => a - b);
}

export default function ToursContactPage() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("tour");
  const [extras, setExtras] = useState<MockProperty[]>([]);
  const initialPropertyId = searchParams.get("propertyId")?.trim() || null;

  useEffect(() => {
    const sync = () => {
      setExtras(readExtraListingsPublic());
      void loadPublicExtraListingsFromServer().then(setExtras);
    };
    sync();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, sync);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, sync);
    };
  }, []);

  const publicProperties = useMemo(() => [...mockProperties, ...extras], [extras]);

  return (
    <div className="min-h-screen px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {tab === "tour" ? "Schedule tour" : "Message Axis"}
        </h1>

        <div className="mt-6">
          <SegmentedTwo
            value={tab}
            onChange={(id) => setTab(id)}
            left={{ id: "tour", label: "Set up tour" }}
            right={{ id: "message", label: "Send message" }}
          />
        </div>

        <div key={tab} className="animate-fade-in">
          {tab === "tour" ? (
            <TourFlow
              properties={publicProperties}
              initialPropertyId={initialPropertyId}
              onSuccess={() => showToast("Tour booked.")}
            />
          ) : (
            <MessageFlow properties={publicProperties} onSuccess={() => showToast("Message sent.")} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   TOUR FLOW
──────────────────────────────────────────────────────────── */
function TourFlow({
  properties,
  initialPropertyId,
  onSuccess,
}: {
  properties: MockProperty[];
  initialPropertyId?: string | null;
  onSuccess: () => void;
}) {
  const { showToast } = useAppUi();
  const [step, setStep] = useState<TourStep>(1);
  const [submitted, setSubmitted] = useState(false);
  const [tick, setTick] = useState(0);
  const [selectedProperty, setSelectedProperty] = useState<MockProperty | null>(null);
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null);
  const selectedRoomLabel = useMemo(() => {
    if (!selectedProperty || !selectedRoomKey) return "";
    const hit = roomOptionsForProperty(selectedProperty).find((o) => o.key === selectedRoomKey);
    return hit?.label ?? selectedProperty.title;
  }, [selectedProperty, selectedRoomKey]);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [slotHosts, setSlotHosts] = useState<Record<string, PropertyManagerEntry[]>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [bookingTour, setBookingTour] = useState(false);
  const buildings = useMemo(() => groupByBuilding(properties), [properties]);

  const propertyFromInitialId = useMemo(() => {
    const pid = initialPropertyId?.trim();
    if (!pid) return null;
    return properties.find((p) => p.id === pid) ?? null;
  }, [initialPropertyId, properties]);

  const [manualStep1Phase, setManualStep1Phase] = useState<"property" | "room" | null>(null);
  const [manualBuildingId, setManualBuildingId] = useState<string | null>(null);

  const step1Phase = manualStep1Phase ?? (propertyFromInitialId ? "room" : "property");
  const selectedBuildingId = manualBuildingId ?? propertyFromInitialId?.buildingId ?? null;

  const setStep1Phase = (phase: "property" | "room") => setManualStep1Phase(phase);
  const setSelectedBuildingId = (id: string | null) => setManualBuildingId(id);

  useEffect(() => {
    const sync = () => setTick((n) => n + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, sync);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    if (!selectedProperty) return;
    let cancelled = false;
    const params = new URLSearchParams({
      propertyId: selectedProperty.id,
      buildingName: selectedProperty.buildingName,
      address: selectedProperty.address,
    });
    void fetch(`/api/public/property-tour-availability?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as { slotHosts?: Record<string, PropertyManagerEntry[]> };
        if (!cancelled) setSlotHosts(res.ok && body.slotHosts ? body.slotHosts : {});
      })
      .catch(() => {
        if (!cancelled) setSlotHosts({});
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProperty]);

  const selectedAvailability = useMemo(() => {
    void tick;
    return new Set(Object.entries(slotHosts).filter(([, hosts]) => hosts.length > 0).map(([slot]) => slot));
  }, [slotHosts, tick]);

  // Map from slot key ("YYYY-MM-DD:slotIndex") to managers available at that slot.
  const slotManagerMap = useMemo(() => {
    const map = new Map<string, PropertyManagerEntry[]>();
    for (const [slot, hosts] of Object.entries(slotHosts)) {
      map.set(slot, hosts);
    }
    return map;
  }, [slotHosts]);

  // Managers available at the currently selected slot.
  const managersAtSelectedSlot = useMemo(() => {
    if (selectedDay == null || selectedSlotIndex == null) return [];
    const dateStr = toLocalDateStr(new Date(calYear, calMonth, selectedDay, 12, 0, 0, 0));
    return slotManagerMap.get(`${dateStr}:${selectedSlotIndex}`) ?? [];
  }, [selectedDay, selectedSlotIndex, calYear, calMonth, slotManagerMap]);

  const canContinue1 = selectedProperty !== null && selectedRoomKey !== null;
  const canContinue2 =
    selectedDay !== null &&
    selectedSlotIndex !== null &&
    managersAtSelectedSlot.length > 0;

  const tourWizardSteps = [
    { id: "property", label: "Property & room" },
    { id: "datetime", label: "Date & time" },
    { id: "details", label: "Your details" },
  ];

  const handleTourBack = () => {
    if (step === 2) {
      setStep(1);
      if (selectedProperty) {
        setStep1Phase("room");
        setSelectedBuildingId(selectedProperty.buildingId);
      } else {
        setStep1Phase("property");
        setSelectedBuildingId(null);
      }
      return;
    }
    setStep((s) => (s - 1) as TourStep);
  };

  if (submitted) {
    return (
      <div className="glass-card mt-4 overflow-hidden rounded-3xl p-7">
        <div className="rounded-2xl border border-[var(--status-confirmed-bg)] bg-[var(--status-confirmed-bg)] px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--status-confirmed-fg)]">Tour request sent</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Your tour request is in</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            We sent your tour request to the Axis team. Check your email for tour confirmation, the meeting link if needed,
            and next steps.
          </p>
          {selectedProperty ? (
            <p className="mt-3 text-sm font-medium text-foreground">
              Requested tour: {selectedProperty.title}
              {selectedDay && selectedSlotIndex != null
                ? ` · ${MONTHS[calMonth]} ${selectedDay}, ${calYear} · ${formatAvailabilitySlotLabel(selectedSlotIndex)}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSubmitted(false);
              setStep(1);
              setStep1Phase("property");
              setSelectedBuildingId(null);
              setSelectedProperty(null);
              setSelectedRoomKey(null);
              setSelectedDay(null);
              setSelectedSlotIndex(null);
            }}
          >
            Request another tour
          </Button>
          <Link href="/rent/listings" className="btn-cobalt inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold">
            Back to listings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card mt-4 overflow-hidden rounded-3xl">
      <WizardShell
        steps={tourWizardSteps}
        currentStepIndex={step - 1}
        footer={
          <div className={`flex w-full ${step > 1 ? "justify-between" : "justify-end"}`}>
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={handleTourBack}>
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < 3 ? (
              <Button
                type="button"
                disabled={step === 1 ? !canContinue1 : !canContinue2}
                onClick={() => setStep((s) => (s + 1) as TourStep)}
              >
                Continue
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="mb-6 border-b border-border pb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Step {step} of 3</p>
          <p className="mt-1 text-lg font-bold tracking-tight text-foreground">{tourWizardSteps[step - 1]?.label}</p>
        </div>

        <div>
        {step === 1 && (
          <Step1
            buildings={buildings}
            phase={step1Phase}
            selectedBuildingId={selectedBuildingId}
            onSelectBuilding={(id) => {
              setSelectedBuildingId(id);
              setSelectedProperty(null);
              setSelectedRoomKey(null);
              setSlotHosts({});
              setSelectedDay(null);
              setSelectedSlotIndex(null);
              setStep1Phase("room");
            }}
            onBackToProperties={() => {
              setSelectedBuildingId(null);
              setSelectedProperty(null);
              setSelectedRoomKey(null);
              setSlotHosts({});
              setSelectedDay(null);
              setSelectedSlotIndex(null);
              setStep1Phase("property");
            }}
            onSelectRoom={(p, roomKey) => {
              if (!p || !roomKey) {
                setSelectedProperty(null);
                setSelectedRoomKey(null);
                setSlotHosts({});
                setSelectedDay(null);
                setSelectedSlotIndex(null);
                return;
              }
              setSelectedProperty(p);
              setSelectedBuildingId(p.buildingId);
              setSelectedRoomKey(roomKey);
              setSlotHosts({});
              setAvailabilityLoading(true);
              setSelectedDay(null);
              setSelectedSlotIndex(null);
            }}
            selectedRoomKey={selectedRoomKey}
          />
        )}
        {step === 2 && (
          <Step2
            property={selectedProperty}
            availability={selectedAvailability}
            calMonth={calMonth}
            calYear={calYear}
            onPrevMonth={() => {
              if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
              else setCalMonth(m => m - 1);
              setSelectedDay(null);
              setSelectedSlotIndex(null);
            }}
            onNextMonth={() => {
              if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
              else setCalMonth(m => m + 1);
              setSelectedDay(null);
              setSelectedSlotIndex(null);
            }}
            selectedDay={selectedDay}
            onSelectDay={(day) => {
              setSelectedDay(day);
              setSelectedSlotIndex(null);
            }}
            selectedSlotIndex={selectedSlotIndex}
            onSelectSlotIndex={setSelectedSlotIndex}
            managersAtSelectedSlot={managersAtSelectedSlot}
            availabilityLoading={availabilityLoading}
          />
        )}
        {step === 3 && (
          <Step3
            property={selectedProperty}
            roomLabel={selectedRoomLabel}
            day={selectedDay}
            slotIndex={selectedSlotIndex}
            month={calMonth}
            year={calYear}
            submitting={bookingTour}
            onSubmit={async ({ name, email, phone, notes }) => {
              if (bookingTour) return;
              if (!name.trim() || !email.trim()) {
                showToast("Please enter your name and email.");
                return;
              }
              if (!selectedProperty || selectedDay == null || selectedSlotIndex == null) return;
              if (managersAtSelectedSlot.length === 0) {
                showToast("That tour time is no longer available.");
                return;
              }
              const dateStr = toLocalDateStr(new Date(calYear, calMonth, selectedDay, 12, 0, 0, 0));
              const start = localDateAtSlotStart(dateStr, selectedSlotIndex);
              const end = new Date(start.getTime() + 30 * 60 * 1000);
              const selectedSlotKey = dateSlotKey(dateStr, selectedSlotIndex);
              const propertyContext = [
                `Property: ${selectedProperty.title}`,
                selectedRoomLabel ? `Room: ${selectedRoomLabel}` : "",
              ]
                .filter(Boolean)
                .join("\n");
              setBookingTour(true);
              const tourGroupId = crypto.randomUUID();
              const results = await Promise.all(
                managersAtSelectedSlot.map((manager) =>
                  appendPartnerInquiryToServer({
                    name: name.trim(),
                    email: email.trim(),
                    phone: phone.trim(),
                    kind: "tour",
                    managerUserId: manager.userId,
                    tourGroupId,
                    propertyId: manager.propertyId || selectedProperty.id,
                    propertyTitle: selectedProperty.title,
                    roomLabel: selectedRoomLabel,
                    notes: [propertyContext, notes.trim()].filter(Boolean).join("\n\n"),
                    adminUserId: manager.userId,
                    adminLabel: manager.label,
                    requestedWindows: [{
                      start: start.toISOString(),
                      end: end.toISOString(),
                      adminUserId: manager.userId,
                      adminLabel: manager.label,
                      slotKey: selectedSlotKey,
                    }],
                    proposedStart: start.toISOString(),
                    proposedEnd: end.toISOString(),
                  }),
                ),
              );
              setBookingTour(false);
              const failedResult = results.find((item) => !item.ok);
              if (failedResult) {
                showToast(failedResult.error ?? "That tour time is no longer available.");
                setStep(2);
                setSelectedSlotIndex(null);
                const params = new URLSearchParams({
                  propertyId: selectedProperty.id,
                  buildingName: selectedProperty.buildingName,
                  address: selectedProperty.address,
                });
                setAvailabilityLoading(true);
                void fetch(`/api/public/property-tour-availability?${params.toString()}`, { cache: "no-store" })
                  .then(async (res) => {
                    const body = (await res.json()) as { slotHosts?: Record<string, PropertyManagerEntry[]> };
                    setSlotHosts(res.ok && body.slotHosts ? body.slotHosts : {});
                  })
                  .catch(() => setSlotHosts({}))
                  .finally(() => setAvailabilityLoading(false));
                return;
              }
              setSubmitted(true);
              onSuccess();
            }}
          />
        )}
        </div>
      </WizardShell>
    </div>
  );
}

function Step1({
  buildings,
  phase,
  selectedBuildingId,
  onSelectBuilding,
  onBackToProperties,
  onSelectRoom,
  selectedRoomKey,
}: {
  buildings: BuildingGroup[];
  phase: "property" | "room";
  selectedBuildingId: string | null;
  onSelectBuilding: (buildingId: string) => void;
  onBackToProperties: () => void;
  onSelectRoom: (p: MockProperty | null, roomKey: string | null) => void;
  selectedRoomKey: string | null;
}) {
  const buildingOptions = useMemo(() => buildingGroupsToSearchOptions(buildings), [buildings]);

  if (phase === "property") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Choose a property to tour. You&apos;ll pick a specific room next.</p>
        <PropertySearchPicker
          options={buildingOptions}
          value={selectedBuildingId}
          onChange={(id) => {
            if (id) onSelectBuilding(id);
          }}
          placeholder="Search by address, neighborhood, or property name…"
          listEmptyMessage="No listed housing is available for tours right now."
          emptyMessage="No properties match your search. Try an address or neighborhood."
          ariaLabel="Search properties to tour"
        />
      </div>
    );
  }

  const building = buildings.find((x) => x.buildingId === selectedBuildingId);
  if (!building) {
    return <p className="text-sm text-muted">Select a property to see available rooms.</p>;
  }

  const roomOptions: PropertySearchOption[] = building.units.flatMap((p) =>
    roomOptionsForProperty(p).map((option) => ({
      id: option.key,
      title: option.label,
      subtitle: option.subtitle,
      tags: [p.address, p.neighborhood, `Available ${p.available}`],
      searchText: `${option.label} ${option.subtitle} ${p.address} ${p.neighborhood} ${p.rentLabel}`,
    })),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Choose a room at <span className="font-semibold text-foreground">{building.buildingName}</span>.
        </p>
        <button
          type="button"
          onClick={onBackToProperties}
          className="text-sm font-semibold text-primary hover:underline"
        >
          ← All properties
        </button>
      </div>
      <PropertySearchPicker
        options={roomOptions}
        value={selectedRoomKey}
        onChange={(roomKey) => {
          if (!roomKey) {
            onSelectRoom(null, null);
            return;
          }
          const hit = building.units
            .flatMap((p) => roomOptionsForProperty(p).map((o) => ({ ...o, property: p })))
            .find((o) => o.key === roomKey);
          if (hit) onSelectRoom(hit.property, roomKey);
        }}
        placeholder="Search rooms by name, floor, or rent…"
        emptyMessage="No rooms match your search."
        listEmptyMessage="No rooms listed for this property."
        ariaLabel="Search rooms to tour"
      />
    </div>
  );
}

function Step2({
  property,
  availability,
  calMonth, calYear, onPrevMonth, onNextMonth,
  selectedDay, onSelectDay, selectedSlotIndex, onSelectSlotIndex,
  managersAtSelectedSlot,
  availabilityLoading,
}: {
  property: MockProperty | null;
  availability: Set<string>;
  calMonth: number; calYear: number;
  onPrevMonth: () => void; onNextMonth: () => void;
  selectedDay: number | null; onSelectDay: (d: number) => void;
  selectedSlotIndex: number | null; onSelectSlotIndex: (slotIndex: number) => void;
  managersAtSelectedSlot: PropertyManagerEntry[];
  availabilityLoading: boolean;
}) {
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const today = new Date();
  const selectedDateStr = selectedDay != null ? toLocalDateStr(new Date(calYear, calMonth, selectedDay, 12, 0, 0, 0)) : null;
  const openSlots = selectedDateStr ? openSlotIndicesForDateStr(availability, selectedDateStr) : [];

  return (
    <div className="space-y-6">
      {!property ? (
        <p className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          Pick a property and room first so we can show the right meeting windows.
        </p>
      ) : availabilityLoading ? (
        <p className="rounded-2xl border border-blue-200/80 bg-blue-50/90 px-4 py-3 text-sm text-blue-950">
          Loading tour windows from the calendar...
        </p>
      ) : availability.size === 0 ? (
        <p className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          No tour windows are published for this property yet. Pick a different house or send a message to Axis.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Pick one published 30-minute window for <span className="font-semibold text-foreground">{property.title}</span>.
        </p>
      )}
      {/* Calendar */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={onPrevMonth} className="rounded-full p-1.5 hover:bg-accent">
            <ChevronLeftIcon />
          </button>
          <p className="text-sm font-semibold text-foreground">{MONTHS[calMonth]} {calYear}</p>
          <button type="button" onClick={onNextMonth} className="rounded-full p-1.5 hover:bg-accent">
            <ChevronRightIcon />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DAYS.map((d) => (
            <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase text-muted/70">{d}</div>
          ))}
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isAvailable = property
              ? dateHasAvailability(new Date(calYear, calMonth, day, 12, 0, 0, 0), availability)
              : false;
            const isSelected = selectedDay === day;
            const isPast = calYear === today.getFullYear() && calMonth === today.getMonth() && day < today.getDate();
            return (
              <button
                key={day}
                type="button"
                disabled={!isAvailable || isPast}
                onClick={() => onSelectDay(day)}
                className={`aspect-square rounded-xl text-sm font-medium transition-all ${
                  isSelected
                    ? "bg-primary text-white shadow-sm"
                    : isAvailable && !isPast
                    ? "bg-card text-foreground hover:bg-primary/[0.08] hover:text-primary"
                    : "cursor-not-allowed text-muted/40"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time slots */}
      {selectedDay && (
        <div>
          <p className="mb-3 text-sm font-semibold text-muted">
            Available times — {MONTHS[calMonth]} {selectedDay}
          </p>
          {openSlots.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-accent/30 px-4 py-3 text-sm text-muted">
              No published tour windows for this day.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {openSlots.map((slotIndex) => (
                <button
                  key={slotIndex}
                  type="button"
                  onClick={() => onSelectSlotIndex(slotIndex)}
                  className={`rounded-xl border py-2.5 text-xs font-semibold transition-all ${
                    selectedSlotIndex === slotIndex
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-muted hover:border-primary hover:text-primary"
                  }`}
                >
                  {formatAvailabilitySlotLabel(slotIndex)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedSlotIndex != null && managersAtSelectedSlot.length > 1 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-muted">Multiple managers are available</p>
          <p className="mb-3 text-xs text-muted">
            We&apos;ll send this request to every available manager for this house. The first manager to approve gets the tour.
          </p>
        </div>
      )}
    </div>
  );
}

function Step3({
  property, roomLabel, day, slotIndex, month, year, submitting, onSubmit,
}: {
  property: MockProperty | null; roomLabel: string; day: number | null; slotIndex: number | null;
  month: number;
  year: number;
  submitting: boolean;
  onSubmit: (payload: { name: string; email: string; phone: string; notes: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="rounded-2xl border border-border/60 bg-accent/30 px-4 py-3 text-sm">
        <p className="font-semibold text-foreground">{roomLabel || property?.title}</p>
        <p className="mt-0.5 text-muted">
          {MONTHS[month]} {day}, {year} · {slotIndex != null ? formatAvailabilitySlotLabel(slotIndex) : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *">
          <Input id="tour-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
        </Field>
        <Field label="Email *">
          <Input id="tour-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@email.com" />
        </Field>
      </div>
      <Field label="Phone">
        <Input id="tour-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(206) 555-0100" />
      </Field>
      <Field label="Notes (optional)">
        <Textarea id="tour-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should prepare in advance?" />
      </Field>

      <button
        type="button"
        disabled={submitting}
        onClick={() => onSubmit({ name, email, phone, notes })}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(47,107,255,0.28)] transition-all hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-alt))" }}
      >
        {submitting ? "Booking..." : "Book tour"}
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   MESSAGE FLOW
──────────────────────────────────────────────────────────── */
function MessageFlow({ properties, onSuccess }: { properties: MockProperty[]; onSuccess: () => void }) {
  const { showToast } = useAppUi();
  const buildings = useMemo(() => groupByBuilding(properties), [properties]);
  const [topic, setTopic] = useState("");
  const [otherTopicDetail, setOtherTopicDetail] = useState("");
  const [msgPhase, setMsgPhase] = useState<"building" | "room">("building");
  const [msgBuildingId, setMsgBuildingId] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<MockProperty | null>(null);

  const msgBuilding = msgBuildingId ? buildings.find((b) => b.buildingId === msgBuildingId) : undefined;
  const isOther = topic === "Other";

  const handleSend = () => {
    if (!topic) {
      showToast("Please select a topic.");
      return;
    }
    if (isOther && !otherTopicDetail.trim()) {
      showToast("Please describe your topic.");
      return;
    }
    onSuccess();
  };

  return (
    <div className="mt-4 space-y-3">
      {/* Topic */}
      <div className="glass-card rounded-3xl p-6">
        <h2 className="text-base font-bold text-foreground">Topic</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          For rent, payments, maintenance, or portal login issues, use the{" "}
          <Link href="/resident/dashboard" className="font-semibold text-primary hover:underline">
            resident portal
          </Link>
          . These topics are for leasing questions, the area around our homes, and availability.
        </p>
        <p className="mt-4 text-xs font-semibold text-muted">What do you need help with? *</p>
        <div className="relative mt-2">
          <Select
            value={topic}
            onChange={(e) => {
              const v = e.target.value;
              setTopic(v);
              if (v !== "Other") setOtherTopicDetail("");
            }}
            className="appearance-none pr-8"
          >
            <option value="">Select a topic</option>
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted/70">
            <ChevronDownIcon />
          </span>
        </div>
        {isOther ? (
          <div className="mt-4">
            <Field label="Describe your topic *">
              <Input
                type="text"
                value={otherTopicDetail}
                onChange={(e) => setOtherTopicDetail(e.target.value)}
                placeholder="Type what you need help with"
              />
            </Field>
          </div>
        ) : null}
      </div>

      {/* Property context */}
      <div className="glass-card rounded-3xl p-6">
        <h2 className="text-base font-bold text-foreground">Property context</h2>
        <p className="mt-1 text-sm text-muted">Optional — helps us answer about a specific listing.</p>

        {msgPhase === "building" ? (
          <div className="mt-4">
            <PropertySearchPicker
              options={buildingGroupsToSearchOptions(buildings)}
              value={msgBuildingId}
              onChange={(id) => {
                if (!id) {
                  setMsgBuildingId(null);
                  setSelectedProperty(null);
                  return;
                }
                setMsgBuildingId(id);
                setSelectedProperty(null);
                setMsgPhase("room");
              }}
              placeholder="Search by address, neighborhood, or property name…"
              emptyMessage="No properties match your search."
              listEmptyMessage="No properties available."
              ariaLabel="Search properties for message context"
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                {msgBuilding ? `Rooms at ${msgBuilding.buildingName}` : "Choose a room"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setMsgPhase("building");
                  setMsgBuildingId(null);
                  setSelectedProperty(null);
                }}
                className="text-sm font-semibold text-primary hover:underline"
              >
                ← All properties
              </button>
            </div>
            {msgBuilding ? (
              <PropertySearchPicker
                options={msgBuilding.units.map((p) => ({
                  id: p.id,
                  title: `${p.buildingName} · ${p.unitLabel}`,
                  subtitle: p.address,
                  tags: [p.neighborhood, p.rentLabel],
                  searchText: `${p.title} ${p.address} ${p.neighborhood} ${p.rentLabel}`,
                }))}
                value={selectedProperty?.id ?? null}
                onChange={(propertyId) => {
                  if (!propertyId) {
                    setSelectedProperty(null);
                    return;
                  }
                  const hit = msgBuilding.units.find((p) => p.id === propertyId);
                  if (hit) {
                    setSelectedProperty(hit);
                    setMsgBuildingId(hit.buildingId);
                  }
                }}
                placeholder="Search rooms by name, neighborhood, or rent…"
                emptyMessage="No rooms match your search."
                listEmptyMessage="No rooms listed for this property."
                ariaLabel="Search rooms for message context"
              />
            ) : null}
          </div>
        )}

        {selectedProperty ? (
          <p className="mt-3 text-xs text-primary">
            Context: <strong>{selectedProperty.title}</strong>
          </p>
        ) : null}
      </div>

      {/* Contact & message */}
      <div className="glass-card rounded-3xl p-6">
        <h2 className="text-base font-bold text-foreground">Your contact & message</h2>
        <p className="mt-1 text-sm text-muted">We will reply to the email you provide</p>
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *">
              <Input type="text" placeholder="Jane Smith" />
            </Field>
            <Field label="Email *">
              <Input type="email" placeholder="jane@email.com" />
            </Field>
          </div>
          <Field label="Phone">
            <Input type="tel" placeholder="(206) 555-0100" />
          </Field>
          <Field label="Message *">
            <Textarea rows={4} placeholder="Tell us more so we can help…" />
          </Field>
        </div>
      </div>

      <Button type="button" className="btn-cobalt w-full rounded-2xl py-3.5" onClick={handleSend}>
        Send message
      </Button>
    </div>
  );
}

/* ── Shared UI primitives ── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">{label}</p>
      {children}
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
