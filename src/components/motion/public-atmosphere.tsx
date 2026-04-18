/** Decorative depth layer — no client JS, safe for server layout. */
export function PublicAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Soft gradient wash */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 50% -20%, rgba(0,122,255,0.07) 0%, transparent 55%), radial-gradient(ellipse 90% 60% at 100% 40%, rgba(51,156,255,0.07) 0%, transparent 45%), radial-gradient(ellipse 70% 50% at 0% 80%, rgba(15,23,42,0.04) 0%, transparent 50%)",
        }}
      />
      {/* Floating orbs */}
      <div className="absolute -left-[20%] top-[18%] h-[min(42rem,55vw)] w-[min(42rem,55vw)] rounded-full bg-primary/[0.06] blur-3xl motion-orb-drift" />
      <div className="absolute -right-[15%] top-[45%] h-[min(36rem,48vw)] w-[min(36rem,48vw)] rounded-full bg-[rgba(51,156,255,0.08)] blur-3xl motion-orb-drift-reverse" />
      <div className="absolute bottom-[5%] left-1/2 h-64 w-[min(90%,56rem)] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-3xl" />
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.35] mix-blend-multiply"
        style={{
          backgroundImage: `linear-gradient(rgba(15,23,42,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.03) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}
