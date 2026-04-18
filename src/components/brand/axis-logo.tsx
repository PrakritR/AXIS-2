import Link from "next/link";

const ink = "#0f172a";

export type AxisLogoVariant = "default" | "portalHeader" | "adminHeader";

function AxisLogoGlyph() {
  return (
    <span className="relative flex select-none items-center text-[17px] font-black leading-none tracking-[-0.08em]">
      <span style={{ color: ink }}>A</span>
      <span className="-ml-[1px]" style={{ color: ink }}>
        X
      </span>
      <span
        className="pointer-events-none absolute left-[21px] top-[-2px] h-[34px] w-[4px] rotate-[20deg] rounded-full bg-gradient-to-b from-[#74b7ff] via-[#4d95ff] to-[#2e6eff]"
        aria-hidden
      />
    </span>
  );
}

/** Primary AX mark — rounded blue tile with crossed accent bar. */
export function AxisLogoMark({
  className = "",
  variant,
}: {
  className?: string;
  variant?: AxisLogoVariant;
}) {
  void variant;
  return (
    <div
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-[#bfd6ff] bg-[linear-gradient(180deg,#eaf3ff_0%,#dbeaff_100%)] shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_6px_18px_rgba(96,146,220,0.22)] ${className}`}
      aria-hidden
    >
      <AxisLogoGlyph />
    </div>
  );
}

/** Alternate mark — same single blue bar treatment on a softer tile. */
export function AxisLogoMarkSoft({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-[#bfd6ff] bg-[linear-gradient(180deg,#eef5ff_0%,#deebff_100%)] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_6px_18px_rgba(96,146,220,0.18)] ${className}`}
      aria-hidden
    >
      <AxisLogoGlyph />
    </div>
  );
}

export function AxisLogoWordmark() {
  return (
    <span className="leading-[1.08]">
      <span className="block text-[16px] font-bold tracking-tight text-[#0f172a]">AXIS</span>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Housing</span>
    </span>
  );
}

export function AxisLogoLink({
  href = "/",
  variant = "default",
}: {
  href?: string;
  variant?: AxisLogoVariant;
}) {
  return (
    <Link href={href} className="flex items-center gap-3">
      <AxisLogoMark variant={variant} />
      <AxisLogoWordmark />
    </Link>
  );
}
