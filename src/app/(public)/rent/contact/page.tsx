"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";
import Link from "next/link";

const TOPICS = [
  "General leasing question",
  "Availability & move-in dates",
  "Neighborhood & area",
  "Application process",
  "Pricing & fees",
  "Pet policy",
  "Other",
];

export default function RentContactPage() {
  const { showToast } = useAppUi();

  return (
    <div className="min-h-screen px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-[#0d1f4e]">Message Axis</h1>

        <div className="mt-6 space-y-3">
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
            onClick={() => showToast("Message sent (demo)")}
            className="w-full rounded-2xl bg-[#3b66f5] py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(59,102,245,0.3)] transition-all hover:bg-[#3259e3] active:scale-[0.98]"
          >
            Send message
          </button>
        </div>
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
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-400 focus:border-[#3b66f5] focus:bg-white focus:ring-2 focus:ring-[#3b66f5]/15 hover:border-slate-300";

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
