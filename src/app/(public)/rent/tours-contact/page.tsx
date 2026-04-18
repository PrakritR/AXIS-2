"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PillTabs } from "@/components/ui/tabs";
import { Input, Textarea, Select } from "@/components/ui/input";
import { useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";

export default function ToursContactPage() {
  const { showToast } = useAppUi();
  const [mode, setMode] = useState<"tour" | "message">("tour");
  const [step, setStep] = useState(1);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Schedule tour & contact</h1>
      <p className="mt-2 text-sm text-slate-600">
        Book a tour or send the Axis team a message — combined here as one destination (demo shell).
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

        {mode === "tour" ? (
          <>
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
                    step === s.id ? "bg-[#2b5ce7] text-white" : "bg-slate-100 text-slate-600"
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
          </>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-600" htmlFor="tc-name">
                  Name *
                </label>
                <Input id="tc-name" className="mt-2" placeholder="Jane Smith" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600" htmlFor="tc-email">
                  Email *
                </label>
                <Input id="tc-email" className="mt-2" placeholder="jane@email.com" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="tc-topic">
                Topic
              </label>
              <Select id="tc-topic" className="mt-2">
                <option>Select…</option>
                <option>Tour question</option>
                <option>Listing question</option>
                <option>Other</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="tc-msg">
                Message *
              </label>
              <Textarea id="tc-msg" className="mt-2" placeholder="What can we help you with?" />
            </div>
            <Button type="button" className="w-full" variant="secondary" onClick={() => showToast("Message sent (demo)")}>
              Send message
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
