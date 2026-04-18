import Link from "next/link";

const blue = "#2b5ce7";
const ink = "#0f172a";

export type AxisLogoVariant = "default" | "portalHeader" | "adminHeader";

/** AX mark — marketing tile, auth circle, or admin rounded-square with glow. */
export function AxisLogoMark({
  className = "",
  variant = "default",
}: {
  className?: string;
  variant?: AxisLogoVariant;
}) {
  if (variant === "adminHeader") {
    return (
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#2b5ce7] text-[13px] font-black tracking-tight text-white shadow-[0_0_20px_rgba(43,92,231,0.45)] ${className}`}
        aria-hidden
      >
        AX
      </div>
    );
  }

  if (variant === "portalHeader") {
    return (
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2b5ce7] text-[13px] font-black tracking-tight text-white shadow-sm ${className}`}
        aria-hidden
      >
        AX
      </div>
    );
  }

  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-200/90 bg-gradient-to-b from-sky-50 to-blue-50/80 shadow-sm ${className}`}
      aria-hidden
    >
      <span className="select-none text-[15px] font-black leading-none tracking-tight">
        <span style={{ color: ink }}>A</span>
        <span style={{ color: blue }}>X</span>
      </span>
    </div>
  );
}

export function AxisLogoWordmark() {
  return (
    <span className="leading-[1.05]">
      <span className="block text-[15px] font-bold tracking-tight text-slate-900">AXIS</span>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        SEATTLE
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
