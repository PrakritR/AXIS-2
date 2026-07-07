import Link from "next/link";
import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { RevealOnView } from "@/components/motion/reveal-on-view";
import { isPublicDemoSurfaceEnabled } from "@/lib/public-demo-access";

const AUDIENCES = [
  {
    href: "/rent/browse",
    dataAttr: "home-audience-resident",
    title: "Looking for a home?",
    body: "Browse available listings and apply online.",
    cta: "Browse listings",
    icon: <HomeIcon />,
  },
  {
    href: "/auth/create-account?mode=create&role=manager",
    dataAttr: "home-audience-manager",
    title: "Manage with AI",
    body: "Start your 14-day free trial — no card required.",
    cta: "Get started",
    icon: <BuildingIcon />,
  },
  {
    href: "/auth/create-account?mode=create&role=vendor",
    dataAttr: "home-audience-vendor",
    title: "Work as a vendor?",
    body: "Get matched to jobs near you and get paid.",
    cta: "Sign up free",
    icon: <WrenchIcon />,
  },
  {
    href: "/demo",
    dataAttr: "home-audience-demo",
    title: "Want to try it first?",
    body: "Explore a live sandbox — no signup required.",
    cta: "Try the demo",
    icon: <PlayIcon />,
  },
] as const;

export function LandingAudienceGrid() {
  const audiences = isPublicDemoSurfaceEnabled()
    ? AUDIENCES
    : AUDIENCES.filter((a) => a.href !== "/demo");

  return (
    <section className="relative overflow-hidden py-14 sm:py-20">
      <ChromeSubstrate variant="quiet" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
        <RevealOnView>
          <h2 className="mx-auto max-w-2xl text-center text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[2.5rem]">
            One platform for renters, managers, and vendors
          </h2>
        </RevealOnView>

        <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
          {audiences.map((a, i) => (
            <RevealOnView key={a.href} delayMs={i * 60} className="h-full">
              <Link
                href={a.href}
                data-attr={a.dataAttr}
                className="glass-card group flex h-full cursor-pointer flex-col rounded-2xl p-7 transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-[var(--shadow-card-hover)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
                  {a.icon}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-foreground">{a.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{a.body}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors duration-200 group-hover:gap-2">
                  {a.cta}
                  <ArrowIcon />
                </span>
              </Link>
            </RevealOnView>
          ))}
        </div>

        <RevealOnView delayMs={AUDIENCES.length * 60}>
          <div className="mt-8 flex justify-center">
            <Link
              href="/auth/sign-in"
              data-attr="home-sign-in"
              className="text-sm font-semibold text-muted transition-colors duration-200 hover:text-foreground"
            >
              Already have an account? <span className="text-primary">Sign in</span>
            </Link>
          </div>
        </RevealOnView>
      </div>
    </section>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 22V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v18" /><path d="M2 22h20" />
      <path d="M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
