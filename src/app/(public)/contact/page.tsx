"use client";

import { PartnerMeetingScheduler } from "@/components/partner/partner-meeting-scheduler";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { SegmentedTwo } from "@/components/ui/segmented-control";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const SUPPORT_EMAIL = "info@axis-seattle-housing.com";

const TOPICS = [
  "General question",
  "Property management services",
  "Leasing & availability",
  "Support",
  "Other",
];

export default function ContactPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen px-4 py-16 sm:py-20">
          <div className="glass-card mx-auto max-w-2xl rounded-3xl p-8">
            <p className="text-center text-sm text-muted">Loading…</p>
          </div>
        </div>
      }
    >
      <ContactInner />
    </Suspense>
  );
}

function ContactInner() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab") === "schedule" ? "schedule" : "message";
  const [tab, setTab] = useState<"schedule" | "message">(tabFromUrl);

  useEffect(() => {
    queueMicrotask(() => {
      const t = searchParams.get("tab");
      if (t === "schedule") setTab("schedule");
      else if (t === "message") setTab("message");
    });
  }, [searchParams]);

  return (
    <div className="min-h-screen px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <div className="glass-card rounded-3xl p-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Connect with PropLane Team</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            Schedule a meeting with our team or send us a message — whatever works best for you.
          </p>

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
              <ContactMessageForm showToast={showToast} />
            ) : (
              <PartnerMeetingScheduler showToast={showToast} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactMessageForm({ showToast }: { showToast: (m: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const n = name.trim();
    const em = email.trim();
    const tp = topic.trim();
    const msg = body.trim();
    if (!n || !em) {
      showToast("Please enter your name and email.");
      return;
    }
    if (!tp) {
      showToast("Please choose a topic.");
      return;
    }
    if (!msg) {
      showToast("Please enter a message.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/contact-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, email: em, topic: tp, body: msg }),
      });
      if (!res.ok) {
        showToast(`Could not send your message. Please try again or email ${SUPPORT_EMAIL}.`);
        return;
      }
      showToast("Message sent. Our team will get back to you soon.");
      setName("");
      setEmail("");
      setTopic("");
      setBody("");
    } catch {
      showToast(`Could not send your message. Please try again or email ${SUPPORT_EMAIL}.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *">
          <input type="text" placeholder="Jane Smith" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email *">
          <input type="email" placeholder="jane@company.com" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>

      <Field label="Topic *">
        <select className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Select…</option>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>

      <Field label="Message *">
        <textarea
          rows={10}
          placeholder="What can we help you with?"
          className={`${inputCls} min-h-[220px] resize-y leading-relaxed`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>

      <button
        type="button"
        data-attr="contact-us-submit"
        onClick={submit}
        disabled={submitting}
        className="btn-cobalt mt-2 w-full rounded-2xl py-3.5 text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send message"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">{label}</p>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border/60 bg-auth-input-bg px-3.5 py-2.5 text-sm text-foreground outline-none transition-all duration-150 placeholder:text-muted/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/25 hover:border-primary/25";
