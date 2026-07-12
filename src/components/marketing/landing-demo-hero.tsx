import Link from "next/link";
import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { HomepageDemoEmbed } from "@/components/marketing/homepage-demo-embed";
import { RevealOnView } from "@/components/motion/reveal-on-view";

/**
 * Demo-first landing page. The banner (triple-promise headline + pitch + CTAs)
 * fills the entire first viewport — the interactive demo portal (role switcher
 * + guided tours) only appears once the visitor scrolls, followed by the
 * closing conversion CTAs.
 */
export function LandingDemoHero() {
  return (
    <section className="hero-chrome-scene relative overflow-hidden pb-14 sm:pb-16">
      <ChromeSubstrate variant="full" />

      {/* Full-viewport banner: 100svh minus the sticky navbar (56px + 1px border)
          and the notch inset the navbar adds via pt-[env(safe-area-inset-top)]. */}
      <div className="relative flex min-h-[calc(100svh-57px-env(safe-area-inset-top,0px))] items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-20 text-center sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:text-left">
          <RevealOnView>
            <h1 className="hero-title text-[2.75rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[3.5rem] lg:text-[4.25rem]">
              Leases sign themselves.
              <br />
              Rent chases itself.
              <br />
              <span className="text-gradient-accent">You just approve.</span>
            </h1>
          </RevealOnView>
          <RevealOnView delayMs={80}>
            <p className="hero-subtitle mx-auto max-w-xl text-base leading-relaxed sm:text-lg lg:mx-0">
              PropLane&rsquo;s AI turns applications into signed leases, keeps rent on schedule,
              and lines up vendors for repairs — and nothing goes out without your sign-off. Scroll
              down to try the live portal with sample data, or run a guided tour.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/auth/create-account?mode=create&role=manager"
                data-attr="home-hero-get-started-top"
                className="btn-metallic hero-cta-metallic inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full px-9 py-3.5 text-[15px] font-semibold transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-px active:scale-[0.99] sm:w-auto"
              >
                Get started for free
              </Link>
              <Link
                href="/contact"
                data-attr="home-hero-book-demo-top"
                className="hero-cta-outline inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full border px-9 py-3.5 text-[15px] font-semibold transition-colors duration-200 active:scale-[0.99] sm:w-auto"
              >
                Book a demo
              </Link>
            </div>
          </RevealOnView>
        </div>

        {/* Scroll cue pinned to the bottom of the fold. */}
        <a
          href="#live-demo"
          data-attr="home-hero-scroll-to-demo"
          className="hero-subtitle absolute inset-x-0 bottom-5 mx-auto flex w-fit flex-col items-center gap-1 text-xs font-semibold tracking-wide opacity-80 transition-opacity hover:opacity-100"
        >
          <span>Try the live demo</span>
          <span aria-hidden className="animate-bounce text-base leading-none">
            ↓
          </span>
        </a>
      </div>

      {/* Below the fold: the real interactive portal (signed-out visitors) or a
          return-to-portal panel (signed-in visitors). */}
      <div id="live-demo" className="relative scroll-mt-16">
        <HomepageDemoEmbed />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-5">
        <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/auth/create-account?mode=create&role=manager"
            data-attr="home-hero-get-started"
            className="btn-metallic hero-cta-metallic inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-px active:scale-[0.99] sm:w-auto"
          >
            Get started for free
          </Link>
          <Link
            href="/contact"
            data-attr="home-hero-book-demo"
            className="hero-cta-outline inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full border px-8 py-3 text-sm font-semibold transition-colors duration-200 active:scale-[0.99] sm:w-auto"
          >
            Book a demo
          </Link>
        </div>
        <p className="hero-subtitle mx-auto mt-4 max-w-xl text-xs sm:text-sm">
          Liked what you clicked? Your real portfolio sets up in minutes — 14-day free trial, no
          card required.
        </p>
      </div>
    </section>
  );
}
