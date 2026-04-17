import { PropertyCard } from "@/components/marketing/property-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { mockProperties } from "@/data/mock-properties";
import Link from "next/link";

const faqs = [
  {
    q: "Do listings include real availability?",
    a: "This demo uses mock availability. Later, availability will sync from your source of truth.",
  },
  {
    q: "Can I apply with roommates?",
    a: "Yes — the Apply flow is structured for group applications (still placeholder here).",
  },
  {
    q: "How do portals work?",
    a: "Managers, residents, and admins each get a dedicated workspace with separate navigation.",
  },
];

export default function HomePage() {
  return (
    <div>
      <section className="border-b border-border bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <Badge tone="info">Seattle-first housing software</Badge>
          <h1 className="mt-6 font-serif text-4xl font-normal leading-tight text-foreground sm:text-5xl">
            Find housing that works for you
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted">
            Axis Housing is a polished UI scaffold: browse listings, schedule tours, apply online, and
            operate your portfolio from manager, resident, and admin portals — all navigable today.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/rent/listings">
              <Button type="button" className="w-full min-w-[220px] sm:w-auto">
                Browse listings
              </Button>
            </Link>
            <Link href="/partner">
              <Button type="button" variant="outline" className="w-full min-w-[220px] sm:w-auto">
                Partner with Axis
              </Button>
            </Link>
            <Link href="/auth/sign-in">
              <Button type="button" variant="ghost" className="w-full min-w-[220px] sm:w-auto">
                Open portal sign-in
              </Button>
            </Link>
          </div>

          <Card className="mx-auto mt-12 max-w-4xl p-6 text-left">
            <CardHeader
              title="Start a search (demo)"
              subtitle="Pick dates and budget — results are mocked, but the UI is production-shaped."
            />
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-muted">Move-in</p>
                <div className="mt-2 rounded-2xl border border-border bg-slate-50 px-3 py-2 text-sm text-muted">
                  Select a date…
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted">Move-out</p>
                <div className="mt-2 rounded-2xl border border-border bg-slate-50 px-3 py-2 text-sm text-muted">
                  Optional…
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted">Max budget</p>
                <div className="mt-2 rounded-2xl border border-border bg-slate-50 px-3 py-2 text-sm text-muted">
                  $500 – $1,100 (demo)
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted">
              Enter a move-in date or budget to see matching listings (mocked on the listings page).
            </p>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Featured properties
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Homes people are touring this week</h2>
            <p className="mt-2 max-w-prose text-sm text-muted">
              These cards use shared `PropertyCard` UI and mock JSON — swap in your data layer later.
            </p>
          </div>
          <Link href="/rent/listings">
            <Button type="button" variant="outline">
              View all listings
            </Button>
          </Link>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {mockProperties.slice(0, 3).map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-white py-14">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">How it works</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Three calm steps</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Browse with confidence",
                body: "Posted pricing, photos, and amenities — structured for fast comparisons.",
              },
              {
                title: "Apply once, stay organized",
                body: "Applicants get a guided flow; managers get a pipeline with statuses.",
              },
              {
                title: "Operate from one system",
                body: "Residents and managers each have a portal tuned to their day-to-day work.",
              },
            ].map((s) => (
              <Card key={s.title} className="p-6">
                <p className="text-lg font-semibold">{s.title}</p>
                <p className="mt-2 text-sm text-muted">{s.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Testimonials</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Operators like the clarity</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            {
              quote: "The portal tabs alone saved us a week of alignment meetings.",
              who: "Jordan · Property manager",
            },
            {
              quote: "Residents finally know where to pay, message, and download leases.",
              who: "Avery · Resident",
            },
            {
              quote: "Admin views feel like a real control tower — even with mock data.",
              who: "Riley · Admin",
            },
          ].map((t) => (
            <Card key={t.who} className="p-6">
              <p className="text-sm text-foreground">“{t.quote}”</p>
              <p className="mt-4 text-xs font-semibold text-muted">{t.who}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">FAQ preview</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Answers before you apply</h2>
            </div>
            <Link href="/rent/faq">
              <Button type="button" variant="outline">
                Read full FAQ
              </Button>
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {faqs.map((f) => (
              <Card key={f.q} className="p-6">
                <p className="text-sm font-semibold">{f.q}</p>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <Card className="flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Contact</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Talk to the Axis team</h2>
            <p className="mt-2 max-w-prose text-sm text-muted">
              Use the rent contact page for applicants, or the partner contact page for owners and operators.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/rent/contact">
              <Button type="button" variant="primary">
                Rent contact
              </Button>
            </Link>
            <Link href="/partner/contact">
              <Button type="button" variant="outline">
                Partner contact
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
