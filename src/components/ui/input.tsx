import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-2xl border border-border bg-slate-50 px-3 py-2 text-sm text-foreground outline-none ring-0 transition placeholder:text-slate-400 focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-[120px] w-full rounded-2xl border border-border bg-slate-50 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-slate-400 focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-2xl border border-border bg-slate-50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
