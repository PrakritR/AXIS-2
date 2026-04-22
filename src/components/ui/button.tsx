import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const variants: Record<Variant, string> = {
  primary:
    "text-white shadow-[0_4px_18px_rgba(0,122,255,0.24)] hover:shadow-[0_8px_26px_-8px_rgba(0,122,255,0.44)] hover:brightness-[1.03] active:scale-[0.99] active:brightness-[0.98]",
  secondary:
    "bg-slate-950 text-white shadow-sm hover:bg-slate-800 hover:shadow-md active:scale-[0.99]",
  ghost:
    "bg-transparent text-primary hover:bg-primary/[0.08] active:scale-[0.99]",
  danger:
    "bg-danger text-white shadow-sm hover:bg-red-500 hover:shadow-md active:scale-[0.99]",
  outline:
    "border border-slate-200 bg-white text-slate-900 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:scale-[0.99]",
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
              background: "linear-gradient(135deg, var(--primary), var(--primary-alt))",
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
