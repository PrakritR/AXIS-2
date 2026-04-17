"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PillTabs } from "@/components/ui/tabs";
import { useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";

export default function ToursPage() {
  const { showToast } = useAppUi();
  const [mode, setMode] = useState<"tour" | "message">("tour");
  const [step, setStep] = useState(1);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Schedule tour</h1>
      <p className="mt-2 text-sm text-muted">
        Tabs, stepper, and empty states match the reference UI — data is mocked.
      </p>

      <Card className="mt-8 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PillTabs
            items={[
              { id: "tour", label: "Set up tour" },
              { id: "message", label: "Send message" },
            ]}
            activeId={mode}
            onChange={(id) => setMode(id as "tour" | "message")}
          />
          <Button type="button" variant="outline" onClick={() => showToast("Calendars sync later")}>
            View availability
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
          {[
            { id: 1, label: "1 Property & room" },
            { id: 2, label: "2 Date & time" },
            { id: 3, label: "3 Your details" },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={`rounded-full px-3 py-1 ${
                step === s.id ? "bg-primary text-white" : "bg-slate-100 text-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No tours are currently available for the selected property (demo empty state).
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" disabled>
            Continue
          </Button>
        </div>
      </Card>
    </div>
  );
}
