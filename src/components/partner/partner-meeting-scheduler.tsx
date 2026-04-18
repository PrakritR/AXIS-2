"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  appendPartnerInquiry,
  dateHasOpenSlots,
  dateStrFromCalendar,
  formatAvailabilitySlotLabel,
  getOpenSlotIndicesForDateStr,
  isCalendarDayBeforeToday,
  localDateAtSlotStart,
  readAvailabilityDateSet,
} from "@/lib/demo-admin-scheduling";

type Step = 1 | 2;

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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

export function PartnerMeetingScheduler({ showToast }: { showToast: (m: string) => void }) {
  const [step, setStep] = useState<Step>(1);
  const [tick, setTick] = useState(0);
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const on = () => bump();
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [bump]);

  const availability = useMemo(() => readAvailabilityDateSet(), [tick]);
  const hasAnyPublished = availability.size > 0;

  const selectedDateStr =
    selectedDay != null ? dateStrFromCalendar(calYear, calMonth, selectedDay) : null;
  const openSlots = selectedDateStr ? getOpenSlotIndicesForDateStr(selectedDateStr) : [];

  const canContinue = selectedDateStr != null && selectedSlotIndex != null;
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);

  const resetPickers = () => {
    setSelectedDay(null);
    setSelectedSlotIndex(null);
  };

  const submit = () => {
    const n = name.trim();
    const em = email.trim();
    if (!n || !em) {
      showToast("Please enter your name and email.");
      return;
    }
    if (selectedDateStr == null || selectedSlotIndex == null) {
      showToast("Please go back and choose a time.");
      return;
    }
    const start = localDateAtSlotStart(selectedDateStr, selectedSlotIndex);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    appendPartnerInquiry({
      name: n,
      email: em,
      phone: phone.trim(),
      notes: notes.trim(),
      proposedStart: start.toISOString(),
      proposedEnd: end.toISOString(),
    });
    showToast("Request sent. You will receive a confirmation once our team accepts the slot.");
    setStep(1);
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    resetPickers();
    bump();
  };

  const steps = [
    { n: 1 as const, label: "Date & time" },
    { n: 2 as const, label: "Your details" },
  ];

  return (
    <div className="mt-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 ? <div className="h-px w-4 bg-slate-200 sm:w-6" /> : null}
            <button
              type="button"
              onClick={() => {
                if (s.n === 1) setStep(1);
                if (s.n === 2 && canContinue) setStep(2);
              }}
              className="flex items-center gap-2"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  step === s.n ? "bg-primary text-white" : s.n < step ? "bg-primary/20 text-primary" : "bg-slate-100 text-slate-400"
                }`}
              >
                {s.n}
              </span>
              <span className={`hidden sm:inline text-sm ${step === s.n ? "font-semibold text-slate-800" : "text-slate-400"}`}>
                {s.label}
              </span>
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6">
        {step === 1 ? (
          <div className="space-y-6">
            {!hasAnyPublished ? (
              <p className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                No meeting windows are published yet. An Axis admin can set availability under{" "}
                <span className="font-semibold">Admin portal → Events → Availability</span>. You can still use the
                message tab to reach us.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Only highlighted days and times match what your Axis contact published in the admin portal.
              </p>
            )}

            <div>
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (calMonth === 0) {
                      setCalMonth(11);
                      setCalYear((y) => y - 1);
                    } else setCalMonth((m) => m - 1);
                    resetPickers();
                  }}
                  className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100"
                  aria-label="Previous month"
                >
                  <ChevronLeftIcon />
                </button>
                <p className="text-sm font-semibold text-slate-800">
                  {MONTHS[calMonth]} {calYear}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (calMonth === 11) {
                      setCalMonth(0);
                      setCalYear((y) => y + 1);
                    } else setCalMonth((m) => m + 1);
                    resetPickers();
                  }}
                  className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100"
                  aria-label="Next month"
                >
                  <ChevronRightIcon />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d) => (
                  <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase text-slate-400">
                    {d}
                  </div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const ds = dateStrFromCalendar(calYear, calMonth, day);
                  const open = dateHasOpenSlots(ds);
                  const isPast = isCalendarDayBeforeToday(calYear, calMonth, day);
                  const isSelected = selectedDay === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!open || isPast}
                      onClick={() => {
                        setSelectedDay(day);
                        setSelectedSlotIndex(null);
                      }}
                      className={`aspect-square rounded-xl text-sm font-medium transition-all ${
                        isSelected
                          ? "bg-primary text-white shadow-sm"
                          : open && !isPast
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

            {selectedDay != null && selectedDateStr ? (
              <div>
                <p className="mb-3 text-sm font-semibold text-slate-700">
                  Available times — {MONTHS[calMonth]} {selectedDay}
                </p>
                {openSlots.length === 0 ? (
                  <p className="text-sm text-slate-500">No open half-hour blocks on this day.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {openSlots.map((slotIndex) => (
                      <button
                        key={slotIndex}
                        type="button"
                        onClick={() => setSelectedSlotIndex(slotIndex)}
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
            ) : null}
          </div>
        ) : (
          <div className="space-y-5">
            {selectedDateStr != null && selectedSlotIndex != null ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <p className="font-semibold text-slate-800">Selected time</p>
                <p className="mt-0.5 text-slate-600">
                  {MONTHS[calMonth]} {selectedDay}, {calYear} · {formatAvailabilitySlotLabel(selectedSlotIndex)} (
                  one hour hold)
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *">
                <input
                  type="text"
                  placeholder="Jane Smith"
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Email *">
                <input
                  type="email"
                  placeholder="jane@email.com"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Phone">
              <input type="tel" placeholder="(206) 555-0100" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Notes (optional)">
              <textarea
                rows={3}
                placeholder="Anything we should prepare in advance?"
                className={`${inputCls} resize-none`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            <button
              type="button"
              onClick={submit}
              className="w-full rounded-2xl bg-[#0d1f4e] py-3.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#162d6e] active:scale-[0.98]"
            >
              Request meeting
            </button>
          </div>
        )}
      </div>

      <div className={`mt-6 flex ${step > 1 ? "justify-between" : "justify-end"}`}>
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Back
          </button>
        ) : null}
        {step < 2 ? (
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => setStep(2)}
            className="rounded-full bg-primary px-7 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            Continue
          </button>
        ) : null}
      </div>
    </div>
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

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15 hover:border-slate-300";
