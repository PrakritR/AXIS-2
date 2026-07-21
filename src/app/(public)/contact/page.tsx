"use client";

import { PartnerMeetingScheduler } from "@/components/partner/partner-meeting-scheduler";
import { MarketingEyebrow } from "@/components/marketing/marketing-cta";
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { SegmentedTwo } from "@/components/ui/segmented-control";
import { PUBLIC_SUPPORT_EMAIL } from "@/lib/marketing/public-contact";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import "@/components/marketing/landing-proplane.css";

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
        <MarketingPageShell>
          <div className="lp-w py-20 text-center text-sm text-[var(--lp-muted)]">Loading…</div>
        </MarketingPageShell>
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
    <MarketingPageShell>
      <header className="lp-page-hero">
        <div className="lp-w max-w-[560px]">
          <MarketingEyebrow>Contact</MarketingEyebrow>
          <h1 className="lp-page-title lp-page-title-wide">Connect with the PropLane team</h1>
          <p className="lp-page-lede">
            Schedule a demo or send a message — whatever works best for you.
          </p>

          <div className="mt-6">
            <SegmentedTwo
              value={tab}
              onChange={setTab}
              left={{ id: "schedule", label: "Book a demo" }}
              right={{ id: "message", label: "Send message" }}
            />
          </div>

          <div key={tab} className="animate-fade-in text-left">
            {tab === "message" ? (
              <ContactMessageForm showToast={showToast} />
            ) : (
              <div className="mt-6">
                <PartnerMeetingScheduler showToast={showToast} />
              </div>
            )}
          </div>
        </div>
      </header>
    </MarketingPageShell>
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
        showToast(`Could not send your message. Please try again or email ${PUBLIC_SUPPORT_EMAIL}.`);
        return;
      }
      showToast("Message sent. Our team will get back to you soon.");
      setName("");
      setEmail("");
      setTopic("");
      setBody("");
    } catch {
      showToast(`Could not send your message. Please try again or email ${PUBLIC_SUPPORT_EMAIL}.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lp-page-form space-y-4">
      <div className="lp-page-field-row">
        <div className="lp-page-field">
          <label htmlFor="contact-name">Name *</label>
          <input
            id="contact-name"
            type="text"
            placeholder="Jane Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="lp-page-field">
          <label htmlFor="contact-email">Email *</label>
          <input
            id="contact-email"
            type="email"
            placeholder="jane@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="lp-page-field">
        <label htmlFor="contact-topic">Topic *</label>
        <select id="contact-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Select…</option>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="lp-page-field">
        <label htmlFor="contact-body">Message *</label>
        <textarea
          id="contact-body"
          rows={8}
          placeholder="What can we help you with?"
          className="min-h-[180px] resize-y leading-relaxed"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <button
        type="button"
        data-attr="contact-us-submit"
        onClick={submit}
        disabled={submitting}
        className="lp-btn lp-btn-blue lp-lg mt-2 w-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send message"}
      </button>
    </div>
  );
}
