import Link from "next/link";
import { ApplicationsPipelinePanel } from "@/components/marketing/landing-applications-pipeline";
import { BOOK_DEMO_HREF, MANAGER_GET_STARTED_HREF } from "@/lib/marketing/public-contact";

const GET_STARTED = MANAGER_GET_STARTED_HREF;

const TRUST = ["14-day Pro trial", "Approval-first AI", "Free plan, $0"] as const;

const STATS = [
  { value: "10", label: "properties" },
  { value: "30", label: "residents" },
  { value: "2", label: "managers" },
] as const;

/**
 * TEMPORARY: hero-background lab variant. `undefined` renders today's live look
 * (the flat `.landing-hero-glow`), so `/` is unchanged while the lab exists.
 * Removed once the captain picks a winner — see `src/app/(public)/dev/hero-lab`.
 */
export type HeroBgVariant = "grid" | "aurora" | "paths" | "film" | "spotlight";

/** Theme-aware split hero + sparse portfolio stats. Dark keeps near-black; light is soft white. */
export function LandingDemoHero({ bgVariant }: { bgVariant?: HeroBgVariant } = {}) {
  return (
    <>
      <section className="landing-dark-hero relative overflow-x-hidden">
        {bgVariant ? (
          <HeroBgLab variant={bgVariant} />
        ) : (
          <div aria-hidden className="landing-hero-glow pointer-events-none absolute inset-0" />
        )}

        <div className="relative mx-auto grid w-full max-w-[1120px] items-center gap-12 px-5 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:pb-24 lg:pt-20">
          <div className="min-w-0 max-w-[34rem]">
            <h1 className="text-[clamp(2.35rem,5.2vw,3.65rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
              <span className="landing-hero-line block">The AI does</span>
              <span className="landing-hero-line block">the busywork.</span>
              <span className="landing-hero-line landing-hero-line--muted block">You approve.</span>
            </h1>

            <p className="landing-hero-sub mt-5 max-w-[40ch] text-[15.5px] leading-relaxed sm:text-[16px]">
              One platform for managers, residents, and vendors. It drafts leases from applications,
              collects rent, chases late fees, and pays vendors, then hands you a single queue to
              approve. Real double-entry books underneath.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={GET_STARTED}
                data-attr="home-hero-get-started"
                className="landing-hero-cta-primary inline-flex min-h-[46px] items-center justify-center rounded-[10px] px-[22px] text-[14.5px] font-medium transition hover:brightness-110"
              >
                Get started for free
              </Link>
              <Link
                href={BOOK_DEMO_HREF}
                data-attr="home-hero-book-demo"
                className="landing-hero-cta-ghost inline-flex min-h-[46px] items-center justify-center rounded-[10px] px-[20px] text-[14.5px] font-medium transition"
              >
                Book a demo
              </Link>
            </div>

            <ul className="landing-hero-trust mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
              {TRUST.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <CheckIcon />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-[468px] min-w-0 lg:ml-auto lg:mr-0">
            <ApplicationsPipelinePanel />
          </div>
        </div>
      </section>

      <div aria-hidden className="landing-hero-bridge" />

      <section className="landing-stats-strip relative border-b py-12 sm:py-14">
        <div className="mx-auto flex w-full max-w-[720px] items-start justify-between gap-6 px-5 sm:px-6">
          {STATS.map((stat) => (
            <div key={stat.label} className="min-w-0 flex-1 text-center">
              <div className="landing-stat-value text-[clamp(2rem,4.5vw,2.75rem)] font-semibold tabular-nums leading-none tracking-[-0.04em]">
                {stat.value}
              </div>
              <div className="landing-stat-label mt-2 text-[13px] font-medium tracking-[-0.01em]">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/**
 * TEMPORARY hero-background lab layer. Renders strictly behind the content grid
 * (which is `relative` and later in the DOM). Each variant owns its full
 * background treatment; a shared legibility wash keeps body copy ≥4.5:1.
 * Deleted with the lab once a winner ships.
 */
function HeroBgLab({ variant }: { variant: HeroBgVariant }) {
  return (
    <div
      aria-hidden
      className={`landing-hero-lab landing-hero-bg--${variant} pointer-events-none absolute inset-0 overflow-hidden`}
    >
      {variant === "grid" && (
        <>
          <div className="landing-hero-bg__grid" />
          <div className="landing-hero-bg__bloom" />
          <div className="landing-hero-bg__cells" />
          <div className="landing-hero-bg__wash" />
        </>
      )}

      {variant === "aurora" && (
        <>
          <span className="landing-hero-bg__aurora landing-hero-bg__aurora--1" />
          <span className="landing-hero-bg__aurora landing-hero-bg__aurora--2" />
          <span className="landing-hero-bg__aurora landing-hero-bg__aurora--3" />
          <span className="landing-hero-bg__aurora landing-hero-bg__aurora--4" />
          <div className="landing-hero-bg__wash" />
        </>
      )}

      {variant === "paths" && (
        <>
          <HeroFlightPaths />
          <div className="landing-hero-bg__wash" />
        </>
      )}

      {variant === "film" && (
        <>
          <div className="landing-hero-bg__bloom" />
          <div className="landing-hero-bg__hairline" />
          <HeroFilmGrain />
          <div className="landing-hero-bg__vignette" />
          <div className="landing-hero-bg__wash" />
        </>
      )}

      {variant === "spotlight" && (
        <>
          <div className="landing-hero-bg__cone" />
          <div className="landing-hero-bg__pool" />
          <div className="landing-hero-bg__wash" />
        </>
      )}
    </div>
  );
}

/**
 * Candidate 3 — flight paths. The paper-plane mark's wake at wall scale: dotted
 * arcs sweeping lower-left → upper-right onto a soft glowing node behind the
 * panel. Motion is transform/opacity only (group micro-drift + node breath +
 * travelling glints), never `stroke-dashoffset`, so it composites cleanly.
 */
function HeroFlightPaths() {
  return (
    <svg
      className="landing-hero-bg__paths"
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden
    >
      <defs>
        <radialGradient id="hero-path-node" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--hero-path-node-core)" />
          <stop offset="45%" stopColor="var(--hero-path-node-mid)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      <g className="landing-hero-bg__paths-trails">
        <path className="landing-hero-bg__trail" d="M-40 690 C 300 600, 560 470, 862 262" />
        <path className="landing-hero-bg__trail" d="M-40 620 C 340 560, 620 420, 862 262" />
        <path className="landing-hero-bg__trail" d="M20 700 C 360 640, 600 500, 862 262" />

        <circle className="landing-hero-bg__glint landing-hero-bg__glint--a" r="3.5" />
        <circle className="landing-hero-bg__glint landing-hero-bg__glint--b" r="2.6" />
      </g>

      <circle
        className="landing-hero-bg__node-halo"
        cx="862"
        cy="262"
        r="120"
        fill="url(#hero-path-node)"
      />
      <circle className="landing-hero-bg__node-core" cx="862" cy="262" r="5" />
    </svg>
  );
}

/**
 * Candidate 4 — static feTurbulence film grain, applied once to a full-bleed
 * rect (no animated filter). Desaturated so it stays a neutral texture and does
 * not tint the theme.
 */
function HeroFilmGrain() {
  return (
    <svg className="landing-hero-bg__grain" aria-hidden preserveAspectRatio="none">
      <filter id="hero-film-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#hero-film-grain)" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="landing-hero-check size-3.5 shrink-0" fill="none">
      <path
        d="M3.5 8.25 6.4 11.2 12.5 4.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
