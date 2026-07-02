import Link from "next/link";

export function LandingHero() {
  return (
    <section className="hero-chrome-scene relative overflow-hidden pb-16 pt-14 sm:pb-20 sm:pt-20 md:pt-24">
      <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-5">
        <div className="hero-eyebrow animate-fade-up mb-5 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md sm:mb-6 sm:px-4">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--steel-light)] shadow-[0_0_10px_rgba(188,212,255,0.9)]" />
          <span className="text-xs font-semibold tracking-wide sm:text-[13px]">
            Now in beta · AI-powered property management
          </span>
        </div>

        <h1
          className="hero-title animate-fade-up mx-auto max-w-4xl text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[3.5rem] md:text-[4.25rem]"
          style={{ animationDelay: "60ms" }}
        >
          AI-powered property management that runs itself
        </h1>

        <p
          className="hero-subtitle animate-fade-up mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg"
          style={{ animationDelay: "90ms" }}
        >
          Axis uses AI to handle applications, screening, leases, and rent collection in one platform — so you spend less time managing and more time growing your portfolio.
        </p>

        <div
          className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-4 sm:mt-12 sm:flex-row"
          style={{ animationDelay: "120ms" }}
        >
          <Link
            href="/partner"
            className="btn-metallic hero-cta-metallic inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-px active:scale-[0.99] sm:w-auto"
          >
            Partner with Axis
          </Link>
          <Link
            href="/contact"
            className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full border border-border px-8 py-3 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-foreground/5 active:scale-[0.99] sm:w-auto"
          >
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}
