"use client";

import { useMemo, useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import Link from "next/link";

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

// Generate some fake time slots for demo
const TIME_SLOTS = ["9:00 AM", "10:00 AM", "11:30 AM", "1:00 PM", "2:30 PM", "4:00 PM"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

// Fake "available" days (just some days for demo)
const AVAILABLE_DAYS = new Set([3,7,8,10,14,15,17,21,22,24,28]);

type BuildingGroup = {
  buildingId: string;
  buildingName: string;
  address: string;
  neighborhood: string;
  units: MockProperty[];
};

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

export default function ToursContactPage() {
  const { showToast } = useAppUi();
  const [tab, setTab] = useState<Tab>("tour");

  return (
    <div className="min-h-screen px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-[#0d1f4e]">
          {tab === "tour" ? "Schedule tour" : "Message Axis"}
        </h1>

        {/* Tab toggle */}
        <div className="mt-6 flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <TabBtn active={tab === "tour"} onClick={() => setTab("tour")}>Set up tour</TabBtn>
          <TabBtn active={tab === "message"} onClick={() => setTab("message")}>Send message</TabBtn>
        </div>

        {tab === "tour" ? (
          <TourFlow onSuccess={() => showToast("Tour booked! (demo)")} />
        ) : (
          <MessageFlow onSuccess={() => showToast("Message sent (demo)")} />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   TOUR FLOW
──────────────────────────────────────────────────────────── */
function TourFlow({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<TourStep>(1);
  const [step1Phase, setStep1Phase] = useState<"property" | "room">("property");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<MockProperty | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  const buildings = useMemo(() => groupByBuilding(mockProperties), []);

  const canContinue1 = selectedProperty !== null;
  const canContinue2 = selectedDay !== null && selectedTime !== null;

  const steps = [
    { n: 1, label: "Property & room" },
    { n: 2, label: "Date & time" },
    { n: 3, label: "Your details" },
  ];

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
                  ? "bg-[#3b66f5] text-white"
                  : s.n < step
                  ? "bg-[#3b66f5]/20 text-[#3b66f5]"
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
              setStep1Phase("room");
            }}
            onBackToProperties={() => {
              setSelectedBuildingId(null);
              setSelectedProperty(null);
              setStep1Phase("property");
            }}
            onSelectRoom={(p) => {
              setSelectedProperty(p);
              setSelectedBuildingId(p.buildingId);
            }}
          />
        )}
        {step === 2 && (
          <Step2
            calMonth={calMonth}
            calYear={calYear}
            onPrevMonth={() => {
              if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
              else setCalMonth(m => m - 1);
            }}
            onNextMonth={() => {
              if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
              else setCalMonth(m => m + 1);
            }}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            selectedTime={selectedTime}
            onSelectTime={setSelectedTime}
          />
        )}
        {step === 3 && (
          <Step3
            property={selectedProperty}
            day={selectedDay}
            time={selectedTime}
            month={calMonth}
            year={calYear}
            onSubmit={onSuccess}
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
            className="rounded-full bg-[#3b66f5] px-7 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#3259e3] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
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
}: {
  buildings: BuildingGroup[];
  phase: "property" | "room";
  selectedBuildingId: string | null;
  selectedProperty: MockProperty | null;
  onSelectBuilding: (buildingId: string) => void;
  onBackToProperties: () => void;
  onSelectRoom: (p: MockProperty) => void;
}) {
  if (phase === "property") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Choose a property to tour. You&apos;ll pick a specific room next.</p>
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
          className="text-sm font-semibold text-[#3b66f5] hover:underline"
        >
          ← All properties
        </button>
      </div>
      {building.units.map((p) => {
        const isSelected = selectedProperty?.id === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectRoom(p)}
            className={`w-full rounded-2xl border p-4 text-left transition-all duration-150 ${
              isSelected
                ? "border-[#3b66f5] bg-[#eef2ff] ring-2 ring-[#3b66f5]/20"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {p.buildingName} · {p.unitLabel}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{p.address}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip>{p.neighborhood}</Chip>
                  <Chip>{p.rentLabel}</Chip>
                  <Chip>Available {p.available}</Chip>
                </div>
              </div>
              <div
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  isSelected ? "border-[#3b66f5] bg-[#3b66f5]" : "border-slate-300 bg-white"
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
  calMonth, calYear, onPrevMonth, onNextMonth,
  selectedDay, onSelectDay, selectedTime, onSelectTime,
}: {
  calMonth: number; calYear: number;
  onPrevMonth: () => void; onNextMonth: () => void;
  selectedDay: number | null; onSelectDay: (d: number) => void;
  selectedTime: string | null; onSelectTime: (t: string) => void;
}) {
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const today = new Date();

  return (
    <div className="space-y-6">
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
            const isAvailable = AVAILABLE_DAYS.has(day);
            const isSelected = selectedDay === day;
            const isPast = calYear === today.getFullYear() && calMonth === today.getMonth() && day < today.getDate();
            return (
              <button
                key={day}
                type="button"
                disabled={!isAvailable || isPast}
                onClick={() => { onSelectDay(day); onSelectTime(null!); }}
                className={`aspect-square rounded-xl text-sm font-medium transition-all ${
                  isSelected
                    ? "bg-[#3b66f5] text-white shadow-sm"
                    : isAvailable && !isPast
                    ? "bg-white text-slate-800 hover:bg-[#eef2ff] hover:text-[#3b66f5]"
                    : "cursor-not-allowed text-slate-300"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">Highlighted dates have available slots.</p>
      </div>

      {/* Time slots */}
      {selectedDay && (
        <div>
          <p className="mb-3 text-sm font-semibold text-slate-700">
            Available times — {MONTHS[calMonth]} {selectedDay}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {TIME_SLOTS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSelectTime(t)}
                className={`rounded-xl border py-2.5 text-xs font-semibold transition-all ${
                  selectedTime === t
                    ? "border-[#3b66f5] bg-[#3b66f5] text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-[#3b66f5] hover:text-[#3b66f5]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Step3({
  property, day, time, month, year, onSubmit,
}: {
  property: MockProperty | null; day: number | null; time: string | null;
  month: number; year: number; onSubmit: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
        <p className="font-semibold text-slate-800">{property?.title}</p>
        <p className="mt-0.5 text-slate-500">
          {MONTHS[month]} {day}, {year} · {time}
        </p>
      </div>

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
      <Field label="Notes (optional)">
        <textarea rows={3} placeholder="Anything we should prepare in advance?" className={`${inputCls} resize-none`} />
      </Field>

      <button
        type="button"
        onClick={onSubmit}
        className="w-full rounded-2xl bg-[#3b66f5] py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(59,102,245,0.3)] transition-all hover:bg-[#3259e3] active:scale-[0.98]"
      >
        Book tour
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   MESSAGE FLOW
──────────────────────────────────────────────────────────── */
function MessageFlow({ onSuccess }: { onSuccess: () => void }) {
  const { showToast } = useAppUi();
  const buildings = useMemo(() => groupByBuilding(mockProperties), []);
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
          <Link href="/resident/dashboard" className="font-semibold text-[#3b66f5] hover:underline">
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
                className="text-sm font-semibold text-[#3b66f5] hover:underline"
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
                          ? "border-[#3b66f5] bg-white text-[#3b66f5] ring-2 ring-[#3b66f5]/15"
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
          <p className="mt-3 text-xs text-[#3b66f5]">
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
        className="w-full rounded-2xl bg-[#3b66f5] py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(59,102,245,0.3)] transition-all hover:bg-[#3259e3] active:scale-[0.98]"
      >
        Send message
      </button>
    </div>
  );
}

/* ── Shared UI primitives ── */
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-150 ${
        active ? "bg-[#3b66f5] text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

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
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-400 focus:border-[#3b66f5] focus:bg-white focus:ring-2 focus:ring-[#3b66f5]/15 hover:border-slate-300";

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
