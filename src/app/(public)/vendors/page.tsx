import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Vendors · Axis",
  description:
    "Get discovered by property managers, receive work orders, bid after a tour, and get paid — free to join as an Axis vendor.",
};

const KEY_FACTS = [
  { value: "$450", label: "Avg. monthly earnings per active vendor" },
  { value: "Free", label: "No subscription, no listing fee" },
  { value: "1099", label: "Tax info stays on file for accurate filing" },
] as const;

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Get matched",
    body: "Managers near you send work orders when your trade fits the job.",
  },
  {
    step: 2,
    title: "Tour & bid",
    body: "Visit the property, submit your price and schedule, and message in Axis.",
  },
  {
    step: 3,
    title: "Get paid",
    body: "Approved work is paid directly through Axis — labor and materials tracked.",
  },
] as const;

const VENDOR_SIGNUP_HREF = "/auth/create-account?mode=create&role=vendor";

export default function VendorsPage() {
  return (
    <div className="min-h-screen px-4 py-12 sm:px-5 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
          Work orders, sent straight to you.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
          Axis connects you to property managers who need repairs, turnovers, and maintenance — without
          marketplace fees or cold outreach.
        </p>

        <div className="mx-auto mt-8 max-w-md">
          <div className="grid grid-cols-3 gap-2">
            {KEY_FACTS.map((f) => (
              <div key={f.label} className="glass-card rounded-2xl px-2 py-3">
                <p className="text-lg font-black tracking-tight text-foreground sm:text-xl">{f.value}</p>
                <p className="mt-1 text-[10px] font-medium leading-tight text-muted">{f.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">How it works</p>
          <div className="mt-6 flex items-start justify-center">
            {HOW_IT_WORKS.map((item, i) => (
              <div key={item.step} className="contents">
                {i > 0 ? (
                  <div
                    aria-hidden
                    className="mt-5 h-0 w-6 shrink-0 border-t-2 border-dashed border-primary/40 sm:mt-5 sm:w-10"
                  />
                ) : null}
                <div className="flex w-[5.5rem] flex-col items-center gap-2 sm:w-28">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                    {item.step}
                  </span>
                  <span className="text-center text-xs font-semibold leading-tight text-foreground">{item.title}</span>
                  <span className="text-center text-[11px] leading-snug text-muted">{item.body}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-lg glass-card rounded-3xl p-6 text-left sm:p-7">
          <h2 className="text-center text-base font-semibold text-foreground">Stay connected to every job</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>
                <strong className="font-semibold text-foreground">Inbox with managers</strong> — schedule visits,
                answer questions, and confirm scope without email chains.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>
                <strong className="font-semibold text-foreground">Calendar &amp; work orders</strong> — see what&apos;s
                open, in progress, and completed in one vendor portal.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>
                <strong className="font-semibold text-foreground">Invites &amp; payouts</strong> — managers add you to
                their roster; approved jobs flow to payment when work is done.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-md text-center">
        <Link
          href={VENDOR_SIGNUP_HREF}
          className="btn-cobalt inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full py-3 text-[15px] font-semibold outline-none ring-primary/0 transition-[transform,box-shadow,filter,background-color,border-color] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-[0.99] sm:w-auto sm:px-10"
          data-attr="vendors-get-started"
          style={{ background: "var(--btn-primary)" }}
        >
          Get started
        </Link>
        <p className="mt-5 text-sm text-muted">
          Already have an account?{" "}
          <Link
            href="/auth/sign-in"
            className="font-semibold text-primary hover:underline"
            data-attr="vendors-sign-in-link"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
