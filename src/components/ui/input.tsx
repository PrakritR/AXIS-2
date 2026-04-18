import type { InputHTMLAttributes } from "react";

const fieldBase =
  "w-full rounded-2xl border border-black/[0.08] bg-black/[0.04] px-3.5 py-3 text-[14px] text-[#1d1d1f] outline-none transition-all duration-200 placeholder:text-[#6e6e73]/60 focus:border-[#007aff]/40 focus:bg-white focus:ring-2 focus:ring-[#007aff]/20 hover:bg-black/[0.06]";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldBase} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-[120px] resize-none ${fieldBase} py-3 ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${fieldBase} ${className}`} {...props}>
      {children}
    </select>
  );
}
