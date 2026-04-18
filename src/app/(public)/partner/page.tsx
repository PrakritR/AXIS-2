import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function PartnerLandingPage() {
  return (
    <div>
      <section className="border-b border-border bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Start with Axis.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted">
            Partner with Axis starts here: choose a tier, open partner signup, and complete checkout or free-tier setup.
            This page is a marketing shell — integrations are intentionally disabled.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/partner/pricing">
              <Button type="button">View pricing</Button>
            </Link>
            <Link href="/partner/contact">
              <Button type="button" variant="outline">
                Contact Axis
              </Button>
            </Link>
            <Link href="/auth/sign-in">
              <Button type="button" variant="ghost">
                Manager login
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section id="why" className="mx-auto max-w-6xl px-4 py-14">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Why Axis</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Visibility without the spreadsheet chaos</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Listings that feel trustworthy",
              body: "Consistent cards, photos, and policies help applicants decide faster.",
            },
            {
              title: "Operations in one place",
              body: "Leasing, maintenance, and payments each have a home in the manager portal.",
            },
            {
              title: "Admin-ready governance",
              body: "Approvals, audit trails, and analytics are structured for growth.",
            },
          ].map((x) => (
            <Card key={x.title} className="p-6">
              <p className="text-lg font-semibold">{x.title}</p>
              <p className="mt-2 text-sm text-muted">{x.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="services" className="border-y border-border bg-white py-14">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Services</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">What Axis helps you deliver</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <CardHeader title="Marketing & leasing" subtitle="Listings, tours, applications, and messaging." />
            </Card>
            <Card className="p-6">
              <CardHeader title="Resident experience" subtitle="Payments, work orders, announcements, documents." />
            </Card>
            <Card className="p-6">
              <CardHeader title="Owner reporting" subtitle="Occupancy, revenue, and maintenance trends (mock charts later)." />
            </Card>
            <Card className="p-6">
              <CardHeader title="Integrations" subtitle="Stripe/Airtable placeholders live in the admin tools section." />
            </Card>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-14">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">How it works</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">From signup to steady-state operations</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            "Create your manager profile and company record (demo).",
            "Publish listings and invite residents to the resident portal.",
            "Operate day-to-day with work orders, announcements, and payments views.",
          ].map((t, idx) => (
            <li key={t} className="rounded-3xl border border-border bg-card p-6">
              <p className="text-xs font-semibold text-primary">Step {idx + 1}</p>
              <p className="mt-2 text-sm text-muted">{t}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="pricing" className="border-y border-border bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pricing / plans</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Choose a tier (placeholder)</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted">
            Full pricing UI lives on <Link className="font-semibold text-primary" href="/partner/pricing">/partner/pricing</Link>.
          </p>
          <div className="mt-8">
            <Link href="/partner/pricing">
              <Button type="button">Open pricing</Button>
            </Link>
          </div>
        </div>
      </section>

      <section id="testimonials" className="mx-auto max-w-6xl px-4 py-14">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Testimonials</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Owners like fewer tools</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {["“We finally have one link for applicants.”", "“Residents stopped texting random numbers.”", "“Admin approvals are clear.”"].map(
            (q) => (
              <Card key={q} className="p-6">
                <p className="text-sm text-foreground">{q}</p>
              </Card>
            ),
          )}
        </div>
      </section>

      <section id="faq" className="border-t border-border bg-white py-14">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">FAQ</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Partner questions</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <p className="text-sm font-semibold">Is rent collection included?</p>
              <p className="mt-2 text-sm text-muted">In the demo, payments views are mocked end-to-end.</p>
            </Card>
            <Card className="p-6">
              <p className="text-sm font-semibold">Can I import properties?</p>
              <p className="mt-2 text-sm text-muted">Admin tools include an Airtable sync placeholder.</p>
            </Card>
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-6xl px-4 py-16">
        <Card className="flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Contact</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Book a demo or talk to sales</h2>
            <p className="mt-2 max-w-prose text-sm text-muted">
              The partner contact page includes a full form layout (demo-only submission).
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/partner/contact">
              <Button type="button" variant="primary">
                Book a demo
              </Button>
            </Link>
            <Link href="/partner/pricing">
              <Button type="button" variant="outline">
                Get started
              </Button>
            </Link>
            <Link href="/rent/faq">
              <Button type="button" variant="ghost">
                Learn more
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
