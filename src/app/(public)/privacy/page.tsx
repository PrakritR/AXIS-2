import type { Metadata } from "next";
import Link from "next/link";
import { PublicMobileBackBar } from "@/components/layout/public-mobile-back-bar";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Axis collects, uses, and protects information when you use our property management platform and mobile apps.",
};

const LAST_UPDATED = "June 28, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen px-4 py-16 sm:py-20 [html[data-native]_&]:py-4 [html[data-native]_&]:pt-[max(1rem,env(safe-area-inset-top))]">
      <PublicMobileBackBar label="Back" />
      <article className="glass-card mx-auto max-w-3xl rounded-3xl px-6 py-10 sm:px-10 sm:py-12">
        <header className="border-b border-border pb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">Legal</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted">Last updated: {LAST_UPDATED}</p>
        </header>

        <div className="prose-policy mt-8 space-y-8 text-[15px] leading-relaxed text-muted">
          <section>
            <h2 className="text-lg font-semibold text-foreground">Who we are</h2>
            <p className="mt-2">
              Axis (&ldquo;we,&rdquo; &ldquo;us&rdquo;) provides property management software operated by Axis Seattle
              Housing. This policy describes how we collect, use, and protect information when you use the Axis website
              at{" "}
              <a href="https://www.axis-seattle-housing.com" className="font-medium text-primary hover:opacity-90">
                axis-seattle-housing.com
              </a>{" "}
              and our iOS and Android mobile applications (collectively, the &ldquo;Service&rdquo;).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Information we collect</h2>
            <ul className="mt-3 list-disc space-y-2 ps-5">
              <li>
                <strong className="font-medium text-foreground">Account information:</strong> name, email address, phone
                number, and role (property manager or resident) when you create an account or are invited by your
                property manager.
              </li>
              <li>
                <strong className="font-medium text-foreground">Property and tenancy data:</strong> lease details, payment
                history, maintenance requests, documents, and messages you submit through the Service.
              </li>
              <li>
                <strong className="font-medium text-foreground">Payment information:</strong> rent and subscription
                payments are processed by Stripe. We do not store full card or bank account numbers on our servers.
              </li>
              <li>
                <strong className="font-medium text-foreground">Mobile app data:</strong> push notification tokens when you
                opt in to alerts; camera or photo library access only when you choose to attach images to documents or
                work orders.
              </li>
              <li>
                <strong className="font-medium text-foreground">Usage data:</strong> standard technical logs (such as IP
                address, browser or device type, and pages visited) to operate, secure, and improve the Service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">How we use information</h2>
            <ul className="mt-3 list-disc space-y-2 ps-5">
              <li>Provide, maintain, and improve the Axis platform</li>
              <li>Process payments and send transaction-related communications</li>
              <li>
                Send email, SMS, and push notifications related to your account (for example, rent reminders and messages)
              </li>
              <li>Authenticate users and prevent fraud or abuse</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">How we share information</h2>
            <p className="mt-2">
              We share information with service providers that help us operate Axis, including Supabase (authentication
              and database hosting), Stripe (payments), Twilio (SMS), Resend (email), and Google Firebase (push
              notifications). We do not sell your personal information.
            </p>
            <p className="mt-2">
              We may disclose information if required by law, to protect our rights or users, or in connection with a
              merger, acquisition, or sale of assets, with notice where appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Your choices</h2>
            <ul className="mt-3 list-disc space-y-2 ps-5">
              <li>Update profile information in the manager or resident portal.</li>
              <li>Disable push notifications in your device Settings.</li>
              <li>
                Residents: contact your property manager for questions about tenancy data or to request account closure.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Data retention</h2>
            <p className="mt-2">
              We retain information for as long as your account is active or as needed to provide the Service and meet
              legal, accounting, or reporting requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Security</h2>
            <p className="mt-2">
              We use industry-standard safeguards, including encrypted connections (HTTPS) and access controls. No method
              of transmission or storage is completely secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Children</h2>
            <p className="mt-2">
              The Service is not directed to children under 13, and we do not knowingly collect personal information from
              children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Changes to this policy</h2>
            <p className="mt-2">
              We may update this policy from time to time. We will post the revised version at this URL and update the
              &ldquo;Last updated&rdquo; date above.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Contact us</h2>
            <p className="mt-2">
              For privacy questions, contact us at{" "}
              <a href="mailto:info@axis-seattle-housing.com" className="font-medium text-primary hover:opacity-90">
                info@axis-seattle-housing.com
              </a>{" "}
              or{" "}
              <Link href="/partner/contact" className="font-medium text-primary hover:opacity-90">
                send a message
              </Link>
              .
            </p>
            <p className="mt-2">
              Axis Seattle Housing
              <br />
              5259 Brooklyn Ave NE
              <br />
              Seattle, WA 98105
              <br />
              United States
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
