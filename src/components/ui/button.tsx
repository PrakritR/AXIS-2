import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const variants: Record<Variant, string> = {
  primary:
    "text-white",
  secondary:
    "bg-[#1d1d1f] text-white hover:bg-black/90 active:scale-[0.98]",
  ghost:
    "bg-transparent text-[#007aff] hover:bg-[#007aff]/[0.08] active:scale-[0.98]",
  danger:
    "bg-[#ff3b30] text-white hover:bg-red-500 active:scale-[0.98]",
  outline:
    "border border-black/[0.1] bg-white/80 text-[#1d1d1f] hover:bg-black/[0.04] active:scale-[0.98]",
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
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold outline-none transition-all duration-200 hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-0 ${variants[variant]} ${className}`}
      style={
        isPrimary
          ? {
              background: "linear-gradient(135deg, #007aff, #339cff)",
              boxShadow: "0 4px 20px rgba(0,122,255,0.3)",
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
