import Link from "next/link";

const ink = "#0f172a";

export type AxisLogoVariant = "default" | "portalHeader" | "adminHeader";

/** Primary AX mark — single blue accent bar between letters (clean consumer header). */
export function AxisLogoMark({
  className = "",
  variant: _variant,
}: {
  className?: string;
  variant?: AxisLogoVariant;
}) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-slate-200/90 bg-white shadow-sm ${className}`}
      aria-hidden
    >
      <span className="flex select-none items-center gap-[3px] text-[15px] font-black leading-none tracking-tight">
        <span style={{ color: ink }}>A</span>
        <span
          className="h-[18px] w-[3px] shrink-0 rounded-full bg-gradient-to-b from-[#7eb0ff] to-[#3b66f5]"
          aria-hidden
        />
        <span style={{ color: ink }}>X</span>
      </span>
    </div>
  );
}

/** Alternate mark — same single blue bar treatment on a softer tile. */
export function AxisLogoMarkSoft({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50/90 shadow-sm ${className}`}
      aria-hidden
    >
      <span className="flex select-none items-center gap-[3px] text-[15px] font-black leading-none tracking-tight">
        <span style={{ color: ink }}>A</span>
        <span className="h-[18px] w-[3px] shrink-0 rounded-full bg-gradient-to-b from-[#7eb0ff] to-[#3b66f5]" aria-hidden />
        <span style={{ color: ink }}>X</span>
      </span>
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
