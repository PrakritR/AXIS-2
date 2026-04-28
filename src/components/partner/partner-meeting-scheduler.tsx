"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  appendPartnerInquiry,
  dateStrFromCalendar,
  formatAvailabilitySlotLabel,
  isCalendarDayBeforeToday,
  localDateAtSlotStart,
} from "@/lib/demo-admin-scheduling";

type Step = 1 | 2;
type AdminAvailabilityHost = { adminUserId: string; adminLabel: string };

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
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<string[]>([]);
  const [selectedHostBySlot, setSelectedHostBySlot] = useState<Record<string, string>>({});
  const [slotHosts, setSlotHosts] = useState<Record<string, AdminAvailabilityHost[]>>({});
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const bump = useCallback(() => setTick((t) => t + 1), []);

  const loadAvailability = useCallback(async () => {
    setLoadingAvailability(true);
    try {
      const res = await fetch("/api/public/admin-availability", { cache: "no-store" });
      const body = (await res.json()) as { slotHosts?: Record<string, AdminAvailabilityHost[]> };
      setSlotHosts(res.ok && body.slotHosts ? body.slotHosts : {});
    } catch {
      setSlotHosts({});
    } finally {
      setLoadingAvailability(false);
    }
  }, []);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability, tick]);

  useEffect(() => {
    const on = () => bump();
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [bump]);

  const hasAnyPublished = Object.keys(slotHosts).length > 0;

  const selectedDateStr =
    selectedDay != null ? dateStrFromCalendar(calYear, calMonth, selectedDay) : null;
  const openSlots = selectedDateStr
    ? Object.keys(slotHosts)
        .filter((key) => key.startsWith(`${selectedDateStr}:`) && (slotHosts[key]?.length ?? 0) > 0)
        .map((key) => Number.parseInt(key.split(":")[1] ?? "", 10))
        .filter((slot) => Number.isFinite(slot))
        .sort((a, b) => a - b)
    : [];
  const selectedWindows = useMemo(
    () =>
      selectedSlotKeys
        .map((key) => {
          const [dateStr, slotText] = key.split(":");
          const slotIndex = Number.parseInt(slotText ?? "", 10);
          if (!dateStr || !Number.isFinite(slotIndex)) return null;
          return {
            key,
            dateStr,
            slotIndex,
            start: localDateAtSlotStart(dateStr, slotIndex),
            hosts: slotHosts[key] ?? [],
            selectedAdminUserId: selectedHostBySlot[key] ?? "",
          };
        })
        .filter((window): window is { key: string; dateStr: string; slotIndex: number; start: Date; hosts: AdminAvailabilityHost[]; selectedAdminUserId: string } => Boolean(window))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [selectedHostBySlot, selectedSlotKeys, slotHosts],
  );

  const canContinue = selectedWindows.length > 0 && selectedWindows.every((window) => window.hosts.length <= 1 || window.selectedAdminUserId);
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);

  const resetPickers = () => {
    setSelectedDay(null);
    setSelectedSlotKeys([]);
    setSelectedHostBySlot({});
  };

  const submit = () => {
    const n = name.trim();
    const em = email.trim();
    if (!n || !em) {
      showToast("Please enter your name and email.");
      return;
    }
    if (selectedWindows.length === 0) {
      showToast("Please go back and choose at least one time.");
      return;
    }
    const requestedWindows = selectedWindows.map((window) => {
      const end = new Date(window.start.getTime() + 30 * 60 * 1000);
      const host =
        window.hosts.find((candidate) => candidate.adminUserId === window.selectedAdminUserId) ??
        window.hosts[0];
      return {
        start: window.start.toISOString(),
        end: end.toISOString(),
        adminUserId: host?.adminUserId,
        adminLabel: host?.adminLabel,
      };
    });
    appendPartnerInquiry({
      name: n,
      email: em,
      phone: phone.trim(),
      notes: notes.trim(),
      requestedWindows,
      proposedStart: requestedWindows[0]!.start,
      proposedEnd: requestedWindows[0]!.end,
      adminUserId: requestedWindows[0]?.adminUserId,
      adminLabel: requestedWindows[0]?.adminLabel,
    });
    showToast("Request sent. Your proposed windows are now in the Axis calendar.");
    setStep(1);
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    resetPickers();
    bump();
  };

  const toggleSlot = (dateStr: string, slotIndex: number) => {
    const key = `${dateStr}:${slotIndex}`;
    const hosts = slotHosts[key] ?? [];
    setSelectedSlotKeys((current) => {
      if (current.includes(key)) {
        setSelectedHostBySlot((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return current.filter((item) => item !== key);
      }
      if (hosts.length === 1) {
        setSelectedHostBySlot((prev) => ({ ...prev, [key]: hosts[0]!.adminUserId }));
      }
      return [...current, key];
    });
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
                {loadingAvailability ? (
                  "Loading meeting windows..."
                ) : (
                  <>
                    No meeting windows are published yet. Availability can be set under{" "}
                    <span className="font-semibold">Admin portal - Events - Availability</span>. You can still use the
                    message tab to reach us.
                  </>
                )}
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Pick one or more 30-minute windows that work for you. Only highlighted days and times match what
                your Axis contact published in the admin portal.
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
                  const open = Object.keys(slotHosts).some((key) => key.startsWith(`${ds}:`) && (slotHosts[key]?.length ?? 0) > 0);
                  const isPast = isCalendarDayBeforeToday(calYear, calMonth, day);
                  const isSelected = selectedDay === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!open || isPast}
                      onClick={() => {
                        setSelectedDay(day);
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
                    {openSlots.map((slotIndex) => {
                      const slotKey = `${selectedDateStr}:${slotIndex}`;
                      const isSelected = selectedSlotKeys.includes(slotKey);
                      return (
                      <button
                        key={slotIndex}
                        type="button"
                        onClick={() => toggleSlot(selectedDateStr, slotIndex)}
                        className={`rounded-xl border py-2.5 text-xs font-semibold transition-all ${
                          isSelected
                            ? "border-primary bg-primary text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-primary hover:text-primary"
                        }`}
                      >
                        {formatAvailabilitySlotLabel(slotIndex)}
                      </button>
                    );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {selectedWindows.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {selectedWindows.length} requested {selectedWindows.length === 1 ? "window" : "windows"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedSlotKeys([])}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Clear all
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedWindows.map((window) => (
                    <div key={window.key} className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-3">
                      <button
                        type="button"
                        onClick={() => toggleSlot(window.dateStr, window.slotIndex)}
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-primary shadow-sm"
                      >
                        {window.start.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · {formatAvailabilitySlotLabel(window.slotIndex)} ×
                      </button>
                      {window.hosts.length > 1 ? (
                        <label className="mt-3 block text-xs font-semibold text-slate-600">
                          Choose admin
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                            value={window.selectedAdminUserId}
                            onChange={(e) => setSelectedHostBySlot((prev) => ({ ...prev, [window.key]: e.target.value }))}
                          >
                            <option value="">Select admin</option>
                            {window.hosts.map((host) => (
                              <option key={host.adminUserId} value={host.adminUserId}>
                                {host.adminLabel}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : window.hosts[0] ? (
                        <p className="mt-2 text-xs font-medium text-slate-600">With {window.hosts[0].adminLabel}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
                {!canContinue ? (
                  <p className="mt-3 text-xs font-semibold text-amber-700">
                    Pick an admin for each selected time with multiple admins available.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5">
            {selectedWindows.length > 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                <p className="font-semibold text-slate-800">Requested windows</p>
                <div className="mt-2 space-y-1 text-slate-600">
                  {selectedWindows.map((window) => (
                    <p key={window.key}>
                      {window.start.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      · {formatAvailabilitySlotLabel(window.slotIndex)}–{formatAvailabilitySlotLabel(window.slotIndex + 1)}
                      {window.hosts.length ? (
                        <> · {window.hosts.find((host) => host.adminUserId === window.selectedAdminUserId)?.adminLabel ?? window.hosts[0]!.adminLabel}</>
                      ) : null}
                    </p>
                  ))}
                </div>
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
