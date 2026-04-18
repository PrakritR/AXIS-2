import { AxisLogoLink } from "@/components/brand/axis-logo";
import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-4">
        <div className="space-y-4">
          <AxisLogoLink href="/" />
          <p className="text-sm leading-relaxed text-slate-600">
            Available housing in Seattle with posted pricing and online applications.
          </p>
          <div className="space-y-2 text-sm font-semibold text-slate-800">
            <p className="flex items-center gap-2">
              <span className="text-slate-500" aria-hidden>
                ☎
              </span>
              <a href="tel:+15103098345" className="hover:text-[#2b5ce7]">
                (510) 309-8345
              </a>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-slate-500" aria-hidden>
                ✉
              </span>
              <a href="mailto:info@axis-seattle-housing.com" className="hover:text-[#2b5ce7]">
                info@axis-seattle-housing.com
              </a>
            </p>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Explore</p>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold text-slate-800">
            <li>
              <Link className="hover:text-[#2b5ce7]" href="/rent/listings">
                Explore properties
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2b5ce7]" href="/rent/apply">
                Apply housing
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2b5ce7]" href="/rent/contact">
                Contact
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2b5ce7]" href="/partner/contact">
                Partner with Axis
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Housing</p>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold text-slate-800">
            <li>
              <Link className="hover:text-[#2b5ce7]" href="/rent/listings">
                Available housing
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2b5ce7]" href="/rent/apply">
                Apply
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2b5ce7]" href="/rent/faq">
                Questions
              </Link>
            </li>
            <li>
              <Link className="hover:text-[#2b5ce7]" href="/partner/contact">
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
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#2b5ce7] hover:underline"
            href="https://maps.google.com/?q=5259+Brooklyn+Ave+NE+Seattle+WA+98105"
            target="_blank"
            rel="noreferrer"
          >
            <span aria-hidden>📍</span> View on Google Maps
          </a>
        </div>
      </div>
      <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-100 px-4 py-4 text-xs text-slate-500 sm:flex-row">
        <span>© {new Date().getFullYear()} Axis Seattle</span>
        <span className="font-medium text-slate-600">Axis Seattle, WA</span>
      </div>
    </footer>
  );
}
