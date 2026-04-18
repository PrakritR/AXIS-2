import Link from "next/link";

const ink = "#0f172a";

export type AxisLogoVariant = "default" | "portalHeader" | "adminHeader";

/** Primary AX mark — matches portal / auth blue (`--primary`), white letters, soft glow. */
export function AxisLogoMark({
  className = "",
  variant: _variant,
}: {
  className?: string;
  variant?: AxisLogoVariant;
}) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[#c7d4fb]/60 bg-gradient-to-b from-[#eef2ff] to-[#dce6ff] shadow-sm ${className}`}
      aria-hidden
    >
      <span className="select-none text-[15px] font-black leading-none tracking-tight">
        <span style={{ color: ink }}>A</span>
        <span style={{ color: "#3b66f5" }}>X</span>
      </span>
    </div>
  );
}

/** Alternate mark for rare contexts (soft two-tone tile). */
export function AxisLogoMarkSoft({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-200/90 bg-gradient-to-b from-sky-50 to-blue-50/80 shadow-sm ${className}`}
      aria-hidden
    >
      <span className="select-none text-[15px] font-black leading-none tracking-tight">
        <span style={{ color: ink }}>A</span>
        <span className="text-primary">X</span>
      </span>
    </div>
  );
}

export function AxisLogoWordmark() {
  return (
    <span className="leading-[1.05]">
      <span className="block text-[15px] font-bold tracking-tight text-[#0f172a]">AXIS</span>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        HOUSING
      </span>
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
