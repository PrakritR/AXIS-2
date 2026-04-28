"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { PROPERTY_PIPELINE_EVENT, readExtraListingsPublic } from "@/lib/demo-property-pipeline";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  appendPartnerInquiry,
  dateHasAvailability,
  formatAvailabilitySlotLabel,
  getManagersForProperty,
  localDateAtSlotStart,
  managerPropertyAvailabilityStorageKey,
  type PropertyManagerEntry,
  readAvailabilityDateSetForStorageKey,
  toLocalDateStr,
} from "@/lib/demo-admin-scheduling";
import Link from "next/link";
import { SegmentedTwo } from "@/components/ui/segmented-control";

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
  const [tab, setTab] = useState<Tab>("tour");
  const [extras, setExtras] = useState<MockProperty[]>([]);

  useEffect(() => {
    const sync = () => setExtras(readExtraListingsPublic());
    sync();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const publicProperties = useMemo(() => [...mockProperties, ...extras], [extras]);

  return (
    <div className="min-h-screen px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-[#0d1f4e]">
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
            <TourFlow properties={publicProperties} onSuccess={() => showToast("Tour booked.")} />
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
function formatManagerLabel(entry: PropertyManagerEntry): string {
  const raw = entry.label;
  if (raw.includes("@")) {
    const name = raw.split("@")[0] ?? raw;
    return name
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  return raw;
}

function TourFlow({ properties, onSuccess }: { properties: MockProperty[]; onSuccess: () => void }) {
  const { showToast } = useAppUi();
  const [step, setStep] = useState<TourStep>(1);
  const [submitted, setSubmitted] = useState(false);
  const [tick, setTick] = useState(0);
  const [step1Phase, setStep1Phase] = useState<"property" | "room">("property");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<MockProperty | null>(null);
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null);
  const selectedRoomLabel = useMemo(() => {
    if (!selectedProperty || !selectedRoomKey) return "";
    const hit = roomOptionsForProperty(selectedProperty).find((o) => o.key === selectedRoomKey);
    return hit?.label ?? selectedProperty.title;
  }, [selectedProperty, selectedRoomKey]);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [selectedManagerUserId, setSelectedManagerUserId] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const buildings = useMemo(() => groupByBuilding(properties), [properties]);

  useEffect(() => {
    const sync = () => setTick((n) => n + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // All managers offering tours for this property (registered + primary fallback).
  const managersForProperty = useMemo(() => {
    void tick;
    if (!selectedProperty) return [];
    const registered = getManagersForProperty(selectedProperty.id);
    if (selectedProperty.managerUserId?.trim()) {
      const alreadyIn = registered.some((e) => e.userId === selectedProperty.managerUserId);
      if (!alreadyIn) {
        return [{ userId: selectedProperty.managerUserId, label: "Property Manager" }, ...registered];
      }
    }
    return registered;
  }, [selectedProperty, tick]);

  // Union of all managers' availability slots.
  const selectedAvailability = useMemo(() => {
    void tick;
    if (!selectedProperty) return new Set<string>();
    const combined = new Set<string>();
    for (const mgr of managersForProperty) {
      for (const slot of readAvailabilityDateSetForStorageKey(
        managerPropertyAvailabilityStorageKey(mgr.userId, selectedProperty.id),
      )) {
        combined.add(slot);
      }
    }
    return combined;
  }, [selectedProperty, managersForProperty, tick]);

  // Map from slot key ("YYYY-MM-DD:slotIndex") to managers available at that slot.
  const slotManagerMap = useMemo(() => {
    if (!selectedProperty) return new Map<string, PropertyManagerEntry[]>();
    const map = new Map<string, PropertyManagerEntry[]>();
    for (const mgr of managersForProperty) {
      for (const slot of readAvailabilityDateSetForStorageKey(
        managerPropertyAvailabilityStorageKey(mgr.userId, selectedProperty.id),
      )) {
        const existing = map.get(slot) ?? [];
        map.set(slot, [...existing, mgr]);
      }
    }
    return map;
  }, [selectedProperty, managersForProperty]);

  // Managers available at the currently selected slot.
  const managersAtSelectedSlot = useMemo(() => {
    if (selectedDay == null || selectedSlotIndex == null) return [];
    const dateStr = toLocalDateStr(new Date(calYear, calMonth, selectedDay, 12, 0, 0, 0));
    return slotManagerMap.get(`${dateStr}:${selectedSlotIndex}`) ?? [];
  }, [selectedDay, selectedSlotIndex, calYear, calMonth, slotManagerMap]);

  // Auto-select the manager when only one is available at the chosen slot.
  useEffect(() => {
    if (managersAtSelectedSlot.length === 1) {
      setSelectedManagerUserId(managersAtSelectedSlot[0]!.userId);
    } else if (managersAtSelectedSlot.length !== 1) {
      setSelectedManagerUserId(null);
    }
  }, [managersAtSelectedSlot]);

  // Clear manager selection when slot is cleared.
  useEffect(() => {
    if (selectedDay == null || selectedSlotIndex == null) setSelectedManagerUserId(null);
  }, [selectedDay, selectedSlotIndex]);

  const canContinue1 = selectedProperty !== null && selectedRoomKey !== null;
  const canContinue2 =
    selectedDay !== null &&
    selectedSlotIndex !== null &&
    (managersAtSelectedSlot.length <= 1 || selectedManagerUserId !== null);

  const steps = [
    { n: 1, label: "Property & room" },
    { n: 2, label: "Date & time" },
    { n: 3, label: "Your details" },
  ];

  if (submitted) {
    return (
      <div className="mt-4 rounded-3xl border border-emerald-200/80 bg-white p-7 shadow-sm">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Tour request sent</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Your tour request is in</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            We sent your tour request to the Axis team. Check your email for tour confirmation, the meeting link if needed,
            and next steps.
          </p>
          {selectedProperty ? (
            <p className="mt-3 text-sm font-medium text-slate-800">
              Requested tour: {selectedProperty.title}
              {selectedDay && selectedSlotIndex != null
                ? ` · ${MONTHS[calMonth]} ${selectedDay}, ${calYear} · ${formatAvailabilitySlotLabel(selectedSlotIndex)}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
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
            className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Request another tour
          </button>
          <Link
            href="/rent/listings"
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
          >
            Back to listings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-3xl border border-slate-200/80 bg-white p-7 shadow-sm">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-6 bg-slate-200" />}
            <button
              type="button"
              onClick={() => {
                if (s.n === 1) {
                  setStep(1);
                  if (selectedProperty) {
                    setStep1Phase("room");
                    setSelectedBuildingId(selectedProperty.buildingId);
                  } else {
                    setStep1Phase("property");
                    setSelectedBuildingId(null);
                  }
                }
                if (s.n === 2 && canContinue1) setStep(2);
                if (s.n === 3 && canContinue1 && canContinue2) setStep(3);
              }}
              className="flex items-center gap-2"
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === s.n
                  ? "bg-primary text-white"
                  : s.n < step
                  ? "bg-primary/20 text-primary"
                  : "bg-slate-100 text-slate-400"
              }`}>
                {s.n < step ? <CheckSmIcon /> : s.n}
              </span>
              <span className={`hidden sm:inline text-sm ${
                step === s.n ? "font-semibold text-slate-800" : "text-slate-400"
              }`}>
                {s.label}
              </span>
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6">
        {step === 1 && (
          <Step1
            buildings={buildings}
            phase={step1Phase}
            selectedBuildingId={selectedBuildingId}
            selectedProperty={selectedProperty}
            onSelectBuilding={(id) => {
              setSelectedBuildingId(id);
              setSelectedProperty(null);
              setSelectedRoomKey(null);
              setStep1Phase("room");
            }}
            onBackToProperties={() => {
              setSelectedBuildingId(null);
              setSelectedProperty(null);
              setSelectedRoomKey(null);
              setStep1Phase("property");
            }}
            onSelectRoom={(p, roomKey) => {
              setSelectedProperty(p);
              setSelectedBuildingId(p.buildingId);
              setSelectedRoomKey(roomKey);
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
            selectedManagerUserId={selectedManagerUserId}
            onSelectManager={setSelectedManagerUserId}
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
            onSubmit={({ name, email, phone, notes }) => {
              if (!name.trim() || !email.trim()) {
                showToast("Please enter your name and email.");
                return;
              }
              if (!selectedProperty || selectedDay == null || selectedSlotIndex == null) return;
              const dateStr = toLocalDateStr(new Date(calYear, calMonth, selectedDay, 12, 0, 0, 0));
              const start = localDateAtSlotStart(dateStr, selectedSlotIndex);
              const end = new Date(start.getTime() + 30 * 60 * 1000);
              const propertyContext = [
                `Property: ${selectedProperty.title}`,
                selectedRoomLabel ? `Room: ${selectedRoomLabel}` : "",
              ]
                .filter(Boolean)
                .join("\n");
              appendPartnerInquiry({
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim(),
                kind: "tour",
                managerUserId: selectedManagerUserId ?? managersAtSelectedSlot[0]?.userId,
                propertyId: selectedProperty.id,
                propertyTitle: selectedProperty.title,
                roomLabel: selectedRoomLabel,
                notes: [propertyContext, notes.trim()].filter(Boolean).join("\n\n"),
                requestedWindows: [{ start: start.toISOString(), end: end.toISOString() }],
                proposedStart: start.toISOString(),
                proposedEnd: end.toISOString(),
              });
              setSubmitted(true);
              onSuccess();
            }}
          />
        )}
      </div>

      {/* Footer nav */}
      <div className={`mt-6 flex ${step > 1 ? "justify-between" : "justify-end"}`}>
        {step > 1 && (
          <button
            type="button"
            onClick={() => {
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
            }}
            className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Back
          </button>
        )}
        {step < 3 && (
          <button
            type="button"
            disabled={step === 1 ? !canContinue1 : !canContinue2}
            onClick={() => setStep((s) => (s + 1) as TourStep)}
            className="rounded-full bg-primary px-7 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

function Step1({
  buildings,
  phase,
  selectedBuildingId,
  selectedProperty,
  onSelectBuilding,
  onBackToProperties,
  onSelectRoom,
  selectedRoomKey,
}: {
  buildings: BuildingGroup[];
  phase: "property" | "room";
  selectedBuildingId: string | null;
  selectedProperty: MockProperty | null;
  onSelectBuilding: (buildingId: string) => void;
  onBackToProperties: () => void;
  onSelectRoom: (p: MockProperty, roomKey: string) => void;
  selectedRoomKey: string | null;
}) {
  if (phase === "property") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Choose a property to tour. You&apos;ll pick a specific room next.</p>
        {buildings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No listed housing is available for tours right now.
          </div>
        ) : null}
        {buildings.map((b) => {
          const count = b.units.length;
          return (
            <button
              key={b.buildingId}
              type="button"
              onClick={() => onSelectBuilding(b.buildingId)}
              className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all duration-150 hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{b.buildingName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{b.address}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Chip>{b.neighborhood}</Chip>
                    <Chip>
                      {count} {count === 1 ? "room" : "rooms"} available
                    </Chip>
                  </div>
                </div>
                <span className="mt-0.5 shrink-0 text-slate-400" aria-hidden>
                  <ChevronRightIcon />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  const building = buildings.find((x) => x.buildingId === selectedBuildingId);
  if (!building) {
    return <p className="text-sm text-slate-500">Select a property to see available rooms.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Choose a room at <span className="font-semibold text-slate-800">{building.buildingName}</span>.
        </p>
        <button
          type="button"
          onClick={onBackToProperties}
          className="text-sm font-semibold text-primary hover:underline"
        >
          ← All properties
        </button>
      </div>
      {building.units.flatMap((p) => roomOptionsForProperty(p)).map((option) => {
        const p = option.property;
        const isSelected = selectedRoomKey === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onSelectRoom(p, option.key)}
            className={`w-full rounded-2xl border p-4 text-left transition-all duration-150 ${
              isSelected
                ? "border-primary bg-primary/[0.08] ring-2 ring-primary/20"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {option.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{option.subtitle}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip>{p.address}</Chip>
                  <Chip>{p.neighborhood}</Chip>
                  <Chip>Available {p.available}</Chip>
                </div>
              </div>
              <div
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  isSelected ? "border-primary bg-primary" : "border-slate-300 bg-white"
                }`}
              >
                {isSelected && (
                  <span className="text-white">
                    <CheckSmIcon />
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Step2({
  property,
  availability,
  calMonth, calYear, onPrevMonth, onNextMonth,
  selectedDay, onSelectDay, selectedSlotIndex, onSelectSlotIndex,
  managersAtSelectedSlot, selectedManagerUserId, onSelectManager,
}: {
  property: MockProperty | null;
  availability: Set<string>;
  calMonth: number; calYear: number;
  onPrevMonth: () => void; onNextMonth: () => void;
  selectedDay: number | null; onSelectDay: (d: number) => void;
  selectedSlotIndex: number | null; onSelectSlotIndex: (slotIndex: number) => void;
  managersAtSelectedSlot: PropertyManagerEntry[];
  selectedManagerUserId: string | null;
  onSelectManager: (userId: string) => void;
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
      ) : availability.size === 0 ? (
        <p className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          No tour windows are published for this property yet. Pick a different house or send a message to Axis.
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          Pick one published 30-minute window for <span className="font-semibold text-slate-800">{property.title}</span>.
        </p>
      )}
      {/* Calendar */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={onPrevMonth} className="rounded-full p-1.5 hover:bg-slate-100">
            <ChevronLeftIcon />
          </button>
          <p className="text-sm font-semibold text-slate-800">{MONTHS[calMonth]} {calYear}</p>
          <button type="button" onClick={onNextMonth} className="rounded-full p-1.5 hover:bg-slate-100">
            <ChevronRightIcon />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DAYS.map((d) => (
            <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase text-slate-400">{d}</div>
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
                    ? "bg-white text-slate-800 hover:bg-primary/[0.08] hover:text-primary"
                    : "cursor-not-allowed text-slate-300"
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
          <p className="mb-3 text-sm font-semibold text-slate-700">
            Available times — {MONTHS[calMonth]} {selectedDay}
          </p>
          {openSlots.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
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
                      : "border-slate-200 bg-white text-slate-700 hover:border-primary hover:text-primary"
                  }`}
                >
                  {formatAvailabilitySlotLabel(slotIndex)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Host picker — only shown when 2+ managers share the selected slot */}
      {selectedSlotIndex != null && managersAtSelectedSlot.length > 1 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-slate-700">Choose your host</p>
          <p className="mb-3 text-xs text-slate-500">
            Multiple hosts are available at this time. Pick who you'd like to meet with.
          </p>
          <div className="space-y-2">
            {managersAtSelectedSlot.map((mgr) => {
              const isSelected = selectedManagerUserId === mgr.userId;
              return (
                <button
                  key={mgr.userId}
                  type="button"
                  onClick={() => onSelectManager(mgr.userId)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                    isSelected
                      ? "border-primary bg-primary/[0.08] ring-2 ring-primary/20"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isSelected ? "border-primary bg-primary" : "border-slate-300 bg-white"
                    }`}
                  >
                    {isSelected && <span className="text-white"><CheckSmIcon /></span>}
                  </div>
                  <span className="font-medium text-slate-900">{formatManagerLabel(mgr)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Step3({
  property, roomLabel, day, slotIndex, month, year, onSubmit,
}: {
  property: MockProperty | null; roomLabel: string; day: number | null; slotIndex: number | null;
  month: number;
  year: number;
  onSubmit: (payload: { name: string; email: string; phone: string; notes: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
        <p className="font-semibold text-slate-800">{roomLabel || property?.title}</p>
        <p className="mt-0.5 text-slate-500">
          {MONTHS[month]} {day}, {year} · {slotIndex != null ? formatAvailabilitySlotLabel(slotIndex) : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *">
          <input id="tour-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" className={inputCls} />
        </Field>
        <Field label="Email *">
          <input id="tour-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@email.com" className={inputCls} />
        </Field>
      </div>
      <Field label="Phone">
        <input id="tour-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(206) 555-0100" className={inputCls} />
      </Field>
      <Field label="Notes (optional)">
        <textarea id="tour-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should prepare in advance?" className={`${inputCls} resize-none`} />
      </Field>

      <button
        type="button"
        onClick={() => onSubmit({ name, email, phone, notes })}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(0,122,255,0.28)] transition-all hover:brightness-105 active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-alt))" }}
      >
        Book tour
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
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Topic</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          For rent, payments, maintenance, or portal login issues, use the{" "}
          <Link href="/resident/dashboard" className="font-semibold text-primary hover:underline">
            resident portal
          </Link>
          . These topics are for leasing questions, the area around our homes, and availability.
        </p>
        <p className="mt-4 text-xs font-semibold text-slate-600">What do you need help with? *</p>
        <div className="relative mt-2">
          <select
            value={topic}
            onChange={(e) => {
              const v = e.target.value;
              setTopic(v);
              if (v !== "Other") setOtherTopicDetail("");
            }}
            className={`${inputCls} appearance-none pr-8`}
          >
            <option value="">Select a topic</option>
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            <ChevronDownIcon />
          </span>
        </div>
        {isOther ? (
          <div className="mt-4">
            <Field label="Describe your topic *">
              <input
                type="text"
                value={otherTopicDetail}
                onChange={(e) => setOtherTopicDetail(e.target.value)}
                placeholder="Type what you need help with"
                className={inputCls}
              />
            </Field>
          </div>
        ) : null}
      </div>

      {/* Property context */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Property context</h2>

        {msgPhase === "building" ? (
          <div className="mt-4 space-y-2">
            {buildings.map((b) => {
              const count = b.units.length;
              return (
                <button
                  key={b.buildingId}
                  type="button"
                  onClick={() => {
                    setMsgBuildingId(b.buildingId);
                    setSelectedProperty(null);
                    setMsgPhase("room");
                  }}
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition-all hover:border-slate-200 hover:bg-white"
                >
                  <span>
                    <span className="font-semibold text-slate-900">{b.buildingName}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{b.address}</span>
                    <span className="mt-1.5 inline-block text-[11px] font-medium text-slate-500">
                      {b.neighborhood} · {count} {count === 1 ? "room" : "rooms"}
                    </span>
                  </span>
                  <span className="shrink-0 text-slate-400" aria-hidden>
                    <ChevronRightIcon />
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-[#e0e4ec] bg-[#f8fafc] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">
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
              <div className="mt-3 space-y-2">
                {msgBuilding.units.map((p) => {
                  const isSelected = selectedProperty?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProperty(isSelected ? null : p);
                        setMsgBuildingId(p.buildingId);
                      }}
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                        isSelected
                          ? "border-primary bg-white text-primary ring-2 ring-primary/15"
                          : "border-slate-200/80 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <span className="font-semibold">
                        {p.buildingName} · {p.unitLabel}
                      </span>
                      <span className="ml-2 text-xs opacity-80">
                        {p.neighborhood} · {p.rentLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
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
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Your contact & message</h2>
        <p className="mt-1 text-sm text-slate-500">We will reply to the email you provide</p>
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *">
              <input type="text" placeholder="Jane Smith" className={inputCls} />
            </Field>
            <Field label="Email *">
              <input type="email" placeholder="jane@email.com" className={inputCls} />
            </Field>
          </div>
          <Field label="Phone">
            <input type="tel" placeholder="(206) 555-0100" className={inputCls} />
          </Field>
          <Field label="Message *">
            <textarea rows={4} placeholder="Tell us more so we can help…" className={`${inputCls} resize-none`} />
          </Field>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSend}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(0,122,255,0.28)] transition-all hover:brightness-105 active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-alt))" }}
      >
        Send message
      </button>
    </div>
  );
}

/* ── Shared UI primitives ── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-500">{label}</p>
      {children}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
      {children}
    </span>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15 hover:border-slate-300";

function CheckSmIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
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
