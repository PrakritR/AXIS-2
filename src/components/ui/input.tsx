import type { InputHTMLAttributes } from "react";

const fieldBase =
  "min-h-[44px] w-full rounded-2xl border border-black/[0.08] bg-black/[0.04] px-3.5 py-2.5 text-[16px] text-[#1d1d1f] outline-none transition-all duration-200 placeholder:text-[#6e6e73]/60 focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/20 hover:bg-black/[0.06] sm:text-[14px]";

const textareaBase =
  "min-h-[120px] w-full resize-none rounded-2xl border border-black/[0.08] bg-black/[0.04] px-3.5 py-3 text-[16px] text-[#1d1d1f] outline-none transition-all duration-200 placeholder:text-[#6e6e73]/60 focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/20 hover:bg-black/[0.06] sm:text-[14px]";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldBase} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${textareaBase} ${className}`} {...props} />;
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
