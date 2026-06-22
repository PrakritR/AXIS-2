import { HomeHeroSearch } from "@/components/marketing/home-hero-search";

export function RentListingsHero() {
  return (
    <section className="border-b border-border/60 bg-background-solid/80">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-5 sm:py-14">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Rent</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl md:text-4xl">
          Find your next room
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Filter by move-in date, budget, bathroom type, and ZIP code — then browse matching rooms or view all properties.
        </p>
        <div className="mt-8">
          <HomeHeroSearch variant="listings" />
        </div>
      </div>
    </section>
  );
}
