"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";
import { SegmentedTwo } from "@/components/ui/segmented-control";
import { incrementAdminInboxUnopened } from "@/lib/demo-admin-inbox";
import { appendPartnerInquiry, isStartInsideAvailability } from "@/lib/demo-admin-scheduling";
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
              <MessageForm
                onSubmit={() => {
                  incrementAdminInboxUnopened();
                  showToast("Message sent. Our team will follow up.");
                }}
              />
            ) : (
              <ScheduleForm showToast={showToast} />
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

function combineDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ScheduleForm({ showToast }: { showToast: (m: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");

  const submit = () => {
    const n = name.trim();
    const em = email.trim();
    if (!n || !em) {
      showToast("Please enter your name and email.");
      return;
    }
    const start = combineDateTime(dateStr, timeStr);
    if (!start) {
      showToast("Please choose a date and start time.");
      return;
    }
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    if (!isStartInsideAvailability(start.toISOString())) {
      showToast(
        "That time is outside published availability. You can still request it — an admin must accept the meeting.",
      );
    }
    appendPartnerInquiry({
      name: n,
      email: em,
      phone: phone.trim(),
      notes: notes.trim(),
      proposedStart: start.toISOString(),
      proposedEnd: end.toISOString(),
    });
    showToast("Request sent. You will receive a confirmation once our team accepts the slot.");
    setNotes("");
    setPhone("");
    setDateStr("");
    setTimeStr("");
  };

  return (
    <div className="mt-6 space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Choose a time</p>
        <p className="text-sm text-slate-600">
          Pick a slot that matches the availability your Axis contact published in the admin portal. If you are unsure,
          use the message tab.
        </p>
      </div>

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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date *">
          <input type="date" className={inputCls} value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </Field>
        <Field label="Start time *">
          <input type="time" className={inputCls} value={timeStr} onChange={(e) => setTimeStr(e.target.value)} />
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
        className="mt-2 w-full rounded-2xl bg-[#0d1f4e] py-3.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#162d6e] active:scale-[0.98]"
      >
        Request meeting
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
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15 hover:border-slate-300";
