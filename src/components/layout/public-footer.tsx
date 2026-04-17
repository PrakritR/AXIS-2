import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-4">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-sm font-black tracking-tight text-white">
              AX
            </span>
            <span className="leading-[1.1]">
              <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-900">
                AXIS
              </span>
              <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-900">
                SEATTLE
              </span>
            </span>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Available housing in Seattle with posted pricing and online applications.
          </p>
          <div className="space-y-2 text-sm font-semibold text-slate-800">
            <p className="flex items-center gap-2">
              <span className="text-slate-500" aria-hidden>
                ☎
              </span>
              <a href="tel:+15103098345" className="hover:text-[#2563eb]">
                (510) 309-8345
              </a>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-slate-500" aria-hidden>
                ✉
              </span>
              <a href="mailto:info@axis-seattle-housing.com" className="hover:text-[#2563eb]">
                info@axis-seattle-housing.com
              </a>
            </p>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Explore</p>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold text-slate-800">
            <li>
              <Link className="hover:text-[#2563eb]" href="/rent/listings">
                Explore properties
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2563eb]" href="/rent/apply">
                Apply housing
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2563eb]" href="/rent/contact">
                Contact
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2563eb]" href="/partner">
                Partner with Axis
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Housing</p>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold text-slate-800">
            <li>
              <Link className="hover:text-[#2563eb]" href="/rent/listings">
                Available housing
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2563eb]" href="/rent/apply">
                Apply
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2563eb]" href="/rent/faq">
                Questions
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2563eb]" href="/partner/contact">
                Lease questions
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Location</p>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            5259 Brooklyn Ave NE
            <br />
            Seattle, WA 98105
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">Seattle, WA</p>
          <a
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#2563eb] hover:underline"
            href="https://maps.google.com/?q=5259+Brooklyn+Ave+NE+Seattle+WA+98105"
            target="_blank"
            rel="noreferrer"
          >
            <span aria-hidden>📍</span> View on Google Maps
          </a>
        </div>
      </div>
      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Axis Seattle
      </div>
    </footer>
  );
}
