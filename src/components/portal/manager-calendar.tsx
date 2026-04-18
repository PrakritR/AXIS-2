"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

const weekDays = [
  { id: "mon", label: "Mon", date: "Apr 21" },
  { id: "tue", label: "Tue", date: "Apr 22" },
  { id: "wed", label: "Wed", date: "Apr 23" },
  { id: "thu", label: "Thu", date: "Apr 24" },
  { id: "fri", label: "Fri", date: "Apr 25" },
];

const hours = ["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM"];
const slotRows = ["9:00", "9:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "1:00", "1:30", "2:00", "2:30", "3:00", "3:30", "4:00", "4:30"];

const meetings = [
  { day: "mon", start: 1, span: 2, title: "Pioneer leasing sync", color: "border-primary/20 bg-primary/[0.08] text-primary" },
  { day: "wed", start: 5, span: 3, title: "Applicant review block", color: "bg-violet-100 text-violet-900 border-violet-200" },
  { day: "thu", start: 9, span: 2, title: "Vendor calls", color: "bg-emerald-100 text-emerald-900 border-emerald-200" },
];

function slotKey(day: string, time: string) {
  return `${day}:${time}`;
}

export function ManagerCalendar() {
  const [activeSlots, setActiveSlots] = useState<Set<string>>(
    () =>
      new Set([
        slotKey("mon", "9:00"),
        slotKey("mon", "9:30"),
        slotKey("tue", "1:00"),
        slotKey("tue", "1:30"),
        slotKey("wed", "10:00"),
        slotKey("thu", "3:00"),
        slotKey("fri", "11:30"),
      ]),
  );
  const [dragMode, setDragMode] = useState<"add" | "remove" | null>(null);

  const availableCount = useMemo(() => activeSlots.size, [activeSlots]);

  const applySlot = (key: string, mode: "add" | "remove") => {
    setActiveSlots((current) => {
      const next = new Set(current);
      if (mode === "add") next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <ManagerSectionShell
      title="Calendar"
      filters={<PortalPropertyFilter />}
      actions={[
        { label: "Share", variant: "primary" },
        { label: "Refresh", variant: "outline" },
      ]}
    >
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Week view</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">April 21–25</h2>
            </div>
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
              {meetings.length} scheduled blocks
            </div>
          </div>
          <div className="mt-6 grid grid-cols-[68px_repeat(5,minmax(0,1fr))] gap-px overflow-hidden rounded-[24px] border border-slate-200 bg-slate-200">
            <div className="bg-slate-50" />
            {weekDays.map((day) => (
              <div key={day.id} className="bg-slate-50 px-3 py-3 text-center">
                <p className="text-sm font-semibold text-slate-900">{day.label}</p>
                <p className="text-xs text-slate-500">{day.date}</p>
              </div>
            ))}
            {hours.map((hour, hourIndex) => (
              <>
                <div key={`${hour}-label`} className="bg-white px-3 py-5 text-xs font-semibold text-slate-400">
                  {hour}
                </div>
                {weekDays.map((day) => {
                  const meeting = meetings.find((item) => item.day === day.id && item.start === hourIndex * 2);
                  return (
                    <div key={`${day.id}-${hour}`} className="relative min-h-[76px] bg-white p-2">
                      {meeting ? (
                        <div className={`absolute inset-2 rounded-2xl border px-3 py-3 text-sm font-semibold shadow-sm ${meeting.color}`} style={{ height: `calc(${meeting.span} * 76px - 8px)` }}>
                          {meeting.title}
                        </div>
                      ) : (
                        <div className="h-full rounded-2xl border border-dashed border-slate-100" />
                      )}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Availability editor</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Public booking windows</h2>
            </div>
            <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              {availableCount} open slots
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Click or drag to paint availability. Filled cells are available for residents, tours, or partner calls.
          </p>

          <div
            className="mt-5 grid grid-cols-[64px_repeat(5,minmax(0,1fr))] gap-1 rounded-[24px] bg-slate-50 p-3"
            onMouseLeave={() => setDragMode(null)}
            onMouseUp={() => setDragMode(null)}
          >
            <div />
            {weekDays.map((day) => (
              <div key={day.id} className="px-1 py-2 text-center text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                {day.label}
              </div>
            ))}
            {slotRows.map((time) => (
              <>
                <div key={`${time}-label`} className="flex items-center text-xs font-medium text-slate-400">
                  {time}
                </div>
                {weekDays.map((day) => {
                  const key = slotKey(day.id, time);
                  const active = activeSlots.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onMouseDown={() => {
                        const nextMode = active ? "remove" : "add";
                        setDragMode(nextMode);
                        applySlot(key, nextMode);
                      }}
                      onMouseEnter={() => {
                        if (dragMode) applySlot(key, dragMode);
                      }}
                      onMouseUp={() => setDragMode(null)}
                      className={`h-8 rounded-xl border transition ${
                        active
                          ? "border-emerald-300 bg-emerald-200/80"
                          : "border-white bg-white hover:border-primary/20 hover:bg-primary/[0.06]"
                      }`}
                    />
                  );
                })}
              </>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setActiveSlots(new Set())}>
              Clear all
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setActiveSlots(
                  new Set(
                    weekDays.flatMap((day) => ["10:00", "10:30", "11:00", "2:00", "2:30"].map((time) => slotKey(day.id, time))),
                  ),
                )
              }
            >
              Apply template
            </Button>
          </div>
        </Card>
      </div>
    </ManagerSectionShell>
  );
}
