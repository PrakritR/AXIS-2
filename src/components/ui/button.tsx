import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const variants: Record<Variant, string> = {
  primary:
    "text-white shadow-[0_10px_30px_-18px_rgba(10,132,255,0.65)] hover:bg-[#0077ed] hover:shadow-[0_16px_36px_-20px_rgba(10,132,255,0.55)] active:scale-[0.99]",
  secondary:
    "bg-slate-900 text-white shadow-[0_10px_24px_-18px_rgba(15,23,42,0.6)] hover:bg-slate-800 active:scale-[0.99]",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950 active:scale-[0.99]",
  danger:
    "bg-danger text-white shadow-[0_10px_24px_-18px_rgba(255,59,48,0.65)] hover:bg-red-500 active:scale-[0.99]",
  outline:
    "border border-slate-200/90 bg-white/95 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]",
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
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold outline-none ring-primary/0 transition-[transform,box-shadow,filter,background-color,border-color] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${variants[variant]} ${className}`}
      style={
        isPrimary
          ? {
              background: "var(--primary)",
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
