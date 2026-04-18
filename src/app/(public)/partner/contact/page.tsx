"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";
import { SegmentedTwo } from "@/components/ui/segmented-control";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export default function PartnerContactPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200/80 bg-white p-8 shadow-[0_4px_32px_-4px_rgba(15,23,42,0.1)]">
            <p className="text-center text-sm text-slate-500">Loading…</p>
          </div>
        </div>
      }
    >
      <PartnerContactInner />
    </Suspense>
  );
}

function PartnerContactInner() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab") === "schedule" ? "schedule" : "message";
  const [tab, setTab] = useState<"schedule" | "message">(tabFromUrl);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "schedule") setTab("schedule");
    else if (t === "message") setTab("message");
  }, [searchParams]);

  return (
    <div className="min-h-screen px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-[0_4px_32px_-4px_rgba(15,23,42,0.1)]">
          <h1 className="text-2xl font-bold tracking-tight text-[#0d1f4e]">Connect with Axis Team</h1>

          <div className="mt-5">
            <SegmentedTwo
              value={tab}
              onChange={setTab}
              left={{ id: "schedule", label: "Schedule meeting" }}
              right={{ id: "message", label: "Send message" }}
            />
          </div>

          <div key={tab} className="animate-fade-in">
            {tab === "message" ? (
              <MessageForm onSubmit={() => showToast("Message sent (demo)")} />
            ) : (
              <ScheduleForm onSubmit={() => showToast("Meeting booked (demo)")} />
            )}
          </div>
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
          <input type="text" placeholder="Jane Smith" className={inputCls} />
        </Field>
        <Field label="Email *">
          <input type="email" placeholder="jane@company.com" className={inputCls} />
        </Field>
      </div>

      <Field label="Topic">
        <select className={inputCls}>
          <option value="">Select…</option>
          <option>Use our software</option>
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
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Choose a date</p>
        <p className="text-sm italic text-slate-400">
          No open meeting slots yet. Use the &ldquo;Send message&rdquo; tab to contact us directly.
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
        className="mt-2 w-full rounded-2xl bg-[#0d1f4e] py-3.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#162d6e] active:scale-[0.98]"
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
