import type { Metadata } from "next";
import Link from "next/link";

import { SupportFaq } from "./support-faq";

export const metadata: Metadata = {
  title: "Help & Support",
  description:
    "Get help with Axis — contact our team, find answers for residents and property managers, and learn how to reach support.",
};

const SUPPORT_EMAIL = "info@axis-seattle-housing.com";
const SUPPORT_PHONE_DISPLAY = "(510) 309-8345";
const SUPPORT_PHONE_TEL = "+15103098345";

export default function SupportPage() {
  return (
    <div className="min-h-screen px-4 py-16 sm:py-20">
      <article className="glass-card mx-auto max-w-3xl rounded-3xl px-6 py-10 sm:px-10 sm:py-12">
        <header className="border-b border-border pb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">Support</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Help &amp; Support</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            We&rsquo;re here to help. Reach out directly, or browse common questions for residents and property
            managers below. We typically respond within one business day.
          </p>
        </header>

        {/* Quick contact options */}
        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <ContactCard
            href={`mailto:${SUPPORT_EMAIL}`}
            label="Email us"
            value={SUPPORT_EMAIL}
            icon={<MailIcon />}
          />
          <ContactCard
            href={`tel:${SUPPORT_PHONE_TEL}`}
            label="Call us"
            value={SUPPORT_PHONE_DISPLAY}
            icon={<PhoneIcon />}
          />
          <ContactCard
            href="/partner/contact"
            label="Send a message"
            value="Contact form"
            icon={<ChatIcon />}
            internal
          />
        </section>

        {/* FAQs */}
        <div className="prose-policy mt-12 text-muted">
          <SupportFaq />
        </div>

        {/* Footer note */}
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="text-lg font-semibold text-foreground">Still need help?</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            If you couldn&rsquo;t find an answer, email us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:opacity-90">
              {SUPPORT_EMAIL}
            </a>{" "}
            or call {SUPPORT_PHONE_DISPLAY}. Residents with questions about a specific lease, payment, or unit should
            also reach out to their property manager directly through the resident portal.
          </p>
          <p className="mt-4 text-[13px] text-muted/80">
            See also our{" "}
            <Link href="/privacy" className="font-medium text-primary hover:opacity-90">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/tos" className="font-medium text-primary hover:opacity-90">
              Terms of Service
            </Link>
            .
          </p>
          <address className="mt-6 text-[15px] not-italic leading-relaxed text-muted">
            Axis Seattle Housing
            <br />
            5259 Brooklyn Ave NE
            <br />
            Seattle, WA 98105
            <br />
            United States
          </address>
        </section>
      </article>
    </div>
  );
}

function ContactCard({
  href,
  label,
  value,
  icon,
  internal = false,
}: {
  href: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  internal?: boolean;
}) {
  const className =
    "group flex flex-col gap-3 rounded-2xl border border-border bg-[var(--glass-fill)] p-5 transition-colors hover:border-primary/50";
  const inner = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/80">{label}</span>
        <span className="mt-0.5 block break-words text-[15px] font-medium text-foreground transition-colors group-hover:text-primary">
          {value}
        </span>
      </span>
    </>
  );

  if (internal) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {inner}
    </a>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
