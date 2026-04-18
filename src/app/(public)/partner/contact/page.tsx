"use client";

import { useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";

export default function PartnerContactPage() {
  const { showToast } = useAppUi();
  const [tab, setTab] = useState<"schedule" | "message">("message");

  return (
    <div className="min-h-screen px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-[0_4px_32px_-4px_rgba(15,23,42,0.1)]">
          <h1 className="text-2xl font-bold tracking-tight text-[#0d1f4e]">
            Connect with Axis Team
          </h1>

          {/* Tab toggle */}
          <div className="mt-5 flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setTab("schedule")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-150 ${
                tab === "schedule"
                  ? "bg-[#3b66f5] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Schedule meeting
            </button>
            <button
              type="button"
              onClick={() => setTab("message")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-150 ${
                tab === "message"
                  ? "bg-[#3b66f5] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Send message
            </button>
          </div>

          {tab === "message" ? (
            <MessageForm onSubmit={() => showToast("Message sent (demo)")} />
          ) : (
            <ScheduleForm onSubmit={() => showToast("Meeting booked (demo)")} />
          )}
        </div>
      </div>
    </div>
  );
}

function MessageForm({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *">
          <input
            type="text"
            placeholder="Jane Smith"
            className={inputCls}
          />
        </Field>
        <Field label="Email *">
          <input
            type="email"
            placeholder="jane@company.com"
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Topic">
        <select className={inputCls}>
          <option value="">Select…</option>
          <option>Pricing</option>
          <option>Onboarding</option>
          <option>Integrations</option>
          <option>Property management</option>
        </select>
      </Field>

      <Field label="Message *">
        <textarea
          rows={4}
          placeholder="What can we help you with?"
          className={`${inputCls} resize-none`}
        />
      </Field>

      <button
        type="button"
        onClick={onSubmit}
        className="mt-2 w-full rounded-2xl bg-[#0d1f4e] py-3.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#162d6e] active:scale-[0.98]"
      >
        Send message
      </button>
    </div>
  );
}

function ScheduleForm({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div className="mt-6 space-y-5">
      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-500">
        Available times come from each team member&apos;s weekly meeting windows in{" "}
        <strong className="font-semibold text-slate-700">Admin portal → Calendar</strong> (saved to the internal database). When you book here, the meeting is saved to their calendar and removed from the public list.
      </p>

      <Field label="Choose admin">
        <input
          type="text"
          defaultValue="prakritramachandran@gmail.com"
          className={`${inputCls} border-[#3b66f5] ring-2 ring-[#3b66f5]/15`}
        />
      </Field>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Choose a date</p>
        <p className="text-sm italic text-slate-400">
          No open tour slots set for this property yet. Use the &ldquo;Send message&rdquo; tab to contact us directly.
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
        <textarea
          rows={3}
          placeholder="Anything we should prepare in advance?"
          className={`${inputCls} resize-none`}
        />
      </Field>

      <button
        type="button"
        onClick={onSubmit}
        disabled
        className="w-full cursor-not-allowed rounded-2xl bg-slate-300 py-3.5 text-sm font-semibold text-slate-500"
      >
        Book meeting
      </button>
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
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-400 focus:border-[#3b66f5] focus:ring-2 focus:ring-[#3b66f5]/15 hover:border-slate-300";
