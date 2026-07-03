"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { MockProperty } from "@/data/types";
import { loadPublicPropertyLeadFromServer, PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { getPropertyForPublicLink } from "@/lib/rental-application/data";
import { ManagerLinkGate } from "@/components/marketing/manager-link-gate";
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
import {
  PropertySearchPicker,
  type PropertySearchOption,
} from "@/components/marketing/property-search-picker";
import { canNavigateToWizardStep, nextWizardMaxReached } from "@/lib/wizard-step-nav";
import {
  TOUR_STEP_FIELD_ORDER,
  scrollToFirstWizardFieldError,
  wizardFieldErrorClass,
  wizardSectionErrorClass,
} from "@/lib/wizard-field-errors";

type Tab = "tour" | "message";
type TourStep = 1 | 2 | 3;

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
  const [extrasTick, setExtrasTick] = useState(0);
  const linkedPropertyId = searchParams.get("propertyId")?.trim() ?? "";

  useEffect(() => {
    const on = () => setExtrasTick((n) => n + 1);
    if (linkedPropertyId) {
      void loadPublicPropertyLeadFromServer(linkedPropertyId).then(() => on());
    }
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
  }, [linkedPropertyId]);

  const linkedProperty = useMemo(() => {
    void extrasTick;
    if (!linkedPropertyId) return undefined;
    return getPropertyForPublicLink(linkedPropertyId);
  }, [extrasTick, linkedPropertyId]);

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
            !linkedPropertyId || !linkedProperty ? (
              <div className="mt-8">
                <ManagerLinkGate
                  title="Open your manager’s tour link"
                  body={
                    linkedPropertyId && !linkedProperty
                      ? "This property link is invalid or no longer active. Ask your property manager for a new tour link."
                      : "Tours start from a link your property manager shares after you find a unit on Zillow, Redfin, or elsewhere."
                  }
                />
              </div>
            ) : (
              <TourFlow
                property={linkedProperty}
                onSuccess={() => showToast("Tour booked.")}
              />
            )
          ) : !linkedPropertyId || !linkedProperty ? (
            <div className="mt-8">
              <ManagerLinkGate
                title="Open your manager’s property link"
                body={
                  linkedPropertyId && !linkedProperty
                    ? "This property link is invalid or no longer active. Ask your property manager for a new link."
                    : "Messages about a listing start from a link your property manager shares with the property ID."
                }
              />
            </div>
          ) : (
            <MessageFlow propertyId={linkedProperty.id} propertyTitle={linkedProperty.title} onSuccess={() => showToast("Message sent.")} />
          )}
        </div>
      </div>
    </div>
  );
}

