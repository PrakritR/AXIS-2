import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-2xl border border-slate-200/90 bg-sky-50/70 px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-[#2b5ce7] focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,92,231,0.18)] ${className}`}
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
      className={`min-h-[120px] w-full rounded-2xl border border-slate-200/90 bg-sky-50/70 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2b5ce7] focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,92,231,0.18)] ${className}`}
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
      className={`w-full rounded-2xl border border-slate-200/90 bg-sky-50/70 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#2b5ce7] focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,92,231,0.18)] ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
