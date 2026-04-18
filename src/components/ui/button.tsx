import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const variants: Record<Variant, string> = {
  primary:
    "text-white shadow-[0_4px_20px_rgba(0,122,255,0.28)] hover:shadow-[0_8px_28px_-4px_rgba(0,122,255,0.42)] hover:brightness-[1.04] active:scale-[0.98] active:brightness-[0.98] active:shadow-[0_2px_12px_rgba(0,122,255,0.22)]",
  secondary:
    "bg-[#1d1d1f] text-white shadow-sm hover:-translate-y-px hover:bg-black/90 hover:shadow-md active:translate-y-0 active:scale-[0.98]",
  ghost:
    "bg-transparent text-[#007aff] hover:bg-[#007aff]/[0.08] active:scale-[0.98]",
  danger:
    "bg-[#ff3b30] text-white shadow-sm hover:-translate-y-px hover:bg-red-500 hover:shadow-md active:scale-[0.98]",
  outline:
    "border border-black/[0.1] bg-white/80 text-[#1d1d1f] shadow-sm hover:-translate-y-px hover:bg-white hover:shadow-md active:scale-[0.98]",
};

export function Button({
  className = "",
  variant = "primary",
  style,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  const isPrimary = variant === "primary";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold outline-none transition-[transform,box-shadow,filter,background-color] duration-200 ease-out hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 active:translate-y-px ${variants[variant]} ${className}`}
      style={
        isPrimary
          ? {
              background: "linear-gradient(135deg, #007aff, #339cff)",
              ...style,
            }
          : style
      }
      {...props}
    >
      {children}
    </button>
  );
}