function TourFlow({
  property,
  onSuccess,
}: {
  property: MockProperty;
  onSuccess: () => void;
}) {
  const { showToast } = useAppUi();
  const [step, setStep] = useState<TourStep>(1);
  const [maxStepReached, setMaxStepReached] = useState<TourStep>(1);
  const [submitted, setSubmitted] = useState(false);
  const [tick, setTick] = useState(0);
  const [selectedRoomKey, setSelectedRoomKey] = useState<string | null>(null);
  const selectedRoomLabel = useMemo(() => {
    if (!selectedRoomKey) return "";
    const hit = roomOptionsForProperty(property).find((o) => o.key === selectedRoomKey);
    return hit?.label ?? property.title;
  }, [property, selectedRoomKey]);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [slotHosts, setSlotHosts] = useState<Record<string, PropertyManagerEntry[]>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [bookingTour, setBookingTour] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const sync = () => setTick((n) => n + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, sync);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const params = new URLSearchParams({
        propertyId: property.id,
        buildingName: property.buildingName,
        address: property.address,
      });
      setAvailabilityLoading(true);
      void fetch(`/api/public/property-tour-availability?${params.toString()}`)
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
    });
    return () => {
      cancelled = true;
    };
  }, [property]);

  const selectedAvailability = useMemo(() => {
    void tick;
    return new Set(Object.entries(slotHosts).filter(([, hosts]) => hosts.length > 0).map(([slot]) => slot));
  }, [slotHosts, tick]);

  const slotManagerMap = useMemo(() => {
    const map = new Map<string, PropertyManagerEntry[]>();
    for (const [slot, hosts] of Object.entries(slotHosts)) {
      map.set(slot, hosts);
    }
    return map;
  }, [slotHosts]);

  const managersAtSelectedSlot = useMemo(() => {
    if (selectedDay == null || selectedSlotIndex == null) return [];
    const dateStr = toLocalDateStr(new Date(calYear, calMonth, selectedDay, 12, 0, 0, 0));
    return slotManagerMap.get(`${dateStr}:${selectedSlotIndex}`) ?? [];
  }, [selectedDay, selectedSlotIndex, calYear, calMonth, slotManagerMap]);

  const steps = [
    { n: 1, label: "Room" },
    { n: 2, label: "Date & time" },
    { n: 3, label: "Your details" },
  ];

  if (submitted) {
    return (
      <div className="mt-4 rounded-3xl border border-emerald-200/80 bg-card p-7 shadow-sm">
        <div className="rounded-2xl border px-5 py-5 portal-banner-success">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Tour request sent</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Your tour request is in</h2>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            Your tour request was sent to the property manager. If you provided an email, you should receive a short
            acknowledgment shortly. You will get a separate confirmation once the manager approves your requested time.
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">
            Requested tour: {property.title}
            {selectedDay && selectedSlotIndex != null
              ? ` · ${MONTHS[calMonth]} ${selectedDay}, ${calYear} · ${formatAvailabilitySlotLabel(selectedSlotIndex)}`
              : ""}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setStep(1);
              setMaxStepReached(1);
              setSelectedRoomKey(null);
              setSelectedDay(null);
              setSelectedSlotIndex(null);
            }}
            className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-accent/30"
          >
            Request another tour
          </button>
          <Link
            href={`/rent/apply?propertyId=${encodeURIComponent(property.id)}`}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
          >
            Apply for this property
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-3xl border border-border bg-card p-7 shadow-sm">
      <div className="mb-6 rounded-xl border border-border bg-accent/30 px-4 py-3 text-sm">
        <p className="font-semibold text-foreground">{property.title}</p>
        {property.address ? <p className="mt-1 text-muted">{property.address}</p> : null}
      </div>

      <div className="flex items-center gap-2 text-sm">
        {steps.map((s, i) => {
          const reachable = canNavigateToWizardStep(s.n, maxStepReached);
          return (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-6 bg-accent/40" />}
            <button
              type="button"
              disabled={!reachable}
              onClick={() => {
                if (!reachable) return;
                setStep(s.n as TourStep);
              }}
              className={`flex items-center gap-2 ${reachable ? "" : "cursor-not-allowed opacity-45"}`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step === s.n
                  ? "bg-primary text-white"
                  : s.n < step
                  ? "bg-primary/20 text-primary"
                  : "bg-accent/30 text-muted/70"
              }`}>
                {s.n < step ? <CheckSmIcon /> : s.n}
              </span>
              <span className={`hidden sm:inline text-sm ${
                step === s.n ? "font-semibold text-foreground" : "text-muted/70"
              }`}>
                {s.label}
              </span>
            </button>
          </div>
        );
        })}
      </div>

      <div className="mt-6">
        {step === 1 && (
          <Step1
            property={property}
            onSelectRoom={(roomKey) => {
              if (!roomKey) {
                setSelectedRoomKey(null);
                setSlotHosts({});
                setSelectedDay(null);
                setSelectedSlotIndex(null);
                return;
              }
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.room;
                return next;
              });
              setSelectedRoomKey(roomKey);
              setSelectedDay(null);
              setSelectedSlotIndex(null);
            }}
            selectedRoomKey={selectedRoomKey}
            fieldErrors={fieldErrors}
          />
        )}
        {step === 2 && (
          <Step2
            property={property}
            availability={selectedAvailability}
            fieldErrors={fieldErrors}
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
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.tourSlot;
                return next;
              });
              setSelectedDay(day);
              setSelectedSlotIndex(null);
            }}
            selectedSlotIndex={selectedSlotIndex}
            onSelectSlotIndex={(slot) => {
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.tourSlot;
                return next;
              });
              setSelectedSlotIndex(slot);
            }}
            managersAtSelectedSlot={managersAtSelectedSlot}
            availabilityLoading={availabilityLoading}
          />
        )}
        {step === 3 && (
          <Step3
            property={property}
            roomLabel={selectedRoomLabel}
            day={selectedDay}
            slotIndex={selectedSlotIndex}
            month={calMonth}
            year={calYear}
            submitting={bookingTour}
            fieldErrors={fieldErrors}
            onFieldChange={(key) =>
              setFieldErrors((prev) => {
                if (!(key in prev)) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
              })
            }
            onSubmit={async ({ name, email, phone, notes }) => {
              if (bookingTour) return;
              const errs: Record<string, string> = {};
              if (!name.trim()) errs.name = "Name is required.";
              if (!email.trim()) errs.email = "Email is required.";
              if (Object.keys(errs).length > 0) {
                setFieldErrors(errs);
                showToast("Please fix the highlighted fields before continuing.");
                queueMicrotask(() => scrollToFirstWizardFieldError(TOUR_STEP_FIELD_ORDER[3] ?? [], errs));
                return;
              }
              if (selectedDay == null || selectedSlotIndex == null) return;
              if (managersAtSelectedSlot.length === 0) {
                showToast("That tour time is no longer available.");
                return;
              }
              const dateStr = toLocalDateStr(new Date(calYear, calMonth, selectedDay, 12, 0, 0, 0));
              const start = localDateAtSlotStart(dateStr, selectedSlotIndex);
              const end = new Date(start.getTime() + 30 * 60 * 1000);
              const selectedSlotKey = dateSlotKey(dateStr, selectedSlotIndex);
              const propertyContext = [
                `Property: ${property.title}`,
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
                    propertyId: manager.propertyId || property.id,
                    propertyTitle: property.title,
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
                  propertyId: property.id,
                  buildingName: property.buildingName,
                  address: property.address,
                });
                setAvailabilityLoading(true);
                void fetch(`/api/public/property-tour-availability?${params.toString()}`)
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

      <div className={`mt-6 flex ${step > 1 ? "justify-between" : "justify-end"}`}>
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as TourStep)}
            className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-muted hover:bg-accent/30"
          >
            Back
          </button>
        )}
        {step < 3 && (
          <button
            type="button"
            onClick={() => {
              const errs: Record<string, string> = {};
              if (step === 1) {
                if (!selectedRoomKey) errs.room = "Choose a room to tour.";
              }
              if (step === 2) {
                if (selectedDay === null || selectedSlotIndex === null || managersAtSelectedSlot.length === 0) {
                  errs.tourSlot = "Select a date and time for your tour.";
                }
              }
              if (Object.keys(errs).length > 0) {
                setFieldErrors(errs);
                showToast("Please fix the highlighted fields before continuing.");
                queueMicrotask(() => scrollToFirstWizardFieldError(TOUR_STEP_FIELD_ORDER[step] ?? [], errs));
                return;
              }
              setFieldErrors({});
              const next = (step + 1) as TourStep;
              setStep(next);
              setMaxStepReached((m) => nextWizardMaxReached(m, next) as TourStep);
            }}
            className="rounded-full bg-primary px-7 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

function Step1({
  property,
  onSelectRoom,
  selectedRoomKey,
  fieldErrors,
}: {
  property: MockProperty;
  onSelectRoom: (roomKey: string | null) => void;
  selectedRoomKey: string | null;
  fieldErrors: Record<string, string>;
}) {
  const roomOptions: PropertySearchOption[] = roomOptionsForProperty(property).map((option) => ({
    id: option.key,
    title: option.label,
    subtitle: option.subtitle,
    tags: [property.address, property.neighborhood, `Available ${property.available}`],
    searchText: `${option.label} ${option.subtitle} ${property.address} ${property.neighborhood} ${property.rentLabel}`,
  }));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Choose the room you would like to tour.</p>
      <div data-wizard-field="room" className={wizardSectionErrorClass(Boolean(fieldErrors.room))}>
        <PropertySearchPicker
          options={roomOptions}
          value={selectedRoomKey}
          onChange={onSelectRoom}
          placeholder="Search rooms by name, floor, or rent…"
          emptyMessage="No rooms match your search."
          listEmptyMessage="No rooms listed for this property."
          ariaLabel="Search rooms to tour"
        />
        {fieldErrors.room ? <p className="mt-2 text-xs font-medium text-red-600">{fieldErrors.room}</p> : null}
      </div>
    </div>
  );
}

function Step2({
  property,
  availability,
  fieldErrors,
  calMonth, calYear, onPrevMonth, onNextMonth,
  selectedDay, onSelectDay, selectedSlotIndex, onSelectSlotIndex,
  managersAtSelectedSlot,
  availabilityLoading,
}: {
  property: MockProperty;
  availability: Set<string>;
  fieldErrors: Record<string, string>;
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
      {availabilityLoading ? (
        <p className="rounded-2xl border px-4 py-3 text-sm portal-banner-info">
          Loading tour windows from the calendar...
        </p>
      ) : availability.size === 0 ? (
        <p className="rounded-2xl border px-4 py-3 text-sm portal-banner-pending">
          No tour windows are published for this property yet. Send a message to Axis or ask your property manager.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Pick one published 30-minute window for <span className="font-semibold text-foreground">{property.title}</span>.
        </p>
      )}
      <div
        data-wizard-field="tourSlot"
        className={wizardSectionErrorClass(Boolean(fieldErrors.tourSlot), "space-y-6 rounded-2xl")}
      >
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={onPrevMonth} className="rounded-full p-1.5 hover:bg-accent/30">
            <ChevronLeftIcon />
          </button>
          <p className="text-sm font-semibold text-foreground">{MONTHS[calMonth]} {calYear}</p>
          <button type="button" onClick={onNextMonth} className="rounded-full p-1.5 hover:bg-accent/30">
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
            const isAvailable = dateHasAvailability(new Date(calYear, calMonth, day, 12, 0, 0, 0), availability);
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
                    : "cursor-not-allowed text-foreground/30"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div>
          <p className="mb-3 text-sm font-semibold text-foreground">
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
                      : "border-border bg-card text-foreground hover:border-primary hover:text-primary"
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
          <p className="mb-3 text-sm font-semibold text-foreground">Multiple managers are available</p>
          <p className="mb-3 text-xs text-muted">
            We&apos;ll send this request to every available manager for this house. The first manager to approve gets the tour.
          </p>
        </div>
      )}
      {fieldErrors.tourSlot ? <p className="text-xs font-medium text-red-600">{fieldErrors.tourSlot}</p> : null}
      </div>
    </div>
  );
}

function Step3({
  property, roomLabel, day, slotIndex, month, year, submitting, onSubmit, fieldErrors, onFieldChange,
}: {
  property: MockProperty; roomLabel: string; day: number | null; slotIndex: number | null;
  month: number;
  year: number;
  submitting: boolean;
  fieldErrors: Record<string, string>;
  onFieldChange: (key: string) => void;
  onSubmit: (payload: { name: string; email: string; phone: string; notes: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-accent/30 px-4 py-3 text-sm">
        <p className="font-semibold text-foreground">{roomLabel || property.title}</p>
        <p className="mt-0.5 text-muted">
          {MONTHS[month]} {day}, {year} · {slotIndex != null ? formatAvailabilitySlotLabel(slotIndex) : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" fieldKey="name" error={fieldErrors.name}>
          <input
            id="tour-name"
            type="text"
            value={name}
            onChange={(e) => {
              onFieldChange("name");
              setName(e.target.value);
            }}
            placeholder="Jane Smith"
            className={wizardFieldErrorClass(Boolean(fieldErrors.name), inputCls)}
          />
        </Field>
        <Field label="Email *" fieldKey="email" error={fieldErrors.email}>
          <input
            id="tour-email"
            type="email"
            value={email}
            onChange={(e) => {
              onFieldChange("email");
              setEmail(e.target.value);
            }}
            placeholder="jane@email.com"
            className={wizardFieldErrorClass(Boolean(fieldErrors.email), inputCls)}
          />
        </Field>
      </div>
      <Field label="Phone" fieldKey="phone">
        <input id="tour-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(206) 555-0100" className={inputCls} />
      </Field>
      <Field label="Notes (optional)">
        <textarea id="tour-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should prepare in advance?" className={`${inputCls} resize-none`} />
      </Field>

      <button
        type="button"
        disabled={submitting}
        onClick={() => onSubmit({ name, email, phone, notes })}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(0,122,255,0.28)] transition-all hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-alt))" }}
      >
        {submitting ? "Booking..." : "Book tour"}
      </button>
    </div>
  );
}

function MessageFlow({
  propertyId,
  propertyTitle,
  onSuccess,
}: {
  propertyId: string;
  propertyTitle?: string;
  onSuccess: () => void;
}) {
  const { showToast } = useAppUi();
  const [topic, setTopic] = useState("");
  const [otherTopicDetail, setOtherTopicDetail] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isOther = topic === "Other";

  const handleSend = async () => {
    if (!topic) {
      showToast("Please select a topic.");
      return;
    }
    const resolvedTopic = isOther ? otherTopicDetail.trim() : topic;
    if (isOther && !otherTopicDetail.trim()) {
      showToast("Please describe your topic.");
      return;
    }
    const n = name.trim();
    const em = email.trim();
    const msg = message.trim();
    if (!n || !em.includes("@")) {
      showToast("Please enter your name and email.");
      return;
    }
    if (!msg) {
      showToast("Please enter a message.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/property-lead-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          name: n,
          email: em,
          phone: phone.trim() || undefined,
          topic: resolvedTopic,
          body: msg,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(data.error ?? "Could not send message.");
        return;
      }
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
      setTopic("");
      setOtherTopicDetail("");
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
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
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted/70">
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

      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-bold text-foreground">Your contact & message</h2>
        <p className="mt-1 text-sm text-muted">
          We will reply to the email you provide{propertyTitle ? ` about ${propertyTitle}` : ""}.
        </p>
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *">
              <input type="text" placeholder="Jane Smith" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email *">
              <input type="email" placeholder="jane@email.com" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <Field label="Phone">
            <input type="tel" placeholder="(206) 555-0100" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Message *">
            <textarea rows={4} placeholder="Tell us more so we can help…" className={`${inputCls} resize-none`} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={submitting}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(0,122,255,0.28)] transition-all hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-alt))" }}
      >
        {submitting ? "Sending…" : "Send message"}
      </button>
    </div>
  );
}

function Field({
  label,
  children,
  fieldKey,
  error,
}: {
  label: string;
  children: React.ReactNode;
  fieldKey?: string;
  error?: string;
}) {
  return (
    <div data-wizard-field={fieldKey}>
      <p className="mb-1.5 text-xs font-semibold text-muted">{label}</p>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-accent/30 px-3.5 py-2.5 text-sm text-foreground outline-none transition-all duration-150 placeholder:text-muted/70 focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/15 hover:border-border";

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
