import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-black text-white">
              AX
            </span>
            <div>
              <p className="text-sm font-semibold">Axis Housing</p>
              <p className="text-xs text-muted">Seattle-first demo product shell</p>
            </div>
          </div>
          <p className="text-sm text-muted">
            Available housing with posted pricing, applications, and portals for managers,
            residents, and admins.
          </p>
          <p className="text-sm font-semibold text-foreground">(206) 555-0199</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Explore</p>
          <ul className="mt-3 space-y-2 text-sm font-semibold">
            <li>
              <Link className="hover:text-primary" href="/rent/listings">
                Explore properties
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" href="/rent/apply">
                Apply for housing
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" href="/rent/contact">
                Contact
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" href="/partner">
                Partner with Axis
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Housing</p>
          <ul className="mt-3 space-y-2 text-sm font-semibold">
            <li>
              <Link className="hover:text-primary" href="/rent/listings">
                Available housing
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" href="/rent/apply">
                Apply
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" href="/rent/faq">
                Questions
              </Link>
            </li>
            <li>
              <Link className="hover:text-primary" href="/partner/contact">
                Lease questions
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Location</p>
          <p className="mt-3 text-sm text-muted">
            500 Union St
            <br />
            Seattle, WA 98101
          </p>
          <a
            className="mt-3 inline-flex text-sm font-semibold text-primary"
            href="https://maps.google.com/?q=500+Union+St+Seattle+WA"
            target="_blank"
            rel="noreferrer"
          >
            View on Google Maps →
          </a>
        </div>
      </div>
      <div className="border-t border-border bg-slate-50 py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} Axis Housing · Demo scaffold
      </div>
    </footer>
  );
}
