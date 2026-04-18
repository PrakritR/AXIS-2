"use client";

import { useState } from "react";
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
  const [selectedProperty, setSelectedProperty] = useState<MockProperty | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

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
                if (s.n === 1) setStep(1);
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
            properties={mockProperties}
            selected={selectedProperty}
            onSelect={setSelectedProperty}
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
            onClick={() => setStep((s) => (s - 1) as TourStep)}
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
  properties,
  selected,
  onSelect,
}: {
  properties: MockProperty[];
  selected: MockProperty | null;
  onSelect: (p: MockProperty) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Choose a property and room to tour.</p>
      {properties.map((p) => {
        const isSelected = selected?.id === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className={`w-full rounded-2xl border p-4 text-left transition-all duration-150 ${
              isSelected
                ? "border-[#3b66f5] bg-[#eef2ff] ring-2 ring-[#3b66f5]/20"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{p.address}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip>{p.neighborhood}</Chip>
                  <Chip>{p.rentLabel}</Chip>
                  <Chip>Available {p.available}</Chip>
                </div>
              </div>
              <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isSelected ? "border-[#3b66f5] bg-[#3b66f5]" : "border-slate-300 bg-white"
              }`}>
                {isSelected && <span className="text-white"><CheckSmIcon /></span>}
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
  const [selectedProperty, setSelectedProperty] = useState<MockProperty | null>(null);

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
          <select className={`${inputCls} appearance-none pr-8`}>
            <option value="">Select a topic</option>
            {TOPICS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            <ChevronDownIcon />
          </span>
        </div>
      </div>

      {/* Property context */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Property context</h2>
        <p className="mt-1 text-sm text-slate-500">
          Optional. With many homes on file, search and pick from the list instead of scrolling long pages.
        </p>
        <div className="mt-4 space-y-2">
          {mockProperties.map((p) => {
            const isSelected = selectedProperty?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProperty(isSelected ? null : p)}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                  isSelected
                    ? "border-[#3b66f5] bg-[#eef2ff] text-[#3b66f5]"
                    : "border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200"
                }`}
              >
                <span className="font-semibold">{p.title}</span>
                <span className="ml-2 text-xs opacity-70">{p.neighborhood} · {p.rentLabel}</span>
              </button>
            );
          })}
        </div>
        {selectedProperty && (
          <p className="mt-3 text-xs text-[#3b66f5]">
            Context set to: <strong>{selectedProperty.title}</strong>
          </p>
        )}
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
        onClick={onSuccess}
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
