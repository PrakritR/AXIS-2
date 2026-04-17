import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(37,99,235,0.08),0_10px_30px_-12px_rgba(37,99,235,0.55)] hover:bg-blue-600",
  secondary: "bg-slate-900 text-white hover:bg-slate-800",
  ghost: "bg-transparent text-primary hover:bg-accent",
  danger: "bg-red-600 text-white hover:bg-red-500",
  outline:
    "border border-border bg-card text-foreground hover:bg-slate-50 shadow-sm",
};

export function Button({
  className = "",
  variant = "primary",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
