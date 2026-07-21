import Link from "next/link";

const GET_STARTED = "/auth/create-account?mode=create&role=manager";
const BOOK_DEMO = "/contact";

/** Semantic status dots — not brand accents. */
const ATTENTION_ROWS = [
  {
    label: "2 rent payments overdue",
    meta: "$5,150 · late fee",
    dot: "var(--status-overdue-fg)",
  },
  {
    label: "5 applications pending review",
    meta: "3 pre-screened",
    dot: "var(--status-pending-fg)",
  },
  {
    label: "3 leases drafted by AI",
    meta: "awaiting approval",
    dot: "var(--pl-ai)",
  },
  {
    label: "Work order #142 vendor bid",
    meta: "$480 · accept",
    dot: "var(--status-confirmed-fg)",
  },
] as const;

const TRUST = ["14-day Pro trial", "Approval-first AI", "Free plan, $0"] as const;

const STATS = [
  { value: "10", label: "properties" },
  { value: "30", label: "residents" },
  { value: "2", label: "managers" },
] as const;

/** Theme-aware split hero + sparse portfolio stats. Dark keeps near-black; light is soft white. */
export function LandingDemoHero() {
  return (
    <>
      <section className="landing-dark-hero relative overflow-x-hidden">
        <div aria-hidden className="landing-hero-glow pointer-events-none absolute inset-0" />

        <div className="relative mx-auto grid w-full max-w-[1120px] items-center gap-12 px-5 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:pb-24 lg:pt-20">
          <div className="min-w-0 max-w-[34rem]">
            <span className="landing-hero-badge inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11.5px] font-medium tracking-[0.06em]">
              <span aria-hidden className="landing-hero-badge-dot size-1.5 rounded-full" />
              PROPLANE · IN BETA
            </span>

            <h1 className="mt-5 text-[clamp(2.35rem,5.2vw,3.65rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
              <span className="landing-hero-line block">The AI does</span>
              <span className="landing-hero-line block">the busywork.</span>
              <span className="landing-hero-line landing-hero-line--muted block">You approve.</span>
            </h1>

            <p className="landing-hero-sub mt-5 max-w-[40ch] text-[15.5px] leading-relaxed sm:text-[16px]">
              One platform for managers, residents, and vendors. It drafts leases from applications,
              collects rent, chases late fees, and pays vendors — then hands you a single queue to
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
                href={BOOK_DEMO}
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

          <NeedsAttentionCard />
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

function NeedsAttentionCard() {
  return (
    <div className="landing-attention-card relative mx-auto w-full max-w-[440px] overflow-hidden rounded-[14px] backdrop-blur-md lg:ml-auto lg:mr-0">
      <div className="flex items-start justify-between gap-3 px-5 pb-3.5 pt-5">
        <div className="min-w-0">
          <h2 className="landing-attention-title text-[16px] font-semibold tracking-[-0.02em]">
            Needs attention
          </h2>
          <p className="landing-attention-kicker mt-1 text-[11px] font-medium uppercase tracking-[0.08em]">
            MANAGER · THE PIONEER
          </p>
        </div>
        <span className="landing-attention-chip inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium">
          <span aria-hidden className="landing-attention-chip-dot size-1.5 rounded-full" />
          4 open
        </span>
      </div>

      <ul className="landing-attention-list">
        {ATTENTION_ROWS.map((row) => (
          <li key={row.label} className="landing-attention-row flex items-center gap-2.5 px-5 py-3.5">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: row.dot }} />
            <span className="landing-attention-label min-w-0 flex-1 truncate text-[13.5px]">{row.label}</span>
            <span className="landing-attention-meta shrink-0 text-[12.5px]">
              {row.meta}
              <span className="landing-attention-chevron ml-0.5"> ›</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="landing-attention-footer flex items-center gap-2.5 px-5 py-3.5">
        <span aria-hidden className="landing-attention-ai grid size-6 shrink-0 place-items-center rounded-md text-[12px]">
          ✦
        </span>
        <p className="landing-attention-footnote min-w-0 flex-1 text-[12.5px] leading-snug">
          Every AI action is previewed — nothing sends without your OK.
        </p>
        <span
          aria-hidden
          className="landing-attention-check grid size-5 shrink-0 place-items-center rounded-[4px] text-[10px]"
        >
          ✓
        </span>
      </div>
    </div>
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
